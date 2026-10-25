import type { CardDef, Effect } from './cards';

export const TRIGGERS = { play: 'Розыгрыш / боевой клич', death: 'Предсмертный хрип', summon: 'Когда призвано существо', died: 'Когда погибло существо', played: 'Когда разыграна карта', turnStart: 'В начале хода', turnEnd: 'В конце хода', aura: 'Аура' } as const;
export const OPERATIONS = { damage: 'Нанести урон', heal: 'Восстановить здоровье', buff: 'Изменить атаку / здоровье', silence: 'Наложить немоту', destroy: 'Уничтожить', summon: 'Призвать карту', draw: 'Взять карты', addCard: 'Добавить карту в руку', shuffle: 'Замешать карту в колоду', discard: 'Сбросить карты', purgeDeck: 'Удалить карты из колоды', armor: 'Дать броню', mana: 'Восстановить ману', transform: 'Превратить в карту', devolve: 'Превратить в более дешёвое', discover: 'Раскопать копию из колоды', replacePower: 'Заменить силу героя', briefing: 'Держать в курсе' } as const;
export const TARGETS = { selectedEnemy: 'Выбранный враг', selectedFriendly: 'Выбранный союзник', selectedMinion: 'Выбранное существо', selectedCharacter: 'Выбранный персонаж', self: 'Это существо', ownHero: 'Ваш герой', enemyHero: 'Герой противника', friendlyMinions: 'Все ваши существа', enemyMinions: 'Все вражеские существа', allMinions: 'Все существа', friendlyCharacters: 'Все ваши персонажи', enemyCharacters: 'Все враги', allCharacters: 'Все персонажи', randomEnemy: 'Случайный враг', randomFriendly: 'Случайный союзник', randomEnemyMinion: 'Случайное вражеское существо', randomFriendlyMinion: 'Случайное своё существо', event: 'Существо / игрок события' } as const;
export const SIDES = { friendly: 'Ваши', enemy: 'Противника', any: 'Обоих игроков' } as const;
export const KEYWORDS = { taunt: 'Провокация', charge: 'Рывок', rush: 'Натиск', echo: 'Эхо', cannotAttack: 'Не может атаковать' } as const;
export type Trigger = keyof typeof TRIGGERS;
export type Operation = keyof typeof OPERATIONS;
export type RuleTarget = keyof typeof TARGETS;
export interface CardFilter { side: keyof typeof SIDES; tag?: string; cardId?: string; excludeSelf?: boolean }
export interface CustomRule {
  trigger: Trigger; operation: Operation; target: RuleTarget;
  amount: number; health: number; count: number; chance: number;
  cardId?: string; filter: CardFilter;
  targetTag?: string; targetCardId?: string;
  condition?: { zone: 'board' | 'hand' | 'deck' | 'summon' | 'death' | 'play'; minimum: number; filter: CardFilter };
}
export interface EditorData {
  version: 1; tags: string[]; rules: CustomRule[]; image?: string; artSourceId?: string; powerId?: string; startInHand?: boolean; legacyText?: string;
  discount?: { event: 'summon' | 'death' | 'play'; amount: number; filter: CardFilter };
  quest?: { event: 'summon' | 'death' | 'play'; goal: number; rewardId: string; filter: CardFilter };
}
const EFFECTS: Effect[] = ['galinka', 'concede', 'casino', 'trachukcha', 'legendaryHand', 'deathwing', 'maratik', 'bolt', 'heal', 'draw', 'silence', 'armor', 'oy', 'jaina', 'rds', 'devolve', 'purgeZhanna', 'volunteer', 'dragonslayer', 'discoverBlast', 'masik', 'paperArmy', 'briefing', 'rashQuest', 'echoMaxim', 'briefingDraw', 'jainaVolunteer'];
export const CUSTOM_LIMIT = 60, PACK_LIMIT = 600_000;
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown, low: number, high: number) => Number.isSafeInteger(v) && Number(v) >= low && Number(v) <= high;
const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const id = (v: unknown) => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,89}$/.test(v);
const choice = (v: unknown, choices: object) => typeof v === 'string' && Object.hasOwn(choices, v);
function filter(raw: unknown): CardFilter | null {
  if (!object(raw) || !choice(raw.side, SIDES) || raw.tag !== undefined && !text(raw.tag, 32) || raw.cardId !== undefined && !id(raw.cardId)
    || raw.excludeSelf !== undefined && typeof raw.excludeSelf !== 'boolean') return null;
  return { side: raw.side, ...(raw.tag ? { tag: raw.tag.trim() } : {}), ...(raw.cardId ? { cardId: raw.cardId } : {}), ...(raw.excludeSelf ? { excludeSelf: true } : {}) };
}
export function normalizeCustomCard(raw: unknown): CardDef | null {
  if (!object(raw) || typeof raw.id !== 'string' || !/^custom-[a-z0-9-]{8,80}$/.test(raw.id) || !text(raw.name, 60) || !raw.name.trim()
    || !['minion', 'spell', 'hero', 'power', 'token'].includes(raw.kind) || !integer(raw.cost, 0, 20)
    || !['common', 'rare', 'epic', 'legendary'].includes(raw.rarity) || !integer(raw.art, 0, 11)
    || !text(raw.text, 1800) || !text(raw.flavor, 400) || raw.tribe !== undefined && !text(raw.tribe, 32)
    || raw.effect !== undefined && !EFFECTS.includes(raw.effect) || raw.deathrattle !== undefined && !['rds-guard', 'slime-token', 'randomEnemyDamage'].includes(raw.deathrattle)
    || raw.auraAttack !== undefined && !integer(raw.auraAttack, 0, 20)
    || !object(raw.editor) || raw.editor.version !== 1) return null;
  const e = raw.editor, creature = raw.kind === 'minion' || raw.kind === 'token';
  if (!creature && ['taunt', 'charge', 'rush', 'cannotAttack'].some(key => raw[key] === true)
    || ['power', 'token'].includes(raw.kind) && raw.echo === true) return null;
  if (creature && (!integer(raw.attack, 0, 99) || !integer(raw.health, 1, 99)) || raw.kind === 'hero' && !integer(raw.armor, 0, 99)) return null;
  if (!Array.isArray(e.tags) || e.tags.length > 8 || !e.tags.every((t: unknown) => text(t, 32) && String(t).trim())
    || !Array.isArray(e.rules) || e.rules.length > 12 || e.image !== undefined && (typeof e.image !== 'string' || e.image.length > 48_000 || !/^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(e.image))
    || e.powerId !== undefined && !id(e.powerId) || e.artSourceId !== undefined && !id(e.artSourceId) || e.startInHand !== undefined && typeof e.startInHand !== 'boolean' || e.legacyText !== undefined && !text(e.legacyText, 800)) return null;
  const rules: CustomRule[] = [];
  for (const r of e.rules) {
    if (!object(r) || !choice(r.trigger, TRIGGERS) || !choice(r.operation, OPERATIONS) || !choice(r.target, TARGETS)
      || !integer(r.amount, -99, 99) || !integer(r.health, -99, 99) || !integer(r.count, 1, 10) || !integer(r.chance, 1, 100)
      || r.cardId !== undefined && !id(r.cardId) || r.targetCardId !== undefined && !id(r.targetCardId) || r.targetTag !== undefined && !text(r.targetTag, 32)) return null;
    const f = filter(r.filter); if (!f) return null;
    if (!creature && r.trigger === 'death' || !creature && raw.kind !== 'hero' && !['play'].includes(r.trigger) || r.operation === 'discover' && r.trigger !== 'play'
      || r.trigger === 'aura' && (r.operation !== 'buff' || !['friendlyMinions', 'enemyMinions', 'allMinions'].includes(r.target) || r.health !== 0 || r.amount < 0 || r.chance !== 100)
      || r.trigger !== 'play' && r.target.startsWith('selected')) return null;
    let condition: CustomRule['condition'];
    if (r.condition !== undefined) {
      const c = r.condition; if (!object(c) || !['board', 'hand', 'deck', 'summon', 'death', 'play'].includes(c.zone) || !integer(c.minimum, 1, 99)) return null;
      const cf = filter(c.filter); if (!cf) return null;
      condition = { zone: c.zone, minimum: c.minimum, filter: cf };
    }
    rules.push({ trigger: r.trigger, operation: r.operation, target: r.target, amount: r.amount, health: r.health, count: r.count, chance: r.chance, filter: f,
      ...(r.cardId ? { cardId: r.cardId } : {}), ...(r.targetTag ? { targetTag: r.targetTag.trim() } : {}), ...(r.targetCardId ? { targetCardId: r.targetCardId } : {}), ...(condition ? { condition } : {}) });
  }
  const editor: EditorData = { version: 1, tags: [...new Set(e.tags.map((t: string) => t.trim()))] as string[], rules,
    ...(e.image ? { image: e.image } : {}), ...(e.artSourceId ? { artSourceId: e.artSourceId } : {}), ...(e.powerId ? { powerId: e.powerId } : {}), ...(e.startInHand ? { startInHand: true } : {}), ...(e.legacyText ? { legacyText: e.legacyText } : {}) };
  if (e.discount !== undefined) {
    const d = e.discount, f = object(d) ? filter(d.filter) : null;
    if (!f || !['summon', 'death', 'play'].includes(d.event) || !integer(d.amount, 1, 20)) return null;
    editor.discount = { event: d.event, amount: d.amount, filter: f };
  }
  if (e.quest !== undefined) {
    const q = e.quest, f = object(q) ? filter(q.filter) : null;
    if (raw.kind !== 'spell' || !f || !['summon', 'death', 'play'].includes(q.event) || !integer(q.goal, 1, 99) || !id(q.rewardId)) return null;
    editor.quest = { event: q.event, goal: q.goal, rewardId: q.rewardId, filter: f };
  }
  const card: CardDef = { id: raw.id, name: raw.name.trim(), cost: raw.cost, kind: raw.kind, text: raw.text, flavor: raw.flavor, rarity: raw.rarity, art: raw.art, custom: true, editor,
    ...(creature ? { attack: raw.attack, health: raw.health } : {}), ...(raw.kind === 'hero' ? { armor: raw.armor } : {}), ...(raw.tribe ? { tribe: raw.tribe.trim() } : {}),
    ...(raw.effect ? { effect: raw.effect } : {}), ...(raw.deathrattle && creature ? { deathrattle: raw.deathrattle } : {}), ...(raw.auraAttack && creature ? { auraAttack: raw.auraAttack } : {}) };
  for (const key of [...Object.keys(KEYWORDS), 'reward', 'quest'] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== 'boolean') return null;
    if (raw[key]) Object.assign(card, { [key]: true });
  }
  if (editor.quest) card.quest = true;
  return card;
}
export function references(c: CardDef): string[] {
  const e = c.editor; if (!e) return [];
  return [...new Set([e.powerId, e.quest?.rewardId, e.quest?.filter.cardId, e.discount?.filter.cardId,
    ...e.rules.flatMap(r => [r.cardId, r.targetCardId, r.filter.cardId, r.condition?.filter.cardId])].filter((v): v is string => !!v))];
}
export function newRule(): CustomRule {
  return { trigger: 'play', operation: 'damage', target: 'enemyHero', amount: 2, health: 0, count: 1, chance: 100, filter: { side: 'friendly' } };
}
export function matchesCard(c: CardDef, f: Pick<CardFilter, 'tag' | 'cardId'>): boolean {
  return (!f.cardId || f.cardId === c.id) && (!f.tag || c.tribe?.toLocaleLowerCase() === f.tag.toLocaleLowerCase() || c.editor?.tags.some(t => t.toLocaleLowerCase() === f.tag!.toLocaleLowerCase()) === true);
}
