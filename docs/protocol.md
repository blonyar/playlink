# Playlink Protocol v0.3

Playlink v0.3 uses JSON messages over WebSocket. The default WebSocket endpoint is:

```text
ws://localhost:7777/ws
```

The protocol is designed for small room-based multiplayer prototypes. It is intentionally simple: create a room, join it, send room messages, leave, and inspect state through the debug API.

## 1. Message Envelope

Every client message has a `type` and optional `payload`.

Clients may also include an optional `id` field for request/response correlation:

```json
{
  "id": "req-1",
  "type": "join_room",
  "payload": {
    "room_id": "00000000-0000-0000-0000-000000000000",
    "player_name": "kang"
  }
}
```

When a server response is directly caused by a client request, the server echoes the same `id`:

```json
{
  "id": "req-1",
  "type": "room_joined",
  "payload": {
    "room_id": "00000000-0000-0000-0000-000000000000",
    "player_id": "11111111-1111-1111-1111-111111111111"
  }
}
```

Room events such as `player_joined`, `player_left`, and `room_broadcast` are broadcast events and usually do not include `id`.

## 2. Client Messages

### `create_room`

Creates a room.

```json
{
  "type": "create_room",
  "payload": {
    "room_name": "test",
    "max_players": 4
  }
}
```

Payload fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `room_name` | string | no | Defaults to `Untitled Room` |
| `max_players` | number | no | Clamped to server config |

Response: `room_created`.

### `join_room`

Joins an existing room.

```json
{
  "type": "join_room",
  "payload": {
    "room_id": "00000000-0000-0000-0000-000000000000",
    "player_name": "kang"
  }
}
```

Payload fields:

| Field | Type | Required |
| --- | --- | --- |
| `room_id` | UUID string | yes |
| `player_name` | string | yes |

Response: `room_joined`.

If the session is already in a room, `join_room` returns `already_in_room`. Clients should explicitly send `leave_room` before joining another room.

### `leave_room`

Leaves the current room.

```json
{
  "type": "leave_room"
}
```

On success, the server removes the player from the current room but does not send a dedicated success acknowledgement. Clients should clear their local current-room state after sending `leave_room` successfully.

If the session is not in a room, the server returns `not_in_room`.

### `room_message`

Broadcasts arbitrary JSON payload to the current room.

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

If the session has not joined a room, the server returns `not_in_room`.

### `ping`

Keeps the WebSocket session alive.

```json
{
  "type": "ping"
}
```

Response: `pong`.

## 3. Server Messages

### `error`

All protocol errors use a structured error payload.

```json
{
  "type": "error",
  "payload": {
    "code": "room_not_found",
    "message": "Room not found"
  }
}
```

### `room_created`

```json
{
  "type": "room_created",
  "payload": {
    "room_id": "00000000-0000-0000-0000-000000000000"
  }
}
```

### `room_joined`

```json
{
  "type": "room_joined",
  "payload": {
    "room_id": "00000000-0000-0000-0000-000000000000",
    "player_id": "11111111-1111-1111-1111-111111111111"
  }
}
```

### `player_joined`

Broadcast when a player joins a room.

```json
{
  "type": "player_joined",
  "payload": {
    "player_id": "11111111-1111-1111-1111-111111111111",
    "player_name": "kang"
  }
}
```

### `player_left`

Broadcast when a player leaves a room.

```json
{
  "type": "player_left",
  "payload": {
    "player_id": "11111111-1111-1111-1111-111111111111"
  }
}
```

### `room_broadcast`

Broadcast room data sent by a client.

```json
{
  "type": "room_broadcast",
  "payload": {
    "from": "11111111-1111-1111-1111-111111111111",
    "data": {
      "text": "hello"
    }
  }
}
```

### `event_lagged`

Sent when the server detects that this client missed room events because it was too slow to receive them.

```json
{
  "type": "event_lagged",
  "payload": {
    "skipped": 12
  }
}
```

### `pong`

```json
{
  "type": "pong"
}
```

## 4. Error Codes

| Code | Meaning | Retryable |
| --- | --- | --- |
| `invalid_message` | JSON shape or required fields are invalid | no |
| `room_not_found` | Target room does not exist | no |
| `room_full` | Target room is at capacity | maybe |
| `not_in_room` | Operation requires an active room session | no |
| `already_in_room` | Session must leave current room before joining another | no |
| `invalid_room_id` | Room id format is invalid | no |
| `message_too_large` | Incoming message exceeds configured byte limit | no |
| `rate_limited` | Reserved for future traffic throttling; not currently emitted | yes |
| `internal_error` | Server-side unexpected error | maybe |

## 5. Room Lifecycle

```text
create_room  → room_created
join_room    → room_joined + player_joined event
room_message → room_broadcast event
leave_room   → player_left event for other room members
last player leaves/disconnects → room is deleted
```

Current behavior:

- Empty rooms are cleaned up immediately after the last player leaves or disconnects.
- A successful `leave_room` has no dedicated acknowledgement message in v0.3; remaining room members receive `player_left`.
- A client can be in at most one room.
- Joining another room requires an explicit `leave_room` first.
- Server state is in-memory only. Restarting the server deletes all rooms.

## 6. Heartbeat and Idle Timeout

The server disconnects idle WebSocket sessions after `PLAYLINK_SESSION_IDLE_TIMEOUT_SECS` seconds. The default is 30 seconds.

Clients should send `ping` periodically and expect `pong`.

## 7. Ordering Guarantees

Within one room, events are sent through a Tokio broadcast channel. The server preserves event order for events received by a client. If a client falls too far behind, old events may be skipped and the client receives `event_lagged`.

## 8. Compatibility Policy

v0.3 stabilizes the current JSON message names and structured error shape. Future changes should prefer additive fields and new message types over breaking existing fields.
