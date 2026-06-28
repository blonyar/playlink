# Playlink Rust Client Guide

This guide documents how to write a Playlink WebSocket client in Rust without depending on the `playlink` server crate. The wire protocol is stable for v1.x; clients written against this guide work with any v1.0+ server.

For JavaScript or browser-based clients, install [`@playlink/client`](https://github.com/blonyar/playlink/tree/main/packages/js-sdk) instead. For Godot, see `examples/godot-client/`.

## 1. Wire Protocol Recap

Playlink speaks JSON over WebSocket. The default endpoint is:

```text
ws://host:7777/ws
```

Stable client messages (see `docs/protocol.md` for the full reference):

| `type` | Required payload | Notes |
| --- | --- | --- |
| `create_room` | `{ room_name?, max_players? }` | Returns `room_created`. |
| `join_room` | `{ room_id, player_name }` | Returns `room_joined`. |
| `leave_room` | none | Returns `room_left`; others see `player_left`. |
| `room_message` | `{ data }` | Broadcasts `data` (any JSON) to the room. |
| `ping` | none | Returns `pong`. |

Stable server messages include `room_created`, `room_joined`, `room_left`, `player_joined`, `player_left`, `room_broadcast`, `room_closed` (v1.1), `event_lagged`, `pong`, and `error`.

Every envelope can carry an optional `id` string; the server echoes the same `id` on the response, so the client can correlate requests.

## 2. Recommended Crates

Add these to `Cargo.toml`:

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.21"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4", "serde"] }
futures-util = "0.3"
tracing = "0.1"
url = "2"
```

The Playlink v0.4 branch uses these exact versions for its integration tests (see `Cargo.toml` in the repository root).

## 3. Minimal Client Skeleton

The following client connects, creates a room, joins it, sends a chat-style message, and prints what other members broadcast. It assumes the server is reachable at `ws://localhost:7777/ws`.

```rust
use std::collections::HashMap;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::mpsc;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
enum ClientMessage {
    CreateRoom { room_name: Option<String>, max_players: Option<usize> },
    JoinRoom { room_id: String, player_name: String },
    LeaveRoom,
    RoomMessage { data: Value },
    Ping,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
enum ServerMessage {
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Serialize, Deserialize)]
struct Envelope<T> {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    #[serde(flatten)]
    message: T,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let (ws, _) = connect_async("ws://localhost:7777/ws").await?;
    let (mut write, mut read) = ws.split();

    // Send create_room with a request id; the server echoes the id on
    // the matching response, so we can wait for it on the read side.
    let request_id = Uuid::new_v4().to_string();
    let create = Envelope {
        id: Some(request_id.clone()),
        message: ClientMessage::CreateRoom {
            room_name: Some("demo".into()),
            max_players: Some(4),
        },
    };
    write.send(Message::Text(serde_json::to_string(&create)?)).await?;

    // Print the next 5 messages from the server, then leave.
    let mut received = 0;
    while let Some(message) = read.next().await {
        let Message::Text(text) = message? else { continue; };
        let value: Value = serde_json::from_str(&text)?;
        println!("<= {value}");
        received += 1;
        if received >= 5 { break; }
    }
    Ok(())
}
```

The full protocol is JSON; `Value` is a fine interchange type for a small client. For larger projects, define explicit `serde` enums per server message and deserialize with `#[serde(tag = "type", content = "payload", rename_all = "snake_case")]` — the server uses the same convention (see `src/protocol.rs`).

## 4. Reconnect and Rejoin Strategy

The JavaScript SDK at `packages/js-sdk/` follows this strategy; mirror it in Rust for parity:

1. On unexpected `close`, transition to a `reconnecting` state.
2. Schedule the next attempt with exponential backoff plus 30% jitter:
   `delay = base_delay * 2^attempt; jitter = random() * delay * 0.3`.
3. Stop after `max_reconnect_attempts` (default 10) and surface the final failure to the caller.
4. After a successful reconnect, send a fresh `join_room` for the last room the client was in. The server allocates a new `player_id`; the client should treat this as a new identity.
5. Re-flush any queued `room_message` payloads that were sent while the socket was down.

Tokio shape:

```rust
async fn reconnect_loop(
    url: &str,
    state: SharedState,
    outgoing_tx: mpsc::Sender<ClientMessage>,
) {
    let mut attempt = 0u32;
    while attempt < MAX_ATTEMPTS {
        let delay = base_delay(attempt);
        tokio::time::sleep(delay).await;
        match connect_async(url).await {
            Ok((ws, _)) => {
                attempt = 0;
                run_session(ws, state.clone(), outgoing_tx.clone()).await;
            }
            Err(error) => {
                tracing::warn!(?error, attempt, "reconnect attempt failed");
                attempt += 1;
            }
        }
    }
}
```

The `run_session` function owns the read/write halves of the socket for as long as the connection lasts and re-enters `reconnect_loop` when it ends.

## 5. State Snapshot Helpers

The v0.9 lightweight state sync convention is a layer on top of ordinary `room_message` broadcasts. The server does not interpret the payload; the client and game logic do.

### Snapshot shape

```json
{
  "kind": "state_snapshot",
  "tick": 120,
  "entity_id": "player:alice",
  "state": { "x": 42, "y": 18 }
}
```

Rules (mirroring the JavaScript `StateSnapshotFilter`):

- `tick` is a non-negative safe integer and monotonic per `entity_id`.
- `entity_id` is a non-empty string owned by the game.
- `state` is a JSON object owned by the game.
- Receivers reject duplicate, stale, or out-of-order ticks per entity.

### Filter in Rust

```rust
use std::collections::HashMap;

struct StateSnapshotFilter {
    latest_ticks: HashMap<String, u64>,
}

impl StateSnapshotFilter {
    fn accepts(&mut self, snapshot: &Value) -> bool {
        if snapshot.get("kind").and_then(Value::as_str) != Some("state_snapshot") { return false; }
        let entity = match snapshot.get("entity_id").and_then(Value::as_str) { Some(e) => e.to_string(), None => return false };
        let tick = match snapshot.get("tick").and_then(Value::as_u64) { Some(t) => t, None => return false };
        if let Some(previous) = self.latest_ticks.get(&entity) {
            if tick <= *previous { return false; }
        }
        self.latest_ticks.insert(entity, tick);
        true
    }
}
```

For the publisher side, use a `tokio::time::interval` to throttle, an atomic counter for the next tick, and a generic `has_changed` callback (e.g., a closure comparing the new state to the last) to skip no-op frames.

## 6. Capability Negotiation

Servers with v1.1+ expose an `api_version` field on `/api/server`. Clients that need to know whether a feature is safe to use should `GET /api/server` first and compare `api_version` to the constant they were built against.

```rust
#[derive(Deserialize)]
struct ServerMetadata {
    #[serde(default)]
    api_version: Option<u32>,
    // ...other fields
}

async fn negotiate(http_base: &str) -> reqwest::Result<u32> {
    let body: ServerMetadata = reqwest::get(format!("{http_base}/api/server")).await?.json().await?;
    Ok(body.api_version.unwrap_or(1))
}
```

A safe client treats `api_version < expected` as "do not rely on the new features" and `api_version > expected` as "negotiation error: refuse to connect or warn the user".

## 7. Server-Side Constraints to Respect

- `PLAYLINK_MAX_FRAME_BYTES` (default 16 KiB) — single WebSocket frame cap.
- `PLAYLINK_MAX_MESSAGE_BYTES` (default 1 MiB) — reassembled message cap.
- `PLAYLINK_SESSION_IDLE_TIMEOUT_SECS` (default 30) — server closes idle connections. Send a `ping` at least every `idle_timeout / 2` seconds; many clients send one every 10 seconds.
- `PLAYLINK_MAX_CONNECTIONS` and `PLAYLINK_MAX_CONNECTIONS_PER_IP` (defaults 256 and 8) — global and per-source-IP caps.

The server emits `error` envelopes with these `code` values: `invalid_message`, `room_not_found`, `room_full`, `not_in_room`, `already_in_room`, `invalid_room_id`, `message_too_large`, `rate_limited`, `internal_error`. Surface them to the caller; do not retry `room_full` or `not_in_room` blindly.

## 8. Testing

A first Rust client should cover at least:

- A round-trip test: send `ping`, expect `pong` with the same `id`.
- A room lifecycle test: create, join, broadcast, observe the broadcast, leave.
- A reconnect test: kill the server, expect the client to reconnect and rejoin.

For end-to-end coverage, the repository's `examples/godot-client/` and the integration tests in `src/main.rs` (the `ws_integration` module) are useful references: they drive a real Playlink server with `tokio-tungstenite` and assert the wire format.
