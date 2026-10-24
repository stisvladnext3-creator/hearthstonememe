import { describe, expect, it } from 'vitest';
import { CARD } from './cards';
import { act, chooseBotAction, createGame, legalTargets, other, powerProblem, type Game, type Minion, type Side, type Target } from './engine';

function setup(side: Side) {
  const g = createGame(undefined, 811); g.active = side;
  for (const p of [g.player, g.bot]) { p.mana = p.maxMana = 10; p.hand = []; p.board = []; p.health = 30; p.armor = 0; }
  return g;
}
function creature(g: Game, side: Side, id: string): Minion {
  const c = CARD[id]; const m: Minion = { id, uid: g.nextUid++, attack: c.attack!, health: c.health!, maxHealth: c.health!,
    ready: true, taunt: !!c.taunt, cannotAttack: !!c.cannotAttack, silenced: false, ephemeral: false };
  g[side].board.push(m); return m;
}
function play(g: Game, side: Side, id: string, target?: Target) {
  const uid = g.nextUid++; g[side].hand.push({ id, uid });
  const result = act(g, side, { type: 'play', uid, target });
  expect(result.error).toBeUndefined(); return result.state;
}
describe.each<Side>(['player', 'bot'])('Масик controlled by %s', side => {
  it('silences a taunt and charges the hero immediately, only once', () => {
    const g = setup(side), foe = other(side); const defender = creature(g, foe, 'guardian');
    const n = play(g, side, 'masik', defender.uid), masik = n[side].board[0];
    expect(n[side].mana).toBe(3); expect(masik).toMatchObject({ attack: 6, health: 4, charge: true, ready: true, enteredTurn: g.turn });
    expect(n[foe].board[0]).toMatchObject({ taunt: false, silenced: true });
    expect(n.log.at(-1)).toMatchObject({ actor: { id: 'masik', side }, target: { id: 'guardian', side: foe } });
    const hit = act(n, side, { type: 'attack', uid: masik.uid, target: 'hero' });
    expect(hit.error).toBeUndefined(); expect(hit.state[foe].health).toBe(24);
    expect(hit.state[side].board[0]).toMatchObject({ ready: false, attackedThisTurn: true });
    expect(act(hit.state, side, { type: 'attack', uid: masik.uid, target: 'hero' }).error).toBeTruthy();
  });
  it('still obeys another taunt when the battlecry targets the hero', () => {
    const g = setup(side), foe = other(side); const taunt = creature(g, foe, 'bouncer');
    const n = play(g, side, 'masik', 'hero'), masik = n[side].board[0];
    expect(legalTargets(n, 'attack')).toEqual([taunt.uid]);
    expect(act(n, side, { type: 'attack', uid: masik.uid, target: 'hero' }).error).toBeTruthy();
    const trade = act(n, side, { type: 'attack', uid: masik.uid, target: taunt.uid });
    expect(trade.error).toBeUndefined(); expect(trade.state[foe].board).toHaveLength(0); expect(trade.state[side].board[0].health).toBe(2);
  });
  it('can silence its own Ruslan while retaining its charge', () => {
    const g = setup(side); const friend = creature(g, side, 'ruslan');
    const n = play(g, side, 'masik', friend.uid);
    expect(n[side].board[0]).toMatchObject({ silenced: true, cannotAttack: false });
    expect(n[side].board[1]).toMatchObject({ id: 'masik', silenced: false, ready: true });
    expect(n.events.find(e => e.kind === 'spell' && e.cardId === 'masik')?.target).toEqual({ side, uid: friend.uid });
  });
  it.each(['spark', 'oy', 'rds', 'fool'] as const)('disables an opposing %s power, preserving health and armor', power => {
    const g = setup(side), foe = other(side); g[foe].power = power; g[foe].armor = 9;
    const n = play(g, side, 'masik', 'hero');
    expect(n[foe]).toMatchObject({ health: 30, armor: 9, power, powerSilenceTurns: 2 });
    const opponentTurn = act(n, side, { type: 'end' }).state;
    expect(powerProblem(opponentTurn, foe)).toContain('отключена немотой');
    const rejected = act(opponentTurn, foe, { type: 'power', target: 'hero' });
    expect(rejected.error).toContain('отключена немотой'); expect(rejected.state).toBe(opponentTurn);
  });
  it('allows its own hero as a target and records the correct side', () => {
    const n = play(setup(side), side, 'masik', 'own-hero');
    expect(n[side].powerSilenceTurns).toBe(2); expect(n[other(side)].powerSilenceTurns).toBe(0);
    expect(n.log.at(-1)?.target).toMatchObject({ type: 'hero', side });
    expect(n.events.find(e => e.cardId === 'masik' && e.kind === 'spell')?.target).toEqual({ side, uid: 'hero' });
  });
  it('expires on an opposing hero only after two turns of that hero', () => {
    const foe = other(side); let n = play(setup(side), side, 'masik', 'hero');
    n = act(n, side, { type: 'end' }).state;
    expect(n[foe].powerSilenceTurns).toBe(2);
    expect(act(n, foe, { type: 'power', target: 'hero' }).error).toContain('немотой');
    n = act(n, foe, { type: 'end' }).state;
    expect(n[foe].powerSilenceTurns).toBe(1);
    n = act(n, side, { type: 'end' }).state;
    expect(act(n, foe, { type: 'power', target: 'hero' }).error).toContain('немотой');
    n = act(n, foe, { type: 'end' }).state;
    expect(n[foe].powerSilenceTurns).toBe(0);
    expect(n.log.some(l => l.text.includes('Немота героя закончилась'))).toBe(true);
    n = act(n, side, { type: 'end' }).state;
    expect(act(n, foe, { type: 'power', target: 'hero' }).error).toBeUndefined();
  });
  it('counts the current turn when its own hero is silenced', () => {
    let n = play(setup(side), side, 'masik', 'own-hero');
    expect(n[side].powerSilenceTurns).toBe(2);
    n = act(n, side, { type: 'end' }).state;
    expect(n[side].powerSilenceTurns).toBe(1);
    n = act(n, other(side), { type: 'end' }).state;
    expect(act(n, side, { type: 'power', target: 'hero' }).error).toContain('немотой');
    n = act(n, side, { type: 'end' }).state;
    expect(n[side].powerSilenceTurns).toBe(0);
    n = act(n, other(side), { type: 'end' }).state;
    expect(act(n, side, { type: 'power', target: 'hero' }).error).toBeUndefined();
  });
  it('refreshes a repeated silence to two turns rather than stacking durations', () => {
    let n = play(setup(side), side, 'masik', 'own-hero');
    n = act(n, side, { type: 'end' }).state;
    n = act(n, other(side), { type: 'end' }).state;
    expect(n[side].powerSilenceTurns).toBe(1);
    n = play(n, side, 'masik', 'own-hero');
    expect(n[side].powerSilenceTurns).toBe(2);
  });
  it.each(['trachukcha', 'maratik', 'jaina'])('restores a usable power after replacing the hero with %s', id => {
    let n = play(setup(side), side, 'masik', 'own-hero'); n[side].mana = 10; n.rashDeaths = 2;
    n = play(n, side, id);
    expect(n[side].powerSilenceTurns).toBe(0);
    if (id === 'trachukcha') creature(n, other(side), 'regular');
    n[side].mana = 10;
    expect(powerProblem(n, side)).toBeUndefined();
  });
  it('requires a real target and a free board slot before charging mana', () => {
    const g = setup(side); const uid = g.nextUid++; g[side].hand = [{ id: 'masik', uid }];
    for (const target of [undefined, -1]) {
      const rejected = act(g, side, { type: 'play', uid, target });
      expect(rejected.error).toBeTruthy(); expect(rejected.state).toBe(g);
    }
    for (let i = 0; i < 7; i++) creature(g, side, 'regular');
    expect(act(g, side, { type: 'play', uid, target: 'hero' }).error).toContain('7 существ');
    expect(g[side].mana).toBe(10); expect(g[other(side)].powerSilenceTurns).toBe(0);
  });
  it('loses an immediate attack when silenced on the turn it entered', () => {
    let n = play(setup(side), side, 'masik', 'hero'); const uid = n[side].board[0].uid;
    n = play(n, side, 'silence', uid);
    expect(n[side].board[0]).toMatchObject({ charge: false, silenced: true, ready: false });
    expect(act(n, side, { type: 'attack', uid, target: 'hero' }).error).toBeTruthy();
    n = act(n, side, { type: 'end' }).state; n = act(n, other(side), { type: 'end' }).state;
    expect(act(n, side, { type: 'attack', uid, target: 'hero' }).error).toBeUndefined();
  });
  it('does not refresh an already-spent attack when silenced', () => {
    let n = play(setup(side), side, 'masik', 'hero'); const uid = n[side].board[0].uid;
    n = act(n, side, { type: 'attack', uid, target: 'hero' }).state;
    n = play(n, side, 'silence', uid);
    expect(act(n, side, { type: 'attack', uid, target: 'hero' }).error).toBeTruthy();
    expect(n[other(side)].health).toBe(24);
  });
  it('retains normal attack readiness when silenced after its summoning turn', () => {
    let n = play(setup(side), side, 'masik', 'hero'); const uid = n[side].board[0].uid;
    n = act(n, side, { type: 'end' }).state; n = act(n, other(side), { type: 'end' }).state;
    n = play(n, side, 'silence', uid);
    expect(n[side].board[0]).toMatchObject({ charge: false, silenced: true, ready: true });
    expect(act(n, side, { type: 'attack', uid, target: 'hero' }).error).toBeUndefined();
  });
  it('keeps Тихий час restricted to creatures, including when a hero is silenced', () => {
    const g = setup(side); const uid = g.nextUid++; g[side].hand = [{ id: 'silence', uid }];
    for (const target of ['hero', 'own-hero'] as const) expect(act(g, side, { type: 'play', uid, target }).error).toBeTruthy();
    expect(g[side].mana).toBe(10);
  });
});
it('the bot silences a taunt with Masik and charges for lethal damage', () => {
  const g = setup('bot'); g.player.health = 6; const taunt = creature(g, 'player', 'guardian');
  const uid = g.nextUid++; g.bot.hand = [{ id: 'masik', uid }];
  expect(chooseBotAction(g)).toEqual({ type: 'play', uid, target: taunt.uid });
  const n = act(g, 'bot', chooseBotAction(g)).state;
  expect(act(n, 'bot', chooseBotAction(n)).state.winner).toBe('bot');
});
it('a bot with a silenced power ends its turn without attempting the power', () => {
  const g = setup('bot'); g.bot.powerSilenceTurns = 2;
  expect(chooseBotAction(g)).toEqual({ type: 'end' });
});
