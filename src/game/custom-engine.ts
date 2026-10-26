import { grantKeyword, isImmune, keywordState, attacksUsed } from './battle-keywords';
import { CARD, COLLECTIBLE, cardAbilities,cardPlayRules } from './cards';
import { powerKey } from './presentation';
import { matchesCard, type CardFilter, type CustomRule, type RuleTarget } from './custom-schema';
import { cardEntity, heroEntity, type HistoryDetails } from './history';
import type { Anchor, Game, GameEvent, Minion, Side, Target } from './engine';
import type {AdaptationChoice} from './adaptation';
import { ruleDescription } from './custom-cards';

export type CountEvent = 'summon' | 'death' | 'play';
export type CustomCounts = Record<Side, Record<CountEvent, Record<string, number>>>;
export interface CustomContinuation { rules: CustomRule[]; sourceUid?: number; afterLegacy?: boolean }
interface Event { kind: CountEvent | 'turnStart' | 'turnEnd' | 'reveal'; side: Side; cardId?: string; uid?: number; dead?: Minion; revealed?: Minion;rightUids?:number[] }
interface Context { side: Side; id: string; uid?: number; selected?: Target; event?: Event; dead?: Minion }
interface Api {
  adapt:(g:Game,choice:Omit<AdaptationChoice,'options'>)=>void;
  random: (g: Game) => number;
  log: (g: Game, text: string, side: Side, details?: HistoryDetails) => void;
  emit: (g: Game, event: Omit<GameEvent, 'id'>) => void;
  dealDamage: (g: Game, side: Side, target: Anchor, n: number, source?: { uid?: number; cardId?: string; poisonous?: boolean;lifesteal?:boolean }) => number;
  destroy: (g: Game, side: Side, predicate: (m: Minion) => boolean) => void;
  summon: (g: Game, side: Side, id: string, source?: number | 'hero', creator?: string,options?:{position?:number}) => Minion | undefined;
  draw: (g: Game, side: Side, n?: number) => void;
  addToHand: (g: Game, side: Side, id: string) => void;
  boardLimit: (g: Game) => number;
  reveal: (g: Game, side: Side, uid: number) => void;
}
const foe = (side: Side): Side => side === 'player' ? 'bot' : 'player';
const sides = (side: Side, filter: CardFilter) => filter.side === 'friendly' ? [side] : filter.side === 'enemy' ? [foe(side)] : [side, foe(side)];
export function countMatching(g: Game, side: Side, event: CountEvent, filter: CardFilter): number {
  return sides(side, filter).reduce((sum, owner) => sum + Object.entries(g.customCounts?.[owner]?.[event] ?? {}).reduce((n, [id, count]) => n + (CARD[id] && matchesCard(CARD[id], filter) ? count : 0), 0), 0);
}
export function customDiscount(g: Game, id: string, side: Side) {
  const d = cardAbilities(CARD[id])?.discount; return d ? countMatching(g, side, d.event, d.filter) * d.amount : 0;
}
export function customSelectedTargets(g: Game, side: Side, id: string): Target[] | null {
  const rules = cardAbilities(CARD[id])?.rules.filter(r => r.trigger === 'play' && r.target.startsWith('selected')) ?? [];
  if (!rules.length) return null;
  const result = (r: CustomRule): Target[] => {
    const friendly = g[side].board.filter(m => m.health > 0 && (!['spell','power'].includes(CARD[id].kind)||!m.elusive) && matchesCard(CARD[m.id], { tag: r.targetTag, cardId: r.targetCardId })).map(m => m.uid);
    const enemy = g[foe(side)].board.filter(m => m.health > 0 && !m.stealth && !isImmune(g, foe(side), m) && (!['spell','power'].includes(CARD[id].kind)||!m.elusive) && matchesCard(CARD[m.id], { tag: r.targetTag, cardId: r.targetCardId })).map(m => m.uid);
    const heroes = !r.targetTag && !r.targetCardId && !['buff', 'transform', 'devolve','adapt'].includes(r.operation) && (r.operation !== 'grantKeyword' || ['immuneThisTurn','immuneOnOwnTurn'].includes(r.keyword??''));
    return r.target === 'selectedEnemy' ? [...(heroes && !isImmune(g, foe(side)) ? ['hero' as const] : []), ...enemy]
      : r.target === 'selectedFriendly' ? [...(heroes ? ['own-hero' as const] : []), ...friendly]
      : r.target === 'selectedMinion' ? [...friendly, ...enemy] : [...(heroes ? [...(!isImmune(g, foe(side)) ? ['hero' as const] : []), 'own-hero' as const] : []), ...friendly, ...enemy];
  };
  return result(rules[0]).filter(t => rules.every(r => result(r).includes(t)));
}
export function silenceMinion(g: Game, m: Minion) {
  if ((m.charge || m.rush) && !m.silenced && m.enteredTurn === g.turn) m.ready = false;
  m.charge = false; m.rush = false; m.taunt = false; m.cannotAttack = false; m.ephemeral = false; m.silenced = true;
  m.stealth = false;delete m.stealthUntilTurn;m.reborn=false;m.lifesteal=false;m.elusive=false;m.adaptSpores=0;
  m.divineShield = false; m.windfury = false; m.poisonous = false; m.immuneWhileAttacking = false; m.immuneOnOwnTurn = false; delete m.immuneUntilTurn;
  if (attacksUsed(m) >= 1) m.ready = false;
  m.attack -= m.attackBuff ?? 0; m.attackBuff = 0;
  const health = m.healthBuff ?? 0; m.maxHealth -= health; m.health = Math.min(m.health, m.maxHealth); m.healthBuff = 0;
}
export function customPool(g: Game) { return [...COLLECTIBLE, ...g.customCards ?? []].filter(c => c.kind !== 'power' && c.kind !== 'token' && !c.reward); }
export function createCustomEngine(api: Api) {
  const states = new WeakMap<Game, { events: Event[]; steps: number; running: boolean; warned: boolean }>();
  const state = (g: Game) => { let s = states.get(g); if (!s) { s = { events: [], steps: 0, running: false, warned: false }; states.set(g, s); } return s; };
  const spend = (g: Game, side: Side) => {
    const s = state(g); if (++s.steps <= 200) return true;
    if (!s.warned) { s.warned = true; api.log(g, 'Цепочка способностей остановлена после 200 эффектов, чтобы игра продолжила работать.', side); }
    s.events.length = 0; return false;
  };
  const condition = (g: Game, ctx: Context, r: CustomRule) => {
    const c = r.condition; if (!c) return true;
    const amount = ['summon', 'death', 'play'].includes(c.zone) ? countMatching(g, ctx.side, c.zone as CountEvent, c.filter)
      : sides(ctx.side, c.filter).reduce((n, side) => n + g[side][c.zone as 'board' | 'hand' | 'deck'].filter(value => {
        const card = CARD[typeof value === 'string' ? value : value.id];
        return card && matchesCard(card, c.filter) && (!c.filter.excludeSelf || typeof value === 'string' || value.uid !== ctx.uid);
      }).length, 0);
    return amount >= c.minimum;
  };
  function targets(g: Game, ctx: Context, target: RuleTarget, r: CustomRule): Anchor[] {
    const own: Anchor[] = g[ctx.side].board.filter(m => m.health > 0).map(m => ({ side: ctx.side, uid: m.uid }));
    const enemy: Anchor[] = g[foe(ctx.side)].board.filter(m => m.health > 0).map(m => ({ side: foe(ctx.side), uid: m.uid }));
    const hero: Anchor = { side: ctx.side, uid: 'hero' }, enemyHero: Anchor = { side: foe(ctx.side), uid: 'hero' };
    const selected = ctx.selected === undefined ? [] : ctx.selected === 'hero' ? [enemyHero] : ctx.selected === 'own-hero' ? [hero] : [...own, ...enemy].filter(t => t.uid === ctx.selected);
    let result: Anchor[] = target.startsWith('selected') ? selected : target === 'self' ? ctx.uid ? [{ side: ctx.side, uid: ctx.uid }] : [hero]
      : target === 'event' ? ctx.event ? [{ side: ctx.event.side, uid: ctx.event.uid ?? 'hero' }] : []
      : target === 'ownHero' ? [hero] : target === 'enemyHero' ? [enemyHero]
      : target === 'friendlyMinions' || target === 'randomFriendlyMinion' ? own : target === 'enemyMinions' || target === 'randomEnemyMinion' ? enemy
      : target === 'allMinions' ? [...own, ...enemy] : target === 'friendlyCharacters' || target === 'randomFriendly' ? [hero, ...own]
      : target === 'enemyCharacters' || target === 'randomEnemy' ? [enemyHero, ...enemy] : [hero, enemyHero, ...own, ...enemy];
    result = result.filter(t => {
      const m = g[t.side].board.find(m => m.uid === t.uid);
      return (!r.filter.excludeSelf || t.uid !== ctx.uid) && (t.uid === 'hero' ? !r.targetTag && !r.targetCardId : !!m && matchesCard(CARD[m.id], { tag: r.targetTag, cardId: r.targetCardId }));
    });
    if (target.startsWith('random') && result.length) result = [result[Math.floor(api.random(g) * result.length)]];
    return result;
  }
  const entity = (g: Game, t: Anchor) => { const m = g[t.side].board.find(m => m.uid === t.uid); return m ? cardEntity(m.id, t.side, m) : heroEntity(g[t.side], t.side); };
  function record(g: Game, event: Event) {
    if (event.cardId && ['summon', 'death', 'play'].includes(event.kind)) {
      g.customCounts ??= { player: { summon: {}, death: {}, play: {} }, bot: { summon: {}, death: {}, play: {} } };
      const counts = g.customCounts[event.side][event.kind as CountEvent]; counts[event.cardId] = (counts[event.cardId] ?? 0) + 1;
    }
    for (const owner of ['player', 'bot'] as Side[]) {
      const quest = g[owner].quest, q = quest && cardAbilities(CARD[quest.id])?.quest;
      if (!quest || !q || q.event !== event.kind || !event.cardId || event.kind === 'play' && event.cardId === quest.id && event.side === owner
        || !sides(owner, q.filter).includes(event.side) || !matchesCard(CARD[event.cardId], q.filter)) continue;
      quest.progress++;
      api.log(g, 'Задача «' + CARD[quest.id].name + '»: ' + quest.progress + '/' + q.goal + '.', owner, { actor: cardEntity(quest.id, owner) });
      if (quest.progress >= q.goal) {
        const id = quest.id, full = g[owner].hand.length >= 10; delete g[owner].quest; api.addToHand(g, owner, q.rewardId);
        api.log(g, 'Задача «' + CARD[id].name + '» выполнена: «' + CARD[q.rewardId].name + (full ? '» сгорает — рука полна.' : '» в руку.'), owner, { actor: cardEntity(id, owner), target: cardEntity(q.rewardId, owner) });
      }
    }
    state(g).events.push(event);
  }
  function run(g: Game, ctx: Context, rules: CustomRule[]) {
    for (let index = 0; index < rules.length; index++) {
      const r = rules[index];
      if (!condition(g, ctx, r) || !spend(g, ctx.side)) continue;
      if (r.chance < 100 && api.random(g) * 100 >= r.chance) continue;
      const list = targets(g, ctx, r.target, r);
      const owners = r.target === 'ownHero' || r.target === 'friendlyMinions' || r.target === 'friendlyCharacters' ? [ctx.side]
        : r.target === 'enemyHero' || r.target === 'enemyMinions' || r.target === 'enemyCharacters' ? [foe(ctx.side)]
        : r.target === 'allMinions' || r.target === 'allCharacters' ? [ctx.side, foe(ctx.side)] : [...new Set(list.map(t => t.side))];
      const actor = cardEntity(ctx.id, ctx.side, ctx.dead ?? g[ctx.side].board.find(m => m.uid === ctx.uid));
      api.log(g, CARD[ctx.id].name + ': ' + ruleDescription(r), ctx.side, { actor, target: list[0] ? entity(g, list[0]) : undefined, amount: r.amount });
      const n = Math.max(0, r.amount);
      if(r.operation==='adapt'){
        const adapted=list.filter(t=>g[t.side].board.some(m=>m.uid===t.uid&&m.health>0));
        if(adapted.length){api.adapt(g,{side:ctx.side,sourceId:ctx.id,sourceUid:ctx.uid,targets:adapted,remaining:r.count,selected:ctx.selected,continuation:{rules:rules.slice(index+1),sourceUid:ctx.uid}});return;}
        continue;
      }
      if (r.operation === 'discover') {
        let options = [...new Set(g[ctx.side].deck)].filter(id => matchesCard(CARD[id], { tag: r.targetTag, cardId: r.targetCardId }));
        const picks: string[] = [];
        while (options.length && picks.length < 3) { const i = Math.floor(api.random(g) * options.length); picks.push(options[i]); options = options.filter((_, j) => j !== i); }
        if (picks.length) { g.discovery = { side: ctx.side, sourceId: ctx.id, options: picks, target: ctx.selected ?? 'hero', custom: { rules: rules.slice(index + 1), sourceUid: ctx.uid } }; return; }
        continue;
      }
      if (r.operation === 'briefing') {
        g.briefing = { remainingTurns: { player: 5, bot: 5 } };
        for (const side of ['player', 'bot'] as Side[]) {
          const keep = g[side].board[Math.floor(api.random(g) * g[side].board.length)]?.uid;
          api.destroy(g, side, m => m.uid !== keep); g[side].powerUsed = false;
        }
      }
      if (['draw', 'summon', 'addCard', 'shuffle', 'discard', 'purgeDeck', 'armor', 'mana', 'replacePower'].includes(r.operation)) {
        for (const owner of owners) {
          const p = g[owner];
          if (r.operation === 'draw') api.draw(g, owner, r.count);
          if (r.operation === 'armor') p.armor += n;
          if (r.operation === 'mana') p.mana = Math.min(p.maxMana, p.mana + n);
          if (r.operation === 'replacePower') { p.power = powerKey(r.cardId!); p.powerUsed = false; p.powerSilenceTurns = 0; }
          if (r.operation === 'purgeDeck') p.deck = p.deck.filter(id => !matchesCard(CARD[id], { tag: r.targetTag, cardId: r.targetCardId }));
          if (r.operation === 'discard') p.hand.splice(0, r.count);
          for (let i = 0; i < r.count && spend(g, ctx.side); i++) {
            if (r.operation === 'summon') {const right=owner===ctx.side?ctx.event?.rightUids:undefined,index=right?g[owner].board.findIndex(m=>right.includes(m.uid)):-1;api.summon(g, owner, r.cardId!, undefined, ctx.id,{position:index<0?undefined:index});}
            if (r.operation === 'addCard') api.addToHand(g, owner, r.cardId!);
            if (r.operation === 'shuffle' && p.deck.length < 100) p.deck.splice(Math.floor(api.random(g) * (p.deck.length + 1)), 0, r.cardId!);
          }
        }
      }
      for (const target of list) {
        if (!spend(g, ctx.side)) break;
        const p = g[target.side], m = p.board.find(m => m.uid === target.uid);
        if (target.uid !== 'hero' && !m) continue;
        if (['damage', 'heal', 'buff', 'silence', 'destroy', 'transform', 'devolve'].includes(r.operation))
          api.emit(g, { kind: 'spell', side: ctx.side, source: ctx.uid ?? 'hero', target, cardId: ctx.id });
        if (r.operation === 'damage') {
          if (n > 0 && ctx.uid !== undefined) api.reveal(g, ctx.side, ctx.uid);
          api.dealDamage(g, ctx.side, target, n, { uid: ctx.uid, cardId: ctx.id, poisonous: ctx.dead?.poisonous,lifesteal:ctx.dead?.lifesteal });
        }
        if (r.operation === 'grantKeyword' && r.keyword) grantKeyword(g, target.side, target.uid, r.keyword);
        if (r.operation === 'heal') { if (m) m.health = Math.min(m.maxHealth, m.health + n); else p.health = Math.min(30, p.health + n); }
        if (r.operation === 'buff' && m) {
          const before = m.attack; m.attack = Math.max(0, m.attack + r.amount); m.attackBuff = (m.attackBuff ?? 0) + m.attack - before;
          m.health += r.health; m.maxHealth += r.health; m.healthBuff = (m.healthBuff ?? 0) + r.health;
        }
        if (r.operation === 'silence') { if (m) silenceMinion(g, m); else p.powerSilenceTurns = 2; }
        if (r.operation === 'destroy') { if (m) api.destroy(g, target.side, body => body.uid === m.uid); else p.health = 0; }
        if ((r.operation === 'transform' || r.operation === 'devolve') && m) {
          let id = r.cardId;
          if (r.operation === 'devolve') {
            const pool = customPool(g).filter(c => c.kind === 'minion' && c.effect !== 'concede'), cost = Math.max(0, CARD[m.id].cost - n);
            const lower = pool.filter(c => c.cost <= cost);
            const best = lower.length ? Math.max(...lower.map(c => c.cost)) : Math.min(...pool.map(c => c.cost));
            const options = pool.filter(c => c.cost === best); id = options[Math.floor(api.random(g) * options.length)]?.id;
          }
          if (!id) continue;
          const c = CARD[id];
          Object.assign(m, { ...keywordState(c, g.turn), id, attack: c.attack!, health: c.health!, maxHealth: c.health!, auraBonus: 0, attackBuff: 0, healthBuff: 0,
            ready: m.ready || !!(c.charge || c.rush) && !m.attackedThisTurn, charge: !!c.charge, rush: !!c.rush, taunt: !!c.taunt, stealth: !!c.stealth, cannotAttack: !!c.cannotAttack,
            silenced: false, ephemeral: c.effect === 'deathwing', origin: 'transformed', createdBy: ctx.id });
          api.emit(g, { kind: 'transform', side: ctx.side, target, cardId: id });
        }
      }
    }
  }
  function flush(g: Game): boolean {
    const s = state(g); if (s.running || !s.events.length) return false;
    s.running = true; let processed = false;
    try {
      while (s.events.length && s.steps < 200) {
        const event = s.events.shift()!; processed = true;
        if (event.kind === 'reveal') {
          if (event.revealed && !event.revealed.silenced) run(g, { side: event.side, id: event.revealed.id, uid: event.uid, dead: event.revealed, event }, cardAbilities(CARD[event.revealed.id])?.rules.filter(r => r.trigger === 'reveal') ?? []);
          continue;
        }
        if (event.kind === 'death' && event.dead && !event.dead.silenced) run(g, { side: event.side, id: event.dead.id, uid: event.dead.uid, dead: event.dead, event }, cardAbilities(CARD[event.dead.id])?.rules.filter(r => r.trigger === 'death') ?? []);
        const trigger = event.kind === 'death' ? 'died' : event.kind === 'play' ? 'played' : event.kind;
        const listeners: Context[] = (['player', 'bot'] as Side[]).flatMap(side => [
          ...g[side].board.filter(m => !m.silenced && m.health > 0).map(m => ({ side, id: m.id, uid: m.uid, event })),
          ...(cardAbilities(CARD[g[side].hero]) ? [{ side, id: g[side].hero, event }] : []),
        ]);
        for (const ctx of listeners) {
          const rules = cardAbilities(CARD[ctx.id])?.rules.filter(r => r.trigger === trigger && sides(ctx.side, r.filter).includes(event.side)
            && (!r.filter.excludeSelf || event.uid !== ctx.uid) && (!event.cardId ? !r.filter.tag && !r.filter.cardId : matchesCard(CARD[event.cardId], r.filter))) ?? [];
          if (ctx.uid && !g[ctx.side].board.some(m => m.uid === ctx.uid && m.health > 0 && !m.silenced)) continue;
          run(g, ctx, rules);
        }
      }
      if (s.events.length) spend(g, g.active);
    } finally { s.running = false; }
    return processed;
  }
  function auraBonuses(g: Game, owner: Side, minion: Minion): { id: string; amount: number }[] {
    const bonuses: { id: string; amount: number }[] = [];
    for (const side of ['player', 'bot'] as Side[]) {
      const sources = [...g[side].board.filter(m => !m.silenced && m.health > 0).map(m => ({ side, id: m.id, uid: m.uid })), ...(cardAbilities(CARD[g[side].hero]) ? [{ side, id: g[side].hero }] : [])];
      for (const ctx of sources) for (const r of cardAbilities(CARD[ctx.id])?.rules ?? []) {
        if (r.trigger !== 'aura' || !condition(g, ctx, r) || r.filter.excludeSelf && 'uid' in ctx && ctx.uid === minion.uid) continue;
        if (r.target === 'friendlyMinions' && side !== owner || r.target === 'enemyMinions' && side === owner) continue;
        if (matchesCard(CARD[minion.id], { tag: r.targetTag, cardId: r.targetCardId })) bonuses.push({ id: ctx.id, amount: Math.max(0, r.amount) });
      }
    }
    return bonuses;
  }
  return { record, flush, auraBonus: (g: Game, side: Side, m: Minion) => auraBonuses(g, side, m).reduce((n, a) => n + a.amount, 0),
    auraSource: (g: Game, side: Side, m: Minion) => auraBonuses(g, side, m)[0]?.id,
    playRules:(id:string)=>cardPlayRules(CARD[id]),
    play: (g: Game, side: Side, id: string, uid?: number, selected?: Target) => run(g, { side, id, uid, selected }, cardPlayRules(CARD[id])),
    continue: (g: Game, side: Side, id: string, custom: CustomContinuation, selected?: Target) => run(g, { side, id, uid: custom.sourceUid, selected }, custom.rules),
  };
}
