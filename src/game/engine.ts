import { BOT_DECK, CARD, STARTER_DECK, deckError } from './cards';

export type Side = 'player' | 'bot';
export interface HandCard { uid: number; id: string }
export interface Minion extends HandCard {
  attack: number; health: number; maxHealth: number; ready: boolean;
  taunt: boolean; cannotAttack: boolean; silenced: boolean; ephemeral: boolean;
}
export interface Player {
  health: number; armor: number; mana: number; maxMana: number;
  hand: HandCard[]; deck: string[]; board: Minion[];
  fatigue: number; hero: string; power: 'spark' | 'fool' | 'oy'; powerUsed: boolean;
}
export interface Game {
  id: string;
  player: Player; bot: Player; active: Side; turn: number;
  winner: Side | 'draw' | null; nextUid: number; rng: number;
  log: { id: number; text: string; side: Side | 'system' }[]; nextLog: number;
}
export type Target = number | 'hero';
export type Action =
  | { type: 'play'; uid: number; target?: Target }
  | { type: 'attack'; uid: number; target: Target }
  | { type: 'power'; target?: Target }
  | { type: 'end' }
  | { type: 'concede' };
export interface Result { state: Game; error?: string }
export const other = (side: Side): Side => side === 'player' ? 'bot' : 'player';
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
function log(g: Game, text: string, side: Side | 'system' = g.active) {
  g.log.push({ id: g.nextLog++, text, side });
  g.log = g.log.slice(-80);
}
function damageHero(p: Player, n: number) {
  const absorbed = Math.min(n, p.armor);
  p.armor -= absorbed;
  p.health -= n - absorbed;
}
function resolve(g: Game) {
  for (const side of ['player', 'bot'] as Side[]) g[side].board = g[side].board.filter(m => m.health > 0);
  if (g.player.health <= 0 && g.bot.health <= 0) g.winner = 'draw';
  else if (g.player.health <= 0) g.winner = 'bot';
  else if (g.bot.health <= 0) g.winner = 'player';
}
function addToHand(g: Game, side: Side, id: string) {
  if (g[side].hand.length < 10) g[side].hand.push({ id, uid: g.nextUid++ });
  else log(g, `Рука полна: ${CARD[id].name} сгорает.`, side);
}
function draw(g: Game, side: Side, n = 1) {
  for (let i = 0; i < n; i++) {
    const p = g[side];
    const id = p.deck.shift();
    if (id) addToHand(g, side, id);
    else {
      p.fatigue++;
      damageHero(p, p.fatigue);
      log(g, `Усталость: ${p.fatigue} урона.`, side);
    }
    resolve(g);
    if (g.winner) break;
  }
}
function summon(g: Game, side: Side, id: string): Minion | undefined {
  if (g[side].board.length >= 7) return;
  const c = CARD[id];
  const m: Minion = { id, uid: g.nextUid++, attack: c.attack ?? 0, health: c.health ?? 1,
    maxHealth: c.health ?? 1, ready: false, taunt: !!c.taunt, cannotAttack: !!c.cannotAttack,
    silenced: false, ephemeral: c.effect === 'deathwing' };
  g[side].board.push(m);
  return m;
}
function emptyPlayer(hero: string): Player {
  return { health: 30, armor: 0, mana: 0, maxMana: 0, hand: [], deck: [], board: [],
    fatigue: 0, hero, power: 'spark', powerUsed: false };
}
export function createGame(deck = STARTER_DECK, seed = Date.now()): Game {
  const g: Game = { id: String(seed), player: emptyPlayer('mage'), bot: emptyPlayer('boris'), active: 'player', turn: 1,
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
  return !!card && ['bolt', 'silence'].includes(CARD[card.id].effect ?? '');
}
export function legalTargets(g: Game, action: 'attack' | 'bolt' | 'silence' | 'spark'): Target[] {
  const enemies = g[other(g.active)].board;
  if (action === 'silence') return enemies.map(m => m.uid);
  const taunts = enemies.filter(m => m.taunt);
  if (action === 'attack' && taunts.length) return taunts.map(m => m.uid);
  return ['hero', ...enemies.map(m => m.uid)];
}
export function act(input: Game, side: Side, action: Action): Result {
  const fail = (error: string): Result => ({ state: input, error });
  if (input.winner) return fail('Матч уже завершён.');
  if (input.active !== side && action.type !== 'concede') return fail('Сейчас ход соперника.');
  const g = structuredClone(input);
  const p = g[side];
  const enemySide = other(side);
  const enemy = g[enemySide];
  const hit = (target: Target, n: number) => {
    if (target === 'hero') damageHero(enemy, n);
    else { const m = enemy.board.find(x => x.uid === target); if (m) m.health -= n; }
  };
  if (action.type === 'concede') {
    g.winner = enemySide;
    log(g, 'Игрок покинул матч.', side);
    return { state: g };
  }
  if (action.type === 'play') {
    const index = p.hand.findIndex(c => c.uid === action.uid);
    if (index < 0) return fail('Карта уже не в руке.');
    const c = CARD[p.hand[index].id];
    if (p.mana < c.cost) return fail('Недостаточно маны.');
    if (c.kind === 'minion' && p.board.length >= 7) return fail('На поле уже 7 существ.');
    if (c.effect === 'bolt' || c.effect === 'silence') {
      if (action.target === undefined || !legalTargets(g, c.effect).includes(action.target)) return fail('Выберите подходящую цель.');
    }
    p.mana -= c.cost;
    p.hand.splice(index, 1);
    log(g, `Разыграна карта «${c.name}».`, side);
    const body = c.kind === 'minion' ? summon(g, side, c.id) : undefined;
    switch (c.effect) {
      case 'galinka': summon(g, side, 'pushkin'); log(g, 'Галинка призывает Пушкина 15/15.', side); break;
      case 'concede': p.health = 0; log(g, 'Хорошая игра. Ваш герой уничтожен.', side); break;
      case 'casino': {
        if (random(g) < 0.5) {
          const unlucky = random(g) < 0.5 ? side : enemySide;
          const count = Math.floor(g[unlucky].deck.length / 2);
          g[unlucky].deck.splice(0, count);
          log(g, `Козиныч уничтожает ${count} карт ${unlucky === 'player' ? 'вашей колоды' : 'колоды Бориса'}!`, side);
        } else log(g, 'Козиныч: ничего не произошло. Сегодня повезло!', side);
        break;
      }
      case 'trachukcha': p.hero = 'trachukcha'; p.armor += 99; p.power = 'fool'; p.powerUsed = false; break;
      case 'maratik': p.hero = 'maratik'; p.armor += 5; p.power = 'oy'; p.powerUsed = false; break;
      case 'legendaryHand': {
        const legends = ['galinka', 'me', 'deathwing'];
        while (p.hand.length < 10) addToHand(g, side, legends[Math.floor(random(g) * legends.length)]);
        break;
      }
      case 'deathwing':
        enemy.board = [];
        p.board = body ? [body] : [];
        p.hand = [];
        log(g, 'Смертокрыл уничтожает остальных существ и сбрасывает вашу руку.', side);
        break;
      case 'bolt': hit(action.target!, 3); break;
      case 'heal': p.health = Math.min(30, p.health + 5); break;
      case 'draw': draw(g, side, 2); break;
      case 'silence': {
        const m = enemy.board.find(x => x.uid === action.target)!;
        if (CARD[m.id].immuneSilence) log(g, 'Русланчик всегда прав. Немота не действует.', side);
        else { m.taunt = false; m.cannotAttack = false; m.ephemeral = false; m.silenced = true; }
        break;
      }
    }
  } else if (action.type === 'attack') {
    const m = p.board.find(x => x.uid === action.uid);
    if (!m || !m.ready || m.cannotAttack || m.attack <= 0) return fail('Это существо пока не может атаковать.');
    if (!legalTargets(g, 'attack').includes(action.target)) return fail('Сначала атакуйте существо с провокацией.');
    hit(action.target, m.attack);
    if (action.target !== 'hero') m.health -= enemy.board.find(x => x.uid === action.target)!.attack;
    m.ready = false;
    log(g, `${CARD[m.id].name} атакует: ${m.attack} урона.`, side);
  } else if (action.type === 'power') {
    const cost = p.power === 'oy' ? 6 : 2;
    if (p.powerUsed) return fail('Сила героя уже использована в этом ходу.');
    if (p.mana < cost) return fail('Недостаточно маны для силы героя.');
    if (p.power === 'spark' && (action.target === undefined || !legalTargets(g, 'spark').includes(action.target))) return fail('Выберите врага для Искры.');
    if (p.power === 'oy' && p.hand.length >= 10) return fail('В руке нет места для Смертокрыла.');
    p.powerUsed = true;
    p.mana -= cost;
    if (p.power === 'spark') { hit(action.target!, 1); log(g, 'Искра наносит 1 урон.', side); }
    if (p.power === 'oy') { addToHand(g, side, 'deathwing'); log(g, 'Ой! Смертокрыл добавлен в руку.', side); }
    if (p.power === 'fool') { draw(g, side); damageHero(p, 2); log(g, 'Дибильнутый! Карта взята, герою нанесено 2 урона.', side); }
  } else if (action.type === 'end') {
    const expired = p.board.filter(m => m.ephemeral);
    p.board = p.board.filter(m => !m.ephemeral);
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
  const attacks = p.board.filter(m => m.ready && !m.cannotAttack && m.attack > 0);
  const targets = legalTargets(g, 'attack');
  const totalDamage = attacks.reduce((sum, m) => sum + m.attack, 0);
  if (targets.includes('hero') && totalDamage >= g.player.health + g.player.armor && attacks.length)
    return { type: 'attack', uid: attacks[0].uid, target: 'hero' };
  const playable = p.hand.filter(h => {
    const c = CARD[h.id];
    if (c.cost > p.mana || c.effect === 'concede') return false;
    if (c.kind === 'minion' && p.board.length >= 7) return false;
    if (c.effect === 'heal' && p.health > 25) return false;
    if (c.effect === 'silence' && !g.player.board.some(m => m.taunt && !CARD[m.id].immuneSilence)) return false;
    if (c.effect === 'deathwing' && g.player.board.length <= p.board.length) return false;
    return true;
  }).sort((a, b) => CARD[b.id].cost - CARD[a.id].cost);
  if (playable.length) {
    const card = playable[0];
    const effect = CARD[card.id].effect;
    let target: Target | undefined;
    if (effect === 'bolt') target = [...g.player.board].filter(m => m.health <= 3).sort((a, b) => b.attack - a.attack)[0]?.uid ?? 'hero';
    if (effect === 'silence') target = g.player.board.find(m => m.taunt && !CARD[m.id].immuneSilence)!.uid;
    return { type: 'play', uid: card.uid, target };
  }
  if (attacks.length) {
    const attacker = attacks[0];
    const favorable = g.player.board.filter(m => targets.includes(m.uid) && m.health <= attacker.attack && m.attack < attacker.health).sort((a, b) => b.attack - a.attack)[0];
    return { type: 'attack', uid: attacker.uid, target: favorable?.uid ?? (targets.includes('hero') ? 'hero' : targets[0]) };
  }
  if (!p.powerUsed && p.mana >= (p.power === 'oy' ? 6 : 2) && !(p.power === 'oy' && p.hand.length >= 10)) {
    const weak = g.player.board.find(m => m.health === 1);
    return { type: 'power', target: weak?.uid ?? 'hero' };
  }
  return { type: 'end' };
}
