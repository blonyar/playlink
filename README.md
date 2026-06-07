# Playlink

Playlink is a modular multiplayer networking framework for small games, prototypes, LAN parties, and room-based online play.

The project starts with a small, stable core: rooms, players, sessions, WebSocket transport, JSON protocol, and a debug-friendly server API. Later versions can add LAN discovery, host mode, relay, P2P experiments, and multiple sync strategies without turning the v0.1 core into a catch-all game backend.

## Scope

Playlink is designed for:

- 2-8 player party games
- LAN multiplayer prototypes
- turn-based, card, board, and lightweight co-op games
- Godot, Unity, web, and custom-engine experiments
- developers who want a simple room server before committing to a heavier backend

Playlink is not trying to be an MMO backend, a global matchmaking platform, a commercial anti-cheat system, or a thousand-player simulation server.

## v0.1 Goals

- Rust server
- WebSocket transport
- JSON protocol
- create, join, leave, and list rooms
- room message broadcast
- player sessions
- ping/pong heartbeat foundation
- HTTP health endpoint
- simple admin/debug API

## Planned Modules

```text
core/        rooms, players, sessions, events, heartbeat
transport/   websocket first; UDP and QUIC later
topology/    dedicated server first; host, relay, and P2P later
protocol/    JSON first; MessagePack or Protobuf later
sync/        event sync first; state sync and lockstep later
discovery/   manual IP first; LAN discovery and registry later
admin/       health, room list, debug console, logs, metrics
```

## Current API

Start the server:

```bash
rustup run stable cargo run
```

Health check:

```bash
curl http://localhost:7777/health
```

List rooms:

```bash
curl http://localhost:7777/api/rooms
```

WebSocket endpoint:

```text
ws://localhost:7777/ws
```

Create a room:

```json
{
  "type": "create_room",
  "payload": {
    "room_name": "test",
    "max_players": 4
  }
}
```

Join a room:

```json
{
  "type": "join_room",
  "payload": {
    "room_id": "00000000-0000-0000-0000-000000000000",
    "player_name": "kang"
  }
}
```

Broadcast to the room:

```json
{
  "type": "room_message",
  "payload": {
    "data": {
      "x": 10,
      "y": 20
    }
  }
}
```

## Web Debug Console

Start the server and open the console in a browser:

```bash
rustup run stable cargo run
```

```text
http://localhost:7777/
```

The console shows health, room counts, room snapshots, and a built-in WebSocket test client for creating rooms, joining rooms, sending messages, and inspecting received events.

## Smoke Test

In one terminal, start the server:

```bash
rustup run stable cargo run
```

In another terminal, run the JavaScript WebSocket smoke test:

```bash
cd examples/js-client
npm run smoke
```

The smoke test creates a room, joins two clients, exchanges room messages, checks `/api/rooms`, closes one client, and verifies disconnect cleanup.

To quickly test idle disconnect behavior, start the server with a short timeout:

```bash
PLAYLINK_SESSION_IDLE_TIMEOUT_SECS=1 rustup run stable cargo run
```

Then run:

```bash
cd examples/js-client
npm run idle-timeout
```

## Roadmap

1. v0.1 dedicated WebSocket room server
2. JavaScript test client
3. Web debug console
4. LAN discovery
5. host mode
6. relay mode
7. P2P/NAT traversal experiments
8. SDKs and example games

## Guardrails

Before adding a feature, ask:

- Does it serve room-based multiplayer?
- Can a small game use it soon?
- Does it preserve the v0.1 loop?
- Can it be a later module instead of a core dependency?
