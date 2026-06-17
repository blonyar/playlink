extends Control

@onready var _client := PlaylinkClient

@onready var _status_label := Label.new()
@onready var _room_id_input := LineEdit.new()
@onready var _player_name_input := LineEdit.new()
@onready var _log := RichTextLabel.new()
@onready var _connect_btn := Button.new()
@onready var _create_btn := Button.new()
@onready var _join_btn := Button.new()
@onready var _leave_btn := Button.new()
@onready var _msg_input := LineEdit.new()
@onready var _send_btn := Button.new()

func _ready() -> void:
	_setup_ui()

	_client.connected.connect(_on_connected)
	_client.disconnected.connect(_on_disconnected)
	_client.connection_failed.connect(_on_connection_failed)
	_client.room_created.connect(_on_room_created)
	_client.room_joined.connect(_on_room_joined)
	_client.room_left.connect(_on_room_left)
	_client.player_joined.connect(_on_player_joined)
	_client.player_left.connect(_on_player_left)
	_client.room_broadcast.connect(_on_room_broadcast)
	_client.pong.connect(_on_pong)
	_client.error_received.connect(_on_error)


func _setup_ui() -> void:
	var margin := 10
	var y := margin
	var w := 300
	var h := 30
	var gap := 6

	# Connection area
	var conn_label := Label.new()
	conn_label.text = "Server:"
	conn_label.position = Vector2(margin, y)
	conn_label.size = Vector2(w, h)
	add_child(conn_label)

	_connect_btn.text = "Connect"
	_connect_btn.position = Vector2(margin + w + 10, y)
	_connect_btn.size = Vector2(100, h)
	_connect_btn.pressed.connect(_on_connect_pressed)
	add_child(_connect_btn)
	y += h + gap

	_status_label.text = "Disconnected"
	_status_label.position = Vector2(margin, y)
	_status_label.size = Vector2(w + 110, h)
	add_child(_status_label)
	y += h + gap * 2

	# Room area
	var room_label := Label.new()
	room_label.text = "Room ID:"
	room_label.position = Vector2(margin, y)
	room_label.size = Vector2(60, h)
	add_child(room_label)

	_room_id_input.placeholder_text = "uuid (leave blank to create)"
	_room_id_input.position = Vector2(margin + 65, y)
	_room_id_input.size = Vector2(w - 65, h)
	add_child(_room_id_input)
	y += h + gap

	var name_label := Label.new()
	name_label.text = "Name:"
	name_label.position = Vector2(margin, y)
	name_label.size = Vector2(60, h)
	add_child(name_label)

	_player_name_input.placeholder_text = "player name"
	_player_name_input.text = "godot_player"
	_player_name_input.position = Vector2(margin + 65, y)
	_player_name_input.size = Vector2(w - 65, h)
	add_child(_player_name_input)
	y += h + gap

	_create_btn.text = "Create Room"
	_create_btn.position = Vector2(margin, y)
	_create_btn.size = Vector2(145, h)
	_create_btn.disabled = true
	_create_btn.pressed.connect(_on_create_pressed)
	add_child(_create_btn)

	_join_btn.text = "Join Room"
	_join_btn.position = Vector2(margin + 155, y)
	_join_btn.size = Vector2(145, h)
	_join_btn.disabled = true
	_join_btn.pressed.connect(_on_join_pressed)
	add_child(_join_btn)
	y += h + gap

	_leave_btn.text = "Leave Room"
	_leave_btn.position = Vector2(margin, y)
	_leave_btn.size = Vector2(300, h)
	_leave_btn.disabled = true
	_leave_btn.pressed.connect(_on_leave_pressed)
	add_child(_leave_btn)
	y += h + gap * 2

	# Message area
	var msg_label := Label.new()
	msg_label.text = "Message:"
	msg_label.position = Vector2(margin, y)
	msg_label.size = Vector2(60, h)
	add_child(msg_label)

	_msg_input.placeholder_text = "type a message..."
	_msg_input.position = Vector2(margin + 65, y)
	_msg_input.size = Vector2(w - 65, h)
	add_child(_msg_input)

	_send_btn.text = "Send"
	_send_btn.position = Vector2(margin + w + 10, y)
	_send_btn.size = Vector2(100, h)
	_send_btn.disabled = true
	_send_btn.pressed.connect(_on_send_pressed)
	add_child(_send_btn)
	y += h + gap * 2

	# Log area
	var log_label := Label.new()
	log_label.text = "Log:"
	log_label.position = Vector2(margin, y)
	log_label.size = Vector2(60, h)
	add_child(log_label)

	_log.position = Vector2(margin, y + h)
	_log.size = Vector2(710, 300)
	_log.bbcode_enabled = true
	_log.scroll_following = true
	add_child(_log)

	# Window
	var window := get_window()
	if window:
		window.size = Vector2i(730, 450)
		window.title = "Playlink Godot Client"


func _log_message(text: String, color: String = "white") -> void:
	_log.push_color(Color(color))
	_log.add_text(text + "\n")
	_log.pop()


func _update_buttons() -> void:
	var connected := _client.is_connected
	var in_room := not _client.room_id.is_empty()
	_connect_btn.text = "Disconnect" if connected else "Connect"
	_connect_btn.disabled = false
	_create_btn.disabled = not connected
	_join_btn.disabled = not connected
	_leave_btn.disabled = not connected or not in_room
	_send_btn.disabled = not connected or not in_room


# ─ Button callbacks ────────────────────────────────────

func _on_connect_pressed() -> void:
	if _client.is_connected:
		_client.disconnect_from_server()
	else:
		_log_message("Connecting...", "yellow")
		_connect_btn.disabled = true
		_client.ws_url = "ws://localhost:7777/ws"
		_client.connect_to_server()


func _on_create_pressed() -> void:
	var name := _player_name_input.text.strip_edges()
	if name.is_empty():
		_log_message("Enter a player name first", "red")
		return
	_client.player_name = name
	_client.create_room("Godot Room", 4)
	_log_message("Creating room...", "yellow")


func _on_join_pressed() -> void:
	var rid := _room_id_input.text.strip_edges()
	var name := _player_name_input.text.strip_edges()
	if rid.is_empty():
		_log_message("Enter a room ID", "red")
		return
	if name.is_empty():
		_log_message("Enter a player name", "red")
		return
	_client.player_name = name
	_client.join_room(rid, name)
	_log_message("Joining room %s..." % rid, "yellow")


func _on_leave_pressed() -> void:
	_client.leave_room()


func _on_send_pressed() -> void:
	var text := _msg_input.text.strip_edges()
	if text.is_empty():
		return
	_client.send_room_message({ text = text })
	_msg_input.text = ""
	_log_message("[me] %s" % text, "cyan")


# ─ Client signals ──────────────────────────────────────

func _on_connected() -> void:
	_log_message("Connected to server", "green")
	_update_buttons()


func _on_disconnected() -> void:
	_log_message("Disconnected from server", "orange")
	_update_buttons()


func _on_connection_failed() -> void:
	_log_message("Connection failed", "red")
	_update_buttons()


func _on_room_created(room_id: String) -> void:
	_log_message("Room created: %s" % room_id, "green")
	_room_id_input.text = room_id
	_update_buttons()


func _on_room_joined(rid: String, pid: String) -> void:
	_log_message("Joined room %s (player: %s)" % [rid, pid], "green")
	_update_buttons()


func _on_room_left(rid: String) -> void:
	_log_message("Left room %s" % rid, "orange")
	_update_buttons()


func _on_player_joined(pid: String, pname: String) -> void:
	_log_message("%s joined the room" % pname, "yellow")


func _on_player_left(pid: String) -> void:
	_log_message("Player %s left" % pid, "orange")


func _on_room_broadcast(from_id: String, data: Dictionary) -> void:
	_log_message("[%s] %s" % [from_id.left(8), JSON.stringify(data)], "white")


func _on_pong() -> void:
	_log_message("Pong received", "gray")


func _on_error(code: String, message: String) -> void:
	_log_message("Error [%s]: %s" % [code, message], "red")
