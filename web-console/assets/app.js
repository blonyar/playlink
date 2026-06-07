const translations = {
  en: {
    appTitle: 'Web Debug Console',
    appSubtitle: 'Monitor the server, inspect rooms, and simulate a game client.',
    language: 'Language',
    refreshData: 'Refresh Data',
    tabOverview: 'Overview',
    tabRooms: 'Rooms',
    tabSimulator: 'Simulator',
    tabMessages: 'Messages',
    monitor: 'Monitor',
    serverOverview: 'Server Overview',
    overviewHelp: 'Read-only status for the running Playlink process.',
    health: 'Health',
    version: 'Version',
    rooms: 'Rooms',
    players: 'Players',
    websocket: 'WebSocket',
    disconnectTitle: 'Why does it disconnect?',
    disconnectBody: 'The server closes idle WebSocket sessions after 30 seconds. This console sends an automatic ping every 10 seconds while connected, so it should stay connected unless the server stops or the network drops.',
    inspector: 'Inspector',
    roomInspector: 'Room Inspector',
    refreshRooms: 'Refresh Rooms',
    roomsHelp: 'Use this area to inspect server state. Click “Use” to copy a room ID into the Simulator.',
    name: 'Name',
    action: 'Action',
    noRoomsLoaded: 'No rooms loaded.',
    noRooms: 'No rooms.',
    use: 'Use',
    simulator: 'Simulator',
    clientSimulator: 'Client Simulator',
    simulatorHelp: 'Pretend to be one game client and manually send protocol messages.',
    flowConnect: 'Connect',
    flowConnectHelp: 'Open a WebSocket session.',
    flowCreate: 'Create or choose room',
    flowCreateHelp: 'Create a room here, or use one from Rooms.',
    flowJoin: 'Join',
    flowJoinHelp: 'Join with a player name.',
    flowSend: 'Send message',
    flowSendHelp: 'Broadcast JSON to everyone in the room.',
    connection: 'Connection',
    websocketUrl: 'WebSocket URL',
    keepaliveStatus: 'Keepalive',
    connect: 'Connect',
    disconnect: 'Disconnect',
    ping: 'Ping',
    createRoom: 'Create Room',
    roomName: 'Room name',
    maxPlayers: 'Max players',
    joinRoom: 'Join Room',
    roomId: 'Room ID',
    playerName: 'Player name',
    sendRoomMessage: 'Send Room Message',
    messagePayload: 'Message payload JSON',
    logs: 'Logs',
    messageLog: 'Message Log',
    clear: 'Clear',
    messagesHelp: 'This log shows connection events, sent protocol messages, received protocol messages, and errors.',
    off: 'off',
    onAutoPing: 'on, auto ping every 10s',
    unknown: 'unknown',
    disconnected: 'disconnected',
    connecting: 'connecting',
    connected: 'connected',
  },
  zh: {
    appTitle: 'Web 调试控制台',
    appSubtitle: '监控服务状态、查看房间，并模拟一个游戏客户端。',
    language: '语言',
    refreshData: '刷新数据',
    tabOverview: '总览',
    tabRooms: '房间',
    tabSimulator: '模拟器',
    tabMessages: '消息',
    monitor: '监控',
    serverOverview: '服务总览',
    overviewHelp: '这里只展示当前 Playlink 服务的只读状态。',
    health: '健康状态',
    version: '版本',
    rooms: '房间数',
    players: '玩家数',
    websocket: 'WebSocket',
    disconnectTitle: '为什么会自动断开？',
    disconnectBody: '服务端会在 WebSocket 空闲 30 秒后断开连接。这是当前设计，用来清理无活动客户端。控制台连接后会每 10 秒自动 ping 保活，所以除非服务停止或网络断开，一般不会自己掉线。',
    inspector: '检查器',
    roomInspector: '房间检查器',
    refreshRooms: '刷新房间',
    roomsHelp: '这里用于查看服务端房间状态。点击“使用”会把房间 ID 填到模拟器里。',
    name: '名称',
    action: '操作',
    noRoomsLoaded: '还没有加载房间。',
    noRooms: '暂无房间。',
    use: '使用',
    simulator: '模拟器',
    clientSimulator: '客户端模拟器',
    simulatorHelp: '这里假装成一个游戏客户端，手动发送协议消息。',
    flowConnect: '连接',
    flowConnectHelp: '先打开一个 WebSocket 会话。',
    flowCreate: '创建或选择房间',
    flowCreateHelp: '可以在这里创建房间，也可以从房间页选择。',
    flowJoin: '加入',
    flowJoinHelp: '使用玩家名加入房间。',
    flowSend: '发送消息',
    flowSendHelp: '把 JSON 广播给房间内所有人。',
    connection: '连接',
    websocketUrl: 'WebSocket 地址',
    keepaliveStatus: '保活',
    connect: '连接',
    disconnect: '断开',
    ping: 'Ping',
    createRoom: '创建房间',
    roomName: '房间名',
    maxPlayers: '最大玩家数',
    joinRoom: '加入房间',
    roomId: '房间 ID',
    playerName: '玩家名',
    sendRoomMessage: '发送房间消息',
    messagePayload: '消息 JSON',
    logs: '日志',
    messageLog: '消息日志',
    clear: '清空',
    messagesHelp: '这里显示连接事件、发送的协议消息、收到的协议消息和错误。',
    off: '关闭',
    onAutoPing: '开启，每 10 秒自动 ping',
    unknown: '未知',
    disconnected: '未连接',
    connecting: '连接中',
    connected: '已连接',
  },
};

const elements = {
  languageSelect: document.querySelector('#language-select'),
  translatable: document.querySelectorAll('[data-i18n]'),
  tabs: document.querySelectorAll('.tab'),
  panels: document.querySelectorAll('.tab-panel'),
  refreshButton: document.querySelector('#refresh-button'),
  healthStatus: document.querySelector('#health-status'),
  serverVersion: document.querySelector('#server-version'),
  roomCount: document.querySelector('#room-count'),
  playerCount: document.querySelector('#player-count'),
  wsState: document.querySelector('#ws-state'),
  keepaliveState: document.querySelector('#keepalive-state'),
  roomsRefreshButton: document.querySelector('#rooms-refresh-button'),
  roomsBody: document.querySelector('#rooms-body'),
  wsUrl: document.querySelector('#ws-url'),
  connectButton: document.querySelector('#connect-button'),
  disconnectButton: document.querySelector('#disconnect-button'),
  roomName: document.querySelector('#room-name'),
  maxPlayers: document.querySelector('#max-players'),
  createRoomButton: document.querySelector('#create-room-button'),
  roomId: document.querySelector('#room-id'),
  playerName: document.querySelector('#player-name'),
  joinRoomButton: document.querySelector('#join-room-button'),
  messagePayload: document.querySelector('#message-payload'),
  sendMessageButton: document.querySelector('#send-message-button'),
  pingButton: document.querySelector('#ping-button'),
  clearLogButton: document.querySelector('#clear-log-button'),
  messageLog: document.querySelector('#message-log'),
};

let socket = null;
let keepaliveTimer = null;
let currentLanguage = localStorage.getItem('playlink-language') ?? 'zh';

function t(key) {
  return translations[currentLanguage][key] ?? translations.en[key] ?? key;
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage === 'zh' ? 'zh-CN' : 'en';
  elements.languageSelect.value = currentLanguage;
  elements.translatable.forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  if (!socket) {
    elements.wsState.textContent = t('disconnected');
  }

  elements.keepaliveState.textContent = keepaliveTimer ? t('onAutoPing') : t('off');
  refreshRooms();
}

function activateTab(tabName) {
  elements.tabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  elements.panels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === tabName);
  });
}

function defaultWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function log(label, value = '') {
  const timestamp = new Date().toLocaleTimeString();
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  elements.messageLog.textContent += `[${timestamp}] ${label}${text ? ` ${text}` : ''}\n`;
  elements.messageLog.scrollTop = elements.messageLog.scrollHeight;
}

function setSocketState(state) {
  elements.wsState.textContent = t(state);
  const connected = state === 'connected';
  elements.connectButton.disabled = connected || state === 'connecting';
  elements.disconnectButton.disabled = !connected;
  elements.createRoomButton.disabled = !connected;
  elements.joinRoomButton.disabled = !connected;
  elements.sendMessageButton.disabled = !connected;
  elements.pingButton.disabled = !connected;
}

function startKeepalive() {
  stopKeepalive();
  keepaliveTimer = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'ping' }));
      log('auto-ping');
    }
  }, 10000);
  elements.keepaliveState.textContent = t('onAutoPing');
}

function stopKeepalive() {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
  elements.keepaliveState.textContent = t('off');
}

async function refreshHealth() {
  try {
    const response = await fetch('/health');
    const health = await response.json();
    elements.healthStatus.textContent = health.status;
    elements.serverVersion.textContent = health.version;
  } catch (error) {
    elements.healthStatus.textContent = 'error';
    log('health error', error.message);
  }
}

async function refreshRooms() {
  try {
    const response = await fetch('/api/rooms');
    const rooms = await response.json();
    const totalPlayers = rooms.reduce((sum, room) => sum + room.player_count, 0);

    elements.roomCount.textContent = String(rooms.length);
    elements.playerCount.textContent = String(totalPlayers);

    if (rooms.length === 0) {
      elements.roomsBody.innerHTML = `<tr><td colspan="4">${t('noRooms')}</td></tr>`;
      return;
    }

    elements.roomsBody.replaceChildren(
      ...rooms.map((room) => {
        const row = document.createElement('tr');
        const id = document.createElement('td');
        const name = document.createElement('td');
        const players = document.createElement('td');
        const action = document.createElement('td');
        const button = document.createElement('button');

        id.textContent = room.id;
        name.textContent = room.name;
        players.textContent = `${room.player_count} / ${room.max_players}`;
        button.type = 'button';
        button.textContent = t('use');
        button.addEventListener('click', () => {
          elements.roomId.value = room.id;
          activateTab('simulator');
        });

        action.append(button);
        row.append(id, name, players, action);
        return row;
      }),
    );
  } catch (error) {
    log('rooms error', error.message);
  }
}

async function refreshAll() {
  await Promise.all([refreshHealth(), refreshRooms()]);
}

function connect() {
  if (socket) return;

  socket = new WebSocket(elements.wsUrl.value.trim());
  setSocketState('connecting');
  activateTab('messages');
  log('connecting', elements.wsUrl.value.trim());

  socket.addEventListener('open', () => {
    setSocketState('connected');
    startKeepalive();
    log('connected');
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    log('received', message);

    if (message.type === 'room_created') {
      elements.roomId.value = message.payload.room_id;
      refreshRooms();
    }

    if (['room_joined', 'player_joined', 'player_left'].includes(message.type)) {
      refreshRooms();
    }
  });

  socket.addEventListener('close', () => {
    socket = null;
    stopKeepalive();
    setSocketState('disconnected');
    log('disconnected');
    refreshRooms();
  });

  socket.addEventListener('error', () => {
    log('socket error');
  });
}

function disconnect() {
  socket?.close();
}

function send(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    log('send error', 'WebSocket is not connected');
    return;
  }

  socket.send(JSON.stringify(message));
  log('sent', message);
}

function createRoom() {
  send({
    type: 'create_room',
    payload: {
      room_name: elements.roomName.value || undefined,
      max_players: Number(elements.maxPlayers.value) || undefined,
    },
  });
}

function joinRoom() {
  send({
    type: 'join_room',
    payload: {
      room_id: elements.roomId.value.trim(),
      player_name: elements.playerName.value.trim() || 'debug-player',
    },
  });
}

function sendRoomMessage() {
  try {
    send({
      type: 'room_message',
      payload: {
        data: JSON.parse(elements.messagePayload.value),
      },
    });
  } catch (error) {
    log('json error', error.message);
  }
}

function ping() {
  send({ type: 'ping' });
}

elements.wsUrl.value = defaultWebSocketUrl();
elements.languageSelect.addEventListener('change', () => {
  currentLanguage = elements.languageSelect.value;
  localStorage.setItem('playlink-language', currentLanguage);
  applyLanguage();
});
elements.tabs.forEach((tab) => {
  tab.addEventListener('click', () => activateTab(tab.dataset.tab));
});
elements.refreshButton.addEventListener('click', refreshAll);
elements.roomsRefreshButton.addEventListener('click', refreshRooms);
elements.connectButton.addEventListener('click', connect);
elements.disconnectButton.addEventListener('click', disconnect);
elements.createRoomButton.addEventListener('click', createRoom);
elements.joinRoomButton.addEventListener('click', joinRoom);
elements.sendMessageButton.addEventListener('click', sendRoomMessage);
elements.pingButton.addEventListener('click', ping);
elements.clearLogButton.addEventListener('click', () => {
  elements.messageLog.textContent = '';
});

setSocketState('disconnected');
applyLanguage();
refreshAll();
