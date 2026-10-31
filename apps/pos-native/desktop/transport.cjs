const net = require('node:net');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const local = host => {
  const p = String(host).split('.').map(Number);
  return net.isIPv4(host) && (p[0] === 10 || p[0] === 192 && p[1] === 168 || p[0] === 172 && p[1] >= 16 && p[1] <= 31 || p[0] === 169 && p[1] === 254);
};
function readLine(socket, done) {
  let buffer = '', finished = false;
  const finish = (error, value) => { if (finished) return; finished = true; socket.removeListener('data', data); done(error, value); };
  const data = chunk => {
    buffer += chunk.toString('utf8');
    if (Buffer.byteLength(buffer) > 100000) return finish(Error('Message too large'));
    const end = buffer.indexOf('\n');
    if (end >= 0) finish(null, buffer.slice(0, end));
  };
  socket.setTimeout(5000, () => socket.destroy(Error('Connection timed out')));
  socket.on('data', data);
  socket.once('error', error => finish(error));
  socket.once('end', () => finish(Error('Connection closed')));
}
class LocalLink {
  constructor(notify) { this.notify = notify; this.pending = new Map(); this.server = null; }
  async start() {
    await this.stop();
    this.server = net.createServer(socket => {
      if (!local(socket.remoteAddress) || this.pending.size >= 8) return socket.destroy();
      const id = randomUUID(); this.pending.set(id, socket);
      socket.once('close', () => this.pending.delete(id));
      readLine(socket, (error, payload) => error ? socket.destroy() : this.notify({ id, payload }));
    });
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(19741, '0.0.0.0', resolve);
    });
    return { port: this.server.address().port, addresses: Object.values(os.networkInterfaces()).flat().filter(a => a.family === 'IPv4' && !a.internal && local(a.address)).map(a => a.address) };
  }
  async stop() {
    for (const socket of this.pending.values()) socket.destroy(); this.pending.clear();
    if (this.server) { const server = this.server; this.server = null; await new Promise(resolve => server.close(resolve)); }
    return {};
  }
  async reply({ id, payload }) {
    if (typeof payload !== 'string' || Buffer.byteLength(payload) > 100000 || payload.includes('\n')) throw Error('Invalid message');
    const socket = this.pending.get(id); this.pending.delete(id);
    if (socket) socket.end(payload + '\n');
    return {};
  }
  async exchange({ host, port, payload }) {
    if (!local(host) || !Number.isInteger(port) || port < 1024 || port > 65535 || typeof payload !== 'string' || Buffer.byteLength(payload) > 100000 || payload.includes('\n')) throw Error('Invalid local connection');
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      readLine(socket, (error, value) => { socket.destroy(); error ? reject(error) : resolve({ payload: value }); });
      socket.once('connect', () => socket.write(payload + '\n'));
    });
  }
}
module.exports = { LocalLink, local, readLine };
