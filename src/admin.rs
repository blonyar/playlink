use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;
use uuid::Uuid;

use crate::{
    room::{RoomDetail, RoomSnapshot},
    AppState, ServerMetadata,
};

#[derive(Serialize)]
pub struct HealthResponse {
    status: &'static str,
    name: &'static str,
    version: &'static str,
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
