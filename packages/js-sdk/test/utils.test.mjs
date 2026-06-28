import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cloneState, envValue, nowMs, shallowStateChanged } from '../src/utils.js';

test('envValue returns the fallback when the variable is unset', () => {
  const previous = process.env.PLAYLINK_TEST_FOO;
  delete process.env.PLAYLINK_TEST_FOO;
  try {
    assert.equal(envValue('PLAYLINK_TEST_FOO', 'default'), 'default');
  } finally {
    if (previous !== undefined) process.env.PLAYLINK_TEST_FOO = previous;
  }
});

test('envValue returns the variable when set', () => {
  const previous = process.env.PLAYLINK_TEST_FOO;
  process.env.PLAYLINK_TEST_FOO = 'real-value';
  try {
    assert.equal(envValue('PLAYLINK_TEST_FOO', 'default'), 'real-value');
  } finally {
    if (previous === undefined) {
      delete process.env.PLAYLINK_TEST_FOO;
    } else {
      process.env.PLAYLINK_TEST_FOO = previous;
    }
  }
});

test('nowMs returns a finite number', () => {
  const value = nowMs();
  assert.equal(typeof value, 'number');
  assert.ok(Number.isFinite(value));
});

test('cloneState returns a shallow copy', () => {
  const state = { x: 1, nested: { y: 2 } };
  const copy = cloneState(state);
  assert.notEqual(copy, state);
  assert.equal(copy.x, 1);
  assert.equal(copy.nested, state.nested, 'nested objects are shared (shallow)');
});

test('shallowStateChanged returns true for a missing previous state', () => {
  assert.equal(shallowStateChanged({ x: 1 }, null), true);
});

test('shallowStateChanged detects key count differences', () => {
  assert.equal(shallowStateChanged({ x: 1, y: 2 }, { x: 1 }), true);
  assert.equal(shallowStateChanged({ x: 1 }, { x: 1, y: 2 }), true);
});

test('shallowStateChanged detects value changes via Object.is', () => {
  assert.equal(shallowStateChanged({ x: 2 }, { x: 1 }), true);
  assert.equal(shallowStateChanged({ x: NaN }, { x: NaN }), false, 'NaN equals NaN by Object.is');
  assert.equal(shallowStateChanged({ x: 0 }, { x: -0 }), true, '+0 and -0 are distinct by Object.is');
});

test('shallowStateChanged returns false when keys and values are equal', () => {
  assert.equal(shallowStateChanged({ x: 1, y: 2 }, { x: 1, y: 2 }), false);
});
