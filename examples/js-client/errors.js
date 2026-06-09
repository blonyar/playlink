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

async function expectError(client, code) {
  const message = await waitFor(
    client,
    'error',
    (message) => message.payload?.code === code,
  );
  if (message.payload.code !== code) {
    throw new Error(`expected error ${code}, got ${JSON.stringify(message)}`);
  }
  return message;
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
    type: 'create_room',
    payload: { room_name: roomName, max_players: maxPlayers },
  });
  const created = await waitFor(client, 'room_created');
  const roomId = created.payload.room_id;

  send(client, {
    type: 'join_room',
    payload: { room_id: roomId, player_name: client.name },
  });
  await waitFor(client, 'room_joined', (message) => message.payload.room_id === roomId);
  return roomId;
}

async function main() {
  const missing = await connectClient('missing-room-client');
  send(missing, {
    type: 'join_room',
    payload: {
      room_id: '00000000-0000-0000-0000-000000000000',
      player_name: 'missing-room-client',
    },
  });
  await expectError(missing, 'room_not_found');
  missing.socket.close();

  const notInRoom = await connectClient('not-in-room-client');
  send(notInRoom, {
    type: 'room_message',
    payload: { data: { text: 'should fail' } },
  });
  await expectError(notInRoom, 'not_in_room');
  notInRoom.socket.close();

  const invalid = await connectClient('invalid-json-client');
  sendRaw(invalid, '{ not json');
  await expectError(invalid, 'invalid_message');
  invalid.socket.close();

  const invalidRoomId = await connectClient('invalid-room-id-client');
  send(invalidRoomId, {
    type: 'join_room',
    payload: {
      room_id: 'not-a-uuid',
      player_name: 'invalid-room-id-client',
    },
  });
  await expectError(invalidRoomId, 'invalid_room_id');
  invalidRoomId.socket.close();

  const alice = await connectClient('alice');
  const roomId = await createAndJoin(alice, 'errors-full-room', 1);
  const bob = await connectClient('bob');
  send(bob, {
    type: 'join_room',
    payload: { room_id: roomId, player_name: 'bob' },
  });
  await expectError(bob, 'room_full');
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
