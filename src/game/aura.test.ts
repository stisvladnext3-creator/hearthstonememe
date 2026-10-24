import { describe, expect, it } from 'vitest';
import { act, createGame, other, refreshAuras, type Game, type Minion, type Side } from './engine';
import { CARD } from './cards';

function setup(side: Side) {
  const g = createGame(undefined, 123); g.active = side;
  for (const p of [g.player, g.bot]) { p.mana = p.maxMana = 10; p.hand = []; p.board = []; }
  return g;
}
function unit(g: Game, side: Side, id: string): Minion {
  const c = CARD[id]; const m: Minion = { id, uid: g.nextUid++, attack: c.attack!, health: c.health!, maxHealth: c.health!,
    ready: true, cannotAttack: !!c.cannotAttack, taunt: !!c.taunt, ephemeral: false, silenced: false };
  g[side].board.push(m); return m;
}
function play(g: Game, side: Side, id: string, target?: number | 'hero') {
  const uid = g.nextUid++; g[side].hand.push({ uid, id });
  const result = act(g, side, { type: 'play', uid, target });
  expect(result.error).toBeUndefined(); return result.state;
}
describe.each<Side>(['player', 'bot'])('Василий aura on %s', side => {
  it('buffs all friendlies including itself, but never enemies', () => {
    const g = setup(side); unit(g, side, 'regular'); unit(g, other(side), 'regular');
    const n = play(g, side, 'vasiliy');
    expect(n[side].board.map(m => m.attack)).toEqual([3, 6]);
    expect(n[side].board[1]).toMatchObject({ taunt: true, auraBonus: 2, health: 5 });
    expect(n[other(side)].board[0].attack).toBe(1);
    expect(n.log.some(l => l.actor?.id === 'vasiliy' && l.target?.id === 'regular' && l.text.includes('1 → 3'))).toBe(true);
  });
  it('applies to new summons and never stacks again when turns change or auras refresh', () => {
    let g = play(setup(side), side, 'vasiliy'); g = play(g, side, 'regular');
    for (let i = 0; i < 5; i++) refreshAuras(g);
    expect(g[side].board.map(m => m.attack)).toEqual([6, 3]);
    g = act(g, side, { type: 'end' }).state; g = act(g, other(side), { type: 'end' }).state;
    expect(g[side].board.map(m => m.attack)).toEqual([6, 3]);
  });
  it('removes only one bonus when one of two cats dies', () => {
    const g = setup(side); const cat = unit(g, side, 'vasiliy'); unit(g, side, 'vasiliy'); unit(g, side, 'regular');
    refreshAuras(g); expect(g[side].board.map(m => m.attack)).toEqual([8, 8, 5]);
    cat.health = 1; g.active = other(side);
    const n = play(g, other(side), 'bolt', cat.uid);
    expect(n[side].board.map(m => m.attack)).toEqual([6, 3]);
    expect(n[side].board.every(m => m.auraBonus === 2)).toBe(true);
  });
  it('silence removes taunt and the aura, with no permanent bonus left behind', () => {
    const g = setup(side); const cat = unit(g, side, 'vasiliy'); unit(g, side, 'regular'); refreshAuras(g);
    g.active = other(side); const n = play(g, other(side), 'silence', cat.uid);
    expect(n[side].board.map(m => m.attack)).toEqual([4, 1]);
    expect(n[side].board[0]).toMatchObject({ taunt: false, silenced: true, auraBonus: 0 });
  });
  it('silencing another ally leaves the external aura active and Руслан still cannot attack', () => {
    const g = setup(side); unit(g, side, 'vasiliy'); const ruslan = unit(g, side, 'ruslan'); refreshAuras(g);
    expect(ruslan.attack).toBe(12); g.active = other(side);
    const n = play(g, other(side), 'silence', ruslan.uid);
    expect(n[side].board[1]).toMatchObject({ attack: 12, cannotAttack: true, silenced: false });
  });
  it('transformation removes the aura and buffs a zero-attack minion only while present', () => {
    const g = setup(side); unit(g, side, 'vasiliy'); unit(g, side, 'galinka'); refreshAuras(g);
    expect(g[side].board[1].attack).toBe(2);
    const n = act(g, side, { type: 'attack', uid: g[side].board[1].uid, target: 'hero' });
    expect(n.error).toBeUndefined(); expect(n.state[other(side)].health).toBe(28);
    g.active = other(side); g[other(side)].power = 'fool';
    const transformed = act(g, other(side), { type: 'power' }).state;
    expect(transformed[side].board.every(m => m.id !== 'vasiliy' && m.auraBonus === 0)).toBe(true);
    for (const m of transformed[side].board) expect(m.attack).toBe(CARD[m.id].attack);
  });
});
