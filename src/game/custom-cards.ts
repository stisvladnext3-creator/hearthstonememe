import { CARD, CARDS, type CardDef } from './cards';
import { CUSTOM_LIMIT, PACK_LIMIT, matchesCard, normalizeCustomCard, references, KEYWORDS, OPERATIONS, TARGETS, TRIGGERS, type CustomRule } from './custom-schema';

const KEY = 'memestone.v1.custom-cards';
const BASE_IDS = new Set(CARDS.map(c => c.id));
let library: CardDef[] = [];
export const userCards = () => [...library];
export const isCustomHero = (id: string) => CARD[id]?.kind === 'hero';
export function validateCardPack(raw: unknown): CardDef[] {
  if (!Array.isArray(raw) || raw.length > CUSTOM_LIMIT || new TextEncoder().encode(JSON.stringify(raw)).length > PACK_LIMIT) throw new Error('В наборе допустимо до 60 карт и 2000 КБ. Уменьши число карт или размер картинок.');
  const cards = raw.map(normalizeCustomCard);
  if (cards.some(c => !c)) throw new Error('Некорректная карта или правило. Проверь параметры редактора.');
  const result = cards as CardDef[], map = new Map(result.map(c => [c.id, c]));
  if (map.size !== result.length) throw new Error('В наборе повторяется идентификатор карты.');
  const find = (id: string) => map.get(id) ?? (BASE_IDS.has(id) ? CARD[id] : undefined);
  for (const c of result) {
    if (BASE_IDS.has(c.id)) throw new Error('Нельзя заменить встроенную карту.');
    if (c.effect && ![...BASE_IDS].some(id => CARD[id].kind === c.kind && CARD[id].effect === c.effect)) throw new Error('Для этого типа карты выбери действие во вкладке «Правила».');
    if (references(c).some(id => !find(id))) throw new Error('Карта «' + c.name + '» ссылается на отсутствующую карту. Добавь её в набор.');
    const e = c.editor!;
    if (e.artSourceId && !BASE_IDS.has(e.artSourceId)) throw new Error('Для картинки-основы выбери встроенную карту.');
    if (e.powerId && find(e.powerId)?.kind !== 'power') throw new Error('Для героя нужно выбрать карту силы героя.');
    if (e.quest && !['minion', 'spell', 'hero'].includes(find(e.quest.rewardId)!.kind)) throw new Error('Награда задачи должна разыгрываться из руки.');
    for (const r of e.rules) {
      if (['summon', 'transform', 'addCard', 'shuffle', 'replacePower'].includes(r.operation) && !r.cardId) throw new Error('В правиле «' + OPERATIONS[r.operation] + '» выбери карту.');
      const ref = r.cardId ? find(r.cardId) : undefined;
      if (['summon', 'transform'].includes(r.operation) && !['minion', 'token'].includes(ref?.kind ?? '')) throw new Error('Призвать или превратить можно только в существо / призыв.');
      if (r.operation === 'replacePower' && ref?.kind !== 'power') throw new Error('Выбери силу героя для замены.');
      if (['addCard', 'shuffle'].includes(r.operation) && !['minion', 'spell', 'hero'].includes(ref?.kind ?? '')) throw new Error('В руку и колоду добавляются существа, заклинания и герои.');
      if (r.operation === 'discover' && e.rules.filter(rule => rule.operation === 'discover').length > 1) throw new Error('Оставь одну раскопку на карте.');
    }
    if (c.kind === 'power' && c.effect) throw new Error('Для силы героя используй правила редактора.');
    const selected = e.rules.filter(r => r.trigger === 'play' && r.target.startsWith('selected'));
    if (selected.length > 1 && selected.some(r => r.target !== selected[0].target)) throw new Error('Все правила выбора цели должны использовать один тип цели.');
    const existing = CARD[c.id];
    if (existing && JSON.stringify(existing) !== JSON.stringify(c)) throw new Error('Этот идентификатор уже занят другой версией карты. Сохрани изменение как новую версию.');
  }
  return result;
}
export function registerCardPack(raw: unknown): CardDef[] {
  const cards = validateCardPack(raw);
  for (const card of cards) CARD[card.id] = card;
  return cards;
}
export function packForCards(ids: string[]): CardDef[] {
  const found = new Map<string, CardDef>();
  const visit = (id: string) => {
    const card = CARD[id]; if (!card?.editor || found.has(id)) return;
    found.set(id, card); for (const reference of references(card)) visit(reference);
  };
  ids.forEach(visit);
  return validateCardPack([...found.values()]);
}
function displayLibrary(cards: CardDef[]) {
  library = cards;
  CARDS.splice(0, CARDS.length, ...CARDS.filter(c => !c.editor), ...cards);
}
export function restoreCustomCards() {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    const cards = registerCardPack(raw); displayLibrary(cards);
  } catch { /* Preserve a damaged import in storage; never execute its contents. */ }
}
export function saveCustomLibrary(cards: CardDef[]) {
  const normalized = validateCardPack(cards);
  try { localStorage.setItem(KEY, JSON.stringify(normalized)); }
  catch { throw new Error('Не удалось сохранить карты: в браузере нет места. Уменьши картинки или экспортируй набор.'); }
  registerCardPack(normalized); displayLibrary(normalized);
}
export function newCustomCard(): CardDef {
  return { id: 'custom-' + crypto.randomUUID(), name: 'Моя карта', cost: 2, kind: 'minion', attack: 2, health: 3, text: '', flavor: '', rarity: 'common', art: 9, custom: true,
    editor: { version: 1, tags: [], rules: [] } };
}
const eventText = { summon: 'призыв существа', death: 'гибель существа', play: 'розыгрыш карты' };
const zoneText = { board: 'на столе', hand: 'в руке', deck: 'в колоде', summon: 'призвано за матч', death: 'погибло за матч', play: 'разыграно за матч' };
const targetText = (r: CustomRule) => TARGETS[r.target].toLocaleLowerCase() + (r.targetTag ? ' с меткой «' + r.targetTag + '»' : '') + (r.filter.excludeSelf ? ', кроме этой карты' : '');
export function ruleDescription(r: CustomRule, find: (id: string) => CardDef | undefined = id => CARD[id]): string {
  const card = r.cardId ? find(r.cardId)?.name ?? 'выбранную карту' : '';
  const n = Math.max(0, r.amount);
  const action = r.operation === 'damage' ? 'Наносит ' + n + ' урона: ' + targetText(r)
    : r.operation === 'heal' ? 'Восстанавливает ' + n + ' здоровья: ' + targetText(r)
    : r.operation === 'buff' ? 'Даёт ' + (r.amount >= 0 ? '+' : '') + r.amount + '/' + (r.health >= 0 ? '+' : '') + r.health + ': ' + targetText(r)
    : r.operation === 'summon' ? 'Призывает «' + card + '» ×' + r.count + ': ' + targetText(r)
    : r.operation === 'draw' ? 'Берёт карт: ' + r.count + ' (' + targetText(r) + ')'
    : r.operation === 'addCard' || r.operation === 'shuffle' || r.operation === 'transform' || r.operation === 'replacePower' ? OPERATIONS[r.operation] + ' «' + card + '» ×' + r.count + ': ' + targetText(r)
    : r.operation === 'armor' ? 'Даёт ' + n + ' брони: ' + targetText(r)
    : r.operation === 'devolve' ? 'Превращает в существ на ' + n + ' маны дешевле: ' + targetText(r)
    : r.operation === 'mana' ? 'Восстанавливает ' + n + ' маны: ' + targetText(r)
    : r.operation === 'briefing' ? 'Держать в курсе: 5 ходов каждого игрока'
    : r.operation === 'discover' ? 'Раскопка: копия карты своей колоды в руку'
    : OPERATIONS[r.operation] + ': ' + targetText(r);
  const event = ['summon', 'died', 'played', 'turnStart', 'turnEnd'].includes(r.trigger) ? ' (' + (r.filter.side === 'friendly' ? 'ваши' : r.filter.side === 'enemy' ? 'врага' : 'любые') + (r.filter.tag ? ', ' + r.filter.tag : '') + (r.filter.cardId ? ', «' + (find(r.filter.cardId)?.name ?? r.filter.cardId) + '»' : '') + ')' : '';
  return (r.trigger === 'play' ? '' : TRIGGERS[r.trigger] + event + ': ') + (r.chance < 100 ? 'С шансом ' + r.chance + '%: ' : '') + (r.condition ? 'Если ' + r.condition.minimum + '+ подходящих карт ' + zoneText[r.condition.zone] + (r.condition.filter.tag ? ' с меткой «' + r.condition.filter.tag + '»' : '') + ': ' : '') + action + (r.targetCardId ? ' («' + (find(r.targetCardId)?.name ?? 'выбранная карта') + '»)' : '') + '.';
}
export function describeCustomCard(card: CardDef, legacyText = card.editor?.legacyText ?? '', find: (id: string) => CardDef | undefined = id => CARD[id]): string {
  const e = card.editor!;
  for (;;) {
    const next = legacyText.replace(/^(?:Провокация|Рывок|Натиск|Эхо|Не может атаковать)\.\s*/i, '');
    if (next === legacyText) break; legacyText = next;
  }
  legacyText = legacyText.replace(/Начало матча:[^.]*\.?\s*/gi, '').trim();
  if (card.kind === 'hero') legacyText = card.effect === 'jaina' ? 'Стоит на 1 ману меньше за каждое РДШ, погибшее в матче.' : '';
  const text = [card.kind === 'hero' && 'Даёт ' + (card.armor ?? 0) + ' брони.', legacyText, ...Object.entries(KEYWORDS).filter(([k]) => card[k as keyof CardDef]).map(([, label]) => label + '.'),
    ...e.rules.map(r => (r.trigger === 'play' && (card.kind === 'minion' || card.kind === 'hero') ? 'Боевой клич: ' : '') + ruleDescription(r, find)),
    e.powerId && 'Сила героя: «' + (find(e.powerId)?.name ?? 'своя сила') + '».',
    e.discount && 'Скидка ' + e.discount.amount + ' маны за ' + eventText[e.discount.event] + (e.discount.filter.tag ? ' с меткой «' + e.discount.filter.tag + '»' : '') + (e.discount.filter.side === 'any' ? ' у обоих игроков' : e.discount.filter.side === 'enemy' ? ' у противника' : ' у вас') + '.',
    e.quest && 'Задача: ' + e.quest.goal + ' × ' + eventText[e.quest.event] + (e.quest.filter.tag ? ' (' + e.quest.filter.tag + ')' : '') + '. Награда: «' + (find(e.quest.rewardId)?.name ?? 'карта') + '».',
    e.startInHand && 'Начало матча: приходит в стартовую руку.'].filter(Boolean).join(' ');
  return text || (card.kind === 'hero' ? 'Даёт ' + (card.armor ?? 0) + ' брони.' : 'Без дополнительных способностей.');
}
export function cardsMatching(filter: { tag?: string; cardId?: string }) { return CARDS.filter(c => matchesCard(c, filter)); }
export function validContinuation(sourceId: string, raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as { rules?: unknown; sourceUid?: unknown; afterLegacy?: unknown };
  if (!Array.isArray(c.rules) || c.sourceUid !== undefined && (!Number.isSafeInteger(c.sourceUid) || Number(c.sourceUid) < 1)
    || c.afterLegacy !== undefined && typeof c.afterLegacy !== 'boolean') return false;
  const rules = CARD[sourceId]?.editor?.rules.filter(r => r.trigger === 'play');
  return !!rules && rules.some((_, i) => JSON.stringify(rules.slice(i)) === JSON.stringify(c.rules)) || !!rules && c.rules.length === 0;
}
export function validCustomCounts(raw: unknown): boolean {
  if (raw === undefined) return true;
  if (!raw || typeof raw !== 'object') return false;
  return ['player', 'bot'].every(side => ['summon', 'death', 'play'].every(event => {
    const counts = (raw as Record<string, Record<string, unknown>>)[side]?.[event];
    return counts && typeof counts === 'object' && !Array.isArray(counts) && Object.keys(counts).length <= 200
      && Object.entries(counts).every(([id, n]) => Object.hasOwn(CARD, id) && Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000);
  }));
}
