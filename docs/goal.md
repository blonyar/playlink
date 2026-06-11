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

Current implementation includes:

- Rust Axum server
- WebSocket JSON protocol
- create, join, leave, inspect, and list rooms
- room message broadcast
- structured errors
- `room_left` acknowledgement
- player sessions and idle cleanup
- Web Debug Console
- server metadata endpoint
- optional UDP LAN discovery
- JavaScript helper, smoke/error/discovery scripts, SDK demo, and mini-game example

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

## 5. Near-Term Milestone: v0.6 SDK Stabilization

Recommended next milestone: stabilize the JavaScript helper and example workflow before relay/P2P.

Why:

- v0.5 already introduced the helper and mini-game.
- SDK usability will reveal protocol gaps while the system is still small.
- Relay/P2P will be easier if the client lifecycle API is already clear.

### v0.6 Scope

In scope:

- Document the `PlaylinkClient` API.
- Add lightweight helper methods for common lifecycle operations.
- Strengthen request timeout and close behavior.
- Add integration coverage for `room_left`.
- Add a minimal SDK API reference in docs.
- Keep Node/browser compatibility documented.
- Improve example scripts without packaging to npm yet.

Out of scope:

- npm publishing
- authentication
- matchmaking
- relay mode
- P2P/NAT traversal
- game-engine-specific SDKs

### v0.6 Acceptance Criteria

- [ ] `docs/v0.6-js-sdk-stabilization-plan.md` exists.
- [ ] `docs/js-client-api.md` documents `PlaylinkClient` constructor, methods, events, and errors.
- [ ] JS scripts test or demonstrate `room_left` acknowledgement.
- [ ] SDK demo still passes with two clients.
- [ ] mini-game example still works manually.
- [ ] Rust tests pass.
- [ ] JavaScript syntax checks pass.
- [ ] README links to the JS API document.

## 6. Medium-Term Milestone: v0.7 Relay Groundwork

Relay should come after SDK stabilization.

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

## 7. Longer-Term Milestones

Potential sequence:

1. v0.6 JS SDK stabilization
2. v0.7 relay groundwork design
3. v0.8 lightweight state sync module prototype
4. v0.9 additional SDK or engine integration experiment
5. v1.0 stable room server + JS SDK + debug console baseline

The order can change, but each milestone should keep the core room loop intact.

## 8. Atomic Commit Policy

Use one commit per coherent task:

- docs checklist update
- protocol change + tests + docs
- SDK helper change + script updates
- console behavior fix
- roadmap/goal document update

Do not mix unrelated architecture, docs, SDK, and protocol changes unless they are required for one behavior.

Before each commit:

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
