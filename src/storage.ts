import { CARD, STARTER_DECK, deckError } from './game/cards';
import type { Game, Minion, Player } from './game/engine';

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
function validPlayer(p: Player): boolean {
  return !!p && [p.health, p.armor, p.mana, p.maxMana, p.fatigue].every(finite)
    && p.mana >= 0 && p.maxMana >= 0 && p.maxMana <= 10 && p.mana <= p.maxMana && p.armor >= 0
    && ['spark', 'fool', 'oy', 'rds'].includes(p.power) && typeof p.powerUsed === 'boolean' && typeof p.hero === 'string'
    && Array.isArray(p.deck) && p.deck.every(id => typeof id === 'string' && CARD[id])
    && Array.isArray(p.hand) && p.hand.length <= 10 && p.hand.every(c => c && CARD[c.id] && finite(c.uid))
    && Array.isArray(p.board) && p.board.length <= 7 && p.board.every((m: Minion) => m && CARD[m.id]
      && [m.uid, m.attack, m.health, m.maxHealth].every(finite)
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
    || !Array.isArray(g.log) || !g.log.every(l => l && finite(l.id) && typeof l.text === 'string'
      && ['player', 'bot', 'system'].includes(l.side))) return null;
  return g;
}
export interface Stats { wins: number; games: number; lastResult: string | null }
export function loadStats(): Stats {
  const s = read<Stats>('stats', { wins: 0, games: 0, lastResult: null });
  return s && Number.isSafeInteger(s.wins) && Number.isSafeInteger(s.games) && s.wins >= 0 && s.games >= s.wins
    ? s : { wins: 0, games: 0, lastResult: null };
}
