import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_HTTP_URL,
  DEFAULT_WS_URL,
  ERROR_CODES,
  PROTOCOL_VERSION,
  ProtocolError,
} from '../src/protocol.js';

test('PROTOCOL_VERSION is a positive integer', () => {
  assert.equal(typeof PROTOCOL_VERSION, 'number');
  assert.ok(Number.isInteger(PROTOCOL_VERSION));
  assert.ok(PROTOCOL_VERSION >= 1);
});

test('default URLs point at the local dev server', () => {
  assert.equal(DEFAULT_WS_URL, 'ws://localhost:7777/ws');
  assert.equal(DEFAULT_HTTP_URL, 'http://localhost:7777');
});

test('ERROR_CODES is frozen and exposes the canonical protocol codes', () => {
  assert.equal(Object.isFrozen(ERROR_CODES), true);
  assert.equal(ERROR_CODES.INVALID_MESSAGE, 'invalid_message');
  assert.equal(ERROR_CODES.ROOM_NOT_FOUND, 'room_not_found');
  assert.equal(ERROR_CODES.ROOM_FULL, 'room_full');
  assert.equal(ERROR_CODES.NOT_IN_ROOM, 'not_in_room');
  assert.equal(ERROR_CODES.ALREADY_IN_ROOM, 'already_in_room');
  assert.equal(ERROR_CODES.INVALID_ROOM_ID, 'invalid_room_id');
  assert.equal(ERROR_CODES.MESSAGE_TOO_LARGE, 'message_too_large');
  assert.equal(ERROR_CODES.RATE_LIMITED, 'rate_limited');
  assert.equal(ERROR_CODES.INTERNAL_ERROR, 'internal_error');
  assert.equal(Object.keys(ERROR_CODES).length, 9);
});

test('ProtocolError captures the code and the message', () => {
  const error = new ProtocolError('not_in_room', 'Player is not in a room');
  assert.equal(error.name, 'ProtocolError');
  assert.equal(error.code, 'not_in_room');
  assert.equal(error.message, 'Player is not in a room');
  assert.ok(error instanceof Error);
  assert.ok(error instanceof ProtocolError);
});

test('ProtocolError is throwable and catchable', () => {
  try {
    throw new ProtocolError('room_full', 'Room is full');
  } catch (caught) {
    assert.ok(caught instanceof ProtocolError);
    assert.equal(caught.code, 'room_full');
  }
});
