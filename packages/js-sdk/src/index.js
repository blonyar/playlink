/**
 * Public entry point for the @playlink/client SDK.
 *
 * The package is zero-dependency, ESM-only, and ships TypeScript
 * declarations. Public exports are kept narrow so internal helpers
 * can evolve without breaking v1.x consumers.
 */

export { PlaylinkClient } from './client.js';
export {
  createStateSnapshot,
  StateSnapshotFilter,
  StateSnapshotPublisher,
} from './state-snapshot.js';
export {
  DEFAULT_HTTP_URL,
  DEFAULT_WS_URL,
  ERROR_CODES,
  PROTOCOL_VERSION,
  ProtocolError,
} from './protocol.js';
