# Changelog

All notable changes to `@playlink/client` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-28

### Added
- Initial public release extracted from the embedded helper at
  `examples/js-client/playlink-client.js`.
- `PlaylinkClient` with the full v1.0 helper API: create/join/leave/list
  rooms, send and broadcast room messages, request/response correlation
  via the optional `id` field, auto-reconnect with exponential backoff
  and 30% jitter, auto-rejoin of the last room after reconnect, and
  HTTP helpers for `/api/rooms`, `/api/server`, `/api/stats`.
- `StateSnapshotFilter` and `StateSnapshotPublisher` helpers for the
  v0.9 lightweight state sync convention. `createStateSnapshot` is
  exported as a plain function so callers can build snapshots without
  subscribing to a client.
- Public protocol constants: `PROTOCOL_VERSION`, `DEFAULT_WS_URL`,
  `DEFAULT_HTTP_URL`, and the frozen `ERROR_CODES` map. These are
  additive: existing consumers that import only the client and the
  snapshot helpers are unaffected.
- `ProtocolError` class for server-side `error` responses. The wire
  contract is unchanged: a thrown `Error` whose `code` field holds the
  protocol error code. The new class is used internally by
  `PlaylinkClient` and is also exported for callers that want
  `instanceof` checks.
- TypeScript declarations under `types/`.
- Zero runtime dependencies; the package is ESM-only and requires
  Node.js 20 or newer (or any modern browser).
