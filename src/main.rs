mod admin;
mod discovery;
mod protocol;
mod room;
mod session;
mod websocket;

use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    path::Path,
    sync::{atomic::AtomicUsize, Arc, Mutex},
    time::{Duration, Instant},
};

use tokio::sync::broadcast;

use axum::{
    body::Body,
    extract::OriginalUri,
    http::{header, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use include_dir::{include_dir, Dir};
use room::{RoomRegistry, RoomRegistryConfig};
use serde::Serialize;
use session::RateLimitConfig;
use tower_http::{
    cors::{Any, CorsLayer},
    services::ServeDir,
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;

/// Web console assets embedded into the binary at compile time so the server
/// has no runtime dependency on the source tree. Overridden at runtime by the
/// `PLAYLINK_WEB_DIR` environment variable for local development.
static WEB_CONSOLE: Dir<'static> = include_dir!("$CARGO_MANIFEST_DIR/web-console");

#[derive(Clone)]
pub struct AppState {
    rooms: Arc<RoomRegistry>,
    config: Arc<Config>,
    started_at: Instant,
    connections: Arc<AtomicUsize>,
    connections_per_ip: Arc<Mutex<HashMap<IpAddr, u32>>>,
    shutdown: broadcast::Sender<()>,
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
    pub max_rooms: usize,
    pub max_message_bytes: usize,
    pub session_idle_timeout: Duration,
    pub cleanup_interval: Duration,
    pub rate_limit: RateLimitConfig,
    pub max_connections: usize,
    pub max_connections_per_ip: u32,
}

impl Config {
    pub fn from_env() -> Self {
        let bind_addr = env_parse("PLAYLINK_BIND_ADDR", SocketAddr::from(([0, 0, 0, 0], 7777)));
        let topology = env_parse("PLAYLINK_TOPOLOGY", Topology::Dedicated);
        let discovery_enabled = env_bool("PLAYLINK_LAN_DISCOVERY", false);
        let discovery_port = env_parse("PLAYLINK_DISCOVERY_PORT", 7778);
        let server_name =
            std::env::var("PLAYLINK_SERVER_NAME").unwrap_or_else(|_| "Playlink Server".to_string());
        // A random per-process instance id guarantees a unique server_id even
        // when name/topology/bind_addr collide across machines. Operators who
        // need a stable id can set PLAYLINK_SERVER_ID explicitly.
        let instance_id = Uuid::new_v4();
        let server_id = std::env::var("PLAYLINK_SERVER_ID")
            .unwrap_or_else(|_| format!("playlink:{server_name}:{topology}:{instance_id}"));
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
            max_rooms: env_parse("PLAYLINK_MAX_ROOMS", 1024).max(1),
            max_message_bytes: env_parse("PLAYLINK_MAX_MESSAGE_BYTES", 16 * 1024).max(256),
            session_idle_timeout: Duration::from_secs(env_parse(
                "PLAYLINK_SESSION_IDLE_TIMEOUT_SECS",
                30,
            )),
            cleanup_interval: Duration::from_secs(env_parse("PLAYLINK_CLEANUP_INTERVAL_SECS", 30)),
            rate_limit: RateLimitConfig {
                burst: env_parse("PLAYLINK_MESSAGE_BURST", 30),
                per_sec: env_parse("PLAYLINK_MESSAGE_RATE_PER_SEC", 30.0),
            },
            max_connections: env_parse("PLAYLINK_MAX_CONNECTIONS", 256).max(1),
            max_connections_per_ip: env_parse("PLAYLINK_MAX_CONNECTIONS_PER_IP", 8).max(1),
        }
    }

    /// Whether a WebSocket `Origin` header is allowed to upgrade. In `prod`
    /// mode the origin must match `allowed_origins`; in other modes all origins
    /// are accepted (mirroring the HTTP CORS policy).
    pub fn is_origin_allowed(&self, origin: Option<&str>) -> bool {
        if self.mode != "prod" {
            return true;
        }
        match origin {
            Some(origin) => self.allowed_origins.iter().any(|allowed| allowed == origin),
            None => false,
        }
    }

    /// Logs warnings for suspicious or contradictory configuration. Advisory
    /// only — individual values are clamped in `from_env`; this surfaces
    /// combinations that parse but are likely wrong.
    pub fn validate(&self) {
        if self.default_max_players > self.max_players_per_room {
            tracing::warn!(
                default_max_players = self.default_max_players,
                max_players_per_room = self.max_players_per_room,
                "default_max_players exceeds max_players_per_room; new rooms will be clamped down"
            );
        }
        if self.mode == "prod" && self.allowed_origins.is_empty() {
            tracing::warn!(
                "PLAYLINK_MODE=prod but PLAYLINK_ALLOWED_ORIGINS is empty; no browser origins will be allowed"
            );
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
    let Ok(raw) = std::env::var(key) else {
        return default;
    };
    let trimmed = raw.trim().to_ascii_lowercase();
    match trimmed.as_str() {
        "1" | "true" | "yes" | "on" => true,
        "0" | "false" | "no" | "off" => false,
        _ => {
            tracing::warn!(%key, %raw, "invalid bool value, using default ({default})");
            default
        }
    }
}

fn env_parse<T>(key: &str, default: T) -> T
where
    T: std::str::FromStr,
{
    let Ok(raw) = std::env::var(key) else {
        return default;
    };
    match raw.trim().parse() {
        Ok(value) => value,
        Err(_) => {
            tracing::warn!(%key, raw = %raw.as_str(), "invalid value, using default");
            default
        }
    }
}

/// Builds the core app (API + WebSocket routes) with shared state applied. The
/// web-console fallback and HTTP layers are added by `main` so this stays
/// usable from tests.
fn build_app(state: AppState) -> Router {
    Router::new()
        .route("/health", get(admin::health))
        .route("/api/server", get(admin::server_info))
        .route("/api/stats", get(admin::stats))
        .route("/api/rooms", get(admin::list_rooms))
        .route("/api/rooms/:room_id", get(admin::get_room))
        .route("/ws", get(websocket::connect))
        .with_state(state)
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
    config.validate();
    let (shutdown_tx, _) = broadcast::channel::<()>(16);
    let discovery_task = if config.server.discovery.enabled {
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
        max_rooms: config.max_rooms,
    }));
    let cleanup_task = rooms.spawn_cleanup_task(config.cleanup_interval);
    let state = AppState {
        rooms,
        config: config.clone(),
        started_at: Instant::now(),
        connections: Arc::new(AtomicUsize::new(0)),
        connections_per_ip: Arc::new(Mutex::new(HashMap::new())),
        shutdown: shutdown_tx.clone(),
    };

    let app = build_app(state);
    let app = match optional_env("PLAYLINK_WEB_DIR") {
        Some(dir) => {
            tracing::info!(%dir, "serving web console from PLAYLINK_WEB_DIR override");
            app.nest_service(
                "/",
                ServeDir::new(dir).append_index_html_on_directories(true),
            )
        }
        None => app.fallback(serve_web_console),
    };

    let app = app
        .layer(cors_layer(&config))
        .layer(TraceLayer::new_for_http())
        .into_make_service_with_connect_info::<SocketAddr>();

    let addr = config.bind_addr;
    tracing::info!(%addr, mode = %config.mode, topology = %config.server.topology, server_name = %config.server.name, "playlink server listening");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind server socket");

    let shutdown_signal_tx = shutdown_tx.clone();
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            shutdown_signal().await;
            tracing::info!("notifying active connections to close");
            let _ = shutdown_signal_tx.send(());
        })
        .await
        .expect("server failed");

    // Gracefully stop background tasks after HTTP shutdown completes.
    if let Some(handle) = discovery_task {
        handle.abort();
    }
    cleanup_task.abort();
    tracing::info!("playlink server stopped");
}

/// Serves the embedded web console assets. Runs as the router fallback so it
/// never shadows the API or WebSocket routes.
async fn serve_web_console(OriginalUri(uri): OriginalUri) -> Response {
    let relative = uri.path().trim_start_matches('/');
    let file = if relative.is_empty() {
        WEB_CONSOLE.get_file("index.html")
    } else {
        WEB_CONSOLE.get_file(relative)
    };
    let Some(file) = file else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let content_type = content_type_for(file.path());
    let mut headers = axum::http::HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    (headers, Body::from(file.contents().to_vec())).into_response()
}

fn content_type_for(path: &Path) -> &'static str {
    let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
        return "application/octet-stream";
    };
    match ext.to_ascii_lowercase().as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "js" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => tracing::info!("received Ctrl+C, shutting down"),
        _ = terminate => tracing::info!("received terminate signal, shutting down"),
    }
}

fn cors_layer(config: &Config) -> CorsLayer {
    let allowed_methods = [Method::GET, Method::POST, Method::OPTIONS];
    let allowed_headers = [
        axum::http::header::CONTENT_TYPE,
        axum::http::header::AUTHORIZATION,
    ];

    if config.mode == "prod" {
        let origins: Vec<HeaderValue> = config
            .allowed_origins
            .iter()
            .filter_map(|origin| origin.parse().ok())
            .collect();

        if origins.is_empty() {
            tracing::warn!("PLAYLINK_MODE=prod but PLAYLINK_ALLOWED_ORIGINS is empty; no origins will be allowed");
        }

        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods(allowed_methods)
            .allow_headers(allowed_headers)
    } else {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(allowed_methods)
            .allow_headers(allowed_headers)
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
    fn web_console_embeds_core_assets() {
        assert!(WEB_CONSOLE.get_file("index.html").is_some());
        assert!(WEB_CONSOLE.get_file("assets/app.js").is_some());
        assert!(WEB_CONSOLE.get_file("assets/style.css").is_some());
        assert!(WEB_CONSOLE.get_file("missing.html").is_none());
    }

    #[test]
    fn content_type_maps_known_extensions() {
        assert_eq!(
            content_type_for(Path::new("index.html")),
            "text/html; charset=utf-8"
        );
        assert_eq!(
            content_type_for(Path::new("assets/app.js")),
            "application/javascript; charset=utf-8"
        );
        assert_eq!(
            content_type_for(Path::new("style.css")),
            "text/css; charset=utf-8"
        );
        assert_eq!(content_type_for(Path::new("favicon.ico")), "image/x-icon");
        assert_eq!(
            content_type_for(Path::new("noext")),
            "application/octet-stream"
        );
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

    #[test]
    fn is_origin_allowed_dev_accepts_anything() {
        let config = sample_config();

        assert!(config.is_origin_allowed(Some("https://evil.example")));
        assert!(config.is_origin_allowed(None));
    }

    #[test]
    fn is_origin_allowed_prod_requires_known_origin() {
        let mut config = sample_config();
        config.mode = "prod".to_string();
        config.allowed_origins = vec!["https://game.example".to_string()];

        assert!(config.is_origin_allowed(Some("https://game.example")));
        assert!(!config.is_origin_allowed(Some("https://evil.example")));
        assert!(!config.is_origin_allowed(None));
    }

    fn sample_config() -> Config {
        Config {
            bind_addr: SocketAddr::from(([0, 0, 0, 0], 7777)),
            mode: "dev".to_string(),
            server: ServerMetadata {
                server_id: "id".to_string(),
                name: "n".to_string(),
                version: "0.1.0",
                topology: Topology::Dedicated,
                bind_addr: SocketAddr::from(([0, 0, 0, 0], 7777)),
                websocket_path: "/ws",
                http_url: None,
                ws_url: None,
                public_http_url: None,
                public_ws_url: None,
                discovery: DiscoveryConfig {
                    enabled: false,
                    method: None,
                    port: 7778,
                },
            },
            allowed_origins: vec![],
            default_max_players: 8,
            max_players_per_room: 16,
            room_event_buffer: 256,
            max_rooms: 1024,
            max_message_bytes: 16 * 1024,
            session_idle_timeout: Duration::from_secs(30),
            cleanup_interval: Duration::from_secs(30),
            rate_limit: RateLimitConfig::default(),
            max_connections: 256,
            max_connections_per_ip: 8,
        }
    }
}

#[cfg(test)]
mod ws_integration {
    use super::*;
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};

    fn integration_state() -> AppState {
        let config = Arc::new(Config {
            bind_addr: "127.0.0.1:0".parse().unwrap(),
            mode: "dev".to_string(),
            server: ServerMetadata {
                server_id: "integration".to_string(),
                name: "integration".to_string(),
                version: "0.1.0",
                topology: Topology::Dedicated,
                bind_addr: "127.0.0.1:0".parse().unwrap(),
                websocket_path: "/ws",
                http_url: None,
                ws_url: None,
                public_http_url: None,
                public_ws_url: None,
                discovery: DiscoveryConfig {
                    enabled: false,
                    method: None,
                    port: 7778,
                },
            },
            allowed_origins: vec![],
            default_max_players: 8,
            max_players_per_room: 16,
            room_event_buffer: 256,
            max_rooms: 1024,
            max_message_bytes: 16 * 1024,
            session_idle_timeout: Duration::from_secs(30),
            cleanup_interval: Duration::from_secs(30),
            rate_limit: RateLimitConfig {
                burst: 100,
                per_sec: 100.0,
            },
            max_connections: 256,
            max_connections_per_ip: 8,
        });
        let rooms = Arc::new(RoomRegistry::new(RoomRegistryConfig::default()));
        let (shutdown_tx, _) = broadcast::channel::<()>(16);
        AppState {
            rooms,
            config,
            started_at: Instant::now(),
            connections: Arc::new(AtomicUsize::new(0)),
            connections_per_ip: Arc::new(Mutex::new(HashMap::new())),
            shutdown: shutdown_tx,
        }
    }

    /// Reads from the stream until a message whose `type` matches, returning it.
    async fn expect_message<S>(stream: &mut S, expected_type: &str) -> serde_json::Value
    where
        S: StreamExt<Item = Result<WsMessage, tokio_tungstenite::tungstenite::Error>> + Unpin,
    {
        while let Some(message) = stream.next().await {
            if let Ok(WsMessage::Text(text)) = message {
                let value: serde_json::Value = serde_json::from_str(&text.to_string()).unwrap();
                if value["type"] == expected_type {
                    return value;
                }
            }
        }
        panic!("stream closed before receiving {expected_type}");
    }

    #[tokio::test]
    async fn ws_create_join_broadcast_lifecycle() {
        let app =
            build_app(integration_state()).into_make_service_with_connect_info::<SocketAddr>();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });

        let url = format!("ws://{addr}/ws");
        let (mut alice, _) = connect_async(&url).await.unwrap();
        let (mut bob, _) = connect_async(&url).await.unwrap();

        // Alice creates a room.
        alice
            .send(WsMessage::Text(
                r#"{"type":"create_room","payload":{"room_name":"R","max_players":4}}"#.into(),
            ))
            .await
            .unwrap();
        let room_id = expect_message(&mut alice, "room_created").await["payload"]["room_id"]
            .as_str()
            .unwrap()
            .to_string();

        // Alice joins; she also receives her own player_joined.
        alice
            .send(WsMessage::Text(format!(
                r#"{{"type":"join_room","payload":{{"room_id":"{room_id}","player_name":"Alice"}}}}"#
            )))
            .await
            .unwrap();
        let _ = expect_message(&mut alice, "room_joined").await;
        let _ = expect_message(&mut alice, "player_joined").await;

        // Bob joins; Alice observes Bob's player_joined.
        bob.send(WsMessage::Text(format!(
            r#"{{"type":"join_room","payload":{{"room_id":"{room_id}","player_name":"Bob"}}}}"#
        )))
        .await
        .unwrap();
        let _ = expect_message(&mut bob, "room_joined").await;
        let bob_joined = expect_message(&mut alice, "player_joined").await;
        assert_eq!(bob_joined["payload"]["player_name"], "Bob");

        // Alice broadcasts; Bob receives it.
        alice
            .send(WsMessage::Text(
                r#"{"type":"room_message","payload":{"data":{"move":"left"}}}"#.into(),
            ))
            .await
            .unwrap();
        let broadcast = expect_message(&mut bob, "room_broadcast").await;
        assert_eq!(broadcast["payload"]["data"]["move"], "left");
    }

    #[tokio::test]
    async fn stats_reports_connection_count() {
        let state = integration_state();
        state
            .connections
            .store(2, std::sync::atomic::Ordering::Relaxed);
        let response = crate::admin::stats(axum::extract::State(state)).await.0;
        assert_eq!(response.connection_count, 2);
    }
}
