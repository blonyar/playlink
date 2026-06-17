# Playlink JavaScript Client API

`examples/js-client/playlink-client.js` exports a small example-oriented helper named `PlaylinkClient`.

It wraps the current WebSocket JSON protocol without hiding the protocol shape. It is intended for examples and prototypes, not yet a published npm package.

For the v1.0 baseline, this document is the helper API contract for examples. The file can still change internally, but documented exports, method names, option names, state fields, protocol shapes, and error behavior should change only additively.

## 1. Runtime Requirements

The examples expect:

- Node.js 20 or newer for built-in `fetch` and `WebSocket`
- or a modern browser with `fetch` and `WebSocket`

## 2. Import

```js
import {
  PlaylinkClient,
  createStateSnapshot,
  StateSnapshotFilter,
  StateSnapshotPublisher,
} from './playlink-client.js';
```

## 3. Constructor

```js
const client = new PlaylinkClient({
  name: 'alice',
  wsUrl: 'ws://localhost:7777/ws',
  httpUrl: 'http://localhost:7777',
  log: console.log,
  keepaliveIntervalMs: 10000,
});
```

Options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | string | `'player'` | Used for request IDs and default player name. |
| `wsUrl` | string | `PLAYLINK_WS_URL` or `ws://localhost:7777/ws` | WebSocket endpoint. |
| `httpUrl` | string | `PLAYLINK_HTTP_URL` or `http://localhost:7777` | HTTP API base URL. |
| `log` | function or null | `null` | Optional logger for sent/received messages. |
| `keepaliveIntervalMs` | number or null | `10000` | Sends protocol `ping` messages periodically while connected. Use `0` or `null` to disable. |
| `reconnect` | boolean | `true` | Auto-reconnect on unexpected disconnect. Set to `false` to disable. |
| `maxReconnectAttempts` | number | `10` | Maximum reconnection attempts before giving up. |
| `reconnectBaseDelayMs` | number | `1000` | Initial delay before first reconnect attempt. Delay doubles with each attempt (exponential backoff with 30% random jitter). |
| `rejoinOnReconnect` | boolean | `true` | After a successful reconnect, automatically rejoin the previous room. The client stores the last room ID and player name on `joinRoom()`. |

## 4. State Fields

The helper exposes fields for examples and apps:

| Field | Description |
| --- | --- |
| `socket` | Active `WebSocket`, or `null`. |
| `playerId` | Current player ID after `joinRoom()`, or `null`. |
| `roomId` | Current room ID after `joinRoom()`, or `null`. |
| `messages` | Bounded recent message history (max 200). |
| `members` | Array of `{ id, name }` objects for current room members. Updated automatically from `player_joined`/`player_left` events. |
| `state` | Connection state: `PlaylinkClient.CONNECTING`, `PlaylinkClient.CONNECTED`, `PlaylinkClient.DISCONNECTED`, or `PlaylinkClient.RECONNECTING`. |

These fields are intentionally simple for examples. A future packaged SDK may formalize or hide them.

## 5. Connection Methods

### `connect(timeoutMs = 5000)`

Opens the WebSocket connection and starts keepalive.

```js
await client.connect();
```

Behavior:

- resolves with `this` after the socket opens
- rejects if connection times out or emits an error before open
- returns immediately if the current socket is already open

### `close()`

Stops keepalive and closes the WebSocket.

```js
client.close();
```

When the socket closes:

- keepalive stops
- pending requests reject
- `roomId`, `playerId`, and `members` are cleared
- auto-reconnect is **not** triggered (this is an intentional close)

## 6. Room Lifecycle Methods

### `createRoom({ roomName, maxPlayers } = {})`

Creates a room and returns the room ID.

```js
const roomId = await client.createRoom({
  roomName: 'demo',
  maxPlayers: 4,
});
```

Protocol message:

```json
{
  "type": "create_room",
  "payload": {
    "room_name": "demo",
    "max_players": 4
  }
}
```

Expected response: `room_created`.

### `joinRoom(roomId, playerName = this.name)`

Joins a room and stores `roomId` and `playerId` locally.

```js
const joined = await client.joinRoom(roomId, 'alice');
console.log(joined.room_id, joined.player_id);
```

Expected response: `room_joined`.

### `leaveRoom()`

Leaves the current room and waits for the `room_left` acknowledgement.

```js
const left = await client.leaveRoom();
console.log(left.room_id);
```

Expected response:

```json
{
  "type": "room_left",
  "payload": {
    "room_id": "..."
  }
}
```

After success, `client.roomId` is cleared.

If the session is not in a room, the returned promise rejects with `error.code === 'not_in_room'`.

## 7. Messaging Methods

### `sendRoomMessage(data)`

Broadcasts arbitrary JSON data to the current room.

```js
client.sendRoomMessage({
  kind: 'move',
  x: 3,
  y: 7,
});
```

Expected room event for room members: `room_broadcast`.

If the WebSocket is not currently open (e.g., during reconnection), the message data is queued and sent automatically once the connection is restored.

### `ping()`

Sends a request/response protocol ping.

```js
await client.ping();
```

Expected response: `pong`.

## 8. State Sync Helpers

State sync is an example-side convention layered on top of ordinary `room_message` broadcasts. The Playlink server does not interpret these payloads.

### `createStateSnapshot({ tick, entityId, state })`

Builds a state snapshot payload:

```js
const snapshot = createStateSnapshot({
  tick: 1,
  entityId: alice.playerId,
  state: { x: 54, y: 50 },
});

alice.sendRoomMessage(snapshot);
```

Output shape:

```json
{
  "kind": "state_snapshot",
  "tick": 1,
  "entity_id": "player-id",
  "state": {
    "x": 54,
    "y": 50
  }
}
```

### `StateSnapshotFilter`

Filters stale snapshots per `entity_id` using the highest accepted `tick`.

```js
const filter = new StateSnapshotFilter();

client.on('room_broadcast', (message) => {
  const snapshot = message.payload.data;
  if (filter.accepts(snapshot)) {
    console.log(snapshot.entity_id, snapshot.state);
  }
});
```

### `StateSnapshotPublisher`

Publishes snapshots with monotonic ticks, shallow state-change detection, and a minimum send interval.

```js
const publisher = new StateSnapshotPublisher({
  client: alice,
  entityId: alice.playerId,
  minIntervalMs: 50,
});

publisher.publish({ x: 54, y: 50 });
publisher.publish({ x: 55, y: 50 }, { force: true });
```

Use this for lightweight movement/shared-cursor examples. It is not server-authoritative state validation.

## 9. HTTP Helper Methods

### `listRooms()`

Fetches `/api/rooms`.

```js
const rooms = await client.listRooms();
```

### `serverInfo()`

Fetches `/api/server`.

```js
const server = await client.serverInfo();
```

### `fetchStats()`

Fetches `/api/stats`.

```js
const stats = await client.fetchStats();
console.log(stats.uptime_seconds, stats.room_count, stats.player_count);
```

## 10. Low-Level Methods

### `request(type, payload = undefined, timeoutMs = 5000)`

Sends a protocol message with an `id` and waits for the matching response.

```js
const response = await client.request('ping');
```

Behavior:

- creates an ID like `alice-1`
- stores a pending request
- resolves on matching response ID
- rejects if the matching response is `error`
- rejects on timeout
- rejects pending requests if the socket closes

### `send(message)`

Sends a raw protocol JSON message.

```js
client.send({
  type: 'room_message',
  payload: { data: { text: 'hello' } },
});
```

Throws if the socket is not open.

## 11. Event Helpers

### `on(type, handler)`

Registers an event handler and returns an unsubscribe function.

```js
const off = client.on('room_broadcast', (message) => {
  console.log(message.payload);
});

// later
off();
```

Protocol message events:

| Event type | Trigger |
| --- | --- |
| `room_created` | Room created by this client. |
| `room_joined` | This client joined a room. |
| `room_left` | This client left a room. |
| `player_joined` | A player joined the room. |
| `player_left` | A player left the room. |
| `room_broadcast` | Room message broadcast. |
| `pong` | Server ping response. |
| `event_lagged` | Room events were skipped. |
| `error` | Protocol error. |

Lifecycle events:

| Event type | Trigger |
| --- | --- |
| `reconnected` | Fired after a successful auto-reconnect (before rejoin attempt). |
| `rejoined` | Fired after auto-rejoin succeeds. Receives `{ room_id, player_id }`. |
| `rejoin_failed` | Fired when auto-rejoin fails (e.g., room was removed). Receives an `Error`. |
| `state_change` | Fired on every connection state change. Receives the new state string. |

```js
client.on('reconnected', () => {
  console.log('connection restored');
});

client.on('rejoined', (payload) => {
  console.log('rejoined room', payload.room_id);
});

client.on('rejoin_failed', (error) => {
  console.log('could not rejoin room:', error.message);
});

client.on('state_change', (newState) => {
  console.log('state:', newState);
});
```

### `waitFor(type, predicate = () => true, timeoutMs = 5000)`

Waits for a message type and optional predicate.

```js
const joined = await client.waitFor(
  'player_joined',
  (message) => message.payload.player_name === 'bob',
);
```

Behavior:

- checks existing message history first
- waits for future messages if no existing match is found
- rejects on timeout

## 12. Errors

Server protocol errors reject matching requests with a JavaScript `Error` whose `code` property is set to the protocol error code.

Example:

```js
try {
  await client.joinRoom('not-a-room', 'alice');
} catch (error) {
  console.log(error.code); // e.g. room_not_found or invalid_room_id
  console.log(error.message);
}
```

Current protocol error codes include:

- `invalid_message`
- `room_not_found`
- `room_full`
- `not_in_room`
- `already_in_room`
- `invalid_room_id`
- `message_too_large`
- `rate_limited`
- `internal_error`

## 13. Minimal Example

```js
import { PlaylinkClient } from './playlink-client.js';

const alice = new PlaylinkClient({ name: 'alice' });
const bob = new PlaylinkClient({ name: 'bob' });

await alice.connect();
await bob.connect();

const roomId = await alice.createRoom({ roomName: 'demo', maxPlayers: 4 });
const aliceJoin = await alice.joinRoom(roomId, 'alice');
await bob.joinRoom(roomId, 'bob');

alice.sendRoomMessage({ kind: 'chat', text: 'hello' });

await bob.waitFor(
  'room_broadcast',
  (message) => message.payload.from === aliceJoin.player_id,
);

await bob.leaveRoom();

alice.close();
bob.close();
```

## 14. Compatibility Notes

This helper follows the current JSON protocol documented in `docs/protocol.md`.

Future SDK changes should prefer additive behavior and preserve raw protocol compatibility wherever possible. A future published SDK may wrap or reorganize this helper, but v1.0 examples should keep the documented `PlaylinkClient`, `createStateSnapshot`, `StateSnapshotFilter`, and `StateSnapshotPublisher` contracts working.
