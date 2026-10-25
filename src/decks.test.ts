import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDeck, DECK_LIMIT, draftError, loadDeckBook, readyDeck, saveDeckBook } from './decks';
import { STARTER_DECK } from './game/cards';
import { act, createGame } from './game/engine';

let saved: Map<string, string>;
beforeEach(() => { saved = new Map(); vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) }); });
afterEach(() => vi.unstubAllGlobals());
it('migrates the old deck and its chosen class without losing its composition', () => {
  const old = STARTER_DECK.map(id => id === 'casino' ? 'heal' : id);
  saved.set('memestone.v1.deck', JSON.stringify(old)); saved.set('memestone.v1.hero-class', JSON.stringify('warrior'));
  const book = loadDeckBook(); expect(book.decks).toHaveLength(4); expect(book.decks[0]).toMatchObject({ name: 'Твои правила', heroClass: 'warrior', cards: old }); expect(book.selectedId).toBe(book.decks[0].id);
  expect(new Set(book.decks.map(d => d.heroClass)).size).toBe(4);
  saveDeckBook(book); expect(loadDeckBook()).toEqual(book);
});
it('keeps independent same-class decks, names, selection and incomplete drafts across reload', () => {
  const a = createDeck('warlock', 'Контроль'), b = createDeck('warlock', 'Агро', false); b.cards = ['regular'];
  saveDeckBook({ version: 1, decks: [a, b], selectedId: b.id }); const book = loadDeckBook();
  expect(book.decks).toEqual([a, b]); expect(book.selectedId).toBe(b.id); expect(readyDeck(b)).toBe(false); expect(readyDeck(a)).toBe(true);
  book.decks[1].cards.push('heal'); expect(book.decks[0].cards).toEqual(STARTER_DECK);
});
it('can persist an empty library after deleting all decks without remigrating the old deck', () => {
  saveDeckBook({ version: 1, decks: [], selectedId: null }); expect(loadDeckBook()).toEqual({ version: 1, decks: [], selectedId: null });
});
it('validates collectible cards and rarity limits for drafts as well as ready decks', () => {
  expect(draftError(['life-tap'])).toBeTruthy(); expect(draftError(['volunteer'])).toBeTruthy(); expect(draftError(['paper'])).toBeTruthy(); expect(draftError(['unknown'])).toBeTruthy();
  expect(draftError(['galinka', 'galinka'])).toBeTruthy(); expect(draftError(Array(4).fill('regular'))).toBeTruthy(); expect(draftError([])).toBeUndefined();
});
it('repairs removed definitions into an editable draft and replaces missing selected IDs', () => {
  const deck = createDeck('mage', '  Имя  '); deck.cards[0] = 'missing-card';
  saved.set('memestone.v1.decks', JSON.stringify({ version: 1, decks: [deck, { ...deck, heroClass: 'unknown' }], selectedId: 'missing' }));
  const book = loadDeckBook(); expect(book.decks).toHaveLength(1); expect(book.decks[0].cards).toHaveLength(29); expect(readyDeck(book.decks[0])).toBe(false); expect(book.selectedId).toBe(deck.id); expect(book.decks[0].name).toBe('Имя');
});
it('caps names, rejects duplicate IDs and respects the library limit', () => {
  const deck = createDeck('warrior', 'x'.repeat(100)); expect(deck.name.length).toBe(32);
  saveDeckBook({ version: 1, decks: [deck, deck, ...Array.from({ length: DECK_LIMIT }, () => createDeck('mage', 'Маг'))], selectedId: deck.id });
  const book = loadDeckBook(); expect(book.decks.length).toBeLessThanOrEqual(DECK_LIMIT); expect(book.decks.filter(d => d.id === deck.id)).toHaveLength(1);
});
it('starts a match with the selected deck composition and class, and does not mutate the saved deck', () => {
  const deck = createDeck('warlock', 'Своя колода'); deck.cards = deck.cards.map(id => id === 'casino' ? 'heal' : id);
  const g = createGame(deck.cards, 45, undefined, undefined, { player: deck.heroClass });
  expect(g.player.hero).toBe('warlock'); expect([...g.player.hand.map(c => c.id), ...g.player.deck].sort()).toEqual([...deck.cards].sort());
  const before = structuredClone(deck); g.player.mana = 10; const r = act(g, 'player', { type: 'power' }); expect(r.error).toBeUndefined(); expect(deck).toEqual(before);
});
