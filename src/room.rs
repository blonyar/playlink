use dashmap::DashMap;
use serde::Serialize;
use serde_json::Value;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::protocol::ServerMessage;

#[derive(Default)]
pub struct RoomRegistry {
    rooms: DashMap<Uuid, Room>,
}

#[derive(Debug)]
pub struct Room {
    pub id: Uuid,
    pub name: String,
    pub max_players: usize,
    pub players: DashMap<Uuid, Player>,
    events: broadcast::Sender<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Player {
    pub id: Uuid,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RoomSnapshot {
    pub id: Uuid,
    pub name: String,
    pub max_players: usize,
    pub player_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct RoomDetail {
    pub id: Uuid,
    pub name: String,
    pub max_players: usize,
    pub players: Vec<Player>,
}

impl RoomRegistry {
    pub fn create_room(&self, name: Option<String>, max_players: Option<usize>) -> Uuid {
        let id = Uuid::new_v4();
        let (events, _) = broadcast::channel(256);

        self.rooms.insert(
            id,
            Room {
                id,
                name: name.unwrap_or_else(|| "Untitled Room".to_string()),
                max_players: max_players.unwrap_or(8),
                players: DashMap::new(),
                events,
            },
        );

        id
    }

    pub fn join_room(
        &self,
        room_id: Uuid,
        player: Player,
    ) -> Result<broadcast::Receiver<String>, String> {
        let room = self
            .rooms
            .get(&room_id)
            .ok_or_else(|| "room not found".to_string())?;

        if room.players.len() >= room.max_players {
            return Err("room is full".to_string());
        }

        let receiver = room.events.subscribe();
        room.players.insert(player.id, player.clone());
        room.publish(&ServerMessage::PlayerJoined {
            player_id: player.id,
            player_name: player.name,
        });

        Ok(receiver)
    }

    pub fn leave_room(&self, room_id: Uuid, player_id: Uuid) {
        let should_remove = if let Some(room) = self.rooms.get(&room_id) {
            room.players.remove(&player_id);
            room.publish(&ServerMessage::PlayerLeft { player_id });
            room.players.is_empty()
        } else {
            false
        };

        if should_remove {
            self.rooms.remove(&room_id);
        }
    }

    pub fn broadcast(&self, room_id: Uuid, from: Uuid, data: Value) -> Result<(), String> {
        let room = self
            .rooms
            .get(&room_id)
            .ok_or_else(|| "room not found".to_string())?;

        room.publish(&ServerMessage::RoomBroadcast { from, data });
        Ok(())
    }

    pub fn snapshots(&self) -> Vec<RoomSnapshot> {
        self.rooms
            .iter()
            .map(|room| RoomSnapshot {
                id: room.id,
                name: room.name.clone(),
                max_players: room.max_players,
                player_count: room.players.len(),
            })
            .collect()
    }

    pub fn detail(&self, room_id: Uuid) -> Option<RoomDetail> {
        self.rooms.get(&room_id).map(|room| RoomDetail {
            id: room.id,
            name: room.name.clone(),
            max_players: room.max_players,
            players: room.players.iter().map(|player| player.clone()).collect(),
        })
    }
}

impl Room {
    fn publish(&self, message: &ServerMessage) {
        if let Ok(text) = serde_json::to_string(message) {
            let _ = self.events.send(text);
        }
    }
}
