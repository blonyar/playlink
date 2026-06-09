use std::{collections::HashMap, sync::Arc};

use dashmap::DashMap;
use serde::Serialize;
use serde_json::Value;
use tokio::sync::{broadcast, Mutex};
use uuid::Uuid;

use crate::protocol::{ErrorCode, PlaylinkError, RoomEvent};

#[derive(Default)]
pub struct RoomRegistry {
    rooms: DashMap<Uuid, Room>,
    config: RoomRegistryConfig,
}

#[derive(Debug, Clone)]
pub struct RoomRegistryConfig {
    pub default_max_players: usize,
    pub max_players_per_room: usize,
    pub room_event_buffer: usize,
}

impl Default for RoomRegistryConfig {
    fn default() -> Self {
        Self {
            default_max_players: 8,
            max_players_per_room: 16,
            room_event_buffer: 256,
        }
    }
}

#[derive(Debug)]
pub struct Room {
    pub id: Uuid,
    pub name: String,
    pub max_players: usize,
    state: Arc<Mutex<RoomState>>,
    events: broadcast::Sender<RoomEvent>,
}

#[derive(Debug, Default)]
pub struct RoomState {
    players: HashMap<Uuid, Player>,
    removing: bool,
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
    pub fn new(config: RoomRegistryConfig) -> Self {
        Self {
            rooms: DashMap::new(),
            config: RoomRegistryConfig {
                default_max_players: config.default_max_players.max(1),
                max_players_per_room: config.max_players_per_room.max(1),
                room_event_buffer: config.room_event_buffer.max(1),
            },
        }
    }

    pub fn create_room(&self, name: Option<String>, max_players: Option<usize>) -> Uuid {
        let id = Uuid::new_v4();
        let max_players = max_players
            .unwrap_or(self.config.default_max_players)
            .clamp(1, self.config.max_players_per_room);
        let (events, _) = broadcast::channel(self.config.room_event_buffer);

        self.rooms.insert(
            id,
            Room {
                id,
                name: name.unwrap_or_else(|| "Untitled Room".to_string()),
                max_players,
                state: Arc::new(Mutex::new(RoomState::default())),
                events,
            },
        );

        id
    }

    pub async fn join_room(
        &self,
        room_id: Uuid,
        player: Player,
    ) -> Result<broadcast::Receiver<RoomEvent>, PlaylinkError> {
        let room = self
            .rooms
            .get(&room_id)
            .ok_or_else(|| PlaylinkError::new(ErrorCode::RoomNotFound, "Room not found"))?;

        let receiver = room.events.subscribe();
        {
            let mut state = room.state.lock().await;

            if state.removing {
                return Err(PlaylinkError::new(
                    ErrorCode::RoomNotFound,
                    "Room not found",
                ));
            }

            if state.players.contains_key(&player.id) {
                return Err(PlaylinkError::new(
                    ErrorCode::AlreadyInRoom,
                    "Player is already in this room",
                ));
            }

            if state.players.len() >= room.max_players {
                return Err(PlaylinkError::new(ErrorCode::RoomFull, "Room is full"));
            }

            state.players.insert(player.id, player.clone());
        }

        room.publish(RoomEvent::PlayerJoined {
            player_id: player.id,
            player_name: player.name,
        });

        Ok(receiver)
    }

    pub async fn leave_room(&self, room_id: Uuid, player_id: Uuid) {
        let should_remove = if let Some(room) = self.rooms.get(&room_id) {
            let removed = {
                let mut state = room.state.lock().await;
                let removed = state.players.remove(&player_id).is_some();
                let is_empty = state.players.is_empty();
                if is_empty {
                    state.removing = true;
                }
                (removed, is_empty)
            };

            if removed.0 {
                room.publish(RoomEvent::PlayerLeft { player_id });
            }

            removed.1
        } else {
            false
        };

        if should_remove {
            self.rooms.remove(&room_id);
        }
    }

    pub async fn broadcast(
        &self,
        room_id: Uuid,
        from: Uuid,
        data: Value,
    ) -> Result<(), PlaylinkError> {
        let room = self
            .rooms
            .get(&room_id)
            .ok_or_else(|| PlaylinkError::new(ErrorCode::RoomNotFound, "Room not found"))?;

        room.publish(RoomEvent::Message { from, data });
        Ok(())
    }

    pub async fn snapshots(&self) -> Vec<RoomSnapshot> {
        let rooms: Vec<_> = self
            .rooms
            .iter()
            .map(|room| {
                (
                    room.id,
                    room.name.clone(),
                    room.max_players,
                    room.state.clone(),
                )
            })
            .collect();

        let mut snapshots = Vec::with_capacity(rooms.len());
        for (id, name, max_players, state) in rooms {
            let state = state.lock().await;
            snapshots.push(RoomSnapshot {
                id,
                name,
                max_players,
                player_count: state.players.len(),
            });
        }

        snapshots
    }

    pub async fn detail(&self, room_id: Uuid) -> Option<RoomDetail> {
        let room = self.rooms.get(&room_id)?;
        let state = room.state.lock().await;
        Some(RoomDetail {
            id: room.id,
            name: room.name.clone(),
            max_players: room.max_players,
            players: state.players.values().cloned().collect(),
        })
    }
}

impl Room {
    fn publish(&self, event: RoomEvent) {
        let _ = self.events.send(event);
    }
}
