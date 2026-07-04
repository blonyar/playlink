# Playlink Long-Term Goal

## 1. North Star

Playlink should become a modular multiplayer networking toolkit for 2-8 player small games, prototypes, LAN parties, and room-based online play.

The long-term target is not an MMO backend or a monolithic game platform. The target is a clean framework where a developer can start simple and gradually choose only the networking modules they need:

```text
small game -> Playlink room core -> transport -> topology -> sync mode -> SDK/example workflow
```

## 2. Guardrails

Every milestone should preserve these constraints:

- Keep the room-based multiplayer loop working at all times.
- Prefer optional modules over required core dependencies.
- Keep raw WebSocket + JSON protocol usable even as SDKs improve.
- Avoid accounts, global matchmaking, anti-cheat, databases, production admin permissions, and MMO-scale systems until the small-room framework is mature.
- Add extension points before adding heavy implementations.
- Make each change testable with Rust checks, JavaScript checks, or repeatable scripts.

## 3. Current Baseline

Completed:

- v0.1 dedicated WebSocket room server
- v0.2 Web Debug Console
- v0.3 protocol and room reliability
- v0.4 host metadata and optional LAN discovery prototype
- v0.5 JavaScript helper and example game workflow
- v0.6 JavaScript helper stabilization and API docs
- v0.7 relay groundwork plan
- v0.8 observability and room stats
- v0.9 lightweight state sync prototype
- v1.0 stable baseline for the room protocol, JavaScript helper API, dev-only debug console boundary, state-sync example contract, and one-command verification flow
- v0.4 hardening pass (transport hardening, `room_closed` event, `api_version` field, mutex-poison recovery, env-parse warnings)
- v1.1 `@playlink/client` SDK packaging (zero-dependency ESM package with TypeScript declarations and `node --test` unit suite; `examples/js-client` consumes it via a `file:` link)
- v1.1 CI pipeline (GitHub Actions workflow covering Rust fmt/test, SDK tests, JS syntax, and end-to-end integration)
- v1.2 GUI launcher (eframe/egui native desktop launcher for server and demo lifecycle)

Active convergence target:

- Publish `@playlink/client` to the npm registry
- More engine example integrations (Unity / C# / Rust client crate) once at least two real games have validated the API
- Relay runtime prototype (after SDK pressure is real)

Current implementation includes:

- Rust Axum server
- WebSocket JSON protocol
- create, join, leave, inspect, and list rooms
- room message broadcast
- structured errors
- `room_left` and `room_closed` (v1.1) acknowledgements
- `api_version` field on `/api/server` for SDK capability negotiation
- player sessions and idle cleanup
- per-session token-bucket message rate limiting
- global connection cap with per-IP limiting (RAII-guarded, mutex-poison safe)
- room-count cap with `ServerFull` error
- transport-layer frame and message size split (PLAYLINK_MAX_FRAME_BYTES, PLAYLINK_MAX_MESSAGE_BYTES)
- WebSocket Origin header validation (CSWSH protection, prod mode)
- player/room name sanitization (control-character rejection)
- graceful shutdown broadcasting a close signal to active connections
- Web Debug Console with server stats dashboard
- server metadata endpoint
- server stats endpoint (`/api/stats`) with uptime, room/player/connection counts, and cumulative counters
- room snapshots with `created_at_unix_secs` and `message_count`
- optional UDP LAN discovery (private-range filtered)
- `@playlink/client` JavaScript SDK package (zero dependencies, ESM, TypeScript declarations, `node --test` unit suite)
- in-tree examples (smoke, errors, idle-timeout, state-sync, discover-lan, sdk-demo, mini-game) that consume the SDK
- Godot 4 client (autoload singleton, signals, keepalive)
- state snapshot helpers and stale tick filtering
- configuration validation with startup warnings
- broadcast concurrency via `RoomState` RwLock with monotonic message counters
- embedded web console via `include_dir` (self-contained binary)
- environment-variable parse-failure warnings
- JavaScript client API documentation
- GitHub Actions CI workflow covering four parallel jobs (rust, sdk, examples, integration)
- relay groundwork planning document
- GUI launcher (`playlink-launcher`) with service lifecycle management, log panel, settings persistence, and browser auto-open

## 4. Work Threads

Use parallel work threads conceptually, but commit atomically.

### Thread A: Core Room Reliability

Purpose: make room/session behavior boring, predictable, and safe.

Responsibilities:

- room lifecycle invariants
- player membership checks
- leave/disconnect cleanup
- message size and rate limits ✓
- room event lag handling
- graceful shutdown (close active connections on Ctrl+C)
- connection and room capacity caps ✓
- player/room name sanitization ✓
- `RoomState` RwLock for concurrent broadcast reads
- per-IP connection limiting
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

## 5. Completed Milestones

See `docs/ROADMAP.md` for the full milestone history.

The current baseline already includes all milestones v0.1 through v1.1 (see `docs/v1.0-baseline.md`).

## 6. Completed Milestone: v1.0 Stable Baseline

`docs/v1.0-baseline.md` is implemented and verified.

Acceptance points met:

- protocol examples match emitted JSON ✓
- explicit leave, disconnect cleanup, and idle timeout cleanup stay idempotent ✓
- state snapshot helpers reject duplicate, stale, and out-of-order ticks ✓
- README, goal, roadmap, protocol, JS API, and sync docs agree on milestone status ✓
- `.\scripts\verify.ps1` passes ✓

Next direction:

- Publish `@playlink/client` to the npm registry and validate it against at least one external project
- More engine example integrations (Unity / C# / Rust client crate) once the JavaScript SDK has at least one external consumer
- Relay runtime prototype (after SDK pressure is real)

## 7. After v1.0

Potential follow-up sequence:

1. v1.0 stable room protocol + JS helper + debug console baseline ✓
2. v1.1 hardening pass + SDK packaging + CI ✓
3. v1.2 GUI launcher ✓
4. publish `@playlink/client` to npm and document external adoption
4. additional SDK or engine integration experiment (Unity / C# / Rust client crate)
5. relay runtime prototype as an optional topology module
6. P2P/NAT traversal experiments with relay fallback

The order can change, but each milestone must keep the core room loop intact and must not turn `RoomRegistry` into topology, simulation, account, or persistence infrastructure.

## 8. Atomic Commit Policy

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
node --check packages/js-sdk/src/index.js
node --check packages/js-sdk/src/client.js
node --check packages/js-sdk/src/protocol.js
node --check packages/js-sdk/src/state-snapshot.js
node --check packages/js-sdk/src/utils.js
node --check examples/js-client/sdk-demo.js
node --check examples/js-client/mini-game.js
node --check examples/js-client/mini-game-server.js
node --check examples/js-client/tanks.js
node --check web-console/assets/app.js
node --check examples/js-client/smoke.js
node --check examples/js-client/errors.js
node --check examples/js-client/state-sync.js
node --check examples/js-client/idle-timeout.js
node --check examples/js-client/discover-lan.js
```

For changes that need a running server, also run the relevant integration scripts:

```bash
npm --prefix examples/js-client run smoke
npm --prefix examples/js-client run errors
npm --prefix examples/js-client run sdk-demo
```

## 9. Push Policy

After each atomic commit, push the current branch:

```bash
git push
```

If push fails due to network or TLS problems:

- keep the commit local
- report the exact error
- continue only if the next task can be safely based on the local commit
- retry push before ending the session

## 10. Definition of Done for a Milestone

A milestone is done when:

- implementation matches its plan
- docs and README match behavior
- checks pass
- examples still run or have documented manual checks
- scope guardrails are still satisfied
- work is committed atomically
- branch is pushed, or push failure is explicitly recorded
