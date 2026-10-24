import { describe, expect, it } from 'vitest';
import { BOT_DECK, CARD, STARTER_DECK, deckError } from './cards';
import { act, createGame, type Game, type Side } from './engine';
import { createRoomGame, roomGameView } from '../online/protocol';

function conserved(game: Game, side: Side, deck: string[]) {
  const p = game[side];
  expect([...p.deck, ...p.hand.map(c => c.id)].sort()).toEqual([...deck].sort());
  expect(p.hand).toHaveLength(4);
  expect(p.deck).toHaveLength(26);
  expect(new Set(p.hand.map(c => c.uid)).size).toBe(p.hand.length);
}
describe('quests in the opening hand', () => {
  it.each(['player', 'bot'] as const)('deals the quest first for %s across shuffled games, without extra copies', side => {
    for (let seed = 1; seed <= 50; seed++) {
      const g = createGame(undefined, seed);
      expect(g[side].hand[0].id).toBe('rash-quest');
      expect(g[side].hand[1].id).toBe('casino');
      expect(g[side].quest).toBeUndefined();
      expect(g[side].deck).not.toContain('rash-quest');
      conserved(g, side, side === 'player' ? STARTER_DECK : BOT_DECK);
    }
  });
  it('does not grant a quest to a deck without one and retains the existing Casino opening', () => {
    const deck = STARTER_DECK.map(id => id === 'rash-quest' ? 'bolt' : id);
    expect(deckError(deck)).toBeUndefined();
    const g = createGame(deck, 4, deck);
    for (const side of ['player', 'bot'] as const) {
      expect(g[side].hand[0].id).toBe('casino');
      expect(g[side].hand.some(c => CARD[c.id].quest)).toBe(false);
      conserved(g, side, deck);
    }
  });
  it('still deals the quest first without Casino, and requires playing it to activate', () => {
    const deck = STARTER_DECK.map(id => id === 'casino' ? 'bolt' : id);
    expect(deckError(deck)).toBeUndefined();
    const g = createGame(deck, 7, deck);
    for (const side of ['player', 'bot'] as const) {
      expect(g[side].hand[0].id).toBe('rash-quest'); conserved(g, side, deck);
    }
    const next = act(g, 'player', { type: 'play', uid: g.player.hand[0].uid });
    expect(next.error).toBeUndefined();
    expect(next.state.player.quest).toEqual({ id: 'rash-quest', progress: 0 });
    expect(g.player.quest).toBeUndefined();
  });
  it.each([100, 101])('preserves the first quest for host and guest when either goes first (seed %i)', seed => {
    const g = createRoomGame(STARTER_DECK, BOT_DECK, 'Хозяин', 'Гость', seed, 'opening-quest');
    expect(g.active).toBe(seed % 2 ? 'bot' : 'player');
    for (const viewer of ['player', 'bot'] as const) {
      expect(g[viewer].hand[0].id).toBe('rash-quest');
      expect(roomGameView(g, viewer).player.hand[0].id).toBe('rash-quest');
      expect(roomGameView(g, viewer).bot.hand.every(c => c.id === 'hidden')).toBe(true);
      conserved(g, viewer, viewer === 'player' ? STARTER_DECK : BOT_DECK);
    }
  });
});
