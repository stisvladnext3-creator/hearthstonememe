import {validAdaptation} from './game/adaptation';
import { profileChanged, profileKey } from './account/scope';
import { validCast } from './game/card-play';
import { validKeywordState } from './game/battle-keywords';
import { CARD, cardAbilities, STARTER_DECK, deckError, migrateRewardDeck } from './game/cards';
import { clawFuryPool, refreshAuras, type Game, type Minion, type Player } from './game/engine';
import { HEROES } from './game/presentation';
import { knownPower } from './game/presentation';
import { registerCardPack, validContinuation, validCustomCounts } from './game/custom-cards';
import type { HistoryEntity, HistoryEntry } from './game/history';
import { emptyMetrics, validMetrics, METRIC_KEYS, type MatchMetrics } from './game/metrics';

export function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(profileKey(key)); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}
export function write(key: string, value: unknown) {
  try { const name=profileKey(key),raw=JSON.stringify(value);if(localStorage.getItem(name)!==raw){localStorage.setItem(name,raw);profileChanged([key]);}return true; }
  catch { return false; }
}
export function loadDeck(): string[] {
  const data = read<unknown>('deck', null);
  if (!Array.isArray(data) || !data.every(x => typeof x === 'string')) return [...STARTER_DECK];
  const migrated = migrateRewardDeck(data);
  return !deckError(migrated) ? migrated : [...STARTER_DECK];
}
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const cardId = (id: unknown): id is string => typeof id === 'string' && Object.hasOwn(CARD, id);
function validEntity(e: HistoryEntity): boolean {
  return !!e && ['card', 'hero', 'power'].includes(e.type) && typeof e.name === 'string' && finite(e.art)
    && ['player', 'bot'].includes(e.side) && (e.type === 'hero' ? Object.hasOwn(HEROES, e.id) || CARD[e.id]?.kind === 'hero' : cardId(e.id))
    && [e.attack, e.health, e.armor].every(v => v === undefined || finite(v));
}
function validEntry(entry: HistoryEntry): boolean {
  return !!entry && finite(entry.id) && typeof entry.text === 'string' && ['player', 'bot', 'system'].includes(entry.side)
    && (entry.kind === undefined || ['play', 'attack', 'effect', 'power', 'transform', 'death', 'draw', 'discard', 'turn', 'finish', 'discover'].includes(entry.kind))
    && [entry.actor, entry.target, entry.hero, entry.result].every(e => e === undefined || validEntity(e));
}
function validPlayer(p: Player): boolean {
  return !!p && [p.health, p.armor, p.mana, p.maxMana, p.fatigue].every(finite)
    && validKeywordState(p) && (p.metrics === undefined || validMetrics(p.metrics))
    && p.mana >= 0 && p.maxMana >= 0 && p.maxMana <= 10 && p.mana <= p.maxMana && p.armor >= 0
    && knownPower(p.power) && typeof p.powerUsed === 'boolean' && typeof p.hero === 'string'
    && (p.name === undefined || typeof p.name === 'string' && p.name.length <= 20)
    && (p.powerSilenceTurns === undefined || Number.isSafeInteger(p.powerSilenceTurns) && p.powerSilenceTurns >= 0 && p.powerSilenceTurns <= 2)
    && (p.quest === undefined || !!CARD[p.quest?.id] && Number.isSafeInteger(p.quest.progress) && p.quest.progress >= 0 && p.quest.progress < (cardAbilities(CARD[p.quest.id])?.quest?.goal ?? 8))
    && Array.isArray(p.deck) && p.deck.every(cardId)
    && Array.isArray(p.hand) && p.hand.length <= 10 && p.hand.every(c => c && cardId(c.id) && finite(c.uid) && (c.expiresTurn === undefined || Number.isSafeInteger(c.expiresTurn) && c.expiresTurn > 0))
    && Array.isArray(p.board) && p.board.length <= 7 && p.board.every((m: Minion) => m && validKeywordState(m) && cardId(m.id)
      && [m.uid, m.attack, m.health, m.maxHealth].every(finite)
      && (m.auraBonus === undefined || finite(m.auraBonus) && m.auraBonus >= 0)
      && (m.attackBuff === undefined || finite(m.attackBuff)) && (m.healthBuff === undefined || finite(m.healthBuff))
      && (m.stealth === undefined || typeof m.stealth === 'boolean') && (m.charge === undefined || typeof m.charge === 'boolean') && (m.attackedThisTurn === undefined || typeof m.attackedThisTurn === 'boolean')
      && (m.rush === undefined || typeof m.rush === 'boolean')
      && (m.enteredTurn === undefined || Number.isSafeInteger(m.enteredTurn) && m.enteredTurn >= 0)
      && (m.origin === undefined || ['played', 'summoned', 'transformed'].includes(m.origin))
      && [m.ready, m.taunt, m.cannotAttack, m.silenced, m.ephemeral].every(x => typeof x === 'boolean'));
}
export function loadGame(): Game | null {
  const g = read<Game | null>('game', null);
  try { if (g) registerCardPack(g.customCards ?? [], 'match'); } catch { return null; }
  if (g && !validCustomCounts(g.customCounts)) return null;
  if (g && g.rashDeaths === undefined) g.rashDeaths = 0;
  if (g && g.events === undefined) g.events = [];
  if (!g || g.trainingBotId !== undefined && (typeof g.trainingBotId !== 'string' || g.trainingBotId.length > 30) || typeof g.id !== 'string' || !validPlayer(g.player) || !validPlayer(g.bot) || !['player', 'bot'].includes(g.active)
    || g.winner !== null || ![g.turn, g.nextUid, g.rng, g.nextLog, g.rashDeaths].every(finite) || !Number.isSafeInteger(g.rashDeaths) || g.rashDeaths < 0
    || !Array.isArray(g.events) || !g.events.every(e => e && finite(e.id) && ['attack', 'summon', 'spell', 'power', 'damage', 'death', 'transform', 'draw', 'shield', 'immune','heal'].includes(e.kind) && ['player', 'bot'].includes(e.side)
      && (!e.cardId || Object.hasOwn(CARD, e.cardId)) && (!e.source || e.source === 'hero' || finite(e.source)) && (!e.target || ['player', 'bot'].includes(e.target.side) && (e.target.uid === 'hero' || finite(e.target.uid))))
    || !Array.isArray(g.log) || !g.log.every(validEntry)) return null;
  if (g.mulligan && (!finite(g.mulligan.deadline) || !g.mulligan.ready || !g.mulligan.selected || !['player', 'bot'].every(s => {
    const side = s as 'player' | 'bot', selected = g.mulligan!.selected[side];
    return g[side].hand.length === 3 && !g[side].board.length && g[side].mana === 0 && g[side].maxMana === 0
      && typeof g.mulligan!.ready[side] === 'boolean' && Array.isArray(selected) && selected.length <= 3
      && new Set(selected).size === selected.length && selected.every(n => g[side].hand.some(c => c.uid === n));
  }))) return null;
  if(g.adaptation&&(!validAdaptation(g,g.adaptation)||g.adaptation.continuation&&!validContinuation(g.adaptation.sourceId,g.adaptation.continuation)))return null;
  if(g.adaptation&&g.discovery)return null;
  if (!validCast(g, g.casting)) return null;
  if (g.discovery && (g.discovery.side !== g.active || !cardId(g.discovery.sourceId) || (!g.discovery.custom && !['discoverBlast', 'clawFury'].includes(CARD[g.discovery.sourceId].effect ?? ''))
    || !Array.isArray(g.discovery.options) || g.discovery.options.length < 1 || g.discovery.options.length > 3
    || new Set(g.discovery.options).size !== g.discovery.options.length || !g.discovery.options.every(id => cardId(id) && (CARD[g.discovery!.sourceId].effect === 'clawFury' ? clawFuryPool(g).some(c => c.id === id) : g[g.active].deck.includes(id)))
    || (g.discovery.custom ? !validContinuation(g.discovery.sourceId, g.discovery.custom) : g.discovery.target !== 'hero' && !finite(g.discovery.target)))) return null;
  if (g.briefing && (!g.briefing.remainingTurns || !['player', 'bot'].every(side => {
    const n = g.briefing!.remainingTurns[side as 'player' | 'bot'];
    return Number.isSafeInteger(n) && n >= 0 && n <= 5;
  }) || g.briefing.remainingTurns.player + g.briefing.remainingTurns.bot === 0 || g.player.board.length > 1 || g.bot.board.length > 1)) return null;
  for (const p of [g.player, g.bot]) {
    p.powerSilenceTurns ??= 0;
    for (const m of p.board) {
      m.charge ??= !!CARD[m.id].charge && !m.silenced;
      m.rush ??= !!CARD[m.id].rush && !m.silenced;
      m.enteredTurn ??= 0;
      m.attackedThisTurn ??= false;
    }
  }
  for (const entry of g.log) {
    entry.text = entry.text.replaceAll('Р' + 'АШ', 'РДШ');
    for (const entity of [entry.actor, entry.target, entry.hero, entry.result]) if (entity) entity.name = entity.name.replaceAll('Р' + 'АШ', 'РДШ');
  }
  refreshAuras(g);
  return g;
}
export interface Stats extends MatchMetrics {
  wins: number; games: number; lastResult: string | null;
  matches: Record<string, MatchMetrics & { finished: boolean; won?: boolean }>;
}
export function loadStats(): Stats {
  const raw = read<Partial<Stats> | null>('stats', null);
  const valid = raw && Number.isSafeInteger(raw.wins) && Number.isSafeInteger(raw.games) && raw.wins! >= 0 && raw.games! >= raw.wins!;
  const result: Stats = { ...emptyMetrics(), wins: valid ? raw.wins! : 0, games: valid ? raw.games! : 0,
    lastResult: typeof raw?.lastResult === 'string' ? raw.lastResult : null, matches: {} };
  if (valid) for (const key of METRIC_KEYS) if (Number.isSafeInteger(raw[key]) && raw[key]! >= 0) result[key] = raw[key]!;
  if (valid && raw.matches && typeof raw.matches === 'object') {
    result.matches = Object.fromEntries(Object.entries(raw.matches).filter(([, m]) => validMetrics(m) && typeof m.finished === 'boolean' && (m.won===undefined||typeof m.won==='boolean')));
  }
  return result;
}
export function recordMatchStats(game: Game): Stats {
  const stats = loadStats();
  const current = validMetrics(game.player.metrics) ? game.player.metrics : emptyMetrics();
  const previous = Object.hasOwn(stats.matches, game.id) ? stats.matches[game.id] : { ...emptyMetrics(), finished: stats.lastResult === game.id };
  const checkpoint = { ...previous };
  let changed = !!game.winner && previous.finished && !Object.hasOwn(stats.matches, game.id);
  for (const key of METRIC_KEYS) {
    const delta = Math.max(0, current[key] - previous[key]);
    if (delta) { stats[key] = Math.min(Number.MAX_SAFE_INTEGER, stats[key] + delta); changed = true; }
    checkpoint[key] = Math.max(previous[key], current[key]);
  }
  if (game.winner && !previous.finished) {
    stats.games = Math.min(Number.MAX_SAFE_INTEGER, stats.games + 1); if (game.winner === 'player') stats.wins = Math.min(Number.MAX_SAFE_INTEGER, stats.wins + 1);
    checkpoint.finished = true; checkpoint.won=game.winner==='player';stats.lastResult = game.id; changed = true;
  }
  if (changed) { stats.matches = { ...stats.matches, [game.id]: checkpoint }; write('stats', stats); }
  return stats;
}
