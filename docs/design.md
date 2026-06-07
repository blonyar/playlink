# Playlink Design

## 1. Positioning

Playlink is a modular multiplayer networking framework for independent games, prototypes, LAN parties, and small room-based online games.

The project should help a game developer quickly add multiplayer to a small game without starting from a heavy commercial backend or building all networking infrastructure from scratch.

## 2. Goals

Playlink should make these workflows easy:

- start a local multiplayer server
- create and join rooms
- broadcast room messages
- inspect rooms and players during development
- test multiplayer behavior with simple clients
- later choose different networking modes, such as LAN discovery, host mode, relay, or P2P experiments

The first product goal is developer usefulness, not maximum scale.

## 3. Non-goals

Playlink is not trying to be:

- an MMO backend
- a thousand-player simulation server
- a commercial anti-cheat platform
- a global matchmaking platform
- a full game engine networking layer
- a database-heavy account, inventory, and economy backend

These may integrate with Playlink later, but they should not define the core architecture.

## 4. Target Games

Best fit:

- 2-8 player party games
- LAN multiplayer games
- turn-based games
- card, board, and chess-like games
- lightweight co-op games
- 2D action prototypes
- classroom, dorm, and friend-group multiplayer experiments
- Godot, Unity, web, and custom-engine prototypes

Poor fit for the early project:

- large MMO worlds
- competitive FPS with strong anti-cheat requirements
- open-world synchronization
- global ranked matchmaking
- high-concurrency commercial backends

## 5. Architecture Overview

Playlink should grow around replaceable modules instead of one fixed networking style.

```text
Game Client
  ↓
Client SDK / Raw WebSocket
  ↓
Protocol
  ↓
Transport
  ↓
Topology
  ↓
Room / Session / Sync Core
  ↓
Admin API / Debug Console / Logs
```

Current v0.1 implementation uses:

```text
JSON protocol + WebSocket transport + dedicated room server + in-memory room state
```

Future modules should be added behind clear boundaries:

```text
core/        rooms, players, sessions, events, heartbeat
transport/   websocket, udp, quic
topology/    dedicated, host, relay, p2p
protocol/    json, msgpack, protobuf
sync/        event, state, lockstep
discovery/   manual-ip, lan, mdns, registry
admin/       health, room list, debug console, logs, metrics
sdk/         js, rust, godot, unity later
examples/    chat, position sync, turn-based, LAN demo
```

The current repository is still a simple single-crate Rust server. Split into crates only when module boundaries become stable enough to justify it.

## 6. Current Code Structure

```text
src/main.rs        Axum app setup, shared state, routes, server bind
src/protocol.rs    JSON client/server message enums
src/room.rs        in-memory room registry, players, room snapshots, broadcasts
src/session.rs     per-connection player/session state
src/websocket.rs   WebSocket connection loop and message handling
src/admin.rs       health and room inspection endpoints
```

Shared application state is currently:

```text
AppState -> Arc<RoomRegistry>
```

Room state is in-memory only. This is intentional for v0.1 because room behavior and API shape should stabilize before adding persistence.

## 7. Networking Modes

### v0.1 Dedicated Server

```text
Client A ─┐
Client B ─┼── Playlink Server
Client C ─┘
```

Default first mode. It is stable, easy to debug, and works well with WebSocket.

### v0.2 LAN Discovery

Clients discover a server on the same LAN instead of manually typing an IP.

Possible mechanisms:

- UDP broadcast
- mDNS
- local registry endpoint

### v0.3 Host Mode

One player runs the server locally and other players connect to that host.

Useful for:

- LAN parties
- local friend groups
- games that do not need a deployed server

### v0.4 Relay Mode

Players connect through a relay when direct connections are not possible.

Useful for:

- no public IP
- strict NAT
- failed P2P attempts
- simple cross-network play

### v0.5 P2P / NAT Traversal

P2P should be optional and experimental, not the default architecture.

P2P can reduce server load for small groups, but it has major tradeoffs:

- upload pressure grows with player count
- NAT traversal is unreliable
- bad peers hurt the room
- cheat resistance is weaker
- relay fallback is still required in many networks

## 8. Sync Models

Playlink should support multiple sync styles over time.

### Event Sync

Clients send gameplay events; the room broadcasts them.

Best for:

- chat
- turn-based games
- card games
- low-frequency party games

This is the v0.1 default.

### State Sync

Clients or server publish state snapshots.

Best for:

- simple realtime movement
- lightweight co-op
- small action prototypes

### Lockstep

Clients exchange deterministic input frames.

Best for:

- deterministic strategy games
- some fighting/RTS-like experiments

This should be a later module because it imposes stronger requirements on game simulation.

### Server-authoritative Sync

The server validates or owns game state.

Best for:

- action games
- public online rooms
- games that need better cheat resistance

This is valuable, but not required for the first working loop.

## 9. Protocol Design

v0.1 uses JSON because it is easy to inspect and debug.

Client messages are tagged by `type` and use a `payload` object:

```json
{
  "type": "create_room",
  "payload": {
    "room_name": "test",
    "max_players": 4
  }
}
```

```json
{
  "type": "join_room",
  "payload": {
    "room_id": "00000000-0000-0000-0000-000000000000",
    "player_name": "kang"
  }
}
```

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

Server messages follow the same shape:

```json
{
  "type": "room_created",
  "payload": {
    "room_id": "00000000-0000-0000-0000-000000000000"
  }
}
```

Later binary protocols should not replace the conceptual message model; they should be alternate encodings of stable protocol concepts.

## 10. Admin / Debug Console

A visible debug surface is important. Without one, the project can drift into invisible infrastructure that is hard to validate.

The eventual Web Console should be a development/debug tool first, not a heavy production admin panel.

Suggested layout:

```text
Overview
Rooms
Players
Messages
Network
Config
Logs
```

### Overview

Show:

- server status
- uptime
- online player count
- room count
- transport mode
- topology mode
- message rate
- average ping

### Rooms

Show:

- room ID
- room name
- player count
- max players
- creation time
- topology mode
- room status

Actions:

- inspect room
- close room
- send test broadcast

### Room Detail

Show:

- player list
- recent messages
- room events
- room configuration
- broadcast test input

### Players

Show:

- player ID
- player name
- room ID
- connection state
- ping
- last heartbeat time
- remote address when available

### Messages

Show:

- realtime message stream
- filters by room, player, and message type
- JSON payload view
- timestamps

### Network

Show:

- listen address
- WebSocket status
- LAN discovery status
- relay status later
- P2P/NAT traversal status later

### Config

Show:

- port
- max rooms
- max players per room
- heartbeat interval
- disconnect timeout
- default protocol
- default topology

### Logs

Show:

- connection logs
- disconnection logs
- room lifecycle logs
- errors
- debug events

## 11. Roadmap

### Stage 0: Foundation

- repository setup
- README and design docs
- Rust server skeleton
- health endpoint
- room list endpoint
- WebSocket endpoint

### Stage 1: v0.1 Room Server

- create room
- join room
- leave room
- broadcast room messages
- ping/pong
- basic disconnect cleanup
- manual API testing

### Stage 2: Test Client

- JavaScript WebSocket test client
- create/join/send UI or CLI
- repeatable local multiplayer smoke test

### Stage 3: Debug Console

- room list UI
- player list UI
- message stream UI
- simple broadcast tester

### Stage 4: LAN Discovery

- LAN server advertisement
- LAN client discovery
- local network connection flow

### Stage 5: Host Mode

- package server behavior so a player can host locally
- document host/client flows

### Stage 6: Relay Mode

- relay service
- relay room registration
- relay fallback path

### Stage 7: P2P Experiments

- NAT type investigation
- STUN-style discovery
- UDP hole punching experiments
- relay fallback

### Stage 8: SDKs and Examples

- JavaScript SDK
- Rust client helper
- Godot example
- simple chat example
- position sync example
- turn-based example

## 12. Scope Control

Before adding a feature, ask:

1. Does it serve room-based multiplayer?
2. Can a small game use it soon?
3. Does it preserve the current working loop?
4. Can it be a later module instead of a core dependency?
5. Is it infrastructure for a real upcoming use case, or just architectural imagination?

Prefer a small working vertical slice over a broad incomplete framework.

The project should grow from working examples, not from abstract completeness.
