# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Use the rustup-managed stable toolchain in this environment:

```bash
rustup run stable cargo run
rustup run stable cargo check
rustup run stable cargo fmt
rustup run stable cargo test
```

The server listens on `0.0.0.0:7777` by default.

Useful local checks:

```bash
curl http://localhost:7777/health
curl http://localhost:7777/api/rooms
```

WebSocket endpoint:

```text
ws://localhost:7777/ws
```

Run all Rust tests with:

```bash
rustup run stable cargo test
```

Run a single test with:

```bash
rustup run stable cargo test <test_name>
```

## Project Scope

Playlink is a modular multiplayer networking framework for small games, prototypes, LAN parties, and room-based online play. Keep the early project centered on small room-based multiplayer rather than MMO-scale backend features, global matchmaking, anti-cheat, or thousand-player simulation.

The v0.1 loop is:

- Rust server
- WebSocket transport
- JSON protocol
- create, join, leave, and list rooms
- room message broadcast
- player sessions
- ping/pong heartbeat foundation
- simple admin/debug API

Future modules may include LAN discovery, host mode, relay mode, P2P/NAT traversal, additional protocols, SDKs, and example games, but these should remain modular rather than becoming required core dependencies. The repository may already contain later-stage examples or prototypes; keep them optional and avoid coupling them into the core room-server loop.

## Architecture

`src/main.rs` wires the Axum application. Shared state is `AppState`, currently an `Arc<RoomRegistry>`, and routes are mounted for:

- `GET /health`
- `GET /api/rooms`
- `GET /ws`

`src/protocol.rs` defines the JSON wire protocol via tagged Serde enums:

- `ClientMessage`: `create_room`, `join_room`, `leave_room`, `room_message`, `ping`
- `ServerMessage`: errors, room lifecycle responses, player join/leave events, broadcasts, `pong`

`src/room.rs` owns in-memory room state. `RoomRegistry` uses `DashMap` for rooms and per-room players. Room events are distributed through Tokio broadcast channels, and snapshots power the admin room list.

`src/session.rs` tracks per-WebSocket connection identity: generated player ID, optional player name, and current room.

`src/websocket.rs` handles WebSocket connections. Each connection splits inbound/outbound handling, keeps a `Session`, subscribes to room broadcasts after joining, and removes the player from the room on disconnect.

`src/admin.rs` contains simple HTTP JSON endpoints for health and room inspection.

## Design Guardrails

Before adding a feature, check whether it directly supports room-based multiplayer and whether it preserves the v0.1 loop. Prefer adding extension points for transport/topology/protocol/sync/discovery over coupling future features directly into the current WebSocket room server.
