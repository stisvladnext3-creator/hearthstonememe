import { cardAbilities, type CardDef } from './cards';
import type { Minion } from './engine';

export const MINION_ENTRANCES = ['stone', 'portal', 'ember', 'nature', 'storm', 'shadow', 'celestial'] as const;
export const SPELL_CASTS = ['arcane', 'flame', 'frost', 'venom', 'void'] as const;
export type Entrance = typeof MINION_ENTRANCES[number] | typeof SPELL_CASTS[number];
const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
export const isCreature = (c: CardDef) => c.kind === 'minion' || c.kind === 'token';
export function entranceFor(c: CardDef): Entrance {
  const pool = isCreature(c) ? MINION_ENTRANCES : SPELL_CASTS;
  return pool[hash(c.id) % pool.length];
}
export const hasDeathrattle = (c: CardDef, m: Minion) => !!((c.deathrattle || cardAbilities(c)?.rules.some(r => r.trigger === 'death')) && !m.silenced || m.adaptSpores);
export const hasAura = (c: CardDef, m?: Pick<Minion,'silenced'>) => !m?.silenced && !!(c.auraAttack || cardAbilities(c)?.rules.some(r => r.trigger === 'aura'));
