use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct ClientEnvelope {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(flatten)]
    pub message: ClientMessage,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum ClientMessage {
    CreateRoom {
        room_name: Option<String>,
        max_players: Option<usize>,
    },
    JoinRoom {
        room_id: String,
        player_name: String,
    },
    LeaveRoom,
    RoomMessage {
        data: Value,
    },
    Ping,
}

#[derive(Debug, Serialize)]
pub struct ServerEnvelope {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(flatten)]
    pub message: ServerMessage,
}

impl ServerEnvelope {
    pub fn new(id: Option<String>, message: ServerMessage) -> Self {
        Self { id, message }
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidMessage,
    RoomNotFound,
    RoomFull,
    NotInRoom,
    AlreadyInRoom,
    InvalidRoomId,
    MessageTooLarge,
    RateLimited,
    InternalError,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorPayload {
    pub code: ErrorCode,
    pub message: String,
}

impl ErrorPayload {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct PlaylinkError {
    pub code: ErrorCode,
    pub message: String,
}

impl PlaylinkError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn into_payload(self) -> ErrorPayload {
        ErrorPayload::new(self.code, self.message)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum ServerMessage {
    Error(ErrorPayload),
    RoomCreated {
        room_id: Uuid,
    },
    RoomJoined {
        room_id: Uuid,
        player_id: Uuid,
    },
    RoomLeft {
        room_id: Uuid,
    },
    PlayerJoined {
        player_id: Uuid,
        player_name: String,
    },
    PlayerLeft {
        player_id: Uuid,
    },
    RoomBroadcast {
        from: Uuid,
        data: Value,
    },
    EventLagged {
        skipped: u64,
    },
    Pong,
}

impl ServerMessage {
    pub fn error(code: ErrorCode, message: impl Into<String>) -> Self {
        Self::Error(ErrorPayload::new(code, message))
    }

    pub fn from_room_event(event: RoomEvent) -> Self {
        match event {
            RoomEvent::PlayerJoined {
                player_id,
                player_name,
            } => Self::PlayerJoined {
                player_id,
                player_name,
            },
            RoomEvent::PlayerLeft { player_id } => Self::PlayerLeft { player_id },
            RoomEvent::Message { from, data } => Self::RoomBroadcast { from, data },
            RoomEvent::RoomClosed { reason } => Self::error(ErrorCode::InternalError, reason),
        }
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub enum RoomEvent {
    PlayerJoined {
        player_id: Uuid,
        player_name: String,
    },
    PlayerLeft {
        player_id: Uuid,
    },
    Message {
        from: Uuid,
        data: Value,
    },
    RoomClosed {
        reason: String,
    },
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn client_envelope_deserializes_create_room_with_id() {
        let envelope: ClientEnvelope = serde_json::from_value(json!({
            "id": "req-1",
            "type": "create_room",
            "payload": {
                "room_name": "Lobby",
                "max_players": 4
            }
        }))
        .unwrap();

        assert_eq!(envelope.id.as_deref(), Some("req-1"));
        match envelope.message {
            ClientMessage::CreateRoom {
                room_name,
                max_players,
            } => {
                assert_eq!(room_name.as_deref(), Some("Lobby"));
                assert_eq!(max_players, Some(4));
            }
            other => panic!("unexpected message: {other:?}"),
        }
    }

    #[test]
    fn client_envelope_deserializes_join_room_as_string_id() {
        let envelope: ClientEnvelope = serde_json::from_value(json!({
            "id": "join-1",
            "type": "join_room",
            "payload": {
                "room_id": "not-yet-parsed",
                "player_name": "Alice"
            }
        }))
        .unwrap();

        assert_eq!(envelope.id.as_deref(), Some("join-1"));
        match envelope.message {
            ClientMessage::JoinRoom {
                room_id,
                player_name,
            } => {
                assert_eq!(room_id, "not-yet-parsed");
                assert_eq!(player_name, "Alice");
            }
            other => panic!("unexpected message: {other:?}"),
        }
    }

    #[test]
    fn client_envelope_deserializes_room_message_with_arbitrary_json() {
        let data = json!({ "x": 1, "nested": { "ok": true } });
        let envelope: ClientEnvelope = serde_json::from_value(json!({
            "type": "room_message",
            "payload": { "data": data }
        }))
        .unwrap();

        assert!(envelope.id.is_none());
        match envelope.message {
            ClientMessage::RoomMessage { data } => {
                assert_eq!(data, json!({ "x": 1, "nested": { "ok": true } }));
            }
            other => panic!("unexpected message: {other:?}"),
        }
    }

    #[test]
    fn server_envelope_serializes_without_id_when_none() {
        let value = serde_json::to_value(ServerEnvelope::new(None, ServerMessage::Pong)).unwrap();
        assert_eq!(value, json!({ "type": "pong" }));
    }

    #[test]
    fn server_envelope_serializes_with_id_when_some() {
        let value = serde_json::to_value(ServerEnvelope::new(
            Some("req-1".to_string()),
            ServerMessage::Pong,
        ))
        .unwrap();
        assert_eq!(value, json!({ "id": "req-1", "type": "pong" }));
    }

    #[test]
    fn server_message_room_left_serializes_room_id() {
        let room_id = Uuid::new_v4();
        let value = serde_json::to_value(ServerMessage::RoomLeft { room_id }).unwrap();

        assert_eq!(
            value,
            json!({
                "type": "room_left",
                "payload": {
                    "room_id": room_id
                }
            })
        );
    }

    #[test]
    fn server_message_error_serializes_snake_case_error_code() {
        let value = serde_json::to_value(ServerMessage::error(
            ErrorCode::RoomNotFound,
            "Room not found",
        ))
        .unwrap();

        assert_eq!(
            value,
            json!({
                "type": "error",
                "payload": {
                    "code": "room_not_found",
                    "message": "Room not found"
                }
            })
        );
    }

    #[test]
    fn server_message_from_room_event_maps_message_to_room_broadcast() {
        let from = Uuid::new_v4();
        let data = json!({ "action": "jump", "power": 2 });
        let message = ServerMessage::from_room_event(RoomEvent::Message {
            from,
            data: data.clone(),
        });

        match message {
            ServerMessage::RoomBroadcast {
                from: actual,
                data: actual_data,
            } => {
                assert_eq!(actual, from);
                assert_eq!(actual_data, data);
            }
            other => panic!("unexpected message: {other:?}"),
        }
    }

    #[test]
    fn playlink_error_into_payload_preserves_code_and_message() {
        let payload = PlaylinkError::new(ErrorCode::NotInRoom, "Not in room").into_payload();
        assert_eq!(payload.code, ErrorCode::NotInRoom);
        assert_eq!(payload.message, "Not in room");
    }
}
