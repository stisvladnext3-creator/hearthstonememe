import { cardAbilities, type CardDef } from './cards';
import type { Minion } from './engine';
import {MINION_ENTRANCES,SPELL_CASTS,type Entrance} from './play-media';
export {MINION_ENTRANCES,SPELL_CASTS,type Entrance} from './play-media';

const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
export const isCreature = (c: CardDef) => c.kind === 'minion' || c.kind === 'token';
export function entranceFor(c: CardDef): Entrance {
  if(c.editor?.animation)return c.editor.animation;
  const pool = isCreature(c) ? MINION_ENTRANCES : SPELL_CASTS;
  return pool[hash(c.id) % pool.length];
}
export const usesCardEntrance=(c:CardDef)=>c.kind!=='power'||!!c.editor?.animation;
export const hasDeathrattle = (c: CardDef, m: Minion) => !!((c.deathrattle || cardAbilities(c)?.rules.some(r => r.trigger === 'death')) && !m.silenced || m.adaptSpores);
export const hasAura = (c: CardDef, m?: Pick<Minion,'silenced'>) => !m?.silenced && !!(c.auraAttack || cardAbilities(c)?.rules.some(r => r.trigger === 'aura'));
