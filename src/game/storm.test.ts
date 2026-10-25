import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD, STARTER_DECK, deckError, type CardDef } from './cards';
import { act, activePower, chooseBotAction, createGame, other, powerProblem, targetNeeded, type Side } from './engine';
import { belongsToClass, matchesClass } from './classes';
import { copyCardTemplate } from './custom-presets';
import { newCustomCard, packForCards, registerCardPack, validateCardPack } from './custom-cards';
import { JSON_IMPORT_LIMIT, normalizeCustomCard, PACK_LIMIT } from './custom-schema';
import { createRoomGame, roomGameView, validDeck, validRoomView } from '../online/protocol';
import { readMessage } from '../online/transport';
import { loadGame } from '../storage';
import { createDeck, draftError, readyDeck } from '../decks';

function setup(side: Side = 'player') {
  const g = createGame(undefined, 222, undefined, undefined, { player: 'storm', bot: 'storm' }); g.active = side;
  for (const owner of ['player', 'bot'] as const) Object.assign(g[owner], { mana: 10, maxMana: 10, hand: [], board: [], deck: ['regular', 'heal'] });
  return g;
}
afterEach(() => vi.unstubAllGlobals());
describe.each<Side>(['player', 'bot'])('storm herald for %s', side => {
  it('summons an unready 2/1 elemental for exactly two mana once per turn with matching history and events', () => {
    const g = setup(side); expect(targetNeeded(g)).toBe(false); const r = act(g, side, { type: 'power' }); expect(r.error).toBeUndefined();
    expect(r.state[side]).toMatchObject({ hero: 'storm-herald', power: 'storm', mana: 8, powerUsed: true });
    expect(r.state[side].board).toEqual([expect.objectContaining({ id: 'storm-elemental', attack: 2, health: 1, ready: false, createdBy: 'storm-power' })]);
    expect(r.state.log.at(-1)).toMatchObject({ kind: 'power', actor: { id: 'storm-power', side }, target: { id: 'storm-elemental', side } });
    expect(r.state.events.some(e => e.kind === 'power' && e.cardId === 'storm-power')).toBe(true); expect(r.state.events.some(e => e.kind === 'summon' && e.cardId === 'storm-elemental')).toBe(true);
    expect(act(r.state, side, { type: 'power' }).error).toContain('использована'); expect(g[side].board).toEqual([]);
    let next = act(r.state, side, { type: 'end' }).state; next = act(next, other(side), { type: 'end' }).state;
    expect(next[side].board[0].ready).toBe(true);
  });
  it('rejects a full board before spending resources, and respects silence and insufficient mana', () => {
    const g = setup(side); g[side].mana = 1; expect(powerProblem(g, side)).toContain('2 маны');
    g[side].mana = 10; g[side].powerSilenceTurns = 2; expect(act(g, side, { type: 'power' }).error).toContain('немотой');
    g[side].powerSilenceTurns = 0;
    const summon = act(g, side, { type: 'power' }).state[side].board[0]; g[side].board = Array.from({ length: 7 }, () => ({ ...summon, uid: g.nextUid++ }));
    const r = act(g, side, { type: 'power' }); expect(r.error).toContain('нет места'); expect(r.state).toBe(g); expect(g[side].mana).toBe(10);
  });
  it('uses the briefing power while the original storm power is temporarily replaced', () => {
    const g = setup(side); g.briefing = { remainingTurns: { player: 1, bot: 1 } };
    expect(activePower(g, side)).toBe('briefing'); const r = act(g, side, { type: 'power' });
    expect(r.state[side].board).toHaveLength(0); expect(r.state[side].hand).toHaveLength(1); expect(r.state[side].power).toBe('storm');
  });
});
it('lets the bot summon and preserves the result in a saved game', () => {
  const g = setup('bot'), r = act(g, 'bot', chooseBotAction(g)); expect(r.error).toBeUndefined(); expect(r.state.bot.board[0].id).toBe('storm-elemental');
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(r.state) }); expect(loadGame()?.bot.power).toBe('storm');
});
it('copies the power into the editor as a summon and preserves its class', () => {
  const power = copyCardTemplate(CARD['storm-power']); registerCardPack([power]); const g = setup(); g.customCards = packForCards([power.id]); g.player.power = power.id;
  expect(power.heroClass).toBe('storm'); const r = act(g, 'player', { type: 'power' }); expect(r.error).toBeUndefined(); expect(r.state.player.board[0]).toMatchObject({ attack: 2, health: 1 });
});
it.each([0, 1])('keeps class cards and storm ownership correct in either room seat order (seed %s)', seed => {
  const card = { ...newCustomCard(), heroClass: 'storm' as const, name: 'Свой шторм' }; registerCardPack([card]);
  const deck = STARTER_DECK.map(id => id === 'regular' ? card.id : id);
  for (const seat of ['host', 'guest'] as const) {
    const g = createRoomGame(seat === 'host' ? deck : STARTER_DECK, seat === 'guest' ? deck : STARTER_DECK, 'Хозяин', 'Гость', seed, 'storm-room', undefined, { host: seat === 'host' ? 'storm' : 'mage', guest: seat === 'guest' ? 'storm' : 'mage' });
    const side = seat === 'host' ? 'player' : 'bot'; expect([...g[side].deck, ...g[side].hand.map(c => c.id)]).toContain(card.id);
    expect(g[side].hero).toBe('storm-herald'); expect(validRoomView(roomGameView(g, side))).toBe(true);
  }
});
it('keeps older cards neutral and consistently filters class cards without treating a tribe as a class', () => {
  expect(matchesClass(CARD.jaina, 'neutral')).toBe(true); expect(matchesClass(CARD.rash, 'neutral')).toBe(true);
  expect(matchesClass(CARD['storm-power'], 'storm')).toBe(true); expect(matchesClass(CARD['storm-elemental'], 'class')).toBe(true);
  expect(matchesClass(CARD['storm-elemental'], 'mage')).toBe(false); expect(matchesClass(CARD['storm-elemental'], 'neutral')).toBe(false);
});
it('preserves class assignments in JSON normalization and rejects unknown classes', () => {
  const c = { ...newCustomCard(), heroClass: 'storm' as const }; expect(normalizeCustomCard(c)?.heroClass).toBe('storm');
  expect(normalizeCustomCard({ ...c, heroClass: 'unknown' })).toBeNull(); delete (c as CardDef).heroClass; expect(normalizeCustomCard(c)?.heroClass).toBeUndefined();
});
it('allows common and own-class deck cards and rejects other classes before matchmaking', () => {
  const card = { ...newCustomCard(), heroClass: 'storm' as const }; registerCardPack([card]); const deck = createDeck('storm', 'Буря'); deck.cards[0] = card.id;
  expect(readyDeck(deck)).toBe(true); expect(draftError(deck.cards, 'mage')).toBeTruthy(); expect(deckError(deck.cards, 'mage')).toBeTruthy();
  expect(validDeck(deck.cards, 'mage')).toBe(false); expect(validDeck(deck.cards, 'storm')).toBe(true); expect(belongsToClass(CARD.regular, 'storm')).toBe(true);
});
it('accepts normalized packs above the old 600 KB limit and below 2000 KB, rejecting larger packs', () => {
  const cards = Array.from({ length: 40 }, () => { const c = newCustomCard(); c.editor!.image = 'data:image/png;base64,' + 'A'.repeat(43_500); return c; });
  const bytes = new TextEncoder().encode(JSON.stringify(cards)).length; expect(bytes).toBeGreaterThan(1_700_000); expect(bytes).toBeLessThan(PACK_LIMIT);
  expect(validateCardPack(cards)).toHaveLength(40); expect(JSON_IMPORT_LIMIT).toBe(2_000_000);
  expect(() => validateCardPack([...cards, ...Array.from({ length: 8 }, () => { const c = newCustomCard(); c.editor!.image = cards[0].editor!.image; return c; })])).toThrow('2000 КБ');
});
it('keeps room envelopes large enough for an imported pack plus match state', () => {
  const message = JSON.stringify({ cards: 'x'.repeat(2_050_000) }); expect(readMessage(message)).toEqual({ cards: 'x'.repeat(2_050_000) });
  expect(readMessage('x'.repeat(6_000_001))).toBeNull();
});
