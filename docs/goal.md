# Playlink Long-Term Goal

## 1. North Star

Playlink should become a modular multiplayer networking framework for small games, prototypes, LAN parties, and room-based online play.

The long-term target is not an MMO backend or a monolithic game platform. The target is a clean framework where a developer can start simple and gradually choose only the networking modules they need:

```text
small game -> Playlink room core -> transport -> topology -> sync mode -> SDK/example workflow
```

## 2. Guardrails

Every milestone should preserve these constraints:

- Keep the room-based multiplayer loop working at all times.
- Prefer optional modules over required core dependencies.
- Keep raw WebSocket + JSON protocol usable even as SDKs improve.
- Avoid accounts, global matchmaking, anti-cheat, databases, and MMO-scale systems until the small-room framework is mature.
- Add extension points before adding heavy implementations.
- Make each change testable with Rust checks, JavaScript checks, or repeatable scripts.

## 3. Current Baseline

Completed or mostly completed:

- v0.1 dedicated WebSocket room server
- v0.2 Web Debug Console
- v0.3 protocol and room reliability
- v0.4 host metadata and optional LAN discovery prototype
- v0.5 JavaScript helper and example game workflow
- v0.6 JavaScript helper stabilization and API docs
- v0.7 relay groundwork plan
- v0.8 observability and room stats

Current implementation includes:

- Rust Axum server
- WebSocket JSON protocol
- create, join, leave, inspect, and list rooms
- room message broadcast
- structured errors
- `room_left` acknowledgement
- player sessions and idle cleanup
- Web Debug Console with server stats dashboard
- server metadata endpoint
- server stats endpoint (`/api/stats`) with uptime, room/player counts, and cumulative counters
- room snapshots with `created_at_unix_secs` and `message_count`
- optional UDP LAN discovery
- JavaScript helper, smoke/error/discovery scripts, SDK demo, and mini-game example
- JavaScript client API documentation
- relay groundwork planning document

## 4. Work Threads

Use parallel work threads conceptually, but commit atomically.

### Thread A: Core Room Reliability

Purpose: make room/session behavior boring, predictable, and safe.

Responsibilities:

- room lifecycle invariants
- player membership checks
- leave/disconnect cleanup
- message size and future rate limits
- room event lag handling
- tests for edge cases

Rules:

- No topology-specific logic in `RoomRegistry`.
- No game-specific simulation in the room core.
- Every behavior change needs a Rust test or integration script.

### Thread B: Protocol Stability

Purpose: keep the wire protocol stable enough for SDKs.

Responsibilities:

- `docs/protocol.md`
- request/response correlation
- structured errors
- additive message evolution
- compatibility notes

Rules:

- Prefer new fields or new message types over breaking payload shapes.
- Document protocol changes in the same commit as code changes.
- Keep examples copy-pasteable.

### Thread C: Transport and Topology

Purpose: add connection modes without destabilizing the room server.

Responsibilities:

- WebSocket transport hardening
- host mode metadata
- LAN discovery
- future relay mode
- future P2P/NAT traversal experiments

Rules:

- Discovery finds servers; it does not replace the room protocol.
- Relay and P2P must remain optional modules.
- Do not introduce global matchmaking as part of relay groundwork.

### Thread D: SDK and Examples

Purpose: make Playlink easy for small game prototypes to consume.

Responsibilities:

- JavaScript helper API
- SDK-style examples
- browser mini-game workflow
- future Godot/Unity/Rust client experiments
- client-side docs

Rules:

- Examples should teach the protocol, not hide it completely.
- Keep package publishing separate from helper design until the API stabilizes.
- Example games should stay small and inspectable.

### Thread E: Admin and Developer Experience

Purpose: make the server easy to inspect and debug.

Responsibilities:

- Web Debug Console
- room inspection
- server metadata display
- logs and diagnostics
- future metrics

Rules:

- The console is a development/debug tool, not a production admin system.
- Do not add auth/permissions unless the admin surface becomes deployable beyond local/dev use.

### Thread F: Documentation and Roadmap

Purpose: keep project direction explicit.

Responsibilities:

- stage plans
- roadmap updates
- design docs
- acceptance checklists
- release notes later

Rules:

- Every milestone needs a short plan before implementation.
- Update checklists when work is completed.
- Keep README aligned with implemented behavior.

## 5. Recently Completed Milestone: v0.8 Observability

v0.8 adds a lightweight observability vertical slice so the room server is easier to inspect.

Why:

- v0.6 already stabilized the JS helper and API docs.
- v0.7 defined relay groundwork boundaries.
- Stats make the current room server easier to debug for small multiplayer prototypes.

### v0.8 Scope

In scope:

- In-memory server stats (`uptime_seconds`, `room_count`, `player_count`, `total_rooms_created`, `total_messages_broadcast`).
- `GET /api/stats` endpoint.
- Per-room `created_at_unix_secs` and `message_count`.
- Web Console displays stats and per-room metadata.
- JavaScript smoke test verifies stats behavior.
- README and demo docs mention the stats endpoint.

Out of scope:

- Prometheus/OpenTelemetry integration
- metrics persistence
- historical charts
- relay runtime
- P2P/NAT traversal

### v0.8 Acceptance Criteria

- [x] `docs/v0.8-observability-plan.md` exists.
- [x] `GET /api/stats` returns uptime, active room count, active player count, total rooms created, and total messages broadcast.
- [x] Room snapshots include `created_at_unix_secs` and `message_count`.
- [x] Room details include `created_at_unix_secs` and `message_count`.
- [x] Web Console displays server stats.
- [x] Web Console displays room message counts or creation metadata.
- [x] JavaScript smoke or SDK demo verifies stats behavior.
- [x] README and demo docs mention the stats endpoint.
- [x] Rust checks/tests pass.
- [x] JavaScript syntax checks pass.
- [x] Server-backed smoke/errors/sdk-demo pass.

## 6. Medium-Term Milestone: v0.7 Relay Groundwork

Relay groundwork should come after SDK stabilization. The current planning document is `docs/v0.7-relay-groundwork-plan.md`.

In scope:

- relay design document
- topology model extension planning
- relay constraints and non-goals
- protocol impact review
- no-op or metadata-only relay placeholders if useful

Out of scope initially:

- production relay infrastructure
- accounts
- global matchmaking
- billing/quotas
- anti-cheat
- NAT traversal implementation

Acceptance should focus on clear design and boundaries before code.

## 7. Next Milestone: v0.9 Lightweight State Sync Prototype

The next planned milestone is `docs/v0.9-state-sync-prototype-plan.md`.

Purpose:

- make the existing mini-game movement pattern easier to reuse
- document state snapshot conventions inside `room_message.data`
- keep state sync example-led before adding protocol or server-authoritative features

Initial v0.9 constraints:

- no new core WebSocket message types
- no server-authoritative simulation
- no physics, rollback, ECS replication, or binary protocol changes
- keep raw event sync working exactly as it does today

## 8. Longer-Term Milestones

Potential sequence:

1. v0.6 JS SDK stabilization
2. v0.7 relay groundwork design
3. v0.8 observability and room stats
4. v0.9 lightweight state sync module prototype
5. v0.10 additional SDK or engine integration experiment
6. v1.0 stable room server + JS SDK + debug console baseline

The order can change, but each milestone should keep the core room loop intact.

## 9. Atomic Commit Policy

Use one commit per coherent task:

- docs checklist update
- protocol change + tests + docs
- SDK helper change + script updates
- console behavior fix
- roadmap/goal document update

Do not mix unrelated architecture, docs, SDK, and protocol changes unless they are required for one behavior.

Before each commit, prefer the one-command verification script:

```powershell
.\scripts\verify.ps1
```

Manual equivalent:

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

For changes that need a running server, also run the relevant integration scripts:

```bash
npm --prefix examples/js-client run smoke
npm --prefix examples/js-client run errors
npm --prefix examples/js-client run sdk-demo
```

## 10. Push Policy

After each atomic commit, push the current branch:

```bash
git push
```

If push fails due to network or TLS problems:

- keep the commit local
- report the exact error
- continue only if the next task can be safely based on the local commit
- retry push before ending the session

## 11. Definition of Done for a Milestone

A milestone is done when:

- implementation matches its plan
- docs and README match behavior
- checks pass
- examples still run or have documented manual checks
- scope guardrails are still satisfied
- work is committed atomically
- branch is pushed, or push failure is explicitly recorded
