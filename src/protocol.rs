use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum ClientMessage {
    CreateRoom {
        room_name: Option<String>,
        max_players: Option<usize>,
    },
    JoinRoom {
        room_id: Uuid,
        player_name: String,
    },
    LeaveRoom,
    RoomMessage {
        data: Value,
    },
    Ping,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum ServerMessage {
    Error {
        message: String,
    },
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
    Pong,
}
