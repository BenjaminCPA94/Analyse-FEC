/* Pont de test : API REST façon Upstash devant un vrai redis-server local (scripts Lua réellement exécutés).
 * Utilisé par les tests si redis-server est installé ; sinon le faux Upstash (mock-upstash.js) est utilisé. */
'use strict';
const http = require('node:http');
const net = require('node:net');
const { spawn, execSync } = require('node:child_process');

function available() { try { execSync('command -v redis-server', { stdio: 'ignore' }); return true; } catch { return false; } }

/* Client RESP minimal, requêtes traitées dans l'ordre. */
function client(port) {
  const sock = net.connect(port, '127.0.0.1'), queue = [];
  let buf = Buffer.alloc(0);
  const parse = (b, i) => {
    const end = b.indexOf('\r\n', i); if (end < 0) return null;
    const t = String.fromCharCode(b[i]), line = b.toString('utf8', i + 1, end), next = end + 2;
    if (t === '+') return [line, next];
    if (t === '-') return [Object.assign(new Error(line), { redis: true }), next];
    if (t === ':') return [Number(line), next];
    if (t === '$') { const n = Number(line); if (n < 0) return [null, next]; if (b.length < next + n + 2) return null; return [b.toString('utf8', next, next + n), next + n + 2]; }
    if (t === '*') { const n = Number(line); if (n < 0) return [null, next]; const arr = []; let j = next; for (let k = 0; k < n; k++) { const r = parse(b, j); if (!r) return null; arr.push(r[0]); j = r[1]; } return [arr, j]; }
    throw new Error('RESP inattendu : ' + t);
  };
  sock.on('data', d => {
    buf = Buffer.concat([buf, d]);
    for (;;) { const r = parse(buf, 0); if (!r) break; buf = buf.slice(r[1]); const q = queue.shift(); if (r[0] instanceof Error) q.reject(r[0]); else q.resolve(r[0]); }
  });
  const cmd = args => new Promise((resolve, reject) => {
    queue.push({ resolve, reject });
    sock.write('*' + args.length + '\r\n' + args.map(a => { const s = Buffer.from(String(a)); return '$' + s.length + '\r\n' + s + '\r\n'; }).join(''));
  });
  return { cmd, close: () => sock.end(), ready: new Promise(r => sock.once('connect', r)) };
}

async function start(token = 'upstash-token') {
  const port = 26000 + Math.floor(Math.random() * 2000);
  const proc = spawn('redis-server', ['--port', String(port), '--save', '', '--appendonly', 'no', '--bind', '127.0.0.1'], { stdio: 'ignore' });
  let c;
  for (let i = 0; i < 50; i++) { await new Promise(r => setTimeout(r, 100)); try { c = client(port); await Promise.race([c.ready, new Promise((_, j) => setTimeout(j, 300))]); break; } catch { c = null; } }
  if (!c) throw new Error('redis-server ne démarre pas');
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => (body += d));
    req.on('end', async () => {
      const reply = (s, x) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(x)); };
      if (req.headers.authorization !== 'Bearer ' + token) return reply(401, { error: 'Unauthorized' });
      try { const args = JSON.parse(body); calls.push(args[0]); reply(200, { result: await c.cmd(args) }); }
      catch (e) { reply(400, { error: e.message }); }
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return {
    server, calls, token, url: `http://127.0.0.1:${server.address().port}`, real: true,
    run: args => c.cmd(args),
    stop: () => { c.close(); server.close(); proc.kill(); },
  };
}
module.exports = { start, available };
