extends Node
# Autoload singleton — access from any script as PlaylinkClient

# ─ Signals ──────────────────────────────────────────────
signal connected()
signal disconnected()
signal connection_failed()
signal room_created(room_id: String)
signal room_joined(room_id: String, player_id: String)
signal room_left(room_id: String)
signal player_joined(player_id: String, player_name: String)
signal player_left(player_id: String)
signal room_broadcast(from_id: String, data: Dictionary)
signal pong()
signal error_received(code: String, message: String)
signal event_lagged(skipped: int)

# ─ Properties ──────────────────────────────────────────
var player_id: String = ""
var room_id: String = ""
var player_name: String = ""
var is_connected: bool = false
var members: Array[Dictionary] = []

@export var ws_url: String = "ws://localhost:7777/ws"
@export var connect_timeout: float = 5.0
@export var keepalive_interval: float = 10.0

var _socket: WebSocketPeer
var _connect_timer: float = 0.0
var _keepalive_timer: float = 0.0
var _connecting: bool = false
var _request_id: int = 0

# ─ Public API ──────────────────────────────────────────

func connect_to_server(url: String = "") -> void:
	if url:
		ws_url = url
	if _socket and _socket.get_ready_state() == WebSocketPeer.STATE_OPEN:
		return

	_socket = WebSocketPeer.new()
	var err := _socket.connect_to_url(ws_url)
	if err != OK:
		push_error("PlaylinkClient: failed to connect - ", error_string(err))
		is_connected = false
		_socket = null
		emit_signal("connection_failed")
		return

	_connecting = true
	_connect_timer = 0.0
	_keepalive_timer = 0.0
	set_process(true)


func disconnect_from_server() -> void:
	_connecting = false
	_connect_timer = 0.0
	if _socket:
		_socket.close()
		_socket = null
	_reset_state()


func create_room(room_name: String = "", max_players: int = 8) -> void:
	_send_request("create_room", {
		room_name = room_name if room_name else "%s's room" % player_name,
		max_players = max_players,
	})


func join_room(p_room_id: String, p_player_name: String) -> void:
	_send_request("join_room", {
		room_id = p_room_id,
		player_name = p_player_name,
	})


func leave_room() -> void:
	_send_request("leave_room")


func send_room_message(data: Dictionary) -> void:
	_send_message({
		type = "room_message",
		payload = { data = data },
	})


func ping() -> void:
	_send_request("ping")


# ─ Internal ────────────────────────────────────────────

func _process(delta: float) -> void:
	if not _socket:
		return

	_socket.poll()
	var state := _socket.get_ready_state()

	if state == WebSocketPeer.STATE_CONNECTING and _connecting:
		_connect_timer += delta
		if _connect_timer >= connect_timeout:
			push_error("PlaylinkClient: connection timed out")
			_socket.close()
			_connecting = false
			is_connected = false
			_socket = null
			_reset_state()
			emit_signal("connection_failed")
		return

	elif state == WebSocketPeer.STATE_OPEN:
		if _connecting:
			_connecting = false
			is_connected = true
			_keepalive_timer = 0.0
			emit_signal("connected")

		while _socket.get_available_packet_count() > 0:
			var pkt := _socket.get_packet()
			var text := pkt.get_string_from_utf8()
			_parse_message(text)

		# The server closes idle sessions, so send a periodic ping to stay alive.
		_keepalive_timer += delta
		if _keepalive_timer >= keepalive_interval:
			_keepalive_timer = 0.0
			_send_message({ type = "ping" })

	elif state in [WebSocketPeer.STATE_CLOSING, WebSocketPeer.STATE_CLOSED]:
		if _connecting:
			_connecting = false
			is_connected = false
			_socket = null
			_reset_state()
			emit_signal("connection_failed")
		elif is_connected:
			is_connected = false
			_socket = null
			_reset_state()
			emit_signal("disconnected")


func _send_request(msg_type: String, payload: Variant = null) -> void:
	_request_id += 1
	var id := "%s-%d" % [player_name if player_name else "player", _request_id]
	var msg: Dictionary = { type = msg_type, id = id }
	if payload != null:
		msg.payload = payload
	_send_message(msg)


func _send_message(msg: Dictionary) -> void:
	if not _socket or _socket.get_ready_state() != WebSocketPeer.STATE_OPEN:
		push_error("PlaylinkClient: not connected")
		emit_signal("error_received", "not_connected", "Not connected to server")
		return

	var text := JSON.stringify(msg)
	if text.is_empty():
		push_error("PlaylinkClient: failed to serialize message")
		emit_signal("error_received", "serialize_failed", "Failed to serialize message")
		return
	var err := _socket.send_text(text)
	if err != OK:
		push_error("PlaylinkClient: failed to send message - ", error_string(err))
		emit_signal("error_received", "send_failed", error_string(err))


func _parse_message(text: String) -> void:
	var json := JSON.new()
	var err := json.parse(text)
	if err != OK:
		push_error("PlaylinkClient: invalid JSON - ", json.get_error_message())
		return

	var parsed: Variant = json.get_data()
	if not parsed is Dictionary:
		push_error("PlaylinkClient: message is not a JSON object")
		return

	var msg: Dictionary = parsed
	if not msg.has("type"):
		return

	var msg_type: String = msg.type
	var payload: Dictionary = msg.get("payload", {})

	# Dispatch by type
	match msg_type:
		"room_created":
			emit_signal("room_created", payload.room_id)
		"room_joined":
			room_id = payload.room_id
			player_id = payload.player_id
			members = []
			emit_signal("room_joined", room_id, player_id)
		"room_left":
			room_id = ""
			player_id = ""
			members = []
			emit_signal("room_left", payload.room_id)
		"player_joined":
			var pid: String = payload.player_id
			var pname: String = payload.player_name
			var exists := false
			for m in members:
				if m.id == pid:
					exists = true
					break
			if not exists:
				members.append({ id = pid, name = pname })
			emit_signal("player_joined", pid, pname)
		"player_left":
			var pid: String = payload.player_id
			members = members.filter(func(m): return m.id != pid)
			emit_signal("player_left", pid)
		"room_broadcast":
			emit_signal("room_broadcast", payload.from, payload.data)
		"pong":
			emit_signal("pong")
		"event_lagged":
			emit_signal("event_lagged", payload.skipped)
		"error":
			emit_signal("error_received", payload.code, payload.message)


func _reset_state() -> void:
	player_id = ""
	room_id = ""
	player_name = ""
	members = []
	_request_id = 0
	_keepalive_timer = 0.0
	set_process(false)
