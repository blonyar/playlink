# Playlink Demo Guide

This guide explains the runnable demos and checks included with Playlink.

Use it when you want to quickly verify the current room server, JavaScript helper, Web Debug Console, LAN discovery prototype, or browser mini-game example.

## 1. Prerequisites

Required:

- Rust stable toolchain through `rustup`
- Node.js 20 or newer for built-in `fetch` and `WebSocket`

Useful commands:

```bash
rustup run stable cargo check
rustup run stable cargo test
node --version
```

## 2. Start the Playlink Server

In terminal 1:

```bash
rustup run stable cargo run
```

By default, the server listens on:

```text
http://localhost:7777
ws://localhost:7777/ws
```

Quick HTTP checks:

```bash
curl http://localhost:7777/health
curl http://localhost:7777/api/rooms
curl http://localhost:7777/api/server
curl http://localhost:7777/api/stats
```

`/api/stats` returns server uptime, active room and player counts, and cumulative counters for rooms created and messages broadcast since startup.

## 3. Web Debug Console

Open:

```text
http://localhost:7777/
```

Recommended workflow:

```text
Simulator -> Connect
Rooms     -> Create Room or Join Room
Messages  -> Send room messages
Rooms     -> Inspect room/player state
Simulator -> Leave Room or Disconnect
```

The Messages tab includes Chat Sample and Move Sample buttons so you can quickly fill the room-message JSON payload before sending.

The console is a development/debug tool. It is not a production admin panel.

## 4. Smoke Test

Purpose:

- verify the happy path
- create a room
- join two clients
- exchange room messages
- verify `room_left`
- verify room state through HTTP

Run with the server already running:

```bash
npm --prefix examples/js-client run smoke
```

Expected result:

```text
Playlink smoke test passed.
```

## 5. Error Test

Purpose:

- verify structured protocol errors
- missing room
- invalid room ID
- room full
- not in room
- invalid JSON
- leave while not in room

Run with the server already running:

```bash
npm --prefix examples/js-client run errors
```

Expected result:

```text
Playlink error test passed.
```

## 6. SDK Demo

Purpose:

- demonstrate the `PlaylinkClient` helper
- connect Alice and Bob
- read `/api/server`
- create and join a room
- exchange chat/move-style messages
- verify `room_left`

Run with the server already running:

```bash
npm --prefix examples/js-client run sdk-demo
```

Expected result:

```text
Playlink v0.6 SDK demo passed.
```

The helper API is documented in `docs/js-client-api.md`.

## 7. Idle Timeout Check

Purpose:

- verify idle disconnect behavior
- confirm clients should send `ping` periodically

In terminal 1, start the server with a short timeout:

```bash
PLAYLINK_SESSION_IDLE_TIMEOUT_SECS=1 rustup run stable cargo run
```

In terminal 2:

```bash
npm --prefix examples/js-client run idle-timeout
```

## 8. LAN Discovery Prototype

Purpose:

- verify optional UDP LAN discovery metadata
- discover a server on the configured discovery port

In terminal 1:

```bash
PLAYLINK_LAN_DISCOVERY=1 PLAYLINK_DISCOVERY_PORT=7778 rustup run stable cargo run
```

In terminal 2:

```bash
npm --prefix examples/js-client run discover-lan
```

Notes:

- LAN discovery is disabled by default.
- UDP broadcast behavior can vary by OS, firewall, and network.
- Discovery only finds connection metadata; it does not replace the room protocol.

## 9. Browser Mini-Game Example

Purpose:

- show how a tiny browser game can use Playlink room messages
- send position updates at about 20Hz
- interpolate remote movement
- spawn a local bot for one-page multiplayer testing

In terminal 1, start Playlink:

```bash
rustup run stable cargo run
```

In terminal 2, serve the mini-game page:

```bash
npm --prefix examples/js-client run mini-game
```

Open:

```text
http://127.0.0.1:7780/
```

Fast local test:

```text
Connect -> Create Room -> Join Room -> Add Bot -> Move with WASD or arrow keys
```

Multi-tab test:

```text
Tab 1: Connect -> Create Room -> Join
Tab 2: Connect -> paste room ID -> Join
Move both players and watch room_broadcast events drive remote movement
```

## 10. LAN SDK Demo Flow

If another machine should connect to a host on the same LAN, choose or discover the host address first.

Example:

```bash
PLAYLINK_WS_URL=ws://192.168.1.20:7777/ws PLAYLINK_HTTP_URL=http://192.168.1.20:7777 npm --prefix examples/js-client run sdk-demo
```

Use `PLAYLINK_PUBLIC_HTTP_URL` and `PLAYLINK_PUBLIC_WS_URL` on the server when you want `/api/server` and discovery responses to advertise a specific reachable address.

## 11. Recommended Full Local Verification

With the server stopped:

```bash
rustup run stable cargo fmt --check
rustup run stable cargo check
rustup run stable cargo test
node --check examples/js-client/playlink-client.js
node --check examples/js-client/sdk-demo.js
node --check examples/js-client/mini-game.js
node --check examples/js-client/mini-game-server.js
node --check web-console/assets/app.js
node --check examples/js-client/smoke.js
node --check examples/js-client/errors.js
```

With the server running:

```bash
npm --prefix examples/js-client run smoke
npm --prefix examples/js-client run errors
npm --prefix examples/js-client run sdk-demo
```

Optional manual browser checks:

```text
http://localhost:7777/
http://127.0.0.1:7780/
```

## 12. Troubleshooting

### WebSocket is not defined

Use Node.js 20 or newer.

### Cannot connect to localhost

Confirm the server is running:

```bash
curl http://localhost:7777/health
```

### LAN clients cannot connect

Check:

- host firewall
- correct LAN IP
- `PLAYLINK_PUBLIC_HTTP_URL`
- `PLAYLINK_PUBLIC_WS_URL`
- whether clients are on the same network

### Discovery finds nothing

Check:

- `PLAYLINK_LAN_DISCOVERY=1`
- discovery port matches client and server
- firewall allows UDP broadcast
- network allows broadcast traffic

### Room disappears after leaving

This is expected when the last player leaves. Empty rooms are cleaned up immediately.
