import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD, STARTER_DECK } from './cards';
import { act, chooseBotAction, createGame, other, powerProblem, targetNeeded, type Side } from './engine';
import { HERO_CLASSES } from './classes';
import { createRoomGame, roomGameView, validRoomView } from '../online/protocol';
import { loadGame } from '../storage';
import { copyCardTemplate } from './custom-presets';
import { packForCards, registerCardPack } from './custom-cards';

function setup(side: Side = 'player') {
  const g = createGame(undefined, 13, undefined, undefined, { player: 'warlock', bot: 'warlock' }); g.active = side;
  for (const owner of ['player', 'bot'] as const) Object.assign(g[owner], { mana: 10, maxMana: 10, health: 30, armor: 0, hand: [], board: [], deck: ['regular', 'heal'] });
  return g;
}
afterEach(() => vi.unstubAllGlobals());
describe.each<Side>(['player', 'bot'])('warlock power for %s', side => {
  it('costs two mana, deals two self damage and draws exactly the top card once per turn', () => {
    const g = setup(side), before = structuredClone(g);
    expect(targetNeeded(g)).toBe(false); expect(HERO_CLASSES.warlock.power).toBe('lifeTap');
    const r = act(g, side, { type: 'power' }); expect(r.error).toBeUndefined(); expect(g).toEqual(before);
    expect(r.state[side]).toMatchObject({ hero: 'warlock', mana: 8, health: 28, powerUsed: true, hand: [{ id: 'regular' }], deck: ['heal'] });
    expect(r.state[other(side)].health).toBe(30);
    expect(r.state.events).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'power', cardId: 'life-tap' }), expect.objectContaining({ kind: 'damage', target: { side, uid: 'hero' }, amount: 2 }), expect.objectContaining({ kind: 'draw', side, cardId: 'regular' })]));
    expect(r.state.log.some(e => e.actor?.id === 'life-tap' && e.amount === 2 && e.target?.side === side)).toBe(true);
    expect(act(r.state, side, { type: 'power' }).error).toContain('использована');
  });
  it('absorbs self damage using armor and adds fatigue damage on an empty deck', () => {
    const g = setup(side); g[side].armor = 3;
    expect(act(g, side, { type: 'power' }).state[side]).toMatchObject({ health: 30, armor: 1 });
    g[side].armor = 0; g[side].deck = []; g[side].fatigue = 2;
    expect(act(g, side, { type: 'power' }).state[side]).toMatchObject({ health: 25, fatigue: 3, mana: 8, hand: [] });
  });
  it('burns a card at the hand limit and still deals damage', () => {
    const g = setup(side); g[side].hand = Array.from({ length: 10 }, () => ({ id: 'regular', uid: g.nextUid++ }));
    const r = act(g, side, { type: 'power' }); expect(r.error).toBeUndefined();
    expect(r.state[side].hand).toHaveLength(10); expect(r.state[side].deck).toEqual(['heal']); expect(r.state[side].health).toBe(28);
    expect(r.state.log.some(e => e.kind === 'discard')).toBe(true);
  });
  it('allows self lethal, finishes the draw and awards the opponent the win', () => {
    const g = setup(side); g[side].health = 2;
    const r = act(g, side, { type: 'power' }); expect(r.error).toBeUndefined();
    expect(r.state.winner).toBe(other(side)); expect(r.state[side].hand).toHaveLength(1);
  });
  it('respects insufficient mana, silence and briefing replacement', () => {
    const g = setup(side); g[side].mana = 1;
    expect(powerProblem(g, side)).toContain('2 маны'); expect(act(g, side, { type: 'power' }).state).toBe(g);
    g[side].mana = 10; g[side].powerSilenceTurns = 2; expect(act(g, side, { type: 'power' }).error).toContain('немотой');
    g[side].powerSilenceTurns = 0; g.briefing = { remainingTurns: { player: 2, bot: 2 } };
    const r = act(g, side, { type: 'power' }); expect(r.state[side]).toMatchObject({ health: 30, mana: 4, power: 'lifeTap' }); expect(r.state[side].hand).toHaveLength(1);
  });
});
it('lets the bot tap, but avoids obvious self lethal and a full hand', () => {
  const g = setup('bot'); expect(chooseBotAction(g).type).toBe('power');
  g.bot.health = 2; expect(chooseBotAction(g)).toEqual({ type: 'end' });
  g.bot.health = 4; g.bot.deck = []; g.bot.fatigue = 1; expect(chooseBotAction(g)).toEqual({ type: 'end' });
});
it.each([0, 1])('keeps the chosen warlock class for either first-player seat, seed %s', seed => {
  for (const seat of ['host', 'guest'] as const) {
    const g = createRoomGame(STARTER_DECK, STARTER_DECK, 'Хозяин', 'Гость', seed, 'warlock-room', undefined, { host: seat === 'host' ? 'warlock' : 'mage', guest: seat === 'guest' ? 'warlock' : 'mage' });
    const side = seat === 'host' ? 'player' : 'bot'; expect(g[side]).toMatchObject({ hero: 'warlock', power: 'lifeTap' });
    const view = roomGameView(g, side); expect(validRoomView(view)).toBe(true); expect(view.player.hero).toBe('warlock');
  }
});
it('preserves the power and used state through saves and guest projection', () => {
  const r = act(setup('bot'), 'bot', { type: 'power' });
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(r.state) });
  expect(loadGame()?.bot).toMatchObject({ hero: 'warlock', health: 28, powerUsed: true });
  const view = roomGameView(r.state, 'bot'); expect(validRoomView(view)).toBe(true); expect(view.player.power).toBe('lifeTap');
});
it('copies life tap into the card editor with both effects and their order intact', () => {
  const power = copyCardTemplate(CARD['life-tap']); registerCardPack([power]);
  const g = setup(); g.customCards = packForCards([power.id]); g.player.power = power.id;
  const r = act(g, 'player', { type: 'power' }); expect(r.error).toBeUndefined(); expect(r.state.player.health).toBe(28); expect(r.state.player.hand).toHaveLength(1);
  expect(power.editor?.rules.map(r => r.operation)).toEqual(['damage', 'draw']);
});
