import { PlaylinkClient } from './playlink-client.js';

const alice = new PlaylinkClient({ name: 'alice', log: console.log });
const bob = new PlaylinkClient({ name: 'bob', log: console.log });

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function step(number, message) {
  console.log(`\n[step ${number}] ${message}`);
}

async function main() {
  step(1, 'Connect Alice and Bob to the Playlink WebSocket endpoint');
  await alice.connect();
  await bob.connect();

  const server = await alice.serverInfo();
  const advertisedWsUrl = server.public_ws_url ?? server.ws_url ?? `${alice.wsUrl}`;
  console.log(`Connected to ${server.name} (${server.topology}) at ${advertisedWsUrl}`);

  step(2, 'Create a room with Alice, then join Alice and Bob');
  const roomId = await alice.createRoom({ roomName: 'v0.6 sdk demo', maxPlayers: 4 });
  console.log(`Created room ${roomId}`);
  const aliceJoin = await alice.joinRoom(roomId, 'alice');
  const bobJoin = await bob.joinRoom(roomId, 'bob');
  console.log(`Alice player id: ${aliceJoin.player_id}`);
  console.log(`Bob player id: ${bobJoin.player_id}`);

  step(3, 'Wait until Alice observes Bob joining');  await alice.waitFor('player_joined', (message) => message.payload.player_name === 'bob');
  console.log('Alice observed Bob joining the room.');

  step(4, 'Send a chat-style room message from Alice to Bob');
  alice.sendRoomMessage({ kind: 'chat', text: 'hello from the v0.6 SDK example' });
  const bobReceived = await bob.waitFor(
    'room_broadcast',
    (message) => message.payload.from === aliceJoin.player_id
      && message.payload.data.kind === 'chat'
      && message.payload.data.text === 'hello from the v0.6 SDK example',
  );
  console.log(`Bob received: ${bobReceived.payload.data.text}`);

  step(5, 'Send a movement-style room message from Bob to Alice');
  bob.sendRoomMessage({ kind: 'move', x: 3, y: 7 });
  const aliceReceived = await alice.waitFor(
    'room_broadcast',
    (message) => message.payload.from === bobJoin.player_id
      && message.payload.data.kind === 'move'
      && message.payload.data.x === 3,
  );
  console.log(`Alice received move: (${aliceReceived.payload.data.x}, ${aliceReceived.payload.data.y})`);

  step(6, 'Verify the HTTP room list sees both players');
  const rooms = await alice.listRooms();
  const demoRoom = rooms.find((room) => room.id === roomId);
  requireCondition(demoRoom?.player_count === 2, `expected 2 players in room, got ${JSON.stringify(demoRoom)}`);
  console.log(`Room list confirms ${demoRoom.player_count} players in ${roomId}`);

  step(7, 'Have Bob leave and verify room_left plus Alice player_left event');
  const bobLeft = await bob.leaveRoom();
  requireCondition(bobLeft.room_id === roomId, `expected bob to leave ${roomId}, got ${JSON.stringify(bobLeft)}`);
  console.log(`Bob received room_left for ${bobLeft.room_id}`);
  await alice.waitFor('player_left', (message) => message.payload.player_id === bobJoin.player_id);
  console.log('Alice observed Bob leaving the room.');

  alice.close();
  bob.close();
  console.log('Playlink v0.6 SDK demo passed.');
}

main().catch((error) => {
  alice.close();
  bob.close();
  console.error(error);
  process.exit(1);
});
