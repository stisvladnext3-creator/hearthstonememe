import { CARD } from './cards';
import { HEROES, POWER_CARDS } from './presentation';
import type { Minion, Player, Side } from './engine';

export interface HistoryEntity {
  type: 'card' | 'hero' | 'power'; id: string; name: string; art: number; side: Side;
  attack?: number; health?: number; armor?: number;
}
export type HistoryKind = 'play' | 'attack' | 'effect' | 'power' | 'transform' | 'death' | 'draw' | 'discard' | 'turn' | 'finish';
export interface HistoryEntry {
  id: number; text: string; side: Side | 'system'; turn?: number;
  kind?: HistoryKind; actor?: HistoryEntity; target?: HistoryEntity; result?: HistoryEntity;
  hero?: HistoryEntity; amount?: number; retaliation?: number;
}
export type HistoryDetails = Pick<HistoryEntry, 'kind' | 'actor' | 'target' | 'result' | 'hero' | 'amount' | 'retaliation'>;
export function cardEntity(id: string, side: Side, minion?: Minion): HistoryEntity {
  const card = CARD[id];
  return { type: card.kind === 'power' ? 'power' : 'card', id, name: card.name, art: card.art, side,
    attack: minion?.attack ?? card.attack, health: minion?.health ?? card.health };
}
export function heroEntity(player: Player, side: Side): HistoryEntity {
  const hero = HEROES[player.hero] ?? HEROES.mage;
  return { type: 'hero', id: player.hero, name: hero.name, art: hero.art, side, health: player.health, armor: player.armor };
}
export const powerEntity = (player: Player, side: Side) => cardEntity(POWER_CARDS[player.power], side);
