import { CARD, classDeck, migrateRewardDeck, type CardDef } from '../game/cards';
import { packForCards, registerCardPack } from '../game/custom-cards';
import type { Peer, DataConnection } from 'peerjs';
import { act, expireMulligan, type Action, type Game } from '../game/engine';
import { resolveCast, stageAction } from '../game/card-play';
import { acceptsActionRevision, cleanName, createRoomGame, EMPTY_ROOM, normalizeCode, ROOM_PREFIX, ROOM_PROTOCOL, roomCode, roomGameView, validAction, validCode, validDeck, validRoomView, type ClientMessage, type HostMessage, type Member, type RoomState } from './protocol';
import { peerRuntime, readMessage } from './transport';
import { DIRECTORY_ID, RoomAdvertisement } from './directory';
import { validHeroClass, type HeroClass } from '../game/classes';

interface SavedRoom { role: 'host' | 'guest'; code: string; self: Member; guest?: Member; game?: Game; revision: number; listed?: boolean }
const SAVE_KEY = 'memestone.room.v1';
export function savedRoom(): SavedRoom | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SAVE_KEY) ?? 'null') as SavedRoom | null;
    if (s) { registerCardPack(s.self?.cards ?? []); registerCardPack(s.guest?.cards ?? []); registerCardPack(s.game?.customCards ?? [], 'match'); }
    if (s?.self && Array.isArray(s.self.deck)) s.self.deck = classDeck(migrateRewardDeck(s.self.deck), s.self.heroClass ?? 'mage', true);
    if (s?.guest && Array.isArray(s.guest.deck)) s.guest.deck = classDeck(migrateRewardDeck(s.guest.deck), s.guest.heroClass ?? 'mage', true);
    if (!s || !['host', 'guest'].includes(s.role) || !validCode(s.code) || !validDeck(s.self?.deck, s.self?.heroClass ?? 'mage') || typeof s.self.name !== 'string' || typeof s.self.token !== 'string') return null;
    if (s.self.heroClass !== undefined && !validHeroClass(s.self.heroClass) || s.guest?.heroClass !== undefined && !validHeroClass(s.guest.heroClass)) return null;
    if (s.guest && (!validDeck(s.guest.deck, s.guest.heroClass ?? 'mage') || typeof s.guest.name !== 'string' || typeof s.guest.token !== 'string')) return null;
    if (s.game && (!validRoomView(roomGameView(s.game, 'player')) || ![s.game.rng, s.game.nextUid, s.game.nextLog].every(Number.isSafeInteger))) return null;
    return s;
  } catch { return null; }
}
export function inviteLink(code: string) {
  const url = new URL(location.href); url.searchParams.set('room', code); return url.toString();
}
const failureText = (type: string) => ({
  'peer-unavailable': 'Комната не найдена. Проверь код: создатель должен держать её открытой.',
  'unavailable-id': 'Этот код ещё занят. Подожди немного и попробуй вернуться в комнату.',
  'browser-incompatible': 'Этот браузер не поддерживает сетевую игру. Открой сайт в свежем Chrome или Safari.',
  'network': 'Нет связи с сервисом комнат. Проверь интернет и попробуй снова.',
  'server-error': 'Сервис комнат временно недоступен. Попробуй ещё раз.',
  'socket-error': 'Не удалось связаться с сервисом комнат. Попробуй ещё раз.',
} as Record<string, string>)[type] ?? 'Соединение не удалось. Проверь интернет и попробуй ещё раз.';

export class PeerRoom {
  state: RoomState = { ...EMPTY_ROOM };
  private peer?: Peer;
  private connection?: DataConnection;
  private advertisement?: RoomAdvertisement;
  private self?: Member;
  private guest?: Member;
  private canonical?: Game;
  private disposed = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private signalingTimer?: ReturnType<typeof setTimeout>;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private actionTimer?: ReturnType<typeof setTimeout>;
  private recentRequests = new Set<string>();
  private hostRematch = false;
  private guestRematch = false;
  private everConnected = false;
  private remoteCardIds = new Set<string>();
  private transferringCards?: string;
  private pendingStart = false;
  private phaseTimer = setInterval(() => this.advanceOpening(), 50);
  private advanceOpening() {
    if (!this.canonical || this.disposed || !this.canonical.mulligan && !this.canonical.casting) return;
    const next = resolveCast(expireMulligan(this.canonical));
    if (next !== this.canonical) { this.canonical = next; this.state.revision++; this.publish(); }
  }
  private outbound?: { type: 'action'; action: Action; revision: number; requestId: string; retried?: boolean };
  constructor(private change: (state: RoomState) => void) {}
  private update(patch: Partial<RoomState>) {
    this.state = { ...this.state, ...patch }; this.change(this.state);
    this.advertisement?.set(this.state.listed && this.state.phase === 'waiting' && !this.guest
      ? { code: this.state.code, hostName: this.state.name } : null);
  }
  private save() {
    if (!this.self || !this.state.role) return;
    try { sessionStorage.setItem(SAVE_KEY, JSON.stringify({ role: this.state.role, code: this.state.code, self: this.self, guest: this.guest, game: this.canonical, revision: this.state.revision, listed: this.state.listed } satisfies SavedRoom)); } catch { /* An open room can still play without storage. */ }
  }
  async open(role: 'host' | 'guest', name: string, deck: string[], code?: string, resume?: SavedRoom, listed = true, heroClass: HeroClass = 'mage') {
    if (!validHeroClass(heroClass)) { this.update({ phase: 'error', error: 'Выбери доступный класс героя.' }); return; }
    if (!validDeck(deck)) { this.update({ phase: 'error', error: 'Собери корректную колоду из 30 карт.' }); return; }
    const normalized = role === 'host' ? resume?.code ?? roomCode() : normalizeCode(code ?? '');
    if (!validCode(normalized)) { this.update({ phase: 'error', error: 'Код комнаты состоит из 6 букв и цифр.' }); return; }
    try { this.self = resume?.self ?? { name: cleanName(name), deck: [...deck], token: crypto.randomUUID(), cards: packForCards(deck), heroClass }; }
    catch (error) { this.update({ phase: 'error', error: String((error as Error).message) }); return; }
    this.guest = resume?.guest; this.canonical = role === 'host' ? resume?.game : undefined;
    this.update({ ...EMPTY_ROOM, phase: 'connecting', role, code: normalized, name: this.self.name, revision: resume?.revision ?? 0, listed: role === 'host' && (resume?.listed ?? listed), heroClass: this.self.heroClass ?? 'mage', opponentClass: this.guest ? this.guest.heroClass ?? 'mage' : null });
    try {
      const { Peer, options } = await peerRuntime(); if (this.disposed) return;
      const peerOptions = { ...options, token: this.self.token };
      this.peer = new Peer(role === 'host' ? ROOM_PREFIX + normalized : crypto.randomUUID(), peerOptions);
      this.connectTimer = setTimeout(() => { if (!this.state.connected && this.state.phase === 'connecting') this.update({ phase: 'error', error: 'Не удалось подключиться за 20 секунд. Проверь интернет и попробуй ещё раз.' }); }, 20000);
      this.peer.on('open', () => {
        if (this.disposed) return;
        if (role === 'host') {
          clearTimeout(this.connectTimer);
          this.advertisement ??= new RoomAdvertisement(this.peer!);
          this.update({ phase: this.canonical ? 'playing' : 'waiting', game: this.canonical ? roomGameView(this.canonical, 'player') : null, opponent: this.guest?.name ?? '' }); this.save();
        } else if (!this.connection?.open) this.connectGuest();
      });
      this.peer.on('connection', connection => { if (role === 'host') this.acceptGuest(connection); else connection.close(); });
      this.peer.on('disconnected', () => {
        clearTimeout(this.signalingTimer);
        if (!this.disposed && !this.peer?.destroyed) this.signalingTimer = setTimeout(() => { try { this.peer?.reconnect(); } catch { /* A later retry can restore signaling. */ } }, 1500);
      });
      this.peer.on('error', (error: { type: string; message?: string }) => {
        if (this.disposed) return;
        // The directory can move to another browser; its failure must never
        // interrupt the separate connection that carries the actual match.
        if (error.type === 'peer-unavailable' && error.message?.includes(DIRECTORY_ID)) { this.advertisement?.retry(); return; }
        if (this.everConnected && role === 'guest' && error.type === 'peer-unavailable') { this.scheduleReconnect(); return; }
        this.update({ error: failureText(error.type), phase: this.state.game ? 'playing' : 'error', pending: false });
      });
    } catch { this.update({ phase: 'error', error: 'Не удалось загрузить сетевой режим. Обнови страницу и попробуй снова.' }); }
  }
  private send(message: ClientMessage | HostMessage, connection = this.connection) {
    if (!connection?.open) return;
    // Keep JSON's omission of undefined optional fields while letting the binary
    // transport split the resulting string into reliable, ordered fragments.
    // The small hello stays an object so an older host can report a version
    // mismatch immediately, instead of silently ignoring a new wire format.
    try { connection.send(connection.serialization === 'binary' && message.type !== 'hello' ? JSON.stringify(message) : message); } catch { this.onDisconnected(connection); }
  }
  private connectGuest() {
    if (!this.peer || this.peer.destroyed || this.disposed) return;
    // JSON connections reject messages >= 16,300 bytes. Battle history reaches
    // that in a few turns, especially with echo. Binary connections fragment
    // and reassemble large snapshots without dropping any history or effects.
    const connection = this.peer.connect(ROOM_PREFIX + this.state.code, { reliable: true, serialization: 'binary' });
    this.connection = connection;
    connection.on('open', () => { this.watchConnection(connection); this.send({ type: 'hello', protocol: ROOM_PROTOCOL, ...this.self! }, connection); });
    connection.on('data', data => { if (connection === this.connection) this.receiveHost(data); });
    connection.on('close', () => this.onDisconnected(connection));
    connection.on('error', () => this.onDisconnected(connection));
  }
  private acceptGuest(connection: DataConnection) {
    let admitted = false;
    const timeout = setTimeout(() => { if (!admitted) connection.close(); }, 12000);
    connection.on('data', raw => {
      const parsed = readMessage(raw);
      if (this.disposed || !parsed || typeof parsed !== 'object') return;
      const data = parsed as ClientMessage;
      if (!admitted) {
        if (data.type !== 'hello') return;
        const reject = (message: string) => { this.send({ type: 'reject', message }, connection); clearTimeout(timeout); setTimeout(() => connection.close(), 100); };
        if (data.protocol !== ROOM_PROTOCOL || connection.serialization !== 'binary') { reject('Версии игры не совпадают. Обоим игрокам нужно обновить страницу.'); return; }
        if (data.heroClass !== undefined && !validHeroClass(data.heroClass)) { reject('Неизвестный класс героя. Обнови страницу и выбери класс заново.'); return; }
        try { registerCardPack(data.cards ?? []); packForCards([...this.self!.deck, ...(Array.isArray(data.deck) ? data.deck : [])], 'match'); }
        catch { reject('Не удалось загрузить набор своих карт. Проверь ссылки и размер набора в редакторе.'); return; }
        if (!validDeck(data.deck, data.heroClass ?? 'mage') || typeof data.name !== 'string' || typeof data.token !== 'string' || data.token.length > 100 || data.token.length < 16) { reject('Некорректные данные игрока или колода.'); return; }
        if (this.guest && data.token !== this.guest.token) { reject('Комната уже занята двумя игроками.'); return; }
        admitted = true; clearTimeout(timeout);
        const previous = this.connection;
        this.connection = connection; this.remoteCardIds = new Set((data.cards ?? []).map(card => card.id)); this.transferringCards = undefined; this.guest ??= { name: cleanName(data.name), deck: [...data.deck], token: data.token, cards: packForCards(data.deck), heroClass: data.heroClass ?? 'mage' };
        if (previous !== connection) previous?.close();
        this.watchConnection(connection);
        this.everConnected = true;
        this.update({ connected: true, error: '', opponent: this.guest.name, opponentClass: this.guest.heroClass ?? 'mage' }); this.publish();
        if (this.pendingStart) this.start();
        return;
      }
      if (connection !== this.connection) return;
      if (data.type === 'cards-ready') {
        if (data.key !== this.transferringCards) return;
        data.key.split(',').forEach(id => this.remoteCardIds.add(id)); this.transferringCards = undefined; this.update({ error: '', pending: false });
        if (this.pendingStart) { this.pendingStart = false; this.start(); } else this.publish();
      } else if (data.type === 'action') {
        if (typeof data.requestId !== 'string' || data.requestId.length > 100) return;
        this.advanceOpening();
        if (this.recentRequests.has(data.requestId)) { this.publish(); return; }
        this.recentRequests.add(data.requestId); if (this.recentRequests.size > 200) this.recentRequests.delete(this.recentRequests.values().next().value!);
        if (!validAction(data.action) || !this.canonical || !acceptsActionRevision(this.canonical, this.state.revision, data.revision, data.action)) {
          this.send({ type: 'reject', message: 'Состояние партии обновилось. Повтори действие.', requestId: data.requestId }); this.publish(); return;
        }
        const result = stageAction(this.canonical, 'bot', data.action);
        if (result.error) this.send({ type: 'reject', message: result.error, requestId: data.requestId });
        else { this.canonical = result.state; this.state.revision++; }
        this.publish();
      } else if (data.type === 'rematch' && this.canonical?.winner) {
        if (data.deck !== undefined) {
          try {
            registerCardPack(data.cards ?? []);
            if (!validDeck(data.deck, data.heroClass ?? 'mage') || data.heroClass !== undefined && !validHeroClass(data.heroClass)) {
              this.send({ type: 'reject', message: 'Собери колоду из 30 карт и выбери её класс.' }); return;
            }
            packForCards([...this.self!.deck, ...data.deck], 'match');
            this.guest = { ...this.guest!, deck: [...data.deck], cards: packForCards(data.deck), heroClass: data.heroClass ?? this.guest?.heroClass ?? 'mage' };
          } catch { this.send({ type: 'reject', message: 'Не удалось загрузить карты новой колоды.' }); return; }
        }
        this.guestRematch = true; this.maybeRematch();
      }
      else if (data.type === 'leave') {
        if (this.canonical && !this.canonical.winner) { this.canonical = act(this.canonical, 'bot', { type: 'concede' }).state; this.state.revision++; this.publish(); }
        else if (!this.canonical) this.guest = undefined;
        this.update({ connected: false, opponent: this.guest?.name ?? '', error: 'Соперник вышел из комнаты.' }); this.save(); connection.close();
      }
    });
    connection.on('close', () => { clearTimeout(timeout); if (admitted) this.onDisconnected(connection); });
    connection.on('error', () => { clearTimeout(timeout); if (admitted) this.onDisconnected(connection); });
  }
  private receiveHost(raw: unknown) {
    const parsed = readMessage(raw);
    if (this.disposed || !parsed || typeof parsed !== 'object') return;
    const data = parsed as HostMessage;
    if (data.type === 'cards') {
      if (data.protocol !== ROOM_PROTOCOL || data.code !== this.state.code || typeof data.key !== 'string') return;
      try {
        const cards = registerCardPack(data.cards, 'match');
        if (cards.map(c => c.id).sort().join(',') !== data.key) return;
        this.send({ type: 'cards-ready', key: data.key });
      } catch { this.update({ error: 'Не удалось загрузить набор карт соперника.' }); }
      return;
    }
    if (data.type === 'reject') {
      clearTimeout(this.actionTimer);
      this.outbound = undefined;
      this.update({ error: String(data.message).slice(0, 300), pending: false, phase: this.state.game ? 'playing' : 'error' }); return;
    }
    if (data.type !== 'snapshot' || data.protocol !== ROOM_PROTOCOL || data.code !== this.state.code || !Number.isSafeInteger(data.revision) || data.revision < this.state.revision) return;
    if (data.game && data.cardIds) {
      if (!Array.isArray(data.cardIds) || data.cardIds.length > 60 || data.cardIds.some(id => typeof id !== 'string' || !CARD[id]?.editor)) return;
      data.game.customCards = data.cardIds.map(id => CARD[id]);
    }
    if (data.heroClass !== undefined && !validHeroClass(data.heroClass) || data.opponentClass !== undefined && !validHeroClass(data.opponentClass)) return;
    if (typeof data.name !== 'string' || typeof data.opponent !== 'string' || typeof data.rematchSelf !== 'boolean' || typeof data.rematchOpponent !== 'boolean' || data.game !== null && !validRoomView(data.game)) return;
    this.everConnected = true; clearTimeout(this.connectTimer); clearTimeout(this.actionTimer);
    const retry = this.outbound && !this.outbound.retried && data.revision === this.outbound.revision ? this.outbound : undefined;
    this.outbound = undefined;
    this.update({ phase: data.game ? 'playing' : 'waiting', name: cleanName(data.name), opponent: cleanName(data.opponent), connected: true, game: data.game, revision: data.revision, pending: false, error: '', rematchSelf: data.rematchSelf, rematchOpponent: data.rematchOpponent, heroClass: data.heroClass ?? this.self?.heroClass ?? 'mage', opponentClass: data.opponentClass ?? 'mage' });
    this.save();
    // A reconnect snapshot tells us whether an unacknowledged move reached the
    // host. Replay it only if the revision did not advance, with the same ID.
    if (retry && data.game && !data.game.winner) this.sendAction({ ...retry, retried: true });
  }
  private watchConnection(connection: DataConnection) {
    const pc = connection.peerConnection;
    if (!pc) return;
    const check = () => {
      // Browsers can report failed ICE while RTCDataChannel.readyState and
      // PeerJS .open remain "open". Watching only the data channel freezes play.
      if (['failed', 'closed'].includes(pc.connectionState) || ['failed', 'closed'].includes(pc.iceConnectionState)) this.onDisconnected(connection);
    };
    pc.addEventListener('connectionstatechange', check); pc.addEventListener('iceconnectionstatechange', check);
    connection.on('close', () => { pc.removeEventListener('connectionstatechange', check); pc.removeEventListener('iceconnectionstatechange', check); });
    check();
  }
  private onDisconnected(connection: DataConnection) {
    if (this.disposed || connection !== this.connection || !this.everConnected && this.state.phase === 'error') return;
    // Retire failed channels too: an error can arrive while .open is still true.
    // Otherwise a reconnect either reuses a dead channel or leaves a stale seat.
    this.connection = undefined; clearTimeout(this.actionTimer); connection.close();
    this.update({ connected: false, pending: false, error: this.state.role === 'host' ? 'Связь с соперником потеряна. Ждём возвращения.' : 'Связь с создателем потеряна. Переподключаемся…' });
    if (this.state.role === 'guest' && this.everConnected) this.scheduleReconnect();
  }
  private scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => { if (!this.disposed && !this.state.connected) this.connectGuest(); }, 2500);
  }
  private publish() {
    if (!this.self) return;
    this.update({ phase: this.canonical ? 'playing' : 'waiting', game: this.canonical ? roomGameView(this.canonical, 'player') : null, rematchSelf: this.hostRematch, rematchOpponent: this.guestRematch, heroClass: this.self.heroClass ?? 'mage', opponentClass: this.guest?.heroClass ?? null });
    if (this.guest) {
      const game = this.canonical ? roomGameView(this.canonical, 'bot') : null;
      let cardIds: string[] | undefined;
      if (game?.customCards?.length) {
        if (!this.transferCards(game.customCards)) { this.save(); return; }
        cardIds = game.customCards.map(c => c.id); delete game.customCards;
      }
      this.send({ type: 'snapshot', protocol: ROOM_PROTOCOL, code: this.state.code, name: this.guest.name, opponent: this.self.name, game, cardIds, revision: this.state.revision, rematchSelf: this.guestRematch, rematchOpponent: this.hostRematch, heroClass: this.guest.heroClass ?? 'mage', opponentClass: this.self.heroClass ?? 'mage' });
    }
    this.save();
  }
  private transferCards(cards: CardDef[]): boolean {
    if (cards.every(card => this.remoteCardIds.has(card.id))) return true;
    const key = cards.map(c => c.id).sort().join(',');
    if (this.transferringCards !== key && this.connection?.open) {
      this.transferringCards = key;
      this.send({ type: 'cards', protocol: ROOM_PROTOCOL, code: this.state.code, key, cards });
    }
    return false;
  }
  start() {
    if (this.state.role !== 'host' || !this.guest || !this.state.connected || this.canonical && !this.canonical.winner) return;
    if (!this.transferCards(packForCards([...this.self!.deck, ...this.guest.deck], 'match'))) { this.pendingStart = true; this.update({ pending: true }); return; }
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    this.canonical = createRoomGame(this.self!.deck, this.guest.deck, this.self!.name, this.guest.name, seed, crypto.randomUUID(), Date.now() + 30_000, { host: this.self!.heroClass ?? 'mage', guest: this.guest.heroClass ?? 'mage' });
    this.hostRematch = this.guestRematch = false; this.state.revision++; this.recentRequests.clear(); this.publish();
  }
  action(action: Action) {
    this.advanceOpening();
    if (!validAction(action) || !this.state.connected || !this.state.game || this.state.pending) return;
    if (this.state.role === 'host') {
      const result = stageAction(this.canonical!, 'player', action);
      if (result.error) this.update({ error: result.error });
      else { this.canonical = result.state; this.state.revision++; this.update({ error: '' }); this.publish(); }
    } else {
      this.sendAction({ type: 'action', action, revision: this.state.revision, requestId: crypto.randomUUID() });
    }
  }
  private sendAction(message: NonNullable<PeerRoom['outbound']>) {
    this.outbound = message; this.update({ pending: true, error: '' }); this.send(message);
    clearTimeout(this.actionTimer); this.actionTimer = setTimeout(() => { this.outbound = undefined; this.update({ pending: false, error: 'Ответ задерживается. Проверь соединение.' }); }, 15000);
  }
  rematch(deck?: string[], heroClass?: HeroClass) {
    if (!this.state.game?.winner || !this.state.connected) return;
    if (deck) {
      if (!validDeck(deck, heroClass) || !validHeroClass(heroClass)) { this.update({ error: 'Для нового боя выбери готовую колоду.' }); return; }
      try {
        packForCards([...deck, ...(this.guest?.deck ?? [])], 'match');
        this.self = { ...this.self!, deck: [...deck], cards: packForCards(deck), heroClass }; this.save();
      } catch { this.update({ error: 'Не удалось загрузить карты новой колоды.' }); return; }
    }
    if (this.state.role === 'host') { this.hostRematch = true; this.maybeRematch(); }
    else { this.update({ rematchSelf: true }); this.send({ type: 'rematch', deck: this.self!.deck, cards: this.self!.cards, heroClass: this.self!.heroClass }); }
  }
  private maybeRematch() {
    if (this.canonical?.winner && this.hostRematch && this.guestRematch) this.start(); else this.publish();
  }
  setListed(listed: boolean) {
    if (this.state.role !== 'host') return;
    this.update({ listed }); this.save();
  }
  close(clearSave = false) {
    if (clearSave && this.state.role === 'guest') this.send({ type: 'leave' });
    if (clearSave && this.state.role === 'host' && this.canonical && !this.canonical.winner) {
      this.canonical = act(this.canonical, 'player', { type: 'concede' }).state; this.state.revision++; this.publish();
    }
    this.disposed = true; clearInterval(this.phaseTimer); clearTimeout(this.reconnectTimer); clearTimeout(this.signalingTimer); clearTimeout(this.connectTimer); clearTimeout(this.actionTimer);
    this.advertisement?.close();
    const peer = this.peer; setTimeout(() => peer?.destroy(), clearSave ? 150 : 0);
    if (clearSave) { try { sessionStorage.removeItem(SAVE_KEY); } catch { /* Optional storage. */ } }
  }
}
