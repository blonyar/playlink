use axum::{extract::State, Json};
use serde::Serialize;

use crate::{room::RoomSnapshot, AppState};

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

pub async fn list_rooms(State(state): State<AppState>) -> Json<Vec<RoomSnapshot>> {
    Json(state.rooms.snapshots())
}
