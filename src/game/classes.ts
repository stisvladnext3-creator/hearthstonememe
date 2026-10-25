export const HERO_CLASSES = {
  mage: { name: 'Маг', hero: 'mage', power: 'spark', art: 10, powerName: 'Искра', description: 'Наносит 1 урон любому персонажу.', cost: 2 },
  warrior: { name: 'Воин', hero: 'warrior', power: 'armor', art: 9, powerName: 'Поднять щит!', description: 'Даёт вашему герою 2 брони.', cost: 2 },
  warlock: { name: 'Чернокнижник', hero: 'warlock', power: 'lifeTap', art: 4, powerName: 'Жизнеотвод', description: 'Наносит вашему герою 2 урона. Вы берёте карту.', cost: 2 },
  storm: { name: 'Предвестник бури', hero: 'storm-herald', power: 'storm', art: 8, powerName: 'Зов бури', description: 'Призывает элементаля бури 2/1.', cost: 2 },
  cat: { name: 'Позывной «Кот»', hero: 'general-cat', power: 'clawFury', art: 9, powerName: 'Ярость когтей', description: 'Раскопайте карту за 3, 5 или 7 маны. Ваш герой получает урон, равный её стоимости.', cost: 3 },
} as const;
export type HeroClass = keyof typeof HERO_CLASSES;
export const validHeroClass = (value: unknown): value is HeroClass => typeof value === 'string' && Object.hasOwn(HERO_CLASSES, value);
export function matchesClass(card: { heroClass?: HeroClass }, filter: string) {
  return filter === 'all' || (filter === 'class' ? !!card.heroClass : filter === 'neutral' ? !card.heroClass : card.heroClass === filter);
}
export const belongsToClass = (card: { heroClass?: HeroClass }, heroClass: HeroClass) => !card.heroClass || card.heroClass === heroClass;
