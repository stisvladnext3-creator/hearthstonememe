import { describe, expect, it } from 'vitest';
import { BOT_DECK, CARD, COLLECTIBLE, STARTER_DECK, deckError, migrateRewardDeck } from './cards';
import { act, chooseBotAction, createGame, expireMulligan, type Game, type Side } from './engine';
import { createRoomGame, roomGameView, validAction, validRoomView } from '../online/protocol';
const opening = () => createGame(STARTER_DECK, 51, BOT_DECK, 30_000);
const inventory = (g: Game, side: Side) => [...g[side].deck, ...g[side].hand.map(c => c.id)].sort();
const confirm = (g: Game, side: Side, replace: number[] = []) => act(g, side, { type: 'mulligan', replace }).state;
describe('opening selection', () => {
  it('deals exactly three cards with the quest first, without starting a turn', () => {
    const g = opening();
    for (const side of ['player', 'bot'] as const) {
      expect(g[side].hand).toHaveLength(3); expect(g[side].hand[0].id).toBe('rash-quest');
      expect(g[side].mana).toBe(0); expect(g[side].deck).toHaveLength(27);
    }
    expect(g.mulligan?.deadline).toBe(30_000);
  });
  it.each(['player', 'bot'] as const)('replaces all three for %s before returning their copies to the deck', side => {
    let g = opening(); const before = inventory(g, side), outgoing = g[side].hand.map(c => c.uid);
    g = confirm(g, side, outgoing); expect(g.mulligan?.ready[side]).toBe(true);
    g = confirm(g, side === 'player' ? 'bot' : 'player');
    expect(g.mulligan).toBeUndefined(); expect(g[side].hand.every(c => !outgoing.includes(c.uid))).toBe(true);
    expect(inventory(g, side)).toEqual(before); expect(g[side].deck).toContain('rash-quest');
  });
  it('keeps untouched cards in place and waits for both confirmations', () => {
    let g = opening(); const kept = g.player.hand[0], swapped = g.player.hand[1];
    g = confirm(g, 'player', [swapped.uid]); expect(g.player.mana).toBe(0); expect(g.player.hand).toHaveLength(3);
    g = confirm(g, 'bot'); expect(g.player.hand[0]).toEqual(kept); expect(g.player.hand[1].uid).not.toBe(swapped.uid);
    expect(g.player.hand).toHaveLength(4); expect(g.bot.hand).toHaveLength(3); expect(g.player.mana).toBe(1);
  });
  it('restores pending choices and applies them at the original deadline exactly once', () => {
    const g = opening(), uid = g.player.hand[0].uid;
    const selected = act(g, 'player', { type: 'mulligan', replace: [uid], confirm: false }).state;
    const restored = JSON.parse(JSON.stringify(selected)) as Game;
    expect(expireMulligan(restored, 29_999)).toBe(restored);
    const ended = expireMulligan(restored, 30_000);
    expect(ended.mulligan).toBeUndefined(); expect(ended.player.hand.some(c => c.uid === uid)).toBe(false);
    expect(expireMulligan(ended, 40_000)).toBe(ended); expect(inventory(ended, 'player')).toEqual(inventory(g, 'player'));
  });
  it('rejects foreign and repeated choices, blocks gameplay and allows surrender', () => {
    const g = opening(), before = structuredClone(g), uid = g.player.hand[0].uid;
    for (const replace of [[uid, uid], [g.bot.hand[0].uid], [1, 2, 3, 4], [-1]]) expect(act(g, 'player', { type: 'mulligan', replace }).error).toBeTruthy();
    expect(validAction({ type: 'mulligan', replace: [uid, uid] })).toBe(false); expect(g).toEqual(before);
    expect(act(confirm(g, 'player'), 'player', { type: 'mulligan', replace: [] }).error).toBeTruthy();
    expect(act(g, 'player', { type: 'end' }).error).toBeTruthy(); expect(act(g, 'player', { type: 'play', uid }).error).toBeTruthy();
    expect(act(g, 'bot', { type: 'concede' }).state.winner).toBe('player');
  });
  it('lets the bot keep the quest and choose while the player is first', () => {
    const g = opening(), action = chooseBotAction(g); expect(action.type).toBe('mulligan');
    expect(act(g, 'bot', action).error).toBeUndefined();
    if (action.type === 'mulligan') expect(action.replace).not.toContain(g.bot.hand[0].uid);
  });
  it.each([100, 101])('shares the timer and personal choices for either first player (%i)', seed => {
    let g = createRoomGame(STARTER_DECK, STARTER_DECK, 'Хозяин', 'Гость', seed, 'opening', 30_000);
    g = act(g, 'bot', { type: 'mulligan', replace: [g.bot.hand[0].uid], confirm: false }).state;
    for (const side of ['player', 'bot'] as const) {
      const view = roomGameView(g, side); expect(validRoomView(view)).toBe(true);
      expect(view.mulligan?.deadline).toBe(30_000); expect(view.mulligan?.selected.bot).toEqual([]);
      expect(view.mulligan?.selected.player).toEqual(g.mulligan!.selected[side]);
      const visibleDraws = view.events.filter(e => e.kind === 'draw' && e.cardId);
      expect(visibleDraws).toHaveLength(1);
      for (const event of visibleDraws) {
        expect(event.side).toBe('player');
        expect(view.player.hand.find(c => c.uid === event.target?.uid)?.id).toBe(event.cardId);
      }
    }
    g = confirm(confirm(g, 'player'), 'bot'); expect(g[g.active].hand).toHaveLength(4); expect(g[g.active].mana).toBe(1);
  });
  it('never reveals the opponents drawn cards through animation events', () => {
    const g = confirm(confirm(opening(), 'player'), 'bot'); expect(g.events.some(e => e.kind === 'draw' && e.cardId)).toBe(true);
    expect(roomGameView(g, 'bot').events.filter(e => e.kind === 'draw' && e.side === 'bot').every(e => !e.cardId)).toBe(true);
  });
});
describe('quest-only reward', () => {
  it('excludes Volunteer Boss from legal decks and random pools and migrates saved decks', () => {
    expect(CARD.volunteer.reward).toBe(true); expect(COLLECTIBLE.some(c => c.id === 'volunteer')).toBe(false);
    for (const deck of [STARTER_DECK, BOT_DECK]) { expect(deck).not.toContain('volunteer'); expect(deckError(deck)).toBeUndefined(); }
    const deck = [...STARTER_DECK]; deck[0] = 'volunteer'; expect(deckError(deck)).toBeTruthy();
    const migrated = migrateRewardDeck(deck); expect(migrated).toHaveLength(30); expect(migrated).not.toContain('volunteer');
    expect(migrated).toContain('rash-quest'); expect(migrated.filter(id => id === 'goodgame')).toHaveLength(deck.filter(id => id === 'goodgame').length); expect(deckError(migrated)).toBeUndefined();
  });
});
