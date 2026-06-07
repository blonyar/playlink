mod admin;
mod protocol;
mod room;
mod session;
mod websocket;

use std::{net::SocketAddr, sync::Arc};

use axum::{routing::get, Router};
use room::RoomRegistry;
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
pub struct AppState {
    rooms: Arc<RoomRegistry>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "playlink=debug,tower_http=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let state = AppState {
        rooms: Arc::new(RoomRegistry::default()),
    };
    let web_console_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("web-console");

    let app = Router::new()
        .route("/health", get(admin::health))
        .route("/api/rooms", get(admin::list_rooms))
        .route("/ws", get(websocket::connect))
        .nest_service(
            "/",
            ServeDir::new(web_console_dir).append_index_html_on_directories(true),
        )
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 7777));
    tracing::info!(%addr, "playlink server listening");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind server socket");

    axum::serve(listener, app).await.expect("server failed");
}
