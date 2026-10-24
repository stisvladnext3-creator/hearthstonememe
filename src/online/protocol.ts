import { CARD, deckError } from '../game/cards';
import { createGame, other, type Action, type Game, type Side } from '../game/engine';
import type { HistoryEntity } from '../game/history';
import { HEROES } from '../game/presentation';

export const ROOM_PROTOCOL = 1;
export const ROOM_PREFIX = 'memestone-v08-';
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const normalizeCode = (value: string) => value.toUpperCase().replace(/[\s-]/g, '');
export const validCode = (value: string) => new RegExp(`^[${ROOM_ALPHABET}]{6}$`).test(value);
export const cleanName = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20) || 'Игрок';
const knownCard = (id: unknown): id is string => typeof id === 'string' && Object.hasOwn(CARD, id);
const knownHero = (id: unknown): id is string => typeof id === 'string' && Object.hasOwn(HEROES, id);
export function roomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), n => ROOM_ALPHABET[n % ROOM_ALPHABET.length]).join('');
}
export function validDeck(deck: unknown): deck is string[] {
  return Array.isArray(deck) && deck.length === 30 && deck.every(knownCard) && !deckError(deck);
}
export function validAction(value: unknown): value is Action {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  const uid = Number.isSafeInteger(a.uid) && Number(a.uid) > 0;
  const target = a.target === 'hero' || a.target === 'own-hero' || Number.isSafeInteger(a.target) && Number(a.target) > 0;
  switch (a.type) {
    case 'play': return uid && (a.target === undefined || target);
    case 'attack': return uid && target;
    case 'power': return a.target === undefined || target;
    case 'discover': return knownCard(a.cardId);
    case 'end': case 'concede': return true;
    default: return false;
  }
}
export function createRoomGame(hostDeck: string[], guestDeck: string[], hostName: string, guestName: string, seed: number, id: string) {
  const guestFirst = (seed & 1) === 1;
  const g = createGame(guestFirst ? guestDeck : hostDeck, seed, guestFirst ? hostDeck : guestDeck);
  if (guestFirst) { [g.player, g.bot] = [g.bot, g.player]; g.active = 'bot'; }
  g.id = id; g.player.name = cleanName(hostName); g.bot.name = cleanName(guestName);
  g.player.hero = 'mage'; g.bot.hero = 'mage';
  g.log = [{ id: 1, kind: 'turn', side: 'system', turn: 1, text: `${g[g.active].name} ходит первым.` }]; g.nextLog = 2;
  return g;
}

// UI always puts the local player at the bottom. Hidden information never goes
// over the data channel: even the owner receives only a deck count, not its order.
export function roomGameView(input: Game, viewer: Side): Game {
  const g = structuredClone(input);
  const opponent = other(viewer);
  g[opponent].hand = g[opponent].hand.map(c => ({ uid: c.uid, id: 'hidden' }));
  g.player.deck = g.player.deck.map(() => 'hidden'); g.bot.deck = g.bot.deck.map(() => 'hidden');
  g.rng = 0; g.nextUid = 0;
  if (g.discovery && g.discovery.side !== viewer) g.discovery.options = [];
  const guestName = input.bot.name ?? 'Соперник';
  for (const entry of g.log) {
    if (entry.kind === 'turn' && /^(Ваш ход\.|Ход )/.test(entry.text)) {
      const whoseTurn = entry.text === 'Ваш ход.' ? 'player' : 'bot';
      entry.text = `Ход ${input[whoseTurn].name}.`;
    }
    entry.text = entry.text.replaceAll('трактирщика Бориса', guestName).replaceAll('Бориса', guestName).replaceAll('Борис', guestName);
    if (entry.kind === 'attack' && entry.actor && entry.target) entry.text = `${entry.actor.name} → ${entry.target.name}: ${entry.amount} урона.${entry.retaliation !== undefined ? ` Ответный удар: ${entry.retaliation} урона.` : ''}`;
    if (entry.kind === 'death' && entry.actor && entry.side !== 'system') entry.text = `${entry.actor.name} (${input[entry.side].name}) погибает.`;
    if (entry.kind === 'finish' && entry.actor?.id === 'goodgame' && entry.target) entry.text = `«Хорошая игра.»: герой ${entry.target.name} уничтожен.`;
    else if (entry.kind === 'finish' && entry.side !== 'system' && entry.text.includes('сдал')) entry.text = `${input[entry.side].name} сдался.`;
    if (entry.actor?.id === 'casino' && entry.amount !== undefined && entry.target) entry.text = `Козиныч уничтожает ${entry.amount} карт колоды ${entry.target.name}.`;
    if (entry.actor?.id === 'paper-army' && entry.amount !== undefined && entry.target) entry.text = `Армия бумажек: ${input[entry.target.side].name} призывает Бумажек 2/2: ${entry.amount}.`;
    if (entry.side !== viewer && entry.kind === 'discover') {
      entry.text = 'Соперник выбирает карту раскопки.'; delete entry.target; delete entry.result;
    }
    if (entry.side !== viewer && entry.kind === 'power' && entry.actor?.id === 'briefing-power') delete entry.target;
  }
  if (viewer === 'player') return g;
  [g.player, g.bot] = [g.bot, g.player]; g.active = other(g.active);
  if (g.winner && g.winner !== 'draw') g.winner = other(g.winner);
  if (g.discovery) g.discovery.side = other(g.discovery.side);
  if (g.briefing) [g.briefing.remainingTurns.player, g.briefing.remainingTurns.bot] = [g.briefing.remainingTurns.bot, g.briefing.remainingTurns.player];
  const flip = (entity: HistoryEntity | undefined) => { if (entity) entity.side = other(entity.side); };
  for (const entry of g.log) {
    if (entry.side !== 'system') entry.side = other(entry.side);
    for (const entity of [entry.actor, entry.target, entry.hero, entry.result]) flip(entity);
  }
  for (const event of g.events) { event.side = other(event.side); if (event.target) event.target.side = other(event.target.side); }
  return g;
}

export function validRoomView(value: unknown): value is Game {
  if (!value || typeof value !== 'object') return false;
  const g = value as Game;
  const sideOf = (s: unknown) => s === 'player' || s === 'bot';
  const uid = (n: unknown) => Number.isSafeInteger(n) && Number(n) > 0;
  const entity = (e: HistoryEntity | undefined) => !e || sideOf(e.side) && typeof e.name === 'string' && Number.isFinite(e.art)
    && ['card', 'power', 'hero'].includes(e.type) && (e.type === 'hero' ? knownHero(e.id) : knownCard(e.id));
  if (typeof g.id !== 'string' || !sideOf(g.active) || ![null, 'player', 'bot', 'draw'].includes(g.winner) || !uid(g.turn) || !Number.isSafeInteger(g.rashDeaths)) return false;
  for (const side of ['player', 'bot'] as const) {
    const p = g[side];
    if (!p || ![p.health, p.armor, p.mana, p.maxMana].every(Number.isFinite) || !['spark', 'fool', 'oy', 'rds', 'briefing'].includes(p.power) || !knownHero(p.hero)) return false;
    if (p.name !== undefined && (typeof p.name !== 'string' || p.name.length > 20)) return false;
    if (!Array.isArray(p.hand) || p.hand.length > 10 || !p.hand.every(c => c && Number.isSafeInteger(c.uid) && (side === 'bot' ? c.id === 'hidden' : knownCard(c.id)))) return false;
    if (!Array.isArray(p.deck) || p.deck.length > 100 || !p.deck.every(id => id === 'hidden')) return false;
    if (!Array.isArray(p.board) || p.board.length > 7 || !p.board.every(m => m && knownCard(m.id) && uid(m.uid) && [m.attack, m.health, m.maxHealth].every(Number.isFinite)
      && [m.ready, m.taunt, m.cannotAttack, m.silenced, m.ephemeral].every(v => typeof v === 'boolean'))) return false;
  }
  if (g.briefing && (!g.briefing.remainingTurns || !['player', 'bot'].every(s => {
    const n = g.briefing!.remainingTurns[s as Side]; return Number.isInteger(n) && n >= 0 && n <= 5;
  }))) return false;
  if (g.discovery && (!sideOf(g.discovery.side) || !knownCard(g.discovery.sourceId) || !Array.isArray(g.discovery.options) || g.discovery.options.length > 3 || !g.discovery.options.every(knownCard)
    || g.discovery.target !== 'hero' && !g[other(g.discovery.side)].board.some(m => m.uid === g.discovery!.target))) return false;
  return Array.isArray(g.events) && g.events.length <= 40 && Array.isArray(g.log) && g.log.length <= 1000
    && g.events.every(e => e && uid(e.id) && sideOf(e.side) && ['attack', 'summon', 'spell', 'power', 'damage', 'death', 'transform'].includes(e.kind) && (!e.cardId || knownCard(e.cardId))
      && (!e.target || sideOf(e.target.side) && (e.target.uid === 'hero' || uid(e.target.uid))) && (e.source === undefined || e.source === 'hero' || uid(e.source)))
    && g.log.every(e => e && typeof e.text === 'string' && (e.side === 'system' || sideOf(e.side)) && (e.kind === undefined || ['play', 'attack', 'effect', 'power', 'transform', 'death', 'draw', 'discard', 'turn', 'finish', 'discover'].includes(e.kind))
      && [e.actor, e.target, e.hero, e.result].every(entity));
}

export interface Member { name: string; deck: string[]; token: string }
export interface RoomState {
  phase: 'idle' | 'connecting' | 'waiting' | 'playing' | 'error';
  role: 'host' | 'guest' | null; code: string; name: string; opponent: string;
  connected: boolean; game: Game | null; revision: number; pending: boolean;
  rematchSelf: boolean; rematchOpponent: boolean; error: string;
}
export const EMPTY_ROOM: RoomState = { phase: 'idle', role: null, code: '', name: '', opponent: '', connected: false, game: null, revision: 0, pending: false, rematchSelf: false, rematchOpponent: false, error: '' };
export type ClientMessage =
  | { type: 'hello'; protocol: number; name: string; deck: string[]; token: string }
  | { type: 'action'; action: Action; revision: number; requestId: string }
  | { type: 'rematch' }
  | { type: 'leave' };
export type HostMessage =
  | { type: 'snapshot'; protocol: number; code: string; name: string; opponent: string; game: Game | null; revision: number; rematchSelf: boolean; rematchOpponent: boolean }
  | { type: 'reject'; message: string; requestId?: string };
