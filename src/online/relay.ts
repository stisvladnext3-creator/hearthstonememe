import mqtt, { type MqttClient } from 'mqtt';
import { cleanName, ROOM_PREFIX, validCode } from './protocol';
import type { DirectoryState, PublicRoom } from './directory';

// Public prototype relay. WSS uses the normal HTTPS port; game messages are
// end-to-end encrypted, while only room names/codes enter the public directory.
export const RELAY_URL = 'wss://public.cloud.shiftr.io';
const ROOT = 'memestone/live-v3';
const PEERS = `${ROOT}/peers/`, INBOX = `${ROOT}/inbox/`, ROOMS = `${ROOT}/rooms/`;
const LIMIT = 2_000_000, CHUNK = 24_000;
const encoder = new TextEncoder(), decoder = new TextDecoder();
type Listener = (...args: any[]) => void;
class Events {
  private handlers = new Map<string, Listener[]>();
  on(event: string, fn: Listener) { this.handlers.set(event, [...this.handlers.get(event) ?? [], fn]); return this; }
  emit(event: string, ...args: unknown[]) { for (const fn of this.handlers.get(event) ?? []) fn(...args); }
}
function bytes(value: Uint8Array): ArrayBuffer { return Uint8Array.from(value).buffer as ArrayBuffer; }
function base64(value: Uint8Array) {
  let s = ''; for (let i = 0; i < value.length; i += 8192) s += String.fromCharCode(...value.subarray(i, i + 8192));
  return btoa(s);
}
function unbase64(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function unpack(data: Uint8Array, zipped: boolean) {
  if (!zipped) { if (data.length > LIMIT) throw new Error('Message too large'); return decoder.decode(data); }
  const stream = new Blob([bytes(data)]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts: Uint8Array[] = []; let length = 0;
  for (;;) { const next = await stream.read(); if (next.done) break; length += next.value.length; if (length > LIMIT) { await stream.cancel(); throw new Error('Message too large'); } parts.push(next.value); }
  const result = new Uint8Array(length); let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return decoder.decode(result);
}
class Bus extends Events {
  readonly client: MqttClient;
  constructor(will?: { topic: string; payload: string }) {
    super();
    this.client = mqtt.connect(RELAY_URL, { username: 'public', password: 'public', clientId: `ms-${crypto.randomUUID()}`,
      protocolVersion: 4, clean: true, keepalive: 20, reconnectPeriod: 0, connectTimeout: 12_000,
      ...(will ? { will: { ...will, qos: 1, retain: true } } : {}) });
    this.client.on('connect', () => this.emit('open'));
    this.client.on('close', () => this.emit('close'));
    this.client.on('error', error => this.emit('error', error));
    this.client.on('message', (topic, payload) => {
      if (payload.length > 36_000) return;
      try { this.emit('message', topic, payload.length ? JSON.parse(decoder.decode(payload)) : null); } catch { /* Ignore malformed public metadata. */ }
    });
  }
  subscribe(topic: string) { return new Promise<void>((resolve, reject) => this.client.subscribe(topic, { qos: 1 }, error => error ? reject(error) : resolve())); }
  publish(topic: string, value: unknown, retained = false) {
    if (!this.client.connected) return;
    this.client.publish(topic, value === null ? '' : JSON.stringify(value), { qos: 1, retain: retained });
  }
  close() { this.client.end(false); }
}
type Frame = { t: string; src: string; id: string; key?: JsonWebKey; zip?: boolean; mid?: string; i?: number; n?: number; iv?: string; z?: boolean; body?: string };
type Pieces = { parts: string[]; count: number; iv: string; zipped: boolean; since: number };
export class RelayConnection extends Events {
  readonly serialization = 'binary';
  readonly peerConnection = undefined;
  open = false;
  private closed = false;
  private key?: CryptoKey;
  private compress = false;
  private keys?: CryptoKeyPair;
  private outgoing = Promise.resolve();
  private incoming = Promise.resolve();
  private pieces = new Map<string, Pieces>();
  private seen = new Set<string>();
  private deadline = setTimeout(() => { if (!this.open) { this.owner.fail('peer-unavailable'); this.finish(); } }, 12_000);
  constructor(readonly owner: RelayPeer, readonly peer: string, readonly id: string) { super(); }
  private async prepare(remote?: JsonWebKey) {
    this.keys ??= await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    if (remote) {
      const key = await crypto.subtle.importKey('jwk', remote, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      this.key = await crypto.subtle.deriveKey({ name: 'ECDH', public: key }, this.keys.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }
    return crypto.subtle.exportKey('jwk', this.keys.publicKey);
  }
  async start() {
    try { const key = await this.prepare(); if (!this.closed) this.owner.write(this.peer, { t: 'offer', id: this.id, key, zip: typeof DecompressionStream !== 'undefined' }); }
    catch { this.finish(); this.owner.fail('network'); }
  }
  async accept(key: JsonWebKey, zip: boolean) {
    try {
      const publicKey = await this.prepare(key); if (this.closed) return;
      this.open = true; clearTimeout(this.deadline);
      this.compress = zip && typeof CompressionStream !== 'undefined';
      this.owner.write(this.peer, { t: 'answer', id: this.id, key: publicKey, zip: typeof DecompressionStream !== 'undefined' }); this.emit('open');
    } catch { this.finish(); }
  }
  receive(frame: Frame) {
    if (this.closed) return;
    if (frame.t === 'answer' && frame.key && !this.open) {
      this.compress = !!frame.zip && typeof CompressionStream !== 'undefined';
      void this.prepare(frame.key).then(() => { if (!this.closed) { this.open = true; clearTimeout(this.deadline); this.emit('open'); } }).catch(() => this.finish());
      return;
    }
    if (frame.t !== 'data' || !this.key || !frame.mid || this.seen.has(frame.mid) || typeof frame.body !== 'string'
      || frame.body.length > CHUNK || !Number.isInteger(frame.i) || !Number.isInteger(frame.n)
      || frame.n! < 1 || frame.n! > 128 || frame.i! < 0 || frame.i! >= frame.n! || typeof frame.iv !== 'string' || frame.iv.length > 30) return;
    for (const [id, pending] of this.pieces) if (Date.now() - pending.since > 30_000) this.pieces.delete(id);
    let pending = this.pieces.get(frame.mid);
    if (!pending) { if (this.pieces.size >= 4) return; pending = { parts: Array(frame.n).fill(''), count: 0, iv: frame.iv, zipped: !!frame.z, since: Date.now() }; this.pieces.set(frame.mid, pending); }
    if (pending.parts.length !== frame.n || pending.iv !== frame.iv || pending.parts[frame.i!]) return;
    pending.parts[frame.i!] = frame.body; pending.count++;
    if (pending.count !== frame.n) return;
    this.pieces.delete(frame.mid); this.seen.add(frame.mid); if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!);
    const complete = pending;
    this.incoming = this.incoming.then(async () => {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(unbase64(complete.iv)) }, this.key!, bytes(unbase64(complete.parts.join(''))));
      const message = JSON.parse(await unpack(new Uint8Array(plain), complete.zipped)) as { data?: string; closed?: boolean };
      if (message.closed) this.finish(); else if (typeof message.data === 'string' && this.open) this.emit('data', message.data);
    }).catch(() => this.finish());
  }
  private queue(message: { data?: string; closed?: boolean }) {
    this.outgoing = this.outgoing.then(async () => {
      let data = encoder.encode(JSON.stringify(message)); if (data.length > LIMIT) throw new Error('Message too large');
      const zipped = data.length > 2000 && this.compress;
      if (zipped) data = new Uint8Array(await new Response(new Blob([bytes(data)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = base64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bytes(iv) }, this.key!, bytes(data))));
      const n = Math.ceil(encrypted.length / CHUNK), mid = crypto.randomUUID();
      for (let i = 0; i < n; i++) this.owner.write(this.peer, { t: 'data', id: this.id, mid, i, n, iv: base64(iv), z: zipped, body: encrypted.slice(i * CHUNK, (i + 1) * CHUNK) });
    }).catch(() => this.finish());
  }
  send(value: unknown) { if (!this.open || this.closed) throw new Error('Connection closed'); this.queue({ data: typeof value === 'string' ? value : JSON.stringify(value) }); }
  close() { if (this.closed) return; if (this.open) this.queue({ closed: true }); void this.outgoing.finally(() => this.finish()); }
  finish() { if (this.closed) return; this.closed = true; this.open = false; clearTimeout(this.deadline); this.pieces.clear(); this.owner.release(this); this.emit('close'); }
}
export class RelayPeer extends Events {
  readonly id: string;
  destroyed = false;
  disconnected = true;
  private instance = crypto.randomUUID();
  private owner = '';
  private opened = false;
  private occupied = false;
  private bus?: Bus;
  private channels = new Map<string, RelayConnection>();
  private pulse?: ReturnType<typeof setInterval>;
  constructor(id?: string | object, options?: { token?: string }) {
    super(); this.id = typeof id === 'string' ? id : crypto.randomUUID();
    void this.init(options?.token ?? crypto.randomUUID());
  }
  fail(type: string) { if (!this.destroyed) this.emit('error', { type, message: type === 'peer-unavailable' ? 'Room peer unavailable' : 'Room relay unavailable' }); }
  private presence(online: boolean) { return { online, owner: this.owner, instance: this.instance, until: Date.now() + 20_000 }; }
  private async init(token: string) {
    try {
      this.owner = base64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token)))); if (this.destroyed) return;
      const bus = this.bus = new Bus({ topic: PEERS + this.id, payload: '' });
      bus.on('error', () => this.fail('network'));
      bus.on('close', () => { if (this.destroyed) return; this.disconnected = true; for (const c of [...this.channels.values()]) c.finish(); this.emit('disconnected'); });
      bus.on('message', (topic: string, message: Frame & { online?: boolean; owner?: string; instance?: string; until?: number }) => {
        if (topic.startsWith(PEERS)) {
          const peer = topic.slice(PEERS.length);
          if (peer === this.id && message?.online && message.instance !== this.instance && (message.until ?? 0) > Date.now()) {
            if (!this.opened && message.owner !== this.owner) this.occupied = true;
            else if (this.opened && message.owner === this.owner) this.dispose(false);
          } else if (peer !== this.id && (!message || message.online === false)) for (const c of [...this.channels.values()]) if (c.peer === peer) c.finish();
          return;
        }
        if (topic !== INBOX + this.id || !message || typeof message.id !== 'string' || message.id.length > 100
          || typeof message.src !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(message.src)) return;
        let channel = this.channels.get(message.id);
        if (message.t === 'offer' && message.key && !channel && this.channels.size < 16) {
          channel = this.make(message.src, message.id); this.emit('connection', channel); void channel.accept(message.key, !!message.zip);
        } else if (channel?.peer === message.src) channel.receive(message);
      });
      bus.on('open', () => { void (async () => {
        this.occupied = false; await Promise.all([bus.subscribe(INBOX + this.id), bus.subscribe(PEERS + this.id)]);
        await new Promise(resolve => setTimeout(resolve, 200)); if (this.destroyed) return;
        if (this.occupied) { this.fail('unavailable-id'); this.dispose(false); return; }
        this.disconnected = false; this.opened = true; bus.publish(PEERS + this.id, this.presence(true), true);
        clearInterval(this.pulse); this.pulse = setInterval(() => { if (!this.disconnected) bus.publish(PEERS + this.id, this.presence(true), true); }, 5000);
        this.emit('open', this.id);
      })().catch(() => this.fail('network')); });
    } catch { this.fail('browser-incompatible'); }
  }
  private make(peer: string, id: string) {
    const channel = new RelayConnection(this, peer, id); this.channels.set(id, channel);
    void this.bus?.subscribe(PEERS + peer).catch(() => channel.finish()); return channel;
  }
  connect(peer: string) { const channel = this.make(peer, crypto.randomUUID()); void channel.start(); return channel; }
  write(peer: string, value: Omit<Frame, 'src'>) { this.bus?.publish(INBOX + peer, { ...value, src: this.id }); }
  release(channel: RelayConnection) { this.channels.delete(channel.id); }
  reconnect() { if (!this.destroyed && this.disconnected) this.bus?.client.reconnect(); }
  advertisement() { return new RelayAdvertisement(this); }
  publishRoom(room: PublicRoom | null) {
    if (this.id.startsWith(ROOM_PREFIX)) this.bus?.publish(ROOMS + this.id.slice(ROOM_PREFIX.length), room ? { ...room, peer: this.id, until: Date.now() + 20_000 } : null, true);
  }
  private dispose(announce: boolean) {
    if (this.destroyed) return; this.destroyed = true; this.disconnected = true; clearInterval(this.pulse);
    if (announce) { this.publishRoom(null); this.bus?.publish(PEERS + this.id, null, true); }
    for (const c of [...this.channels.values()]) c.finish(); this.bus?.close(); this.emit('close');
  }
  destroy() { this.dispose(true); }
}
class RelayAdvertisement {
  private room: PublicRoom | null = null;
  private pulse = setInterval(() => this.retry(), 5000);
  constructor(private peer: RelayPeer) {}
  set(room: PublicRoom | null) {
    if (this.room?.code === room?.code && this.room?.hostName === room?.hostName) return;
    this.room = room; this.peer.publishRoom(room);
  }
  retry() { if (this.room) this.peer.publishRoom(this.room); }
  close() { clearInterval(this.pulse); this.peer.publishRoom(null); }
}
export class RelayDirectory {
  private bus = new Bus();
  private ads = new Map<string, PublicRoom & { until: number; peer: string }>();
  private peers = new Map<string, { online: boolean; until: number }>();
  private pulse = setInterval(() => this.broadcast(), 3000);
  private retry?: ReturnType<typeof setTimeout>;
  private disposed = false;
  constructor(private change: (state: DirectoryState) => void) {
    this.bus.on('open', () => { void Promise.all([this.bus.subscribe(ROOMS + '+'), this.bus.subscribe(PEERS + '+')]).then(() => this.broadcast()).catch(() => this.offline()); });
    this.bus.on('close', () => this.offline()); this.bus.on('error', () => this.offline());
    this.bus.on('message', (topic: string, value: any) => {
      if (topic.startsWith(PEERS)) {
        if (!value) this.peers.delete(topic.slice(PEERS.length));
        else if (typeof value.online === 'boolean' && Number.isFinite(value.until)) this.peers.set(topic.slice(PEERS.length), value);
      } else if (topic.startsWith(ROOMS)) {
        const code = topic.slice(ROOMS.length);
        if (!value) this.ads.delete(code);
        else if (validCode(code) && value.code === code && typeof value.hostName === 'string' && value.peer === ROOM_PREFIX + code && Number.isFinite(value.until))
          this.ads.set(code, { code, hostName: cleanName(value.hostName), peer: value.peer, until: value.until });
      }
      this.broadcast();
    });
  }
  private broadcast() {
    if (this.disposed || !this.bus.client.connected) return;
    const now = Date.now();
    for (const [code, room] of this.ads) if (room.until < now) { this.ads.delete(code); this.bus.publish(ROOMS + code, null, true); }
    const rooms = [...this.ads.values()].filter(room => { const peer = this.peers.get(room.peer); return peer?.online && peer.until > now; })
      .sort((a, b) => a.hostName.localeCompare(b.hostName, 'ru') || a.code.localeCompare(b.code)).slice(0, 100).map(({ code, hostName }) => ({ code, hostName }));
    this.change({ rooms, status: 'ready' });
  }
  private offline() {
    if (this.disposed) return; this.change({ rooms: [], status: 'error' }); clearTimeout(this.retry);
    this.retry = setTimeout(() => { if (!this.disposed) this.bus.client.reconnect(); }, 1500);
  }
  refresh() { if (this.bus.client.connected) this.broadcast(); else this.bus.client.reconnect(); }
  close() { this.disposed = true; clearInterval(this.pulse); clearTimeout(this.retry); this.bus.close(); }
}
