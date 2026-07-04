# AGENTS.md

Playlink is a modular multiplayer networking framework for small room-based games. The core is a Rust Axum WebSocket room server with a zero-dependency JS SDK and in-tree examples. The v0.1 loop (create/join/leave/broadcast rooms over WebSocket JSON) is the contract every change must preserve.

For product scope, design guardrails, and the long-term framework direction, see `docs/goal.md` and `docs/v1.0-baseline.md`. For wire protocol and error codes, see `docs/protocol.md`. For a walkthrough, see `docs/TUTORIAL.md`.

## Layout

| Path | Purpose |
| --- | --- |
| `src/` | Rust Axum server (binary: `playlink`). Modules: `main.rs`, `admin.rs`, `room.rs`, `session.rs`, `websocket.rs`, `protocol.rs`, `discovery.rs`. |
| `packages/js-sdk/` | `@playlink/client` zero-dep ESM package; TypeScript declarations in `types/`; `node --test` unit suite in `test/`. |
| `examples/js-client/` | Example scripts (smoke, errors, idle-timeout, state-sync, discover-lan, sdk-demo, mini-game). Consumes the SDK via `"@playlink/client": "file:../../packages/js-sdk"`. |
| `examples/godot-client/` | Godot 4 client (autoload singleton). Optional and isolated. |
| `web-console/` | Browser debug console. Embedded into the server binary via `include_dir!`; served at `/` as a fallback (does not shadow `/api/*` or `/ws`). |
| `scripts/verify.ps1` | One-command local verification (Rust + JS). |
| `.github/workflows/ci.yml` | CI with 4 parallel jobs: `rust`, `sdk`, `examples`, `integration`. |

## Toolchain

This environment uses a rustup-managed stable toolchain. **Always prefix cargo commands with `rustup run stable`** — plain `cargo` may resolve a different toolchain. Node 20+ is required for the SDK and examples.

## Commands

Run the server (binds `0.0.0.0:7777` by default):

```bash
rustup run stable cargo run
```

Quick local probes:

```bash
curl http://localhost:7777/health
curl http://localhost:7777/api/server
curl http://localhost:7777/api/stats
curl http://localhost:7777/api/rooms
```

WebSocket endpoint: `ws://localhost:7777/ws`. Web console: <http://localhost:7777/>.

Run all Rust tests (incl. WS integration tests in `src/main.rs`):

```bash
rustup run stable cargo test
rustup run stable cargo test <test_name>      # single test
rustup run stable cargo fmt --check            # format gate
rustup run stable cargo check
```

JS SDK and examples:

```bash
npm --prefix packages/js-sdk test
npm --prefix packages/js-sdk run test:state-snapshot    # one suite
npm --prefix packages/js-sdk run test:protocol
npm --prefix packages/js-sdk run test:utils
npm --prefix examples/js-client run state-sync          # offline helper, no server needed
npm --prefix examples/js-client run smoke               # needs a running server
npm --prefix examples/js-client run errors              # needs a running server
npm --prefix examples/js-client run sdk-demo            # needs a running server
npm --prefix examples/js-client run mini-game           # serves browser demo on 127.0.0.1:7780
```

One-command local verification (PowerShell, matches CI):

```powershell
.\scripts\verify.ps1              # full suite incl. integration
.\scripts\verify.ps1 -SkipIntegration
```

`verify.ps1` reuses an already-running server on `127.0.0.1:7777` if `curl /health` succeeds, otherwise it builds and starts one. It restores `PLAYLINK_BIND_ADDR`, `PLAYLINK_HTTP_URL`, `PLAYLINK_WS_URL` env vars on exit.

## Configuration environment variables

All read in `src/main.rs` `Config::from_env`:

- `PLAYLINK_BIND_ADDR` (default `0.0.0.0:7777`)
- `PLAYLINK_TOPOLOGY` (`dedicated` | `host`)
- `PLAYLINK_SERVER_NAME`, `PLAYLINK_SERVER_ID`, `PLAYLINK_PUBLIC_HTTP_URL`, `PLAYLINK_PUBLIC_WS_URL`
- `PLAYLINK_LAN_DISCOVERY=1` to enable UDP discovery (binds `PLAYLINK_DISCOVERY_PORT`, default `7778`)
- `PLAYLINK_WEB_DIR=<path>` to override the embedded web console for local dev
- `PLAYLINK_MODE=prod` enables `PLAYLINK_ALLOWED_ORIGINS` enforcement and CSWSH Origin-header validation; otherwise all origins are accepted
- `PLAYLINK_DEFAULT_MAX_PLAYERS` (8), `PLAYLINK_MAX_PLAYERS_PER_ROOM` (16), `PLAYLINK_MAX_ROOMS` (1024)
- `PLAYLINK_MAX_FRAME_BYTES` (16 KiB) and `PLAYLINK_MAX_MESSAGE_BYTES` (1 MiB) — distinct limits; pre-v1.1 deployments that set only `PLAYLINK_MAX_MESSAGE_BYTES` ≤ 64 KiB get a one-shot migration warning
- `PLAYLINK_SESSION_IDLE_TIMEOUT_SECS` (30), `PLAYLINK_CLEANUP_INTERVAL_SECS` (30)
- `PLAYLINK_MESSAGE_BURST` (30), `PLAYLINK_MESSAGE_RATE_PER_SEC` (30.0) — per-session token-bucket rate limit
- `PLAYLINK_MAX_CONNECTIONS` (256), `PLAYLINK_MAX_CONNECTIONS_PER_IP` (8)

Invalid env values log a warning and fall back to the default; `Config::validate()` also warns on suspicious combinations.

## Architecture notes

- `AppState` in `src/main.rs:43` is shared via `Arc`; routes are mounted by `build_app` at `src/main.rs:317` and the web console is attached as a router fallback so API/WS routes always win.
- `RoomRegistry` (`src/room.rs`) holds rooms in a `DashMap`; per-room state lives behind a `tokio::sync::RwLock`. **All `RoomRegistry` helpers (`acquire_room`/`get_room`) clone the `Arc<Room>` out of the DashMap guard before any await** to avoid holding a shard lock across an await. Match this pattern in any new room helper.
- Room events are distributed via `tokio::sync::broadcast` channels. Empty rooms are removed either on last-player leave (publishes `room_closed` then drops the room) or by a periodic `cleanup_task` that catches rooms created but never joined.
- `Session` (`src/session.rs`) owns a server-assigned `player_id` UUID. **Clients cannot supply `player_id`** — the JSON schema and the WS layer both drop it. Do not add a path that honors a client-supplied id (see tests in `src/main.rs:782` and `src/protocol.rs:231`).
- One active room per WebSocket session. Joining a second room without leaving first must be rejected.
- `discovery.rs` is opt-in and isolated from room/session core; keep it that way.
- Counters (`active_players`, `message_count`, `total_*`) are bumped and decremented under the same lock that mutates the player set to keep `/api/stats` consistent.

## Repo-specific conventions

- **Atomic commits.** One coherent task per commit (e.g., "protocol change + tests + docs"). Do not mix unrelated architecture, SDK, and protocol changes. See `docs/goal.md` §8.
- **Run `.\scripts\verify.ps1` before each commit** and push the branch after. If push fails on network/TLS, keep the commit local and record the error.
- Protocol changes must be additive (new fields, new message types) unless a new major baseline explicitly breaks the contract. Bump `API_VERSION` in `src/main.rs:116` only on breaking changes.
- New wire features need Rust tests, SDK tests (or example coverage), and a docs update in the same change.
- `RoomRegistry` must not gain topology, simulation, account, persistence, or matchmaking concerns. Add extension points instead.
- Web Debug Console is a dev tool, not a production admin surface — do not add auth/permissions to it.
- Style: `rustup run stable cargo fmt` before committing. JS uses ESM and `node --check` for syntax; the SDK is zero-dependency (`sideEffects: false`).

## Testing quirks

- `src/main.rs` contains both unit tests and `#[tokio::test]` WS integration tests that bind to `127.0.0.1:0` and use `tokio_tungstenite`. They run as part of `cargo test`; no external server needed.
- The embedded web console is asserted by `web_console_embeds_core_assets` (`src/main.rs:516`) — keep `web-console/index.html`, `web-console/assets/app.js`, and `web-console/assets/style.css` present.
- `verify.ps1`'s integration phase runs `smoke`, `errors`, `sdk-demo`. `mini-game` and `discover-lan` are not part of the gate and must be invoked manually when relevant.
- `PLAYLINK_SESSION_IDLE_TIMEOUT_SECS=1 rustup run stable cargo run` plus `npm --prefix examples/js-client run idle-timeout` is the manual recipe for testing idle-disconnect behavior.
- LAN discovery tests are run manually via `npm --prefix examples/js-client run discover-lan` against a server started with `PLAYLINK_LAN_DISCOVERY=1`.
