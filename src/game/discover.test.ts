import { describe, expect, it } from 'vitest';
import { act, chooseBotAction, createGame, other, targetNeeded, type Game, type Minion, type Side } from './engine';
import { CARD } from './cards';

function setup(side: Side) {
  const g = createGame(undefined, 300);
  g.active = side;
  for (const p of [g.player, g.bot]) {
    p.mana = p.maxMana = 10; p.hand = []; p.board = []; p.deck = ['regular', 'dragon', 'bolt', 'regular', 'heal'];
    p.health = 30; p.armor = 0;
  }
  return g;
}
function card(g: Game, side: Side, id: string) {
  const uid = g.nextUid++; g[side].hand.push({ uid, id }); return uid;
}
function creature(g: Game, side: Side, id: string): Minion {
  const c = CARD[id];
  const m: Minion = { id, uid: g.nextUid++, attack: c.attack!, health: c.health!, maxHealth: c.health!, ready: true,
    taunt: !!c.taunt, cannotAttack: false, ephemeral: false, silenced: false };
  g[side].board.push(m); return m;
}
describe.each<Side>(['player', 'bot'])('new cards controlled by %s', side => {
  it('Драконоборец bypasses taunt, respects armor and wins for its owner', () => {
    const g = setup(side), foe = other(side); creature(g, foe, 'guardian');
    g[foe].health = 2; g[foe].armor = 2;
    const uid = card(g, side, 'dragonslayer');
    const n = act(g, side, { type: 'play', uid });
    expect(n.error).toBeUndefined(); expect(n.state.winner).toBe(side);
    expect(n.state[foe].armor).toBe(0); expect(n.state[foe].board[0].health).toBe(6);
    expect(n.state[side].board[0]).toMatchObject({ id: 'dragonslayer', attack: 1, health: 2, ready: false });
    expect(n.state.log.at(-1)).toMatchObject({ actor: { id: 'dragonslayer', side }, target: { side: foe, type: 'hero' }, amount: 4 });
  });
  it('requires a valid enemy target before spending a spell or mana', () => {
    const g = setup(side), uid = card(g, side, 'dog-spell');
    expect(targetNeeded(g, uid)).toBe(true);
    const invalid = act(g, side, { type: 'play', uid, target: -1 });
    expect(invalid.state).toBe(g); expect(invalid.error).toBeTruthy();
    expect(g[side].mana).toBe(10); expect(g[side].hand).toHaveLength(1);
  });
  it('offers three distinct seeded deck cards, preserves the deck and adds only the chosen copy', () => {
    const g = setup(side), uid = card(g, side, 'dog-spell');
    const before = structuredClone(g);
    const first = act(g, side, { type: 'play', uid, target: 'hero' });
    expect(g).toEqual(before); expect(first.state).toEqual(act(g, side, { type: 'play', uid, target: 'hero' }).state);
    const n = first.state, options = n.discovery!.options;
    expect(options).toHaveLength(3); expect(new Set(options).size).toBe(3);
    expect(options.every(id => g[side].deck.includes(id))).toBe(true);
    expect(n[other(side)].health).toBe(30); expect(n[side].mana).toBe(8);
    const selected = options[1]; const done = act(n, side, { type: 'discover', cardId: selected });
    expect(done.error).toBeUndefined(); expect(done.state.discovery).toBeUndefined();
    expect(done.state[side].hand.map(c => c.id)).toEqual([selected]);
    expect(done.state[side].deck).toEqual(before[side].deck); expect(done.state[side].mana).toBe(8);
    expect(done.state[other(side)].health).toBe(26);
    expect(done.state.log.find(l => l.kind === 'discover' && l.target?.id === selected)?.actor?.id).toBe('dog-spell');
    expect(act(done.state, side, { type: 'discover', cardId: selected }).error).toBeTruthy();
  });
  it('blocks other actions and forged choices while discovery is pending', () => {
    const g = setup(side); const uid = card(g, side, 'dog-spell');
    const n = act(g, side, { type: 'play', uid, target: 'hero' }).state;
    for (const a of [{ type: 'end' }, { type: 'power', target: 'hero' }, { type: 'play', uid: -1 }, { type: 'discover', cardId: 'galinka' }] as const) {
      const rejected = act(n, side, a);
      expect(rejected.error).toBeTruthy(); expect(rejected.state).toBe(n);
    }
    expect(act(n, other(side), { type: 'discover', cardId: n.discovery!.options[0] }).error).toBeTruthy();
  });
  it('uses one option for a duplicate-only deck and never removes the original', () => {
    const g = setup(side); g[side].deck = ['bolt', 'bolt', 'bolt'];
    const uid = card(g, side, 'dog-spell'); const n = act(g, side, { type: 'play', uid, target: 'hero' }).state;
    expect(n.discovery?.options).toEqual(['bolt']);
    expect(act(n, side, { type: 'discover', cardId: 'bolt' }).state[side].deck).toEqual(['bolt', 'bolt', 'bolt']);
  });
  it('still damages a minion with an empty deck, without causing fatigue', () => {
    const g = setup(side); g[side].deck = []; const target = creature(g, other(side), 'mage');
    const uid = card(g, side, 'dog-spell'); const n = act(g, side, { type: 'play', uid, target: target.uid }).state;
    expect(n.discovery).toBeUndefined(); expect(n[side].fatigue).toBe(0); expect(n[side].health).toBe(30);
    expect(n[other(side)].board).toHaveLength(0); expect(n[side].hand).toHaveLength(0);
  });
  it('burns a copy at the hand limit but still completes the damage and lethal outcome', () => {
    const g = setup(side); g[other(side)].health = 4;
    const uid = card(g, side, 'dog-spell'); const n = act(g, side, { type: 'play', uid, target: 'hero' }).state;
    for (let i = 0; i < 10; i++) card(n, side, 'regular');
    const done = act(n, side, { type: 'discover', cardId: n.discovery!.options[0] }).state;
    expect(done[side].hand).toHaveLength(10); expect(done.winner).toBe(side);
    expect(done.log.some(l => l.kind === 'discard')).toBe(true);
    expect(done.log.some(l => l.kind === 'discover' && l.text.includes('сгорает'))).toBe(true);
  });
  it('can concede while choosing without leaving a pending choice', () => {
    const g = setup(side); const uid = card(g, side, 'dog-spell');
    const n = act(g, side, { type: 'play', uid, target: 'hero' }).state;
    const done = act(n, side, { type: 'concede' }).state;
    expect(done.winner).toBe(other(side)); expect(done.discovery).toBeUndefined();
  });
});
it('the bot resolves discovery, avoids a suicide copy and uses the original target', () => {
  const g = setup('bot'); g.bot.deck = ['goodgame', 'dragonslayer', 'regular'];
  const target = creature(g, 'player', 'mage'); const uid = card(g, 'bot', 'dog-spell');
  const n = act(g, 'bot', { type: 'play', uid, target: target.uid }).state;
  const a = chooseBotAction(n); expect(a).toEqual({ type: 'discover', cardId: 'dragonslayer' });
  const done = act(n, 'bot', a);
  expect(done.error).toBeUndefined(); expect(done.state.player.board).toHaveLength(0);
  expect(done.state.player.health).toBe(30); expect(done.state.bot.hand[0].id).toBe('dragonslayer');
});
it.each(['dragonslayer', 'dog-spell'])('the bot prioritizes lethal using %s even through taunt', id => {
  const g = setup('bot'); creature(g, 'player', 'guardian'); g.player.health = 4;
  card(g, 'bot', 'dragon'); const uid = card(g, 'bot', id);
  const chosen = chooseBotAction(g);
  expect(chosen).toEqual({ type: 'play', uid, target: id === 'dog-spell' ? 'hero' : undefined });
  let n = act(g, 'bot', chosen).state;
  if (n.discovery) n = act(n, 'bot', chooseBotAction(n)).state;
  expect(n.winner).toBe('bot');
});
it('a full board rejects Драконоборец before its battlecry can deal damage', () => {
  const g = setup('player'); for (let i = 0; i < 7; i++) creature(g, 'player', 'regular');
  const uid = card(g, 'player', 'dragonslayer');
  const n = act(g, 'player', { type: 'play', uid });
  expect(n.error).toBeTruthy(); expect(n.state.bot.health).toBe(30); expect(n.state.player.mana).toBe(10);
});
