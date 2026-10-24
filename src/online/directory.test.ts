import { describe, expect, it, vi } from 'vitest';
import type { Peer } from 'peerjs';
import { publicRoom, RoomAdvertisement } from './directory';
import { readMessage } from './transport';

describe('public room metadata', () => {
  it('never includes a deck, seat token or game state in a listing', () => {
    expect(publicRoom({ code: 'ABC234', hostName: 'Хозяин', token: 'private', deck: ['secret'], game: { rng: 123 } }))
      .toEqual({ code: 'ABC234', hostName: 'Хозяин' });
  });
  it.each([null, 10, {}, { code: 'bad', hostName: 'Хозяин' }, { code: 'ABC234', hostName: 5 }, { code: 'ABC234', hostName: 'x'.repeat(21) }])('rejects malformed listing %j', value => {
    expect(publicRoom(value)).toBeNull();
  });
  it('cleans display names and accepts only complete wire messages', () => {
    expect(publicRoom({ code: 'ABC234', hostName: ' \nИмя\u0000 ' })).toEqual({ code: 'ABC234', hostName: 'Имя' });
    expect(readMessage('{broken')).toBeNull(); expect(readMessage(' '.repeat(2_000_001))).toBeNull();
    expect(readMessage('{"type":"rooms","rooms":[]}')).toEqual({ type: 'rooms', rooms: [] });
  });
});

describe('withdrawing a public room', () => {
  it.each(['private', 'closed'])('flushes a withdrawal before closing the channel when a room becomes %s', state => {
    vi.useFakeTimers();
    try {
      const handlers: Record<string, () => void> = {};
      const connection = { open: true, send: vi.fn(), close: vi.fn(), on: vi.fn((event: string, handler: () => void) => { handlers[event] = handler; }) };
      const peer = { destroyed: false, disconnected: false, connect: vi.fn(() => connection) };
      const advertisement = new RoomAdvertisement(peer as unknown as Peer);
      advertisement.set({ code: 'ABC234', hostName: 'Хозяин' }); handlers.open();
      expect(JSON.parse(connection.send.mock.lastCall![0]).type).toBe('advertise');
      if (state === 'closed') advertisement.close(); else advertisement.set(null);
      expect(JSON.parse(connection.send.mock.lastCall![0]).type).toBe('withdraw');
      expect(connection.close).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100); expect(connection.close).toHaveBeenCalledOnce();
      const sent = connection.send.mock.calls.length;
      vi.advanceTimersByTime(30_000); expect(connection.send).toHaveBeenCalledTimes(sent);
      advertisement.close();
    } finally { vi.useRealTimers(); }
  });
});
