use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
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

    // Enforce the concurrent-connection cap before reserving an upgrade slot.
    let Some(guard) = reserve_connection(&state) else {
        tracing::warn!("rejecting websocket upgrade: connection cap reached");
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };

    // Enforce the message size cap at the transport layer so oversized frames
    // are rejected before being buffered into memory.
    let max_message_bytes = state.config.max_message_bytes;
    ws.max_message_size(max_message_bytes)
        .max_frame_size(max_message_bytes)
        .on_upgrade(move |socket| handle_socket(socket, state, guard))
}

/// RAII guard that reserves a slot in the global connection counter and
/// releases it on drop, so the slot is freed even if the upgrade future never
/// runs or the connection task panics.
struct ConnectionGuard {
    counter: Arc<AtomicUsize>,
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        self.counter.fetch_sub(1, Ordering::Relaxed);
    }
}

/// Atomically reserves a connection slot, rolling back if the cap is exceeded.
fn reserve_connection(state: &AppState) -> Option<ConnectionGuard> {
    let current = state.connections.fetch_add(1, Ordering::Relaxed);
    if current >= state.config.max_connections {
        state.connections.fetch_sub(1, Ordering::Relaxed);
        None
    } else {
        Some(ConnectionGuard {
            counter: Arc::clone(&state.connections),
        })
    }
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
            state.rooms.leave_room(room_id, session.player_id).await;
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
                state.rooms.leave_room(room_id, session.player_id).await;
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
}
