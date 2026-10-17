/* Vérifie le point d'entrée Vercel (api/index.js) : corps déjà analysé dans req.body, base Upstash. */
'use strict';
const http = require('node:http');
const assert = require('node:assert/strict');
const upstash = require('./mock-upstash');

(async () => {
  // Sans base de données : message de configuration explicite.
  process.env.VERCEL = '1';
  delete require.cache[require.resolve('../api/index.js')];
  let handler = require('../api/index.js');
  const call = (h, method, url, body, cookie) => new Promise(resolve => {
    const req = Object.assign(new http.IncomingMessage(null), { method, url, headers: { host: 'crm.vercel.app', 'x-forwarded-proto': 'https', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
    if (body !== undefined) req.body = body;
    const res = new http.ServerResponse(req), chunks = [];
    let head = {};
    res.writeHead = (status, h) => { res.statusCode = status; head = h || {}; return res; };
    res.write = c => { chunks.push(Buffer.from(c)); return true; };
    res.end = c => { if (c) chunks.push(Buffer.from(c)); resolve({ status: res.statusCode, headers: head, text: Buffer.concat(chunks).toString() }); };
    h(req, res);
  });
  let r = await call(handler, 'GET', '/');
  assert.equal(r.status, 500); assert.match(r.text, /Upstash for Redis/);

  const kv = await upstash.start();
  Object.assign(process.env, { KV_REST_API_URL: kv.url, KV_REST_API_TOKEN: kv.token, ADMIN_USERNAME: 'benjamin', ADMIN_PASSWORD: 'motdepasse-test-123' });
  delete require.cache[require.resolve('../api/index.js')];
  handler = require('../api/index.js');
  r = await call(handler, 'GET', '/');
  assert.equal(r.status, 200); assert.match(r.text, /suiviPage27/);
  r = await call(handler, 'POST', '/api/login', { username: 'benjamin', password: 'motdepasse-test-123' });
  assert.equal(r.status, 200);
  const cookie = String(r.headers['Set-Cookie']).split(';')[0];
  assert.match(String(r.headers['Set-Cookie']), /Secure/);
  const state = { clients: [], prospects: [], invoices: [], time: [], onboarding: [], fiscal: [], closing: [], legal: [] };
  r = await call(handler, 'PUT', '/api/state', { revision: 0, state }, cookie);
  assert.equal(r.status, 200, r.text);
  r = await call(handler, 'GET', '/api/state', undefined, cookie);
  assert.equal(JSON.parse(r.text).revision, 1);
  kv.server.close();
  console.log('✓ Point d’entrée Vercel : configuration manquante signalée, page servie, connexion, enregistrement');
})().catch(e => { console.error('✗ ÉCHEC :', e.message); process.exit(1); });
