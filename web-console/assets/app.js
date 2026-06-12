const translations = {
  en: {
    appTitle: 'Web Debug Console', appSubtitle: 'Monitor the server, inspect rooms, and simulate a game client.', language: 'Language', refreshData: 'Refresh Data',
    tabOverview: 'Overview', tabRooms: 'Rooms', tabSimulator: 'Simulator', tabMessages: 'Messages', monitor: 'Monitor', serverOverview: 'Server Overview', overviewHelp: 'Read-only status for the running Playlink process.',
    health: 'Health', version: 'Version', rooms: 'Rooms', players: 'Players', websocket: 'WebSocket', uptime: 'Uptime', totalRoomsCreated: 'Total rooms created', totalMessages: 'Total messages', networkInfo: 'Network / Host', serverName: 'Server name', topology: 'Topology', bindAddress: 'Bind address', publicHttpUrl: 'Public HTTP URL', websocketPath: 'WebSocket path', discoveryStatus: 'LAN discovery', workflowTitle: 'Recommended workflow', workflowStep1: 'Simulator: connect and set player name.', workflowStep2: 'Rooms: create or join a room.', workflowStep3: 'Messages: send room messages and inspect events.',
    disconnectTitle: 'Why does it disconnect?', disconnectBody: 'The server closes idle WebSocket sessions after 30 seconds. This console sends an automatic ping every 10 seconds while connected, so it should stay connected unless the server stops or the network drops.',
    inspector: 'Inspector', roomInspector: 'Room Inspector', refreshRooms: 'Refresh Rooms', roomsHelp: 'Create rooms here, or join an existing room as the connected simulator client.', name: 'Name', action: 'Action', noRoomsLoaded: 'No rooms loaded.', noRooms: 'No rooms yet. Connect the simulator, then create the first room.', noRoomsFiltered: 'No rooms match the current search/filter.', join: 'Join', current: 'Current', advancedConnection: 'Advanced connection', searchRooms: 'Search rooms', roomFilter: 'Filter', filterAll: 'All', filterJoinable: 'Joinable', filterFull: 'Full',
    simulator: 'Simulator', clientSimulator: 'Client Simulator', simulatorHelp: 'This area only controls one simulated client connection and identity.', connection: 'Connection', websocketUrl: 'WebSocket URL', keepaliveStatus: 'Keepalive', connect: 'Connect', disconnect: 'Disconnect', ping: 'Ping', playerName: 'Player name', nextStepTitle: 'Next step', nextStepBody: 'After connecting, go to Rooms to create or join a room. After joining, go to Messages to send room messages.',
    createRoom: 'Create Room', leaveRoom: 'Leave Room', roomName: 'Room name', maxPlayers: 'Max players', sendRoomMessage: 'Send Room Message', sampleChat: 'Chat Sample', sampleMove: 'Move Sample', messagePayload: 'Message payload JSON', logs: 'Logs', messageLog: 'Message Log', clear: 'Clear', messagesHelp: 'After joining a room, send room messages here and inspect sent/received events.', close: 'Close',
    sessionState: 'Session State', currentPlayer: 'Current player', currentRoom: 'Current room', roomDetail: 'Room Detail', selectedRoom: 'Selected room', playerList: 'Player List', noPlayers: 'No players.', noSelectedRoom: 'Select a room from the table to inspect players.', validJson: 'Valid JSON payload.', invalidJson: 'Invalid JSON payload:',
    off: 'off', onAutoPing: 'on, auto ping every 10s', disconnected: 'disconnected', connecting: 'connecting', connected: 'connected', notConnected: 'Connect the simulator first.', notInRoom: 'Join a room before sending room messages.', joinedRoom: 'Joined room', createdRoom: 'Created room', roomDetailUnavailable: 'Room detail unavailable',
    messages: 'Messages', created: 'Created', roomMessages: 'Room messages', roomCreatedAt: 'Created at',
  },
  zh: {
    appTitle: 'Web 调试控制台', appSubtitle: '监控服务状态、查看房间，并模拟一个游戏客户端。', language: '语言', refreshData: '刷新数据',
    tabOverview: '总览', tabRooms: '房间', tabSimulator: '模拟器', tabMessages: '消息', monitor: '监控', serverOverview: '服务总览', overviewHelp: '这里只展示当前 Playlink 服务的只读状态。',
    health: '健康状态', version: '版本', rooms: '房间数', players: '玩家数', websocket: 'WebSocket', uptime: '运行时间', totalRoomsCreated: '累计创建房间', totalMessages: '累计消息', networkInfo: '网络 / 主机', serverName: '服务名称', topology: '拓扑', bindAddress: '监听地址', publicHttpUrl: '公网 HTTP 地址', websocketPath: 'WebSocket 路径', discoveryStatus: '局域网发现', workflowTitle: '推荐流程', workflowStep1: '模拟器：先连接并设置玩家名。', workflowStep2: '房间：创建或加入房间。', workflowStep3: '消息：发送房间消息并查看事件。',
    disconnectTitle: '为什么会自动断开？', disconnectBody: '服务端会在 WebSocket 空闲 30 秒后断开连接。这是当前设计，用来清理无活动客户端。控制台连接后会每 10 秒自动 ping 保活，所以除非服务停止或网络断开，一般不会自己掉线。',
    inspector: '检查器', roomInspector: '房间检查器', refreshRooms: '刷新房间', roomsHelp: '在这里创建房间，或让已连接的模拟客户端加入已有房间。', name: '名称', action: '操作', noRoomsLoaded: '还没有加载房间。', noRooms: '还没有房间。请先连接模拟器，然后创建第一个房间。', noRoomsFiltered: '没有房间符合当前搜索或筛选条件。', join: '加入', current: '当前', advancedConnection: '高级连接设置', searchRooms: '搜索房间', roomFilter: '筛选', filterAll: '全部', filterJoinable: '可加入', filterFull: '已满',
    simulator: '模拟器', clientSimulator: '客户端模拟器', simulatorHelp: '这里只负责一个模拟客户端的连接和身份。', connection: '连接', websocketUrl: 'WebSocket 地址', keepaliveStatus: '保活', connect: '连接', disconnect: '断开', ping: 'Ping', playerName: '玩家名', nextStepTitle: '下一步', nextStepBody: '连接后去“房间”创建或加入房间；加入后去“消息”发送房间消息。',
    createRoom: '创建房间', leaveRoom: '离开房间', roomName: '房间名', maxPlayers: '最大玩家数', sendRoomMessage: '发送房间消息', sampleChat: '聊天示例', sampleMove: '移动示例', messagePayload: '消息 JSON', logs: '日志', messageLog: '消息日志', clear: '清空', messagesHelp: '加入房间后，在这里发送房间消息并查看发送/接收事件。', close: '关闭',
    sessionState: '会话状态', currentPlayer: '当前玩家', currentRoom: '当前房间', roomDetail: '房间详情', selectedRoom: '选中房间', playerList: '玩家列表', noPlayers: '暂无玩家。', noSelectedRoom: '从房间表中选择一个房间来查看玩家。', validJson: '消息 JSON 有效。', invalidJson: '消息 JSON 无效：',
    off: '关闭', onAutoPing: '开启，每 10 秒自动 ping', disconnected: '未连接', connecting: '连接中', connected: '已连接', notConnected: '请先在模拟器里连接。', notInRoom: '请先加入房间，再发送房间消息。', joinedRoom: '已加入房间', createdRoom: '已创建房间', roomDetailUnavailable: '房间详情不可用',
    messages: '消息数', created: '创建时间', roomMessages: '房间消息数', roomCreatedAt: '创建时间',
  },
};

const elements = {
  languageSelect: document.querySelector('#language-select'), translatable: document.querySelectorAll('[data-i18n]'), tabs: document.querySelectorAll('.tab'), panels: document.querySelectorAll('.tab-panel'), refreshButton: document.querySelector('#refresh-button'),
  healthStatus: document.querySelector('#health-status'), serverVersion: document.querySelector('#server-version'), roomCount: document.querySelector('#room-count'), playerCount: document.querySelector('#player-count'), wsState: document.querySelector('#ws-state'), serverUptime: document.querySelector('#server-uptime'), totalRoomsCreated: document.querySelector('#total-rooms-created'), totalMessagesBroadcast: document.querySelector('#total-messages-broadcast'), serverName: document.querySelector('#server-name'), serverTopology: document.querySelector('#server-topology'), serverBindAddr: document.querySelector('#server-bind-addr'), serverPublicHttpUrl: document.querySelector('#server-public-http-url'), serverWsPath: document.querySelector('#server-ws-path'), serverDiscovery: document.querySelector('#server-discovery'), keepaliveState: document.querySelector('#keepalive-state'), currentPlayer: document.querySelector('#current-player'), currentRoom: document.querySelector('#current-room'), messageCurrentRoom: document.querySelector('#message-current-room'), workflowConnect: document.querySelector('#workflow-connect'), workflowRoom: document.querySelector('#workflow-room'), workflowMessage: document.querySelector('#workflow-message'),
  roomsRefreshButton: document.querySelector('#rooms-refresh-button'), roomsBody: document.querySelector('#rooms-body'), roomSearch: document.querySelector('#room-search'), roomFilter: document.querySelector('#room-filter'), selectedRoomId: document.querySelector('#selected-room-id'), selectedRoomName: document.querySelector('#selected-room-name'), selectedRoomCount: document.querySelector('#selected-room-count'), selectedRoomMessages: document.querySelector('#selected-room-messages'), selectedRoomCreatedAt: document.querySelector('#selected-room-created-at'), selectedRoomPlayers: document.querySelector('#selected-room-players'), openCreateRoomButton: document.querySelector('#open-create-room-button'), createRoomDialog: document.querySelector('#create-room-dialog'), closeCreateRoomButton: document.querySelector('#close-create-room-button'),
  wsUrl: document.querySelector('#ws-url'), connectButton: document.querySelector('#connect-button'), disconnectButton: document.querySelector('#disconnect-button'), leaveRoomButton: document.querySelector('#leave-room-button'), roomName: document.querySelector('#room-name'), maxPlayers: document.querySelector('#max-players'), createRoomButton: document.querySelector('#create-room-button'),
  playerName: document.querySelector('#player-name'), messagePayload: document.querySelector('#message-payload'), payloadValidation: document.querySelector('#payload-validation'), sendMessageButton: document.querySelector('#send-message-button'), sampleChatButton: document.querySelector('#sample-chat-button'), sampleMoveButton: document.querySelector('#sample-move-button'), pingButton: document.querySelector('#ping-button'), clearLogButton: document.querySelector('#clear-log-button'), messageLog: document.querySelector('#message-log'),
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
  updatePayloadValidation();
  renderSelectedRoom();
  refreshRooms();
}

function activateTab(tabName) {
  elements.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabName));
  elements.panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tabName));
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function defaultWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function safePublicWebSocketUrl(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (!['ws:', 'wss:'].includes(parsed.protocol)) return null;
    if (window.location.protocol === 'https:' && parsed.protocol !== 'wss:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function formatLogLabel(label) {
  const labels = {
    received: '⬇ received',
    sent: '⬆ sent',
    error: '⚠ error',
    event_lagged: '⚠ event lagged',
    room_left: '↩ room left',
    player_joined: '➕ player joined',
    player_left: '➖ player left',
    room_broadcast: '📣 room broadcast',
    connected: '✅ connected',
    disconnected: '⛔ disconnected',
    connecting: '… connecting',
    auto_ping: '↔ auto-ping',
  };
  return labels[label] ?? label;
}

function log(label, value = '') {
  const timestamp = new Date().toLocaleTimeString();
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  elements.messageLog.textContent += `[${timestamp}] ${formatLogLabel(label)}${text ? ` ${text}` : ''}\n`;
  elements.messageLog.scrollTop = elements.messageLog.scrollHeight;
}

function updateWorkflowState() {
  const connected = socket?.readyState === WebSocket.OPEN;
  const joined = Boolean(currentRoomId);
  const states = [
    [elements.workflowConnect, connected ? 'done' : 'current'],
    [elements.workflowRoom, !connected ? 'locked' : joined ? 'done' : 'current'],
    [elements.workflowMessage, joined ? 'current' : 'locked'],
  ];

  for (const [element, state] of states) {
    element.classList.remove('done', 'current', 'locked');
    element.classList.add(state);
  }
}

function renderSessionState() {
  elements.currentPlayer.textContent = socket ? (elements.playerName.value.trim() || 'debug-player') : '-';
  elements.currentRoom.textContent = currentRoomId ?? '-';
  elements.messageCurrentRoom.textContent = currentRoomId ?? '-';
  updateWorkflowState();
}

function isPayloadValid() {
  try {
    JSON.parse(elements.messagePayload.value);
    return true;
  } catch {
    return false;
  }
}

function updatePayloadValidation() {
  try {
    JSON.parse(elements.messagePayload.value);
    elements.payloadValidation.textContent = t('validJson');
    elements.payloadValidation.classList.remove('invalid');
    elements.payloadValidation.classList.add('valid');
  } catch (error) {
    elements.payloadValidation.textContent = `${t('invalidJson')} ${error.message}`;
    elements.payloadValidation.classList.remove('valid');
    elements.payloadValidation.classList.add('invalid');
  }
  setSocketState(socket?.readyState === WebSocket.OPEN ? 'connected' : socket ? 'connecting' : 'disconnected');
}

function setSocketState(state) {
  elements.wsState.textContent = t(state);
  const connected = state === 'connected';
  elements.connectButton.disabled = connected || state === 'connecting';
  elements.disconnectButton.disabled = !connected;
  elements.openCreateRoomButton.disabled = !connected || !!currentRoomId;
  elements.createRoomButton.disabled = !connected || !!currentRoomId;
  elements.leaveRoomButton.disabled = !connected || !currentRoomId;
  elements.sendMessageButton.disabled = !connected || !currentRoomId || !isPayloadValid();
  elements.pingButton.disabled = !connected;
  renderSessionState();
}

function startKeepalive() {
  stopKeepalive();
  keepaliveTimer = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'ping' }));
      log('auto_ping');
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

async function refreshServerInfo() {
  try {
    const response = await fetch('/api/server');
    const server = await response.json();
    elements.serverName.textContent = server.name;
    elements.serverTopology.textContent = server.topology;
    elements.serverBindAddr.textContent = server.bind_addr;
    elements.serverPublicHttpUrl.textContent = server.public_http_url ?? server.http_url ?? '-';
    elements.serverWsPath.textContent = server.public_ws_url ?? server.ws_url ?? server.websocket_path;

    const safeWsUrl = safePublicWebSocketUrl(server.public_ws_url ?? server.ws_url);
    if (safeWsUrl && elements.wsUrl.value === defaultWebSocketUrl() && !socket) {
      elements.wsUrl.value = safeWsUrl;
    }

    elements.serverDiscovery.textContent = server.discovery?.enabled
      ? `${server.discovery.method ?? 'enabled'}:${server.discovery.port}`
      : t('off');
  } catch (error) {
    elements.serverName.textContent = 'error';
    log('server info error', error.message);
  }
}

async function refreshStats() {
  try {
    const response = await fetch('/api/stats');
    const stats = await response.json();
    elements.roomCount.textContent = String(stats.room_count);
    elements.playerCount.textContent = String(stats.player_count);
    elements.serverUptime.textContent = formatDuration(stats.uptime_seconds ?? 0);
    elements.totalRoomsCreated.textContent = String(stats.total_rooms_created ?? 0);
    elements.totalMessagesBroadcast.textContent = String(stats.total_messages_broadcast ?? 0);
  } catch (error) {
    elements.serverUptime.textContent = 'error';
    log('stats error', error.message);
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
    elements.selectedRoomMessages.textContent = '-';
    elements.selectedRoomCreatedAt.textContent = '-';
    const empty = document.createElement('li');
    empty.textContent = t('noSelectedRoom');
    elements.selectedRoomPlayers.replaceChildren(empty);
    return;
  }

  try {
    const response = await fetch(`/api/rooms/${selectedRoomId}`);
    if (!response.ok) {
      const missingRoomId = selectedRoomId;
      selectedRoomId = null;
      await renderSelectedRoom();
      log(t('roomDetailUnavailable'), missingRoomId);
      return;
    }

    const room = await response.json();
    elements.selectedRoomId.textContent = room.id;
    elements.selectedRoomName.textContent = room.name;
    elements.selectedRoomCount.textContent = `${room.players.length} / ${room.max_players}`;
    elements.selectedRoomMessages.textContent = String(room.message_count ?? 0);
    elements.selectedRoomCreatedAt.textContent = formatTimestamp(room.created_at_unix_secs);

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
  } catch (error) {
    const failedRoomId = selectedRoomId;
    selectedRoomId = null;
    await renderSelectedRoom();
    log(t('roomDetailUnavailable'), `${failedRoomId}: ${error.message}`);
  }
}

function renderEmptyRoomTable(message) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 6;
  cell.className = 'empty-state';
  cell.textContent = message;
  row.append(cell);
  elements.roomsBody.replaceChildren(row);
}

function formatTimestamp(unixSecs) {
  if (!unixSecs) return '-';
  const date = new Date(unixSecs * 1000);
  return date.toLocaleTimeString();
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
    renderEmptyRoomTable(roomSnapshots.length === 0 ? t('noRooms') : t('noRoomsFiltered'));
    return;
  }

  elements.roomsBody.replaceChildren(...visibleRooms.map((room) => {
    const row = document.createElement('tr');
    const id = document.createElement('td');
    const name = document.createElement('td');
    const players = document.createElement('td');
    const messages = document.createElement('td');
    const created = document.createElement('td');
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
    messages.textContent = String(room.message_count ?? 0);
    created.textContent = formatTimestamp(room.created_at_unix_secs);
    button.type = 'button';
    button.textContent = isCurrent ? t('current') : t('join');
    button.disabled = isCurrent || !!currentRoomId || isFull || !socket || socket.readyState !== WebSocket.OPEN;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      joinRoom(room.id);
    });
    action.append(button);
    row.append(id, name, players, messages, created, action);
    return row;
  }));
}

async function refreshAll() { await Promise.all([refreshHealth(), refreshServerInfo(), refreshStats(), refreshRooms()]); }

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
    if (message.type === 'event_lagged') {
      log('event_lagged', `Skipped ${message.payload?.skipped ?? 0} room events. Refresh room state if the client fell behind.`);
    }
    if (message.type === 'room_broadcast') {
      log('room_broadcast', message.payload);
    }
    if (message.type === 'player_joined') {
      log('player_joined', message.payload);
    }
    if (message.type === 'player_left') {
      log('player_left', message.payload);
    }
    if (message.type === 'room_created') {
      elements.createRoomDialog.close();
      log(t('createdRoom'), message.payload.room_id);
      joinRoom(message.payload.room_id);
      refreshRooms();
      refreshStats();
    }
    if (message.type === 'room_joined') {
      currentRoomId = message.payload.room_id;
      selectedRoomId = currentRoomId;
      renderSessionState();
      setSocketState('connected');
      log(t('joinedRoom'), currentRoomId);
      activateTab('messages');
      refreshRooms();
      refreshStats();
    }
    if (message.type === 'room_left') {
      const leftRoomId = message.payload.room_id;
      currentRoomId = null;
      if (selectedRoomId === leftRoomId) selectedRoomId = null;
      renderSessionState();
      setSocketState('connected');
      log('room_left', leftRoomId);
      refreshRooms();
      refreshStats();
    }
    if (['player_joined', 'player_left', 'room_broadcast'].includes(message.type)) {
      refreshRooms();
      refreshStats();
    }
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
    refreshStats();
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
  send({ type: 'leave_room' });
}

function setSamplePayload(kind) {
  const samples = {
    chat: {
      kind: 'chat',
      text: 'hello from console',
    },
    move: {
      kind: 'move',
      player_name: elements.playerName.value.trim() || 'debug-player',
      x: 10,
      y: 20,
    },
  };
  elements.messagePayload.value = JSON.stringify(samples[kind], null, 2);
  updatePayloadValidation();
  log('sample payload', kind);
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
elements.messagePayload.addEventListener('input', updatePayloadValidation);
elements.createRoomButton.addEventListener('click', createRoom);
elements.sampleChatButton.addEventListener('click', () => setSamplePayload('chat'));
elements.sampleMoveButton.addEventListener('click', () => setSamplePayload('move'));
elements.sendMessageButton.addEventListener('click', sendRoomMessage);
elements.pingButton.addEventListener('click', ping);
elements.clearLogButton.addEventListener('click', () => { elements.messageLog.textContent = ''; });

setSocketState('disconnected');
renderSessionState();
updatePayloadValidation();
applyLanguage();
refreshAll();
