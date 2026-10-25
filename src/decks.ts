import { CARD, STARTER_DECK, deckCopyLimit, deckError, migrateRewardDeck } from './game/cards';
import { belongsToClass, HERO_CLASSES, validHeroClass, type HeroClass } from './game/classes';
import { loadDeck, read, write } from './storage';

export interface SavedDeck { id: string; name: string; heroClass: HeroClass; cards: string[] }
export interface DeckBook { version: 1; decks: SavedDeck[]; selectedId: string | null }
export const DECK_LIMIT = 18;
export const deckName = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32) || 'Без названия';
export function draftError(cards: unknown, heroClass?: HeroClass): string | undefined {
  if (!Array.isArray(cards) || cards.length > 30 || cards.some(id => typeof id !== 'string' || !Object.hasOwn(CARD, id) || CARD[id].reward || !['minion', 'spell', 'hero'].includes(CARD[id].kind))) return 'В колоде есть недоступная карта.';
  if (cards.some(id => cards.filter(x => x === id).length > deckCopyLimit(CARD[id]))) return 'Превышен лимит копий карты.';
  if (heroClass && cards.some(id => !belongsToClass(CARD[id], heroClass))) return 'Эта карта принадлежит другому классу.';
}
export function createDeck(heroClass: HeroClass, name: string, starter = true): SavedDeck {
  return { id: crypto.randomUUID(), name: deckName(name), heroClass, cards: starter ? [...STARTER_DECK] : [] };
}
export const readyDeck = (deck: SavedDeck) => validHeroClass(deck.heroClass) && !deckError(deck.cards, deck.heroClass);
export function loadDeckBook(): DeckBook {
  const saved = read<unknown>('decks', null);
  if (saved && typeof saved === 'object' && 'version' in saved && saved.version === 1 && 'decks' in saved && Array.isArray(saved.decks)) {
    const ids = new Set<string>(), decks: SavedDeck[] = [];
    for (const value of saved.decks.slice(0, DECK_LIMIT)) {
      if (!value || typeof value.id !== 'string' || !value.id || value.id.length > 100 || ids.has(value.id) || typeof value.name !== 'string' || !validHeroClass(value.heroClass) || !Array.isArray(value.cards)) continue;
      const cards: string[] = [];
      // Keep a recoverable draft if a card definition was removed externally.
      for (const id of migrateRewardDeck(value.cards.filter((id: unknown) => typeof id === 'string')).slice(0, 30)) {
        if (!draftError([...cards, id], value.heroClass)) cards.push(id);
      }
      decks.push({ id: value.id, name: deckName(value.name), heroClass: value.heroClass, cards }); ids.add(value.id);
    }
    const selectedId = 'selectedId' in saved && typeof saved.selectedId === 'string' && ids.has(saved.selectedId) ? saved.selectedId : decks[0]?.id ?? null;
    return { version: 1, decks, selectedId };
  }
  const oldClass = read<unknown>('hero-class', 'mage'), heroClass = validHeroClass(oldClass) ? oldClass : 'mage';
  const original: SavedDeck = { id: crypto.randomUUID(), name: 'Твои правила', heroClass, cards: loadDeck() };
  const others = (Object.keys(HERO_CLASSES) as HeroClass[]).filter(c => c !== heroClass).map(c => createDeck(c, 'Стартовый ' + HERO_CLASSES[c].name.toLowerCase()));
  return { version: 1, decks: [original, ...others], selectedId: original.id };
}
export function saveDeckBook(book: DeckBook): boolean { return write('decks', book); }
