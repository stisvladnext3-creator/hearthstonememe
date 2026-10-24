export type CardKind = 'minion' | 'spell' | 'hero' | 'power' | 'token';
export type Effect = 'galinka' | 'concede' | 'casino' | 'trachukcha' | 'legendaryHand' | 'deathwing' | 'maratik' | 'bolt' | 'heal' | 'draw' | 'silence' | 'armor' | 'oy' | 'jaina' | 'rds' | 'devolve' | 'purgeZhanna' | 'volunteer' | 'dragonslayer' | 'discoverBlast';
export interface CardDef {
  id: string; name: string; cost: number; kind: CardKind;
  attack?: number; health?: number; armor?: number;
  text: string; flavor: string; rarity: 'common' | 'rare' | 'epic' | 'legendary'; printedCost?: number;
  art: number; custom?: boolean; taunt?: boolean; cannotAttack?: boolean;
  effect?: Effect; tribe?: string; auraAttack?: number; frame?: 'simple';
}

export const CARDS: CardDef[] = [
  { id: 'galinka', name: 'Галинка', cost: 10, kind: 'minion', attack: 0, health: 1, text: 'Провокация. Боевой клич: призывает Пушкина 15/15 с провокацией.', flavor: 'За каждой великой женщиной стоит Пушкин 15/15.', rarity: 'legendary', art: 0, custom: true, taunt: true, effect: 'galinka', tribe: 'Сверхчеловек' },
  { id: 'goodgame', name: 'Хорошая игра.', cost: 0, kind: 'minion', attack: 99, health: 99, text: 'Боевой клич: уничтожает вашего персонажа.', flavor: 'Боевой клич срабатывает только при розыгрыше из руки. Если существо появилось через призыв или превращение, герой не уничтожается.', rarity: 'common', art: 1, custom: true, effect: 'concede', tribe: 'Я сдаюсь.' },
  { id: 'ruslan', name: 'Русланчик', cost: 4, kind: 'minion', attack: 10, health: 10, text: 'Не может атаковать. Он всегда прав.', flavor: '«Тихий час» снимает запрет на атаку. После призыва всё ещё нужно дождаться своего следующего хода.', rarity: 'common', art: 2, custom: true, cannotAttack: true, tribe: 'Сверхчеловек' },
  { id: 'casino', name: 'Козиныч', cost: 3, kind: 'spell', text: 'С шансом 50% уничтожает половину колоды случайного игрока. Начало матча: вы берёте эту карту.', flavor: 'Крутить или не крутить? Как будто есть выбор.', rarity: 'legendary', art: 3, custom: true, effect: 'casino' },
  { id: 'trachukcha', name: 'Трачукча', cost: 0, printedCost: -1, kind: 'hero', armor: 99, text: 'Боевой клич: тупит до конца матча. Заменяет силу героя на «Дибильнутый!».', flavor: 'Цена на оригинале −1; разыгрывается бесплатно. «Дибильнутый!» теперь работает по присланной карте: за 3 маны превращает всех существ противника в случайных на 5 маны дешевле.', rarity: 'legendary', art: 4, custom: true, effect: 'trachukcha' },
  { id: 'me', name: 'Я', cost: 10, kind: 'minion', attack: 5, health: 7, text: 'Боевой клич: заполняет вашу руку легендарными существами.', flavor: 'Колода мечты. Все остальные просто завидуют.', rarity: 'legendary', art: 5, custom: true, effect: 'legendaryHand', tribe: 'Сверхчеловек' },
  { id: 'deathwing', name: 'Смертокрыл', cost: 5, kind: 'minion', attack: 1, health: 1, text: 'Боевой клич: уничтожает всех других существ. Вы сбрасываете все карты. В конце вашего хода это существо распыляется.', flavor: 'Пришёл. Увидел. Всё испортил. Ушёл.', rarity: 'legendary', art: 6, custom: true, effect: 'deathwing', tribe: 'Дракон' },
  { id: 'maratik', name: 'Маратик', cost: 10, kind: 'hero', armor: 5, text: 'Боевой клич: заменяет вашу силу героя на «Ой».', flavor: '«Ой» за 6 маны добавляет в руку Смертокрыла 1/1. Кажется, сейчас что-то произойдёт.', rarity: 'legendary', art: 7, custom: true, effect: 'maratik' },
  { id: 'oy', name: 'Ой', cost: 6, kind: 'power', text: 'Вы кладёте в руку Смертокрыла 1/1.', flavor: 'Сила героя Маратика. Одно маленькое слово. Очень большие последствия.', rarity: 'rare', art: 6, custom: true, effect: 'oy' },
  { id: 'spark-power', name: 'Искра', cost: 2, kind: 'power', text: 'Наносит 1 урон выбранному врагу. Один раз за ход.', flavor: 'Стартовая сила героя. Заклинание «Искра хаоса» — отдельная карта и наносит 3 урона.', rarity: 'common', art: 10 },
  { id: 'jaina', name: 'Джайна-ассасин', cost: 12, kind: 'hero', armor: 10, text: 'Стоит на 1 ману меньше за каждое РАШ, погибшее в матче. Боевой клич: ваша сила героя меняется на «Сила РДШ».', flavor: 'Погибшие РАШ обоих игроков снижают стоимость, но не ниже нуля. Новая сила за 4 маны призывает РАШ 2/5.', rarity: 'legendary', art: 10, custom: true, effect: 'jaina' },
  { id: 'rds-power', name: 'Сила РДШ', cost: 4, kind: 'power', text: 'Призывает РАШ 2/5.', flavor: 'Сила героя Джайны-ассасина. Новому РАШ нужен ход, чтобы подготовиться к атаке.', rarity: 'rare', art: 10, custom: true, effect: 'rds' },
  { id: 'fool-power', name: 'Дибильнутый!', cost: 3, kind: 'power', text: 'Превращает существ противника в случайных существ на 5 маны дешевле.', flavor: 'Стоимость результата не ниже нуля. Превращение не запускает боевые кличи и не считается гибелью.', rarity: 'epic', art: 4, custom: true, effect: 'devolve' },
  { id: 'maxim', name: 'Максимка-разведчик', cost: 6, kind: 'minion', attack: 3, health: 5, text: 'Боевой клич: уничтожает всех существ «Жанна» в колодах обоих игроков.', flavor: 'Трогает только колоды. Существа на столе и карты в руке остаются на месте.', rarity: 'epic', art: 5, custom: true, effect: 'purgeZhanna', tribe: 'Максим' },
  { id: 'volunteer', name: 'Волонтер-босс', cost: 5, kind: 'minion', attack: 8, health: 8, text: 'Уничтожает ВСЕХ существ на столе. Призывает два РАШ 2/4.', flavor: 'В прототипе срабатывает при розыгрыше: уничтожает и себя, затем оставляет двух РАШ 2/4.', rarity: 'common', art: 11, custom: true, effect: 'volunteer', tribe: 'Лох' },
  { id: 'rash', name: 'РАШ', cost: 3, kind: 'token', attack: 2, health: 5, text: 'Призван силой РДШ. Гибель снижает стоимость Джайны-ассасина.', flavor: 'Считает не только своих.', rarity: 'common', art: 10, tribe: 'РАШ' },
  { id: 'rash-volunteer', name: 'РАШ', cost: 2, kind: 'token', attack: 2, health: 4, text: 'Призван Волонтером-боссом. Гибель снижает стоимость Джайны-ассасина.', flavor: 'Работают парами.', rarity: 'common', art: 11, tribe: 'РАШ' },
  { id: 'zhanna', name: 'Жанна', cost: 4, kind: 'minion', attack: 3, health: 5, text: 'Базовое тестовое существо типа «Жанна».', flavor: 'Добавлена как тестовая цель для Максимки-разведчика. Оригинальная карта Жанны пока не прислана.', rarity: 'common', art: 10, tribe: 'Жанна' },
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
  { id: 'silence', name: 'Тихий час', cost: 1, kind: 'spell', text: 'Накладывает немоту на своё или вражеское существо.', flavor: 'Иногда всем нужно просто помолчать.', rarity: 'rare', art: 4, effect: 'silence' },
  { id: 'dragonslayer', name: 'Драконоборец', cost: 2, kind: 'minion', attack: 1, health: 2, text: 'Боевой клич: наносит 4 урона герою противника.', flavor: 'Для четырёх единиц урона дракон поблизости не обязателен.', rarity: 'epic', art: 9, custom: true, effect: 'dragonslayer', tribe: 'Чел', frame: 'simple' },
  { id: 'dog-spell', name: 'Такая вот хуйня, собачка', cost: 2, kind: 'spell', text: 'Раскопайте копию карты из своей колоды. Наносит 4 урона выбранному врагу.', flavor: 'Выберите одну из трёх разных карт своей колоды. Копия попадёт в руку, оригинал останется в колоде. Затем выбранный враг получит 4 урона. При пустой колоде остаётся урон.', rarity: 'epic', art: 11, custom: true, effect: 'discoverBlast', tribe: 'Чел' },
  { id: 'vasiliy', name: 'Василий — хранитель мультивселенных', cost: 3, kind: 'minion', attack: 4, health: 5, text: 'Провокация. Все ваши существа получают +2 к атаке.', flavor: 'Аура действует на всех союзных существ, включая Василия, пока он на столе без немоты. Бонусы нескольких Василиев складываются. После его гибели, превращения или немоты бонус исчезает.', rarity: 'legendary', art: 9, custom: true, taunt: true, auraAttack: 2, tribe: 'Мяу' },
];
export const CARD = Object.fromEntries(CARDS.map(c => [c.id, c])) as Record<string, CardDef>;
export const COLLECTIBLE = CARDS.filter(c => c.kind !== 'power' && c.kind !== 'token');
export const STARTER_DECK = [
  'casino', 'galinka', 'goodgame', 'ruslan', 'ruslan', 'trachukcha', 'me', 'deathwing', 'maratik',
  'regular', 'regular', 'bouncer', 'bouncer', 'goblin', 'dragonslayer', 'mage', 'mage', 'guardian', 'vasiliy',
  'dragon', 'jaina', 'bolt', 'bolt', 'heal', 'dog-spell', 'draw', 'maxim', 'silence', 'volunteer', 'zhanna',
];
export const BOT_DECK = [
  'regular', 'regular', 'regular', 'volunteer', 'bouncer', 'bouncer', 'bouncer', 'goblin', 'goblin', 'dragonslayer',
  'mage', 'mage', 'mage', 'guardian', 'guardian', 'vasiliy', 'dragon', 'dragon', 'bolt', 'bolt',
  'heal', 'dog-spell', 'draw', 'draw', 'silence', 'silence', 'ruslan', 'casino', 'galinka', 'deathwing',
];
export function deckError(ids: string[]): string | undefined {
  if (ids.length !== 30) return 'В колоде должно быть ровно 30 карт.';
  if (ids.some(id => !COLLECTIBLE.some(c => c.id === id))) return 'В колоде есть недоступная карта.';
  // Three common copies allow a small prototype pool to support a 30-card deck.
  if (ids.some(id => ids.filter(x => x === id).length > (CARD[id].rarity === 'legendary' ? 1 : 3)))
    return 'Максимум 1 копия легендарной и 3 копии обычной или редкой карты.';
}
