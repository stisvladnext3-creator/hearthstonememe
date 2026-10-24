import { describe, expect, it } from 'vitest';
import { CARD } from './cards';
import { act, activePower, boardLimit, chooseBotAction, createGame, legalTargets, other, powerProblem, targetNeeded, type Game, type Minion, type Side, type Target } from './engine';

function setup(side: Side = 'player') {
  const g = createGame(undefined, 510); g.active = side;
  for (const s of ['player', 'bot'] as const) {
    g[s].hand = []; g[s].board = []; g[s].deck = Array(30).fill('regular');
    g[s].mana = g[s].maxMana = 10;
  }
  return g;
}
function unit(g: Game, side: Side, id = 'regular') {
  const c = CARD[id];
  const m: Minion = { id, uid: g.nextUid++, attack: c.attack!, health: c.health!, maxHealth: c.health!, ready: true,
    taunt: !!c.taunt, cannotAttack: !!c.cannotAttack, silenced: false, ephemeral: c.effect === 'deathwing' };
  g[side].board.push(m); return m;
}
function play(g: Game, side: Side, id: string, target?: Target) {
  const uid = g.nextUid++; g[side].hand.push({ id, uid });
  const n = act(g, side, { type: 'play', uid, target });
  expect(n.error).toBeUndefined(); return n.state;
}
describe.each<Side>(['player', 'bot'])('new mechanics for %s', side => {
  it('paper army fills only empty slots on both sides and applies existing auras', () => {
    const g = setup(side); unit(g, side, 'vasiliy'); unit(g, other(side), 'guardian');
    const n = play(g, side, 'paper-army');
    expect(n[side].board).toHaveLength(7); expect(n[other(side)].board).toHaveLength(7);
    expect(n[side].board.filter(m => m.id === 'paper').every(m => m.attack === 4 && m.health === 2 && !m.ready)).toBe(true);
    expect(n[other(side)].board.filter(m => m.id === 'paper').every(m => m.attack === 2)).toBe(true);
  });
  it('briefing destroys excess creatures, counts RASH deaths and removes dead auras', () => {
    const g = setup(side); g.rng = 0;
    for (const owner of [side, other(side)]) { unit(g, owner, 'rash'); unit(g, owner, 'vasiliy'); unit(g, owner, 'regular'); }
    const n = play(g, side, 'briefing');
    expect(boardLimit(n)).toBe(1); expect(n[side].board).toHaveLength(1); expect(n[other(side)].board).toHaveLength(1);
    expect(n.events.filter(e => e.kind === 'death')).toHaveLength(4);
    expect(n.rashDeaths).toBe(n.events.filter(e => e.kind === 'death' && e.cardId === 'rash').length);
    for (const owner of [side, other(side)]) {
      const m = n[owner].board[0]; expect(m.attack).toBe(CARD[m.id].attack! + (m.id === 'vasiliy' ? 2 : 0));
    }
  });
  it('one-slot limit rejects a minion before spending resources or triggering battlecry', () => {
    let g = setup(side); unit(g, side); g = play(g, side, 'briefing'); g[side].mana = 10;
    const uid = g.nextUid++; g[side].hand = [{ id: 'deathwing', uid }];
    const n = act(g, side, { type: 'play', uid });
    expect(n.error).toContain('Держать в курсе'); expect(n.state).toBe(g); expect(g[side].mana).toBe(10);
  });
  it('every summon respects briefing, including paper army, Galinka and volunteer', () => {
    for (const id of ['paper-army', 'galinka', 'volunteer']) {
      const g = setup(side); g.briefing = { remainingTurns: { player: 3, bot: 3 } };
      const n = play(g, side, id);
      expect(n[side].board).toHaveLength(1);
      if (id === 'paper-army') expect(n[other(side)].board).toHaveLength(1);
      if (id === 'galinka') expect(n[side].board[0].id).toBe('galinka');
      if (id === 'volunteer') expect(n[side].board[0].id).toBe('rash-volunteer');
    }
  });
  it('lasts five own turns per side, then restores both underlying hero powers', () => {
    const g = setup(side); g[side].power = 'oy'; g[other(side)].power = 'rds';
    let n = play(g, side, 'briefing');
    for (let i = 0; i < 10; i++) {
      expect(n.briefing?.remainingTurns[side]).toBe(5 - Math.ceil(i / 2));
      expect(n.briefing?.remainingTurns[other(side)]).toBe(5 - Math.floor(i / 2));
      expect(activePower(n, 'player')).toBe('briefing'); expect(activePower(n, 'bot')).toBe('briefing');
      n = act(n, n.active, { type: 'end' }).state;
    }
    expect(n.briefing).toBeUndefined(); expect(boardLimit(n)).toBe(7);
    expect(activePower(n, side)).toBe('oy'); expect(activePower(n, other(side))).toBe('rds');
  });
  it('recasting refreshes the duration without losing the real power', () => {
    const g = setup(side); g.briefing = { remainingTurns: { player: 1, bot: 1 } }; g[side].power = 'fool';
    const n = play(g, side, 'briefing'); expect(n.briefing?.remainingTurns).toEqual({ player: 5, bot: 5 }); expect(n[side].power).toBe('fool');
  });
  it('hero replacement changes the underlying power while briefing remains active', () => {
    const g = setup(side); g.briefing = { remainingTurns: { player: 0, bot: 0 } }; g.briefing.remainingTurns[side] = 1;
    const n = play(g, side, 'maratik'); expect(activePower(n, side)).toBe('briefing');
    const ended = act(n, side, { type: 'end' }).state;
    expect(activePower(ended, side)).toBe('oy');
  });
  it('temporary draw power spends six mana, draws once and obeys hero silence', () => {
    const g = setup(side); g.briefing = { remainingTurns: { player: 3, bot: 3 } }; g[side].power = 'rds';
    expect(targetNeeded(g)).toBe(false);
    const n = act(g, side, { type: 'power' }); expect(n.error).toBeUndefined();
    expect(n.state[side].mana).toBe(4); expect(n.state[side].hand).toHaveLength(1); expect(n.state[side].deck).toHaveLength(29);
    expect(n.state[side].board).toHaveLength(0); expect(n.state.log.at(-1)?.actor?.id).toBe('briefing-power');
    expect(act(n.state, side, { type: 'power' }).error).toBeTruthy();
    g[side].powerSilenceTurns = 2; expect(powerProblem(g, side)).toContain('немотой');
    expect(act(g, side, { type: 'power' }).state).toBe(g);
  });
  it('draw power handles full hand and lethal fatigue', () => {
    const full = setup(side); full.briefing = { remainingTurns: { player: 3, bot: 3 } };
    full[side].hand = Array.from({ length: 10 }, () => ({ id: 'regular', uid: full.nextUid++ }));
    const burned = act(full, side, { type: 'power' }).state;
    expect(burned[side].hand).toHaveLength(10); expect(burned[side].deck).toHaveLength(29);
    expect(burned.log.some(l => l.kind === 'discard')).toBe(true);
    const empty = setup(side); empty.briefing = { remainingTurns: { player: 3, bot: 3 } }; empty[side].deck = []; empty[side].health = 1;
    expect(act(empty, side, { type: 'power' }).state.winner).toBe(other(side));
  });
  it('quest starts at zero, ignores enemy RASH, and rewards exactly the eighth own summon', () => {
    let g = setup(side); unit(g, side, 'rash'); g = play(g, side, 'rash-quest');
    expect(g[side].quest?.progress).toBe(0);
    const foe = other(side); g.active = foe; g[foe].power = 'rds';
    g = act(g, foe, { type: 'power' }).state; expect(g[side].quest?.progress).toBe(0);
    for (let i = 1; i <= 8; i++) {
      g.active = side; g[side].power = 'rds'; g[side].powerUsed = false; g[side].mana = 10; g[side].board = [];
      g = act(g, side, { type: 'power' }).state;
      if (i < 8) expect(g[side].quest?.progress).toBe(i);
    }
    expect(g[side].quest).toBeUndefined(); expect(g[side].hand.filter(h => h.id === 'volunteer')).toHaveLength(1);
    expect(g.log.filter(l => l.text.startsWith('Задача выполнена'))).toHaveLength(1);
  });
  it('quest counts both volunteer summons but not a summon blocked by the field limit', () => {
    for (const limit of [false, true]) {
      const g = setup(side); g[side].quest = { id: 'rash-quest', progress: 0 };
      if (limit) g.briefing = { remainingTurns: { player: 3, bot: 3 } };
      const n = play(g, side, 'volunteer'); expect(n[side].quest?.progress).toBe(limit ? 1 : 2);
    }
  });
  it('duplicate active quest is rejected and a full hand burns the reward', () => {
    const g = setup(side); g[side].quest = { id: 'rash-quest', progress: 7 };
    const uid = g.nextUid++; g[side].hand = [{ id: 'rash-quest', uid }];
    expect(act(g, side, { type: 'play', uid }).state).toBe(g);
    g[side].power = 'rds'; g[side].hand = Array.from({ length: 10 }, () => ({ id: 'regular', uid: g.nextUid++ }));
    const n = act(g, side, { type: 'power' }).state;
    expect(n[side].quest).toBeUndefined(); expect(n[side].hand).toHaveLength(10);
    expect(n.log.some(l => l.kind === 'discard' && l.actor?.id === 'volunteer')).toBe(true);
  });
  it('echo repeats for two mana per copy, buffs the selected ally, and expires only temporary cards', () => {
    const g = setup(side); const ally = unit(g, side, 'guardian');
    g[side].hand = [{ id: 'echo-maxim', uid: g.nextUid++ }]; const original = g[side].hand[0];
    expect(targetNeeded(g, original.uid)).toBe(true); expect(legalTargets(g, 'echoMaxim')).toEqual([ally.uid]);
    let n = act(g, side, { type: 'play', uid: original.uid, target: ally.uid }).state;
    expect(n[side].mana).toBe(8); expect(n[side].board[0].attack).toBe(5);
    const copy = n[side].hand[0]; expect(copy.expiresTurn).toBe(n.turn);
    n = act(n, side, { type: 'play', uid: copy.uid, target: ally.uid }).state;
    expect(n[side].mana).toBe(6); expect(n[side].board[0].attack).toBe(6); expect(n[side].board).toHaveLength(3);
    n[side].hand.push({ id: 'echo-maxim', uid: n.nextUid++ });
    n = act(n, side, { type: 'end' }).state;
    expect(n[side].hand).toHaveLength(1); expect(n[side].hand[0].expiresTurn).toBeUndefined();
  });
  it('echo buffs itself on an empty friendly board, but its battlecry never hits friendly characters', () => {
    for (let seed = 0; seed < 12; seed++) {
      const g = setup(side); g.rng = seed; unit(g, other(side), 'bouncer');
      const n = play(g, side, 'echo-maxim');
      expect(n[side].board[0]).toMatchObject({ attack: 3, health: 2, ready: false }); expect(n[side].health).toBe(30);
      expect(n.log.some(l => l.amount === 2 && l.target?.side === other(side))).toBe(true);
    }
  });
  it('echo requires a legal friendly target before spending resources', () => {
    const g = setup(side); unit(g, side); const enemy = unit(g, other(side));
    const uid = g.nextUid++; g[side].hand = [{ id: 'echo-maxim', uid }];
    for (const target of [undefined, enemy.uid, 'hero' as const, 'own-hero' as const]) {
      const n = act(g, side, { type: 'play', uid, target }); expect(n.error).toBeTruthy(); expect(n.state).toBe(g);
    }
  });
  it('silence removes Maxim attack enchantments while preserving external Vasiliy aura', () => {
    const g = setup(side); const ally = unit(g, side, 'guardian'); unit(g, side, 'vasiliy');
    let n = play(g, side, 'echo-maxim', ally.uid); expect(n[side].board[0].attack).toBe(7);
    n[side].mana = 10; n = play(n, side, 'silence', ally.uid);
    expect(n[side].board[0]).toMatchObject({ attack: 6, attackBuff: 0, auraBonus: 2, silenced: true });
  });
});
it('bot uses the temporary draw power and plays echo with a valid ally target', () => {
  const g = setup('bot'); g.briefing = { remainingTurns: { player: 3, bot: 3 } }; g.bot.mana = 6;
  const action = chooseBotAction(g); expect(action.type).toBe('power'); expect(act(g, 'bot', action).error).toBeUndefined();
  delete g.briefing; g.bot.mana = 10; const ally = unit(g, 'bot');
  const uid = g.nextUid++; g.bot.hand = [{ id: 'echo-maxim', uid }];
  const echo = chooseBotAction(g); expect(echo).toEqual({ type: 'play', uid, target: ally.uid });
  expect(act(g, 'bot', echo).error).toBeUndefined();
});
