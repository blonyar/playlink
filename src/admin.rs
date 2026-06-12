use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;
use uuid::Uuid;

use crate::{
    room::{RoomDetail, RoomRegistryStats, RoomSnapshot},
    AppState, ServerMetadata,
};

#[derive(Serialize)]
pub struct HealthResponse {
    status: &'static str,
    name: &'static str,
    version: &'static str,
}

#[derive(Serialize)]
pub struct StatsResponse {
    pub uptime_seconds: u64,
    pub room_count: usize,
    pub player_count: usize,
    pub total_rooms_created: u64,
    pub total_messages_broadcast: u64,
}

impl StatsResponse {
    fn from_registry(uptime_seconds: u64, stats: RoomRegistryStats) -> Self {
        Self {
            uptime_seconds,
            room_count: stats.room_count,
            player_count: stats.player_count,
            total_rooms_created: stats.total_rooms_created,
            total_messages_broadcast: stats.total_messages_broadcast,
        }
    }
}

pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        name: "playlink",
        version: env!("CARGO_PKG_VERSION"),
    })
}

pub async fn server_info(State(state): State<AppState>) -> Json<ServerMetadata> {
    Json(state.config.server.clone())
}

pub async fn stats(State(state): State<AppState>) -> Json<StatsResponse> {
    let uptime_seconds = state.started_at.elapsed().as_secs();
    let registry_stats = state.rooms.stats().await;
    Json(StatsResponse::from_registry(uptime_seconds, registry_stats))
}

pub async fn list_rooms(State(state): State<AppState>) -> Json<Vec<RoomSnapshot>> {
    Json(state.rooms.snapshots().await)
}

pub async fn get_room(
    State(state): State<AppState>,
    Path(room_id): Path<Uuid>,
) -> Result<Json<RoomDetail>, StatusCode> {
    state
        .rooms
        .detail(room_id)
        .await
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}
