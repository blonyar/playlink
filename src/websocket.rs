use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, State,
    },
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use tokio::{
    sync::{broadcast, mpsc},
    time::timeout,
};
use tracing::Instrument;
use uuid::Uuid;

use crate::{
    protocol::{
        ClientEnvelope, ClientMessage, ErrorCode, PlaylinkError, ServerEnvelope, ServerMessage,
    },
    room::Player,
    session::Session,
    AppState,
};

const OUTGOING_QUEUE_SIZE: usize = 128;
const MAX_PLAYER_NAME_LEN: usize = 32;
const MAX_ROOM_NAME_LEN: usize = 64;

pub async fn connect(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
) -> Response {
    // Reject WebSocket upgrades from disallowed origins (CSWSH protection).
    // Browsers do not enforce CORS on WebSocket handshakes, so this check is
    // required in addition to the HTTP CORS layer.
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok());
    if !state.config.is_origin_allowed(origin) {
        tracing::warn!(
            ?origin,
            "rejecting websocket upgrade from disallowed origin"
        );
        return StatusCode::FORBIDDEN.into_response();
    }

    // Enforce the concurrent-connection caps (global + per source IP) before
    // reserving an upgrade slot.
    let Some(guard) = reserve_connection(&state, peer.ip()) else {
        tracing::warn!(%peer, "rejecting websocket upgrade: connection cap reached");
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };

    // Enforce the size caps at the transport layer so oversized frames
    // and reassembled messages are rejected before being buffered into
    // memory. `max_frame_bytes` caps a single WebSocket frame;
    // `max_message_bytes` caps a reassembled message that may consist
    // of multiple frames. The frame cap is always <= message cap.
    let max_frame_bytes = state.config.max_frame_bytes;
    let max_message_bytes = state.config.max_message_bytes;
    ws.max_message_size(max_message_bytes)
        .max_frame_size(max_frame_bytes)
        .on_upgrade(move |socket| handle_socket(socket, state, guard))
}

/// RAII guard that reserves a slot in the global connection counter and the
/// per-source-IP counter, releasing both on drop so slots are freed even if the
/// upgrade future never runs or the connection task panics.
struct ConnectionGuard {
    global: Arc<AtomicUsize>,
    per_ip: Arc<Mutex<HashMap<IpAddr, u32>>>,
    ip: IpAddr,
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        self.global.fetch_sub(1, Ordering::Relaxed);
        // The per-IP map may be poisoned if a previous task panicked
        // while holding the lock. Recovering the inner value is the
        // standard pattern for "the lock was held across a panic; the
        // data we need is still there, just in an inconsistent state".
        // For our use case the map only contains counters, so reading
        // them after a panic is preferable to leaking the slot.
        let mut map = match self.per_ip.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                tracing::warn!(
                    ip = %self.ip,
                    "connections_per_ip mutex was poisoned; recovering inner value"
                );
                poisoned.into_inner()
            }
        };
        if let Some(count) = map.get_mut(&self.ip) {
            *count = count.saturating_sub(1);
            if *count == 0 {
                map.remove(&self.ip);
            }
        }
    }
}

/// Locks the per-IP connection map, recovering from poison rather than
/// panicking. Used by both the reservation path and the guard's Drop
/// implementation so a panic in one connection task does not lock out
/// the rest of the server.
fn lock_per_ip(
    map: &Arc<Mutex<HashMap<IpAddr, u32>>>,
) -> std::sync::MutexGuard<'_, HashMap<IpAddr, u32>> {
    match map.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            tracing::warn!("connections_per_ip mutex was poisoned; recovering inner value");
            poisoned.into_inner()
        }
    }
}

/// Reserves a connection slot under both the global and per-IP caps, rolling
/// back if either is exceeded. The per-IP map is updated under a brief lock.
fn reserve_connection(state: &AppState, ip: IpAddr) -> Option<ConnectionGuard> {
    let current = state.connections.fetch_add(1, Ordering::Relaxed);
    if current >= state.config.max_connections {
        state.connections.fetch_sub(1, Ordering::Relaxed);
        return None;
    }

    {
        let mut map = lock_per_ip(&state.connections_per_ip);
        let entry = map.entry(ip).or_insert(0);
        *entry += 1;
        if *entry > state.config.max_connections_per_ip {
            *entry -= 1;
            // Roll back the global reservation made above.
            state.connections.fetch_sub(1, Ordering::Relaxed);
            return None;
        }
    }

    Some(ConnectionGuard {
        global: Arc::clone(&state.connections),
        per_ip: Arc::clone(&state.connections_per_ip),
        ip,
    })
}

async fn handle_socket(socket: WebSocket, state: AppState, _guard: ConnectionGuard) {
    let connection_id = Uuid::new_v4();
    let span = tracing::info_span!("ws_connection", %connection_id);

    async {
        let (mut sender, mut receiver) = socket.split();
        let (outgoing_tx, mut outgoing_rx) =
            mpsc::channel::<String>(state.config.room_event_buffer.max(OUTGOING_QUEUE_SIZE));
        let (close_tx, mut close_rx) = mpsc::channel::<()>(1);
        let mut shutdown_rx = state.shutdown.subscribe();
        let mut session = Session::new(state.config.rate_limit);
        let mut room_events_task: Option<tokio::task::JoinHandle<()>> = None;

        tracing::info!(player_id = %session.player_id, "websocket connected");

        let sender_task = tokio::spawn(async move {
            while let Some(text) = outgoing_rx.recv().await {
                if sender.send(Message::Text(text)).await.is_err() {
                    break;
                }
            }
            // Send a Close frame after the outgoing queue is drained
            let _ = sender.send(Message::Close(None)).await;
        });
        let idle_timeout = state.config.session_idle_timeout;

        let close_reason = loop {
            let next_message = tokio::select! {
                _ = close_rx.recv() => break "client_close",
                _ = shutdown_rx.recv() => break "server_shutdown",
                next_message = timeout(idle_timeout, receiver.next()) => {
                    let Ok(next_message) = next_message else {
                        break "idle_timeout";
                    };
                    next_message
                }
            };

            let Some(Ok(message)) = next_message else {
                break "disconnect";
            };

            let Message::Text(text) = message else {
                continue;
            };

            // Parse once: extract the request id from the raw JSON value, then
            // deserialize into the typed envelope. (Message size is already
            // bounded by the transport layer configured in `connect`.)
            let (request_id, envelope_result) = parse_envelope(&text);
            match envelope_result {
                Ok(envelope) => {
                    if handle_client_message(
                        envelope.id,
                        envelope.message,
                        &state,
                        &mut session,
                        &outgoing_tx,
                        &close_tx,
                        &mut room_events_task,
                    )
                    .await
                    .is_err()
                    {
                        break "send_error";
                    }
                }
                Err(error) => {
                    if send(
                        &outgoing_tx,
                        request_id,
                        ServerMessage::error(
                            ErrorCode::InvalidMessage,
                            format!("Invalid message: {error}"),
                        ),
                    )
                    .is_err()
                    {
                        break "send_error";
                    }
                }
            }
        };

        if let Some(room_id) = session.room_id {
            state
                .rooms
                .leave_room(room_id, session.player_id, "player_disconnected")
                .await;
        }

        if let Some(task) = room_events_task {
            task.abort();
        }

        // Drop outgoing_tx so sender_task drains and sends Close frame
        drop(outgoing_tx);
        let _ = sender_task.await;

        tracing::info!(player_id = %session.player_id, close_reason, "websocket disconnected");
    }
    .instrument(span)
    .await
}

async fn handle_client_message(
    request_id: Option<String>,
    message: ClientMessage,
    state: &AppState,
    session: &mut Session,
    outgoing_tx: &mpsc::Sender<String>,
    close_tx: &mpsc::Sender<()>,
    room_events_task: &mut Option<tokio::task::JoinHandle<()>>,
) -> Result<(), mpsc::error::TrySendError<String>> {
    match message {
        ClientMessage::CreateRoom {
            room_name,
            max_players,
        } => {
            let room_name = match room_name.as_deref() {
                Some(name) => match validate_name(name, MAX_ROOM_NAME_LEN) {
                    Some(valid) => Some(valid),
                    None => {
                        send(
                            outgoing_tx,
                            request_id,
                            ServerMessage::error(
                                ErrorCode::InvalidMessage,
                                "Room name must be 1-64 characters with no control characters",
                            ),
                        )?;
                        return Ok(());
                    }
                },
                None => None,
            };

            match state.rooms.create_room(room_name, max_players) {
                Ok(room_id) => send(
                    outgoing_tx,
                    request_id,
                    ServerMessage::RoomCreated { room_id },
                )?,
                Err(error) => send_error(outgoing_tx, request_id, error)?,
            }
        }
        ClientMessage::JoinRoom {
            room_id,
            player_name,
        } => {
            if session.room_id.is_some() {
                send(
                    outgoing_tx,
                    request_id,
                    ServerMessage::error(
                        ErrorCode::AlreadyInRoom,
                        "Leave the current room before joining another room",
                    ),
                )?;
                return Ok(());
            }

            let Ok(room_id) = Uuid::parse_str(&room_id) else {
                send(
                    outgoing_tx,
                    request_id,
                    ServerMessage::error(ErrorCode::InvalidRoomId, "Invalid room id"),
                )?;
                return Ok(());
            };

            let Some(name) = validate_name(&player_name, MAX_PLAYER_NAME_LEN) else {
                send(
                    outgoing_tx,
                    request_id,
                    ServerMessage::error(
                        ErrorCode::InvalidMessage,
                        "Player name must be between 1 and 32 characters with no control characters",
                    ),
                )?;
                return Ok(());
            };

            // Invariant: the player id is always taken from the
            // server-side session, never from the wire payload. The
            // `ClientMessage::JoinRoom` variant does not even carry a
            // player_id field, and the deserializer drops unknown
            // fields, so a hostile client cannot inject one. This
            // guarantees a strict one-to-one mapping between
            // (WebSocket connection, Session, player_id) and rules
            // out impersonation by an attacker who can craft arbitrary
            // JSON envelopes.
            let player = Player {
                id: session.player_id,
                name: name.clone(),
            };

            match state.rooms.join_room(room_id, player).await {
                Ok(mut room_events) => {
                    session.room_id = Some(room_id);
                    session.player_name = Some(name);

                    if let Some(task) = room_events_task.take() {
                        task.abort();
                    }

                    send(
                        outgoing_tx,
                        request_id,
                        ServerMessage::RoomJoined {
                            room_id,
                            player_id: session.player_id,
                        },
                    )?;

                    let room_outgoing_tx = outgoing_tx.clone();
                    let room_close_tx = close_tx.clone();
                    *room_events_task = Some(tokio::spawn(async move {
                        loop {
                            match room_events.recv().await {
                                Ok(event) => {
                                    let message = ServerMessage::from_room_event(event);
                                    if send(&room_outgoing_tx, None, message).is_err() {
                                        let _ = room_close_tx.try_send(());
                                        break;
                                    }
                                }
                                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                                    if send(
                                        &room_outgoing_tx,
                                        None,
                                        ServerMessage::EventLagged { skipped },
                                    )
                                    .is_err()
                                    {
                                        let _ = room_close_tx.try_send(());
                                        break;
                                    }
                                }
                                Err(broadcast::error::RecvError::Closed) => break,
                            }
                        }
                    }));
                }
                Err(error) => send_error(outgoing_tx, request_id, error)?,
            }
        }
        ClientMessage::LeaveRoom => {
            if let Some(room_id) = session.room_id.take() {
                session.player_name.take();
                state
                    .rooms
                    .leave_room(room_id, session.player_id, "player_left")
                    .await;
                if let Some(task) = room_events_task.take() {
                    task.abort();
                }
                send(outgoing_tx, request_id, ServerMessage::RoomLeft { room_id })?;
            } else {
                send(
                    outgoing_tx,
                    request_id,
                    ServerMessage::error(ErrorCode::NotInRoom, "Not in a room"),
                )?;
            }
        }
        ClientMessage::RoomMessage { data } => {
            if let Some(room_id) = session.room_id {
                if !session.rate_limiter.try_acquire() {
                    send(
                        outgoing_tx,
                        request_id,
                        ServerMessage::error(
                            ErrorCode::RateLimited,
                            "Message rate limit exceeded; please slow down",
                        ),
                    )?;
                    return Ok(());
                }

                if let Err(error) = state
                    .rooms
                    .broadcast(room_id, session.player_id, data)
                    .await
                {
                    send_error(outgoing_tx, request_id, error)?;
                }
            } else {
                send(
                    outgoing_tx,
                    request_id,
                    ServerMessage::error(
                        ErrorCode::NotInRoom,
                        "Join a room before sending room messages",
                    ),
                )?;
            }
        }
        ClientMessage::Ping => {
            send(outgoing_tx, request_id, ServerMessage::Pong)?;
        }
    }

    Ok(())
}

fn send_error(
    outgoing_tx: &mpsc::Sender<String>,
    request_id: Option<String>,
    error: PlaylinkError,
) -> Result<(), mpsc::error::TrySendError<String>> {
    send(
        outgoing_tx,
        request_id,
        ServerMessage::Error(error.into_payload()),
    )
}

fn send(
    outgoing_tx: &mpsc::Sender<String>,
    request_id: Option<String>,
    message: ServerMessage,
) -> Result<(), mpsc::error::TrySendError<String>> {
    let envelope = ServerEnvelope::new(request_id, message);
    match serde_json::to_string(&envelope) {
        Ok(text) => outgoing_tx.try_send(text),
        Err(error) => {
            tracing::warn!(%error, "failed to serialize server message");
            Ok(())
        }
    }
}

/// Parses a client text frame into the typed envelope, returning the request
/// id (if present in the JSON) alongside the result. Parsing the raw value once
/// lets us recover the id even when the typed deserialization fails, without a
/// second full parse of the payload.
fn parse_envelope(text: &str) -> (Option<String>, Result<ClientEnvelope, serde_json::Error>) {
    match serde_json::from_str::<serde_json::Value>(text) {
        Ok(value) => {
            let request_id = value
                .get("id")
                .and_then(|id| id.as_str())
                .map(ToString::to_string);
            (request_id, serde_json::from_value::<ClientEnvelope>(value))
        }
        Err(error) => (None, Err(error)),
    }
}

/// Trims and validates a display name. Returns `None` when the name is empty,
/// longer than `max_len` (counted by Unicode scalar value), or contains control
/// characters.
fn validate_name(raw: &str, max_len: usize) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.chars().count() > max_len {
        return None;
    }
    if trimmed.chars().any(char::is_control) {
        return None;
    }
    Some(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_name_accepts_and_trims_valid_name() {
        assert_eq!(validate_name("  Alice  ", 32).as_deref(), Some("Alice"));
        assert_eq!(validate_name("玩家", 32).as_deref(), Some("玩家"));
    }

    #[test]
    fn validate_name_rejects_empty_and_whitespace_only() {
        assert!(validate_name("", 32).is_none());
        assert!(validate_name("   \t\n", 32).is_none());
    }

    #[test]
    fn validate_name_rejects_too_long_by_char_count() {
        // 33 chars exceeds the 32-char cap; multi-byte chars count as one each.
        let ok = "あ".repeat(32);
        let too_long = "あ".repeat(33);
        assert!(validate_name(&ok, 32).is_some());
        assert!(validate_name(&too_long, 32).is_none());
    }

    #[test]
    fn validate_name_rejects_control_characters() {
        // Null is not whitespace, so it survives trimming and is rejected.
        assert!(validate_name("name\u{0000}", 32).is_none());
        // Embedded control chars survive trimming and are rejected.
        assert!(validate_name("na\nme", 32).is_none());
        assert!(validate_name("na\tme", 32).is_none());
        // Leading/trailing whitespace is trimmed away first, so it is accepted.
        assert_eq!(validate_name("\t name \n", 32).as_deref(), Some("name"));
    }

    /// `lock_per_ip` must recover the inner value if a previous task
    /// panicked while holding the lock, rather than panicking itself
    /// and locking out the rest of the server. The counters are simple
    /// integers, so reading them after a poison is preferable to
    /// leaking a slot.
    #[test]
    fn lock_per_ip_recovers_from_poison() {
        let map: Arc<Mutex<HashMap<IpAddr, u32>>> = Arc::new(Mutex::new(HashMap::new()));
        map.lock().unwrap().insert("127.0.0.1".parse().unwrap(), 1);

        // Poison the mutex by panicking while the lock is held.
        let result = std::panic::catch_unwind({
            let map = Arc::clone(&map);
            move || {
                let mut guard = map.lock().unwrap();
                guard.insert("127.0.0.1".parse().unwrap(), 99);
                panic!("simulated task panic while holding the lock");
            }
        });
        assert!(result.is_err(), "panic should propagate to catch_unwind");

        // The next acquisition must succeed (returning the inner
        // value), and the data must still be there.
        let guard = lock_per_ip(&map);
        assert_eq!(guard.get(&"127.0.0.1".parse().unwrap()), Some(&99));
    }

    /// Drop on a `ConnectionGuard` whose per-IP map was poisoned must
    /// still release the global counter and decrement the per-IP entry
    /// rather than panicking on Drop and aborting the runtime.
    #[test]
    fn connection_guard_drop_recovers_from_poison() {
        let global = Arc::new(AtomicUsize::new(5));
        let per_ip: Arc<Mutex<HashMap<IpAddr, u32>>> = Arc::new(Mutex::new(HashMap::new()));
        let ip: IpAddr = "127.0.0.1".parse().unwrap();
        per_ip.lock().unwrap().insert(ip, 3);

        // Poison the per-IP mutex.
        let _ = std::panic::catch_unwind({
            let per_ip = Arc::clone(&per_ip);
            move || {
                let _g = per_ip.lock().unwrap();
                panic!("simulated panic");
            }
        });

        let guard = ConnectionGuard {
            global: Arc::clone(&global),
            per_ip: Arc::clone(&per_ip),
            ip,
        };
        drop(guard);

        assert_eq!(
            global.load(Ordering::Relaxed),
            4,
            "global counter decremented"
        );
        let map = lock_per_ip(&per_ip);
        assert_eq!(
            map.get(&ip).copied(),
            Some(2),
            "per-IP counter decremented from 3 to 2"
        );
    }
}
