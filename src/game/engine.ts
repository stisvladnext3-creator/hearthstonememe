import { BOT_DECK, CARD, STARTER_DECK, cardAbilities, classDeck, deckError } from './cards';
import { cardEntity, heroEntity, powerEntity, type HistoryEntry, type HistoryDetails, type HistoryEntity } from './history';
import { powerCardId, powerKey } from './presentation';
import { packForCards, registerCardPack } from './custom-cards';
import { createCustomEngine, customDiscount, customPool, customSelectedTargets, silenceMinion, type CustomContinuation, type CustomCounts } from './custom-engine';
import type { CardDef } from './cards';
import { matchesCard } from './custom-schema';
import { belongsToClass, HERO_CLASSES, type HeroClass } from './classes';
import { applyDamage, attacksUsed, expireImmunity, isImmune, keywordState, type KeywordState } from './battle-keywords';
import {ADAPTATIONS,adaptationOptions,applyAdaptation,type AdaptationChoice,type AdaptationId} from './adaptation';
import { addMetric, emptyMetrics, type MatchMetrics } from './metrics';

export type Side = 'player' | 'bot';
export interface HandCard { uid: number; id: string; expiresTurn?: number }
export interface Minion extends HandCard, KeywordState {
  attack: number; health: number; maxHealth: number; ready: boolean;
  taunt: boolean; cannotAttack: boolean; silenced: boolean; ephemeral: boolean;
  origin?: 'played' | 'summoned' | 'transformed'; createdBy?: string;
  auraBonus?: number;
  auraSource?: string;
  charge?: boolean; rush?: boolean; enteredTurn?: number; attackedThisTurn?: boolean;
  stealth?: boolean;
  attackBuff?: number;
  healthBuff?: number;
}
export interface Player {
  immuneUntilTurn?: number; immuneOnOwnTurn?: boolean;
  metrics?: MatchMetrics;
  name?: string;
  health: number; armor: number; mana: number; maxMana: number;
  hand: HandCard[]; deck: string[]; board: Minion[];
  fatigue: number; hero: string; power: string; powerUsed: boolean;
  powerSilenceTurns?: number;
  quest?: { id: string; progress: number };
}
export interface Game {
  id: string;
  rashDeaths: number;
  trainingBotId?: string;
  events: GameEvent[];
  casting?: CardCast;
  player: Player; bot: Player; active: Side; turn: number;
  winner: Side | 'draw' | null; nextUid: number; rng: number;
  log: HistoryEntry[]; nextLog: number;
  customCards?: CardDef[];
  customCounts?: CustomCounts;
  adaptation?:AdaptationChoice;
  discovery?: { side: Side; sourceId: string; options: string[]; target: Target; custom?: CustomContinuation };
  briefing?: { remainingTurns: Record<Side, number> };
  mulligan?: { deadline: number; ready: Record<Side, boolean>; selected: Record<Side, number[]> };
}
export interface CardCast {
  side: Side; cardId: string; startedAt: number; endsAt: number;
  action: Extract<Action, { type: 'play' | 'power' }>;
}
export interface Anchor { side: Side; uid: number | 'hero' }
export interface GameEvent {
  id: number; kind: 'attack' | 'summon' | 'spell' | 'power' | 'damage' | 'death' | 'transform' | 'draw' | 'shield' | 'immune' | 'heal';
  side: Side; source?: number | 'hero'; target?: Anchor; cardId?: string; amount?: number; deathrattle?: boolean;
}
export type Target = number | 'hero' | 'own-hero';
export type Action =
  | { type: 'mulligan'; replace: number[]; confirm?: boolean }
  | { type: 'play'; uid: number; target?: Target }
  | { type: 'attack'; uid: number; target: Target }
  | { type: 'power'; target?: Target }
  | { type: 'discover'; cardId: string }
  | { type: 'adapt'; option:AdaptationId }
  | { type: 'end' }
  | { type: 'concede' };
export interface Result { state: Game; error?: string }
export const other = (side: Side): Side => side === 'player' ? 'bot' : 'player';
export const powerCost = (power: Player['power'], g?: Game, side = g?.active ?? 'player') => Math.max(0, CARD[powerCardId(power)].cost - (g ? customDiscount(g, powerCardId(power), side) : 0));
export const activePower = (g: Game, side: Side): Player['power'] => g.briefing ? 'briefing' : g[side].power;
export const boardLimit = (g: Game) => g.briefing ? 1 : 7;
export const cardCost = (g: Game, id: string, side = g.active) => Math.max(0, CARD[id].cost - (CARD[id].effect === 'jaina' ? g.rashDeaths : 0) - customDiscount(g, id, side));
export const clawFuryPool = (g: Game) => customPool(g).filter(c => [3, 5, 7].includes(c.cost) && belongsToClass(c, 'cat'));
export function powerProblem(g: Game, side: Side): string | undefined {
  const p = g[side];
  const power = activePower(g, side);
  if (g.winner) return 'Матч уже завершён.';
  if (g.casting) return 'Карта разыгрывается…';
  if (g.mulligan) return 'Сначала выберите стартовую руку.';
  if (g.active !== side) return 'Сейчас ход соперника.';
  if (g.adaptation) return 'Сначала выберите адаптацию.';
  if (g.discovery) return 'Сначала выберите карту раскопки.';
  if (p.powerSilenceTurns) return `Сила героя отключена немотой. Осталось своих ходов: ${p.powerSilenceTurns}.`;
  if (p.powerUsed) return 'Сила героя уже использована в этом ходу.';
  if (p.mana < powerCost(power, g, side)) return `Для силы героя нужно ${powerCost(power, g, side)} маны.`;
  if (power === 'oy' && p.hand.length >= 10) return 'В руке нет места для Смертокрыла: уже 10 карт.';
  if (power === 'rds' && p.board.length >= boardLimit(g)) return `На поле нет места для РДШ: уже ${boardLimit(g)} существ.`;
  if (power === 'storm' && p.board.length >= boardLimit(g)) return `На поле нет места для элементаля бури: уже ${boardLimit(g)} существ.`;
  if (power === 'fool' && g[other(side)].board.length === 0) return 'У противника нет существ для превращения.';
  const customTargets = customSelectedTargets(g, side, powerCardId(power));
  if (customTargets && !customTargets.length) return 'Для силы героя нет подходящей цели.';
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
  if (event.kind === 'damage' && event.target && event.side !== event.target.side) {
    addMetric(g[event.side], event.target.uid === 'hero' ? 'heroDamage' : 'minionDamage', event.amount ?? 0);
  }
  g.events.push({ ...event, id: (g.events.at(-1)?.id ?? 0) + 1 });
  g.events = g.events.slice(-120);
}
function dealDamage(g: Game, side: Side, target: Anchor, n: number, source: { uid?: number; cardId?: string; poisonous?: boolean; lifesteal?:boolean; attackingUid?: number } = {}) {
  const result = applyDamage(g, side, target, n, source);
  if (result.blocked) {
    emit(g, { kind: result.blocked, side, source: source.uid, target, cardId: source.cardId });
    const body=g[target.side].board.find(m=>m.uid===target.uid);
    const victim=body?cardEntity(body.id,target.side,body):heroEntity(g[target.side],target.side);
    log(g, victim.name+': '+(result.blocked==='shield'?'божественный щит поглощает урон.':'неуязвимость предотвращает урон.'),side,{actor:source.cardId?cardEntity(source.cardId,side):heroEntity(g[side],side),target:victim});
  }
  if (result.amount) {
    emit(g, { kind: 'damage', side, source: source.uid, target, amount: result.amount, cardId: source.cardId });
    const body=g[side].board.find(m=>m.uid===source.uid),lifesteal=source.lifesteal??(body?body.lifesteal:source.cardId&&CARD[source.cardId]?.lifesteal);
    if(lifesteal){const p=g[side],healed=Math.min(result.amount,30-p.health);p.health+=healed;if(healed>0){emit(g,{kind:'heal',side,source:source.uid,target:{side,uid:'hero'},amount:healed,cardId:source.cardId});log(g,`Похищение жизни: восстановлено ${healed} здоровья.`,side,{actor:source.cardId?cardEntity(source.cardId,side):heroEntity(p,side),target:heroEntity(p,side),amount:healed});}}
  }
  return result.amount;
}
function reveal(g: Game, side: Side, uid: number) {
  const m = g[side].board.find(m => m.uid === uid);
  if (!m?.stealth) return;
  m.stealth = false;delete m.stealthUntilTurn;
  log(g, `${CARD[m.id].name} выходит из маскировки.`, side, { actor: cardEntity(m.id, side, m) });
  custom.record(g, { kind: 'reveal', side, cardId: m.id, uid, revealed: structuredClone(m) });
}
// Deathrattles wait until all casualties have left the battlefield. The queue is
// transient: no half-resolved actions are saved or copied into the next action.
type DeathEntry={side:Side;minion:Minion;rightUids:number[]};
const deathrattles = new WeakMap<Game, DeathEntry[]>();
const rebirths = new WeakMap<Game, DeathEntry[]>();
const deathPosition=(g:Game,e:DeathEntry)=>{const index=g[e.side].board.findIndex(m=>e.rightUids.includes(m.uid));return index<0?g[e.side].board.length:index;};
function destroy(g: Game, side: Side, predicate: (m: Minion) => boolean) {
  g[side].board = g[side].board.filter((m,index,board) => {
    if (!predicate(m)) return true;
    if (matchesCard(CARD[m.id], { tag: 'РДШ' })) g.rashDeaths++;
    const entry={side,minion:structuredClone(m),rightUids:board.slice(index+1).map(m=>m.uid)};
    custom.record(g, { kind: 'death', side, cardId: m.id, uid: m.uid, dead: structuredClone(m),rightUids:entry.rightUids });
    if(m.reborn){const pending=rebirths.get(g)??[];pending.push(entry);rebirths.set(g,pending);}
    if (CARD[m.id].deathrattle && !m.silenced || m.adaptSpores) {
      const pending = deathrattles.get(g) ?? [];
      pending.push(entry); deathrattles.set(g, pending);
    }
    emit(g, { kind: 'death', side, target: { side, uid: m.uid }, cardId: m.id, deathrattle: !!((CARD[m.id].deathrattle || cardAbilities(CARD[m.id])?.rules.some(r => r.trigger === 'death')) && !m.silenced || m.adaptSpores) });
    log(g, `${CARD[m.id].name} (${side === 'player' ? 'ваше существо' : 'существо соперника'}) погибает.`, side, { kind: 'death', actor: cardEntity(m.id, side, m) });
    return false;
  });
}
export function refreshAuras(g: Game) {
  const changes: { side: Side; minion: Minion; before: number; source: string }[] = [];
  for (const side of ['player', 'bot'] as Side[]) {
    const bonus = g[side].board.reduce((n, m) => n + (m.silenced ? 0 : CARD[m.id].auraAttack ?? 0), 0);
    for (const m of g[side].board) {
      const previous = m.auraBonus ?? 0;
      const total = bonus + custom.auraBonus(g, side, m);
      const source = custom.auraSource(g, side, m) ?? (bonus ? 'vasiliy' : undefined);
      if (previous !== total) changes.push({ side, minion: m, before: m.attack, source: source ?? m.auraSource ?? 'vasiliy' });
      m.attack += total - previous;
      m.auraBonus = total;
      m.auraSource = source;
    }
  }
  return changes;
}
function resolve(g: Game) {
  // A damage deathrattle can kill another deathrattle minion. Resolve each wave
  // after removing every casualty, so targeting and free board slots are correct.
  for (;;) {
    for (const side of [g.active, other(g.active)]) destroy(g, side, m => m.health <= 0);
    const pending = deathrattles.get(g) ?? [];
    deathrattles.delete(g);
    if (!pending.length) {
      if (custom.flush(g)) continue;
      const reborn=rebirths.get(g)??[];rebirths.delete(g);
      if(reborn.length){for(const entry of reborn){const m=summon(g,entry.side,entry.minion.id,undefined,entry.minion.id,{position:deathPosition(g,entry),health:1,reborn:false});log(g,`Перерождение: ${CARD[entry.minion.id].name} ${m?'возвращается с 1 здоровьем.':'не возвращается — на столе нет места.'}`,entry.side,{actor:cardEntity(entry.minion.id,entry.side,entry.minion),target:m?cardEntity(m.id,entry.side,m):undefined});}continue;}
      break;
    }
    for (const entry of pending) {
      const {side,minion}=entry;
      const deathrattle = minion.silenced?undefined:CARD[minion.id].deathrattle;
      if (deathrattle === 'randomEnemyDamage') {
        const foe = other(side), enemy = g[foe];
        const targets: (number | 'hero')[] = ['hero', ...enemy.board.filter(m => m.health > 0).map(m => m.uid)];
        const uid = targets[Math.floor(random(g) * targets.length)];
        const body = enemy.board.find(m => m.uid === uid);
        const victim = body ? cardEntity(body.id, foe, body) : heroEntity(enemy, foe);
        emit(g, { kind: 'spell', side, source: minion.uid, cardId: minion.id, target: { side: foe, uid } });
        dealDamage(g, side, { side: foe, uid }, 1, { uid: minion.uid, cardId: minion.id, poisonous: minion.poisonous,lifesteal:minion.lifesteal });
        log(g, `Предсмертный хрип «${CARD[minion.id].name}» → ${victim.name}: 1 урон.`, side,
          { actor: cardEntity(minion.id, side, minion), target: victim, amount: 1 });
      } else if (deathrattle === 'clawFuryThree') {
        const p = g[side], pool = clawFuryPool(g).filter(c => c.cost === 3);
        const card = pool[Math.floor(random(g) * pool.length)];
        const power = powerEntity(p, side, 'clawFury'), full = p.hand.length >= 10;
        log(g, `Предсмертный хрип «${CARD[minion.id].name}»: бесплатно активирует «Ярость когтей» для карты за 3 маны.`, side,
          { actor: cardEntity(minion.id, side, minion), target: power });
        emit(g, { kind: 'power', side, source: 'hero', cardId: 'claw-fury', target: { side, uid: 'hero' } });
        if (card) {
          addToHand(g, side, card.id);
          log(g, `Ярость когтей: ${card.name} (3 маны) ${full ? 'сгорает — рука полна' : 'добавлена в руку'}.`, side,
            { kind: 'discover', actor: power, target: cardEntity(card.id, side) });
        }
        dealDamage(g, side, { side, uid: 'hero' }, 3, { cardId: 'claw-fury' });
        log(g, 'Ярость когтей: 3 урона своему герою.', side, { kind: 'power', actor: power, hero: heroEntity(p, side), target: heroEntity(p, side), amount: 3 });
      } else if(deathrattle) {
        const token = summon(g, side, deathrattle, undefined, minion.id,{position:deathPosition(g,entry)});
        emit(g, { kind: 'spell', side, source: minion.uid, cardId: minion.id, target: { side, uid: token?.uid ?? 'hero' } });
        log(g, `Предсмертный хрип «${CARD[minion.id].name}»: ${token ? `призывает ${CARD[deathrattle].name} ${token.attack}/${token.health}${token.taunt ? ' с провокацией' : ''}` : 'призыв не сработал — на столе нет места'}.`, side,
          { actor: cardEntity(minion.id, side, minion), target: token ? cardEntity(deathrattle, side, token) : undefined });
      }
      for(let i=0;i<Math.min((minion.adaptSpores??0)*2,boardLimit(g));i++){const plant=summon(g,side,'adapt-plant',undefined,minion.id,{position:deathPosition(g,entry)});if(!plant)break;log(g,'Живые споры: призвано Растение 1/1.',side,{actor:cardEntity(minion.id,side,minion),target:cardEntity(plant.id,side,plant)});}
    }
  }
  for (const { side, minion, before, source } of refreshAuras(g)) {
    log(g, `Аура «${CARD[source].name}»: ${CARD[minion.id].name}, атака ${before} → ${minion.attack} (бонус +${minion.auraBonus}).`, side,
      { actor: cardEntity(source, side), target: cardEntity(minion.id, side, minion) });
  }
  if (g.player.health <= 0 && g.bot.health <= 0) g.winner = 'draw';
  else if (g.player.health <= 0) g.winner = 'bot';
  else if (g.bot.health <= 0) g.winner = 'player';
  if (g.winner) {delete g.discovery;delete g.adaptation;}
  else if(g.adaptation){const a=g.adaptation;a.targets=a.targets.filter(t=>g[t.side].board.some(m=>m.uid===t.uid&&m.health>0));if(!a.targets.length){delete g.adaptation;if(a.continuation)custom.continue(g,a.side,a.sourceId,a.continuation,a.selected);resolve(g);}}
}
function addToHand(g: Game, side: Side, id: string) {
  if (g[side].hand.length < 10) g[side].hand.push({ id, uid: g.nextUid++ });
  else log(g, `Рука полна: ${CARD[id].name} сгорает.`, side, { kind: 'discard', actor: cardEntity(id, side) });
}
function draw(g: Game, side: Side, n = 1) {
  for (let i = 0; i < n; i++) {
    const p = g[side];
    const id = p.deck.shift();
    if (id) {
      const count = p.hand.length;
      addToHand(g, side, id);
      if (p.hand.length > count) emit(g, { kind: 'draw', side, cardId: id, target: { side, uid: p.hand.at(-1)!.uid } });
    }
    else {
      p.fatigue++;
      dealDamage(g, side, { side, uid: 'hero' }, p.fatigue);
      log(g, `Усталость: ${p.fatigue} урона.`, side);
    }
    resolve(g);
    if (g.winner) break;
  }
}
function summon(g: Game, side: Side, id: string, source?: number | 'hero', createdBy?: string,options:{position?:number;health?:number;reborn?:boolean}={}): Minion | undefined {
  if (g[side].board.length >= boardLimit(g)) return;
  const c = CARD[id];
  const m: Minion = { ...keywordState(c, g.turn), attacksThisTurn: 0, id, uid: g.nextUid++, attack: c.attack ?? 0, health: c.health ?? 1,
    maxHealth: c.health ?? 1, ready: !!(c.charge || c.rush), charge: !!c.charge, rush: !!c.rush, enteredTurn: g.turn, attackedThisTurn: false, taunt: !!c.taunt, stealth: !!c.stealth, cannotAttack: !!c.cannotAttack,
    silenced: false, ephemeral: c.effect === 'deathwing', origin: typeof source === 'number' ? 'played' : 'summoned', createdBy };
  if(options.health!==undefined)m.health=options.health;
  if(options.reborn!==undefined)m.reborn=options.reborn;
  g[side].board.splice(options.position??g[side].board.length,0,m);
  emit(g, { kind: 'summon', side, source, target: { side, uid: m.uid }, cardId: id });
  custom.record(g, { kind: 'summon', side, cardId: id, uid: m.uid });
  const quest = g[side].quest;
  if (quest?.id === 'rash-quest' && matchesCard(c, { tag: 'РДШ' })) {
    quest.progress++;
    log(g, `Задача «Сам ты говно»: призвано РДШ ${quest.progress}/8.`, side, { actor: cardEntity('rash-quest', side), target: cardEntity(id, side, m) });
    if (quest.progress >= 8) {
      delete g[side].quest;
      const full = g[side].hand.length >= 10;
      addToHand(g, side, 'volunteer');
      log(g, `Задача выполнена! Награда: Волонтер-босс ${full ? 'сгорает — рука полна' : 'в руку'}.`, side, { actor: cardEntity('rash-quest', side), target: cardEntity('volunteer', side) });
    }
  }
  return m;
}
function emptyPlayer(hero: string, power = 'spark'): Player {
  return { health: 30, armor: 0, mana: 0, maxMana: 0, hand: [], deck: [], board: [],
    fatigue: 0, hero, power, powerUsed: false, powerSilenceTurns: 0, metrics: emptyMetrics() };
}
function adapt(g:Game,choice:Omit<AdaptationChoice,'options'>){if(!choice.targets.length)return;g.adaptation={...choice,options:adaptationOptions(()=>random(g))};log(g,`Адаптация: выберите улучшение (${choice.targets.length} существ).`,choice.side,{actor:cardEntity(choice.sourceId,choice.side)});}
const custom = createCustomEngine({ random, log, emit, dealDamage, destroy, summon, draw, addToHand, boardLimit, reveal,adapt });
export function createGame(deck = STARTER_DECK, seed = Date.now(), opponentDeck = BOT_DECK, mulliganDeadline?: number, classes: { player?: HeroClass; bot?: HeroClass } = {}): Game {
  const playerClass = HERO_CLASSES[classes.player ?? 'mage'], botClass = classes.bot ? HERO_CLASSES[classes.bot] : undefined;
  const g: Game = { id: String(seed), rashDeaths: 0, events: [], player: emptyPlayer(playerClass.hero, playerClass.power), bot: emptyPlayer(botClass?.hero ?? 'boris', botClass?.power ?? 'spark'), active: 'player', turn: 1,
    winner: null, nextUid: 1, rng: seed, log: [], nextLog: 1, customCards: packForCards([...deck, ...opponentDeck], 'match') };
  g.player.deck = shuffled(g, deckError(deck, classes.player ?? 'mage') ? classDeck(STARTER_DECK, classes.player ?? 'mage') : deck);
  g.bot.deck = shuffled(g, deckError(opponentDeck, classes.bot ?? 'mage') ? classDeck(BOT_DECK, classes.bot ?? 'mage') : opponentDeck);
  for (const side of ['player', 'bot'] as Side[]) {
    const p = g[side], openingSize = mulliganDeadline !== undefined ? 3 : side === 'player' ? 3 : 4;
    // Reserve quests before other guaranteed cards, then deal the random
    // remainder. Move the actual copy out of the deck; never create an extra.
    const guaranteed = [...new Set(p.deck.filter(id => CARD[id].quest)), ...new Set(p.deck.filter(id => CARD[id].editor?.startInHand)), 'casino'];
    for (const id of guaranteed.slice(0, openingSize)) {
      const i = p.deck.indexOf(id);
      if (i >= 0) addToHand(g, side, p.deck.splice(i, 1)[0]);
    }
    draw(g, side, openingSize - p.hand.length);
  }
  if (mulliganDeadline !== undefined) {
    g.mulligan = { deadline: mulliganDeadline, ready: { player: false, bot: false }, selected: { player: [], bot: [] } };
    log(g, 'Выберите стартовую руку. Можно заменить любые из трёх карт.', 'system');
  } else {
    g.player.maxMana = 1; g.player.mana = 1; draw(g, 'player');
    log(g, 'Добро пожаловать в трактир! Вы ходите первым.', 'system');
  }
  return g;
}

function finishMulligan(g: Game) {
  for (const side of ['player', 'bot'] as const) {
    const p = g[side], selected = g.mulligan!.selected[side];
    const outgoing: HandCard[] = [];
    // Deal first, then shuffle the returned copies into the remaining deck.
    p.hand = p.hand.map(c => {
      if (!selected.includes(c.uid)) return c;
      const id = p.deck.shift();
      if (!id) return c;
      outgoing.push(c);
      const replacement = { id, uid: g.nextUid++ };
      emit(g, { kind: 'draw', side, cardId: id, target: { side, uid: replacement.uid } });
      return replacement;
    });
    if (outgoing.length) p.deck = shuffled(g, [...p.deck, ...outgoing.map(c => c.id)]);
  }
  delete g.mulligan;
  g[g.active].maxMana = g[g.active].mana = 1;
  draw(g, g.active);
  log(g, `Стартовая рука выбрана. ${g[g.active].name ?? (g.active === 'player' ? 'Вы' : 'Борис')} ходит первым.`, 'system');
}
export function expireMulligan(input: Game, now = Date.now()): Game {
  if (!input.mulligan || input.mulligan.deadline > now) return input;
  const g = structuredClone(input); finishMulligan(g); return g;
}
export function targetNeeded(g: Game, uid?: number): boolean {
  if (uid === undefined) return activePower(g, g.active) === 'spark' || customSelectedTargets(g, g.active, powerCardId(activePower(g, g.active))) !== null;
  const card = g[g.active].hand.find(c => c.uid === uid);
  return !!card && (customSelectedTargets(g, g.active, card.id) !== null || ['bolt', 'silence', 'discoverBlast', 'masik'].includes(CARD[card.id].effect ?? '') || CARD[card.id].effect === 'echoMaxim' && g[g.active].board.length > 0);
}
export function abilityTargets(g: Game, uid?: number): Target[] {
  const id = uid === undefined ? powerCardId(activePower(g, g.active)) : g[g.active].hand.find(c => c.uid === uid)?.id;
  if (!id) return [];
  const effect = CARD[id].effect, targets = customSelectedTargets(g, g.active, id);
  const legacy = uid === undefined ? activePower(g, g.active) === 'spark' ? legalTargets(g, 'spark',undefined,id) : null
    : effect === 'bolt' || effect === 'discoverBlast' ? legalTargets(g, 'bolt',undefined,id) : effect === 'silence' ? legalTargets(g, 'silence',undefined,id)
      : effect === 'masik' ? legalTargets(g, 'masik',undefined,id) : effect === 'echoMaxim' && g[g.active].board.length ? legalTargets(g, 'echoMaxim') : null;
  return targets && legacy ? targets.filter(t => legacy.includes(t)) : targets ?? legacy ?? [];
}
export function legalTargets(g: Game, action: 'attack' | 'bolt' | 'silence' | 'spark' | 'masik' | 'echoMaxim', attackerUid?: number, sourceId?:string): Target[] {
  const spell=action!=='attack'&&['spell','power'].includes(sourceId?CARD[sourceId].kind:action==='masik'||action==='echoMaxim'?'minion':'spell');
  const friendly=g[g.active].board.filter(m=>!spell||!m.elusive);
  const enemies = g[other(g.active)].board.filter(m => !m.stealth && !isImmune(g, other(g.active), m)&&(!spell||!m.elusive));
  if (action === 'echoMaxim') return g[g.active].board.map(m => m.uid);
  if (action === 'masik') return [...(isImmune(g, other(g.active)) ? [] : ['hero' as const]), 'own-hero', ...friendly.map(m => m.uid), ...enemies.map(m => m.uid)];
  if (action === 'silence') return [...friendly, ...enemies].map(m => m.uid);
  if (action === 'spark' || action === 'bolt') return [...(isImmune(g, other(g.active)) ? [] : ['hero' as const]), ...(action === 'spark' ? ['own-hero' as const] : []), ...friendly.map(m => m.uid), ...enemies.map(m => m.uid)];
  const taunts = enemies.filter(m => m.taunt);
  if (action === 'attack' && taunts.length) return taunts.map(m => m.uid);
  const attacker = g[g.active].board.find(m => m.uid === attackerUid);
  if (action === 'attack' && attacker?.rush && !attacker.charge && attacker.enteredTurn === g.turn) return enemies.map(m => m.uid);
  return [...(isImmune(g, other(g.active)) ? [] : ['hero' as const]), ...enemies.map(m => m.uid)];
}
export function act(input: Game, side: Side, action: Action): Result { return applyAction(input, side, action, false); }
// Search uses already registered definitions and omits picture bytes from its private copies.
export function simulateAction(input: Game, side: Side, action: Action): Result { return applyAction(input, side, action, true); }
function applyAction(input: Game, side: Side, action: Action, simulation: boolean): Result {
  if (!simulation) registerCardPack(input.customCards ?? [], 'match');
  const fail = (error: string): Result => ({ state: input, error });
  if (input.winner) return fail('Матч уже завершён.');
  if (input.casting && action.type !== 'concede') return fail('Дождитесь завершения розыгрыша карты.');
  if (action.type === 'mulligan') {
    if (!input.mulligan) return fail('Стартовая рука уже выбрана.');
    if (input.mulligan.ready[side]) return fail('Вы уже подтвердили стартовую руку.');
    if (action.confirm !== undefined && typeof action.confirm !== 'boolean' || !Array.isArray(action.replace) || action.replace.length > 3 || new Set(action.replace).size !== action.replace.length
      || !action.replace.every(uid => Number.isSafeInteger(uid) && input[side].hand.some(c => c.uid === uid))) return fail('Выберите карты из своей стартовой руки.');
    const g = structuredClone(input);
    g.mulligan!.selected[side] = [...action.replace];
    if (action.confirm !== false) g.mulligan!.ready[side] = true;
    if (g.mulligan!.ready.player && g.mulligan!.ready.bot) finishMulligan(g);
    return { state: g };
  }
  if (input.mulligan && action.type !== 'concede') return fail('Сначала выберите стартовую руку.');
  if (input.active !== side && action.type !== 'concede') return fail('Сейчас ход соперника.');
  if(input.adaptation&&action.type!=='adapt'&&action.type!=='concede')return fail('Сначала выберите адаптацию.');
  if (input.discovery && action.type !== 'discover' && action.type !== 'concede') return fail('Сначала выберите карту раскопки.');
  const g = structuredClone(input);
  if (action.type === 'concede') delete g.casting;
  refreshAuras(g);
  const p = g[side];
  const enemySide = other(side);
  const enemy = g[enemySide];
  let actor: HistoryEntity = heroEntity(p, side);
  let actingHero: HistoryEntity | undefined;
  let actingUid: number | undefined;
  const record = (text: string, details: HistoryDetails = {}) => log(g, text, side, { actor, hero: actingHero, ...details });
  const anchorFor = (target: Target): Anchor => target === 'own-hero' ? { side, uid: 'hero' }
    : { side: target === 'hero' || !p.board.some(m => m.uid === target) ? enemySide : side, uid: target };
  const targetEntity = (target: Target) => {
    const anchor = anchorFor(target), owner = g[anchor.side];
    const minion = owner.board.find(m => m.uid === anchor.uid);
    return anchor.uid === 'hero' ? heroEntity(owner, anchor.side) : cardEntity(minion!.id, anchor.side, minion);
  };
  const hit = (target: Target, n: number) => {
    if (n > 0 && actingUid !== undefined) reveal(g, side, actingUid);
    const anchor = anchorFor(target);
    return dealDamage(g, side, anchor, n, { uid: actingUid, cardId: actor.id, attackingUid: action.type === 'attack' ? actingUid : undefined });
  };
  if (action.type === 'concede') {
    g.winner = enemySide;
    delete g.discovery;delete g.adaptation;
    delete g.mulligan;
    record(side === 'player' ? 'Вы сдались.' : `${p.name ?? 'Соперник'} сдался.`, { kind: 'finish' });
    return { state: g };
  }
  if(action.type==='adapt'){
    const choice=g.adaptation;if(!choice||choice.side!==side||!choice.options.includes(action.option))return fail('Выберите одно из предложенных улучшений.');
    delete g.adaptation;applyAdaptation(g,choice,action.option);actor=cardEntity(choice.sourceId,side);
    record(`Адаптация — ${ADAPTATIONS[action.option].name}: ${ADAPTATIONS[action.option].text}`);
    for(const target of choice.targets)emit(g,{kind:'spell',side,source:choice.sourceUid,cardId:choice.sourceId,target});
    const targets=choice.targets.filter(t=>g[t.side].board.some(m=>m.uid===t.uid&&m.health>0));
    if(choice.remaining>1&&targets.length)adapt(g,{...choice,targets,remaining:choice.remaining-1});
    else if(choice.continuation)custom.continue(g,side,choice.sourceId,choice.continuation,choice.selected);
  } else if (action.type === 'discover') {
    const discovery = g.discovery;
    if (!discovery || discovery.side !== side || !discovery.options.includes(action.cardId)) return fail('Выберите одну из предложенных карт раскопки.');
    actor = CARD[discovery.sourceId].kind === 'power' ? powerEntity(p, side, discovery.sourceId) : cardEntity(discovery.sourceId, side);
    delete g.discovery;
    const fullHand = p.hand.length >= 10;
    addToHand(g, side, action.cardId);
    record(`Раскопка: ${CARD[action.cardId].name} — ${fullHand ? 'копия сгорает: рука полна' : 'копия добавлена в руку'}. Колода не меняется.`, { kind: 'discover', target: cardEntity(action.cardId, side) });
    if (CARD[discovery.sourceId].effect === 'clawFury') {
      const damage = CARD[action.cardId].cost;
      hit('own-hero', damage);
      record(`Ярость когтей: раскопана карта за ${damage} маны — ${damage} урона вашему герою.`, { target: heroEntity(p, side), amount: damage });
    }
    if (CARD[discovery.sourceId].effect === 'discoverBlast' && (!discovery.custom || discovery.custom.afterLegacy) && (discovery.target === 'hero' || [...p.board, ...enemy.board].some(m => m.uid === discovery.target))) {
      const target = targetEntity(discovery.target);
      emit(g, { kind: 'spell', side, source: 'hero', cardId: discovery.sourceId, target: anchorFor(discovery.target) });
      hit(discovery.target, 4);
      record(`${CARD[discovery.sourceId].name} → ${target.name}: 4 урона.`, { target, amount: 4 });
    }
    if (discovery.custom) custom.continue(g, side, discovery.sourceId, discovery.custom, discovery.target);
  } else if (action.type === 'play') {
    const index = p.hand.findIndex(c => c.uid === action.uid);
    if (index < 0) return fail('Карта уже не в руке.');
    const c = CARD[p.hand[index].id];
    if (c.kind !== 'minion' && c.kind !== 'spell' && c.kind !== 'hero') return fail('Эта карта создаётся способностью и не разыгрывается из руки.');
    const cost = cardCost(g, c.id);
    if (p.mana < cost) return fail('Недостаточно маны.');
    if (c.kind === 'minion' && p.board.length >= boardLimit(g)) return fail(`На поле уже ${boardLimit(g)} существ. ${g.briefing ? 'Действует «Держать в курсе».' : ''}`);
    if ((c.effect === 'rashQuest' || cardAbilities(c)?.quest) && p.quest) return fail('Сначала выполните активную задачу.');
    if (targetNeeded(g, action.uid) && (action.target === undefined || !abilityTargets(g, action.uid).includes(action.target))) return fail('Выберите подходящую цель.');
    if (c.effect === 'echoMaxim' && p.board.length && (action.target === undefined || !legalTargets(g, 'echoMaxim').includes(action.target))) return fail('Выберите своё существо для +1 к атаке.');
    if (c.effect === 'bolt' || c.effect === 'silence' || c.effect === 'discoverBlast' || c.effect === 'masik') {
      if (action.target === undefined || !legalTargets(g, c.effect === 'discoverBlast' ? 'bolt' : c.effect,undefined,c.id).includes(action.target)) return fail('Выберите подходящую цель.');
    }
    p.mana -= cost;
    addMetric(p, 'manaSpent', cost);
    addMetric(p, 'cardsPlayed', 1);
    p.hand.splice(index, 1);
    actor = cardEntity(c.id, side);
    record(`Разыграна карта «${c.name}» за ${cost} маны.`, { kind: 'play' });
    const body = c.kind === 'minion' ? summon(g, side, c.id, action.uid, c.id) : undefined;
    actingUid = body?.uid;
    const targetAnchor = action.target !== undefined ? anchorFor(action.target) : { side, uid: 'hero' as const };
    const previousPower = p.power;
    if ((c.kind === 'spell' || c.kind === 'hero' || c.effect === 'masik') && c.effect !== 'discoverBlast') emit(g, { kind: 'spell', side, source: body?.uid ?? action.uid, cardId: c.id, target: targetAnchor });
    switch (c.effect) {
      case 'galinka': {
        const pushkin = summon(g, side, 'pushkin', undefined, 'galinka');
        record(pushkin ? 'Галинка призывает Пушкина 15/15 с провокацией.' : 'Галинка: Пушкин не призван — на столе нет места.', { target: pushkin ? cardEntity('pushkin', side, pushkin) : undefined });
        break;
      }
      case 'jainaVolunteer': {
        const token = summon(g, side, 'rds-helper', undefined, c.id);
        record(token ? 'Джайна-волонтер призывает РДШ 0/2 с провокацией.' : 'Джайна-волонтер: защитник не призван — на столе нет места.', { target: token ? cardEntity(token.id, side, token) : undefined });
        break;
      }
      case 'concede': {
        const target = heroEntity(p, side);
        emit(g, { kind: 'damage', side, target: { side, uid: 'hero' }, amount: p.health, cardId: c.id });
        p.health = 0;
        g.winner = enemySide;
        record(`«Хорошая игра.»: ${side === 'bot' ? 'герой соперника уничтожен. Вы победили.' : 'ваш герой уничтожен. Вы проиграли.'}`, { kind: 'finish', target });
        break;
      }
      case 'casino': {
        if (random(g) < 0.5) {
          const unlucky = random(g) < 0.5 ? side : enemySide;
          const count = Math.floor(g[unlucky].deck.length / 2);
          g[unlucky].deck.splice(0, count);
          record(`Козиныч уничтожает ${count} карт ${unlucky === 'player' ? 'вашей колоды' : 'колоды соперника'}!`, { target: heroEntity(g[unlucky], unlucky), amount: count });
        } else record('Козиныч: ничего не произошло. Сегодня повезло!');
        break;
      }
      case 'trachukcha': p.hero = 'trachukcha'; p.armor += c.armor!; p.power = 'fool'; p.powerUsed = false; p.powerSilenceTurns = 0; if (!c.editor) record(`Трачукча даёт ${c.armor} брони и заменяет силу героя на «Дибильнутый!».`, { target: powerEntity(p, side) }); break;
      case 'maratik': p.hero = 'maratik'; p.armor += c.armor!; p.power = 'oy'; p.powerUsed = false; p.powerSilenceTurns = 0; if (!c.editor) record(`Маратик даёт ${c.armor} брони и заменяет силу героя на «Ой».`, { target: powerEntity(p, side) }); break;
      case 'jaina': p.hero = 'jaina'; p.armor += (c.armor ?? 10); p.power = 'rds'; p.powerUsed = false; p.powerSilenceTurns = 0; if (!c.editor) record(`Джайна даёт 10 брони и «Силу РДШ». Погибло РДШ за матч: ${g.rashDeaths}.`, { target: powerEntity(p, side) }); break;
      case 'purgeZhanna': {
        let removed = 0;
        for (const s of ['player', 'bot'] as Side[]) {
          const before = g[s].deck.length;
          g[s].deck = g[s].deck.filter(id => !(CARD[id].kind === 'minion' && matchesCard(CARD[id], { tag: 'Жанна' })));
          removed += before - g[s].deck.length;
        }
        record(`Максимка удаляет из обеих колод существ «Жанна»: ${removed}.`, { target: cardEntity('zhanna', enemySide), amount: removed });
        break;
      }
      case 'volunteer':
        destroy(g, side, () => true); destroy(g, enemySide, () => true);
        summon(g, side, 'rash-volunteer', undefined, 'volunteer'); summon(g, side, 'rash-volunteer', undefined, 'volunteer');
        record(`Волонтер-босс уничтожает всех, включая себя, и призывает ${p.board.length === 2 ? 'два' : 'один'} РДШ 2/4.`, { target: cardEntity('rash-volunteer', side) });
        break;
      case 'legendaryHand': {
        const legends = customPool(g).filter(card => card.kind === 'minion' && card.rarity === 'legendary').map(card => card.id);
        while (p.hand.length < 10) addToHand(g, side, legends[Math.floor(random(g) * legends.length)]);
        record('Боевой клич «Я»: рука заполнена легендарными существами.');
        break;
      }
      case 'deathwing':
        destroy(g, enemySide, () => true);
        destroy(g, side, m => m.uid !== body?.uid);
        p.hand = [];
        record(`Смертокрыл уничтожает остальных существ и сбрасывает ${side === 'player' ? 'вашу руку' : 'руку соперника'}.`);
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
          record(`Раскопка: ${side === 'player' ? 'вы выбираете' : 'соперник выбирает'} копию одной из ${options.length} карт своей колоды.`, { kind: 'discover' });
        } else {
          record('Раскопка: колода пуста, копия карты не получена.');
          const target = targetEntity(action.target!);
          emit(g, { kind: 'spell', side, source: action.uid, cardId: c.id, target: anchorFor(action.target!) });
          hit(action.target!, 4);
          record(`${c.name} → ${target.name}: 4 урона.`, { target, amount: 4 });
        }
        break;
      }
      case 'bolt': { const target = targetEntity(action.target!); hit(action.target!, 3); record(`Искра хаоса → ${target.name}: 3 урона.`, { target, amount: 3 }); break; }
      case 'heal': { const amount = Math.min(5, 30 - p.health); p.health += amount; record(`Чай с мёдом восстанавливает герою ${amount} здоровья.`, { target: heroEntity(p, side), amount }); break; }
      case 'draw': draw(g, side, 2); record('Гениальный план: попытка добрать 2 карты. При пустой колоде — усталость.'); break;
      case 'paperArmy': {
        for (const owner of [side, enemySide]) {
          let count = 0;
          while (g[owner].board.length < boardLimit(g)) { summon(g, owner, 'paper', undefined, c.id); count++; }
          record(`Армия бумажек: ${owner === side ? 'ваш стол' : 'стол противника'} — призвано Бумажек 2/2: ${count}.`, { target: cardEntity('paper', owner), amount: count });
        }
        break;
      }
      case 'briefing': {
        g.briefing = { remainingTurns: { player: 5, bot: 5 } };
        for (const owner of [side, enemySide]) {
          const board = g[owner].board;
          const keep = board.length ? board[Math.floor(random(g) * board.length)].uid : undefined;
          destroy(g, owner, m => m.uid !== keep);
          g[owner].powerUsed = false;
        }
        record('Держать в курсе: на 5 ходов каждого игрока не больше одного существа. Силы героев заменены на «Взять карту» за 6 маны.');
        break;
      }
      case 'rashQuest': p.quest = { id: 'rash-quest', progress: 0 }; record('Начата задача «Сам ты говно»: призовите 8 РДШ.'); break;
      case 'echoMaxim': {
        const targets: Target[] = ['hero', ...enemy.board.map(m => m.uid)];
        const randomTarget = targets[Math.floor(random(g) * targets.length)];
        const victim = targetEntity(randomTarget);
        emit(g, { kind: 'spell', side, source: body!.uid, cardId: c.id, target: anchorFor(randomTarget) });
        hit(randomTarget, 2);
        record(`Боевой клич «${c.name}» → ${victim.name}: 2 урона.`, { target: victim, amount: 2 });
        const ally = p.board.find(m => m.uid === action.target) ?? body!;
        ally.attack++; ally.attackBuff = (ally.attackBuff ?? 0) + 1;
        emit(g, { kind: 'spell', side, source: body!.uid, cardId: c.id, target: { side, uid: ally.uid } });
        record(`${c.name} даёт +1 к атаке ${CARD[ally.id].name}.`, { target: cardEntity(ally.id, side, ally), amount: 1 });
        break;
      }
      case 'silence':
      case 'masik': {
        const owner = g[targetAnchor.side];
        const label = c.effect === 'masik' ? `Боевой клич «${c.name}»` : c.name;
        if (targetAnchor.uid === 'hero') {
          owner.powerSilenceTurns = 2;
          record(`${label} накладывает немоту на ${targetEntity(action.target!).name}. Сила героя отключена на 2 его хода.`, { target: heroEntity(owner, targetAnchor.side) });
        } else {
          const m = owner.board.find(x => x.uid === targetAnchor.uid)!;
          silenceMinion(g, m);
          record(`${label} накладывает немоту на ${CARD[m.id].name}.`, { target: cardEntity(m.id, targetAnchor.side, m) });
        }
        break;
      }
    }
    const abilities = cardAbilities(c) ?? (c.adapt?{version:1,tags:[],rules:[]}:undefined);
    if (abilities) {
      if (c.kind === 'hero') {
        p.hero = c.id;
        if (!['jaina', 'maratik', 'trachukcha'].includes(c.effect ?? '')) p.armor += c.armor ?? 0;
        p.power = abilities.powerId ? powerKey(abilities.powerId) : previousPower; p.powerUsed = false; p.powerSilenceTurns = 0;
        record('Герой «' + c.name + '»: +' + (c.armor ?? 0) + ' брони. Сила героя: «' + CARD[powerCardId(p.power)].name + '».', { target: powerEntity(p, side) });
      }
      if (abilities.quest) p.quest = { id: c.id, progress: 0 };
      if (g.discovery?.sourceId === c.id) g.discovery.custom = { rules: custom.playRules(c.id), sourceUid: body?.uid, afterLegacy: true };
      else custom.play(g, side, c.id, body?.uid, action.target);
    }
    custom.record(g, { kind: 'play', side, cardId: c.id, uid: body?.uid });
    if (c.echo) {
      const full = p.hand.length >= 10;
      addToHand(g, side, c.id);
      if (!full) p.hand[p.hand.length - 1].expiresTurn = g.turn;
      record(`Эхо: копия «${c.name}» ${full ? 'сгорает — рука полна' : 'добавлена в руку до конца хода'}.`);
    }
  } else if (action.type === 'attack') {
    const m = p.board.find(x => x.uid === action.uid);
    if (!m || !m.ready || m.cannotAttack || m.attack <= 0) return fail('Это существо пока не может атаковать.');
    if (!legalTargets(g, 'attack', m.uid).includes(action.target)) return fail(m.rush && m.enteredTurn === g.turn && action.target === 'hero' ? 'Натиск позволяет сразу атаковать только существ. Героя можно атаковать со следующего своего хода.' : 'Сначала атакуйте существо с провокацией.');
    const defender = action.target === 'hero' ? null : enemy.board.find(x => x.uid === action.target)!;
    const defenderIndex = defender ? enemy.board.indexOf(defender) : -1;
    const splash = defender && CARD[m.id].bulky && !m.silenced ? [enemy.board[defenderIndex - 1], enemy.board[defenderIndex + 1]].filter((neighbor): neighbor is Minion => !!neighbor && neighbor.health > 0) : [];
    const splashDamage = Math.ceil(m.attack / 2);
    actor = cardEntity(m.id, side, m); actingUid = m.uid;
    const victim = targetEntity(action.target);
    emit(g, { kind: 'attack', side, source: m.uid, target: anchorFor(action.target), cardId: m.id });
    const dealt = hit(action.target, m.attack);
    const returned = defender ? dealDamage(g, enemySide, { side, uid: m.uid }, defender.attack, { uid: defender.uid, cardId: defender.id, poisonous: defender.poisonous,lifesteal:defender.lifesteal, attackingUid: m.uid }) : undefined;
    if (splashDamage > 0) for (const neighbor of splash) {
      emit(g, { kind: 'spell', side, source: m.uid, target: { side: enemySide, uid: neighbor.uid }, cardId: m.id });
      hit(neighbor.uid, splashDamage);
      record(`Громоздкий: ${CARD[m.id].name} → ${CARD[neighbor.id].name}: ${splashDamage} урона.`, { target: cardEntity(neighbor.id, enemySide, neighbor), amount: splashDamage });
    }
    m.attacksThisTurn = attacksUsed(m) + 1;
    m.ready = m.attacksThisTurn < (m.windfury ? 2 : 1);
    m.attackedThisTurn = true;
    record(`${CARD[m.id].name} → ${defender ? CARD[defender.id].name : side === 'player' ? 'герой соперника' : 'ваш герой'}: ${dealt} урона.${defender ? ` Ответный удар ${CARD[defender.id].name}: ${returned} урона.` : ''}`, { kind: 'attack', target: victim, amount: dealt, retaliation: returned });
  } else if (action.type === 'power') {
    const power = activePower(g, side);
    const cost = powerCost(power, g, side);
    const problem = powerProblem(g, side);
    if (problem) return fail(problem);
    if (targetNeeded(g) && (action.target === undefined || !abilityTargets(g).includes(action.target))) return fail('Выберите подходящую цель силы героя.');
    if (power === 'spark' && (action.target === undefined || !legalTargets(g, 'spark').includes(action.target))) return fail('Выберите персонажа для Искры.');
    p.powerUsed = true;
    p.mana -= cost;
    addMetric(p, 'manaSpent', cost);
    const powerId = powerCardId(power);
    actor = powerEntity(p, side, power); actingHero = heroEntity(p, side);
    emit(g, { kind: 'power', side, source: 'hero', target: power === 'spark' ? anchorFor(action.target!) : { side, uid: 'hero' }, cardId: powerId });
    if (power === 'spark') { const target = targetEntity(action.target!); hit(action.target!, 1); record(`Сила героя «Искра» → ${target.name}: 1 урон.`, { kind: 'power', target, amount: 1 }); }
    if (power === 'armor') { p.armor += 2; record('Сила героя «Поднять щит!»: +2 брони.', { kind: 'power', target: heroEntity(p, side), amount: 2 }); }
    if (power === 'lifeTap') {
      hit('own-hero', 2);
      record('Сила героя «Жизнеотвод»: 2 урона вашему герою, добор одной карты.', { kind: 'power', target: heroEntity(p, side), amount: 2 });
      draw(g, side);
    }
    if (CARD[powerId].effect === 'clawFury') {
      const pool = clawFuryPool(g);
      const options = [3, 5, 7].flatMap(price => {
        const cards = pool.filter(c => c.cost === price);
        return cards.length ? [cards[Math.floor(random(g) * cards.length)].id] : [];
      });
      g.discovery = { side, sourceId: powerId, options, target: 'hero' };
      record('Ярость когтей: выберите карту за 3, 5 или 7 маны. Ваш герой получит урон, равный её стоимости.', { kind: 'power' });
    }
    if (power === 'oy') { addToHand(g, side, 'deathwing'); record('Ой! Смертокрыл добавлен в руку.', { kind: 'power', target: cardEntity('deathwing', side) }); }
    if (power === 'rds') { summon(g, side, 'rash', 'hero', 'rds-power'); record('Сила РДШ призывает РДШ 2/5.', { kind: 'power', target: cardEntity('rash', side) }); }
    if (power === 'storm') {
      const elemental = summon(g, side, 'storm-elemental', 'hero', 'storm-power');
      record('Зов бури призывает элементаля бури 2/1.', { kind: 'power', target: elemental ? cardEntity('storm-elemental', side, elemental) : undefined });
    }
    if (power === 'briefing') { const id = p.deck[0]; draw(g, side); record('Сила героя «Взять карту»: добор одной карты.', { kind: 'power', target: id ? cardEntity(id, side) : undefined }); }
    if (CARD[powerId].editor) {
      if (g.discovery?.sourceId === powerId) g.discovery.custom = { rules: CARD[powerId].editor!.rules.filter(r => r.trigger === 'play'), afterLegacy: true };
      else custom.play(g, side, powerId, undefined, action.target);
    }
    if (power === 'fool') {
      const pool = customPool(g).filter(c => c.kind === 'minion' && c.effect !== 'concede');
      enemy.board = enemy.board.map(m => {
        const cost = Math.max(0, CARD[m.id].cost - 5);
        let options = pool.filter(c => c.cost === cost);
        // A future sparse card pool uses the closest lower cost when an exact one is absent.
        if (!options.length) {
          const cheaper = pool.filter(c => c.cost <= cost);
          const lower = cheaper.length ? Math.max(...cheaper.map(c => c.cost)) : Math.min(...pool.map(c => c.cost));
          options = pool.filter(c => c.cost === lower);
        }
        const c = options[Math.floor(random(g) * options.length)];
        record(`Дибильнутый!: ${CARD[m.id].name} (${CARD[m.id].cost} маны) → ${c.name} (${c.cost} маны). Боевой клич результата не срабатывает.`, { kind: 'transform', target: cardEntity(m.id, enemySide, m), result: cardEntity(c.id, enemySide) });
        emit(g, { kind: 'transform', side, source: 'hero', target: { side: enemySide, uid: m.uid }, cardId: c.id });
        return { ...keywordState(c, g.turn), attacksThisTurn: attacksUsed(m), id: c.id, uid: g.nextUid++, attack: c.attack!, health: c.health!, maxHealth: c.health!, ready: m.ready || !!(c.charge || c.rush) && !m.attackedThisTurn, charge: !!c.charge, rush: !!c.rush, enteredTurn: m.enteredTurn ?? g.turn - 1, attackedThisTurn: m.attackedThisTurn ?? false,
          taunt: !!c.taunt, stealth: !!c.stealth, cannotAttack: !!c.cannotAttack, silenced: false, ephemeral: c.effect === 'deathwing', origin: 'transformed', createdBy: 'fool-power' };
      });
      record('Дибильнутый! Все существа противника превращены в случайных на 5 маны дешевле.', { kind: 'power' });
    }
  } else if (action.type === 'end') {
    custom.record(g, { kind: 'turnEnd', side });
    resolve(g);
    if (g.winner) return { state: g };
    p.hand = p.hand.filter(h => {
      if (h.expiresTurn === undefined || h.expiresTurn > g.turn) return true;
      log(g, `Копия эха «${CARD[h.id].name}» исчезает в конце хода.`, side, { kind: 'discard', actor: cardEntity(h.id, side) });
      return false;
    });
    if (g.briefing) {
      g.briefing.remainingTurns[side] = Math.max(0, g.briefing.remainingTurns[side] - 1);
      if (g.briefing.remainingTurns.player === 0 && g.briefing.remainingTurns.bot === 0) {
        delete g.briefing;
        record('Держать в курсе закончилось: снова до 7 существ и прежние силы героев.');
      }
    }
    if (p.powerSilenceTurns) {
      p.powerSilenceTurns--;
      if (p.powerSilenceTurns === 0) record('Немота героя закончилась. Сила героя снова доступна.', { target: powerEntity(p, side) });
    }
    const expired = p.board.filter(m => m.ephemeral);
    destroy(g, side, m => m.ephemeral);
    if (expired.length) log(g, 'Смертокрыл распыляется в конце хода.', side);
    expireImmunity(g);
    g.active = enemySide;
    g.turn++;
    for(const m of enemy.board)if(m.stealthUntilTurn!==undefined&&m.stealthUntilTurn<=g.turn){reveal(g,enemySide,m.uid);}
    enemy.maxMana = Math.min(10, enemy.maxMana + 1);
    enemy.mana = enemy.maxMana;
    enemy.powerUsed = false;
    enemy.board.forEach(m => { m.ready = true; m.attackedThisTurn = false; m.attacksThisTurn = 0; });
    custom.record(g, { kind: 'turnStart', side: enemySide });
    resolve(g);
    if (g.winner) return { state: g };
    log(g, enemySide === 'player' ? 'Ваш ход.' : `Ход: ${g[enemySide].name ?? 'Борис'}.`, 'system');
    draw(g, enemySide);
  }
  resolve(g);
  return { state: g };
}
export { chooseBotAction } from './bot-ai';
