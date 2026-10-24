import { describe, expect, it } from 'vitest';
import { CARD, COLLECTIBLE, deckCopyLimit, deckError } from './cards';
import { act, createGame, legalTargets, other, type Game, type Minion, type Side } from './engine';

function unit(g: Game, side: Side, id: string): Minion {
  const c = CARD[id];
  const m: Minion = { id, uid: g.nextUid++, attack: c.attack!, health: c.health!, maxHealth: c.health!, ready: true,
    taunt: !!c.taunt, cannotAttack: false, silenced: false, ephemeral: false, origin: 'summoned' };
  g[side].board.push(m); return m;
}
function setup(side: Side) {
  const g = createGame(undefined, 57); g.active = side;
  for (const s of ['player', 'bot'] as Side[]) { g[s].board = []; g[s].hand = []; g[s].mana = g[s].maxMana = 10; }
  return g;
}
function play(g: Game, side: Side, id: string, target?: number) {
  const uid = g.nextUid++; g[side].hand.push({ id, uid });
  const r = act(g, side, { type: 'play', uid, target }); expect(r.error).toBeUndefined(); return r.state;
}
describe('rarity copy limits', () => {
  it.each([['regular', 3], ['guardian', 3], ['dragonslayer', 2], ['galinka', 1]] as const)('%s allows %s copies and rejects the next one', (id, limit) => {
    const deck = (n: number) => [...Array<string>(n).fill(id), ...COLLECTIBLE.filter(c => c.id !== id).slice(0, 30 - n).map(c => c.id)];
    expect(deckCopyLimit(CARD[id])).toBe(limit); expect(deckError(deck(limit))).toBeUndefined(); expect(deckError(deck(limit + 1))).toContain('копия');
  });
});
describe.each<Side>(['player', 'bot'])('new cards and balance for %s', side => {
  it('both hero cards add the revised armor without healing or overwriting existing armor', () => {
    for (const [id, armor, cost] of [['trachukcha', 50, 3], ['maratik', 20, 10]] as const) {
      const g = setup(side); g[side].health = 12; g[side].armor = 8;
      const n = play(g, side, id); expect(n[side].health).toBe(12); expect(n[side].armor).toBe(8 + armor); expect(n[side].mana).toBe(10 - cost);
    }
    const g = setup(side); g[side].mana = 2; const uid = g.nextUid++; g[side].hand = [{ uid, id: 'trachukcha' }];
    expect(act(g, side, { type: 'play', uid }).error).toBe('Недостаточно маны.'); expect(g[side].armor).toBe(0);
  });
  it('never transforms any enemy into goodgame, including zero-cost and cheap targets', () => {
    for (let seed = 0; seed < 80; seed++) {
      const g = setup(side), foe = other(side); g[side].power = 'fool'; g.rng = seed;
      for (const id of ['goodgame', 'regular', 'slime', 'guardian', 'maxim', 'galinka']) unit(g, foe, id);
      const r = act(g, side, { type: 'power' }); expect(r.error).toBeUndefined();
      expect(r.state[foe].board.every(m => m.id !== 'goodgame')).toBe(true);
      expect(r.state[foe].board.map(m => CARD[m.id].cost)).toEqual([1, 1, 1, 1, 1, 5]);
      expect(r.state[foe].health).toBe(30); expect(r.state.winner).toBeNull();
    }
  });
  it('Jaina instigator rushes a minion, then its deathrattle hits the hero after simultaneous casualties leave', () => {
    const g = setup(side), foe = other(side); const defender = unit(g, foe, 'mage'); defender.attack = 3;
    const n = play(g, side, 'jaina-instigator'), jaina = n[side].board[0];
    expect(jaina).toMatchObject({ attack: 4, health: 3, ready: true, rush: true }); expect(n[side].mana).toBe(4);
    expect(legalTargets(n, 'attack', jaina.uid)).toEqual([defender.uid]);
    const dead = act(n, side, { type: 'attack', uid: jaina.uid, target: defender.uid }).state;
    expect(dead[side].board).toHaveLength(0); expect(dead[foe].board).toHaveLength(0); expect(dead[foe].health).toBe(29);
    expect(dead.log.some(e => e.actor?.id === 'jaina-instigator' && e.target?.type === 'hero' && e.amount === 1)).toBe(true);
  });
  it('a damage deathrattle can kill Slime and resolve its summon in the next wave', () => {
    const g = setup(other(side)); g.rng = 1;
    const jaina = unit(g, side, 'jaina-instigator'), slime = unit(g, other(side), 'slime'); slime.health = 1;
    const n = play(g, other(side), 'bolt', jaina.uid);
    expect(n[side].board).toHaveLength(0); expect(n[other(side)].health).toBe(30);
    expect(n[other(side)].board).toMatchObject([{ id: 'slime-token', attack: 0, health: 2, taunt: true, ready: false, createdBy: 'slime' }]);
  });
  it('Slime protects its hero, summons one 0/2 taunt, and the token does not summon again', () => {
    const g = setup(side), foe = other(side); let n = play(g, side, 'slime'); const slime = n[side].board[0];
    expect(slime).toMatchObject({ attack: 1, health: 4, taunt: true, ready: false }); expect(n[side].mana).toBe(9);
    n.active = foe; n = play(n, foe, 'bolt', slime.uid); expect(n[side].board[0].health).toBe(1);
    n = play(n, foe, 'bolt', slime.uid); expect(n[side].board).toMatchObject([{ id: 'slime-token', attack: 0, health: 2, taunt: true, ready: false }]);
    n = play(n, foe, 'bolt', n[side].board[0].uid); expect(n[side].board).toHaveLength(0);
  });
  it.each(['slime', 'jaina-instigator'])('silence suppresses the deathrattle of %s', id => {
    const g = setup(side); const m = unit(g, side, id); m.health = 1;
    let n = play(g, side, 'silence', m.uid); n.active = other(side); n = play(n, other(side), 'bolt', m.uid);
    expect(n[side].board).toHaveLength(0); expect(n[other(side)].health).toBe(30);
    expect(n.log.some(e => e.text.startsWith('Предсмертный хрип'))).toBe(false);
  });
});
