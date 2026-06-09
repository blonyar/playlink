mod admin;
mod protocol;
mod room;
mod session;
mod websocket;

use std::{net::SocketAddr, sync::Arc, time::Duration};

use axum::{http::HeaderValue, routing::get, Router};
use room::{RoomRegistry, RoomRegistryConfig};
use tower_http::{
    cors::{Any, CorsLayer},
    services::ServeDir,
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
pub struct AppState {
    rooms: Arc<RoomRegistry>,
    config: Arc<Config>,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub mode: String,
    pub allowed_origins: Vec<String>,
    pub default_max_players: usize,
    pub max_players_per_room: usize,
    pub room_event_buffer: usize,
    pub max_message_bytes: usize,
    pub session_idle_timeout: Duration,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            bind_addr: env_parse("PLAYLINK_BIND_ADDR", SocketAddr::from(([0, 0, 0, 0], 7777))),
            mode: std::env::var("PLAYLINK_MODE").unwrap_or_else(|_| "dev".to_string()),
            allowed_origins: std::env::var("PLAYLINK_ALLOWED_ORIGINS")
                .ok()
                .map(|value| {
                    value
                        .split(',')
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(ToString::to_string)
                        .collect()
                })
                .unwrap_or_default(),
            default_max_players: env_parse("PLAYLINK_DEFAULT_MAX_PLAYERS", 8).max(1),
            max_players_per_room: env_parse("PLAYLINK_MAX_PLAYERS_PER_ROOM", 16).max(1),
            room_event_buffer: env_parse("PLAYLINK_ROOM_EVENT_BUFFER", 256).max(1),
            max_message_bytes: env_parse("PLAYLINK_MAX_MESSAGE_BYTES", 16 * 1024),
            session_idle_timeout: Duration::from_secs(env_parse(
                "PLAYLINK_SESSION_IDLE_TIMEOUT_SECS",
                30,
            )),
        }
    }
}

fn env_parse<T>(key: &str, default: T) -> T
where
    T: std::str::FromStr,
{
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "playlink=debug,tower_http=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Arc::new(Config::from_env());
    let rooms = Arc::new(RoomRegistry::new(RoomRegistryConfig {
        default_max_players: config.default_max_players,
        max_players_per_room: config.max_players_per_room,
        room_event_buffer: config.room_event_buffer,
    }));
    let state = AppState {
        rooms,
        config: config.clone(),
    };
    let web_console_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("web-console");

    let app = Router::new()
        .route("/health", get(admin::health))
        .route("/api/rooms", get(admin::list_rooms))
        .route("/api/rooms/:room_id", get(admin::get_room))
        .route("/ws", get(websocket::connect))
        .nest_service(
            "/",
            ServeDir::new(web_console_dir).append_index_html_on_directories(true),
        )
        .layer(cors_layer(&config))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = config.bind_addr;
    tracing::info!(%addr, mode = %config.mode, "playlink server listening");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind server socket");

    axum::serve(listener, app).await.expect("server failed");
}

fn cors_layer(config: &Config) -> CorsLayer {
    if config.mode == "prod" {
        let origins: Vec<HeaderValue> = config
            .allowed_origins
            .iter()
            .filter_map(|origin| origin.parse().ok())
            .collect();

        if origins.is_empty() {
            tracing::warn!("PLAYLINK_MODE=prod but PLAYLINK_ALLOWED_ORIGINS is empty; no origins will be allowed");
        }

        CorsLayer::new().allow_origin(origins)
    } else {
        CorsLayer::new().allow_origin(Any)
    }
}
