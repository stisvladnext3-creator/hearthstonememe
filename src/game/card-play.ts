import { CARD } from './cards';
import { act, activePower, type Action, type CardCast, type Game, type Result, type Side } from './engine';
import { powerCardId } from './presentation';

export const CARD_PLAY_MS = 1500;

// Rules remain synchronous for search and simulation. Only real player/bot
// commands enter this persisted phase, before any costs or effects are applied.
export function stageAction(input: Game, side: Side, action: Action, now = Date.now()): Result {
  const checked = act(input, side, action);
  if (checked.error || action.type !== 'play' && action.type !== 'power') return checked;
  const cardId = action.type === 'play' ? input[side].hand.find(c => c.uid === action.uid)!.id : powerCardId(activePower(input, side));
  return { state: { ...input, casting: { side, cardId, action: { ...action }, startedAt: now, endsAt: now + CARD_PLAY_MS } } };
}

export function resolveCast(input: Game, now = Date.now()): Game {
  if (!input.casting || now < input.casting.endsAt) return input;
  const { side, action } = input.casting, ready = { ...input };
  delete ready.casting;
  return act(ready, side, action).state;
}

export function validCast(g: Game, value: unknown, hidden = false): value is CardCast {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object') return false;
  const c = value as CardCast, a = c.action;
  if (!['player', 'bot'].includes(c.side) || c.side !== g.active || g.winner || g.mulligan || g.discovery || g.adaptation
    || !Object.hasOwn(CARD, c.cardId) || !Number.isSafeInteger(c.startedAt) || c.startedAt <= 0
    || !Number.isSafeInteger(c.endsAt) || c.endsAt - c.startedAt !== CARD_PLAY_MS || !a || !['play', 'power'].includes(a.type)) return false;
  if (a.target !== undefined && a.target !== 'hero' && a.target !== 'own-hero'
    && (!Number.isSafeInteger(a.target) || a.target <= 0 || ![...g.player.board, ...g.bot.board].some(m => m.uid === a.target))) return false;
  if (a.type === 'power') return c.cardId === powerCardId(activePower(g, c.side));
  return Number.isSafeInteger(a.uid) && a.uid > 0 && g[c.side].hand.some(h => h.uid === a.uid && (h.id === c.cardId || hidden && h.id === 'hidden'));
}
