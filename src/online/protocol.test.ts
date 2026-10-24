import { describe, expect, it } from 'vitest';
import { BOT_DECK, STARTER_DECK } from '../game/cards';
import { act, type Side } from '../game/engine';
import { cleanName, createRoomGame, normalizeCode, roomCode, roomGameView, validAction, validCode, validDeck, validRoomView } from './protocol';

const make = (seed = 100) => createRoomGame(STARTER_DECK, BOT_DECK, 'Хозяин', 'Гость', seed, 'opaque-match-id');
describe('room protocol and private information', () => {
  it.each([100, 101])('both selected decks and a fair first turn survive seat assignment for seed %s', seed => {
    const g = make(seed);
    const cards = (side: Side) => [...g[side].deck, ...g[side].hand.map(c => c.id)].sort();
    expect(cards('player')).toEqual([...STARTER_DECK].sort()); expect(cards('bot')).toEqual([...BOT_DECK].sort());
    expect(g.active).toBe(seed % 2 ? 'bot' : 'player'); expect(g[g.active].mana).toBe(1); expect(g[g.active === 'player' ? 'bot' : 'player'].mana).toBe(0);
    expect(g.id).toBe('opaque-match-id'); expect(g.player.name).toBe('Хозяин'); expect(g.bot.name).toBe('Гость');
  });
  it.each<Side>(['player', 'bot'])('never transmits an opponent hand, deck order or RNG to %s', side => {
    const original = make(); const before = structuredClone(original); const v = roomGameView(original, side);
    expect(v.player.name).toBe(original[side].name); expect(v.player.hand).toEqual(original[side].hand);
    expect(v.bot.hand.every(c => c.id === 'hidden')).toBe(true); expect(v.player.deck.every(id => id === 'hidden')).toBe(true); expect(v.bot.deck.every(id => id === 'hidden')).toBe(true);
    expect(v.rng).toBe(0); expect(v.nextUid).toBe(0); expect(validRoomView(v)).toBe(true); expect(original).toEqual(before);
  });
  it('swaps active side, winner, both countdowns, discovery, history actors and animation anchors for the guest', () => {
    const g = make(); g.winner = 'bot'; g.briefing = { remainingTurns: { player: 4, bot: 2 } };
    g.discovery = { side: 'bot', sourceId: 'dog-spell', options: ['regular'], target: 'hero' };
    g.log = [{ id: 1, side: 'bot', kind: 'attack', text: 'old', actor: { type: 'hero', id: 'mage', name: 'Гость', art: 10, side: 'bot' }, target: { type: 'hero', id: 'mage', name: 'Хозяин', art: 10, side: 'player' }, amount: 1 }];
    g.events = [{ id: 1, kind: 'damage', side: 'bot', target: { side: 'player', uid: 'hero' }, amount: 1 }];
    const v = roomGameView(g, 'bot'); expect(v.active).toBe('bot'); expect(v.winner).toBe('player');
    expect(v.briefing?.remainingTurns).toEqual({ player: 2, bot: 4 }); expect(v.discovery?.side).toBe('player'); expect(v.discovery?.options).toEqual(['regular']);
    expect(v.log[0].side).toBe('player'); expect(v.log[0].actor?.side).toBe('player'); expect(v.log[0].target?.side).toBe('bot');
    expect(v.events[0]).toMatchObject({ side: 'player', target: { side: 'bot', uid: 'hero' } });
  });
  it.each<Side>(['player', 'bot'])('hides private discovery choices and draw-power cards from %s, while preserving public spells', viewer => {
    const g = make(); const secretSide = viewer === 'player' ? 'bot' : 'player';
    g.discovery = { side: secretSide, sourceId: 'dog-spell', options: ['me', 'masik'], target: 'hero' };
    g.log = [{ id: 1, side: secretSide, kind: 'discover', text: 'Выбрана ТАЙНА', target: { id: 'me', type: 'card', side: secretSide, art: 5, name: 'ТАЙНА' } },
      { id: 2, side: secretSide, kind: 'power', text: 'Добор карты', actor: { type: 'power', id: 'briefing-power', name: 'Взять карту', art: 9, side: secretSide }, target: { id: 'me', type: 'card', side: secretSide, art: 5, name: 'ТАЙНА' } }];
    const view = roomGameView(g, viewer); expect(view.discovery?.options).toEqual([]); expect(view.log.every(e => !e.target)).toBe(true);
    expect(JSON.stringify(view)).not.toContain('ТАЙНА'); expect(view.log[1].actor?.id).toBe('briefing-power');
    const owner = roomGameView(g, secretSide); expect(owner.discovery?.options).toHaveLength(2); expect(owner.log[0].target?.id).toBe('me');
  });
  it('guest actions retain UID and relative hero targets when applied by the host', () => {
    const g = make(101); g.bot.mana = g.bot.maxMana = 10; g.bot.hand = [{ id: 'bolt', uid: g.nextUid++ }];
    const guest = roomGameView(g, 'bot'); const action = { type: 'play' as const, uid: guest.player.hand[0].uid, target: 'hero' as const };
    const result = act(g, 'bot', action); expect(result.error).toBeUndefined(); expect(roomGameView(result.state, 'bot').bot.health).toBe(27); expect(result.state.bot.health).toBe(30);
    expect(act(result.state, 'bot', action).error).toBeTruthy();
  });
  it('opponent suicide and turn history do not reverse the meaning for the guest', () => {
    const g = make(101); g.bot.hand = [{ id: 'goodgame', uid: g.nextUid++ }];
    const n = act(g, 'bot', { type: 'play', uid: g.bot.hand[0].uid }).state; const view = roomGameView(n, 'bot');
    expect(view.winner).toBe('bot'); expect(view.log.at(-1)?.text).toBe('«Хорошая игра.»: герой Гость уничтожен.');
    expect(view.log.at(-1)?.text).not.toContain('Вы победили');
  });
  it.each([null, {}, { type: 'hack' }, { type: 'play', uid: -1 }, { type: 'play', uid: '5' }, { type: 'attack', uid: 1 }, { type: 'power', target: 'player' }, { type: 'discover', cardId: 'hidden' }])('rejects malformed action %j', action => expect(validAction(action)).toBe(false));
  it.each([{ type: 'end' }, { type: 'concede' }, { type: 'power', target: 'hero' }, { type: 'play', uid: 3, target: 5 }, { type: 'attack', uid: 3, target: 'hero' }, { type: 'discover', cardId: 'regular' }])('accepts supported action %j', action => expect(validAction(action)).toBe(true));
  it('validates decks, sanitizes names and produces short room codes', () => {
    expect(validDeck(STARTER_DECK)).toBe(true); expect(validDeck(['regular'])).toBe(false); expect(validDeck(Array(30).fill('unknown'))).toBe(false);
    expect(cleanName(' \nИмя\u0000 ')).toBe('Имя'); expect(cleanName('')).toBe('Игрок'); expect(cleanName('x'.repeat(40))).toHaveLength(20);
    expect(normalizeCode(' ab-c234 ')).toBe('ABC234'); for (let i = 0; i < 20; i++) expect(validCode(roomCode())).toBe(true);
    expect(validCode('ABC0O1')).toBe(false);
  });
  it('does not accept a public snapshot with exposed hands or invalid card IDs', () => {
    const v = roomGameView(make(), 'bot'); v.bot.hand[0].id = 'regular'; expect(validRoomView(v)).toBe(false);
    const bad = roomGameView(make(), 'player'); bad.player.hand[0].id = 'unknown'; expect(validRoomView(bad)).toBe(false);
  });
});
