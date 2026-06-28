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
    ServerFull,
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
    /// Sent to the last remaining subscriber when a room is being torn down
    /// after its last player leaves or disconnects. v1.1 additive: clients
    /// that ignore this event still observe `player_left` followed by an
    /// `event_lagged` or a closed subscription.
    RoomClosed {
        room_id: Uuid,
        reason: String,
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
            RoomEvent::RoomClosed { room_id, reason } => Self::RoomClosed { room_id, reason },
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
        room_id: Uuid,
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
    fn join_room_ignores_client_supplied_player_id_field() {
        // Invariant: the server always assigns the player id from the
        // session. The wire format does not carry a player_id field, and
        // even if a hostile client injects one it must be dropped during
        // deserialization so the server can never be tricked into using
        // an attacker-chosen identity.
        let envelope: ClientEnvelope = serde_json::from_value(json!({
            "type": "join_room",
            "payload": {
                "room_id": "00000000-0000-0000-0000-000000000000",
                "player_name": "Alice",
                "player_id": "11111111-1111-1111-1111-111111111111"
            }
        }))
        .unwrap();

        match envelope.message {
            ClientMessage::JoinRoom {
                room_id,
                player_name,
            } => {
                assert_eq!(room_id, "00000000-0000-0000-0000-000000000000");
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
    fn server_message_from_room_event_maps_room_closed_to_server_room_closed() {
        let room_id = Uuid::new_v4();
        let message = ServerMessage::from_room_event(RoomEvent::RoomClosed {
            room_id,
            reason: "player_left".to_string(),
        });

        match message {
            ServerMessage::RoomClosed {
                room_id: actual_room_id,
                reason,
            } => {
                assert_eq!(actual_room_id, room_id);
                assert_eq!(reason, "player_left");
            }
            other => panic!("unexpected message: {other:?}"),
        }
    }

    #[test]
    fn server_message_room_closed_serializes_snake_case() {
        let room_id = Uuid::new_v4();
        let value = serde_json::to_value(ServerMessage::RoomClosed {
            room_id,
            reason: "player_disconnected".to_string(),
        })
        .unwrap();

        assert_eq!(
            value,
            json!({
                "type": "room_closed",
                "payload": {
                    "room_id": room_id,
                    "reason": "player_disconnected"
                }
            })
        );
    }

    #[test]
    fn playlink_error_into_payload_preserves_code_and_message() {
        let payload = PlaylinkError::new(ErrorCode::NotInRoom, "Not in room").into_payload();
        assert_eq!(payload.code, ErrorCode::NotInRoom);
        assert_eq!(payload.message, "Not in room");
    }
}
