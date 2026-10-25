import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, abilityTargets, createGame, legalTargets, other, type Game, type Minion, type Side, type Target } from './engine';
import { CARD } from './cards';
import { copyCardTemplate } from './custom-presets';
import { loadGame } from '../storage';
import { roomGameView, validAction, validRoomView } from '../online/protocol';

function setup(side: Side): Game {
  const g = createGame(undefined, 2026); g.active = side;
  for (const owner of ['player', 'bot'] as const) {
    Object.assign(g[owner], { mana: 10, maxMana: 10, hand: [], board: [], health: 30, armor: 0, deck: ['regular', 'dragon', 'heal'] });
  }
  return g;
}
function minion(g: Game, side: Side, id = 'guardian'): Minion {
  const c = CARD[id], m: Minion = { id, uid: g.nextUid++, attack: c.attack!, health: c.health!, maxHealth: c.health!, ready: true, taunt: !!c.taunt, cannotAttack: false, ephemeral: false, silenced: false };
  g[side].board.push(m); return m;
}
function hand(g: Game, side: Side, id: string) { const uid = g.nextUid++; g[side].hand.push({ uid, id }); return uid; }
afterEach(() => vi.unstubAllGlobals());
describe.each<Side>(['player', 'bot'])('friendly targets for %s', side => {
  it('lets the mage hit any hero or minion without obeying taunt', () => {
    const g = setup(side), own = minion(g, side), enemy = minion(g, other(side)), weak = minion(g, other(side), 'regular');
    const targets: Target[] = ['hero', 'own-hero', own.uid, enemy.uid, weak.uid];
    expect(abilityTargets(g)).toEqual(expect.arrayContaining(targets));
    for (const target of targets) {
      const r = act(g, side, { type: 'power', target }); expect(r.error).toBeUndefined();
      const owner = target === 'hero' || [enemy.uid, weak.uid].includes(Number(target)) ? other(side) : side;
      expect(r.state[side]).toMatchObject({ mana: 8, powerUsed: true });
      if (typeof target === 'number') expect(r.state[owner].board.find(m => m.uid === target)?.health).toBe(g[owner].board.find(m => m.uid === target)!.health - 1);
      else expect(r.state[owner].health).toBe(29);
      expect([...r.state.events].reverse().find(e => e.kind === 'power')).toMatchObject({ cardId: 'spark-power', side, target: { side: owner, uid: typeof target === 'number' ? target : 'hero' } });
      expect(r.state.log.at(-1)).toMatchObject({ actor: { id: 'spark-power', side }, target: { side: owner }, amount: 1 });
    }
  });
  it('absorbs self damage with armor and resolves self lethal normally', () => {
    const g = setup(side); g[side].armor = 2;
    expect(act(g, side, { type: 'power', target: 'own-hero' }).state[side]).toMatchObject({ health: 30, armor: 1 });
    g[side].armor = 0; g[side].health = 1;
    expect(act(g, side, { type: 'power', target: 'own-hero' }).state.winner).toBe(other(side));
  });
  it('resolves a friendly deathrattle when the mage kills its own minion', () => {
    const g = setup(side), own = minion(g, side, 'jaina-rusher');
    const r = act(g, side, { type: 'power', target: own.uid }); expect(r.error).toBeUndefined();
    expect(r.state[side].board).toEqual([expect.objectContaining({ id: 'rds-guard', health: 3, taunt: true })]);
    expect(r.state[other(side)].health).toBe(30);
  });
  it('lets Искра хаоса damage its own minion and preserves enemy targets', () => {
    const g = setup(side), own = minion(g, side), enemy = minion(g, other(side)), uid = hand(g, side, 'bolt');
    expect(abilityTargets(g, uid)).toEqual(expect.arrayContaining(['hero', own.uid, enemy.uid]));
    const r = act(g, side, { type: 'play', uid, target: own.uid }); expect(r.error).toBeUndefined();
    expect(r.state[side].board[0].health).toBe(own.health - 3); expect(r.state[other(side)].board[0].health).toBe(enemy.health);
    expect(r.state[side].mana).toBe(8); expect(r.state.log.at(-1)).toMatchObject({ actor: { id: 'bolt' }, target: { side }, amount: 3 });
  });
  it.each([true, false])('damages its own minion with Собачка, deck nonempty=%s', withDeck => {
    const g = setup(side), own = minion(g, side, 'slime'), uid = hand(g, side, 'dog-spell');
    if (!withDeck) g[side].deck = [];
    const r = act(g, side, { type: 'play', uid, target: own.uid }); expect(r.error).toBeUndefined();
    let n = r.state;
    if (withDeck) {
      expect(n[side].board[0].health).toBe(4);
      expect(validRoomView(roomGameView(n, side))).toBe(true);
      vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'memestone.v1.game' ? JSON.stringify(n) : null });
      expect(loadGame()?.discovery?.target).toBe(own.uid);
      const chosen = n.discovery!.options[0]; n = act(n, side, { type: 'discover', cardId: chosen }).state;
      expect(n[side].hand.map(c => c.id)).toContain(chosen); expect(n[side].deck).toEqual(g[side].deck);
    }
    expect(n.discovery).toBeUndefined(); expect(n[side].board).toEqual([expect.objectContaining({ id: 'slime-token', health: 2, taunt: true })]);
    expect(n[other(side)].health).toBe(30); expect(n[side].mana).toBe(8);
    expect(n.log.find(e => e.actor?.id === 'dog-spell' && e.amount === 4)?.target?.side).toBe(side);
  });
  it('finishes discovery safely if the friendly target has already died', () => {
    const g = setup(side), own = minion(g, side), uid = hand(g, side, 'dog-spell');
    const pending = act(g, side, { type: 'play', uid, target: own.uid }).state; pending[side].board = [];
    const r = act(pending, side, { type: 'discover', cardId: pending.discovery!.options[0] });
    expect(r.error).toBeUndefined(); expect(r.state.discovery).toBeUndefined(); expect(r.state[other(side)].health).toBe(30);
  });
  it('rejects nonexistent targets before spending and keeps attacks restricted to enemies', () => {
    const g = setup(side), own = minion(g, side), foe = minion(g, other(side));
    for (const id of ['bolt', 'dog-spell']) {
      const uid = hand(g, side, id);
      for (const target of [-1, 999999, 'own-hero'] as const) {
        const r = act(g, side, { type: 'play', uid, target }); expect(r.error).toBeTruthy(); expect(r.state).toBe(g);
      }
    }
    const r = act(g, side, { type: 'power', target: 999999 }); expect(r.error).toBeTruthy(); expect(r.state).toBe(g);
    expect(legalTargets(g, 'attack', own.uid)).toEqual([foe.uid]);
    expect(act(g, side, { type: 'attack', uid: own.uid, target: own.uid }).error).toBeTruthy();
  });
});
it('copies the mage power into the editor with the same any-character targeting', () => {
  expect(copyCardTemplate(CARD['spark-power']).editor!.rules[0]).toMatchObject({ target: 'selectedCharacter', operation: 'damage', amount: 1 });
});
it('keeps friendly target ownership for guest actions, snapshots and animations', () => {
  const g = setup('bot'), own = minion(g, 'bot');
  expect(validAction({ type: 'power', target: 'own-hero' })).toBe(true);
  expect(validAction({ type: 'power', target: own.uid })).toBe(true);
  const r = act(g, 'bot', { type: 'power', target: own.uid }); expect(r.error).toBeUndefined();
  const view = roomGameView(r.state, 'bot'); expect(validRoomView(view)).toBe(true);
  expect([...view.events].reverse().find(e => e.kind === 'power')).toMatchObject({ side: 'player', target: { side: 'player', uid: own.uid } });
  expect(view.player.board[0].health).toBe(own.health - 1); expect(view.bot.health).toBe(30);
});
