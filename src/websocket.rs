use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
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

pub async fn connect(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let connection_id = Uuid::new_v4();
    let span = tracing::info_span!("ws_connection", %connection_id);

    async {
        let (mut sender, mut receiver) = socket.split();
        let (outgoing_tx, mut outgoing_rx) = mpsc::channel::<String>(OUTGOING_QUEUE_SIZE);
        let (close_tx, mut close_rx) = mpsc::channel::<()>(1);
        let mut session = Session::default();
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

            if text.len() > state.config.max_message_bytes {
                let request_id = extract_request_id(&text);
                if send(
                    &outgoing_tx,
                    request_id,
                    ServerMessage::error(ErrorCode::MessageTooLarge, "Message is too large"),
                )
                .is_err()
                {
                    break "send_error";
                }
                continue;
            }

            match serde_json::from_str::<ClientEnvelope>(&text) {
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
                    let request_id = extract_request_id(&text);
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
            let room_id = state.rooms.create_room(room_name, max_players);
            send(
                outgoing_tx,
                request_id,
                ServerMessage::RoomCreated { room_id },
            )?;
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

            let player = Player {
                id: session.player_id,
                name: player_name.clone(),
            };

            match state.rooms.join_room(room_id, player).await {
                Ok(mut room_events) => {
                    session.room_id = Some(room_id);
                    session.player_name = Some(player_name);

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
    if let Ok(text) = serde_json::to_string(&envelope) {
        outgoing_tx.try_send(text)
    } else {
        Ok(())
    }
}

fn extract_request_id(text: &str) -> Option<String> {
    let value = serde_json::from_str::<serde_json::Value>(text).ok()?;
    value.get("id")?.as_str().map(ToString::to_string)
}
