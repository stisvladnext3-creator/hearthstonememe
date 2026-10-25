import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD, STARTER_DECK } from './cards';
import { act, activePower, chooseBotAction, createGame, other, powerCost, targetNeeded, type Game, type Side } from './engine';
import { HERO_CLASSES, validHeroClass } from './classes';
import { copyCardTemplate } from './custom-presets';
import { packForCards, registerCardPack } from './custom-cards';
import { loadGame } from '../storage';
import { savedRoom } from '../online/room';
import { acceptsActionRevision, createRoomGame, roomGameView, validRoomView } from '../online/protocol';

function game(side: Side = 'player'): Game {
  const g = createGame(undefined, 71, undefined, undefined, { player: 'warrior', bot: 'warrior' }); g.active = side;
  for (const owner of ['player', 'bot'] as const) { g[owner].hand = []; g[owner].board = []; g[owner].mana = g[owner].maxMana = 10; }
  return g;
}
afterEach(() => vi.unstubAllGlobals());
it('adds a selectable warrior while retaining mage and Boris as the default starting heroes', () => {
  const original = createGame(); expect(original.player).toMatchObject({ hero: 'mage', power: 'spark' }); expect(original.bot).toMatchObject({ hero: 'boris', power: 'spark' });
  const g = game(); expect(g.player).toMatchObject({ hero: 'warrior', power: 'armor', health: 30, armor: 0 });
  expect(powerCost(HERO_CLASSES.warrior.power)).toBe(2); expect(CARD['armor-power'].kind).toBe('power');
  expect(validHeroClass('warrior')).toBe(true); expect(validHeroClass('trachukcha')).toBe(false);
});
describe.each<Side>(['player', 'bot'])('warrior for %s', side => {
  it('spends exactly two mana and adds exactly two armor without a target, healing or enemy damage', () => {
    const g = game(side); g[side].armor = 7; g[side].health = 13; const before = structuredClone(g);
    expect(targetNeeded(g)).toBe(false);
    const result = act(g, side, { type: 'power' }); expect(result.error).toBeUndefined();
    expect(result.state[side]).toMatchObject({ mana: 8, armor: 9, health: 13, powerUsed: true });
    expect(result.state[other(side)].health).toBe(30); expect(g).toEqual(before);
    expect(result.state.events.at(-1)).toMatchObject({ kind: 'power', cardId: 'armor-power', target: { side, uid: 'hero' } });
    expect(result.state.log.at(-1)).toMatchObject({ kind: 'power', actor: { id: 'armor-power', type: 'power' }, target: { type: 'hero', id: 'warrior', side }, amount: 2 });
    expect(act(result.state, side, { type: 'power' }).error).toContain('использована');
  });
  it('rejects insufficient mana, an opponent turn and a silenced hero without changing its state', () => {
    const g = game(side); g[side].mana = 1; expect(act(g, side, { type: 'power' }).error).toContain('2 маны');
    g[side].mana = 10; expect(act(g, other(side), { type: 'power' }).error).toContain('ход соперника');
    g[side].powerSilenceTurns = 2; const before = structuredClone(g); expect(act(g, side, { type: 'power' }).error).toContain('немотой'); expect(g).toEqual(before);
  });
  it('refreshes on the next own turn and waits for two own turns of silence', () => {
    let g = act(game(side), side, { type: 'power' }).state;
    g = act(g, side, { type: 'end' }).state; g = act(g, other(side), { type: 'end' }).state;
    g = act(g, side, { type: 'power' }).state; expect(g[side].armor).toBe(4);
    g[side].powerUsed = false; g[side].powerSilenceTurns = 2;
    for (let i = 0; i < 2; i++) {
      expect(act(g, side, { type: 'power' }).error).toContain('немотой');
      g = act(g, side, { type: 'end' }).state; g = act(g, other(side), { type: 'end' }).state;
    }
    const r = act(g, side, { type: 'power' }); expect(r.error).toBeUndefined(); expect(r.state[side].armor).toBe(6);
  });
  it('keeps the underlying warrior power during briefing and replaces it when a hero card is played', () => {
    let g = game(side); g.briefing = { remainingTurns: { player: 1, bot: 1 } };
    expect(activePower(g, side)).toBe('briefing'); g = act(g, side, { type: 'power' }).state; expect(g[side].armor).toBe(0);
    g = act(g, side, { type: 'end' }).state; g = act(g, other(side), { type: 'end' }).state; expect(activePower(g, side)).toBe('armor');
    g[side].mana = 10; const uid = g.nextUid++; g[side].hand = [{ id: 'maratik', uid }];
    const r = act(g, side, { type: 'play', uid }); expect(r.error).toBeUndefined(); expect(r.state[side]).toMatchObject({ hero: 'maratik', power: 'oy', armor: 20 });
  });
});
it('lets the bot use the same warrior power successfully', () => {
  const g = game('bot'), action = chooseBotAction(g); expect(action.type).toBe('power');
  const r = act(g, 'bot', action); expect(r.error).toBeUndefined(); expect(r.state.bot.armor).toBe(2); expect(r.state.player.health).toBe(30);
});
it.each([0, 1])('preserves independent class choices when seat order changes (seed %s)', seed => {
  for (const warrior of ['host', 'guest'] as const) {
    const classes = { host: warrior === 'host' ? 'warrior' as const : 'mage' as const, guest: warrior === 'guest' ? 'warrior' as const : 'mage' as const };
    const g = createRoomGame(STARTER_DECK, STARTER_DECK, 'Хозяин', 'Гость', seed, 'warrior-room', undefined, classes);
    expect(g.active).toBe(seed ? 'bot' : 'player');
    expect(g.player.hero).toBe(classes.host); expect(g.bot.hero).toBe(classes.guest);
    for (const viewer of ['player', 'bot'] as Side[]) {
      const view = roomGameView(g, viewer); expect(validRoomView(view)).toBe(true);
      expect(view.player.hero).toBe(g[viewer].hero); expect(view.player.power).toBe(g[viewer].power);
    }
  }
});
it('restores warrior armor and class from solo and room saves, and accepts old saves without a class field', () => {
  const g = act(game(), 'player', { type: 'power' }).state;
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'memestone.v1.game' ? JSON.stringify(g) : null });
  expect(loadGame()?.player).toMatchObject({ hero: 'warrior', power: 'armor', armor: 2, powerUsed: true });
  const self = { name: 'Хозяин', token: 'warrior-host-token', deck: STARTER_DECK, heroClass: 'warrior' };
  const saved = { role: 'host', code: 'ABC234', self, game: g, revision: 1 };
  vi.stubGlobal('sessionStorage', { getItem: () => JSON.stringify(saved) });
  expect(savedRoom()?.self.heroClass).toBe('warrior'); expect(savedRoom()?.game?.player.armor).toBe(2);
  delete (self as { heroClass?: string }).heroClass; expect(savedRoom()).not.toBeNull();
  self.heroClass = 'unknown'; expect(savedRoom()).toBeNull();
});
it('copies the new power into the editor as armor rather than a card draw', () => {
  const power = copyCardTemplate(CARD['armor-power']); registerCardPack([power]);
  const g = game(); g.customCards = packForCards([power.id]); g.player.power = power.id;
  const hand = [...g.player.hand], r = act(g, 'player', { type: 'power' }); expect(r.error).toBeUndefined();
  expect(r.state.player.armor).toBe(2); expect(r.state.player.hand).toEqual(hand); expect(power.text).toContain('2 брони');
});
it('accepts both opening confirmations from the same revision without permitting stale battle actions', () => {
  const g = createRoomGame(STARTER_DECK, STARTER_DECK, 'Хозяин', 'Гость', 1, 'warrior-opening', 30000, { host: 'warrior', guest: 'mage' });
  const first = act(g, 'player', { type: 'mulligan', replace: [] }).state;
  const confirm = { type: 'mulligan' as const, replace: [] };
  expect(acceptsActionRevision(first, 2, 1, confirm)).toBe(true);
  const second = act(first, 'bot', confirm); expect(second.error).toBeUndefined(); expect(second.state.mulligan).toBeUndefined();
  expect(acceptsActionRevision(second.state, 3, 1, confirm)).toBe(false);
  expect(acceptsActionRevision(first, 2, 1, { type: 'end' })).toBe(false);
  expect(acceptsActionRevision(first, 2, 3, confirm)).toBe(false);
  expect(acceptsActionRevision(first, 2, '2', confirm)).toBe(false);
});
