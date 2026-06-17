// Playlink JavaScript Client — TypeScript Definitions

export interface StateSnapshot {
  kind: 'state_snapshot';
  tick: number;
  entity_id: string;
  state: Record<string, unknown>;
}

export interface StateSnapshotOptions {
  tick: number;
  entityId: string;
  state: Record<string, unknown>;
}

export function createStateSnapshot(options: StateSnapshotOptions): StateSnapshot;

export class StateSnapshotFilter {
  private latestTicks: Map<string, number>;
  constructor();
  accepts(snapshot: unknown): snapshot is StateSnapshot;
  clear(entityId?: string): void;
}

export interface StateSnapshotPublisherOptions {
  client: PlaylinkClient;
  entityId: string;
  minIntervalMs?: number;
  hasChanged?: (next: Record<string, unknown>, previous: Record<string, unknown>) => boolean;
}

export class StateSnapshotPublisher {
  client: PlaylinkClient;
  entityId: string;
  minIntervalMs: number;
  lastPublishedAt: number;
  lastState: Record<string, unknown> | null;
  nextTick: number;
  constructor(options: StateSnapshotPublisherOptions);
  publish(state: Record<string, unknown>, options?: { force?: boolean; now?: number }): boolean;
}

// --- ServerMessage types for event handlers ---

export interface ServerErrorPayload {
  code: string;
  message: string;
}

export interface ServerMessageBase {
  id?: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface RoomCreatedMessage extends ServerMessageBase {
  type: 'room_created';
  payload: { room_id: string };
}

export interface RoomJoinedMessage extends ServerMessageBase {
  type: 'room_joined';
  payload: { room_id: string; player_id: string };
}

export interface RoomLeftMessage extends ServerMessageBase {
  type: 'room_left';
  payload: { room_id: string };
}

export interface PlayerJoinedMessage extends ServerMessageBase {
  type: 'player_joined';
  payload: { player_id: string; player_name: string };
}

export interface PlayerLeftMessage extends ServerMessageBase {
  type: 'player_left';
  payload: { player_id: string };
}

export interface RoomBroadcastMessage extends ServerMessageBase {
  type: 'room_broadcast';
  payload: { from: string; data: unknown };
}

export interface PongMessage extends ServerMessageBase {
  type: 'pong';
}

export interface EventLaggedMessage extends ServerMessageBase {
  type: 'event_lagged';
  payload: { skipped: number };
}

export interface ErrorMessage extends ServerMessageBase {
  type: 'error';
  payload: ServerErrorPayload;
}

export type ServerMessage =
  | RoomCreatedMessage
  | RoomJoinedMessage
  | RoomLeftMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | RoomBroadcastMessage
  | PongMessage
  | EventLaggedMessage
  | ErrorMessage;

export interface RoomMember {
  id: string;
  name: string;
}

export interface RoomInfo {
  id: string;
  name: string;
  max_players: number;
  player_count: number;
  created_at_unix_secs: number;
  message_count: number;
}

export interface RoomDetail extends RoomInfo {
  players: RoomMember[];
}

export interface ServerMetadata {
  server_id: string;
  name: string;
  version: string;
  topology: string;
  bind_addr: string;
  websocket_path: string;
  http_url?: string;
  ws_url?: string;
  public_http_url?: string;
  public_ws_url?: string;
  discovery: {
    enabled: boolean;
    method: string | null;
    port: number;
  };
}

export interface ServerStats {
  uptime_seconds: number;
  room_count: number;
  player_count: number;
  total_rooms_created: number;
  total_messages_broadcast: number;
}

export interface JoinRoomResponse {
  room_id: string;
  player_id: string;
}

export interface LeaveRoomResponse {
  room_id: string;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface PlaylinkClientOptions {
  name?: string;
  wsUrl?: string;
  httpUrl?: string;
  log?: ((message: string) => void) | null;
  keepaliveIntervalMs?: number | null;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
  rejoinOnReconnect?: boolean;
}

type Unsubscribe = () => void;
type MessageHandler = (message: ServerMessage) => void;
type ConnectionStateHandler = (state: ConnectionState) => void;
type RejoinHandler = (payload: JoinRoomResponse) => void;
type RejoinFailedHandler = (error: Error) => void;

export class PlaylinkClient {
  static CONNECTING: 'connecting';
  static CONNECTED: 'connected';
  static DISCONNECTED: 'disconnected';
  static RECONNECTING: 'reconnecting';

  name: string;
  wsUrl: string;
  httpUrl: string;
  log: ((message: string) => void) | null;
  socket: WebSocket | null;
  playerId: string | null;
  roomId: string | null;
  messages: ServerMessage[];
  members: RoomMember[];
  keepaliveIntervalMs: number | null;
  keepaliveTimer: ReturnType<typeof setInterval> | null;
  reconnect: boolean;
  maxReconnectAttempts: number;
  reconnectBaseDelayMs: number;
  rejoinOnReconnect: boolean;
  readonly state: ConnectionState;

  constructor(options?: PlaylinkClientOptions);

  connect(timeoutMs?: number): Promise<this>;
  close(): void;

  on(type: string, handler: MessageHandler): Unsubscribe;
  on(type: 'state_change', handler: ConnectionStateHandler): Unsubscribe;
  on(type: 'reconnected', handler: () => void): Unsubscribe;
  on(type: 'rejoined', handler: RejoinHandler): Unsubscribe;
  on(type: 'rejoin_failed', handler: RejoinFailedHandler): Unsubscribe;

  createRoom(options?: { roomName?: string; maxPlayers?: number }): Promise<string>;
  joinRoom(roomId: string, playerName?: string): Promise<JoinRoomResponse>;
  leaveRoom(): Promise<LeaveRoomResponse>;
  sendRoomMessage(data: unknown): void;
  ping(): Promise<PongMessage>;

  listRooms(): Promise<RoomInfo[]>;
  serverInfo(): Promise<ServerMetadata>;
  fetchStats(): Promise<ServerStats>;

  request(type: string, payload?: unknown, timeoutMs?: number): Promise<ServerMessage>;
  send(message: Record<string, unknown>): void;
  waitFor(type: string, predicate?: (message: ServerMessage) => boolean, timeoutMs?: number): Promise<ServerMessage>;
}
