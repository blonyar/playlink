# Playlink JavaScript Client API

`examples/js-client/playlink-client.js` exports a small example-oriented helper named `PlaylinkClient`.

It wraps the current WebSocket JSON protocol without hiding the protocol shape. It is intended for examples and prototypes, not yet a published npm package.

## 1. Runtime Requirements

The examples expect:

- Node.js 20 or newer for built-in `fetch` and `WebSocket`
- or a modern browser with `fetch` and `WebSocket`

## 2. Import

```js
import { PlaylinkClient } from './playlink-client.js';
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

## 4. State Fields

The helper exposes a few fields for examples:

| Field | Description |
| --- | --- |
| `socket` | Active `WebSocket`, or `null`. |
| `playerId` | Current player ID after `joinRoom()`, or `null`. |
| `roomId` | Current room ID after `joinRoom()`, or `null`. |
| `messages` | Bounded recent message history. |

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
- `roomId` and `playerId` are cleared

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

### `ping()`

Sends a request/response protocol ping.

```js
await client.ping();
```

Expected response: `pong`.

## 8. HTTP Helper Methods

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

## 9. Low-Level Methods

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

## 10. Event Helpers

### `on(type, handler)`

Registers an event handler and returns an unsubscribe function.

```js
const off = client.on('room_broadcast', (message) => {
  console.log(message.payload);
});

// later
off();
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

## 11. Errors

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

## 12. Minimal Example

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

## 13. Compatibility Notes

This helper follows the current JSON protocol documented in `docs/protocol.md`.

Future SDK changes should prefer additive behavior and preserve raw protocol compatibility wherever possible.
