const translations = {
  en: {
    appTitle: 'Web Debug Console', appSubtitle: 'Monitor the server, inspect rooms, and simulate a game client.', language: 'Language', refreshData: 'Refresh Data',
    tabOverview: 'Overview', tabRooms: 'Rooms', tabSimulator: 'Simulator', tabMessages: 'Messages', monitor: 'Monitor', serverOverview: 'Server Overview', overviewHelp: 'Read-only status for the running Playlink process.',
    health: 'Health', version: 'Version', rooms: 'Rooms', players: 'Players', websocket: 'WebSocket', workflowTitle: 'Recommended workflow', workflowStep1: 'Simulator: connect and set player name.', workflowStep2: 'Rooms: create or join a room.', workflowStep3: 'Messages: send room messages and inspect events.',
    disconnectTitle: 'Why does it disconnect?', disconnectBody: 'The server closes idle WebSocket sessions after 30 seconds. This console sends an automatic ping every 10 seconds while connected, so it should stay connected unless the server stops or the network drops.',
    inspector: 'Inspector', roomInspector: 'Room Inspector', refreshRooms: 'Refresh Rooms', roomsHelp: 'Create rooms here, or join an existing room as the connected simulator client.', name: 'Name', action: 'Action', noRoomsLoaded: 'No rooms loaded.', noRooms: 'No rooms.', join: 'Join', current: 'Current', advancedConnection: 'Advanced connection', searchRooms: 'Search rooms', roomFilter: 'Filter', filterAll: 'All', filterJoinable: 'Joinable', filterFull: 'Full',
    simulator: 'Simulator', clientSimulator: 'Client Simulator', simulatorHelp: 'This area only controls one simulated client connection and identity.', connection: 'Connection', websocketUrl: 'WebSocket URL', keepaliveStatus: 'Keepalive', connect: 'Connect', disconnect: 'Disconnect', ping: 'Ping', playerName: 'Player name', nextStepTitle: 'Next step', nextStepBody: 'After connecting, go to Rooms to create or join a room. After joining, go to Messages to send room messages.',
    createRoom: 'Create Room', leaveRoom: 'Leave Room', roomName: 'Room name', maxPlayers: 'Max players', sendRoomMessage: 'Send Room Message', messagePayload: 'Message payload JSON', logs: 'Logs', messageLog: 'Message Log', clear: 'Clear', messagesHelp: 'After joining a room, send room messages here and inspect sent/received events.', close: 'Close',
    sessionState: 'Session State', currentPlayer: 'Current player', currentRoom: 'Current room', roomDetail: 'Room Detail', selectedRoom: 'Selected room', playerList: 'Player List', noPlayers: 'No players.',
    off: 'off', onAutoPing: 'on, auto ping every 10s', disconnected: 'disconnected', connecting: 'connecting', connected: 'connected', notConnected: 'Connect the simulator first.', notInRoom: 'Join a room before sending room messages.', joinedRoom: 'Joined room', createdRoom: 'Created room',
  },
  zh: {
    appTitle: 'Web 调试控制台', appSubtitle: '监控服务状态、查看房间，并模拟一个游戏客户端。', language: '语言', refreshData: '刷新数据',
    tabOverview: '总览', tabRooms: '房间', tabSimulator: '模拟器', tabMessages: '消息', monitor: '监控', serverOverview: '服务总览', overviewHelp: '这里只展示当前 Playlink 服务的只读状态。',
    health: '健康状态', version: '版本', rooms: '房间数', players: '玩家数', websocket: 'WebSocket', workflowTitle: '推荐流程', workflowStep1: '模拟器：先连接并设置玩家名。', workflowStep2: '房间：创建或加入房间。', workflowStep3: '消息：发送房间消息并查看事件。',
    disconnectTitle: '为什么会自动断开？', disconnectBody: '服务端会在 WebSocket 空闲 30 秒后断开连接。这是当前设计，用来清理无活动客户端。控制台连接后会每 10 秒自动 ping 保活，所以除非服务停止或网络断开，一般不会自己掉线。',
    inspector: '检查器', roomInspector: '房间检查器', refreshRooms: '刷新房间', roomsHelp: '在这里创建房间，或让已连接的模拟客户端加入已有房间。', name: '名称', action: '操作', noRoomsLoaded: '还没有加载房间。', noRooms: '暂无房间。', join: '加入', current: '当前', advancedConnection: '高级连接设置', searchRooms: '搜索房间', roomFilter: '筛选', filterAll: '全部', filterJoinable: '可加入', filterFull: '已满',
    simulator: '模拟器', clientSimulator: '客户端模拟器', simulatorHelp: '这里只负责一个模拟客户端的连接和身份。', connection: '连接', websocketUrl: 'WebSocket 地址', keepaliveStatus: '保活', connect: '连接', disconnect: '断开', ping: 'Ping', playerName: '玩家名', nextStepTitle: '下一步', nextStepBody: '连接后去“房间”创建或加入房间；加入后去“消息”发送房间消息。',
    createRoom: '创建房间', leaveRoom: '离开房间', roomName: '房间名', maxPlayers: '最大玩家数', sendRoomMessage: '发送房间消息', messagePayload: '消息 JSON', logs: '日志', messageLog: '消息日志', clear: '清空', messagesHelp: '加入房间后，在这里发送房间消息并查看发送/接收事件。', close: '关闭',
    sessionState: '会话状态', currentPlayer: '当前玩家', currentRoom: '当前房间', roomDetail: '房间详情', selectedRoom: '选中房间', playerList: '玩家列表', noPlayers: '暂无玩家。',
    off: '关闭', onAutoPing: '开启，每 10 秒自动 ping', disconnected: '未连接', connecting: '连接中', connected: '已连接', notConnected: '请先在模拟器里连接。', notInRoom: '请先加入房间，再发送房间消息。', joinedRoom: '已加入房间', createdRoom: '已创建房间',
  },
};

const elements = {
  languageSelect: document.querySelector('#language-select'), translatable: document.querySelectorAll('[data-i18n]'), tabs: document.querySelectorAll('.tab'), panels: document.querySelectorAll('.tab-panel'), refreshButton: document.querySelector('#refresh-button'),
  healthStatus: document.querySelector('#health-status'), serverVersion: document.querySelector('#server-version'), roomCount: document.querySelector('#room-count'), playerCount: document.querySelector('#player-count'), wsState: document.querySelector('#ws-state'), keepaliveState: document.querySelector('#keepalive-state'), currentPlayer: document.querySelector('#current-player'), currentRoom: document.querySelector('#current-room'), messageCurrentRoom: document.querySelector('#message-current-room'),
  roomsRefreshButton: document.querySelector('#rooms-refresh-button'), roomsBody: document.querySelector('#rooms-body'), roomSearch: document.querySelector('#room-search'), roomFilter: document.querySelector('#room-filter'), selectedRoomId: document.querySelector('#selected-room-id'), selectedRoomName: document.querySelector('#selected-room-name'), selectedRoomCount: document.querySelector('#selected-room-count'), selectedRoomPlayers: document.querySelector('#selected-room-players'), openCreateRoomButton: document.querySelector('#open-create-room-button'), createRoomDialog: document.querySelector('#create-room-dialog'), closeCreateRoomButton: document.querySelector('#close-create-room-button'),
  wsUrl: document.querySelector('#ws-url'), connectButton: document.querySelector('#connect-button'), disconnectButton: document.querySelector('#disconnect-button'), leaveRoomButton: document.querySelector('#leave-room-button'), roomName: document.querySelector('#room-name'), maxPlayers: document.querySelector('#max-players'), createRoomButton: document.querySelector('#create-room-button'),
  playerName: document.querySelector('#player-name'), messagePayload: document.querySelector('#message-payload'), sendMessageButton: document.querySelector('#send-message-button'), pingButton: document.querySelector('#ping-button'), clearLogButton: document.querySelector('#clear-log-button'), messageLog: document.querySelector('#message-log'),
};

let socket = null;
let keepaliveTimer = null;
let currentRoomId = null;
let selectedRoomId = null;
let roomSnapshots = [];
let currentLanguage = localStorage.getItem('playlink-language') ?? 'zh';

function t(key) { return translations[currentLanguage][key] ?? translations.en[key] ?? key; }

function applyLanguage() {
  document.documentElement.lang = currentLanguage === 'zh' ? 'zh-CN' : 'en';
  elements.languageSelect.value = currentLanguage;
  elements.translatable.forEach((element) => { element.textContent = t(element.dataset.i18n); });
  if (!socket) elements.wsState.textContent = t('disconnected');
  elements.keepaliveState.textContent = keepaliveTimer ? t('onAutoPing') : t('off');
  renderSelectedRoom();
  refreshRooms();
}

function activateTab(tabName) {
  elements.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabName));
  elements.panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tabName));
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

function renderSessionState() {
  elements.currentPlayer.textContent = socket ? (elements.playerName.value.trim() || 'debug-player') : '-';
  elements.currentRoom.textContent = currentRoomId ?? '-';
  elements.messageCurrentRoom.textContent = currentRoomId ?? '-';
}

function setSocketState(state) {
  elements.wsState.textContent = t(state);
  const connected = state === 'connected';
  elements.connectButton.disabled = connected || state === 'connecting';
  elements.disconnectButton.disabled = !connected;
  elements.openCreateRoomButton.disabled = !connected || !!currentRoomId;
  elements.createRoomButton.disabled = !connected || !!currentRoomId;
  elements.leaveRoomButton.disabled = !connected || !currentRoomId;
  elements.sendMessageButton.disabled = !connected || !currentRoomId;
  elements.pingButton.disabled = !connected;
  renderSessionState();
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
  if (keepaliveTimer) clearInterval(keepaliveTimer);
  keepaliveTimer = null;
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
    roomSnapshots = await response.json();
    renderRooms();
    await renderSelectedRoom();
  } catch (error) {
    log('rooms error', error.message);
  }
}

async function selectRoom(roomId) {
  selectedRoomId = roomId;
  await renderSelectedRoom();
  renderRooms();
}

async function renderSelectedRoom() {
  if (!selectedRoomId) {
    elements.selectedRoomId.textContent = '-';
    elements.selectedRoomName.textContent = '-';
    elements.selectedRoomCount.textContent = '-';
    elements.selectedRoomPlayers.replaceChildren();
    return;
  }

  const response = await fetch(`/api/rooms/${selectedRoomId}`);
  if (!response.ok) {
    selectedRoomId = null;
    await renderSelectedRoom();
    return;
  }

  const room = await response.json();
  elements.selectedRoomId.textContent = room.id;
  elements.selectedRoomName.textContent = room.name;
  elements.selectedRoomCount.textContent = `${room.players.length} / ${room.max_players}`;

  if (room.players.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = t('noPlayers');
    elements.selectedRoomPlayers.replaceChildren(empty);
    return;
  }

  elements.selectedRoomPlayers.replaceChildren(...room.players.map((player) => {
    const item = document.createElement('li');
    item.textContent = `${player.name} · ${player.id}`;
    return item;
  }));
}

function renderRooms() {
  const totalPlayers = roomSnapshots.reduce((sum, room) => sum + room.player_count, 0);
  elements.roomCount.textContent = String(roomSnapshots.length);
  elements.playerCount.textContent = String(totalPlayers);

  const query = elements.roomSearch.value.trim().toLowerCase();
  const filter = elements.roomFilter.value;
  const visibleRooms = roomSnapshots.filter((room) => {
    const matchesQuery = !query || room.id.toLowerCase().includes(query) || room.name.toLowerCase().includes(query);
    const isFull = room.player_count >= room.max_players;
    const matchesFilter = filter === 'all' || (filter === 'joinable' && !isFull) || (filter === 'full' && isFull);
    return matchesQuery && matchesFilter;
  });

  if (visibleRooms.length === 0) {
    elements.roomsBody.innerHTML = `<tr><td colspan="4">${t('noRooms')}</td></tr>`;
    return;
  }

  elements.roomsBody.replaceChildren(...visibleRooms.map((room) => {
    const row = document.createElement('tr');
    const id = document.createElement('td');
    const name = document.createElement('td');
    const players = document.createElement('td');
    const action = document.createElement('td');
    const button = document.createElement('button');
    const isCurrent = room.id === currentRoomId;
    const isFull = room.player_count >= room.max_players;

    if (isCurrent) row.classList.add('current-room');
    if (room.id === selectedRoomId) row.classList.add('selected-room');
    row.addEventListener('click', () => selectRoom(room.id));
    id.textContent = isCurrent ? `${room.id} (${t('current')})` : room.id;
    name.textContent = room.name;
    players.textContent = `${room.player_count} / ${room.max_players}`;
    button.type = 'button';
    button.textContent = isCurrent ? t('current') : t('join');
    button.disabled = isCurrent || !!currentRoomId || isFull || !socket || socket.readyState !== WebSocket.OPEN;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      joinRoom(room.id);
    });
    action.append(button);
    row.append(id, name, players, action);
    return row;
  }));
}

async function refreshAll() { await Promise.all([refreshHealth(), refreshRooms()]); }

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
    activateTab('rooms');
    refreshRooms();
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    log('received', message);
    if (message.type === 'error') {
      const code = message.payload?.code ?? 'unknown_error';
      const text = message.payload?.message ?? '';
      log('error', `${code}${text ? `: ${text}` : ''}`);
    }
    if (message.type === 'room_created') {
      elements.createRoomDialog.close();
      log(t('createdRoom'), message.payload.room_id);
      joinRoom(message.payload.room_id);
      refreshRooms();
    }
    if (message.type === 'room_joined') {
      currentRoomId = message.payload.room_id;
      selectedRoomId = currentRoomId;
      renderSessionState();
      setSocketState('connected');
      log(t('joinedRoom'), currentRoomId);
      activateTab('messages');
      refreshRooms();
    }
    if (['player_joined', 'player_left'].includes(message.type)) refreshRooms();
  });

  socket.addEventListener('close', () => {
    socket = null;
    currentRoomId = null;
    selectedRoomId = null;
    renderSelectedRoom();
    stopKeepalive();
    setSocketState('disconnected');
    log('disconnected');
    refreshRooms();
  });

  socket.addEventListener('error', () => log('socket error'));
}

function disconnect() { socket?.close(); }

function send(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    log('send error', t('notConnected'));
    return;
  }
  socket.send(JSON.stringify(message));
  log('sent', message);
}

function createRoom() {
  send({ type: 'create_room', payload: { room_name: elements.roomName.value || undefined, max_players: Number(elements.maxPlayers.value) || undefined } });
}

function joinRoom(roomId) {
  send({ type: 'join_room', payload: { room_id: roomId, player_name: elements.playerName.value.trim() || 'debug-player' } });
}

function leaveRoom() {
  if (!currentRoomId) return;
  const previousRoomId = currentRoomId;
  send({ type: 'leave_room' });
  currentRoomId = null;
  renderSessionState();
  setSocketState(socket?.readyState === WebSocket.OPEN ? 'connected' : 'disconnected');
  log('left room', previousRoomId);
  refreshRooms();
}

function sendRoomMessage() {
  if (!currentRoomId) {
    log('send error', t('notInRoom'));
    return;
  }
  try {
    send({ type: 'room_message', payload: { data: JSON.parse(elements.messagePayload.value) } });
  } catch (error) {
    log('json error', error.message);
  }
}

function ping() { send({ type: 'ping' }); }

elements.wsUrl.value = defaultWebSocketUrl();
elements.languageSelect.addEventListener('change', () => { currentLanguage = elements.languageSelect.value; localStorage.setItem('playlink-language', currentLanguage); applyLanguage(); });
elements.tabs.forEach((tab) => tab.addEventListener('click', () => activateTab(tab.dataset.tab)));
elements.refreshButton.addEventListener('click', refreshAll);
elements.roomsRefreshButton.addEventListener('click', refreshRooms);
elements.roomSearch.addEventListener('input', renderRooms);
elements.roomFilter.addEventListener('change', renderRooms);
elements.openCreateRoomButton.addEventListener('click', () => elements.createRoomDialog.showModal());
elements.closeCreateRoomButton.addEventListener('click', () => elements.createRoomDialog.close());
elements.connectButton.addEventListener('click', connect);
elements.disconnectButton.addEventListener('click', disconnect);
elements.leaveRoomButton.addEventListener('click', leaveRoom);
elements.playerName.addEventListener('input', renderSessionState);
elements.createRoomButton.addEventListener('click', createRoom);
elements.sendMessageButton.addEventListener('click', sendRoomMessage);
elements.pingButton.addEventListener('click', ping);
elements.clearLogButton.addEventListener('click', () => { elements.messageLog.textContent = ''; });

setSocketState('disconnected');
renderSessionState();
applyLanguage();
refreshAll();
