import type { PeerOptions } from 'peerjs';

export const localRooms = () => ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('localRooms') === '1';

export async function peerRuntime() {
  if (localRooms()) {
    const { Peer } = await import('peerjs');
    const options: PeerOptions = { host: '127.0.0.1', port: 9000, path: '/memestone', key: 'memestone', secure: false,
      config: { iceTransportPolicy: 'relay', iceServers: [{ urls: 'turn:127.0.0.1:3478?transport=tcp', username: 'memestone', credential: 'development-only' }] } };
    return { Peer, options };
  }
  const { RelayPeer } = await import('./relay');
  // Implements the connection/event subset consumed by PeerRoom. Keep the
  // game protocol and its private-state projection independent of transport.
  return { Peer: RelayPeer as unknown as typeof import('peerjs').Peer, options: {} as PeerOptions };
}

export function readMessage(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  if (raw.length > 2_000_000) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
