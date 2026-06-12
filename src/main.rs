mod admin;
mod discovery;
mod protocol;
mod room;
mod session;
mod websocket;

use std::{
    net::SocketAddr,
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{http::HeaderValue, routing::get, Router};
use room::{RoomRegistry, RoomRegistryConfig};
use serde::Serialize;
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
    started_at: Instant,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Topology {
    Dedicated,
    Host,
}

impl std::str::FromStr for Topology {
    type Err = ();

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "dedicated" => Ok(Self::Dedicated),
            "host" => Ok(Self::Host),
            _ => Err(()),
        }
    }
}

impl std::fmt::Display for Topology {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Dedicated => formatter.write_str("dedicated"),
            Self::Host => formatter.write_str("host"),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveryConfig {
    pub enabled: bool,
    pub method: Option<String>,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerMetadata {
    pub server_id: String,
    pub name: String,
    pub version: &'static str,
    pub topology: Topology,
    pub bind_addr: SocketAddr,
    pub websocket_path: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ws_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_http_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_ws_url: Option<String>,
    pub discovery: DiscoveryConfig,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub bind_addr: SocketAddr,
    pub mode: String,
    pub server: ServerMetadata,
    pub allowed_origins: Vec<String>,
    pub default_max_players: usize,
    pub max_players_per_room: usize,
    pub room_event_buffer: usize,
    pub max_message_bytes: usize,
    pub session_idle_timeout: Duration,
}

impl Config {
    pub fn from_env() -> Self {
        let bind_addr = env_parse("PLAYLINK_BIND_ADDR", SocketAddr::from(([0, 0, 0, 0], 7777)));
        let topology = env_parse("PLAYLINK_TOPOLOGY", Topology::Dedicated);
        let discovery_enabled = env_bool("PLAYLINK_LAN_DISCOVERY", false);
        let discovery_port = env_parse("PLAYLINK_DISCOVERY_PORT", 7778);
        let server_name =
            std::env::var("PLAYLINK_SERVER_NAME").unwrap_or_else(|_| "Playlink Server".to_string());
        let server_id = std::env::var("PLAYLINK_SERVER_ID")
            .unwrap_or_else(|_| format!("playlink:{server_name}:{topology}:{bind_addr}"));
        let public_http_url = optional_env("PLAYLINK_PUBLIC_HTTP_URL");
        let public_ws_url = optional_env("PLAYLINK_PUBLIC_WS_URL");

        Self {
            bind_addr,
            mode: std::env::var("PLAYLINK_MODE").unwrap_or_else(|_| "dev".to_string()),
            server: ServerMetadata {
                server_id,
                name: server_name,
                version: env!("CARGO_PKG_VERSION"),
                topology,
                bind_addr,
                websocket_path: "/ws",
                http_url: public_http_url.clone(),
                ws_url: public_ws_url.clone(),
                public_http_url,
                public_ws_url,
                discovery: DiscoveryConfig {
                    enabled: discovery_enabled,
                    method: discovery_enabled.then(|| "udp_broadcast".to_string()),
                    port: discovery_port,
                },
            },
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

fn optional_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn env_bool(key: &str, default: bool) -> bool {
    std::env::var(key)
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(default)
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
    let _discovery_task = if config.server.discovery.enabled {
        Some(
            discovery::spawn(config.server.clone())
                .await
                .expect("failed to bind LAN discovery socket"),
        )
    } else {
        None
    };

    let rooms = Arc::new(RoomRegistry::new(RoomRegistryConfig {
        default_max_players: config.default_max_players,
        max_players_per_room: config.max_players_per_room,
        room_event_buffer: config.room_event_buffer,
    }));
    let state = AppState {
        rooms,
        config: config.clone(),
        started_at: Instant::now(),
    };
    let web_console_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("web-console");

    let app = Router::new()
        .route("/health", get(admin::health))
        .route("/api/server", get(admin::server_info))
        .route("/api/stats", get(admin::stats))
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
    tracing::info!(%addr, mode = %config.mode, topology = %config.server.topology, server_name = %config.server.name, "playlink server listening");

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

#[cfg(test)]
mod tests {
    use std::{net::SocketAddr, str::FromStr};

    use super::*;

    #[test]
    fn topology_parses_supported_values() {
        assert!(matches!(
            Topology::from_str("dedicated"),
            Ok(Topology::Dedicated)
        ));
        assert!(matches!(Topology::from_str("HOST"), Ok(Topology::Host)));
        assert!(Topology::from_str("relay").is_err());
    }

    #[test]
    fn server_metadata_serializes_expected_fields() {
        let metadata = ServerMetadata {
            server_id: "test-server-id".to_string(),
            name: "Test Server".to_string(),
            version: "0.1.0",
            topology: Topology::Host,
            bind_addr: SocketAddr::from(([127, 0, 0, 1], 7777)),
            websocket_path: "/ws",
            http_url: Some("http://127.0.0.1:7777".to_string()),
            ws_url: Some("ws://127.0.0.1:7777/ws".to_string()),
            public_http_url: Some("http://127.0.0.1:7777".to_string()),
            public_ws_url: Some("ws://127.0.0.1:7777/ws".to_string()),
            discovery: DiscoveryConfig {
                enabled: true,
                method: Some("udp_broadcast".to_string()),
                port: 7778,
            },
        };

        let value = serde_json::to_value(metadata).unwrap();
        assert_eq!(value["server_id"], "test-server-id");
        assert_eq!(value["name"], "Test Server");
        assert_eq!(value["topology"], "host");
        assert_eq!(value["websocket_path"], "/ws");
        assert_eq!(value["http_url"], "http://127.0.0.1:7777");
        assert_eq!(value["ws_url"], "ws://127.0.0.1:7777/ws");
        assert_eq!(value["public_http_url"], "http://127.0.0.1:7777");
        assert_eq!(value["public_ws_url"], "ws://127.0.0.1:7777/ws");
        assert_eq!(value["discovery"]["enabled"], true);
        assert_eq!(value["discovery"]["port"], 7778);
    }
}
