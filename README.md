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

## Current Status

Playlink currently has a stable room-server core with v0.4 LAN/host groundwork and a v0.5 JavaScript SDK-style example:

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
- Web Debug Console
- server/network metadata endpoint
- optional LAN discovery prototype
- small JavaScript client helper
- SDK-style two-client demo script
- Rust unit tests and JavaScript integration scripts

The current v0.5 focus is making the existing room server easy to consume from small game prototypes. See `docs/v0.5-js-sdk-example-plan.md`.

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

Server/network metadata:

```bash
curl http://localhost:7777/api/server
```

Useful v0.4 host metadata environment variables:

```bash
PLAYLINK_SERVER_ID=kangs-playlink-server
PLAYLINK_SERVER_NAME="Kang's Playlink Server"
PLAYLINK_TOPOLOGY=host
PLAYLINK_PUBLIC_HTTP_URL=http://192.168.1.20:7777
PLAYLINK_PUBLIC_WS_URL=ws://192.168.1.20:7777/ws
```

`PLAYLINK_SERVER_ID` is optional, but recommended when a host should keep a stable identity across restarts or configuration changes. When omitted, Playlink derives a deterministic fallback from the server name, topology, and bind address.

Example `/api/server` response with public URL overrides:

```json
{
  "server_id": "kangs-playlink-server",
  "name": "Kang's Playlink Server",
  "version": "0.1.0",
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

## JavaScript SDK-style Example

The JavaScript examples expect Node.js 20 or newer for built-in `fetch` and `WebSocket` support.

v0.5 includes a small reusable helper at `examples/js-client/playlink-client.js`. It wraps the existing WebSocket JSON protocol without introducing a new backend feature or package publishing step.

Example usage:

```js
import { PlaylinkClient } from './playlink-client.js';

const alice = new PlaylinkClient({ name: 'alice' });
await alice.connect();

const roomId = await alice.createRoom({ roomName: 'demo', maxPlayers: 4 });
await alice.joinRoom(roomId, 'alice');
alice.sendRoomMessage({ kind: 'move', x: 3, y: 7 });
```

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
  "kind": "move",
  "player_name": "alice",
  "x": 54,
  "y": 50
}
```

This is intentionally a minimal example rather than a full game engine SDK.

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
4. v0.3 protocol and room reliability
5. v0.4 LAN discovery and host-mode groundwork
6. v0.5 JavaScript SDK-style helper and example game workflow
7. relay mode
8. P2P/NAT traversal experiments
9. SDK packages and example games

## Guardrails

Before adding a feature, ask:

- Does it serve room-based multiplayer?
- Can a small game use it soon?
- Does it preserve the v0.1 loop?
- Can it be a later module instead of a core dependency?
