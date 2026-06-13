import assert from 'node:assert/strict';

import {
  createStateSnapshot,
  StateSnapshotFilter,
  StateSnapshotPublisher,
} from './playlink-client.js';

function testSnapshotShape() {
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
}

function testSnapshotValidation() {
  assert.throws(
    () => createStateSnapshot({ tick: -1, entityId: 'player:alice', state: { x: 1 } }),
    /tick/,
  );
  assert.throws(
    () => createStateSnapshot({ tick: 1, entityId: '', state: { x: 1 } }),
    /entityId/,
  );
  assert.throws(
    () => createStateSnapshot({ tick: 1, entityId: 'player:alice', state: null }),
    /state/,
  );
}

function testStaleSnapshotFiltering() {
  const filter = new StateSnapshotFilter();
  const first = createStateSnapshot({
    tick: 1,
    entityId: 'player:alice',
    state: { x: 10 },
  });
  const duplicate = createStateSnapshot({
    tick: 1,
    entityId: 'player:alice',
    state: { x: 11 },
  });
  const newer = createStateSnapshot({
    tick: 2,
    entityId: 'player:alice',
    state: { x: 12 },
  });
  const otherEntity = createStateSnapshot({
    tick: 1,
    entityId: 'player:bob',
    state: { x: 20 },
  });

  assert.equal(filter.accepts(first), true);
  assert.equal(filter.accepts(duplicate), false);
  assert.equal(filter.accepts(newer), true);
  assert.equal(filter.accepts(otherEntity), true);

  filter.clear('player:alice');
  assert.equal(filter.accepts(duplicate), true);
}

function testThrottledPublisher() {
  const sent = [];
  const client = {
    roomId: 'room-1',
    sendRoomMessage(data) {
      sent.push(data);
    },
  };
  const publisher = new StateSnapshotPublisher({
    client,
    entityId: 'player:alice',
    minIntervalMs: 100,
  });

  assert.equal(publisher.publish({ x: 1, y: 1 }, { now: 0 }), true);
  assert.equal(publisher.publish({ x: 2, y: 1 }, { now: 50 }), false);
  assert.equal(publisher.publish({ x: 2, y: 1 }, { now: 100 }), true);
  assert.equal(publisher.publish({ x: 2, y: 1 }, { now: 200 }), false);
  assert.equal(publisher.publish({ x: 2, y: 1 }, { force: true, now: 210 }), true);

  assert.equal(sent.length, 3);
  assert.deepEqual(
    sent.map((snapshot) => snapshot.tick),
    [1, 2, 3],
  );
}

testSnapshotShape();
testSnapshotValidation();
testStaleSnapshotFiltering();
testThrottledPublisher();

console.log('Playlink state sync helper test passed.');
