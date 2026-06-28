# Playlink Tutorial

A hands-on guide to building a small multiplayer game with Playlink. By the end you will have a working two-player chat, a movement demo using the state sync helper, and a deployment checklist for production.

This tutorial assumes Node.js 20+ and a Rust toolchain. If you only want to consume the server, you can use the JavaScript SDK without any Rust knowledge.

## 0. What you will build

```text
┌──────────┐   ┌─────────────────┐   ┌──────────┐
│ Alice UI │──▶│  Playlink       │◀──│  Bob UI  │
│ (client) │   │  server         │   │ (client) │
└──────────┘   │  ws://...:7777  │   └──────────┘
                └─────────────────┘
```

- A Node.js server with `cargo run` exposing a WebSocket endpoint.
- Two clients using `@playlink/client` that join the same room and exchange messages.
- A 4-player mini-game that uses the v0.9 state sync convention for movement.
- A production checklist for `PLAYLINK_MODE=prod` deployment.

Estimated time: 20 minutes.

## 1. Prerequisites

```bash
# Rust (via rustup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup install stable

# Node.js 20 or newer
node --version   # should print v20+ or v22+ or v24+
```

Clone the repository:

```bash
git clone https://github.com/blonyar/playlink.git
cd playlink
```

The repository ships its own `examples/js-client/`, which consumes the published SDK via a `file:` link. You can either reuse that directory for your first demo or create a brand-new one.

## 2. Start the server

In terminal 1:

```bash
rustup run stable cargo run
```

First start downloads dependencies and compiles. Subsequent starts use the cached target. You should see something like:

```text
INFO playlink server listening addr=0.0.0.0:7777 mode=dev topology=dedicated server_name="Playlink Server"
```

Sanity-check the server in a second terminal:

```bash
curl http://localhost:7777/health
# {"status":"ok","name":"playlink","version":"0.1.0"}

curl http://localhost:7777/api/server | head
# {"server_id":"playlink:Playlink Server:dedicated:...","api_version":1,...}
```

`api_version: 1` is the value the server returns; the SDK exposes `PROTOCOL_VERSION` (also `1`) so you can compare them.

The WebSocket endpoint is at `ws://localhost:7777/ws`. The Web Debug Console lives at `http://localhost:7777/`.

## 3. Your first client

Create a new project directory next to the cloned repo. We will use the published SDK so the example matches what external projects do.

```bash
mkdir playlink-chat-demo
cd playlink-chat-demo
npm init -y
npm install @playlink/client
```

The `npm install` step above will currently pull the in-tree SDK if you keep the `file:` link from `examples/js-client/`, or fall back to the public npm version once the package is published.

Create `alice.js`:

```js
import { PlaylinkClient, ProtocolError, ERROR_CODES } from '@playlink/client';

const client = new PlaylinkClient({ name: 'alice' });

client.on('state_change', (state) => {
  console.log(`[alice] state: ${state}`);
});

client.on('player_joined', (message) => {
  console.log(`[alice] player joined: ${message.payload.player_name} (${message.payload.player_id})`);
});

client.on('player_left', (message) => {
  console.log(`[alice] player left: ${message.payload.player_id}`);
});

client.on('room_broadcast', (message) => {
  console.log(`[alice] from ${message.payload.from}: ${JSON.stringify(message.payload.data)}`);
});

client.on('event_lagged', (message) => {
  console.warn(`[alice] lagged: ${message.payload.skipped} events skipped`);
});

try {
  await client.connect();
  const roomId = await client.createRoom({ roomName: 'demo', maxPlayers: 4 });
  console.log(`[alice] created room ${roomId}`);
  const join = await client.joinRoom(roomId, 'alice');
  console.log(`[alice] joined as ${join.player_id}`);
} catch (error) {
  if (error instanceof ProtocolError) {
    console.error(`[alice] protocol error: ${error.code} (${error.message})`);
    if (error.code === ERROR_CODES.ROOM_FULL) {
      console.error('[alice] try a different server or wait for someone to leave');
    }
  } else {
    console.error('[alice] unexpected error:', error);
  }
  process.exit(1);
}

// Keep the process alive.
setInterval(() => {}, 60_000);
```

Run it:

```bash
node alice.js
```

You should see:

```text
[alice] state: connecting
[alice] state: connected
[alice] created room <uuid>
[alice] joined as <uuid>
```

Leave it running.

## 4. A second client that talks to Alice

Create `bob.js` in the same directory:

```js
import { PlaylinkClient, ProtocolError, ERROR_CODES } from '@playlink/client';

const ROOM_ID = process.argv[2];
if (!ROOM_ID) {
  console.error('usage: node bob.js <room_id>');
  process.exit(1);
}

const client = new PlaylinkClient({ name: 'bob' });

client.on('state_change', (state) => {
  console.log(`[bob] state: ${state}`);
});

client.on('room_broadcast', (message) => {
  console.log(`[bob] from ${message.payload.from}: ${JSON.stringify(message.payload.data)}`);
});

client.on('error', (message) => {
  console.error(`[bob] protocol error: ${message.payload.code} (${message.payload.message})`);
});

try {
  await client.connect();
  await client.joinRoom(ROOM_ID, 'bob');
  console.log(`[bob] joined ${ROOM_ID}`);

  // Reply once per second so we can see real broadcast traffic.
  let counter = 0;
  setInterval(() => {
    client.sendRoomMessage({ kind: 'chat', text: `hello from bob #${++counter}` });
  }, 1000);
} catch (error) {
  if (error instanceof ProtocolError) {
    console.error(`[bob] protocol error: ${error.code}`);
  } else {
    console.error('[bob] unexpected error:', error);
  }
  process.exit(1);
}
```

Open a third terminal, copy the room id printed by Alice, and run:

```bash
node bob.js <paste-room-id-here>
```

You should see Alice receive Bob's messages, and Bob seeing Alice's `player_joined` event when he joined. Use `Ctrl+C` to stop either side; the other side observes `player_left`.

## 5. Error handling patterns

Playlink returns errors in two shapes:

1. `ProtocolError` thrown by `request()` (and any awaited SDK method) for protocol-level failures: `room_not_found`, `room_full`, `not_in_room`, `already_in_room`, `invalid_room_id`, `invalid_message`, `rate_limited`, `message_too_large`, `internal_error`.
2. `error` wire event delivered through `client.on('error', ...)` for messages that arrive on the broadcast channel or that cannot be matched to a pending request.

A robust client wraps every `await` of an SDK method:

```js
async function safe(label, fn) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ProtocolError) {
      switch (error.code) {
        case ERROR_CODES.ROOM_FULL:
          console.warn(`${label}: room is full, falling back to a fresh room`);
          return null;
        case ERROR_CODES.RATE_LIMITED:
          console.warn(`${label}: rate limited, backing off`);
          await new Promise((r) => setTimeout(r, 1000));
          return null;
        default:
          console.error(`${label}: protocol error ${error.code}: ${error.message}`);
          return null;
      }
    }
    throw error;
  }
}

const roomId = await safe('[alice]', () => client.createRoom({ roomName: 'demo' }));
if (roomId === null) {
  process.exit(1);
}
```

The server also enforces:

- `PLAYLINK_MAX_FRAME_BYTES` (default 16 KiB) per single WebSocket frame.
- `PLAYLINK_MAX_MESSAGE_BYTES` (default 1 MiB) per reassembled message.
- `PLAYLINK_SESSION_IDLE_TIMEOUT_SECS` (default 30). Send a `ping` periodically. The SDK does this for you every `keepaliveIntervalMs` ms (default 10 s) if you do not disable it.

## 6. A movement demo with state sync

State sync is a convention layered on top of `room_message`. The server does not interpret the payload; receivers are responsible for rejecting stale and out-of-order snapshots.

Add `movement.js`:

```js
import {
  PlaylinkClient,
  createStateSnapshot,
  StateSnapshotFilter,
  StateSnapshotPublisher,
} from '@playlink/client';

const ROOM_ID = process.argv[2];
if (!ROOM_ID) {
  console.error('usage: node movement.js <room_id>');
  process.exit(1);
}

const client = new PlaylinkClient({ name: 'mover', keepaliveIntervalMs: 5000 });
const filter = new StateSnapshotFilter();

await client.connect();
const join = await client.joinRoom(ROOM_ID, process.argv[3] ?? 'mover');
console.log(`[mover] joined as ${join.player_id}`);

const publisher = new StateSnapshotPublisher({
  client,
  entityId: join.player_id,
  minIntervalMs: 50,   // up to 20 snapshots per second
});

const state = { x: 50, y: 50 };
let lastInput = { dx: 0, dy: 0 };

// Read arrow keys from stdin in raw mode and tick the simulation.
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', (chunk) => {
  const key = chunk.toString();
  if (key === '\u0003') process.exit(0); // Ctrl+C
  if (key.includes('A')) lastInput = { dx: -1, dy: 0 }; // left
  if (key.includes('B')) lastInput = { dx: 1, dy: 0 };  // right
  if (key.includes('A')) lastInput = { dx: -1, dy: 0 }; // up
  if (key.includes('B')) lastInput = { dx: 1, dy: 0 };  // down
  // (terminal raw mode emits CSI sequences; adapt the parsing to your needs)
});

client.on('room_broadcast', (message) => {
  const snapshot = message.payload.data;
  if (!filter.accepts(snapshot)) return;
  if (snapshot.entity_id === join.player_id) return; // ignore self
  console.log(`[mover] remote ${snapshot.entity_id} at (${snapshot.state.x}, ${snapshot.state.y}) tick=${snapshot.tick}`);
});

setInterval(() => {
  state.x = Math.max(0, Math.min(100, state.x + lastInput.dx));
  state.y = Math.max(0, Math.min(100, state.y + lastInput.dy));
  publisher.publish(state);
}, 50);
```

Open the same room from two terminals, run the script in each, and watch positions update.

`StateSnapshotPublisher.publish` is a no-op when:

- `client.roomId` is null (the client is not in a room).
- `now - lastPublishedAt < minIntervalMs` (throttled).
- `!force && !hasChanged(state, lastState)` (no state change).

`StateSnapshotFilter.accepts` returns false when:

- The payload is not a `state_snapshot`.
- `entity_id` is empty or non-string.
- `tick` is not a non-negative safe integer.
- The tick is not strictly greater than the last accepted tick for the same `entity_id`.

This guarantees a stable per-entity view even if snapshots arrive out of order.

## 7. Debugging with the Web Console

While the server is running, open `http://localhost:7777/` in a browser. The console has four tabs:

- **Overview**: health, version, room/player counts, uptime, server metadata.
- **Simulator**: a single WebSocket client with Connect / Create / Join / Send controls. Useful when you want to poke a room from the browser without writing a script.
- **Rooms**: live snapshot of every active room. Click a row to inspect the player list, message count, and `created_at_unix_secs`.
- **Messages**: a log of every sent and received frame on the simulator socket. Look here when a protocol error confuses you.

The console is bilingual (English / 中文) and lives entirely in the Rust binary via `include_dir!`. Refresh data by clicking the refresh button — there is no background polling.

## 7a. A real game: Tank Wars

`examples/js-client/tanks.html` is a complete two-player browser tank game that exercises everything above at once. Run it from the same `examples/js-client` directory as the mini-game:

```bash
npm --prefix examples/js-client run tanks
# → http://127.0.0.1:7780/tanks
```

Open the page in two browser tabs (or two machines on the same LAN), set the WebSocket URL to the host's address, click Connect, then either click Create or paste a shared room id and click Join. Drive with WASD or arrow keys; press Space to fire. Tanks drop to zero HP, respawn 1.5 seconds later, and the score persists for the round.

The demo uses:

- `state_snapshot` for position, angle, and HP at 20 Hz.
- `room_message` for `bullet` and `hit` events.
- `StateSnapshotFilter` to ignore stale or out-of-order snapshots.
- The full `PlaylinkClient` lifecycle: connect, createRoom, joinRoom, leaveRoom, automatic rejoin after reconnect.

Read `tanks.js` next to `docs/TUTORIAL.md` for the full source. It is the recommended starting point when you want to build a non-trivial game on the framework.

## 8. Talking to the server without the SDK

If you want to drive the protocol by hand (e.g., from a custom engine), the wire format is JSON over WebSocket:

```text
→ {"type":"create_room","payload":{"room_name":"demo","max_players":4}}
← {"type":"room_created","payload":{"room_id":"..."}}

→ {"type":"join_room","payload":{"room_id":"...","player_name":"alice"}}
← {"type":"room_joined","payload":{"room_id":"...","player_id":"..."}}
← {"type":"player_joined","payload":{"player_id":"...","player_name":"..."}}

→ {"type":"room_message","payload":{"data":{"text":"hi"}}}
← {"type":"room_broadcast","payload":{"from":"<alice-id>","data":{"text":"hi"}}}

→ {"type":"ping"}
← {"type":"pong"}
```

Every client request may include `"id": "<your-correlation-id>"`; the server echoes the same id on the response. See `docs/protocol.md` for the complete message catalog and `docs/CLIENT_GUIDE.md` for a Rust walkthrough.

## 9. Production deployment

When you stop developing and start hosting, the server has one mode switch to flip:

```bash
PLAYLINK_MODE=prod \
PLAYLINK_ALLOWED_ORIGINS="https://your-game.example,https://admin.example" \
PLAYLINK_PUBLIC_HTTP_URL="https://playlink.your-game.example" \
PLAYLINK_PUBLIC_WS_URL="wss://playlink.your-game.example/ws" \
PLAYLINK_LAN_DISCOVERY=0 \
rustup run stable cargo run --release
```

What this changes:

- **Origin enforcement**: only WebSocket upgrades from the listed `Origin` headers pass. This blocks cross-site WebSocket hijacking (CSWSH).
- **No wildcard CORS**: the HTTP layer requires the same origins for CORS. Browsers from other origins cannot connect.
- **`/api/server` advertises the public URLs**: SDK clients can read `public_ws_url` and `public_http_url` and never need to know the bind address.
- **LAN discovery is off by default**: do not expose it on a public server.

The hardening pass also added:

- `PLAYLINK_MAX_FRAME_BYTES` and `PLAYLINK_MAX_MESSAGE_BYTES` for independent frame and message size caps (16 KiB / 1 MiB defaults).
- `PLAYLINK_MAX_CONNECTIONS` (default 256) and `PLAYLINK_MAX_CONNECTIONS_PER_IP` (default 8).
- `PLAYLINK_MESSAGE_BURST` and `PLAYLINK_MESSAGE_RATE_PER_SEC` (default 30 / 30) for the per-session token bucket.
- Graceful shutdown: on SIGINT/SIGTERM, the server stops accepting new connections, broadcasts a shutdown signal to active sockets, and waits for in-flight requests to finish.
- `room_closed` event (v1.1 additive) for the last remaining subscriber when a room is torn down.

A reasonable starting set for a public-facing deployment:

```bash
PLAYLINK_MODE=prod
PLAYLINK_ALLOWED_ORIGINS="https://your-game.example"
PLAYLINK_PUBLIC_HTTP_URL="https://playlink.your-game.example"
PLAYLINK_PUBLIC_WS_URL="wss://playlink.your-game.example/ws"
PLAYLINK_MAX_FRAME_BYTES=65536           # 64 KiB if you ship larger state
PLAYLINK_MAX_MESSAGE_BYTES=4194304      # 4 MiB
PLAYLINK_MAX_CONNECTIONS=2048
PLAYLINK_MAX_CONNECTIONS_PER_IP=16
PLAYLINK_MESSAGE_BURST=60
PLAYLINK_MESSAGE_RATE_PER_SEC=60
PLAYLINK_SESSION_IDLE_TIMEOUT_SECS=60
PLAYLINK_CLEANUP_INTERVAL_SECS=30
```

Run behind a TLS-terminating reverse proxy (nginx, Caddy, Cloudflare). Playlink does not implement TLS itself.

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Error: alice failed to connect to ws://...` | Server not running, or wrong port | `curl http://localhost:7777/health` to confirm. |
| `Origin not allowed` on WebSocket upgrade | `PLAYLINK_MODE=prod` with no matching `PLAYLINK_ALLOWED_ORIGINS` | Set the env var, or use `dev` mode for local. |
| `room_full` immediately | The room you joined is at capacity | Have the host create a new room or bump `max_players`. |
| `event_lagged` keeps firing | Your consumer is slower than the producer | Reduce publish rate, increase `keepaliveIntervalMs` is unrelated — fix the consumer. |
| Connection closes after 30 s with no traffic | Idle timeout | The SDK auto-pings; if you disabled it, send a `ping` every <30 s. |
| Frame cap rejections | JSON message >16 KiB | Set `PLAYLINK_MAX_FRAME_BYTES` to the new size, or split the message into multiple room messages. |
| CORS errors in browser console | Browser origin not in `PLAYLINK_ALLOWED_ORIGINS` (prod mode) | Add the origin. |

## 11. Where to go next

- `docs/protocol.md` — the wire contract, in detail.
- `docs/js-client-api.md` — the v1.x JavaScript helper reference.
- `docs/CLIENT_GUIDE.md` — write a Playlink client in Rust.
- `docs/sync-models.md` — when to reach for state sync vs. event sync vs. (future) lockstep.
- `docs/relay-metadata.md` — what relay mode would look like (not yet implemented).
- `packages/js-sdk/README.md` — the published SDK README.
- `examples/js-client/` — runnable smoke, errors, sdk-demo, state-sync, idle-timeout, discover-lan, mini-game scripts.
- `examples/godot-client/` — the GDScript PlaylinkClient autoload and example scene.
- `web-console/` — embedded debug console (visit `http://localhost:7777/`).

When you have built something, run the full verification suite locally before opening a PR:

```powershell
.\scripts\verify.ps1
```

That script runs `cargo fmt --check`, `cargo check`, `cargo test`, every JS file through `node --check`, the SDK unit tests via `npm test`, and the live integration tests (smoke, errors, sdk-demo) against a freshly spawned server.
