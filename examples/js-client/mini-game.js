import {
  PlaylinkClient,
  StateSnapshotFilter,
  StateSnapshotPublisher,
} from './playlink-client.js';

const elements = {
  wsUrl: document.querySelector('#wsUrl'),
  httpUrl: document.querySelector('#httpUrl'),
  playerName: document.querySelector('#playerName'),
  roomId: document.querySelector('#roomId'),
  connectButton: document.querySelector('#connectButton'),
  createButton: document.querySelector('#createButton'),
  joinButton: document.querySelector('#joinButton'),
  botButton: document.querySelector('#botButton'),
  leaveButton: document.querySelector('#leaveButton'),
  status: document.querySelector('#status'),
  currentRoom: document.querySelector('#currentRoom'),
  currentPlayer: document.querySelector('#currentPlayer'),
  botCount: document.querySelector('#botCount'),
  arena: document.querySelector('#arena'),
  log: document.querySelector('#log'),
};

const keys = new Set();
const players = new Map();
const remoteTargets = new Map();
const bots = [];
const snapshotFilter = new StateSnapshotFilter();

let client = null;
let localStatePublisher = null;
let localPosition = { x: 50, y: 50 };
let lastFrameAt = performance.now();

const movementSpeedPixelsPerSecond = 260;
const networkSendIntervalMs = 50;

function log(message, data = undefined) {
  const suffix = data === undefined ? '' : ` ${JSON.stringify(data)}`;
  elements.log.textContent += `${new Date().toLocaleTimeString()} ${message}${suffix}\n`;
  elements.log.scrollTop = elements.log.scrollHeight;
}

function setStatus(status) {
  elements.status.textContent = status;
}

function setConnectedUi(isConnected) {
  elements.connectButton.disabled = isConnected;
  elements.createButton.disabled = !isConnected;
  elements.joinButton.disabled = !isConnected;
}

function setJoinedUi(isJoined) {
  elements.botButton.disabled = !isJoined;
  elements.leaveButton.disabled = !isJoined;
}

function renderSessionSummary() {
  elements.currentRoom.textContent = client?.roomId ?? '-';
  elements.currentPlayer.textContent = client?.playerId ?? '-';
  elements.botCount.textContent = String(bots.length);
}

function playerLabel(playerId) {
  if (playerId === client?.playerId) return 'me';
  const bot = bots.find((candidate) => candidate.playerId === playerId);
  if (bot) return bot.name.slice(0, 2);
  return playerId.slice(0, 2);
}

function renderPlayer(playerId, position, isLocal = false) {
  let node = players.get(playerId);
  if (!node) {
    node = document.createElement('div');
    node.className = `player ${isLocal ? 'local' : 'remote'}`;
    node.textContent = playerLabel(playerId);
    elements.arena.append(node);
    players.set(playerId, node);
  }

  node.style.left = `${position.x}%`;
  node.style.top = `${position.y}%`;
}

function removePlayer(playerId) {
  const node = players.get(playerId);
  node?.remove();
  players.delete(playerId);
  remoteTargets.delete(playerId);
}

function clearPlayers() {
  for (const node of players.values()) {
    node.remove();
  }
  players.clear();
  remoteTargets.clear();
  snapshotFilter.clear();
}

function clamp(value) {
  return Math.max(5, Math.min(95, value));
}

function movementState(playerName, position) {
  return {
    player_name: playerName,
    x: position.x,
    y: position.y,
  };
}

function hasMovementStateChangedEnough(nextState, previousState) {
  if (!previousState) return true;
  return nextState.player_name !== previousState.player_name
    || Math.abs(nextState.x - previousState.x) > 0.1
    || Math.abs(nextState.y - previousState.y) > 0.1;
}

function readSnapshotPosition(snapshot) {
  const x = Number(snapshot?.state?.x);
  const y = Number(snapshot?.state?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp(x), y: clamp(y) };
}

function publishStateSnapshot(force = false) {
  if (!client?.roomId || !client.playerId) return;
  if (client.socket?.readyState !== WebSocket.OPEN) {
    setStatus('disconnected');
    return;
  }
  if (!localStatePublisher) return;

  localStatePublisher.publish(movementState(elements.playerName.value, localPosition), {
    force,
  });
}

function handleStateSnapshotBroadcast(message) {
  const snapshot = message.payload.data;
  if (snapshot?.kind !== 'state_snapshot') return;
  if (!snapshotFilter.accepts(snapshot)) return;

  const from = message.payload.from;
  const position = readSnapshotPosition(snapshot);
  if (!position) return;

  if (from === client?.playerId) {
    renderPlayer(from, position, true);
    return;
  }

  if (!remoteTargets.has(from)) {
    renderPlayer(from, position, false);
  }
  remoteTargets.set(from, position);
}

function installClientHandlers(activeClient, { isPrimary }) {
  activeClient.on('room_broadcast', (message) => {
    if (isPrimary) {
      handleStateSnapshotBroadcast(message);
    }
  });

  activeClient.on('player_joined', (message) => {
    if (isPrimary && message.payload.player_id !== activeClient.playerId && activeClient.roomId) {
      publishStateSnapshot(true);
    }
  });

  activeClient.on('player_left', (message) => {
    if (isPrimary) {
      removePlayer(message.payload.player_id);
      log('player left', message.payload);
    }
  });
}

async function createBot() {
  if (!client?.roomId) return;

  const index = bots.length + 1;
  const bot = {
    name: `bot-${index}`,
    client: new PlaylinkClient({
      name: `bot-${index}`,
      wsUrl: elements.wsUrl.value,
      httpUrl: elements.httpUrl.value,
    }),
    position: { x: 30 + index * 8, y: 35 },
    direction: 1,
    playerId: null,
    publisher: null,
  };

  try {
    await bot.client.connect();
    const joined = await bot.client.joinRoom(client.roomId, bot.name);
    bot.playerId = joined.player_id;
    bot.publisher = new StateSnapshotPublisher({
      client: bot.client,
      entityId: bot.playerId,
      minIntervalMs: networkSendIntervalMs,
      hasChanged: hasMovementStateChangedEnough,
    });
    installClientHandlers(bot.client, { isPrimary: false });
    bots.push(bot);
    renderSessionSummary();

    bot.publisher.publish(movementState(bot.name, bot.position), { force: true });

    log('bot joined', { name: bot.name, playerId: bot.playerId });
  } catch (error) {
    bot.client.close();
    throw error;
  }
}

function updateLocalPlayer(deltaSeconds) {
  if (!client?.roomId || !client.playerId) return;

  let dx = 0;
  let dy = 0;
  if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
  if (keys.has('arrowright') || keys.has('d')) dx += 1;
  if (keys.has('arrowup') || keys.has('w')) dy -= 1;
  if (keys.has('arrowdown') || keys.has('s')) dy += 1;

  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy);
    const speed = movementSpeedPixelsPerSecond * (keys.has('shift') ? 1.6 : 1);
    const arenaBounds = elements.arena.getBoundingClientRect();
    localPosition.x = clamp(localPosition.x + ((dx / length) * speed * deltaSeconds / arenaBounds.width) * 100);
    localPosition.y = clamp(localPosition.y + ((dy / length) * speed * deltaSeconds / arenaBounds.height) * 100);
    publishStateSnapshot(false);
  }

  renderPlayer(client.playerId, localPosition, true);
}

function updateRemotePlayers() {
  for (const [playerId, target] of remoteTargets.entries()) {
    const node = players.get(playerId);
    if (!node) continue;

    const current = {
      x: Number.parseFloat(node.style.left) || target.x,
      y: Number.parseFloat(node.style.top) || target.y,
    };
    const next = {
      x: current.x + (target.x - current.x) * 0.25,
      y: current.y + (target.y - current.y) * 0.25,
    };
    renderPlayer(playerId, next, false);
  }
}

function updateBots(now, deltaSeconds) {
  const arenaBounds = elements.arena.getBoundingClientRect();

  for (const bot of bots) {
    if (!bot.client.roomId || bot.client.socket?.readyState !== WebSocket.OPEN) continue;

    bot.position.x += (bot.direction * 150 * deltaSeconds / arenaBounds.width) * 100;
    if (bot.position.x > 85 || bot.position.x < 15) {
      bot.direction *= -1;
      bot.position.y = clamp(bot.position.y + (36 / arenaBounds.height) * 100);
    }

    bot.publisher?.publish(movementState(bot.name, bot.position), { now });
  }
}

function frame(now) {
  try {
    const deltaSeconds = Math.min(0.05, (now - lastFrameAt) / 1000);
    lastFrameAt = now;

    updateLocalPlayer(deltaSeconds);
    updateRemotePlayers();
    updateBots(now, deltaSeconds);
  } catch (error) {
    log('animation loop error', { message: error.message });
  } finally {
    requestAnimationFrame(frame);
  }
}

requestAnimationFrame(frame);

elements.connectButton.addEventListener('click', async () => {
  client = new PlaylinkClient({
    name: elements.playerName.value || 'player',
    wsUrl: elements.wsUrl.value,
    httpUrl: elements.httpUrl.value,
  });

  installClientHandlers(client, { isPrimary: true });

  try {
    await client.connect();
    client.socket.addEventListener('close', () => {
      setConnectedUi(false);
      setJoinedUi(false);
      for (const bot of bots.splice(0)) {
        bot.client.close();
      }
      localStatePublisher = null;
      clearPlayers();
      renderSessionSummary();
      setStatus('disconnected');
      log('connection closed');
    });
    client.socket.addEventListener('error', () => {
      setStatus('socket error');
      log('socket error');
    });
    const server = await client.serverInfo();
    setConnectedUi(true);
    renderSessionSummary();
    setStatus(`connected to ${server.name} (${server.topology})`);
    log('server info', server);
  } catch (error) {
    client.close();
    client = null;
    renderSessionSummary();
    setStatus('connection failed');
    log('connection failed', { message: error.message });
  }
});

elements.createButton.addEventListener('click', async () => {
  try {
    const roomId = await client.createRoom({ roomName: 'mini-game', maxPlayers: 4 });
    elements.roomId.value = roomId;
    log('created room', { roomId });
  } catch (error) {
    log('failed to create room', { message: error.message, code: error.code });
  }
});

elements.joinButton.addEventListener('click', async () => {
  const roomId = elements.roomId.value.trim();
  if (!roomId) {
    log('room id is required');
    return;
  }

  try {
    const joined = await client.joinRoom(roomId, elements.playerName.value || 'player');
    setJoinedUi(true);
    renderSessionSummary();
    setStatus(`joined room ${joined.room_id}`);
    localPosition = { x: 50, y: 50 };
    localStatePublisher = new StateSnapshotPublisher({
      client,
      entityId: joined.player_id,
      minIntervalMs: networkSendIntervalMs,
      hasChanged: hasMovementStateChangedEnough,
    });
    renderPlayer(joined.player_id, localPosition, true);
    publishStateSnapshot(true);
    log('joined room', joined);
  } catch (error) {
    log('failed to join room', { message: error.message, code: error.code });
  }
});

elements.botButton.addEventListener('click', async () => {
  try {
    await createBot();
  } catch (error) {
    log('failed to add bot', { message: error.message, code: error.code });
  }
});

elements.leaveButton.addEventListener('click', async () => {
  for (const bot of bots.splice(0)) {
    bot.client.close();
  }
  renderSessionSummary();

  try {
    await client.leaveRoom();
    localStatePublisher = null;
    clearPlayers();
    renderSessionSummary();
    setJoinedUi(false);
    setStatus('connected, not in room');
    log('left room');
  } catch (error) {
    log('failed to leave room', { message: error.message, code: error.code });
  }
});

renderSessionSummary();

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', 'shift'].includes(key)) {
    event.preventDefault();
    keys.add(key);
  }
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.key.toLowerCase());
});
