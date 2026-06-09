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

async function fetchRooms() {
  const response = await fetch(`${httpBase}/api/rooms`);
  if (!response.ok) {
    throw new Error(`room list failed: ${response.status}`);
  }
  return response.json();
}

async function main() {
  const alice = await connectClient('alice');
  const bob = await connectClient('bob');

  send(alice, {
    id: 'smoke-create-room',
    type: 'create_room',
    payload: {
      room_name: 'smoke-test',
      max_players: 4,
    },
  });

  const created = await waitFor(alice, 'room_created');
  expectId(created, 'smoke-create-room');
  const roomId = created.payload.room_id;

  send(alice, {
    id: 'smoke-join-alice',
    type: 'join_room',
    payload: {
      room_id: roomId,
      player_name: 'alice',
    },
  });
  const aliceJoined = await waitFor(alice, 'room_joined');
  expectId(aliceJoined, 'smoke-join-alice');
  const alicePlayerId = aliceJoined.payload.player_id;

  send(bob, {
    id: 'smoke-join-bob',
    type: 'join_room',
    payload: {
      room_id: roomId,
      player_name: 'bob',
    },
  });
  const bobJoined = await waitFor(bob, 'room_joined');
  expectId(bobJoined, 'smoke-join-bob');
  const bobPlayerId = bobJoined.payload.player_id;
  await waitFor(alice, 'player_joined', (message) => message.payload.player_name === 'bob');

  send(alice, {
    type: 'room_message',
    payload: {
      data: {
        text: 'hello from alice',
      },
    },
  });
  await waitFor(
    bob,
    'room_broadcast',
    (message) => message.payload.from === alicePlayerId && message.payload.data.text === 'hello from alice',
  );

  send(bob, {
    type: 'room_message',
    payload: {
      data: {
        text: 'hello from bob',
      },
    },
  });
  await waitFor(
    alice,
    'room_broadcast',
    (message) => message.payload.from === bobPlayerId && message.payload.data.text === 'hello from bob',
  );

  const roomsWithTwoPlayers = await fetchRooms();
  const roomWithTwoPlayers = roomsWithTwoPlayers.find((room) => room.id === roomId);
  if (!roomWithTwoPlayers || roomWithTwoPlayers.player_count !== 2) {
    throw new Error(`expected room to have 2 players, got ${JSON.stringify(roomWithTwoPlayers)}`);
  }

  bob.socket.close();
  await waitFor(alice, 'player_left', (message) => message.payload.player_id === bobPlayerId);

  const roomsWithOnePlayer = await fetchRooms();
  const roomWithOnePlayer = roomsWithOnePlayer.find((room) => room.id === roomId);
  if (!roomWithOnePlayer || roomWithOnePlayer.player_count !== 1) {
    throw new Error(`expected room to have 1 player, got ${JSON.stringify(roomWithOnePlayer)}`);
  }

  alice.socket.close();
  console.log('Playlink smoke test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
