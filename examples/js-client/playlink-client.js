function envValue(name, fallback) {
  if (typeof process !== 'undefined' && process.env?.[name]) {
    return process.env[name];
  }
  return fallback;
}

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function cloneState(state) {
  return { ...state };
}

function shallowStateChanged(nextState, previousState) {
  if (!previousState) return true;

  const nextKeys = Object.keys(nextState);
  const previousKeys = Object.keys(previousState);
  if (nextKeys.length !== previousKeys.length) return true;

  return nextKeys.some((key) => !Object.is(nextState[key], previousState[key]));
}

export function createStateSnapshot({ tick, entityId, state }) {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new Error('state snapshot tick must be a non-negative safe integer');
  }
  if (typeof entityId !== 'string' || entityId.trim() === '') {
    throw new Error('state snapshot entityId must be a non-empty string');
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('state snapshot state must be an object');
  }

  return {
    kind: 'state_snapshot',
    tick,
    entity_id: entityId,
    state: cloneState(state),
  };
}

export class StateSnapshotFilter {
  constructor() {
    this.latestTicks = new Map();
  }

  accepts(snapshot) {
    if (snapshot?.kind !== 'state_snapshot') return false;
    if (typeof snapshot.entity_id !== 'string' || snapshot.entity_id.trim() === '') return false;
    if (!Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0) return false;
    if (!snapshot.state || typeof snapshot.state !== 'object' || Array.isArray(snapshot.state)) return false;

    const previousTick = this.latestTicks.get(snapshot.entity_id);
    if (previousTick !== undefined && snapshot.tick <= previousTick) {
      return false;
    }

    this.latestTicks.set(snapshot.entity_id, snapshot.tick);
    return true;
  }

  clear(entityId = undefined) {
    if (entityId === undefined) {
      this.latestTicks.clear();
      return;
    }
    this.latestTicks.delete(entityId);
  }
}

export class StateSnapshotPublisher {
  constructor({
    client,
    entityId,
    minIntervalMs = 50,
    hasChanged = shallowStateChanged,
  }) {
    if (!client) throw new Error('StateSnapshotPublisher requires a PlaylinkClient');
    if (typeof entityId !== 'string' || entityId.trim() === '') {
      throw new Error('StateSnapshotPublisher requires a non-empty entityId');
    }

    this.client = client;
    this.entityId = entityId;
    this.minIntervalMs = minIntervalMs;
    this.hasChanged = hasChanged;
    this.lastPublishedAt = -Infinity;
    this.lastState = null;
    this.nextTick = 1;
  }

  publish(state, { force = false, now = nowMs() } = {}) {
    if (!this.client.roomId) return false;
    if (!force && now - this.lastPublishedAt < this.minIntervalMs) return false;
    if (!force && !this.hasChanged(state, this.lastState)) return false;

    const snapshot = createStateSnapshot({
      tick: this.nextTick++,
      entityId: this.entityId,
      state,
    });
    this.client.sendRoomMessage(snapshot);
    this.lastPublishedAt = now;
    this.lastState = cloneState(state);
    return true;
  }
}

export class PlaylinkClient {
  static CONNECTING = 'connecting';
  static CONNECTED = 'connected';
  static DISCONNECTED = 'disconnected';
  static RECONNECTING = 'reconnecting';

  #state;
  #messageQueue;
  #reconnectAttempt;
  #reconnectTimer;
  #intentionalClose;

  constructor({
    name = 'player',
    wsUrl = envValue('PLAYLINK_WS_URL', 'ws://localhost:7777/ws'),
    httpUrl = envValue('PLAYLINK_HTTP_URL', 'http://localhost:7777'),
    log = null,
    keepaliveIntervalMs = 10000,
    reconnect = true,
    maxReconnectAttempts = 10,
    reconnectBaseDelayMs = 1000,
  } = {}) {
    this.name = name;
    this.wsUrl = wsUrl;
    this.httpUrl = httpUrl;
    this.log = log;
    this.socket = null;
    this.playerId = null;
    this.roomId = null;
    this.messages = [];
    this.handlers = new Map();
    this.pending = new Map();
    this.nextRequestNumber = 1;
    this.keepaliveIntervalMs = keepaliveIntervalMs;
    this.keepaliveTimer = null;
    this.reconnect = reconnect;
    this.maxReconnectAttempts = maxReconnectAttempts;
    this.reconnectBaseDelayMs = reconnectBaseDelayMs;
    this.members = [];
    this.#state = PlaylinkClient.DISCONNECTED;
    this.#messageQueue = [];
    this.#reconnectAttempt = 0;
    this.#reconnectTimer = null;
    this.#intentionalClose = false;
  }

  get state() {
    return this.#state;
  }

  async connect(timeoutMs = 5000) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return this;
    }

    this.#intentionalClose = false;
    const socket = new WebSocket(this.wsUrl);
    this.socket = socket;
    this.#setState(PlaylinkClient.CONNECTING);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error(`${this.name} timed out connecting to ${this.wsUrl}`));
      }, timeoutMs);

      socket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });

      socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error(`${this.name} failed to connect to ${this.wsUrl}`));
      }, { once: true });
    });

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      const message = JSON.parse(event.data);
      this.messages.push(message);
      if (this.messages.length > 200) {
        this.messages.splice(0, this.messages.length - 200);
      }
      this.log?.(`[${this.name}] <= ${JSON.stringify(message)}`);
      this.#handleMessage(message);
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.#onSocketClose();
    });

    this.#setState(PlaylinkClient.CONNECTED);
    this.#reconnectAttempt = 0;
    this.#startKeepalive();
    return this;
  }

  close() {
    this.#intentionalClose = true;
    this.#stopReconnect();
    this.#stopKeepalive();
    this.socket?.close();
    this.#clearSession();
    this.#setState(PlaylinkClient.DISCONNECTED);
  }

  on(type, handler) {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
    return () => {
      const nextHandlers = (this.handlers.get(type) ?? []).filter((candidate) => candidate !== handler);
      this.handlers.set(type, nextHandlers);
    };
  }

  async createRoom({ roomName = `${this.name}'s room`, maxPlayers = 4 } = {}) {
    const response = await this.request('create_room', {
      room_name: roomName,
      max_players: maxPlayers,
    });
    return response.payload.room_id;
  }

  async joinRoom(roomId, playerName = this.name) {
    const response = await this.request('join_room', {
      room_id: roomId,
      player_name: playerName,
    });
    this.roomId = response.payload.room_id;
    this.playerId = response.payload.player_id;
    this.members = [];
    return response.payload;
  }

  async leaveRoom() {
    const response = await this.request('leave_room');
    this.roomId = null;
    this.playerId = null;
    this.members = [];
    return response.payload;
  }

  sendRoomMessage(data) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.#messageQueue.push(data);
      return;
    }
    this.send({
      type: 'room_message',
      payload: { data },
    });
  }

  async ping() {
    return this.request('ping');
  }

  async listRooms() {
    const response = await fetch(`${this.httpUrl}/api/rooms`);
    if (!response.ok) {
      throw new Error(`room list failed: ${response.status}`);
    }
    return response.json();
  }

  async serverInfo() {
    const response = await fetch(`${this.httpUrl}/api/server`);
    if (!response.ok) {
      throw new Error(`server info failed: ${response.status}`);
    }
    return response.json();
  }

  request(type, payload = undefined, timeoutMs = 5000) {
    const id = `${this.name}-${this.nextRequestNumber++}`;
    this.send(payload === undefined ? { id, type } : { id, type, payload });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.name} timed out waiting for response to ${type}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  send(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error(`${this.name} is not connected`);
    }
    this.log?.(`[${this.name}] => ${JSON.stringify(message)}`);
    this.socket.send(JSON.stringify(message));
  }

  waitFor(type, predicate = () => true, timeoutMs = 5000) {
    const existing = this.messages.find((message) => message.type === type && predicate(message));
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        off();
        reject(new Error(`${this.name} timed out waiting for ${type}`));
      }, timeoutMs);

      const off = this.on(type, (message) => {
        if (predicate(message)) {
          clearTimeout(timeout);
          off();
          resolve(message);
        }
      });
    });
  }

  #setState(newState) {
    if (this.#state === newState) return;
    this.#state = newState;
    for (const handler of this.handlers.get('state_change') ?? []) {
      handler(newState);
    }
  }

  #startKeepalive() {
    this.#stopKeepalive();
    if (!this.keepaliveIntervalMs) return;

    this.keepaliveTimer = setInterval(() => {
      if (this.socket?.readyState !== WebSocket.OPEN) return;
      try {
        this.send({ type: 'ping' });
      } catch {
        this.#stopKeepalive();
      }
    }, this.keepaliveIntervalMs);
  }

  #stopKeepalive() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  #onSocketClose() {
    this.#stopKeepalive();
    this.#rejectPending('connection closed');

    if (this.#intentionalClose) {
      this.#clearSession();
      this.#setState(PlaylinkClient.DISCONNECTED);
      return;
    }

    this.#setState(PlaylinkClient.DISCONNECTED);
    this.socket = null;
    this.#clearSession();

    if (!this.reconnect || this.#reconnectAttempt >= this.maxReconnectAttempts) {
      this.#setState(PlaylinkClient.DISCONNECTED);
      return;
    }

    this.#scheduleReconnect();
  }

  #scheduleReconnect() {
    this.#setState(PlaylinkClient.RECONNECTING);
    const delay = this.reconnectBaseDelayMs * Math.pow(2, this.#reconnectAttempt);
    const jitter = Math.random() * delay * 0.3;
    this.#reconnectTimer = setTimeout(() => this.#tryReconnect(), delay + jitter);
  }

  async #tryReconnect() {
    this.#reconnectAttempt++;
    this.log?.(`[${this.name}] reconnecting (attempt ${this.#reconnectAttempt}/${this.maxReconnectAttempts})...`);

    const socket = new WebSocket(this.wsUrl);
    this.socket = socket;

    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.close();
          reject(new Error('reconnect timeout'));
        }, 5000);

        socket.addEventListener('open', () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });

        socket.addEventListener('error', () => {
          clearTimeout(timeout);
          reject(new Error('reconnect failed'));
        }, { once: true });
      });
    } catch {
      if (this.#reconnectAttempt < this.maxReconnectAttempts) {
        this.#scheduleReconnect();
      }
      return;
    }

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      const message = JSON.parse(event.data);
      this.messages.push(message);
      if (this.messages.length > 200) {
        this.messages.splice(0, this.messages.length - 200);
      }
      this.log?.(`[${this.name}] <= ${JSON.stringify(message)}`);
      this.#handleMessage(message);
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.#onSocketClose();
    });

    this.#setState(PlaylinkClient.CONNECTED);
    this.#reconnectAttempt = 0;
    this.#startKeepalive();
    this.#flushMessageQueue();

    for (const handler of this.handlers.get('reconnected') ?? []) {
      handler();
    }
  }

  #stopReconnect() {
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    this.#reconnectAttempt = 0;
  }

  #clearSession() {
    this.roomId = null;
    this.playerId = null;
    this.members = [];
  }

  #flushMessageQueue() {
    if (this.#messageQueue.length === 0) return;
    const queue = this.#messageQueue;
    this.#messageQueue = [];
    for (const data of queue) {
      this.send({
        type: 'room_message',
        payload: { data },
      });
    }
  }

  #rejectPending(reason) {
    for (const { reject, timeout } of this.pending.values()) {
      clearTimeout(timeout);
      reject(new Error(`${this.name} ${reason}`));
    }
    this.pending.clear();
  }

  #handleMessage(message) {
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);

      if (message.type === 'error') {
        const error = new Error(message.payload.message);
        error.code = message.payload.code;
        pending.reject(error);
      } else {
        pending.resolve(message);
      }
    }

    if (message.type === 'player_joined') {
      const existing = this.members.findIndex((m) => m.id === message.payload.player_id);
      if (existing === -1) {
        this.members.push({
          id: message.payload.player_id,
          name: message.payload.player_name,
        });
      }
    }

    if (message.type === 'player_left') {
      this.members = this.members.filter((m) => m.id !== message.payload.player_id);
    }

    for (const handler of this.handlers.get(message.type) ?? []) {
      handler(message);
    }
  }
}
