import type { PeerOptions } from 'peerjs';

export async function peerRuntime() {
  const { Peer, util } = await import('peerjs');
  let options: PeerOptions;
  if (['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('localRooms') === '1') {
    options = { host: '127.0.0.1', port: 9000, path: '/memestone', key: 'memestone', secure: false,
      config: { iceTransportPolicy: 'relay', iceServers: [{ urls: 'turn:127.0.0.1:3478?transport=tcp', username: 'memestone', credential: 'development-only' }] } };
  } else {
    options = { config: { ...util.defaultConfig, iceServers: util.defaultConfig.iceServers.map(server => ({ ...server,
      urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).flatMap(url => url.startsWith('turn:') ? [url, `${url}?transport=tcp`] : [url]),
    })) } };
  }
  return { Peer, options };
}

export function readMessage(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  if (raw.length > 2_000_000) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
