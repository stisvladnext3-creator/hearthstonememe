import { describe, expect, it } from 'vitest';
import { publicRoom } from './directory';
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
