use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};

use crate::{
    protocol::{ClientMessage, ServerMessage},
    room::Player,
    session::Session,
    AppState,
};

pub async fn connect(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let (outgoing_tx, mut outgoing_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let mut session = Session::default();
    let mut room_events_task: Option<tokio::task::JoinHandle<()>> = None;

    let sender_task = tokio::spawn(async move {
        while let Some(text) = outgoing_rx.recv().await {
            if sender.send(Message::Text(text)).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(message)) = receiver.next().await {
        let Message::Text(text) = message else {
            continue;
        };

        match serde_json::from_str::<ClientMessage>(&text) {
            Ok(client_message) => {
                handle_client_message(
                    client_message,
                    &state,
                    &mut session,
                    &outgoing_tx,
                    &mut room_events_task,
                )
                .await;
            }
            Err(error) => send(
                &outgoing_tx,
                &ServerMessage::Error {
                    message: format!("invalid message: {error}"),
                },
            ),
        }
    }

    if let Some(room_id) = session.room_id {
        state.rooms.leave_room(room_id, session.player_id);
    }

    if let Some(task) = room_events_task {
        task.abort();
    }

    sender_task.abort();
}

async fn handle_client_message(
    message: ClientMessage,
    state: &AppState,
    session: &mut Session,
    outgoing_tx: &tokio::sync::mpsc::UnboundedSender<String>,
    room_events_task: &mut Option<tokio::task::JoinHandle<()>>,
) {
    match message {
        ClientMessage::CreateRoom {
            room_name,
            max_players,
        } => {
            let room_id = state.rooms.create_room(room_name, max_players);
            send(outgoing_tx, &ServerMessage::RoomCreated { room_id });
        }
        ClientMessage::JoinRoom {
            room_id,
            player_name,
        } => {
            if let Some(previous_room_id) = session.room_id {
                state.rooms.leave_room(previous_room_id, session.player_id);
            }

            let player = Player {
                id: session.player_id,
                name: player_name.clone(),
            };

            match state.rooms.join_room(room_id, player) {
                Ok(mut room_events) => {
                    session.room_id = Some(room_id);
                    session.player_name = Some(player_name);

                    if let Some(task) = room_events_task.take() {
                        task.abort();
                    }

                    let room_outgoing_tx = outgoing_tx.clone();
                    *room_events_task = Some(tokio::spawn(async move {
                        while let Ok(text) = room_events.recv().await {
                            if room_outgoing_tx.send(text).is_err() {
                                break;
                            }
                        }
                    }));

                    send(
                        outgoing_tx,
                        &ServerMessage::RoomJoined {
                            room_id,
                            player_id: session.player_id,
                        },
                    );
                }
                Err(message) => send(outgoing_tx, &ServerMessage::Error { message }),
            }
        }
        ClientMessage::LeaveRoom => {
            if let Some(room_id) = session.room_id.take() {
                state.rooms.leave_room(room_id, session.player_id);
            }
        }
        ClientMessage::RoomMessage { data } => {
            if let Some(room_id) = session.room_id {
                if let Err(message) = state.rooms.broadcast(room_id, session.player_id, data) {
                    send(outgoing_tx, &ServerMessage::Error { message });
                }
            } else {
                send(
                    outgoing_tx,
                    &ServerMessage::Error {
                        message: "join a room before sending room messages".to_string(),
                    },
                );
            }
        }
        ClientMessage::Ping => send(outgoing_tx, &ServerMessage::Pong),
    }
}

fn send(outgoing_tx: &tokio::sync::mpsc::UnboundedSender<String>, message: &ServerMessage) {
    if let Ok(text) = serde_json::to_string(message) {
        let _ = outgoing_tx.send(text);
    }
}
