/**
 * Playlink Tank Wars
 *
 * Two-player browser tank battle over the Playlink v1.x protocol.
 * All game logic is client-side; the server relays messages only.
 *
 * Known desync mitigations:
 *   - On player_joined, existing players force-publish their snapshot.
 *   - Remote tanks are interpolated (lerp) toward their snapshot position.
 *   - Bullets use delta-based per-frame advancement (not wall-clock) so
 *     bullet motion and hit-detection are in sync with remote tank positions.
 *   - Sweep hit-testing along the bullet's path prevents "bullet skip".
 *   - On hit, all clients remove the bullet so it doesn't visually pass through.
 */

import {
  PlaylinkClient,
  ProtocolError,
  ERROR_CODES,
  StateSnapshotFilter,
  StateSnapshotPublisher,
} from '@playlink/client';

const ARENA_SIZE = 800;
const TANK_SPEED = 160;
const BULLET_SPEED = 420;
const BULLET_LIFETIME_MS = 1500;
const FIRE_COOLDOWN_MS = 350;
const MAX_HP = 3;
const RESPAWN_DELAY_MS = 1000;
const SNAPSHOT_INTERVAL_MS = 50;
const INTERP_SPEED = 10;

// ── arena layout (same on all clients) ──
const WALLS = [
  { x: 200, y: 200, w: 40, h: 160 },
  { x: 560, y: 200, w: 40, h: 160 },
  { x: 200, y: 440, w: 40, h: 160 },
  { x: 560, y: 440, w: 40, h: 160 },
  { x: 350, y: 370, w: 100, h: 40 },
  { x: 0, y: 0, w: 800, h: 8 },
  { x: 0, y: 792, w: 800, h: 8 },
  { x: 0, y: 0, w: 8, h: 800 },
  { x: 792, y: 0, w: 8, h: 800 },
];
const ENEMY_SPAWN_INTERVAL = 6000;
const ENEMY_SPEED = 90;
const ENEMY_FIRE_COOLDOWN = 1200;
const ITEM_SPAWN_INTERVAL = 8000;
const MAX_ENEMIES = 4;
const LIVES_PER_PLAYER = 3;
const WIN_SCORE = 10;
const BOMB_RADIUS = 80;
const BOMB_DAMAGE = 2;

function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function touchesWall(x, y, r) {
  for (const w of WALLS) {
    if (aabbOverlap({ x: x - r, y: y - r, w: r * 2, h: r * 2 }, w)) return w;
  }
  return null;
}

function overlapsTanks(x, y, r, excludeId) {
  for (const tank of tanks.values()) {
    if (tank.playerId === excludeId) continue;
    if (tank.deadUntil > performance.now()) continue;
    if (Math.hypot(tank.x - x, tank.y - y) < r + 18) return true;
  }
  for (const e of enemies.values()) {
    if (e.hp <= 0 || e.id === excludeId) continue;
    if (Math.hypot(e.x - x, e.y - y) < r + 18) return true;
  }
  return false;
}

// ── debug overlay state ──
let debugFps = 0;
let debugPing = 0;
let lastFpsTime = 0;
let frameCount = 0;
let pingTimer = null;

async function measurePing() {
  if (!client || client.state !== 'connected') return;
  const t0 = performance.now();
  try {
    await client.ping();
    debugPing = Math.round(performance.now() - t0);
  } catch {
    debugPing = -1;
  }
}

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
  roomPanel: document.querySelector('#roomPanel'),
  roomIdDisplay: document.querySelector('#roomIdDisplay'),
  copyRoomBtn: document.querySelector('#copyRoomBtn'),
  roomsList: document.querySelector('#roomsList'),
  gameOverPanel: document.querySelector('#gameOverPanel'),
  gameOverTitle: document.querySelector('#gameOverTitle'),
  gameOverSubtitle: document.querySelector('#gameOverSubtitle'),
  restartBtn: document.querySelector('#restartBtn'),
};

const ctx = elements.arena.getContext('2d');

const tanks = new Map();
const bullets = new Map();
const lastFireAt = new Map();

let client = null;
let localPlayerId = null;
let localTank = null;
let snapshotFilter = null;
let snapshotPublisher = null;
let keys = new Set();
let mouseWorld = { x: ARENA_SIZE / 2, y: ARENA_SIZE / 2 };
let lastFrame = performance.now();
let isHost = false;
let enemies = new Map();
let items = [];
let enemySpawnTimer = 0;
let itemSpawnTimer = 0;
let nextEnemyId = 0;
let playerScore = 0;
let playerLives = LIVES_PER_PLAYER;
let heldItem = null;
let gameOverText = null;

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
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = padding + Math.random() * (ARENA_SIZE - 2 * padding);
    const y = padding + Math.random() * (ARENA_SIZE - 2 * padding);
    if (!touchesWall(x, y, 20)) {
      return { x, y, angle: Math.random() * Math.PI * 2 };
    }
  }
  return { x: 400, y: 400, angle: 0 };
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
    score: 0,
    lives: LIVES_PER_PLAYER,
  };
  tanks.set(localPlayerId, localTank);
}

function respawnLocal() {
  if (playerLives <= 0) {
    return;
  }
  const spawn = spawnPosition();
  localTank.x = spawn.x;
  localTank.y = spawn.y;
  localTank.angle = spawn.angle;
  localTank.hp = MAX_HP;
  localTank.deadUntil = 0;
  // remove stale bullets from this player
  for (const [id, b] of bullets) {
    if (b.from === localPlayerId) bullets.delete(id);
  }
  // broadcast new state
  publishSnapshot(true);
  log('respawned');
}

function markLocalDestroyed(from) {
  if (!localTank || localTank.hp > 0 || localTank.deadUntil > performance.now()) return;
  playerLives = Math.max(0, playerLives - 1);
  localTank.hp = 0;
  if (playerLives <= 0) {
    localTank.deadUntil = Number.POSITIVE_INFINITY;
    publishSnapshot(true);
    setGameOver('You lost - all lives exhausted!');
    return;
  }
  localTank.deadUntil = performance.now() + RESPAWN_DELAY_MS;
  publishSnapshot(true);
  log('you were destroyed, respawning...', { lives: playerLives, from });
}

function setGameOver(message) {
  if (gameOverText) return;
  gameOverText = message;
  keys.clear();
  heldItem = null;
  log('GAME OVER: ' + message);
  showGameOverPanel(message);
}

function showGameOverPanel(message) {
  if (!elements.gameOverPanel) return;
  elements.gameOverTitle.textContent = message;
  elements.gameOverSubtitle.textContent = `Score ${playerScore} / ${WIN_SCORE}   Lives ${playerLives}`;
  elements.gameOverPanel.style.display = 'flex';
}

function hideGameOverPanel() {
  if (!elements.gameOverPanel) return;
  elements.gameOverPanel.style.display = 'none';
}

function restartRound() {
  if (!client || !client.roomId) return;
  resetRoundState();
  // Tell the other player to reset too.
  if (client.sendRoomMessage) {
    client.sendRoomMessage({ kind: 'round_restart' });
  }
  log('round restarted');
}

function resetRoundState() {
  playerScore = 0;
  playerLives = LIVES_PER_PLAYER;
  heldItem = null;
  gameOverText = null;
  bullets.clear();
  enemies.clear();
  items = [];
  enemySpawnTimer = 0;
  itemSpawnTimer = 0;
  keys.clear();
  hideGameOverPanel();
  if (localTank) {
    const spawn = spawnPosition();
    localTank.x = spawn.x;
    localTank.y = spawn.y;
    localTank.angle = spawn.angle;
    localTank.hp = MAX_HP;
    localTank.deadUntil = 0;
    localTank.score = 0;
    localTank.lives = LIVES_PER_PLAYER;
  }
  for (const tank of tanks.values()) {
    if (tank.playerId === localPlayerId) continue;
    tank.hp = MAX_HP;
    tank.deadUntil = 0;
    tank.score = 0;
    tank.lives = LIVES_PER_PLAYER;
  }
  publishSnapshot(true);
}

function addScore(amount, reason) {
  playerScore += amount;
  log(`${reason} score: ${playerScore}`);
  publishSnapshot(true);
  if (playerScore >= WIN_SCORE) setGameOver('You win - 10 enemies destroyed!');
}

function updateMouseWorld(event) {
  const rect = elements.arena.getBoundingClientRect();
  mouseWorld = {
    x: clamp((event.clientX - rect.left) * ARENA_SIZE / rect.width, 0, ARENA_SIZE),
    y: clamp((event.clientY - rect.top) * ARENA_SIZE / rect.height, 0, ARENA_SIZE),
  };
}

function publishSnapshot(force) {
  if (!localTank) return;
  snapshotPublisher.publish({
    x: Math.round(localTank.x),
    y: Math.round(localTank.y),
    angle: Number(localTank.angle.toFixed(2)),
    hp: localTank.hp,
    name: localTank.name,
    score: playerScore,
    lives: playerLives,
  }, { force });
}

// ── remote tank interpolation ──

function applyRemoteSnapshot(snapshot) {
  const playerId = snapshot.entity_id;
  if (playerId === localPlayerId) return;
  const existing = tanks.get(playerId);
  if (!existing) {
    // first sighting — place directly
    tanks.set(playerId, {
      playerId,
      name: snapshot.state.name ?? 'remote',
      x: snapshot.state.x,
      y: snapshot.state.y,
      angle: snapshot.state.angle,
      hp: snapshot.state.hp,
      deadUntil: snapshot.state.hp <= 0 ? performance.now() + RESPAWN_DELAY_MS : 0,
      score: snapshot.state.score ?? 0,
      lives: snapshot.state.lives ?? LIVES_PER_PLAYER,
      // interpolation target
      targetX: snapshot.state.x,
      targetY: snapshot.state.y,
      targetAngle: snapshot.state.angle,
    });
    return;
  }
  // update via interpolation target
  existing.name = snapshot.state.name ?? existing.name;
  existing.hp = snapshot.state.hp;
  existing.score = snapshot.state.score ?? existing.score;
  existing.lives = snapshot.state.lives ?? existing.lives;
  if (existing.hp <= 0) existing.deadUntil = existing.lives <= 0 ? Number.POSITIVE_INFINITY : performance.now() + RESPAWN_DELAY_MS;
  else existing.deadUntil = 0;
  existing.targetX = snapshot.state.x;
  existing.targetY = snapshot.state.y;
  existing.targetAngle = snapshot.state.angle;
  if (existing.lives <= 0 && existing.hp <= 0 && !gameOverText) setGameOver('You win - opponent eliminated!');
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function angleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
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

  // Walls
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  for (const w of WALLS) {
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeRect(w.x, w.y, w.w, w.h);
  }

  // Items
  const now = performance.now();
  for (const item of items) {
    if (item.collected) continue;
    const color = item.type === 'shield' ? '#38bdf8' : item.type === 'bomb' ? '#f87171' : '#22c55e';
    const pulse = 10 + Math.sin(now / 300 + item.x) * 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(item.x, item.y, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = item.type === 'shield' ? 'S' : item.type === 'bomb' ? 'B' : '+';
    ctx.fillText(label, item.x, item.y + 1);
  }

  // Enemies
  for (const e of enemies.values()) {
    if (e.hp <= 0) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 2;
    ctx.fillRect(-18, -14, 36, 28);
    ctx.strokeRect(-18, -14, 36, 28);
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(0, -3, 24, 6);
    ctx.restore();
  }

  // Bullets
  for (const bullet of bullets.values()) {
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (heldItem === 'bomb' && localTank && localTank.hp > 0 && !gameOverText) {
    ctx.strokeStyle = 'rgba(248,113,113,0.75)';
    ctx.fillStyle = 'rgba(248,113,113,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mouseWorld.x, mouseWorld.y, BOMB_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Tanks
  for (const tank of tanks.values()) {
    if (tank.deadUntil > performance.now()) continue;
    drawTank(tank);
  }

  // HUD (local player info)
  if (localTank) {
    const alive = localTank.hp > 0 && localTank.deadUntil <= now;
    let hpDisplay = localTank.hp;
    if (localTank.hp > MAX_HP) hpDisplay = `${MAX_HP}+${localTank.hp - MAX_HP}`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(10, 10, 200, 66);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${localTank.name}  HP ${hpDisplay}/${MAX_HP}  ♥${playerLives}  ★${playerScore}`, 18, 16);
    // HP bar
    const barW = 140;
    const barH = 8;
    const barY = 36;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(18, barY, barW, barH);
    const hpFrac = Math.min(localTank.hp / MAX_HP, 1);
    ctx.fillStyle = hpFrac > 0.5 ? '#22c55e' : hpFrac > 0.25 ? '#facc15' : '#f87171';
    ctx.fillRect(18, barY, barW * hpFrac, barH);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.strokeRect(18, barY, barW, barH);
    if (!alive) {
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 14px system-ui';
      ctx.fillText(playerLives > 0 ? 'RESPAWNING...' : 'ELIMINATED', 18, 54);
    }
    // Opponent info
    for (const tank of tanks.values()) {
      if (tank.playerId === localPlayerId || tank.playerId === undefined) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(10, 80, 200, 20);
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`vs ${tank.name}  ♥${tank.lives ?? LIVES_PER_PLAYER}  ★${tank.score ?? 0}`, 18, 84);
    }
    if (heldItem) {
      ctx.fillStyle = 'rgba(248,113,113,0.9)';
      ctx.fillRect(18, 104, 84, 22);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px system-ui';
      ctx.fillText(`Item: ${heldItem.toUpperCase()}`, 26, 108);
    }
  }

  ctx.fillStyle = 'rgba(15,23,42,0.72)';
  ctx.fillRect(560, 10, 230, 78);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Move: W/S or ↑/↓', 572, 18);
  ctx.fillText('Aim: mouse   Fire: left click / Space', 572, 36);
  ctx.fillText('Use item: right click / E', 572, 54);
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

  ctx.fillStyle = isLocal ? '#15803d' : '#9a3412';
  ctx.fillRect(0, -3, 24, 6);

  // health bar
  ctx.rotate(-tank.angle);
  const hpWidth = 40 * (Math.min(tank.hp, MAX_HP) / MAX_HP);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-20, -26, 40, 6);
  ctx.fillStyle = tank.hp > 1 ? (tank.hp > MAX_HP ? '#38bdf8' : '#22c55e') : '#f87171';
  ctx.fillRect(-20, -26, hpWidth, 6);

  ctx.restore();

  // name
  ctx.fillStyle = '#e5e7eb';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(tank.name, tank.x, tank.y - 32);
}

function tick() {
  const now = performance.now();
  const delta = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  frameCount++;
  if (now - lastFpsTime >= 1000) {
    debugFps = Math.round(frameCount * 1000 / (now - lastFpsTime));
    frameCount = 0;
    lastFpsTime = now;
  }

  // ── local movement ──
  if (localTank && localTank.deadUntil <= now && !gameOverText) {
    localTank.angle = Math.atan2(mouseWorld.y - localTank.y, mouseWorld.x - localTank.x);
    let forward = 0;
    let strafe = 0;
    if (keys.has('w') || keys.has('arrowup')) forward = 1;
    if (keys.has('s') || keys.has('arrowdown')) forward = -1;
    if (keys.has('d') || keys.has('arrowright')) strafe = 1;
    if (keys.has('a') || keys.has('arrowleft')) strafe = -1;
    if (forward !== 0 || strafe !== 0) {
      const len = Math.hypot(forward, strafe) || 1;
      const vx = (Math.cos(localTank.angle) * forward + Math.cos(localTank.angle + Math.PI / 2) * strafe) / len;
      const vy = (Math.sin(localTank.angle) * forward + Math.sin(localTank.angle + Math.PI / 2) * strafe) / len;
      const nx = localTank.x + vx * TANK_SPEED * delta;
      const ny = localTank.y + vy * TANK_SPEED * delta;
      if (!touchesWall(nx, ny, 18) && !overlapsTanks(nx, ny, 18, localPlayerId)) {
        localTank.x = clamp(nx, 20, ARENA_SIZE - 20);
        localTank.y = clamp(ny, 20, ARENA_SIZE - 20);
      }
    }
    publishSnapshot(false);
  }

  // ── auto-respawn (game-loop based, not setTimeout) ──
  if (!gameOverText && localTank && localTank.hp <= 0 && localTank.deadUntil > 0 && localTank.deadUntil <= now) {
    respawnLocal();
  }

  // ── interpolate remote tanks ──
  for (const tank of tanks.values()) {
    if (tank.playerId === localPlayerId) continue;
    if (tank.deadUntil > now) continue;
    if (tank.targetX !== undefined) {
      tank.x = lerp(tank.x, tank.targetX, INTERP_SPEED * delta);
      tank.y = lerp(tank.y, tank.targetY, INTERP_SPEED * delta);
      tank.angle += angleDelta(tank.angle, tank.targetAngle) * INTERP_SPEED * delta;
    }
  }

  // ── update bullets ──
  if (gameOverText) {
    bullets.clear();
  } else {
    const liveBullets = [];
    for (const bullet of bullets.values()) {
      const prevX = bullet.x;
      const prevY = bullet.y;
      const advance = Math.min(delta, 0.1);
      bullet.x += Math.cos(bullet.angle) * BULLET_SPEED * advance;
      bullet.y += Math.sin(bullet.angle) * BULLET_SPEED * advance;

      // Sweep hit-test from previous position to new position.
      const dist = Math.hypot(bullet.x - prevX, bullet.y - prevY);
      const steps = Math.max(1, Math.ceil(dist / 12));
      for (let i = 0; i <= steps && !bullet.hit; i++) {
        const t = i / steps;
        const cx = prevX + (bullet.x - prevX) * t;
        const cy = prevY + (bullet.y - prevY) * t;
        if (bullet.from === localPlayerId || bullet.from.startsWith('enemy')) {
          const isEnemy = bullet.from.startsWith('enemy');
          for (const tank of tanks.values()) {
            // Player bullets check other players; enemy bullets check the local player.
            if (!isEnemy && tank.playerId === localPlayerId) continue;
            if (isEnemy && tank.playerId !== localPlayerId) continue;
            if (tank.deadUntil > performance.now()) continue;
            const dx = tank.x - cx;
            const dy = tank.y - cy;
            if (dx * dx + dy * dy < 22 * 22) {
              bullet.hit = true;
              const targetTank = tanks.get(tank.playerId);
              if (targetTank && targetTank.hp > 0) {
                targetTank.hp -= 1;
                if (targetTank.hp <= 0) {
                  if (targetTank.playerId === localPlayerId) markLocalDestroyed(bullet.from);
                  else targetTank.deadUntil = performance.now() + RESPAWN_DELAY_MS;
                }
              }
              if (isEnemy) {
                // Enemy bullets damage the local player; sync via snapshot.
                publishSnapshot(true);
              } else {
                client.sendRoomMessage({ kind: 'hit', target: tank.playerId, bullet: bullet.id, from: bullet.from });
              }
              break;
            }
          }
        }
        // Enemy hit check (host checks all player bullets against enemies).
        if (!bullet.hit && isHost && !bullet.from.startsWith('enemy')) {
          for (const e of enemies.values()) {
            if (e.hp <= 0) continue;
            const dx = e.x - cx;
            const dy = e.y - cy;
            if (dx * dx + dy * dy < 22 * 22) {
              bullet.hit = true;
              e.hp -= 1;
              if (e.hp <= 0) {
                // Increment score for the shooter locally, then notify the other player.
                if (bullet.from === localPlayerId) {
                  addScore(1, 'enemy destroyed!');
                }
                client.sendRoomMessage({ kind: 'enemy_killed', shooter: bullet.from });
              }
              break;
            }
          }
        }
      }

      // Check expiry by distance traveled (≈ 1.5s of flight).
      const traveled = Math.hypot(bullet.x - bullet.startX, bullet.y - bullet.startY);
      const expired = traveled >= BULLET_SPEED * (BULLET_LIFETIME_MS / 1000);
      const outOfBounds = bullet.x < 0 || bullet.x > ARENA_SIZE || bullet.y < 0 || bullet.y > ARENA_SIZE;
      if (!bullet.hit && !expired && !outOfBounds) {
        // Wall collision check during sweep (bullet might skip a thin wall).
        let inWall = false;
        const steps = Math.max(1, Math.ceil(Math.hypot(bullet.x - prevX, bullet.y - prevY) / 8));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const cx = prevX + (bullet.x - prevX) * t;
          const cy = prevY + (bullet.y - prevY) * t;
          if (touchesWall(cx, cy, 3)) { inWall = true; break; }
        }
        if (!inWall) liveBullets.push(bullet);
      }
    }
    bullets.clear();
    for (const b of liveBullets) {
      bullets.set(b.id, b);
    }
  }

  // ── update enemies (host only) ──
  if (isHost) {
    if (gameOverText) {
      enemies.clear();
    } else {
      enemySpawnTimer += delta * 1000;
      while (enemySpawnTimer >= ENEMY_SPAWN_INTERVAL && enemies.size < MAX_ENEMIES) {
        enemySpawnTimer -= ENEMY_SPAWN_INTERVAL;
        spawnEnemy();
      }
      updateEnemies(delta);
      broadcastEnemyState();

      itemSpawnTimer += delta * 1000;
      if (itemSpawnTimer >= ITEM_SPAWN_INTERVAL && items.length < 3) {
        itemSpawnTimer = 0;
        spawnItem();
      }
    }
  }

  // ── update items (check pickup) ──
  if (gameOverText) {
    items = [];
  } else {
    updateItems();
  }

  // ── update debug overlay ──
  const debugEl = document.querySelector('#debug');
  if (debugEl) {
    const pingMs = debugPing > 0 ? `${debugPing}ms` : '--';
    const fpsText = `FPS ${debugFps}  Ping ${pingMs}`;
    if (debugEl.textContent !== fpsText) debugEl.textContent = fpsText;
  }

  drawArena();
  requestAnimationFrame(tick);
}

// ── enemies ──
function spawnEnemy() {
  const id = `enemy-${nextEnemyId++}`;
  const padding = 60;
  let x, y;
  for (let attempt = 0; attempt < 20; attempt++) {
    x = padding + Math.random() * (ARENA_SIZE - 2 * padding);
    y = padding + Math.random() * (ARENA_SIZE - 2 * padding);
    if (!touchesWall(x, y, 18)) break;
  }
  const e = {
    id, x, y,
    angle: Math.random() * Math.PI * 2,
    hp: 2,
    cooldown: 0,
    targetX: padding + Math.random() * (ARENA_SIZE - 2 * padding),
    targetY: padding + Math.random() * (ARENA_SIZE - 2 * padding),
    pause: 0,
  };
  enemies.set(id, e);
}

function updateEnemies(delta) {
  const now = performance.now();
  const ENEMY_TURN_SPEED = 2.5;
  const ENEMY_AIM_THRESHOLD = 0.35;
  for (const [id, e] of enemies) {
    if (e.hp <= 0) { enemies.delete(id); continue; }

    // Pause occasionally to simulate thinking/reload.
    if (e.pause > 0) { e.pause -= delta; continue; }
    if (Math.random() < delta * 0.3) { e.pause = 0.3 + Math.random() * 0.5; }

    // Pick new waypoint when close to current.
    const dx = e.targetX - e.x;
    const dy = e.targetY - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 30) {
      e.targetX = 60 + Math.random() * (ARENA_SIZE - 120);
      e.targetY = 60 + Math.random() * (ARENA_SIZE - 120);
    }

    // Find nearest player.
    let nearest = null;
    let nearDist = Infinity;
    for (const tank of tanks.values()) {
      if (tank.deadUntil > now) continue;
      const d = Math.hypot(tank.x - e.x, tank.y - e.y);
      if (d < nearDist) { nearDist = d; nearest = tank; }
    }

    // Steer toward waypoint or nearest player.
    const targetAngle = nearest && nearDist < 400
      ? Math.atan2(nearest.y - e.y, nearest.x - e.x)
      : Math.atan2(dy, dx);
    const angleDiff = angleDelta(e.angle, targetAngle);
    e.angle += angleDiff * ENEMY_TURN_SPEED * Math.min(delta, 0.1);

    // Move forward.
    const nx = e.x + Math.cos(e.angle) * ENEMY_SPEED * Math.min(delta, 0.1);
    const ny = e.y + Math.sin(e.angle) * ENEMY_SPEED * Math.min(delta, 0.1);
    if (!touchesWall(nx, ny, 18) && !overlapsTanks(nx, ny, 18, id)) { e.x = nx; e.y = ny; }

    // Fire only when roughly facing the player (so the player can dodge).
    e.cooldown -= delta;
    if (e.cooldown <= 0 && nearest && nearDist < 500 && Math.abs(angleDiff) < ENEMY_AIM_THRESHOLD) {
      e.cooldown = ENEMY_FIRE_COOLDOWN / 1000;
      const fireAngle = e.angle + (Math.random() - 0.5) * 0.15;
      const id = `enemy-bullet-${now}-${Math.random()}`;
      const bullet = {
          id,
          startX: e.x + Math.cos(fireAngle) * 24,
          startY: e.y + Math.sin(fireAngle) * 24,
          x: e.x + Math.cos(fireAngle) * 24,
          y: e.y + Math.sin(fireAngle) * 24,
          angle: fireAngle,
          from: id,
          createdAt: now,
          hit: false,
        };
        bullets.set(id, bullet);
        client.sendRoomMessage({
          kind: 'bullet', id,
          startX: bullet.startX, startY: bullet.startY,
          angle: bullet.angle, from: id,
        });
    }
  }

}

function broadcastEnemyState() {
  if (enemies.size === 0) return;
  const state = [];
  for (const e of enemies.values()) {
    state.push({ id: e.id, x: e.x, y: e.y, angle: e.angle, hp: e.hp });
  }
  client.sendRoomMessage({ kind: 'enemy_state', state });
}

// ── items ──
function pickFreePosition(radius) {
  const padding = 60;
  for (let attempt = 0; attempt < 30; attempt++) {
    const x = padding + Math.random() * (ARENA_SIZE - 2 * padding);
    const y = padding + Math.random() * (ARENA_SIZE - 2 * padding);
    if (!touchesWall(x, y, radius) && !overlapsTanks(x, y, radius, null)) return { x, y };
  }
  return { x: ARENA_SIZE / 2, y: ARENA_SIZE / 2 };
}

function spawnItem() {
  const id = `item-${Math.random().toString(36).slice(2)}`;
  const { x, y } = pickFreePosition(14);
  const types = ['health', 'health', 'shield', 'bomb'];
  const type = types[Math.floor(Math.random() * types.length)];
  items.push({ id, x, y, type, collected: false });
  client.sendRoomMessage({ kind: 'item_spawn', id, x, y, type });
}

function updateItems() {
  if (gameOverText) return;
  const now = performance.now();
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.collected) { items.splice(i, 1); continue; }
    if (!localTank || localTank.deadUntil > now || localTank.hp <= 0) continue;
    const d = Math.hypot(localTank.x - item.x, localTank.y - item.y);
    if (d < 28) {
      item.collected = true;
      if (item.type === 'health') {
        localTank.hp = MAX_HP;
        log('+ full HP');
      } else if (item.type === 'shield') {
        localTank.hp = Math.min(localTank.hp + 2, MAX_HP + 2);
        log('+ shield (2 armor)');
      } else if (item.type === 'bomb') {
        if (heldItem) {
          item.collected = false;
          continue;
        }
        heldItem = 'bomb';
        log('bomb ready (right click or E to use)');
        client.sendRoomMessage({ kind: 'item_collect', id: item.id, type: item.type });
      }
      if (item.type !== 'bomb') {
        publishSnapshot(true);
        client.sendRoomMessage({ kind: 'item_collect', id: item.id, type: item.type });
      }
    }
  }
}

function useHeldItem() {
  if (gameOverText || heldItem !== 'bomb' || !localTank || localTank.hp <= 0) return;
  const now = performance.now();
  const center = { ...mouseWorld };
  heldItem = null;
  let hitCount = 0;
  for (const e of enemies.values()) {
    if (e.hp <= 0) continue;
    if (Math.hypot(e.x - center.x, e.y - center.y) < BOMB_RADIUS) {
      e.hp -= BOMB_DAMAGE;
      if (e.hp <= 0) addScore(1, 'enemy destroyed by bomb!');
      hitCount++;
    }
  }
  for (const tank of tanks.values()) {
    if (tank.playerId === localPlayerId) continue;
    if (tank.deadUntil > now) continue;
    if (Math.hypot(tank.x - center.x, tank.y - center.y) < BOMB_RADIUS) {
      const target = tanks.get(tank.playerId);
      if (target && target.hp > 0) {
        target.hp = Math.max(0, target.hp - BOMB_DAMAGE);
        if (target.hp <= 0) target.deadUntil = now + RESPAWN_DELAY_MS;
        client.sendRoomMessage({ kind: 'hit', target: tank.playerId, bullet: `bomb-${now}`, from: localPlayerId, damage: BOMB_DAMAGE });
      }
      hitCount++;
    }
  }
  log(`bomb used at cursor, hit ${hitCount} target(s)`);
  publishSnapshot(true);
}

function fire() {
  if (gameOverText) return;
  if (!localTank) return;
  const now = performance.now();
  if (localTank.hp <= 0 || localTank.deadUntil > now) return;
  const last = lastFireAt.get(localPlayerId) ?? 0;
  if (now - last < FIRE_COOLDOWN_MS) return;
  lastFireAt.set(localPlayerId, now);
  const id = `${localPlayerId}-${now}`;
  const bullet = {
    id,
    startX: localTank.x + Math.cos(localTank.angle) * 24,
    startY: localTank.y + Math.sin(localTank.angle) * 24,
    x: localTank.x + Math.cos(localTank.angle) * 24,
    y: localTank.y + Math.sin(localTank.angle) * 24,
    angle: localTank.angle,
    from: localPlayerId,
    createdAt: performance.now(),
    hit: false,
  };
  bullets.set(id, bullet);
  client.sendRoomMessage({
    kind: 'bullet', id,
    startX: bullet.startX, startY: bullet.startY,
    angle: bullet.angle, from: localPlayerId,
  });
}

function setupClient(newClient) {
  newClient.on('state_change', (state) => {
    if (state === 'connected') {
      setStatus('connected');
      if (!pingTimer) pingTimer = setInterval(measurePing, 2000);
      measurePing();
    }
    if (state === 'disconnected') {
      setStatus('disconnected');
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      debugPing = 0;
      updateRoomDisplay('');
      startRoomsPolling();
    }
    if (state === 'reconnecting') setStatus('reconnecting');
  });
  newClient.on('player_joined', (message) => {
    log('player joined', { id: message.payload.player_id, name: message.payload.player_name });
    // Immediately share our state with the new joiner (fix #1)
    publishSnapshot(true);
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
          startX: data.startX,
          startY: data.startY,
          x: data.startX,
          y: data.startY,
          angle: data.angle,
          from: data.from,
          createdAt: performance.now(),
          hit: false,
        });
      }
    } else if (data.kind === 'hit') {
      // All clients remove the bullet so it doesn't fly through on remote screens.
      bullets.delete(data.bullet);
      if (data.target === localPlayerId) {
        const tank = tanks.get(localPlayerId);
        if (tank && tank.hp > 0) {
          tank.hp -= data.damage ?? 1;
          if (tank.hp <= 0) {
            markLocalDestroyed(data.from);
          } else {
            publishSnapshot(true);
            log('hit!', { hp: tank.hp, from: data.from });
          }
        }
      }
    } else if (data.kind === 'enemy_state') {
      // Non-host: sync enemy state from host.
      if (!isHost && data.state) {
        const newEnemies = new Map();
        for (const s of data.state) {
          newEnemies.set(s.id, { ...enemies.get(s.id) || {}, id: s.id, x: s.x, y: s.y, angle: s.angle, hp: s.hp });
        }
        enemies = newEnemies;
      }
    } else if (data.kind === 'item_spawn') {
      if (!isHost) items.push({ id: data.id, x: data.x, y: data.y, type: data.type, collected: false });
    } else if (data.kind === 'item_collect') {
      const idx = items.findIndex(i => i.id === data.id);
      if (idx !== -1) items.splice(idx, 1);
    } else if (data.kind === 'enemy_killed') {
      if (data.shooter === localPlayerId) {
        addScore(1, 'enemy destroyed!');
      }
    } else if (data.kind === 'round_restart') {
      // Opponent asked to start a new round; reset our state too.
      resetRoundState();
      log('opponent started a new round');
    }
  });
  newClient.on('room_left', (message) => {
    log('left room', { roomId: message.payload.room_id });
    setStatus('connected');
    tanks.clear();
    bullets.clear();
    enemies.clear();
    items = [];
    isHost = false;
    localTank = null;
    playerScore = 0;
    playerLives = LIVES_PER_PLAYER;
    heldItem = null;
    gameOverText = null;
    updatePlayerCount();
    updateRoomDisplay('');
    startRoomsPolling();
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
    isHost = true;
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
    playerScore = 0;
    playerLives = LIVES_PER_PLAYER;
    heldItem = null;
    gameOverText = null;
    snapshotPublisher = new StateSnapshotPublisher({
      client,
      entityId: localPlayerId,
      minIntervalMs: SNAPSHOT_INTERVAL_MS,
    });
    setStatus('in_room', roomId);
    updateRoomDisplay(roomId);
    stopRoomsPolling();
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
  updateRoomDisplay('');
  startRoomsPolling();
}

elements.connectBtn.addEventListener('click', connect);
// ── room panel ──
function updateRoomDisplay(roomId) {
  const display = elements.roomIdDisplay;
  if (display) display.textContent = roomId;
  const panel = elements.roomPanel;
  if (panel) panel.style.display = roomId ? '' : 'none';
}

elements.copyRoomBtn?.addEventListener('click', () => {
  const id = elements.roomIdDisplay?.textContent;
  if (!id) return;
  navigator.clipboard.writeText(id).then(() => {
    const btn = elements.copyRoomBtn;
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 1500);
  }).catch(() => {});
});

// ── room discovery ──
let roomsRefreshTimer = null;

async function fetchRooms() {
  const list = elements.roomsList;
  if (!list) return;
  try {
    const wsUrl = elements.wsUrl.value.trim();
    const httpUrl = wsUrl.replace(/^ws:/, 'http:').replace(/\/ws$/, '');
    const res = await fetch(`${httpUrl}/api/rooms`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      list.innerHTML = '<span style="color:#64748b;">server error</span>';
      return;
    }
    const rooms = await res.json();
    if (rooms.length === 0) {
      list.innerHTML = '<span style="color:#64748b;">no rooms yet</span>';
      return;
    }
    list.innerHTML = rooms.map(r =>
      `<button class="room-entry" data-room-id="${r.id}" ${r.player_count >= r.max_players ? 'disabled' : ''}>
        <span style="flex:1;">${r.name || 'room'}</span>
        <span style="color:#94a3b8;font-size:11px;">${r.player_count}/${r.max_players}</span>
      </button>`
    ).join('');
  } catch {
    list.innerHTML = '<span style="color:#64748b;">no connection</span>';
  }
}

async function startRoomsPolling() {
  await fetchRooms();
  if (roomsRefreshTimer) clearInterval(roomsRefreshTimer);
  roomsRefreshTimer = setInterval(fetchRooms, 2000);
}

function stopRoomsPolling() {
  if (roomsRefreshTimer) { clearInterval(roomsRefreshTimer); roomsRefreshTimer = null; }
}

// Also join when clicking a room entry.
document.addEventListener('click', async (event) => {
  const btn = event.target.closest('.room-entry');
  if (!btn) return;
  const roomId = btn.dataset.roomId;
  if (!roomId) return;
  if (!client || client.state !== 'connected') {
    log('connect first');
    return;
  }
  elements.roomIdInput.value = roomId;
  await joinRoom(roomId);
});

elements.createBtn.addEventListener('click', createRoom);
elements.joinBtn.addEventListener('click', () => joinRoom());
elements.leaveBtn.addEventListener('click', leaveRoom);
elements.restartBtn?.addEventListener('click', () => {
  if (gameOverText) restartRound();
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.key.toLowerCase() === 'r' && gameOverText) {
    restartRound();
    return;
  }
  const key = event.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'e'].includes(key)) {
    event.preventDefault();
    keys.add(key);
    if (key === ' ') fire();
    if (key === 'e') useHeldItem();
  }
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.key.toLowerCase());
});

elements.arena.addEventListener('mousemove', updateMouseWorld);
elements.arena.addEventListener('mousedown', (event) => {
  updateMouseWorld(event);
  if (event.button === 0) {
    event.preventDefault();
    fire();
  } else if (event.button === 2) {
    event.preventDefault();
    useHeldItem();
  }
});
elements.arena.addEventListener('contextmenu', (event) => event.preventDefault());

setStatus('disconnected');
updatePlayerCount();
startRoomsPolling();
requestAnimationFrame(tick);
log('ready. Click Connect, or pick a room below.');
