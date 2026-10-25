import { afterEach, expect, it, vi } from 'vitest';
import { PeerRoom } from './room';
import { EMPTY_ROOM, ROOM_PROTOCOL, type HostMessage, type Member } from './protocol';
import { STARTER_DECK } from '../game/cards';
import { newCustomCard, registerCardPack } from '../game/custom-cards';
import type { Game } from '../game/engine';

function channel() {
  const callbacks = new Map<string, (value?: unknown) => void>();
  const connection = { open: true, serialization: 'binary', peerConnection: undefined, send: vi.fn(), close: vi.fn(), on: (event: string, callback: (data?: unknown) => void) => { callbacks.set(event, callback); } };
  return { connection, data: (value: unknown) => callbacks.get('data')!(value), messages: () => connection.send.mock.calls.map(args => typeof args[0] === 'string' ? JSON.parse(args[0]) : args[0]) as HostMessage[] };
}
type Internals = { self: Member; canonical?: Game; acceptGuest: (channel: unknown) => void; receiveHost: (message: unknown) => void; publish: () => void; connection: unknown };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('acknowledges definitions before the mulligan starts, sends only IDs afterward, and reloads the pack on a new channel', () => {
  vi.useFakeTimers(); vi.stubGlobal('sessionStorage', { setItem: vi.fn() });
  const card = { ...newCustomCard(), heroClass: 'storm' as const }; registerCardPack([card]);
  const deck = STARTER_DECK.map(id => id === 'casino' ? card.id : id), host = new PeerRoom(vi.fn()), guest = new PeerRoom(vi.fn());
  const h = host as unknown as Internals, g = guest as unknown as Internals;
  host.state = { ...EMPTY_ROOM, role: 'host', phase: 'waiting', code: 'ABC234' }; guest.state = { ...EMPTY_ROOM, role: 'guest', code: 'ABC234' };
  h.self = { name: 'Хозяин', token: 'host-token-with-16-chars', deck, cards: [card], heroClass: 'storm' };
  const hello = { type: 'hello', protocol: ROOM_PROTOCOL, name: 'Гость', token: 'guest-token-with-16-chars', deck: STARTER_DECK, heroClass: 'mage', cards: [] };
  g.self = hello as unknown as Member;
  const first = channel(); h.acceptGuest(first.connection); first.data(hello); first.connection.send.mockClear();
  const guestChannel = channel(); g.connection = guestChannel.connection;
  try {
    host.start(); expect(h.canonical).toBeUndefined();
    const transfer = first.messages()[0]; expect(transfer.type).toBe('cards'); if (transfer.type !== 'cards') throw new Error('Missing definitions');
    first.data({ type: 'cards-ready', key: 'wrong-key' }); expect(h.canonical).toBeUndefined();
    vi.advanceTimersByTime(5000); g.receiveHost(transfer);
    const ack = guestChannel.messages()[0] as unknown as { type: string; key: string }; expect(ack.type).toBe('cards-ready'); first.data(ack);
    expect(h.canonical?.mulligan?.deadline).toBe(Date.now() + 30000);
    const snapshot = first.messages().at(-1)!; expect(snapshot.type).toBe('snapshot'); if (snapshot.type !== 'snapshot') throw new Error('Missing snapshot');
    expect(snapshot.game?.customCards).toBeUndefined(); expect(snapshot.cardIds).toEqual([card.id]);
    g.receiveHost(snapshot); expect(guest.state.game?.customCards).toEqual([card]); expect(host.state.game?.customCards).toEqual([card]);
    h.publish(); expect(first.messages().filter(m => m.type === 'cards')).toHaveLength(1);
    const second = channel(); h.acceptGuest(second.connection); second.data(hello); expect(second.messages()[0].type).toBe('cards');
    second.data(ack); expect(second.messages().at(-1)?.type).toBe('snapshot');
    const before = guest.state; g.receiveHost({ ...snapshot, revision: snapshot.revision + 1, cardIds: ['custom-missing-definition'] }); expect(guest.state).toBe(before);
  } finally { host.close(); guest.close(); vi.runOnlyPendingTimers(); }
});
