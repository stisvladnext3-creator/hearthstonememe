export const HERO_CLASSES = {
  mage: { name: 'Маг', hero: 'mage', power: 'spark', art: 10, powerName: 'Искра', description: 'Наносит 1 урон выбранному врагу.', cost: 2 },
  warrior: { name: 'Воин', hero: 'warrior', power: 'armor', art: 9, powerName: 'Поднять щит!', description: 'Даёт вашему герою 2 брони.', cost: 2 },
} as const;
export type HeroClass = keyof typeof HERO_CLASSES;
export const validHeroClass = (value: unknown): value is HeroClass => typeof value === 'string' && Object.hasOwn(HERO_CLASSES, value);
