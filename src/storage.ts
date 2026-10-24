import { CARD, STARTER_DECK, deckError } from './game/cards';
import { refreshAuras, type Game, type Minion, type Player } from './game/engine';
import { HEROES } from './game/presentation';
import type { HistoryEntity, HistoryEntry } from './game/history';

const PREFIX = 'memestone.v1.';
export function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(PREFIX + key); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}
export function write(key: string, value: unknown) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
  catch { return false; }
}
export function loadDeck(): string[] {
  const data = read<unknown>('deck', null);
  return Array.isArray(data) && data.every(x => typeof x === 'string') && !deckError(data) ? data : [...STARTER_DECK];
}
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const cardId = (id: unknown): id is string => typeof id === 'string' && Object.hasOwn(CARD, id);
function validEntity(e: HistoryEntity): boolean {
  return !!e && ['card', 'hero', 'power'].includes(e.type) && typeof e.name === 'string' && finite(e.art)
    && ['player', 'bot'].includes(e.side) && (e.type === 'hero' ? Object.hasOwn(HEROES, e.id) : cardId(e.id))
    && [e.attack, e.health, e.armor].every(v => v === undefined || finite(v));
}
function validEntry(entry: HistoryEntry): boolean {
  return !!entry && finite(entry.id) && typeof entry.text === 'string' && ['player', 'bot', 'system'].includes(entry.side)
    && (entry.kind === undefined || ['play', 'attack', 'effect', 'power', 'transform', 'death', 'draw', 'discard', 'turn', 'finish', 'discover'].includes(entry.kind))
    && [entry.actor, entry.target, entry.hero, entry.result].every(e => e === undefined || validEntity(e));
}
function validPlayer(p: Player): boolean {
  return !!p && [p.health, p.armor, p.mana, p.maxMana, p.fatigue].every(finite)
    && p.mana >= 0 && p.maxMana >= 0 && p.maxMana <= 10 && p.mana <= p.maxMana && p.armor >= 0
    && ['spark', 'fool', 'oy', 'rds'].includes(p.power) && typeof p.powerUsed === 'boolean' && typeof p.hero === 'string'
    && Array.isArray(p.deck) && p.deck.every(cardId)
    && Array.isArray(p.hand) && p.hand.length <= 10 && p.hand.every(c => c && cardId(c.id) && finite(c.uid))
    && Array.isArray(p.board) && p.board.length <= 7 && p.board.every((m: Minion) => m && cardId(m.id)
      && [m.uid, m.attack, m.health, m.maxHealth].every(finite)
      && (m.auraBonus === undefined || finite(m.auraBonus) && m.auraBonus >= 0)
      && (m.origin === undefined || ['played', 'summoned', 'transformed'].includes(m.origin))
      && [m.ready, m.taunt, m.cannotAttack, m.silenced, m.ephemeral].every(x => typeof x === 'boolean'));
}
export function loadGame(): Game | null {
  const g = read<Game | null>('game', null);
  if (g && g.rashDeaths === undefined) g.rashDeaths = 0;
  if (g && g.events === undefined) g.events = [];
  if (!g || typeof g.id !== 'string' || !validPlayer(g.player) || !validPlayer(g.bot) || !['player', 'bot'].includes(g.active)
    || g.winner !== null || ![g.turn, g.nextUid, g.rng, g.nextLog, g.rashDeaths].every(finite) || !Number.isSafeInteger(g.rashDeaths) || g.rashDeaths < 0
    || !Array.isArray(g.events) || !g.events.every(e => e && finite(e.id) && ['attack', 'summon', 'spell', 'power', 'damage', 'death', 'transform'].includes(e.kind) && ['player', 'bot'].includes(e.side)
      && (!e.cardId || Object.hasOwn(CARD, e.cardId)) && (!e.source || e.source === 'hero' || finite(e.source)) && (!e.target || ['player', 'bot'].includes(e.target.side) && (e.target.uid === 'hero' || finite(e.target.uid))))
    || !Array.isArray(g.log) || !g.log.every(validEntry)) return null;
  if (g.discovery && (g.discovery.side !== g.active || !cardId(g.discovery.sourceId) || CARD[g.discovery.sourceId].effect !== 'discoverBlast'
    || !Array.isArray(g.discovery.options) || g.discovery.options.length < 1 || g.discovery.options.length > 3
    || new Set(g.discovery.options).size !== g.discovery.options.length || !g.discovery.options.every(id => cardId(id) && g[g.active].deck.includes(id))
    || (g.discovery.target !== 'hero' && (!finite(g.discovery.target) || !g[g.active === 'player' ? 'bot' : 'player'].board.some(m => m.uid === g.discovery!.target))))) return null;
  refreshAuras(g);
  return g;
}
export interface Stats { wins: number; games: number; lastResult: string | null }
export function loadStats(): Stats {
  const s = read<Stats>('stats', { wins: 0, games: 0, lastResult: null });
  return s && Number.isSafeInteger(s.wins) && Number.isSafeInteger(s.games) && s.wins >= 0 && s.games >= s.wins
    ? s : { wins: 0, games: 0, lastResult: null };
}
