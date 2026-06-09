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
#[derive(Debug, Clone, Serialize)]
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
