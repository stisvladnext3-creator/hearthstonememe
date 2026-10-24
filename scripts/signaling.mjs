import { PeerServer } from 'peer';
import Turn from 'node-turn';
import net from 'node:net';
import dgram from 'node:dgram';

// Loopback-only TURN/TCP bridge for browser tests in environments where policy
// disables direct UDP. This uses real ICE, DTLS and SCTP, without changing policy.
const turn = new Turn({ listeningPort: 3478, listeningIps: ['127.0.0.1'], relayIps: ['127.0.0.1'],
  minPort: 49160, maxPort: 49260, authMech: 'long-term', credentials: { memestone: 'development-only' }, debugLevel: 'NONE' });
turn.start();
net.createServer(tcp => {
  const udp = dgram.createSocket('udp4'); let buffered = Buffer.alloc(0);
  udp.on('message', packet => {
    const channel = (packet.readUInt16BE(0) & 0xc000) === 0x4000;
    tcp.write(channel && packet.length % 4 ? Buffer.concat([packet, Buffer.alloc(4 - packet.length % 4)]) : packet);
  });
  udp.bind(0, '127.0.0.1');
  tcp.on('data', chunk => {
    buffered = Buffer.concat([buffered, chunk]);
    if (buffered.length > 1024 * 1024) { tcp.destroy(); return; }
    while (buffered.length >= 4) {
      const channel = (buffered.readUInt16BE(0) & 0xc000) === 0x4000;
      const size = (channel ? 4 : 20) + buffered.readUInt16BE(2);
      const padded = channel ? Math.ceil(size / 4) * 4 : size;
      if (buffered.length < padded) break;
      udp.send(buffered.subarray(0, size), 3478, '127.0.0.1'); buffered = buffered.subarray(padded);
    }
  });
  const close = () => { try { udp.close(); } catch { /* Already closed. */ } };
  tcp.on('close', close); tcp.on('error', close); udp.on('error', () => tcp.destroy());
}).listen(3478, '127.0.0.1');
PeerServer({ host: '127.0.0.1', port: 9000, path: '/memestone', key: 'memestone', allow_discovery: false });
console.log('Local room signaling: http://127.0.0.1:9000/memestone');
