import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createStateSnapshot,
  StateSnapshotFilter,
  StateSnapshotPublisher,
} from '../src/state-snapshot.js';

test('createStateSnapshot produces the documented wire shape', () => {
  const snapshot = createStateSnapshot({
    tick: 7,
    entityId: 'player:alice',
    state: { x: 10, y: 20 },
  });

  assert.deepEqual(snapshot, {
    kind: 'state_snapshot',
    tick: 7,
    entity_id: 'player:alice',
    state: { x: 10, y: 20 },
  });
});

test('createStateSnapshot shallow-clones the top-level state object', () => {
  const state = { x: 1, y: 2 };
  const snapshot = createStateSnapshot({ tick: 1, entityId: 'p', state });
  state.x = 99;
  // Top-level keys are not aliased: a later mutation of the source
  // must not change the snapshot.
  assert.equal(snapshot.state.x, 1);
  assert.equal(snapshot.state.y, 2);
});

test('createStateSnapshot rejects invalid inputs', () => {
  assert.throws(
    () => createStateSnapshot({ tick: -1, entityId: 'p', state: { x: 1 } }),
    /tick/,
  );
  assert.throws(
    () => createStateSnapshot({ tick: 1.5, entityId: 'p', state: { x: 1 } }),
    /tick/,
  );
  assert.throws(
    () => createStateSnapshot({ tick: 1, entityId: '', state: { x: 1 } }),
    /entityId/,
  );
  assert.throws(
    () => createStateSnapshot({ tick: 1, entityId: '  ', state: { x: 1 } }),
    /entityId/,
  );
  assert.throws(
    () => createStateSnapshot({ tick: 1, entityId: 'p', state: null }),
    /state/,
  );
  assert.throws(
    () => createStateSnapshot({ tick: 1, entityId: 'p', state: [1, 2, 3] }),
    /state/,
  );
});

test('StateSnapshotFilter accepts new ticks and rejects stale or out-of-order ones', () => {
  const filter = new StateSnapshotFilter();
  const first = createStateSnapshot({ tick: 1, entityId: 'p', state: { x: 1 } });
  const duplicate = createStateSnapshot({ tick: 1, entityId: 'p', state: { x: 2 } });
  const newer = createStateSnapshot({ tick: 2, entityId: 'p', state: { x: 3 } });
  const outOfOrder = createStateSnapshot({ tick: 1, entityId: 'p', state: { x: 4 } });
  const otherEntity = createStateSnapshot({ tick: 1, entityId: 'q', state: { x: 5 } });

  assert.equal(filter.accepts(first), true);
  assert.equal(filter.accepts(duplicate), false);
  assert.equal(filter.accepts(newer), true);
  assert.equal(filter.accepts(outOfOrder), false);
  assert.equal(filter.accepts(otherEntity), true);
});

test('StateSnapshotFilter.clear resets the per-entity tick memory', () => {
  const filter = new StateSnapshotFilter();
  const first = createStateSnapshot({ tick: 1, entityId: 'p', state: { x: 1 } });
  const duplicate = createStateSnapshot({ tick: 1, entityId: 'p', state: { x: 2 } });

  assert.equal(filter.accepts(first), true);
  assert.equal(filter.accepts(duplicate), false);
  filter.clear('p');
  assert.equal(filter.accepts(duplicate), true);
});

test('StateSnapshotFilter rejects malformed snapshots', () => {
  const filter = new StateSnapshotFilter();
  assert.equal(filter.accepts(null), false);
  assert.equal(filter.accepts({}), false);
  assert.equal(filter.accepts({ kind: 'state_snapshot' }), false);
  assert.equal(filter.accepts({ kind: 'state_snapshot', entity_id: '', tick: 1, state: {} }), false);
  assert.equal(filter.accepts({ kind: 'state_snapshot', entity_id: 'p', tick: -1, state: {} }), false);
  assert.equal(filter.accepts({ kind: 'state_snapshot', entity_id: 'p', tick: 1, state: null }), false);
  assert.equal(filter.accepts({ kind: 'state_snapshot', entity_id: 'p', tick: 1, state: [] }), false);
});

test('StateSnapshotPublisher throttles by min interval and shallow change', () => {
  const sent = [];
  const client = {
    roomId: 'room-1',
    sendRoomMessage(data) {
      sent.push(data);
    },
  };
  const publisher = new StateSnapshotPublisher({
    client,
    entityId: 'p:1',
    minIntervalMs: 100,
  });

  assert.equal(publisher.publish({ x: 1, y: 1 }, { now: 0 }), true);
  assert.equal(publisher.publish({ x: 2, y: 1 }, { now: 50 }), false, 'throttled by interval');
  assert.equal(publisher.publish({ x: 2, y: 1 }, { now: 100 }), true, 'after interval');
  assert.equal(publisher.publish({ x: 2, y: 1 }, { now: 200 }), false, 'no change');
  assert.equal(publisher.publish({ x: 2, y: 1 }, { force: true, now: 210 }), true, 'force bypass');

  assert.equal(sent.length, 3);
  assert.deepEqual(
    sent.map((s) => s.tick),
    [1, 2, 3],
  );
});

test('StateSnapshotPublisher does not send when not in a room', () => {
  const sent = [];
  const client = {
    roomId: null,
    sendRoomMessage(data) {
      sent.push(data);
    },
  };
  const publisher = new StateSnapshotPublisher({ client, entityId: 'p' });
  assert.equal(publisher.publish({ x: 1 }), false);
  assert.equal(sent.length, 0);
});

test('StateSnapshotPublisher validates constructor inputs', () => {
  assert.throws(
    () => new StateSnapshotPublisher({ client: null, entityId: 'p' }),
    /PlaylinkClient/,
  );
  assert.throws(
    () => new StateSnapshotPublisher({ client: {}, entityId: '' }),
    /entityId/,
  );
});
