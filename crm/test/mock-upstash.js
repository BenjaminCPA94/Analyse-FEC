/* Faux Upstash Redis (API REST) pour les tests : commandes utilisées par lib/app.js. */
'use strict';
const http = require('node:http');

function start(token = 'upstash-token') {
  const kv = new Map(), exp = new Map(), calls = [];
  const alive = k => { if (exp.has(k) && exp.get(k) < Date.now()) { kv.delete(k); exp.delete(k); } return kv.has(k); };
  const get = k => (alive(k) ? kv.get(k) : null);
  const run = ([cmd, ...a]) => {
    switch (cmd.toUpperCase()) {
      case 'GET': return get(a[0]);
      case 'MGET': return a.map(get);
      case 'SET': {
        const nx = a.includes('NX'), px = a.indexOf('PX');
        if (nx && alive(a[0])) return null;
        kv.set(a[0], a[1]); exp.delete(a[0]);
        if (px > 0) exp.set(a[0], Date.now() + Number(a[px + 1]));
        return 'OK';
      }
      case 'MSET': for (let i = 0; i < a.length; i += 2) { kv.set(a[i], a[i + 1]); exp.delete(a[i]); } return 'OK';
      case 'DEL': return a.filter(k => { const h = alive(k); kv.delete(k); exp.delete(k); return h; }).length;
      case 'INCR': { const n = Number(get(a[0]) || 0) + 1; kv.set(a[0], String(n)); return n; }
      case 'EXPIRE': if (!alive(a[0])) return 0; exp.set(a[0], Date.now() + Number(a[1]) * 1000); return 1;
      case 'LPUSH': { const l = get(a[0]) || []; l.unshift(...a.slice(1).reverse()); kv.set(a[0], l); return l.length; }
      case 'LTRIM': { const l = get(a[0]) || []; kv.set(a[0], l.slice(Number(a[1]), Number(a[2]) + 1)); return 'OK'; }
      case 'LLEN': return (get(a[0]) || []).length;
      case 'LRANGE': { const l = get(a[0]) || [], e = Number(a[2]); return l.slice(Number(a[1]), e < 0 ? l.length + e + 1 : e + 1); }
      default: throw new Error('ERR unknown command ' + cmd);
    }
  };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const reply = (s, x) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(x)); };
      if (req.headers.authorization !== 'Bearer ' + token) return reply(401, { error: 'Unauthorized' });
      try { const args = JSON.parse(body); calls.push(args[0]); reply(200, { result: run(args) }); }
      catch (e) { reply(400, { error: e.message }); }
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, kv, calls, token, url: `http://127.0.0.1:${server.address().port}`, run })));
}
module.exports = { start };
