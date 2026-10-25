import { CARD, type CardDef } from './cards';

export const HEROES: Record<string, { name: string; art: number; title: string }> = {
  mage: { name: 'Лира', art: 10, title: 'Хранительница мемов' },
  warrior: { name: 'Воин', art: 9, title: 'Мастер защиты' },
  warlock: { name: 'Чернокнижник', art: 4, title: 'Повелитель душ' },
  'storm-herald': { name: 'Предвестник бури', art: 8, title: 'Повелитель вихрей' },
  boris: { name: 'Борис', art: 9, title: 'Трактирщик' },
  trachukcha: { name: 'Трачукча', art: 4, title: 'Думает о вечном' },
  maratik: { name: 'Маратик', art: 7, title: 'Повелитель «Ой»' },
  jaina: { name: 'Джайна-ассасин', art: 10, title: 'Сила РДШ' },
};
export const POWER_CARDS = { spark: 'spark-power', armor: 'armor-power', lifeTap: 'life-tap', storm: 'storm-power', fool: 'fool-power', oy: 'oy', rds: 'rds-power', briefing: 'briefing-power' } as const;
export const powerCardId = (power: string): string => Object.hasOwn(POWER_CARDS, power) ? POWER_CARDS[power as keyof typeof POWER_CARDS] : power;
export const powerKey = (id: string): string => Object.entries(POWER_CARDS).find(([, value]) => value === id)?.[0] ?? id;
export const knownPower = (power: unknown): power is string => typeof power === 'string' && CARD[powerCardId(power)]?.kind === 'power';
export const heroDefinition = (id: string) => CARD[id]?.kind === 'hero' ? { name: CARD[id].name, art: CARD[id].art, title: CARD[id].flavor || 'Твой герой' } : HEROES[id] ?? HEROES.mage;
export function heroCard(id: string): CardDef {
  if (CARD[id]?.kind === 'hero') return CARD[id];
  const hero = HEROES[id] ?? HEROES.mage;
  return { id, name: hero.name, kind: 'hero', cost: 0, art: hero.art, rarity: 'rare',
    text: 'Герой начинает бой с 30 здоровья. Броня поглощает урон первой. При потере всего здоровья герой проигрывает.', flavor: hero.title };
}
