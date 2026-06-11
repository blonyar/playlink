import { PlaylinkClient } from './playlink-client.js';

const alice = new PlaylinkClient({ name: 'alice', log: console.log });
const bob = new PlaylinkClient({ name: 'bob', log: console.log });

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  await alice.connect();
  await bob.connect();

  const server = await alice.serverInfo();
  const advertisedWsUrl = server.public_ws_url ?? server.ws_url ?? `${alice.wsUrl}`;
  console.log(`Connected to ${server.name} (${server.topology}) at ${advertisedWsUrl}`);

  const roomId = await alice.createRoom({ roomName: 'v0.5 sdk demo', maxPlayers: 4 });
  const aliceJoin = await alice.joinRoom(roomId, 'alice');
  const bobJoin = await bob.joinRoom(roomId, 'bob');

  await alice.waitFor('player_joined', (message) => message.payload.player_name === 'bob');

  alice.sendRoomMessage({ kind: 'chat', text: 'hello from the v0.5 SDK example' });
  const bobReceived = await bob.waitFor(
    'room_broadcast',
    (message) => message.payload.from === aliceJoin.player_id
      && message.payload.data.kind === 'chat'
      && message.payload.data.text === 'hello from the v0.5 SDK example',
  );
  console.log(`Bob received: ${bobReceived.payload.data.text}`);

  bob.sendRoomMessage({ kind: 'move', x: 3, y: 7 });
  const aliceReceived = await alice.waitFor(
    'room_broadcast',
    (message) => message.payload.from === bobJoin.player_id
      && message.payload.data.kind === 'move'
      && message.payload.data.x === 3,
  );
  console.log(`Alice received move: (${aliceReceived.payload.data.x}, ${aliceReceived.payload.data.y})`);

  const rooms = await alice.listRooms();
  const demoRoom = rooms.find((room) => room.id === roomId);
  requireCondition(demoRoom?.player_count === 2, `expected 2 players in room, got ${JSON.stringify(demoRoom)}`);

  await bob.leaveRoom();
  await alice.waitFor('player_left', (message) => message.payload.player_id === bobJoin.player_id);

  alice.close();
  bob.close();
  console.log('Playlink v0.5 SDK example passed.');
}

main().catch((error) => {
  alice.close();
  bob.close();
  console.error(error);
  process.exit(1);
});
