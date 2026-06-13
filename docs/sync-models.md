# Playlink Sync Models

Playlink starts with event sync: clients send room messages and the server broadcasts them to room members.

This document outlines future sync models without committing the current server core to a heavy simulation architecture.

## 1. Goals

Sync features should help small room-based games choose the simplest model that works:

- event sync for turns, chat, cards, and low-frequency actions
- state sync for lightweight movement and co-op prototypes
- lockstep for deterministic input exchange
- server-authoritative sync for later validation-heavy games

The goal is modularity, not one universal game networking model.

## 2. Guardrails

- Keep raw room messages usable.
- Do not add game-specific simulation to `RoomRegistry`.
- Do not require a database or account system.
- Keep sync modules optional.
- Prefer examples and SDK helpers before changing the core protocol.
- Keep early prototypes understandable from the Web Debug Console.

## 3. Event Sync

Current default.

Clients send gameplay events as room messages:

```json
{
  "type": "room_message",
  "payload": {
    "data": {
      "kind": "play_card",
      "card_id": "c-12"
    }
  }
}
```

Server broadcasts:

```json
{
  "type": "room_broadcast",
  "payload": {
    "from": "player-id",
    "data": {
      "kind": "play_card",
      "card_id": "c-12"
    }
  }
}
```

Best for:

- chat
- turn-based games
- card and board games
- lobby interactions
- low-frequency party game actions

Strengths:

- simple
- inspectable
- already implemented
- works well with JSON

Limitations:

- clients must interpret ordering and state
- no built-in reconciliation
- no authority/validation beyond room membership

## 4. State Sync

Clients or a server authority publish state snapshots.

Example payload:

```json
{
  "kind": "state_snapshot",
  "tick": 120,
  "players": {
    "alice": { "x": 42, "y": 18 },
    "bob": { "x": 50, "y": 20 }
  }
}
```

Best for:

- lightweight 2D movement
- co-op prototypes
- shared cursors
- simple physics-free action games

Possible future support:

- SDK helper for snapshot throttling
- example interpolation utilities
- optional sequence/tick conventions
- mini-game state-sync example mode

Avoid initially:

- authoritative physics
- rollback netcode
- large world replication
- entity component replication framework

## 5. Lockstep

Clients exchange deterministic input frames.

Example payload:

```json
{
  "kind": "input_frame",
  "frame": 42,
  "input": {
    "left": false,
    "right": true,
    "action": false
  }
}
```

Best for:

- deterministic board/strategy games
- some small RTS-like experiments
- simulations where all clients can run the same deterministic logic

Requirements:

- deterministic simulation
- input delay handling
- late/missing input strategy
- clear frame clock

Lockstep should be a later module because it imposes strong game constraints.

## 6. Server-Authoritative Sync

The server validates or owns game state.

Best for:

- games needing validation
- public online rooms
- cheating-sensitive actions
- server-owned world state

This is valuable later, but it is not the current core.

Future server-authoritative support should probably live outside `RoomRegistry`, for example:

```text
room core -> sync module -> game-specific authority adapter
```

Do not turn the base room server into a game engine.

## 7. Suggested v0.9 Direction

Recommended next sync milestone after v0.7 relay groundwork:

```text
v0.9 lightweight state sync prototype plan
```

In scope:

- document state sync conventions
- add SDK/demo-side throttling examples
- improve mini-game movement docs
- optionally add a second mini-game mode that sends structured state snapshots

The current v0.9 plan lives at `docs/v0.9-state-sync-prototype-plan.md`.

Out of scope:

- server-authoritative simulation
- rollback
- physics replication
- ECS replication
- binary protocol requirement

## 8. Protocol Strategy

Do not add new core protocol messages immediately.

Prefer conventions inside `room_message.data` first:

```json
{
  "kind": "move",
  "x": 54,
  "y": 50
}
```

Then evolve toward documented optional conventions:

```json
{
  "kind": "state_snapshot",
  "tick": 123,
  "entities": {}
}
```

Only add new protocol messages when conventions are clearly insufficient.

## 9. Testing Strategy

For sync examples:

- keep JavaScript syntax checks
- add deterministic helper tests where possible
- run SDK demo and smoke tests after helper changes
- manually verify mini-game behavior in a browser when UI changes

Potential future checks:

```bash
npm --prefix examples/js-client run sdk-demo
npm --prefix examples/js-client run mini-game
```

Manual checks remain acceptable for browser rendering until a browser test harness exists.

## 10. Open Questions

- Should state sync conventions be documented in `docs/protocol.md` or a separate SDK guide?
- Should the JS helper expose throttling utilities?
- Should the mini-game send absolute positions only, or include velocity/tick metadata?
- Should room broadcasts eventually include server receive timestamps?
- How much should the Web Debug Console understand game-shaped messages?

These questions should be answered through small examples before core protocol changes.
