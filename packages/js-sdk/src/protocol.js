/**
 * Protocol constants and helpers for the @playlink/client SDK.
 *
 * These mirror the wire format documented in
 * `docs/protocol.md`. The values are stable for the v1.x line; bumping
 * the protocol version requires a corresponding bump of
 * `ServerMetadata.api_version` on the server side.
 */

/**
 * Wire-protocol API version this client targets. Matches the
 * `api_version` field exposed by the server's `GET /api/server`
 * endpoint.
 */
export const PROTOCOL_VERSION = 1;

/** Default WebSocket URL when neither the constructor option nor the
 * `PLAYLINK_WS_URL` environment variable is set. */
export const DEFAULT_WS_URL = 'ws://localhost:7777/ws';

/** Default HTTP base URL when neither the constructor option nor the
 * `PLAYLINK_HTTP_URL` environment variable is set. */
export const DEFAULT_HTTP_URL = 'http://localhost:7777';

/**
 * Canonical error codes returned by the server's `error` payload. The
 * `code` field on `ProtocolError` always uses one of these string
 * values. Keep in sync with `ErrorCode` in `src/protocol.rs`.
 */
export const ERROR_CODES = Object.freeze({
  INVALID_MESSAGE: 'invalid_message',
  ROOM_NOT_FOUND: 'room_not_found',
  ROOM_FULL: 'room_full',
  NOT_IN_ROOM: 'not_in_room',
  ALREADY_IN_ROOM: 'already_in_room',
  INVALID_ROOM_ID: 'invalid_room_id',
  MESSAGE_TOO_LARGE: 'message_too_large',
  RATE_LIMITED: 'rate_limited',
  INTERNAL_ERROR: 'internal_error',
});

/**
 * Error thrown when a server `error` response matches a pending
 * request. The `code` property holds the protocol error code (one of
 * `ERROR_CODES`); the `message` property holds the human-readable
 * text from the server.
 */
export class ProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
  }
}
