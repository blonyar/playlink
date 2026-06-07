const elements = {
  tabs: document.querySelectorAll('.tab'),
  panels: document.querySelectorAll('.tab-panel'),
  refreshButton: document.querySelector('#refresh-button'),
  healthStatus: document.querySelector('#health-status'),
  serverVersion: document.querySelector('#server-version'),
  roomCount: document.querySelector('#room-count'),
  playerCount: document.querySelector('#player-count'),
  wsState: document.querySelector('#ws-state'),
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
  elements.wsState.textContent = state;
  const connected = state === 'connected';
  elements.connectButton.disabled = connected;
  elements.disconnectButton.disabled = !connected;
  elements.createRoomButton.disabled = !connected;
  elements.joinRoomButton.disabled = !connected;
  elements.sendMessageButton.disabled = !connected;
  elements.pingButton.disabled = !connected;
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
      elements.roomsBody.innerHTML = '<tr><td colspan="4">No rooms.</td></tr>';
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
        button.textContent = 'Use';
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
refreshAll();
