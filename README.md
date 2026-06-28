# Playlink

Playlink is a modular multiplayer networking framework for small games, prototypes, LAN parties, and room-based online play.

The project starts with a small, stable core: rooms, players, sessions, WebSocket transport, JSON protocol, and a debug-friendly server API. Later versions can add LAN discovery, host mode, relay, P2P experiments, and multiple sync strategies without turning the v0.1 core into a catch-all game backend.

## Try It in 5 Minutes

Terminal 1 — start the server:

```bash
rustup run stable cargo run
```

Open the Web Debug Console:

```text
http://localhost:7777/
```

Terminal 2 — run the SDK-style two-client demo:

```bash
npm --prefix examples/js-client run sdk-demo
```

Optional browser mini-game demo:

```bash
npm --prefix examples/js-client run mini-game
```

Then open:

```text
http://127.0.0.1:7780/
```

For all runnable checks and demos, see `docs/demo-guide.md`.

Run the full local verification suite:

```powershell
.\scripts\verify.ps1
```

## Scope

Playlink is designed for:

- 2-8 player party games
- LAN multiplayer prototypes
- turn-based, card, board, and lightweight co-op games
- Godot, Unity, web, and custom-engine experiments
- developers who want a simple room server before committing to a heavier backend

Playlink is not trying to be an MMO backend, a global matchmaking platform, a commercial anti-cheat system, or a thousand-player simulation server.

## Current Status

Playlink v1.0 is complete. The JSON/WebSocket room protocol, JavaScript helper API, Web Debug Console boundary, state sync conventions, and one-command verification flow are stable.

- Rust server
- WebSocket transport
- documented JSON protocol
- create, join, leave, inspect, and list rooms
- room message broadcast
- player sessions
- structured error codes
- ping/pong heartbeat foundation
- idle disconnect cleanup
- HTTP health endpoint
- simple admin/debug API
- server stats endpoint (`/api/stats`)
- room `message_count` and `created_at_unix_secs` metadata
- Web Debug Console with stats dashboard
- server/network metadata endpoint (`api_version` for SDK negotiation)
- optional LAN discovery prototype
- v1.1 hardening: `room_closed` event, per-IP connection cap, transport-layer frame/message size split, rate-limited messages, mutex-poison recovery, name sanitization, env-parse warnings
- `@playlink/client` JavaScript SDK package (see `packages/js-sdk/`)
- state snapshot helper utilities
- JavaScript helper API documentation
- SDK-style two-client demo script
- browser mini-game using `state_snapshot` messages
- Rust unit tests, SDK unit tests, and JavaScript integration scripts
- one-command verification via `.\scripts\verify.ps1` and GitHub Actions CI

See `docs/v1.0-baseline.md` for the baseline protocol and helper contract. See `packages/js-sdk/README.md` for the published SDK surface.

For the long-term modular framework direction, work threads, milestone sequencing, and atomic commit policy, see `docs/goal.md`.

For runnable checks and demos, see `docs/demo-guide.md`.

## Planned Modules

```text
core/        rooms, players, sessions, events, heartbeat
transport/   websocket first; UDP and QUIC later
topology/    dedicated server first; host, relay, and P2P later
protocol/    JSON first; MessagePack or Protobuf later
sync/        event sync and state snapshot conventions first; lockstep later
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

Server/network metadata:

```bash
curl http://localhost:7777/api/server
```

Server stats:

```bash
curl http://localhost:7777/api/stats
```

Example `/api/stats` response:

```json
{
  "uptime_seconds": 120,
  "room_count": 2,
  "player_count": 5,
  "connection_count": 3,
  "total_rooms_created": 12,
  "total_messages_broadcast": 84
}
```

Field notes:

| Field | Meaning |
| --- | --- |
| `uptime_seconds` | Seconds since this Playlink process started. |
| `room_count` | Current active rooms. |
| `player_count` | Current active players across rooms. |
| `connection_count` | Current active WebSocket connections. |
| `total_rooms_created` | Rooms created since process start. |
| `total_messages_broadcast` | Room messages broadcast since process start. |

Useful v0.4 host metadata environment variables:

```bash
PLAYLINK_SERVER_ID=kangs-playlink-server
PLAYLINK_SERVER_NAME="Kang's Playlink Server"
PLAYLINK_TOPOLOGY=host
PLAYLINK_PUBLIC_HTTP_URL=http://192.168.1.20:7777
PLAYLINK_PUBLIC_WS_URL=ws://192.168.1.20:7777/ws
```

`PLAYLINK_SERVER_ID` is optional, but recommended when a host should keep a stable identity across restarts or configuration changes. When omitted, Playlink generates a unique per-process identifier combining the server name, topology, and an instance UUID.

Example `/api/server` response with public URL overrides:

```json
{
  "server_id": "kangs-playlink-server",
  "name": "Kang's Playlink Server",
  "version": "0.1.0",
  "api_version": 1,
  "topology": "host",
  "bind_addr": "0.0.0.0:7777",
  "websocket_path": "/ws",
  "http_url": "http://192.168.1.20:7777",
  "ws_url": "ws://192.168.1.20:7777/ws",
  "public_http_url": "http://192.168.1.20:7777",
  "public_ws_url": "ws://192.168.1.20:7777/ws",
  "discovery": {
    "enabled": false,
    "method": null,
    "port": 7778
  }
}
```

LAN discovery is optional and disabled by default. To enable the UDP broadcast prototype:

```bash
PLAYLINK_LAN_DISCOVERY=1 PLAYLINK_DISCOVERY_PORT=7778 rustup run stable cargo run
```

Then, from another terminal, run:

```bash
npm --prefix examples/js-client run discover-lan
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

## JavaScript SDK

The JavaScript helper is published as a zero-dependency package at `packages/js-sdk/`. From an external project:

```bash
npm install @playlink/client
```

Requires Node.js 20+ or any modern browser. The example usage:

```js
import { PlaylinkClient, createStateSnapshot } from '@playlink/client';

const alice = new PlaylinkClient({ name: 'alice' });
await alice.connect();

const roomId = await alice.createRoom({ roomName: 'demo', maxPlayers: 4 });
await alice.joinRoom(roomId, 'alice');
alice.sendRoomMessage({ kind: 'move', x: 3, y: 7 });
```

The in-tree `examples/js-client/` consumes the same package via a `file:` link, so the examples and the published SDK share one source of truth. See `packages/js-sdk/README.md` for the full SDK surface and `docs/js-client-api.md` for the v1.0 helper contract.

Run the two-client SDK demo with the server already running:

```bash
npm --prefix examples/js-client run sdk-demo
```

The demo connects Alice and Bob, reads `/api/server`, creates and joins a room, exchanges chat/move-style room messages, verifies broadcasts, and tests leave-room behavior.

For LAN use, first discover or choose the host address, then pass it through environment variables:

```bash
PLAYLINK_WS_URL=ws://192.168.1.20:7777/ws PLAYLINK_HTTP_URL=http://192.168.1.20:7777 npm --prefix examples/js-client run sdk-demo
```

## Browser Mini Game Example

v0.5 also includes a tiny browser movement example that uses the same helper and room-message protocol.

Start the Playlink server:

```bash
rustup run stable cargo run
```

In another terminal, serve the example page:

```bash
npm --prefix examples/js-client run mini-game
```

Open:

```text
http://127.0.0.1:7780/
```

For the fastest local demo, connect, create a room, join it, then click `Add Bot` to spawn a second local client in the same page. You can also open two browser tabs, connect both, create a room in one tab, copy the room ID into the other tab, and move with arrow keys or WASD.

The local player moves with a browser animation loop, broadcasts position at about 20Hz, and interpolates remote players for smoother display. Movement is sent as room messages like:

```json
{
  "kind": "state_snapshot",
  "tick": 123,
  "entity_id": "player-id",
  "state": {
    "player_name": "alice",
    "x": 54,
    "y": 50
  }
}
```

Use event-style room messages for turns, chat, cards, and one-off actions. Use `state_snapshot` for lightweight client-published state such as movement or shared cursors. This is intentionally a minimal example rather than a full game engine SDK or server-authoritative sync layer.

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

For a one-command regression run, use:

```powershell
.\scripts\verify.ps1
```

To quickly test idle disconnect behavior, start the server with a short timeout:

```bash
PLAYLINK_SESSION_IDLE_TIMEOUT_SECS=1 rustup run stable cargo run
```

Then run:

```bash
cd examples/js-client
npm run idle-timeout
```

## Documentation Map

- `docs/protocol.md` — WebSocket JSON protocol and error codes
- `docs/js-client-api.md` — JavaScript helper API
- `docs/demo-guide.md` — runnable demos and local verification flow
- `docs/goal.md` — long-term framework direction and work threads
- `docs/v1.0-baseline.md` — active v1.0 baseline contracts and acceptance criteria
- `docs/v0.7-relay-groundwork-plan.md` — relay groundwork boundaries and next architecture plan
- `docs/relay-metadata.md` — future relay metadata design notes
- `docs/sync-models.md` — future event/state/lockstep sync model boundaries

## Project Stage Status

| Stage | Status | Notes |
| --- | --- | --- |
| v0.1 dedicated WebSocket room server | Done | Core create/join/leave/list/broadcast loop is implemented. |
| JavaScript test client | Done | Smoke, error, idle-timeout, and discovery scripts live in `examples/js-client`. |
| Web Debug Console | Done | Served from `/` with room inspection and simulator workflow. |
| v0.3 protocol and room reliability | Done | Structured errors, `room_left`, cleanup behavior, and protocol docs are in place. |
| v0.4 LAN discovery and host-mode groundwork | Done | `/api/server`, topology metadata, public URL overrides, and optional UDP discovery exist. |
| v0.5 SDK-style helper and examples | Done | JavaScript helper, SDK demo, and browser mini-game are available. |
| v0.6 JavaScript helper stabilization | Done | API docs, `room_left` coverage, and guided demo output are in place. |
| v0.7 relay mode groundwork | Done | Design docs, topology boundaries, and relay architecture candidates documented. |
| v0.8 observability and room stats | Done | `/api/stats` with connection, room, and player counts; room `message_count`/`created_at`; Web Console display; repeatable verification. |
| v0.9 lightweight state sync prototype | Done | `state_snapshot` helpers, stale tick filtering, mini-game usage, and docs are implemented. |
| v0.4 hardening pass | Done | Transport-layer frame/message size split, origin validation, per-session rate limiting, global and per-IP connection caps, graceful shutdown, name sanitization, `room_closed` event, `api_version` field, mutex-poison recovery, env-parse warnings. |
| v1.0 stable baseline | Done | Protocol, JS helper API, debug console, state sync contracts, and `.\scripts\verify.ps1` release gate are implemented. |
| v1.1 SDK packaging | Done | `@playlink/client` extracted to `packages/js-sdk/` as a zero-dependency ESM package with TypeScript declarations and `node --test` unit suite. `examples/js-client` now consumes it via a `file:` link. |
| CI | Done | GitHub Actions workflow in `.github/workflows/ci.yml` runs Rust fmt/test, SDK tests, JS syntax checks, and end-to-end integration jobs. |

## Roadmap

1. v0.1 dedicated WebSocket room server ✓
2. JavaScript test client ✓
3. Web debug console ✓
4. v0.3 protocol and room reliability ✓
5. v0.4 LAN discovery and host-mode groundwork ✓
6. v0.5 JavaScript SDK-style helper and example game workflow ✓
7. v0.6 JavaScript helper stabilization and API docs ✓
8. v0.7 relay mode groundwork ✓
9. v0.8 observability and room stats ✓
10. v0.9 lightweight state sync prototype ✓
11. v0.4 hardening pass ✓
12. v1.0 stable room protocol + JS helper + debug console baseline ✓
13. v1.1 `@playlink/client` SDK packaging ✓
14. CI pipeline ✓
15. Publish `@playlink/client` to the npm registry
16. More engine example integrations (Unity / C# / Rust client crate)
17. Relay runtime prototype (after SDK pressure is real)

## Guardrails

Before adding a feature, ask:

- Does it serve room-based multiplayer?
- Can a small game use it soon?
- Does it preserve the v0.1 loop?
- Can it be a later module instead of a core dependency?
