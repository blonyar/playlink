/**
 * State-snapshot helpers for the v0.9 lightweight state sync
 * convention. These utilities are layered on top of ordinary
 * `room_message` broadcasts; the server does not interpret their
 * payloads. See `docs/sync-models.md` and `docs/protocol.md` for the
 * full contract.
 */

import { cloneState, nowMs, shallowStateChanged } from './utils.js';

export function createStateSnapshot({ tick, entityId, state }) {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new Error('state snapshot tick must be a non-negative safe integer');
  }
  if (typeof entityId !== 'string' || entityId.trim() === '') {
    throw new Error('state snapshot entityId must be a non-empty string');
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('state snapshot state must be an object');
  }

  return {
    kind: 'state_snapshot',
    tick,
    entity_id: entityId,
    state: cloneState(state),
  };
}

export class StateSnapshotFilter {
  constructor() {
    this.latestTicks = new Map();
  }

  accepts(snapshot) {
    if (snapshot?.kind !== 'state_snapshot') return false;
    if (typeof snapshot.entity_id !== 'string' || snapshot.entity_id.trim() === '') return false;
    if (!Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0) return false;
    if (!snapshot.state || typeof snapshot.state !== 'object' || Array.isArray(snapshot.state)) return false;

    const previousTick = this.latestTicks.get(snapshot.entity_id);
    if (previousTick !== undefined && snapshot.tick <= previousTick) {
      return false;
    }

    this.latestTicks.set(snapshot.entity_id, snapshot.tick);
    return true;
  }

  clear(entityId = undefined) {
    if (entityId === undefined) {
      this.latestTicks.clear();
      return;
    }
    this.latestTicks.delete(entityId);
  }
}

export class StateSnapshotPublisher {
  constructor({
    client,
    entityId,
    minIntervalMs = 50,
    hasChanged = shallowStateChanged,
  }) {
    if (!client) throw new Error('StateSnapshotPublisher requires a PlaylinkClient');
    if (typeof entityId !== 'string' || entityId.trim() === '') {
      throw new Error('StateSnapshotPublisher requires a non-empty entityId');
    }

    this.client = client;
    this.entityId = entityId;
    this.minIntervalMs = minIntervalMs;
    this.hasChanged = hasChanged;
    this.lastPublishedAt = -Infinity;
    this.lastState = null;
    this.nextTick = 1;
  }

  publish(state, { force = false, now = nowMs() } = {}) {
    if (!this.client.roomId) return false;
    if (!force && now - this.lastPublishedAt < this.minIntervalMs) return false;
    if (!force && !this.hasChanged(state, this.lastState)) return false;

    const snapshot = createStateSnapshot({
      tick: this.nextTick++,
      entityId: this.entityId,
      state,
    });
    this.client.sendRoomMessage(snapshot);
    this.lastPublishedAt = now;
    this.lastState = cloneState(state);
    return true;
  }
}
