# Playlink Demo Guide

This guide explains the runnable demos and checks included with Playlink.

Use it when you want to quickly verify the current room server, JavaScript helper, Web Debug Console, LAN discovery prototype, or browser mini-game example.

## 1. Prerequisites

Required:

- Rust stable toolchain through `rustup`
- Node.js 20 or newer for built-in `fetch` and `WebSocket`

Fast full verification:

```powershell
.\scripts\verify.ps1
```

This is the v1.0 baseline gate. It should pass before changing protocol, helper API, debug console behavior, or state-sync conventions.

Use `.\scripts\verify.ps1 -SkipIntegration` when you only want format, compile, unit tests, and JavaScript syntax checks.

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
Playlink SDK demo passed.
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

## 10. Browser Tank Wars Demo

Purpose:

- exercise the protocol under real game traffic: position broadcasts, bullet events, hit detection, HP, respawn
- validate the state-snapshot helper under a 20Hz send rate
- show a complete browser game built on `@playlink/client`

In terminal 1, start Playlink:

```bash
rustup run stable cargo run
```

In terminal 2, serve the examples (this also serves the Tank Wars page):

```bash
npm --prefix examples/js-client run mini-game
# or equivalently: npm --prefix examples/js-client run tanks
```

Open:

```text
http://127.0.0.1:7780/tanks
```

The same server also serves the mini-game at `http://127.0.0.1:7780/`.

Local two-tab test:

```text
Tab 1: WebSocket URL ws://localhost:7777/ws -> Connect -> Create -> WASD to move, Space to fire
Tab 2: WebSocket URL ws://localhost:7777/ws -> Connect -> paste the same room id -> Join
```

LAN test:

```text
1. Host runs `cargo run` on machine A.
2. Find machine A's LAN IP (e.g. `192.168.1.20`).
3. Player on machine B opens `http://<host-lan-ip>:7780/tanks` and sets
   the WebSocket URL to `ws://192.168.1.20:7777/ws`.
```

What the demo does:

- position, angle, and HP are broadcast via `state_snapshot` at 20 Hz
- bullet shots are sent as `room_message` events with `kind: 'bullet'`
- the firing client runs hit detection and emits `kind: 'hit'` events to
  authoritative-decrement the victim's HP
- a tank destroyed with HP = 0 respawns 1.5 seconds later
- the canvas renders both players and active bullets each frame

## 11. Godot Client Example

Purpose:

- demonstrate the GDScript `PlaylinkClient` helper
- connect, create/join/leave rooms, and send messages from Godot 4
- inspect room members through the `members` array

The Godot example lives in `examples/godot-client/`.

### Project Structure

```text
examples/godot-client/
  project.godot           Godot 4 project
  playlink_client.gd      PlaylinkClient autoload script
  example.gd              Demo scene script with simple UI
  example.tscn            Demo scene
```

### How to Run

1. Start the Playlink server:
   ```bash
   rustup run stable cargo run
   ```

2. Open the Godot project in Godot 4:
   ```text
   File -> Open -> select examples/godot-client/project.godot
   ```

3. Run the scene (`F5`):
   ```text
   Connect -> enter player name -> Create Room
   Copy the room ID -> open a second instance -> Connect -> paste room ID -> Join
   Type messages and watch them appear in both instances
   ```

### PlaylinkClient API

The `PlaylinkClient` is registered as an autoload and can be accessed as `PlaylinkClient` from any script:

```gdscript
extends Node

func _ready():
    PlaylinkClient.connected.connect(_on_connected)
    PlaylinkClient.room_joined.connect(_on_room_joined)

func _on_connected():
    PlaylinkClient.player_name = "kang"
    PlaylinkClient.create_room("Lobby", 4)

func _on_room_joined(room_id, player_id):
    PlaylinkClient.send_room_message({ text = "hello from Godot!" })
```

Available signals:

| Signal | Payloads |
| --- | --- |
| `connected()` | — |
| `disconnected()` | — |
| `connection_failed()` | — |
| `room_created(room_id)` | `room_id: String` |
| `room_joined(room_id, player_id)` | `room_id, player_id: String` |
| `room_left(room_id)` | `room_id: String` |
| `player_joined(player_id, player_name)` | `player_id, player_name: String` |
| `player_left(player_id)` | `player_id: String` |
| `room_broadcast(from_id, data)` | `from_id: String`, `data: Dictionary` |
| `pong()` | — |
| `error_received(code, message)` | `code, message: String` |
| `event_lagged(skipped)` | `skipped: int` |

Configure the server URL before connecting:

```gdscript
PlaylinkClient.ws_url = "ws://192.168.1.20:7777/ws"
PlaylinkClient.connect_to_server()
```

## 11. LAN SDK Demo Flow

If another machine should connect to a host on the same LAN, choose or discover the host address first.

Example:

```bash
PLAYLINK_WS_URL=ws://192.168.1.20:7777/ws PLAYLINK_HTTP_URL=http://192.168.1.20:7777 npm --prefix examples/js-client run sdk-demo
```

Use `PLAYLINK_PUBLIC_HTTP_URL` and `PLAYLINK_PUBLIC_WS_URL` on the server when you want `/api/server` and discovery responses to advertise a specific reachable address.

## 12. Recommended Full Local Verification

Preferred one-command verification:

```powershell
.\scripts\verify.ps1
```

Manual static checks:

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
node --check examples/js-client/state-sync.js
node --check examples/js-client/idle-timeout.js
node --check examples/js-client/discover-lan.js
```

With the server running:

```bash
npm --prefix examples/js-client run smoke
npm --prefix examples/js-client run errors
npm --prefix examples/js-client run state-sync
npm --prefix examples/js-client run sdk-demo
```

Optional manual browser checks:

```text
http://localhost:7777/
http://127.0.0.1:7780/
```

## 13. Troubleshooting

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

### Connection closes with `Message Too Long`

The server enforces two size limits at the WebSocket transport layer:

- `PLAYLINK_MAX_FRAME_BYTES` (default 16 KiB) — maximum bytes in a single WebSocket frame.
- `PLAYLINK_MAX_MESSAGE_BYTES` (default 1 MiB) — maximum bytes in a reassembled message.

In v1.0 the old `PLAYLINK_MAX_MESSAGE_BYTES` value was applied to the frame cap, so JSON messages above 16 KiB were rejected even when split across frames. v1.1 splits the two knobs: if you are upgrading and the old variable is set, raise `PLAYLINK_MAX_MESSAGE_BYTES` to your expected max payload size and keep `PLAYLINK_MAX_FRAME_BYTES` at the default unless you really need larger single frames.
