/**
 * Playlink Tank Wars
 *
 * Two-player browser tank battle over the Playlink v1.x protocol.
 *
 * Wire layout:
 *   - State sync: each player publishes a `state_snapshot` (tick + state)
 *     with `kind: 'state_snapshot'`, `entity_id: <player id>` and
 *     `state: { x, y, angle, hp, name }`. Receivers apply the snapshot to
 *     their tank state map.
 *   - Events: bullets are sent as ordinary `room_message` payloads of
 *     shape `{ kind: 'bullet', id, x, y, angle, from }`. Hit detection
 *     runs on each client; when a tank is hit, a `hit` event is sent
 *     so the victim's client can decrement HP and respawn.
 *
 * The server does not interpret the payloads; it just relays them.
 */

import {
  PlaylinkClient,
  ProtocolError,
  ERROR_CODES,
  createStateSnapshot,
  StateSnapshotFilter,
  StateSnapshotPublisher,
} from '@playlink/client';

const ARENA_SIZE = 800;
const TANK_SPEED = 160; // pixels per second
const TANK_TURN_SPEED = 2.4; // radians per second
const BULLET_SPEED = 420;
const BULLET_LIFETIME_MS = 1500;
const FIRE_COOLDOWN_MS = 350;
const MAX_HP = 3;
const RESPAWN_DELAY_MS = 1500;
const SNAPSHOT_INTERVAL_MS = 50; // 20 Hz

const elements = {
  arena: document.querySelector('#arena'),
  state: document.querySelector('#state'),
  roomId: document.querySelector('#roomId'),
  playerCount: document.querySelector('#playerCount'),
  wsUrl: document.querySelector('#wsUrl'),
  playerName: document.querySelector('#playerName'),
  roomIdInput: document.querySelector('#roomIdInput'),
  connectBtn: document.querySelector('#connectBtn'),
  createBtn: document.querySelector('#createBtn'),
  joinBtn: document.querySelector('#joinBtn'),
  leaveBtn: document.querySelector('#leaveBtn'),
  log: document.querySelector('#log'),
};

const ctx = elements.arena.getContext('2d');

// Per-player tank state, keyed by player id.
const tanks = new Map();
// Active bullets, keyed by bullet id.
const bullets = new Map();
// Last fire timestamp per player.
const lastFireAt = new Map();

let client = null;
let localPlayerId = null;
let localTank = null; // { x, y, angle, hp, name, deadUntil }
let snapshotFilter = null;
let snapshotPublisher = null;
let keys = new Set();
let lastFrame = performance.now();

const params = new URLSearchParams(window.location.search);
if (params.has('ws')) elements.wsUrl.value = params.get('ws');
if (params.has('room')) elements.roomIdInput.value = params.get('room');

function log(message, data = undefined) {
  const time = new Date().toLocaleTimeString();
  const suffix = data === undefined ? '' : ` ${JSON.stringify(data)}`;
  elements.log.textContent += `[${time}] ${message}${suffix}\n`;
  elements.log.scrollTop = elements.log.scrollHeight;
}

function setStatus(state, roomId = null) {
  elements.state.textContent = state;
  if (roomId !== null) {
    elements.roomId.textContent = roomId.slice(0, 8);
  }
  const connected = state === 'connected' || state === 'joining' || state === 'in_room';
  const inRoom = !!roomId && roomId !== '-';
  elements.createBtn.disabled = !connected || inRoom;
  elements.joinBtn.disabled = !connected || inRoom || !elements.roomIdInput.value.trim();
  elements.leaveBtn.disabled = !inRoom;
  elements.connectBtn.textContent = connected ? 'Disconnect' : 'Connect';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function spawnPosition() {
  const padding = 60;
  const x = padding + Math.random() * (ARENA_SIZE - 2 * padding);
  const y = padding + Math.random() * (ARENA_SIZE - 2 * padding);
  return { x, y, angle: Math.random() * Math.PI * 2 };
}

function ensureLocalTank() {
  if (localTank) return;
  const spawn = spawnPosition();
  localTank = {
    playerId: localPlayerId,
    name: elements.playerName.value.trim() || 'tank',
    ...spawn,
    hp: MAX_HP,
    deadUntil: 0,
  };
  tanks.set(localPlayerId, localTank);
}

function respawnLocal() {
  const spawn = spawnPosition();
  localTank.x = spawn.x;
  localTank.y = spawn.y;
  localTank.angle = spawn.angle;
  localTank.hp = MAX_HP;
  localTank.deadUntil = 0;
  publishSnapshot(true);
}

function publishSnapshot(force) {
  if (!localTank) return;
  const payload = {
    x: Math.round(localTank.x),
    y: Math.round(localTank.y),
    angle: Number(localTank.angle.toFixed(2)),
    hp: localTank.hp,
    name: localTank.name,
  };
  snapshotPublisher.publish(payload, { force });
}

function applyRemoteSnapshot(snapshot) {
  const playerId = snapshot.entity_id;
  if (playerId === localPlayerId) return;
  const existing = tanks.get(playerId) ?? {};
  tanks.set(playerId, {
    playerId,
    name: snapshot.state.name ?? existing.name ?? 'remote',
    x: snapshot.state.x,
    y: snapshot.state.y,
    angle: snapshot.state.angle,
    hp: snapshot.state.hp,
    deadUntil: existing.deadUntil ?? 0,
  });
}

function updatePlayerCount() {
  elements.playerCount.textContent = `${tanks.size}/2`;
}

function drawArena() {
  ctx.fillStyle = '#1a2438';
  ctx.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);

  // Grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < ARENA_SIZE; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, ARENA_SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(ARENA_SIZE, i);
    ctx.stroke();
  }

  // Bullets
  for (const bullet of bullets.values()) {
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tanks
  for (const tank of tanks.values()) {
    if (tank.deadUntil > performance.now()) continue;
    drawTank(tank);
  }
}

function drawTank(tank) {
  ctx.save();
  ctx.translate(tank.x, tank.y);
  ctx.rotate(tank.angle);

  const isLocal = tank.playerId === localPlayerId;
  ctx.fillStyle = isLocal ? '#22c55e' : '#f97316';
  ctx.strokeStyle = isLocal ? '#15803d' : '#9a3412';
  ctx.lineWidth = 2;
  ctx.fillRect(-18, -14, 36, 28);
  ctx.strokeRect(-18, -14, 36, 28);

  // Cannon
  ctx.fillStyle = isLocal ? '#15803d' : '#9a3412';
  ctx.fillRect(0, -3, 24, 6);

  // Health bar
  ctx.rotate(-tank.angle);
  const hpWidth = 40 * (tank.hp / MAX_HP);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-20, -26, 40, 6);
  ctx.fillStyle = tank.hp > 1 ? '#22c55e' : '#f87171';
  ctx.fillRect(-20, -26, hpWidth, 6);

  ctx.restore();

  // Name label
  ctx.fillStyle = '#e5e7eb';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(tank.name, tank.x, tank.y - 32);
}

function tick() {
  const now = performance.now();
  const delta = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  if (localTank && localTank.deadUntil <= now) {
    let moved = false;
    let dx = 0;
    if (keys.has('w') || keys.has('arrowup')) dx = 1;
    if (keys.has('s') || keys.has('arrowdown')) dx = -1;
    if (dx !== 0) {
      localTank.x += Math.cos(localTank.angle) * TANK_SPEED * dx * delta;
      localTank.y += Math.sin(localTank.angle) * TANK_SPEED * dx * delta;
      localTank.x = clamp(localTank.x, 20, ARENA_SIZE - 20);
      localTank.y = clamp(localTank.y, 20, ARENA_SIZE - 20);
      moved = true;
    }
    if (keys.has('a') || keys.has('arrowleft')) {
      localTank.angle -= TANK_TURN_SPEED * delta;
      moved = true;
    }
    if (keys.has('d') || keys.has('arrowright')) {
      localTank.angle += TANK_TURN_SPEED * delta;
      moved = true;
    }
    if (moved) publishSnapshot(false);
  }

  // Update bullets.
  const liveBullets = [];
  for (const bullet of bullets.values()) {
    if (now - bullet.createdAt > BULLET_LIFETIME_MS) continue;
    bullet.x += Math.cos(bullet.angle) * BULLET_SPEED * delta;
    bullet.y += Math.sin(bullet.angle) * BULLET_SPEED * delta;
    if (bullet.x < 0 || bullet.x > ARENA_SIZE || bullet.y < 0 || bullet.y > ARENA_SIZE) continue;

    // Hit detection: only the client that fired the bullet checks for hits,
    // so the authoritative decrement happens on the victim's client.
    if (bullet.from === localPlayerId) {
      for (const tank of tanks.values()) {
        if (tank.playerId === localPlayerId) continue;
        if (tank.deadUntil > now) continue;
        const dx = tank.x - bullet.x;
        const dy = tank.y - bullet.y;
        if (dx * dx + dy * dy < 22 * 22) {
          bullet.hit = true;
          client.sendRoomMessage({
            kind: 'hit',
            target: tank.playerId,
            bullet: bullet.id,
            from: bullet.from,
          });
          break;
        }
      }
    }
    liveBullets.push(bullet);
  }
  bullets.clear();
  for (const bullet of liveBullets) {
    if (!bullet.hit) bullets.set(bullet.id, bullet);
  }

  drawArena();
  requestAnimationFrame(tick);
}

function fire() {
  if (!localTank) return;
  const now = performance.now();
  if (localTank.deadUntil > now) return;
  const last = lastFireAt.get(localPlayerId) ?? 0;
  if (now - last < FIRE_COOLDOWN_MS) return;
  lastFireAt.set(localPlayerId, now);
  const id = `${localPlayerId}-${now}`;
  const bullet = {
    id,
    x: localTank.x + Math.cos(localTank.angle) * 24,
    y: localTank.y + Math.sin(localTank.angle) * 24,
    angle: localTank.angle,
    from: localPlayerId,
    createdAt: now,
    hit: false,
  };
  bullets.set(id, bullet);
  client.sendRoomMessage({ kind: 'bullet', id, x: bullet.x, y: bullet.y, angle: bullet.angle, from: localPlayerId });
}

function setupClient(newClient) {
  newClient.on('state_change', (state) => {
    if (state === 'connected') setStatus('connected');
    if (state === 'disconnected') setStatus('disconnected');
    if (state === 'reconnecting') setStatus('reconnecting');
  });
  newClient.on('player_joined', (message) => {
    log('player joined', { id: message.payload.player_id, name: message.payload.player_name });
  });
  newClient.on('player_left', (message) => {
    log('player left', { id: message.payload.player_id });
    tanks.delete(message.payload.player_id);
    updatePlayerCount();
  });
  newClient.on('room_broadcast', (message) => {
    const data = message.payload.data;
    if (!data || typeof data !== 'object') return;
    if (data.kind === 'state_snapshot') {
      if (snapshotFilter.accepts(data)) applyRemoteSnapshot(data);
      updatePlayerCount();
    } else if (data.kind === 'bullet') {
      if (data.from !== localPlayerId) {
        bullets.set(data.id, {
          id: data.id,
          x: data.x,
          y: data.y,
          angle: data.angle,
          from: data.from,
          createdAt: performance.now(),
          hit: false,
        });
      }
    } else if (data.kind === 'hit') {
      if (data.target === localPlayerId) {
        const tank = tanks.get(localPlayerId);
        if (tank && tank.hp > 0) {
          tank.hp -= 1;
          if (tank.hp <= 0) {
            tank.deadUntil = performance.now() + RESPAWN_DELAY_MS;
            setTimeout(respawnLocal, RESPAWN_DELAY_MS);
            log('you were destroyed, respawning...', { from: data.from });
          } else {
            log('hit!', { hp: tank.hp, from: data.from });
          }
        }
      }
    }
  });
  newClient.on('room_left', (message) => {
    log('left room', { roomId: message.payload.room_id });
    setStatus('connected');
    tanks.clear();
    localTank = null;
    updatePlayerCount();
  });
  newClient.on('reconnected', () => log('reconnected'));
  newClient.on('rejoin_failed', (error) => log('rejoin failed', { code: error.code, message: error.message }));
}

async function connect() {
  if (client) {
    client.close();
    client = null;
    return;
  }
  elements.connectBtn.disabled = true;
  client = new PlaylinkClient({
    name: elements.playerName.value.trim() || 'tank',
    wsUrl: elements.wsUrl.value.trim(),
    keepaliveIntervalMs: 5000,
  });
  setupClient(client);
  try {
    await client.connect();
    setStatus('connected');
  } catch (error) {
    log('connect failed', { message: error.message });
    setStatus('disconnected');
    client = null;
  } finally {
    elements.connectBtn.disabled = false;
  }
}

async function createRoom() {
  if (!client) return;
  try {
    const roomId = await client.createRoom({ roomName: 'tanks', maxPlayers: 2 });
    elements.roomIdInput.value = roomId;
    await joinRoom(roomId);
  } catch (error) {
    handleError('create', error);
  }
}

async function joinRoom(roomId) {
  if (!client) return;
  roomId = roomId ?? elements.roomIdInput.value.trim();
  if (!roomId) {
    log('room id required');
    return;
  }
  try {
    localPlayerId = null;
    localTank = null;
    snapshotFilter = new StateSnapshotFilter();
    const join = await client.joinRoom(roomId, elements.playerName.value.trim() || 'tank');
    localPlayerId = join.player_id;
    snapshotPublisher = new StateSnapshotPublisher({
      client,
      entityId: localPlayerId,
      minIntervalMs: SNAPSHOT_INTERVAL_MS,
    });
    setStatus('in_room', roomId);
    ensureLocalTank();
    publishSnapshot(true);
    updatePlayerCount();
    log('joined', { roomId, playerId: localPlayerId });
  } catch (error) {
    handleError('join', error);
  }
}

function handleError(action, error) {
  if (error instanceof ProtocolError) {
    log(`${action} failed: ${error.code} - ${error.message}`);
    if (error.code === ERROR_CODES.ROOM_FULL) {
      log('room is full; create a new one or wait');
    } else if (error.code === ERROR_CODES.NOT_IN_ROOM) {
      log('not in a room; create or join first');
    }
  } else {
    log(`${action} failed: ${error.message}`);
  }
}

function leaveRoom() {
  if (!client || !client.roomId) return;
  client.leaveRoom().catch((error) => log('leave failed', { message: error.message }));
}

elements.connectBtn.addEventListener('click', connect);
elements.createBtn.addEventListener('click', createRoom);
elements.joinBtn.addEventListener('click', () => joinRoom());
elements.leaveBtn.addEventListener('click', leaveRoom);

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
    event.preventDefault();
    keys.add(key);
    if (key === ' ') fire();
  }
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.key.toLowerCase());
});

setStatus('disconnected');
updatePlayerCount();
requestAnimationFrame(tick);
log('ready. Click Connect, then Create or Join a room.');
