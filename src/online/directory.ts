import type { Peer, DataConnection } from 'peerjs';
import { cleanName, ROOM_PREFIX, ROOM_PROTOCOL, validCode } from './protocol';
import { peerRuntime, readMessage } from './transport';

export const DIRECTORY_ID = `${ROOM_PREFIX}directory-${ROOM_PROTOCOL}`;
export interface PublicRoom { code: string; hostName: string }
export interface DirectoryState { rooms: PublicRoom[]; status: 'connecting' | 'ready' | 'error' }
export const EMPTY_DIRECTORY: DirectoryState = { rooms: [], status: 'connecting' };
const MAX_ROOMS = 100;
const EXPIRY = 30_000;
type Wire = { type: string; protocol: number; room?: PublicRoom; rooms?: PublicRoom[] };
function send(connection: DataConnection | undefined, message: Wire) {
  if (!connection?.open) return;
  try { connection.send(JSON.stringify(message)); } catch { connection.close(); }
}
export function publicRoom(raw: unknown): PublicRoom | null {
  if (!raw || typeof raw !== 'object') return null;
  const room = raw as PublicRoom;
  return typeof room.code === 'string' && validCode(room.code) && typeof room.hostName === 'string' && room.hostName.length <= 20
    ? { code: room.code, hostName: cleanName(room.hostName) } : null;
}

// The first lobby browser owns the public directory peer. Other browsers subscribe
// to it; if it leaves, they elect a replacement and room owners re-advertise.
// This keeps GitHub Pages usable without an additional hosted backend. Only room
// codes and display names enter this connection, never decks, tokens or matches.
export class RoomDirectory {
  private peer?: Peer;
  private connection?: DataConnection;
  private clients = new Map<DataConnection, { room?: PublicRoom; watching: boolean; seen: number }>();
  private leader = false;
  private disposed = false;
  private generation = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private deadline?: ReturnType<typeof setTimeout>;
  private pulse = setInterval(() => this.tick(), 5000);
  private state: DirectoryState = { ...EMPTY_DIRECTORY };
  private lastUpdate = 0;
  constructor(private change: (value: DirectoryState) => void) { void this.attach(true); }
  private update(value: DirectoryState) { this.state = value; this.change(value); }
  private async attach(elect: boolean) {
    if (this.disposed) return;
    const generation = ++this.generation;
    clearTimeout(this.retryTimer); clearTimeout(this.deadline);
    this.connection = undefined; this.peer?.destroy(); this.clients.clear(); this.leader = false;
    this.update({ rooms: [], status: 'connecting' });
    try {
      const { Peer, options } = await peerRuntime();
      if (this.disposed || generation !== this.generation) return;
      const peer = elect ? new Peer(DIRECTORY_ID, options) : new Peer(options);
      this.peer = peer;
      const current = () => !this.disposed && generation === this.generation;
      this.deadline = setTimeout(() => { if (current()) this.retry(); }, 12000);
      peer.on('open', () => {
        if (!current()) return;
        this.leader = elect;
        if (elect) { clearTimeout(this.deadline); this.broadcast(); return; }
        const connection = peer.connect(DIRECTORY_ID, { reliable: true, serialization: 'binary' });
        this.connection = connection;
        connection.on('open', () => send(connection, { type: 'subscribe', protocol: ROOM_PROTOCOL }));
        connection.on('data', raw => {
          if (!current() || this.connection !== connection) return;
          const value = readMessage(raw) as Wire | null;
          if (!value || value.type !== 'rooms' || value.protocol !== ROOM_PROTOCOL || !Array.isArray(value.rooms) || value.rooms.length > MAX_ROOMS) return;
          const rooms = value.rooms.map(publicRoom); if (rooms.some(r => !r)) return;
          clearTimeout(this.deadline); this.lastUpdate = Date.now(); this.update({ rooms: rooms as PublicRoom[], status: 'ready' });
        });
        connection.on('close', () => { if (current()) this.retry(); });
        connection.on('error', () => { if (current()) this.retry(); });
      });
      peer.on('connection', connection => {
        if (current() && this.leader) this.accept(connection); else connection.close();
      });
      peer.on('error', (error: { type: string }) => {
        if (!current()) return;
        if (elect && error.type === 'unavailable-id') void this.attach(false);
        else this.retry();
      });
      peer.on('disconnected', () => { if (current()) this.retry(); });
    } catch { if (!this.disposed && generation === this.generation) this.retry(); }
  }
  private retry() {
    if (this.disposed || this.retryTimer) return;
    // Invalidate old callbacks before destroying channels, which emit close.
    this.generation++; clearTimeout(this.deadline); this.peer?.destroy();
    this.connection = undefined; this.clients.clear(); this.leader = false;
    this.update({ rooms: [], status: 'error' });
    this.retryTimer = setTimeout(() => { this.retryTimer = undefined; void this.attach(true); }, 700 + Math.random() * 700);
  }
  private accept(connection: DataConnection) {
    if (connection.serialization !== 'binary' || this.clients.size >= 200) { connection.close(); return; }
    const client = { watching: false, seen: Date.now() } as { room?: PublicRoom; watching: boolean; seen: number };
    this.clients.set(connection, client);
    connection.on('data', raw => {
      if (this.disposed || this.clients.get(connection) !== client) return;
      const message = readMessage(raw) as Wire | null;
      if (!message || message.protocol !== ROOM_PROTOCOL) return;
      client.seen = Date.now();
      if (message.type === 'subscribe') {
        client.watching = true; send(connection, { type: 'rooms', protocol: ROOM_PROTOCOL, rooms: this.rooms() });
      } else if (message.type === 'advertise') {
        const room = publicRoom(message.room);
        // Only the actual owner of this room's signaling ID can register it.
        if (!room || connection.peer !== ROOM_PREFIX + room.code) return;
        client.room = room; send(connection, { type: 'registered', protocol: ROOM_PROTOCOL }); this.broadcast();
      } else if (message.type === 'withdraw') { client.room = undefined; this.broadcast(); }
    });
    const drop = () => { if (this.clients.delete(connection)) this.broadcast(); };
    connection.on('close', drop); connection.on('error', () => { drop(); connection.close(); });
  }
  private rooms() {
    const rooms = new Map<string, PublicRoom>();
    for (const [connection, client] of this.clients) if (connection.open && client.room && Date.now() - client.seen < EXPIRY) rooms.set(client.room.code, client.room);
    return [...rooms.values()].sort((a, b) => a.hostName.localeCompare(b.hostName, 'ru') || a.code.localeCompare(b.code)).slice(0, MAX_ROOMS);
  }
  private broadcast() {
    if (!this.leader || this.disposed) return;
    const rooms = this.rooms(); this.update({ rooms, status: 'ready' });
    for (const [connection, client] of this.clients) if (client.watching) send(connection, { type: 'rooms', protocol: ROOM_PROTOCOL, rooms });
  }
  private tick() {
    if (this.leader) {
      for (const [connection, client] of this.clients) if (Date.now() - client.seen >= EXPIRY) { this.clients.delete(connection); connection.close(); }
      this.broadcast();
    } else if (this.connection?.open) {
      if (Date.now() - this.lastUpdate > 12000) this.retry();
      else send(this.connection, { type: 'subscribe', protocol: ROOM_PROTOCOL });
    }
  }
  refresh() {
    if (this.leader) this.broadcast();
    else if (this.connection?.open) send(this.connection, { type: 'subscribe', protocol: ROOM_PROTOCOL });
    else if (this.state.status !== 'connecting') { clearTimeout(this.retryTimer); this.retryTimer = undefined; void this.attach(true); }
  }
  close() {
    this.disposed = true; this.generation++; clearTimeout(this.retryTimer); clearTimeout(this.deadline); clearInterval(this.pulse);
    this.peer?.destroy(); this.clients.clear();
  }
}

// Uses the room owner's existing peer, so the directory can verify ownership.
export class RoomAdvertisement {
  private room: PublicRoom | null = null;
  private connection?: DataConnection;
  private disposed = false;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private deadline?: ReturnType<typeof setTimeout>;
  private lastAck = 0;
  private pulse = setInterval(() => {
    if (this.connection?.open && this.room) {
      if (Date.now() - this.lastAck > 12000) this.retry();
      else send(this.connection, { type: 'advertise', protocol: ROOM_PROTOCOL, room: this.room });
    }
    else this.connect();
  }, 5000);
  constructor(private peer: Peer) {}
  set(room: PublicRoom | null) {
    if (this.room?.code === room?.code && this.room?.hostName === room?.hostName) return;
    this.room = room;
    if (room) {
      if (this.connection?.open) send(this.connection, { type: 'advertise', protocol: ROOM_PROTOCOL, room });
      else this.connect();
    } else {
      send(this.connection, { type: 'withdraw', protocol: ROOM_PROTOCOL });
      this.drop();
    }
  }
  private connect() {
    if (this.disposed || !this.room || this.connection || this.peer.destroyed || this.peer.disconnected) return;
    const connection = this.peer.connect(DIRECTORY_ID, { reliable: true, serialization: 'binary' });
    this.connection = connection;
    this.deadline = setTimeout(() => { if (this.connection === connection) this.retry(); }, 10000);
    connection.on('open', () => {
      if (this.connection !== connection || !this.room) return;
      clearTimeout(this.deadline); this.lastAck = Date.now(); send(connection, { type: 'advertise', protocol: ROOM_PROTOCOL, room: this.room });
    });
    connection.on('data', raw => {
      const message = readMessage(raw) as Wire | null;
      if (this.connection === connection && message?.type === 'registered' && message.protocol === ROOM_PROTOCOL) this.lastAck = Date.now();
    });
    connection.on('close', () => { if (this.connection === connection) this.retry(); });
    connection.on('error', () => { if (this.connection === connection) this.retry(); });
  }
  private drop() {
    clearTimeout(this.deadline); clearTimeout(this.retryTimer); this.retryTimer = undefined;
    const connection = this.connection; this.connection = undefined; connection?.close();
  }
  retry() {
    this.drop();
    if (!this.disposed && this.room) this.retryTimer = setTimeout(() => { this.retryTimer = undefined; this.connect(); }, 1500);
  }
  close() { this.disposed = true; this.room = null; clearInterval(this.pulse); this.drop(); }
}
