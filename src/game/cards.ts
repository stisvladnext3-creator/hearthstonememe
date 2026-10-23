export type CardKind = 'minion' | 'spell' | 'hero' | 'power' | 'token';
export type Effect = 'galinka' | 'concede' | 'casino' | 'trachukcha' | 'legendaryHand' | 'deathwing' | 'maratik' | 'bolt' | 'heal' | 'draw' | 'silence' | 'armor' | 'oy';
export interface CardDef {
  id: string; name: string; cost: number; kind: CardKind;
  attack?: number; health?: number; armor?: number;
  text: string; flavor: string; rarity: 'common' | 'rare' | 'legendary';
  art: number; custom?: boolean; taunt?: boolean; cannotAttack?: boolean;
  immuneSilence?: boolean; effect?: Effect; tribe?: string;
}

export const CARDS: CardDef[] = [
  { id: 'galinka', name: 'Галинка', cost: 10, kind: 'minion', attack: 0, health: 1, text: 'Провокация. Боевой клич: призывает Пушкина 15/15 с провокацией.', flavor: 'За каждой великой женщиной стоит Пушкин 15/15.', rarity: 'legendary', art: 0, custom: true, taunt: true, effect: 'galinka', tribe: 'Сверхчеловек' },
  { id: 'goodgame', name: 'Хорошая игра.', cost: 0, kind: 'minion', attack: 99, health: 99, text: 'Боевой клич: уничтожает вашего персонажа.', flavor: 'Самая быстрая дорога к следующей игре.', rarity: 'common', art: 1, custom: true, effect: 'concede', tribe: 'Я сдаюсь.' },
  { id: 'ruslan', name: 'Русланчик', cost: 4, kind: 'minion', attack: 10, health: 10, text: 'Не может атаковать. Нельзя наложить немоту. Он всегда прав.', flavor: 'Спорить бесполезно. Атаковать, кстати, тоже.', rarity: 'common', art: 2, custom: true, cannotAttack: true, immuneSilence: true, tribe: 'Сверхчеловек' },
  { id: 'casino', name: 'Козиныч', cost: 3, kind: 'spell', text: 'С шансом 50% уничтожает половину колоды случайного игрока. Начало матча: вы берёте эту карту.', flavor: 'Крутить или не крутить? Как будто есть выбор.', rarity: 'legendary', art: 3, custom: true, effect: 'casino' },
  { id: 'trachukcha', name: 'Трачукча', cost: 0, kind: 'hero', armor: 99, text: 'Боевой клич: тупит до конца матча. Заменяет силу героя на «Дибильнутый!».', flavor: 'На оригинале стоит −1 маны. В прототипе — бесплатно. Новая сила за 2 маны: возьмите карту и получите 2 урона.', rarity: 'legendary', art: 4, custom: true, effect: 'trachukcha' },
  { id: 'me', name: 'Я', cost: 10, kind: 'minion', attack: 5, health: 7, text: 'Боевой клич: заполняет вашу руку легендарными существами.', flavor: 'Колода мечты. Все остальные просто завидуют.', rarity: 'legendary', art: 5, custom: true, effect: 'legendaryHand', tribe: 'Сверхчеловек' },
  { id: 'deathwing', name: 'Смертокрыл', cost: 5, kind: 'minion', attack: 1, health: 1, text: 'Боевой клич: уничтожает всех других существ. Вы сбрасываете все карты. В конце вашего хода это существо распыляется.', flavor: 'Пришёл. Увидел. Всё испортил. Ушёл.', rarity: 'legendary', art: 6, custom: true, effect: 'deathwing', tribe: 'Дракон' },
  { id: 'maratik', name: 'Маратик', cost: 10, kind: 'hero', armor: 5, text: 'Боевой клич: заменяет вашу силу героя на «Ой».', flavor: '«Ой» за 6 маны добавляет в руку Смертокрыла 1/1. Кажется, сейчас что-то произойдёт.', rarity: 'legendary', art: 7, custom: true, effect: 'maratik' },
  { id: 'oy', name: 'Ой', cost: 6, kind: 'power', text: 'Вы кладёте в руку Смертокрыла 1/1.', flavor: 'Сила героя Маратика. Одно маленькое слово. Очень большие последствия.', rarity: 'rare', art: 6, custom: true, effect: 'oy' },
  { id: 'pushkin', name: 'Пушкин', cost: 10, kind: 'token', attack: 15, health: 15, text: 'Провокация. Призывается Галинкой.', flavor: 'Я помню чудное мгновенье. У противника — пятнадцать ран.', rarity: 'legendary', art: 8, taunt: true, tribe: 'Поэт' },
  { id: 'regular', name: 'Завсегдатай', cost: 1, kind: 'minion', attack: 1, health: 2, text: 'Всегда готов к хорошей партии.', flavor: 'Сидит тут с закрытой беты.', rarity: 'common', art: 9, tribe: 'Житель' },
  { id: 'bouncer', name: 'Вышибала', cost: 2, kind: 'minion', attack: 2, health: 3, text: 'Провокация.', flavor: 'Сначала разберитесь с ним.', rarity: 'common', art: 9, taunt: true, tribe: 'Дворф' },
  { id: 'goblin', name: 'Гоблин-мемолог', cost: 2, kind: 'minion', attack: 3, health: 2, text: 'Его шутки бьют больнее, чем кажется.', flavor: 'У него на всё есть картинка.', rarity: 'common', art: 11, tribe: 'Гоблин' },
  { id: 'mage', name: 'Хранительница искр', cost: 3, kind: 'minion', attack: 3, health: 4, text: 'Хранит свет. И немного пассивной агрессии.', flavor: 'Заклинания — её язык любви.', rarity: 'rare', art: 10, tribe: 'Эльф' },
  { id: 'guardian', name: 'Страж трактира', cost: 5, kind: 'minion', attack: 4, health: 6, text: 'Провокация.', flavor: 'Пока он здесь, ваш герой в безопасности.', rarity: 'rare', art: 9, taunt: true, tribe: 'Дворф' },
  { id: 'dragon', name: 'Пепельный дракон', cost: 7, kind: 'minion', attack: 7, health: 7, text: 'Большой. Горячий. Никаких сложностей.', flavor: 'Отличается от Смертокрыла воспитанием.', rarity: 'rare', art: 6, tribe: 'Дракон' },
  { id: 'bolt', name: 'Искра хаоса', cost: 2, kind: 'spell', text: 'Наносит 3 урона выбранному врагу.', flavor: 'Немного магии в ваш и без того трудный день.', rarity: 'common', art: 10, effect: 'bolt' },
  { id: 'heal', name: 'Чай с мёдом', cost: 2, kind: 'spell', text: 'Восстанавливает 5 здоровья вашему герою.', flavor: 'От всех бед. Кроме летального урона.', rarity: 'common', art: 9, effect: 'heal' },
  { id: 'draw', name: 'Гениальный план', cost: 3, kind: 'spell', text: 'Возьмите 2 карты.', flavor: 'План простой: взять карты. Дальше разберёмся.', rarity: 'common', art: 5, effect: 'draw' },
  { id: 'silence', name: 'Тихий час', cost: 1, kind: 'spell', text: 'Накладывает немоту на выбранное существо врага. Русланчик невосприимчив.', flavor: 'Иногда всем нужно просто помолчать.', rarity: 'rare', art: 4, effect: 'silence' },
];
export const CARD = Object.fromEntries(CARDS.map(c => [c.id, c])) as Record<string, CardDef>;
export const COLLECTIBLE = CARDS.filter(c => c.kind !== 'power' && c.kind !== 'token');
export const STARTER_DECK = [
  'casino', 'galinka', 'goodgame', 'ruslan', 'ruslan', 'trachukcha', 'me', 'deathwing', 'maratik',
  'regular', 'regular', 'bouncer', 'bouncer', 'goblin', 'goblin', 'mage', 'mage', 'guardian', 'guardian',
  'dragon', 'dragon', 'bolt', 'bolt', 'heal', 'heal', 'draw', 'draw', 'silence', 'silence', 'regular',
];
export const BOT_DECK = [
  'regular', 'regular', 'regular', 'regular', 'bouncer', 'bouncer', 'bouncer', 'goblin', 'goblin', 'goblin',
  'mage', 'mage', 'mage', 'guardian', 'guardian', 'guardian', 'dragon', 'dragon', 'bolt', 'bolt',
  'heal', 'heal', 'draw', 'draw', 'silence', 'silence', 'ruslan', 'casino', 'galinka', 'deathwing',
];
export function deckError(ids: string[]): string | undefined {
  if (ids.length !== 30) return 'В колоде должно быть ровно 30 карт.';
  if (ids.some(id => !COLLECTIBLE.some(c => c.id === id))) return 'В колоде есть недоступная карта.';
  // Three common copies allow a small prototype pool to support a 30-card deck.
  if (ids.some(id => ids.filter(x => x === id).length > (CARD[id].rarity === 'legendary' ? 1 : 3)))
    return 'Максимум 1 копия легендарной и 3 копии обычной или редкой карты.';
}
