# Playlink Roadmap

All milestones are complete. Historical plan files have been consolidated here.

## v0.1 — Dedicated WebSocket Room Server
Core loop: create/join/leave/broadcast over WebSocket JSON. Proved the smallest useful Playlink loop.

## v0.2 — Web Debug Console
Browser-based debug console embedded in the server binary. Served at `/` as a fallback.

## v0.3 — Protocol and Room Reliability
Structured error codes, ping/pong heartbeat, idle disconnect cleanup, join validation.

## v0.4 — Host Metadata and LAN Discovery
Host topology support, server metadata API, optional UDP LAN discovery prototype.

## v0.5 — JavaScript Helper and Example Game Workflow
First JS SDK draft, smoke/error integration scripts, end-to-end workflow validation.

## v0.6 — JS SDK Stabilization and API Docs
Zero-dep ESM package (`@playlink/client`), TypeScript declarations, full API documentation (`docs/js-client-api.md`).

## v0.7 — Relay Groundwork
Design work for relay topology. No runtime changes.

## v0.8 — Observability and Room Stats
Server stats endpoint (`/api/stats`), room metadata (`message_count`, `created_at_unix_secs`), stats dashboard in web console.

## v0.9 — Lightweight State Sync Prototype
State snapshot helpers (`StateSnapshotPublisher`, `StateSnapshotFilter`) built on existing `room_message` broadcasts. Example-driven with mini-game and Tank Wars demos.

## v1.0 — Stable Baseline
Frozen protocol contract, published SDK, one-command verification, CI with 4 parallel jobs. See `docs/v1.0-baseline.md`.

## v1.1 — Hardening Pass
Transport hardening: frame/message size split, per-IP connection cap, rate-limited messages, `room_closed` event, mutex-poison recovery, env-parse warnings, name sanitization.
