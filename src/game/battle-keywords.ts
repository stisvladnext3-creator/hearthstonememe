import { CARD, type CardDef } from './cards';
import type { Anchor, Game, Minion, Side } from './engine';

export const COMBAT_KEYWORDS = {
  divineShield: 'Божественный щит', windfury: 'Неистовство ветра', poisonous: 'Яд',
  immuneWhileAttacking: 'Неуязвимость во время атаки', immuneOnOwnTurn: 'Неуязвимость в свой ход', immuneThisTurn: 'Неуязвимость до конца хода',
} as const;
export type CombatKeyword = keyof typeof COMBAT_KEYWORDS;
export interface KeywordState {
  divineShield?: boolean; windfury?: boolean; poisonous?: boolean;
  immuneWhileAttacking?: boolean; immuneOnOwnTurn?: boolean; immuneUntilTurn?: number; attacksThisTurn?: number;
}
export const attacksUsed = (m: Minion) => m.attacksThisTurn ?? (m.attackedThisTurn ? 1 : 0);
export function keywordState(card: CardDef, turn: number): KeywordState {
  return { divineShield: !!card.divineShield, windfury: !!card.windfury, poisonous: !!card.poisonous,
    immuneWhileAttacking: !!card.immuneWhileAttacking, immuneOnOwnTurn: !!card.immuneOnOwnTurn,
    immuneUntilTurn: card.immuneThisTurn ? turn : undefined };
}
export function isImmune(g: Game, side: Side, m?: Minion, attackingUid?: number): boolean {
  const value = m ?? g[side];
  return !!(value.immuneOnOwnTurn && g.active === side || value.immuneUntilTurn !== undefined && value.immuneUntilTurn >= g.turn
    || m?.immuneWhileAttacking && m.uid === attackingUid);
}
export function grantKeyword(g: Game, side: Side, uid: number | 'hero', keyword: CombatKeyword) {
  const m = g[side].board.find(m => m.uid === uid);
  if (keyword === 'immuneThisTurn') { (m ?? g[side]).immuneUntilTurn = g.turn; return; }
  if (keyword === 'immuneOnOwnTurn') { (m ?? g[side]).immuneOnOwnTurn = true; return; }
  if (!m) return;
  m[keyword] = true;
  if (keyword === 'windfury' && (m.ready || attacksUsed(m) > 0)) m.ready = attacksUsed(m) < 2;
}
export function expireImmunity(g: Game) {
  for (const side of ['player', 'bot'] as const) for (const value of [g[side], ...g[side].board]) {
    if (value.immuneUntilTurn !== undefined && value.immuneUntilTurn <= g.turn) delete value.immuneUntilTurn;
  }
}
export function applyDamage(g: Game, side: Side, target: Anchor, amount: number, source: { uid?: number; cardId?: string; poisonous?: boolean; attackingUid?: number } = {}) {
  const p = g[target.side], m = p.board.find(m => m.uid === target.uid);
  if (amount <= 0 || target.uid !== 'hero' && !m) return { amount: 0 };
  if (isImmune(g, target.side, m, source.attackingUid)) return { amount: 0, blocked: 'immune' as const };
  if (m?.divineShield) { m.divineShield = false; return { amount: 0, blocked: 'shield' as const }; }
  if (m) {
    m.health -= amount;
    const body = g[side].board.find(body => body.uid === source.uid);
    const poison = source.poisonous ?? (body ? body.poisonous : source.cardId && CARD[source.cardId]?.poisonous);
    if (poison) m.health = 0;
  } else {
    const absorbed = Math.min(amount, p.armor); p.armor -= absorbed; p.health -= amount - absorbed;
  }
  return { amount };
}
export function validKeywordState(raw: KeywordState): boolean {
  return ['divineShield','windfury','poisonous','immuneWhileAttacking','immuneOnOwnTurn'].every(key => raw[key as keyof KeywordState] === undefined || typeof raw[key as keyof KeywordState] === 'boolean')
    && (raw.immuneUntilTurn === undefined || Number.isSafeInteger(raw.immuneUntilTurn) && raw.immuneUntilTurn >= 1)
    && (raw.attacksThisTurn === undefined || Number.isSafeInteger(raw.attacksThisTurn) && raw.attacksThisTurn >= 0 && raw.attacksThisTurn <= 2);
}
