const endpoint = process.env.PLAYLINK_WS_URL ?? 'ws://localhost:7777/ws';
const httpBase = process.env.PLAYLINK_HTTP_URL ?? 'http://localhost:7777';

function connectClient(name) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    const messages = [];

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`${name} timed out while connecting to ${endpoint}`));
    }, 5000);

    socket.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve({ name, socket, messages });
    });

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      messages.push(message);
      console.log(`[${name}]`, JSON.stringify(message));
    });

    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error(`${name} failed to connect to ${endpoint}`));
    });
  });
}

function send(client, message) {
  client.socket.send(JSON.stringify(message));
}

function sendRaw(client, text) {
  client.socket.send(text);
}

function expectId(message, id) {
  if (message.id !== id) {
    throw new Error(`expected id ${id}, got ${JSON.stringify(message)}`);
  }
}

function waitFor(client, type, predicate = () => true, timeoutMs = 5000) {
  const existing = client.messages.find((message) => message.type === type && predicate(message));
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`${client.name} timed out waiting for ${type}`));
    }, timeoutMs);

    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === type && predicate(message)) {
        cleanup();
        resolve(message);
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      client.socket.removeEventListener('message', onMessage);
    };

    client.socket.addEventListener('message', onMessage);
  });
}

async function expectError(client, code, id) {
  const message = await waitFor(
    client,
    'error',
    (message) => message.payload?.code === code && (id === undefined || message.id === id),
  );
  if (message.payload.code !== code) {
    throw new Error(`expected error ${code}, got ${JSON.stringify(message)}`);
  }
  if (id !== undefined) {
    expectId(message, id);
  }
  return message;
}

async function expectPong(client, id) {
  const pong = await waitFor(client, 'pong', (message) => message.id === id);
  expectId(pong, id);
  return pong;
}

async function fetchRooms() {
  const response = await fetch(`${httpBase}/api/rooms`);
  if (!response.ok) throw new Error(`room list failed: ${response.status}`);
  return response.json();
}

async function fetchRoom(roomId) {
  const response = await fetch(`${httpBase}/api/rooms/${roomId}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`room detail failed: ${response.status}`);
  return response.json();
}

async function waitUntil(predicate, description, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function createAndJoin(client, roomName, maxPlayers) {
  send(client, {
    id: `${client.name}-create-room`,
    type: 'create_room',
    payload: { room_name: roomName, max_players: maxPlayers },
  });
  const created = await waitFor(client, 'room_created');
  expectId(created, `${client.name}-create-room`);
  const roomId = created.payload.room_id;

  send(client, {
    id: `${client.name}-join-room`,
    type: 'join_room',
    payload: { room_id: roomId, player_name: client.name },
  });
  const joined = await waitFor(client, 'room_joined', (message) => message.payload.room_id === roomId);
  expectId(joined, `${client.name}-join-room`);
  return roomId;
}

async function main() {
  const missing = await connectClient('missing-room-client');
  send(missing, {
    id: 'errors-missing-room',
    type: 'join_room',
    payload: {
      room_id: '00000000-0000-0000-0000-000000000000',
      player_name: 'missing-room-client',
    },
  });
  await expectError(missing, 'room_not_found', 'errors-missing-room');
  missing.socket.close();

  const notInRoom = await connectClient('not-in-room-client');
  send(notInRoom, {
    id: 'errors-message-not-in-room',
    type: 'room_message',
    payload: { data: { text: 'should fail' } },
  });
  await expectError(notInRoom, 'not_in_room', 'errors-message-not-in-room');
  send(notInRoom, { id: 'errors-ping-after-not-in-room', type: 'ping' });
  await expectPong(notInRoom, 'errors-ping-after-not-in-room');
  notInRoom.socket.close();

  const leaveNotInRoom = await connectClient('leave-not-in-room-client');
  send(leaveNotInRoom, {
    id: 'errors-leave-not-in-room',
    type: 'leave_room',
  });
  await expectError(leaveNotInRoom, 'not_in_room', 'errors-leave-not-in-room');
  leaveNotInRoom.socket.close();

  const invalid = await connectClient('invalid-json-client');
  sendRaw(invalid, '{ not json');
  await expectError(invalid, 'invalid_message');
  send(invalid, {
    id: 'errors-unknown-message-type',
    type: 'definitely_not_supported',
    payload: {},
  });
  await expectError(invalid, 'invalid_message', 'errors-unknown-message-type');
  invalid.socket.close();

  const invalidRoomId = await connectClient('invalid-room-id-client');
  send(invalidRoomId, {
    id: 'errors-invalid-room-id',
    type: 'join_room',
    payload: {
      room_id: 'not-a-uuid',
      player_name: 'invalid-room-id-client',
    },
  });
  await expectError(invalidRoomId, 'invalid_room_id', 'errors-invalid-room-id');
  invalidRoomId.socket.close();

  const alice = await connectClient('alice');
  const roomId = await createAndJoin(alice, 'errors-full-room', 1);

  send(alice, {
    id: 'errors-already-in-room',
    type: 'join_room',
    payload: { room_id: roomId, player_name: 'alice-again' },
  });
  await expectError(alice, 'already_in_room', 'errors-already-in-room');
  send(alice, { id: 'errors-ping-after-already-in-room', type: 'ping' });
  await expectPong(alice, 'errors-ping-after-already-in-room');

  const bob = await connectClient('bob');
  send(bob, {
    id: 'errors-room-full',
    type: 'join_room',
    payload: { room_id: roomId, player_name: 'bob' },
  });
  await expectError(bob, 'room_full', 'errors-room-full');
  bob.socket.close();

  let room = await fetchRoom(roomId);
  if (!room || room.players.length !== 1) {
    throw new Error(`expected one player before leave, got ${JSON.stringify(room)}`);
  }

  send(alice, { type: 'leave_room' });

  await waitUntil(
    async () => (await fetchRoom(roomId)) === null,
    `room ${roomId} cleanup after leave`,
  );
  room = await fetchRoom(roomId);
  if (room !== null) {
    throw new Error(`expected empty room to be deleted after leave, got ${JSON.stringify(room)}`);
  }

  alice.socket.close();

  const rooms = await fetchRooms();
  if (rooms.some((room) => room.id === roomId)) {
    throw new Error(`expected room ${roomId} to be absent from room list`);
  }

  console.log('Playlink error test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
