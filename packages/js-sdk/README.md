# @playlink/client

Zero-dependency JavaScript client for the [Playlink](https://github.com/blonyar/playlink) WebSocket room protocol.

Playlink is a small modular networking framework for 2–8 player room-based games. The `@playlink/client` package wraps the JSON protocol documented in [`docs/protocol.md`](https://github.com/blonyar/playlink/blob/main/docs/protocol.md) and adds the small ergonomic surface (reconnect, request/response correlation, state snapshot helpers) that the example clients already use.

## Install

```bash
npm install @playlink/client
```

Requires Node.js 20+ (for built-in `fetch` and `WebSocket`) or any modern browser.

## Usage

```js
import { PlaylinkClient, createStateSnapshot } from '@playlink/client';

const alice = new PlaylinkClient({ name: 'alice' });
await alice.connect();

const roomId = await alice.createRoom({ roomName: 'demo', maxPlayers: 4 });
await alice.joinRoom(roomId, 'alice');

alice.on('room_broadcast', (message) => {
  console.log(`${message.payload.from} said:`, message.payload.data);
});

alice.sendRoomMessage({ kind: 'chat', text: 'hello' });
```

## API

| Export | Description |
| --- | --- |
| `PlaylinkClient` | Connection lifecycle, request/response, room methods, auto-reconnect, auto-rejoin, message queue, member tracking. |
| `createStateSnapshot` | Build a snapshot payload in the v0.9 state-sync convention. |
| `StateSnapshotFilter` | Drop duplicate, stale, and out-of-order snapshots per `entity_id`. |
| `StateSnapshotPublisher` | Publish snapshots with monotonic ticks, minimum send interval, and shallow change detection. |
| `PROTOCOL_VERSION` | The wire-protocol API version this client targets (matches the `api_version` field on the server's `/api/server` response). |
| `ERROR_CODES` | Frozen map of canonical protocol error codes. |
| `ProtocolError` | Error class thrown when a server `error` response matches a pending request. |
| `DEFAULT_WS_URL` / `DEFAULT_HTTP_URL` | Default endpoints used when no options or `PLAYLINK_WS_URL` / `PLAYLINK_HTTP_URL` environment variables are set. |

### Constructor options

| Option | Default | Description |
| --- | --- | --- |
| `name` | `'player'` | Used for request IDs and default player name. |
| `wsUrl` | `PLAYLINK_WS_URL` or `ws://localhost:7777/ws` | WebSocket endpoint. |
| `httpUrl` | `PLAYLINK_HTTP_URL` or `http://localhost:7777` | HTTP API base URL. |
| `log` | `null` | Optional logger for sent/received messages. |
| `keepaliveIntervalMs` | `10000` | Sends protocol `ping` messages periodically. Set `0` or `null` to disable. |
| `reconnect` | `true` | Auto-reconnect on unexpected disconnect. |
| `maxReconnectAttempts` | `10` | Maximum reconnection attempts before giving up. |
| `reconnectBaseDelayMs` | `1000` | Initial reconnect delay. Doubles with each attempt plus 30% jitter. |
| `rejoinOnReconnect` | `true` | After reconnect, rejoin the last room the client was in. |

### Connection lifecycle

```js
await client.connect();          // opens the socket and starts keepalive
client.close();                   // intentional close, no auto-reconnect
client.state;                     // 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
```

### Room methods

```js
const roomId = await client.createRoom({ roomName: 'lobby', maxPlayers: 4 });
await client.joinRoom(roomId, 'alice');
await client.leaveRoom();
client.sendRoomMessage({ kind: 'chat', text: 'hello' });
```

### Events

```js
const off = client.on('room_broadcast', (message) => { /* ... */ });
off();                            // unsubscribe

client.on('state_change', (state) => { /* ... */ });
client.on('reconnected', () => { /* ... */ });
client.on('rejoined', (payload) => { /* ... */ });
client.on('rejoin_failed', (error) => { /* ... */ });
client.on('error', (message) => { /* server-side error */ });
```

### State sync helpers

```js
import { createStateSnapshot, StateSnapshotFilter, StateSnapshotPublisher } from '@playlink/client';

const snapshot = createStateSnapshot({ tick: 1, entityId: alice.playerId, state: { x: 10, y: 20 } });
alice.sendRoomMessage(snapshot);

const filter = new StateSnapshotFilter();
client.on('room_broadcast', (message) => {
  if (filter.accepts(message.payload.data)) {
    // fresh snapshot
  }
});

const publisher = new StateSnapshotPublisher({ client: alice, entityId: alice.playerId });
publisher.publish({ x: 11, y: 20 });
```

## Errors

`request()` rejects with a `ProtocolError` when the server responds with an `error` envelope. The thrown error has a `code` property holding the protocol code (`'not_in_room'`, `'room_full'`, etc.) and a `message` property holding the server's human-readable text.

```js
import { ProtocolError, ERROR_CODES } from '@playlink/client';

try {
  await client.joinRoom('not-a-uuid', 'alice');
} catch (error) {
  if (error instanceof ProtocolError) {
    console.log(error.code === ERROR_CODES.INVALID_ROOM_ID);
  }
}
```

## License

MIT. See [LICENSE](./LICENSE).
