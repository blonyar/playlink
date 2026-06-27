use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicI64, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use dashmap::DashMap;
use serde::Serialize;
use serde_json::Value;
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

use crate::protocol::{ErrorCode, PlaylinkError, RoomEvent};

pub struct RoomRegistry {
    rooms: DashMap<Uuid, Arc<Room>>,
    config: RoomRegistryConfig,
    total_rooms_created: AtomicU64,
    total_messages_broadcast: AtomicU64,
    active_players: AtomicI64,
}

impl Default for RoomRegistry {
    fn default() -> Self {
        Self::new(RoomRegistryConfig::default())
    }
}

#[derive(Debug, Clone)]
pub struct RoomRegistryConfig {
    pub default_max_players: usize,
    pub max_players_per_room: usize,
    pub room_event_buffer: usize,
    pub max_rooms: usize,
}

impl Default for RoomRegistryConfig {
    fn default() -> Self {
        Self {
            default_max_players: 8,
            max_players_per_room: 16,
            room_event_buffer: 256,
            max_rooms: 1024,
        }
    }
}

#[derive(Debug)]
pub struct Room {
    pub id: Uuid,
    pub name: String,
    pub max_players: usize,
    pub created_at_unix_secs: u64,
    message_count: AtomicU64,
    state: Arc<RwLock<RoomState>>,
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
    pub created_at_unix_secs: u64,
    pub message_count: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RoomDetail {
    pub id: Uuid,
    pub name: String,
    pub max_players: usize,
    pub created_at_unix_secs: u64,
    pub message_count: u64,
    pub players: Vec<Player>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RoomRegistryStats {
    pub room_count: usize,
    pub player_count: usize,
    pub total_rooms_created: u64,
    pub total_messages_broadcast: u64,
}

impl RoomRegistry {
    pub fn new(config: RoomRegistryConfig) -> Self {
        let config = RoomRegistryConfig {
            default_max_players: config.default_max_players.max(1),
            max_players_per_room: config.max_players_per_room.max(1),
            room_event_buffer: config.room_event_buffer.max(1),
            max_rooms: config.max_rooms.max(1),
        };
        Self {
            rooms: DashMap::new(),
            config,
            total_rooms_created: AtomicU64::new(0),
            total_messages_broadcast: AtomicU64::new(0),
            active_players: AtomicI64::new(0),
        }
    }

    /// Periodically removes rooms that have 0 players and are not marked as removing.
    /// Catches rooms that were created but never joined (room leak).
    pub fn spawn_cleanup_task(self: &Arc<Self>, interval: Duration) -> tokio::task::JoinHandle<()> {
        let registry = self.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(interval);
            tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                tick.tick().await;
                registry.cleanup_empty_rooms().await;
            }
        })
    }

    async fn cleanup_empty_rooms(&self) {
        // Clone the Arc<Room> handles out of the DashMap so no shard read-lock is
        // held across the per-room state-mutex await below.
        let rooms: Vec<Arc<Room>> = self
            .rooms
            .iter()
            .map(|entry| Arc::clone(entry.value()))
            .collect();
        for room in rooms {
            let should_remove = {
                let mut state = room.state.write().await;
                let empty = state.players.is_empty();
                if empty {
                    state.removing = true;
                }
                empty
            };
            if should_remove {
                self.rooms.remove(&room.id);
                tracing::debug!(room_id = %room.id, "removed empty room via cleanup task");
            }
        }
    }

    pub fn create_room(
        &self,
        name: Option<String>,
        max_players: Option<usize>,
    ) -> Result<Uuid, PlaylinkError> {
        // Soft cap: prevents unbounded room growth / memory exhaustion via
        // create_room flooding. A burst may transiently exceed this by a small
        // margin, which is acceptable for DoS protection.
        if self.rooms.len() >= self.config.max_rooms {
            return Err(PlaylinkError::new(
                ErrorCode::ServerFull,
                "Server has reached its room capacity",
            ));
        }
        let id = Uuid::new_v4();
        let max_players = max_players
            .unwrap_or(self.config.default_max_players)
            .clamp(1, self.config.max_players_per_room);
        let (events, _) = broadcast::channel(self.config.room_event_buffer);
        let created_at_unix_secs = current_unix_secs();

        self.rooms.insert(
            id,
            Arc::new(Room {
                id,
                name: name.unwrap_or_else(|| "Untitled Room".to_string()),
                max_players,
                created_at_unix_secs,
                message_count: AtomicU64::new(0),
                state: Arc::new(RwLock::new(RoomState::default())),
                events,
            }),
        );
        self.total_rooms_created.fetch_add(1, Ordering::Relaxed);

        Ok(id)
    }

    pub async fn join_room(
        &self,
        room_id: Uuid,
        player: Player,
    ) -> Result<broadcast::Receiver<RoomEvent>, PlaylinkError> {
        // Drop the DashMap shard read-guard before awaiting the room state mutex.
        let room = self.acquire_room(room_id)?;

        let receiver = room.events.subscribe();
        {
            let mut state = room.state.write().await;

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
            // Counted under the same lock as the player set so stats stay consistent.
            self.active_players.fetch_add(1, Ordering::Relaxed);
        }

        room.publish(RoomEvent::PlayerJoined {
            player_id: player.id,
            player_name: player.name,
        });

        Ok(receiver)
    }

    pub async fn leave_room(&self, room_id: Uuid, player_id: Uuid) {
        // Drop the DashMap shard read-guard before awaiting the room state mutex.
        let Some(room) = self.get_room(&room_id) else {
            return;
        };

        let (player_removed, room_empty) = {
            let mut state = room.state.write().await;
            let player_removed = state.players.remove(&player_id).is_some();
            let room_empty = state.players.is_empty();
            if player_removed {
                self.active_players.fetch_sub(1, Ordering::Relaxed);
            }
            if room_empty {
                state.removing = true;
            }
            (player_removed, room_empty)
        };

        if player_removed {
            room.publish(RoomEvent::PlayerLeft { player_id });
        }

        if room_empty {
            self.rooms.remove(&room_id);
        }
    }

    pub async fn broadcast(
        &self,
        room_id: Uuid,
        from: Uuid,
        data: Value,
    ) -> Result<(), PlaylinkError> {
        // Drop the DashMap shard read-guard before awaiting the room state mutex.
        let room = self.acquire_room(room_id)?;

        {
            let state = room.state.read().await;
            if state.removing || !state.players.contains_key(&from) {
                return Err(PlaylinkError::new(
                    ErrorCode::NotInRoom,
                    "Player is not in room",
                ));
            }
        }

        room.message_count.fetch_add(1, Ordering::Relaxed);
        self.total_messages_broadcast
            .fetch_add(1, Ordering::Relaxed);
        room.publish(RoomEvent::Message { from, data });
        Ok(())
    }

    pub async fn snapshots(&self) -> Vec<RoomSnapshot> {
        let rooms: Vec<Arc<Room>> = self
            .rooms
            .iter()
            .map(|entry| Arc::clone(entry.value()))
            .collect();

        let mut snapshots = Vec::with_capacity(rooms.len());
        for room in rooms {
            let state = room.state.read().await;
            snapshots.push(RoomSnapshot {
                id: room.id,
                name: room.name.clone(),
                max_players: room.max_players,
                player_count: state.players.len(),
                created_at_unix_secs: room.created_at_unix_secs,
                message_count: room.message_count.load(Ordering::Relaxed),
            });
        }

        snapshots
    }

    pub async fn detail(&self, room_id: Uuid) -> Option<RoomDetail> {
        // Drop the DashMap shard read-guard before awaiting the room state mutex.
        let room = self.get_room(&room_id)?;
        let state = room.state.read().await;
        Some(RoomDetail {
            id: room.id,
            name: room.name.clone(),
            max_players: room.max_players,
            created_at_unix_secs: room.created_at_unix_secs,
            message_count: room.message_count.load(Ordering::Relaxed),
            players: state.players.values().cloned().collect(),
        })
    }

    pub async fn stats(&self) -> RoomRegistryStats {
        RoomRegistryStats {
            room_count: self.rooms.len(),
            player_count: self.active_players.load(Ordering::Relaxed).max(0) as usize,
            total_rooms_created: self.total_rooms_created.load(Ordering::Relaxed),
            total_messages_broadcast: self.total_messages_broadcast.load(Ordering::Relaxed),
        }
    }

    /// Looks up a room and clones its `Arc` handle out of the DashMap guard,
    /// returning an error if the room does not exist. The guard is released
    /// before this function returns so callers never hold it across an await.
    fn acquire_room(&self, room_id: Uuid) -> Result<Arc<Room>, PlaylinkError> {
        let entry = self
            .rooms
            .get(&room_id)
            .ok_or_else(|| PlaylinkError::new(ErrorCode::RoomNotFound, "Room not found"))?;
        Ok(Arc::clone(entry.value()))
    }

    /// Same as [`acquire_room`] but returns `Option` for callers that treat a
    /// missing room as a no-op rather than an error.
    fn get_room(&self, room_id: &Uuid) -> Option<Arc<Room>> {
        let entry = self.rooms.get(room_id)?;
        Some(Arc::clone(entry.value()))
    }
}

impl Room {
    fn publish(&self, event: RoomEvent) {
        let _ = self.events.send(event);
    }
}

fn current_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use tokio::time::{timeout, Duration};

    use super::*;

    fn player(name: &str) -> Player {
        Player {
            id: Uuid::new_v4(),
            name: name.to_string(),
        }
    }

    fn config(max_rooms: usize) -> RoomRegistryConfig {
        RoomRegistryConfig {
            default_max_players: 8,
            max_players_per_room: 16,
            room_event_buffer: 256,
            max_rooms,
        }
    }

    #[tokio::test]
    async fn room_registry_new_clamps_zero_config_values_to_one() {
        let registry = RoomRegistry::new(RoomRegistryConfig {
            default_max_players: 0,
            max_players_per_room: 0,
            room_event_buffer: 0,
            max_rooms: 0,
        });

        let room_id = registry.create_room(None, None).unwrap();
        let detail = registry.detail(room_id).await.unwrap();
        assert_eq!(detail.max_players, 1);

        registry.join_room(room_id, player("Alice")).await.unwrap();
    }

    #[tokio::test]
    async fn create_room_clamps_requested_max_players_to_config_limit() {
        let registry = RoomRegistry::new(RoomRegistryConfig {
            default_max_players: 8,
            max_players_per_room: 3,
            room_event_buffer: 16,
            max_rooms: 1024,
        });

        let room_id = registry
            .create_room(Some("Lobby".to_string()), Some(99))
            .unwrap();
        let detail = registry.detail(room_id).await.unwrap();

        assert_eq!(detail.name, "Lobby");
        assert_eq!(detail.max_players, 3);
    }

    #[tokio::test]
    async fn create_room_refuses_once_room_capacity_is_reached() {
        let registry = RoomRegistry::new(config(1));

        let first = registry.create_room(None, None);
        let second = registry.create_room(None, None);

        assert!(first.is_ok());
        let error = second.unwrap_err();
        assert_eq!(error.code, ErrorCode::ServerFull);
        assert_eq!(error.message, "Server has reached its room capacity");
    }

    #[tokio::test]
    async fn join_room_returns_room_not_found_for_missing_room() {
        let registry = RoomRegistry::default();
        let error = registry
            .join_room(Uuid::new_v4(), player("Alice"))
            .await
            .unwrap_err();

        assert_eq!(error.code, ErrorCode::RoomNotFound);
        assert_eq!(error.message, "Room not found");
    }

    #[tokio::test]
    async fn join_room_adds_player_and_updates_detail() {
        let registry = RoomRegistry::default();
        let room_id = registry.create_room(None, Some(2)).unwrap();
        let alice = player("Alice");
        let alice_id = alice.id;

        registry.join_room(room_id, alice).await.unwrap();
        let detail = registry.detail(room_id).await.unwrap();

        assert_eq!(detail.players.len(), 1);
        assert_eq!(detail.players[0].id, alice_id);
        assert_eq!(detail.players[0].name, "Alice");
    }

    #[tokio::test]
    async fn join_room_publishes_player_joined_event() {
        let registry = RoomRegistry::default();
        let room_id = registry.create_room(None, Some(2)).unwrap();
        let alice = player("Alice");
        let alice_id = alice.id;

        let mut receiver = registry.join_room(room_id, alice).await.unwrap();
        let event = timeout(Duration::from_millis(100), receiver.recv())
            .await
            .unwrap()
            .unwrap();

        match event {
            RoomEvent::PlayerJoined {
                player_id,
                player_name,
            } => {
                assert_eq!(player_id, alice_id);
                assert_eq!(player_name, "Alice");
            }
            other => panic!("unexpected event: {other:?}"),
        }
    }

    #[tokio::test]
    async fn join_room_rejects_when_room_is_full() {
        let registry = RoomRegistry::default();
        let room_id = registry.create_room(None, Some(1)).unwrap();

        registry.join_room(room_id, player("Alice")).await.unwrap();
        let error = registry
            .join_room(room_id, player("Bob"))
            .await
            .unwrap_err();

        assert_eq!(error.code, ErrorCode::RoomFull);
        assert_eq!(error.message, "Room is full");
    }

    #[tokio::test]
    async fn leave_room_removes_empty_room() {
        let registry = RoomRegistry::default();
        let room_id = registry.create_room(None, Some(1)).unwrap();
        let alice = player("Alice");
        let alice_id = alice.id;

        registry.join_room(room_id, alice).await.unwrap();
        registry.leave_room(room_id, alice_id).await;

        assert!(registry.detail(room_id).await.is_none());
    }

    #[tokio::test]
    async fn leave_room_keeps_room_when_other_players_remain() {
        let registry = RoomRegistry::default();
        let room_id = registry.create_room(None, Some(2)).unwrap();
        let alice = player("Alice");
        let alice_id = alice.id;
        let bob = player("Bob");
        let bob_id = bob.id;

        registry.join_room(room_id, alice).await.unwrap();
        registry.join_room(room_id, bob).await.unwrap();
        registry.leave_room(room_id, alice_id).await;

        let detail = registry.detail(room_id).await.unwrap();
        assert_eq!(detail.players.len(), 1);
        assert_eq!(detail.players[0].id, bob_id);
    }

    #[tokio::test]
    async fn leave_room_cleanup_is_idempotent() {
        let registry = RoomRegistry::default();
        let room_id = registry.create_room(None, Some(2)).unwrap();
        let alice = player("Alice");
        let alice_id = alice.id;
        let bob = player("Bob");
        let bob_id = bob.id;

        registry.join_room(room_id, alice).await.unwrap();
        registry.join_room(room_id, bob).await.unwrap();

        registry.leave_room(room_id, alice_id).await;
        registry.leave_room(room_id, alice_id).await;
        registry.leave_room(Uuid::new_v4(), alice_id).await;

        let detail = registry.detail(room_id).await.unwrap();
        assert_eq!(detail.players.len(), 1);
        assert_eq!(detail.players[0].id, bob_id);

        registry.leave_room(room_id, bob_id).await;
        registry.leave_room(room_id, bob_id).await;

        assert!(registry.detail(room_id).await.is_none());
    }

    #[tokio::test]
    async fn broadcast_publishes_room_message_event() {
        let registry = RoomRegistry::default();
        let room_id = registry.create_room(None, Some(1)).unwrap();
        let alice = player("Alice");
        let alice_id = alice.id;
        let mut receiver = registry.join_room(room_id, alice).await.unwrap();
        let _ = receiver.recv().await.unwrap();

        registry
            .broadcast(room_id, alice_id, json!({ "move": "left" }))
            .await
            .unwrap();
        let event = timeout(Duration::from_millis(100), receiver.recv())
            .await
            .unwrap()
            .unwrap();

        match event {
            RoomEvent::Message { from, data } => {
                assert_eq!(from, alice_id);
                assert_eq!(data, json!({ "move": "left" }));
            }
            other => panic!("unexpected event: {other:?}"),
        }
    }

    #[tokio::test]
    async fn broadcast_increments_room_and_registry_message_counts() {
        let registry = RoomRegistry::default();
        let room_id = registry.create_room(None, Some(1)).unwrap();
        let alice = player("Alice");
        let alice_id = alice.id;
        let mut receiver = registry.join_room(room_id, alice).await.unwrap();
        let _ = receiver.recv().await.unwrap();

        registry
            .broadcast(room_id, alice_id, json!({ "move": "left" }))
            .await
            .unwrap();
        registry
            .broadcast(room_id, alice_id, json!({ "move": "right" }))
            .await
            .unwrap();

        let detail = registry.detail(room_id).await.unwrap();
        let stats = registry.stats().await;

        assert_eq!(detail.message_count, 2);
        assert_eq!(stats.total_messages_broadcast, 2);
    }

    #[tokio::test]
    async fn create_room_tracks_created_at_and_total_created() {
        let registry = RoomRegistry::default();
        let before = current_unix_secs();
        let room_id = registry
            .create_room(Some("Stats".to_string()), Some(2))
            .unwrap();
        let after = current_unix_secs();

        let detail = registry.detail(room_id).await.unwrap();
        let stats = registry.stats().await;

        assert!(detail.created_at_unix_secs >= before);
        assert!(detail.created_at_unix_secs <= after);
        assert_eq!(detail.message_count, 0);
        assert_eq!(stats.total_rooms_created, 1);
        assert_eq!(stats.room_count, 1);
    }

    #[tokio::test]
    async fn stats_include_active_room_and_player_counts() {
        let registry = RoomRegistry::default();
        let room_a = registry
            .create_room(Some("A".to_string()), Some(4))
            .unwrap();
        let room_b = registry
            .create_room(Some("B".to_string()), Some(4))
            .unwrap();

        registry.join_room(room_a, player("A1")).await.unwrap();
        registry.join_room(room_a, player("A2")).await.unwrap();
        registry.join_room(room_b, player("B1")).await.unwrap();

        let stats = registry.stats().await;
        assert_eq!(stats.room_count, 2);
        assert_eq!(stats.player_count, 3);
        assert_eq!(stats.total_rooms_created, 2);
    }

    #[tokio::test]
    async fn broadcast_rejects_sender_that_is_not_in_room() {
        let registry = RoomRegistry::default();
        let room_id = registry.create_room(None, Some(1)).unwrap();
        let error = registry
            .broadcast(room_id, Uuid::new_v4(), json!({ "move": "left" }))
            .await
            .unwrap_err();

        assert_eq!(error.code, ErrorCode::NotInRoom);
        assert_eq!(error.message, "Player is not in room");
    }

    #[tokio::test]
    async fn snapshots_include_room_player_counts() {
        let registry = RoomRegistry::default();
        let room_a = registry
            .create_room(Some("A".to_string()), Some(4))
            .unwrap();
        let room_b = registry
            .create_room(Some("B".to_string()), Some(4))
            .unwrap();

        registry.join_room(room_a, player("A1")).await.unwrap();
        registry.join_room(room_a, player("A2")).await.unwrap();
        registry.join_room(room_b, player("B1")).await.unwrap();

        let snapshots = registry.snapshots().await;
        let snapshot_a = snapshots.iter().find(|room| room.id == room_a).unwrap();
        let snapshot_b = snapshots.iter().find(|room| room.id == room_b).unwrap();

        assert_eq!(snapshot_a.player_count, 2);
        assert_eq!(snapshot_a.message_count, 0);
        assert!(snapshot_a.created_at_unix_secs > 0);
        assert_eq!(snapshot_b.player_count, 1);
    }
}
