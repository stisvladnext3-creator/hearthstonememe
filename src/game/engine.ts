import { BOT_DECK, CARD, COLLECTIBLE, STARTER_DECK, deckError } from './cards';
import { cardEntity, heroEntity, powerEntity, type HistoryEntry, type HistoryDetails, type HistoryEntity } from './history';
import { POWER_CARDS } from './presentation';

export type Side = 'player' | 'bot';
export interface HandCard { uid: number; id: string }
export interface Minion extends HandCard {
  attack: number; health: number; maxHealth: number; ready: boolean;
  taunt: boolean; cannotAttack: boolean; silenced: boolean; ephemeral: boolean;
  origin?: 'played' | 'summoned' | 'transformed'; createdBy?: string;
  auraBonus?: number;
}
export interface Player {
  health: number; armor: number; mana: number; maxMana: number;
  hand: HandCard[]; deck: string[]; board: Minion[];
  fatigue: number; hero: string; power: 'spark' | 'fool' | 'oy' | 'rds'; powerUsed: boolean;
}
export interface Game {
  id: string;
  rashDeaths: number;
  events: GameEvent[];
  player: Player; bot: Player; active: Side; turn: number;
  winner: Side | 'draw' | null; nextUid: number; rng: number;
  log: HistoryEntry[]; nextLog: number;
  discovery?: { side: Side; sourceId: string; options: string[]; target: Target };
}
export interface Anchor { side: Side; uid: number | 'hero' }
export interface GameEvent {
  id: number; kind: 'attack' | 'summon' | 'spell' | 'power' | 'damage' | 'death' | 'transform';
  side: Side; source?: number | 'hero'; target?: Anchor; cardId?: string; amount?: number;
}
export type Target = number | 'hero';
export type Action =
  | { type: 'play'; uid: number; target?: Target }
  | { type: 'attack'; uid: number; target: Target }
  | { type: 'power'; target?: Target }
  | { type: 'discover'; cardId: string }
  | { type: 'end' }
  | { type: 'concede' };
export interface Result { state: Game; error?: string }
export const other = (side: Side): Side => side === 'player' ? 'bot' : 'player';
export const powerCost = (power: Player['power']) => CARD[POWER_CARDS[power]].cost;
export const cardCost = (g: Game, id: string) => Math.max(0, CARD[id].cost - (CARD[id].effect === 'jaina' ? g.rashDeaths : 0));
export function powerProblem(g: Game, side: Side): string | undefined {
  const p = g[side];
  if (g.winner) return 'Матч уже завершён.';
  if (g.active !== side) return 'Сейчас ход соперника.';
  if (g.discovery) return 'Сначала выберите карту раскопки.';
  if (p.powerUsed) return 'Сила героя уже использована в этом ходу.';
  if (p.mana < powerCost(p.power)) return `Для силы героя нужно ${powerCost(p.power)} маны.`;
  if (p.power === 'oy' && p.hand.length >= 10) return 'В руке нет места для Смертокрыла: уже 10 карт.';
  if (p.power === 'rds' && p.board.length >= 7) return 'На поле нет места для РАШ: уже 7 существ.';
  if (p.power === 'fool' && g[other(side)].board.length === 0) return 'У противника нет существ для превращения.';
}
function random(g: Game) {
  let t = g.rng += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function shuffled(g: Game, ids: string[]) {
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random(g) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function log(g: Game, text: string, side: Side | 'system' = g.active, details: HistoryDetails = {}) {
  g.log.push({ id: g.nextLog++, text, side, turn: Math.ceil(g.turn / 2), kind: side === 'system' ? 'turn' : 'effect',
    actor: side === 'system' ? undefined : heroEntity(g[side], side), ...details });
  g.log = g.log.slice(-1000);
}
function emit(g: Game, event: Omit<GameEvent, 'id'>) {
  g.events.push({ ...event, id: (g.events.at(-1)?.id ?? 0) + 1 });
  g.events = g.events.slice(-40);
}
function damageHero(p: Player, n: number) {
  const absorbed = Math.min(n, p.armor);
  p.armor -= absorbed;
  p.health -= n - absorbed;
}
function destroy(g: Game, side: Side, predicate: (m: Minion) => boolean) {
  g[side].board = g[side].board.filter(m => {
    if (!predicate(m)) return true;
    if (CARD[m.id].tribe === 'РАШ') g.rashDeaths++;
    emit(g, { kind: 'death', side, target: { side, uid: m.uid }, cardId: m.id });
    log(g, `${CARD[m.id].name} (${side === 'player' ? 'ваше существо' : 'существо Бориса'}) погибает.`, side, { kind: 'death', actor: cardEntity(m.id, side, m) });
    return false;
  });
}
export function refreshAuras(g: Game) {
  const changes: { side: Side; minion: Minion; before: number }[] = [];
  for (const side of ['player', 'bot'] as Side[]) {
    const bonus = g[side].board.reduce((n, m) => n + (m.silenced ? 0 : CARD[m.id].auraAttack ?? 0), 0);
    for (const m of g[side].board) {
      const previous = m.auraBonus ?? 0;
      if (previous !== bonus) changes.push({ side, minion: m, before: m.attack });
      m.attack += bonus - previous;
      m.auraBonus = bonus;
    }
  }
  return changes;
}
function resolve(g: Game) {
  for (const side of ['player', 'bot'] as Side[]) destroy(g, side, m => m.health <= 0);
  for (const { side, minion, before } of refreshAuras(g)) {
    log(g, `Аура Василия: ${CARD[minion.id].name}, атака ${before} → ${minion.attack} (бонус +${minion.auraBonus}).`, side,
      { actor: cardEntity('vasiliy', side), target: cardEntity(minion.id, side, minion) });
  }
  if (g.player.health <= 0 && g.bot.health <= 0) g.winner = 'draw';
  else if (g.player.health <= 0) g.winner = 'bot';
  else if (g.bot.health <= 0) g.winner = 'player';
  if (g.winner) delete g.discovery;
}
function addToHand(g: Game, side: Side, id: string) {
  if (g[side].hand.length < 10) g[side].hand.push({ id, uid: g.nextUid++ });
  else log(g, `Рука полна: ${CARD[id].name} сгорает.`, side, { kind: 'discard', actor: cardEntity(id, side) });
}
function draw(g: Game, side: Side, n = 1) {
  for (let i = 0; i < n; i++) {
    const p = g[side];
    const id = p.deck.shift();
    if (id) addToHand(g, side, id);
    else {
      p.fatigue++;
      damageHero(p, p.fatigue);
      emit(g, { kind: 'damage', side, target: { side, uid: 'hero' }, amount: p.fatigue });
      log(g, `Усталость: ${p.fatigue} урона.`, side);
    }
    resolve(g);
    if (g.winner) break;
  }
}
function summon(g: Game, side: Side, id: string, source?: number | 'hero', createdBy?: string): Minion | undefined {
  if (g[side].board.length >= 7) return;
  const c = CARD[id];
  const m: Minion = { id, uid: g.nextUid++, attack: c.attack ?? 0, health: c.health ?? 1,
    maxHealth: c.health ?? 1, ready: false, taunt: !!c.taunt, cannotAttack: !!c.cannotAttack,
    silenced: false, ephemeral: c.effect === 'deathwing', origin: typeof source === 'number' ? 'played' : 'summoned', createdBy };
  g[side].board.push(m);
  emit(g, { kind: 'summon', side, source, target: { side, uid: m.uid }, cardId: id });
  return m;
}
function emptyPlayer(hero: string): Player {
  return { health: 30, armor: 0, mana: 0, maxMana: 0, hand: [], deck: [], board: [],
    fatigue: 0, hero, power: 'spark', powerUsed: false };
}
export function createGame(deck = STARTER_DECK, seed = Date.now()): Game {
  const g: Game = { id: String(seed), rashDeaths: 0, events: [], player: emptyPlayer('mage'), bot: emptyPlayer('boris'), active: 'player', turn: 1,
    winner: null, nextUid: 1, rng: seed, log: [], nextLog: 1 };
  g.player.deck = shuffled(g, deckError(deck) ? STARTER_DECK : deck);
  g.bot.deck = shuffled(g, BOT_DECK);
  for (const side of ['player', 'bot'] as Side[]) {
    const i = g[side].deck.indexOf('casino');
    if (i >= 0) addToHand(g, side, g[side].deck.splice(i, 1)[0]);
    draw(g, side, (side === 'player' ? 3 : 4) - g[side].hand.length);
  }
  g.player.maxMana = 1;
  g.player.mana = 1;
  draw(g, 'player');
  log(g, 'Добро пожаловать в трактир! Вы ходите первым.', 'system');
  return g;
}
export function targetNeeded(g: Game, uid?: number): boolean {
  if (uid === undefined) return g[g.active].power === 'spark';
  const card = g[g.active].hand.find(c => c.uid === uid);
  return !!card && ['bolt', 'silence', 'discoverBlast'].includes(CARD[card.id].effect ?? '');
}
export function legalTargets(g: Game, action: 'attack' | 'bolt' | 'silence' | 'spark'): Target[] {
  const enemies = g[other(g.active)].board;
  if (action === 'silence') return [...g[g.active].board, ...enemies].map(m => m.uid);
  const taunts = enemies.filter(m => m.taunt);
  if (action === 'attack' && taunts.length) return taunts.map(m => m.uid);
  return ['hero', ...enemies.map(m => m.uid)];
}
export function act(input: Game, side: Side, action: Action): Result {
  const fail = (error: string): Result => ({ state: input, error });
  if (input.winner) return fail('Матч уже завершён.');
  if (input.active !== side && action.type !== 'concede') return fail('Сейчас ход соперника.');
  if (input.discovery && action.type !== 'discover' && action.type !== 'concede') return fail('Сначала выберите карту раскопки.');
  const g = structuredClone(input);
  refreshAuras(g);
  const p = g[side];
  const enemySide = other(side);
  const enemy = g[enemySide];
  let actor: HistoryEntity = heroEntity(p, side);
  let actingHero: HistoryEntity | undefined;
  const record = (text: string, details: HistoryDetails = {}) => log(g, text, side, { actor, hero: actingHero, ...details });
  const enemyEntity = (target: Target) => target === 'hero' ? heroEntity(enemy, enemySide) : cardEntity(enemy.board.find(m => m.uid === target)!.id, enemySide, enemy.board.find(m => m.uid === target));
  const hit = (target: Target, n: number) => {
    if (target === 'hero') damageHero(enemy, n);
    else { const m = enemy.board.find(x => x.uid === target); if (m) m.health -= n; }
    emit(g, { kind: 'damage', side, target: { side: enemySide, uid: target }, amount: n });
  };
  if (action.type === 'concede') {
    g.winner = enemySide;
    delete g.discovery;
    record(side === 'player' ? 'Вы сдались.' : 'Борис сдался.', { kind: 'finish' });
    return { state: g };
  }
  if (action.type === 'discover') {
    const discovery = g.discovery;
    if (!discovery || discovery.side !== side || !discovery.options.includes(action.cardId)) return fail('Выберите одну из предложенных карт раскопки.');
    if (discovery.target !== 'hero' && !enemy.board.some(m => m.uid === discovery.target)) return fail('Цель заклинания недоступна.');
    actor = cardEntity(discovery.sourceId, side);
    delete g.discovery;
    const fullHand = p.hand.length >= 10;
    addToHand(g, side, action.cardId);
    record(`Раскопка: ${CARD[action.cardId].name} — ${fullHand ? 'копия сгорает: рука полна' : 'копия добавлена в руку'}. Колода не меняется.`, { kind: 'discover', target: cardEntity(action.cardId, side) });
    const target = enemyEntity(discovery.target);
    emit(g, { kind: 'spell', side, source: 'hero', cardId: discovery.sourceId, target: { side: enemySide, uid: discovery.target } });
    hit(discovery.target, 4);
    record(`${CARD[discovery.sourceId].name} → ${target.name}: 4 урона.`, { target, amount: 4 });
  } else if (action.type === 'play') {
    const index = p.hand.findIndex(c => c.uid === action.uid);
    if (index < 0) return fail('Карта уже не в руке.');
    const c = CARD[p.hand[index].id];
    if (c.kind !== 'minion' && c.kind !== 'spell' && c.kind !== 'hero') return fail('Эта карта создаётся способностью и не разыгрывается из руки.');
    const cost = cardCost(g, c.id);
    if (p.mana < cost) return fail('Недостаточно маны.');
    if (c.kind === 'minion' && p.board.length >= 7) return fail('На поле уже 7 существ.');
    if (c.effect === 'bolt' || c.effect === 'silence' || c.effect === 'discoverBlast') {
      if (action.target === undefined || !legalTargets(g, c.effect === 'discoverBlast' ? 'bolt' : c.effect).includes(action.target)) return fail('Выберите подходящую цель.');
    }
    p.mana -= cost;
    p.hand.splice(index, 1);
    actor = cardEntity(c.id, side);
    record(`Разыграна карта «${c.name}» за ${cost} маны.`, { kind: 'play' });
    const body = c.kind === 'minion' ? summon(g, side, c.id, action.uid, c.id) : undefined;
    const targetSide = c.effect === 'silence' && p.board.some(m => m.uid === action.target) ? side : enemySide;
    if ((c.kind === 'spell' || c.kind === 'hero') && c.effect !== 'discoverBlast') emit(g, { kind: 'spell', side, source: action.uid, cardId: c.id, target: { side: action.target !== undefined ? targetSide : side, uid: action.target ?? 'hero' } });
    switch (c.effect) {
      case 'galinka': {
        const pushkin = summon(g, side, 'pushkin', undefined, 'galinka');
        record(pushkin ? 'Галинка призывает Пушкина 15/15 с провокацией.' : 'Галинка: Пушкин не призван — на столе нет места.', { target: pushkin ? cardEntity('pushkin', side, pushkin) : undefined });
        break;
      }
      case 'concede': {
        const target = heroEntity(p, side);
        emit(g, { kind: 'damage', side, target: { side, uid: 'hero' }, amount: p.health, cardId: c.id });
        p.health = 0;
        g.winner = enemySide;
        record(`«Хорошая игра.»: ${side === 'bot' ? 'герой Бориса уничтожен. Вы победили.' : 'ваш герой уничтожен. Вы проиграли.'}`, { kind: 'finish', target });
        break;
      }
      case 'casino': {
        if (random(g) < 0.5) {
          const unlucky = random(g) < 0.5 ? side : enemySide;
          const count = Math.floor(g[unlucky].deck.length / 2);
          g[unlucky].deck.splice(0, count);
          record(`Козиныч уничтожает ${count} карт ${unlucky === 'player' ? 'вашей колоды' : 'колоды Бориса'}!`, { target: heroEntity(g[unlucky], unlucky), amount: count });
        } else record('Козиныч: ничего не произошло. Сегодня повезло!');
        break;
      }
      case 'trachukcha': p.hero = 'trachukcha'; p.armor += 99; p.power = 'fool'; p.powerUsed = false; record('Трачукча даёт 99 брони и заменяет силу героя на «Дибильнутый!».', { target: powerEntity(p, side) }); break;
      case 'maratik': p.hero = 'maratik'; p.armor += 5; p.power = 'oy'; p.powerUsed = false; record('Маратик даёт 5 брони и заменяет силу героя на «Ой».', { target: powerEntity(p, side) }); break;
      case 'jaina': p.hero = 'jaina'; p.armor += 10; p.power = 'rds'; p.powerUsed = false; record(`Джайна даёт 10 брони и «Силу РДШ». Погибло РАШ за матч: ${g.rashDeaths}.`, { target: powerEntity(p, side) }); break;
      case 'purgeZhanna': {
        let removed = 0;
        for (const s of ['player', 'bot'] as Side[]) {
          const before = g[s].deck.length;
          g[s].deck = g[s].deck.filter(id => !(CARD[id].kind === 'minion' && CARD[id].tribe === 'Жанна'));
          removed += before - g[s].deck.length;
        }
        record(`Максимка удаляет из обеих колод существ «Жанна»: ${removed}.`, { target: cardEntity('zhanna', enemySide), amount: removed });
        break;
      }
      case 'volunteer':
        destroy(g, side, () => true); destroy(g, enemySide, () => true);
        summon(g, side, 'rash-volunteer', undefined, 'volunteer'); summon(g, side, 'rash-volunteer', undefined, 'volunteer');
        record('Волонтер-босс уничтожает всех, включая себя, и призывает два РАШ 2/4.', { target: cardEntity('rash-volunteer', side) });
        break;
      case 'legendaryHand': {
        const legends = COLLECTIBLE.filter(card => card.kind === 'minion' && card.rarity === 'legendary').map(card => card.id);
        while (p.hand.length < 10) addToHand(g, side, legends[Math.floor(random(g) * legends.length)]);
        record('Боевой клич «Я»: рука заполнена легендарными существами.');
        break;
      }
      case 'deathwing':
        destroy(g, enemySide, () => true);
        destroy(g, side, m => m.uid !== body?.uid);
        p.hand = [];
        record(`Смертокрыл уничтожает остальных существ и сбрасывает ${side === 'player' ? 'вашу руку' : 'руку Бориса'}.`);
        break;
      case 'dragonslayer': {
        const target = heroEntity(enemy, enemySide);
        emit(g, { kind: 'spell', side, source: body!.uid, cardId: c.id, target: { side: enemySide, uid: 'hero' } });
        hit('hero', 4);
        record(`Боевой клич «Драконоборец» → ${target.name}: 4 урона.`, { target, amount: 4 });
        break;
      }
      case 'discoverBlast': {
        const options = shuffled(g, [...new Set(p.deck)]).slice(0, 3);
        if (options.length) {
          g.discovery = { side, sourceId: c.id, options, target: action.target! };
          record(`Раскопка: ${side === 'player' ? 'вы выбираете' : 'Борис выбирает'} копию одной из ${options.length} карт своей колоды.`, { kind: 'discover' });
        } else {
          record('Раскопка: колода пуста, копия карты не получена.');
          const target = enemyEntity(action.target!);
          emit(g, { kind: 'spell', side, source: action.uid, cardId: c.id, target: { side: enemySide, uid: action.target! } });
          hit(action.target!, 4);
          record(`${c.name} → ${target.name}: 4 урона.`, { target, amount: 4 });
        }
        break;
      }
      case 'bolt': { const target = enemyEntity(action.target!); hit(action.target!, 3); record(`Искра хаоса → ${target.name}: 3 урона.`, { target, amount: 3 }); break; }
      case 'heal': { const amount = Math.min(5, 30 - p.health); p.health += amount; record(`Чай с мёдом восстанавливает герою ${amount} здоровья.`, { target: heroEntity(p, side), amount }); break; }
      case 'draw': draw(g, side, 2); record('Гениальный план: попытка добрать 2 карты. При пустой колоде — усталость.'); break;
      case 'silence': {
        const m = g[targetSide].board.find(x => x.uid === action.target)!;
        m.taunt = false; m.cannotAttack = false; m.ephemeral = false; m.silenced = true;
        record(`Тихий час накладывает немоту на ${CARD[m.id].name}.`, { target: cardEntity(m.id, targetSide, m) });
        break;
      }
    }
  } else if (action.type === 'attack') {
    const m = p.board.find(x => x.uid === action.uid);
    if (!m || !m.ready || m.cannotAttack || m.attack <= 0) return fail('Это существо пока не может атаковать.');
    if (!legalTargets(g, 'attack').includes(action.target)) return fail('Сначала атакуйте существо с провокацией.');
    const defender = action.target === 'hero' ? null : enemy.board.find(x => x.uid === action.target)!;
    actor = cardEntity(m.id, side, m);
    const victim = enemyEntity(action.target);
    emit(g, { kind: 'attack', side, source: m.uid, target: { side: enemySide, uid: action.target }, cardId: m.id });
    hit(action.target, m.attack);
    if (defender) { m.health -= defender.attack; emit(g, { kind: 'damage', side: enemySide, target: { side, uid: m.uid }, amount: defender.attack }); }
    m.ready = false;
    record(`${CARD[m.id].name} → ${defender ? CARD[defender.id].name : side === 'player' ? 'герой Бориса' : 'ваш герой'}: ${m.attack} урона.${defender ? ` Ответный удар ${CARD[defender.id].name}: ${defender.attack} урона.` : ''}`, { kind: 'attack', target: victim, amount: m.attack, retaliation: defender?.attack });
  } else if (action.type === 'power') {
    const cost = powerCost(p.power);
    const problem = powerProblem(g, side);
    if (problem) return fail(problem);
    if (p.power === 'spark' && (action.target === undefined || !legalTargets(g, 'spark').includes(action.target))) return fail('Выберите врага для Искры.');
    p.powerUsed = true;
    p.mana -= cost;
    const powerId = POWER_CARDS[p.power];
    actor = powerEntity(p, side); actingHero = heroEntity(p, side);
    emit(g, { kind: 'power', side, source: 'hero', target: { side: p.power === 'spark' ? enemySide : side, uid: p.power === 'spark' ? action.target! : 'hero' }, cardId: powerId });
    if (p.power === 'spark') { const target = enemyEntity(action.target!); hit(action.target!, 1); record(`Сила героя «Искра» → ${target.name}: 1 урон.`, { kind: 'power', target, amount: 1 }); }
    if (p.power === 'oy') { addToHand(g, side, 'deathwing'); record('Ой! Смертокрыл добавлен в руку.', { kind: 'power', target: cardEntity('deathwing', side) }); }
    if (p.power === 'rds') { summon(g, side, 'rash', 'hero', 'rds-power'); record('Сила РДШ призывает РАШ 2/5.', { kind: 'power', target: cardEntity('rash', side) }); }
    if (p.power === 'fool') {
      const pool = COLLECTIBLE.filter(c => c.kind === 'minion');
      enemy.board = enemy.board.map(m => {
        const cost = Math.max(0, CARD[m.id].cost - 5);
        let options = pool.filter(c => c.cost === cost);
        // A future sparse card pool uses the closest lower cost when an exact one is absent.
        if (!options.length) {
          const lower = Math.max(...pool.filter(c => c.cost <= cost).map(c => c.cost));
          options = pool.filter(c => c.cost === lower);
        }
        const c = options[Math.floor(random(g) * options.length)];
        record(`Дибильнутый!: ${CARD[m.id].name} (${CARD[m.id].cost} маны) → ${c.name} (${c.cost} маны). Боевой клич результата не срабатывает.`, { kind: 'transform', target: cardEntity(m.id, enemySide, m), result: cardEntity(c.id, enemySide) });
        emit(g, { kind: 'transform', side, source: 'hero', target: { side: enemySide, uid: m.uid }, cardId: c.id });
        return { id: c.id, uid: g.nextUid++, attack: c.attack!, health: c.health!, maxHealth: c.health!, ready: m.ready,
          taunt: !!c.taunt, cannotAttack: !!c.cannotAttack, silenced: false, ephemeral: c.effect === 'deathwing', origin: 'transformed', createdBy: 'fool-power' };
      });
      record('Дибильнутый! Все существа противника превращены в случайных на 5 маны дешевле.', { kind: 'power' });
    }
  } else if (action.type === 'end') {
    const expired = p.board.filter(m => m.ephemeral);
    destroy(g, side, m => m.ephemeral);
    if (expired.length) log(g, 'Смертокрыл распыляется в конце хода.', side);
    g.active = enemySide;
    g.turn++;
    enemy.maxMana = Math.min(10, enemy.maxMana + 1);
    enemy.mana = enemy.maxMana;
    enemy.powerUsed = false;
    enemy.board.forEach(m => { m.ready = true; });
    log(g, enemySide === 'player' ? 'Ваш ход.' : 'Ход трактирщика Бориса.', 'system');
    draw(g, enemySide);
  }
  resolve(g);
  return { state: g };
}
export function chooseBotAction(g: Game): Action {
  if (g.winner || g.active !== 'bot') return { type: 'end' };
  const p = g.bot;
  const silenceTarget = g.player.board.find(m => m.taunt || !m.silenced && !!CARD[m.id].auraAttack)
    ?? p.board.find(m => (m.cannotAttack || m.ephemeral) && !m.silenced && !m.taunt && !CARD[m.id].auraAttack);
  if (g.discovery?.side === 'bot') {
    const score = (id: string) => {
      const c = CARD[id];
      if (c.effect === 'concede') return -1000;
      return Math.min(cardCost(g, id), 10) + (c.attack ?? 0) + (c.health ?? 0) / 2
        + (c.effect === 'dragonslayer' || c.effect === 'discoverBlast' ? 5 : 0)
        - (c.effect === 'deathwing' && g.player.board.length <= p.board.length ? 15 : 0);
    };
    return { type: 'discover', cardId: [...g.discovery.options].sort((a, b) => score(b) - score(a))[0] };
  }
  const attacks = p.board.filter(m => m.ready && !m.cannotAttack && m.attack > 0);
  const targets = legalTargets(g, 'attack');
  const totalDamage = attacks.reduce((sum, m) => sum + m.attack, 0);
  if (targets.includes('hero') && totalDamage >= g.player.health + g.player.armor && attacks.length)
    return { type: 'attack', uid: attacks[0].uid, target: 'hero' };
  const playable = p.hand.filter(h => {
    const c = CARD[h.id];
    if (cardCost(g, c.id) > p.mana || c.effect === 'concede') return false;
    if (c.kind === 'minion' && p.board.length >= 7) return false;
    if (c.effect === 'heal' && p.health > 25) return false;
    if (c.effect === 'silence' && !silenceTarget) return false;
    if (c.effect === 'deathwing' && g.player.board.length <= p.board.length) return false;
    return true;
  }).sort((a, b) => cardCost(g, b.id) - cardCost(g, a.id));
  const lethal = playable.find(h => {
    const effect = CARD[h.id].effect;
    return (effect === 'bolt' ? 3 : effect === 'dragonslayer' || effect === 'discoverBlast' ? 4 : 0) >= g.player.health + g.player.armor;
  });
  if (lethal) return { type: 'play', uid: lethal.uid, target: CARD[lethal.id].effect === 'dragonslayer' ? undefined : 'hero' };
  if (playable.length) {
    const card = playable[0];
    const effect = CARD[card.id].effect;
    let target: Target | undefined;
    if (effect === 'bolt' || effect === 'discoverBlast') target = [...g.player.board].filter(m => m.health <= (effect === 'bolt' ? 3 : 4)).sort((a, b) => b.attack - a.attack)[0]?.uid ?? 'hero';
    if (effect === 'silence') target = silenceTarget!.uid;
    return { type: 'play', uid: card.uid, target };
  }
  if (attacks.length) {
    const attacker = attacks[0];
    const favorable = g.player.board.filter(m => targets.includes(m.uid) && m.health <= attacker.attack && m.attack < attacker.health).sort((a, b) => b.attack - a.attack)[0];
    return { type: 'attack', uid: attacker.uid, target: favorable?.uid ?? (targets.includes('hero') ? 'hero' : targets[0]) };
  }
  if (!powerProblem(g, 'bot')) {
    const weak = g.player.board.find(m => m.health === 1);
    return { type: 'power', target: weak?.uid ?? 'hero' };
  }
  return { type: 'end' };
}
