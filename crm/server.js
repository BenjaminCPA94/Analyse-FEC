#!/usr/bin/env node
/*
 * RB Partners CRM — serveur V27.
 * Node >= 18, aucune dépendance. Sert le CRM, gère les comptes, la base partagée
 * versionnée, la recherche SIREN et le pont Pennylane (les clés API restent ici,
 * jamais dans le navigateur).
 *
 *   node server.js                     démarre le serveur
 *   node server.js add-user <nom> [--admin]   crée ou réinitialise un compte
 *   node server.js list-users
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');

const ROOT = __dirname;
loadEnv(path.join(ROOT, '.env'));

const CONFIG = {
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  historySize: 30,
  pennylane: {
    apiBase: (process.env.PENNYLANE_API_BASE || 'https://app.pennylane.com/api/external/v2').replace(/\/$/, ''),
    firmBase: (process.env.PENNYLANE_FIRM_API_BASE || 'https://app.pennylane.com/api/external/firm/v1').replace(/\/$/, ''),
    cabinetToken: process.env.PENNYLANE_CABINET_TOKEN || '',
    firmToken: process.env.PENNYLANE_FIRM_TOKEN || '',
  },
};

const FILES = {
  users: path.join(CONFIG.dataDir, 'users.json'),
  state: path.join(CONFIG.dataDir, 'state.json'),
  history: path.join(CONFIG.dataDir, 'history'),
  tokens: path.join(CONFIG.dataDir, 'pennylane-dossiers.json'),
};

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

/* ---------- stockage ---------- */
function ensureDirs() {
  fs.mkdirSync(FILES.history, { recursive: true, mode: 0o700 });
}
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw new Error('Fichier illisible : ' + file + ' (' + e.message + ')');
  }
}
function writeJSON(file, value) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/* ---------- comptes ---------- */
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash };
}
function checkPassword(user, password) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
}
function users() { return readJSON(FILES.users, []); }

const sessions = new Map(); // sid -> {username, role, expires}
const failures = new Map(); // ip|user -> {count, until}

function newSession(user) {
  const sid = crypto.randomBytes(32).toString('base64url');
  sessions.set(sid, { username: user.username, role: user.role, expires: Date.now() + CONFIG.sessionHours * 3600e3 });
  return sid;
}
function currentSession(req) {
  const sid = parseCookies(req.headers.cookie || '').rb_sid;
  const s = sid && sessions.get(sid);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(sid); return null; }
  return { sid, ...s };
}
function parseCookies(header) {
  return Object.fromEntries(header.split(';').map(x => x.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function sessionCookie(req, sid, maxAge) {
  const secure = CONFIG.cookieSecure || req.headers['x-forwarded-proto'] === 'https';
  return `rb_sid=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

/* ---------- base partagée ---------- */
function loadShared() { return readJSON(FILES.state, { revision: 0, state: null, updatedAt: null, updatedBy: null }); }
let shared = null;
function saveShared(next, username) {
  if (shared.state) {
    const name = `state-r${String(shared.revision).padStart(6, '0')}.json`;
    writeJSON(path.join(FILES.history, name), shared);
    const old = fs.readdirSync(FILES.history).filter(f => f.startsWith('state-r')).sort();
    for (const f of old.slice(0, Math.max(0, old.length - CONFIG.historySize))) fs.unlinkSync(path.join(FILES.history, f));
  }
  shared = { revision: shared.revision + 1, state: next, updatedAt: new Date().toISOString(), updatedBy: username };
  writeJSON(FILES.state, shared);
  return shared.revision;
}

/* ---------- Pennylane ---------- */
function dossierTokens() { return readJSON(FILES.tokens, {}); }

class PennylaneError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function plFetch(url, token, attempt = 0) {
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 429 && attempt < 4) {
    const wait = Math.min(10, Number(res.headers.get('retry-after')) || 2 ** attempt);
    await new Promise(r => setTimeout(r, wait * 1000));
    return plFetch(url, token, attempt + 1);
  }
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) {
    const detail = body?.error || body?.message || text.slice(0, 200);
    const msg = res.status === 401 ? 'Clé API Pennylane refusée (401) : vérifie le jeton et ses droits.'
      : res.status === 403 ? 'Accès Pennylane refusé (403) : le jeton n’a pas le droit requis (scope) pour cette donnée.'
      : res.status === 404 ? 'Ressource Pennylane introuvable (404) : ' + url.replace(/\?.*/, '')
      : `Pennylane a répondu ${res.status} : ${detail}`;
    throw new PennylaneError(msg, res.status);
  }
  return body;
}

/* Parcourt toutes les pages (pagination par curseur v2, ou page/per_page en repli). */
async function plList(base, pathName, token, params = {}, maxPages = 500) {
  const items = [];
  let cursor = null, page = 1;
  for (let i = 0; i < maxPages; i++) {
    const q = new URLSearchParams({ ...params });
    q.set('limit', '100');
    if (cursor) q.set('cursor', cursor); else if (page > 1) q.set('page', String(page));
    const body = await plFetch(`${base}${pathName}?${q}`, token);
    const batch = body?.items || body?.data || (Array.isArray(body) ? body : []);
    items.push(...batch);
    if (body?.has_more && body?.next_cursor) { cursor = body.next_cursor; continue; }
    if (!cursor && body?.total_pages && body.current_page < body.total_pages) { page = body.current_page + 1; continue; }
    break;
  }
  return items;
}

const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
const cents = v => Math.round((Number(v) || 0) * 100);

function normInvoice(x) {
  const ttc = num(x.currency_amount ?? x.amount) ?? 0;
  const ht = num(x.currency_amount_before_tax ?? x.amount_before_tax) ?? ttc - (num(x.currency_tax ?? x.tax) ?? 0);
  const remaining = num(x.remaining_amount_with_tax ?? x.remaining_amount);
  return {
    plId: x.id,
    number: x.invoice_number || '',
    label: x.label || '',
    date: x.date || '',
    deadline: x.deadline || '',
    amountHT: ht,
    amountTTC: ttc,
    remainingTTC: remaining ?? (x.paid ? 0 : ttc),
    status: x.status || (x.paid ? 'paid' : ''),
    draft: Boolean(x.draft) || x.status === 'draft',
    creditNote: Boolean(x.credit_note) || ttc < 0,
    customerId: x.customer?.id ?? x.customer_id ?? null,
    customerName: x.customer?.name || '',
    url: x.public_file_url || x.public_url || '',
  };
}
function normCustomer(x) {
  return { id: x.id, name: x.name || [x.first_name, x.last_name].filter(Boolean).join(' '), siren: String(x.reg_no || '').replace(/\s/g, '').slice(0, 9), emails: x.emails || [], reference: x.external_reference || '' };
}
function normTrialBalance(items) {
  const byAccount = new Map();
  for (const x of items) {
    const account = String(x.formatted_number || x.number || x.account_number || '').replace(/\s/g, '');
    if (!account) continue;
    const row = byAccount.get(account) || { account, label: x.label || x.name || '', debit: 0, credit: 0 };
    row.debit += cents(x.debits ?? x.debit);
    row.credit += cents(x.credits ?? x.credit);
    byAccount.set(account, row);
  }
  return [...byAccount.values()].sort((a, b) => a.account.localeCompare(b.account));
}

async function trialBalanceFor(clientId, companyId, start, end) {
  const token = dossierTokens()[clientId]?.token;
  const params = { period_start: start, period_end: end };
  if (token) return { source: 'Jeton du dossier (API entreprise)', rows: normTrialBalance(await plList(CONFIG.pennylane.apiBase, '/trial_balance', token, params)) };
  if (CONFIG.pennylane.firmToken && companyId) {
    return { source: 'Jeton cabinet (API cabinet)', rows: normTrialBalance(await plList(CONFIG.pennylane.firmBase, `/companies/${encodeURIComponent(companyId)}/trial_balance`, CONFIG.pennylane.firmToken, params)) };
  }
  throw new PennylaneError('Aucun accès Pennylane pour ce dossier : renseigne son identifiant Pennylane (jeton cabinet) ou un jeton propre au dossier dans Automatisations cabinet.', 400);
}

/* ---------- HTTP ---------- */
let INDEX = '';
function buildIndex() {
  const base = fs.readFileSync(path.join(ROOT, 'src', 'crm_v26.html'), 'utf8');
  const v27 = fs.readFileSync(path.join(ROOT, 'src', 'v27_pennylane.js'), 'utf8');
  const i = base.lastIndexOf('</body>');
  if (i < 0) throw new Error('crm_v26.html : balise </body> introuvable');
  return base.slice(0, i) + '<script>\n' + v27 + '\n</script>\n' + base.slice(i);
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

function send(res, status, body, headers = {}) {
  const isText = typeof body === 'string';
  res.writeHead(status, { ...SECURITY_HEADERS, 'Cache-Control': 'no-store', 'Content-Type': isText ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8', ...headers });
  res.end(isText ? body : JSON.stringify(body));
}

function readBody(req, limit = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Données trop volumineuses'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('JSON invalide'), { status: 400 })); } });
    req.on('error', reject);
  });
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function validState(s) {
  return s && typeof s === 'object' && Array.isArray(s.clients) && Array.isArray(s.prospects) && Array.isArray(s.invoices) && Array.isArray(s.time)
    && ['onboarding', 'fiscal', 'closing', 'legal'].every(k => Array.isArray(s[k]));
}

const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

const routes = {
  'POST /api/login': async (req, res) => {
    const { username = '', password = '' } = await readBody(req, 10_000);
    const key = (req.socket.remoteAddress || '') + '|' + String(username).toLowerCase();
    const f = failures.get(key);
    if (f && f.count >= 5 && f.until > Date.now()) return send(res, 429, { error: 'Trop de tentatives. Réessaie dans 15 minutes.' });
    const user = users().find(u => u.username.toLowerCase() === String(username).toLowerCase());
    if (!user || !checkPassword(user, String(password))) {
      const n = f && f.until > Date.now() ? f.count + 1 : 1;
      failures.set(key, { count: n, until: Date.now() + 15 * 60e3 });
      return send(res, 401, { error: 'Identifiants incorrects' });
    }
    failures.delete(key);
    const sid = newSession(user);
    send(res, 200, { username: user.username, role: user.role }, { 'Set-Cookie': sessionCookie(req, sid, CONFIG.sessionHours * 3600) });
  },
  'POST /api/logout': async (req, res, s) => {
    sessions.delete(s.sid);
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  },
  'GET /api/session': async (req, res, s) => send(res, 200, { username: s.username, role: s.role }),
  'GET /api/state': async (req, res) => send(res, 200, { revision: shared.revision, state: shared.state, updatedAt: shared.updatedAt, updatedBy: shared.updatedBy }),
  'PUT /api/state': async (req, res, s) => {
    const body = await readBody(req);
    if (Number(body.revision) !== shared.revision) return send(res, 409, { error: `Les données ont été modifiées par ${shared.updatedBy || 'un autre utilisateur'} : recharge avant de continuer.` });
    if (!validState(body.state)) return send(res, 400, { error: 'Structure de données invalide' });
    send(res, 200, { revision: saveShared(body.state, s.username) });
  },
  'GET /api/company': async (req, res, s, url) => {
    const siren = url.searchParams.get('siren') || '';
    if (!/^\d{9}$/.test(siren)) return send(res, 400, { error: 'SIREN invalide' });
    const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${siren}&per_page=1`, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
    if (!r.ok) return send(res, r.status === 429 ? 429 : 502, { error: 'Service de recherche indisponible' });
    send(res, 200, await r.json());
  },

  /* --- Pennylane --- */
  'GET /api/pennylane/status': async (req, res) => {
    const t = dossierTokens();
    send(res, 200, {
      cabinet: Boolean(CONFIG.pennylane.cabinetToken),
      firm: Boolean(CONFIG.pennylane.firmToken),
      dossierTokens: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { addedAt: v.addedAt, addedBy: v.addedBy }])),
    });
  },
  'POST /api/pennylane/test': async (req, res) => {
    const out = {};
    if (CONFIG.pennylane.cabinetToken) {
      try { const me = await plFetch(CONFIG.pennylane.apiBase + '/me', CONFIG.pennylane.cabinetToken); out.cabinet = { ok: true, company: me?.company?.name || '', user: me?.user?.email || '' }; }
      catch (e) { out.cabinet = { ok: false, error: e.message }; }
    } else out.cabinet = { ok: false, error: 'PENNYLANE_CABINET_TOKEN non renseigné' };
    if (CONFIG.pennylane.firmToken) {
      try { const b = await plFetch(CONFIG.pennylane.firmBase + '/companies?limit=1', CONFIG.pennylane.firmToken); out.firm = { ok: true, sample: (b?.items || b?.data || [])[0]?.name || '' }; }
      catch (e) { out.firm = { ok: false, error: e.message }; }
    } else out.firm = { ok: false, error: 'PENNYLANE_FIRM_TOKEN non renseigné' };
    send(res, 200, out);
  },
  'GET /api/pennylane/customers': async (req, res) => {
    if (!CONFIG.pennylane.cabinetToken) throw new PennylaneError('PENNYLANE_CABINET_TOKEN non renseigné sur le serveur.', 400);
    send(res, 200, { items: (await plList(CONFIG.pennylane.apiBase, '/customers', CONFIG.pennylane.cabinetToken)).map(normCustomer) });
  },
  'GET /api/pennylane/invoices': async (req, res, s, url) => {
    if (!CONFIG.pennylane.cabinetToken) throw new PennylaneError('PENNYLANE_CABINET_TOKEN non renseigné sur le serveur.', 400);
    const from = url.searchParams.get('from');
    const params = isDate(from) ? { filter: JSON.stringify([{ field: 'date', operator: 'gteq', value: from }]) } : {};
    const [invoices, customers] = await Promise.all([
      plList(CONFIG.pennylane.apiBase, '/customer_invoices', CONFIG.pennylane.cabinetToken, params),
      plList(CONFIG.pennylane.apiBase, '/customers', CONFIG.pennylane.cabinetToken),
    ]);
    const items = invoices.map(normInvoice).filter(i => !isDate(from) || i.date >= from);
    send(res, 200, { items, customers: customers.map(normCustomer), fetchedAt: new Date().toISOString() });
  },
  'GET /api/pennylane/companies': async (req, res) => {
    if (!CONFIG.pennylane.firmToken) throw new PennylaneError('PENNYLANE_FIRM_TOKEN non renseigné sur le serveur.', 400);
    const items = await plList(CONFIG.pennylane.firmBase, '/companies', CONFIG.pennylane.firmToken);
    send(res, 200, { items: items.map(x => ({ id: x.id, name: x.name || '', siren: String(x.reg_no || x.siren || '').replace(/\s/g, '').slice(0, 9) })) });
  },
  'GET /api/pennylane/trial-balance': async (req, res, s, url) => {
    const q = Object.fromEntries(url.searchParams);
    if (!q.client || !isDate(q.start) || !isDate(q.end) || q.start > q.end) return send(res, 400, { error: 'Paramètres client, start et end (AAAA-MM-JJ) requis' });
    send(res, 200, { ...(await trialBalanceFor(q.client, q.companyId, q.start, q.end)), start: q.start, end: q.end, fetchedAt: new Date().toISOString() });
  },
  'PUT /api/pennylane/dossier-token': async (req, res, s) => {
    if (s.role !== 'admin') return send(res, 403, { error: 'Réservé aux administrateurs' });
    const { client, token } = await readBody(req, 10_000);
    if (!client || typeof client !== 'string') return send(res, 400, { error: 'Client requis' });
    const t = dossierTokens();
    if (token) {
      try { await plFetch(CONFIG.pennylane.apiBase + '/me', String(token).trim()); }
      catch (e) { return send(res, 400, { error: 'Jeton refusé par Pennylane : ' + e.message }); }
      t[client] = { token: String(token).trim(), addedAt: new Date().toISOString(), addedBy: s.username };
    } else delete t[client];
    writeJSON(FILES.tokens, t);
    send(res, 200, { ok: true });
  },
};

async function handle(req, res) {
  const url = new URL(req.url, 'http://local');
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return send(res, 200, INDEX);
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) return send(res, 404, { error: 'Introuvable' });
  if (req.method !== 'GET') {
    if (!sameOrigin(req)) return send(res, 403, { error: 'Origine refusée' });
    if (!String(req.headers['content-type'] || '').includes('application/json') && url.pathname !== '/api/logout') return send(res, 415, { error: 'JSON attendu' });
  }
  const s = url.pathname === '/api/login' ? null : currentSession(req);
  if (url.pathname !== '/api/login' && !s) return send(res, 401, { error: 'Session expirée' });
  try { await route(req, res, s, url); }
  catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? (e instanceof PennylaneError && e.status >= 500 ? 502 : e.status) : 500;
    if (status >= 500) console.error(new Date().toISOString(), req.method, url.pathname, e);
    if (!res.headersSent) send(res, status, { error: e.name === 'TimeoutError' ? 'Le service distant n’a pas répondu à temps.' : e.message });
  }
}

/* ---------- CLI ---------- */
function ask(question, hidden) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = s => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, a => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a); });
  });
}

async function cli(args) {
  ensureDirs();
  if (args[0] === 'add-user') {
    const username = args[1];
    if (!username || !/^[A-Za-z0-9._-]{2,40}$/.test(username)) throw new Error('Usage : node server.js add-user <nom> [--admin]');
    const password = process.env.RB_PASSWORD || await ask('Mot de passe (12 caractères minimum) : ', true);
    if (password.length < 12) throw new Error('Mot de passe trop court (12 caractères minimum).');
    const list = users().filter(u => u.username.toLowerCase() !== username.toLowerCase());
    list.push({ username, role: args.includes('--admin') ? 'admin' : 'user', ...hashPassword(password), createdAt: new Date().toISOString() });
    writeJSON(FILES.users, list);
    console.log(`Compte « ${username} » enregistré (${args.includes('--admin') ? 'admin' : 'user'}).`);
    return true;
  }
  if (args[0] === 'list-users') {
    for (const u of users()) console.log(`${u.username}\t${u.role}\t${u.createdAt || ''}`);
    return true;
  }
  return false;
}

async function main() {
  if (await cli(process.argv.slice(2))) return;
  ensureDirs();
  shared = loadShared();
  INDEX = buildIndex();
  if (!users().length) console.warn('Aucun compte : crée-en un avec « node server.js add-user <nom> --admin ».');
  setInterval(() => { const now = Date.now(); for (const [k, v] of sessions) if (v.expires < now) sessions.delete(k); }, 3600e3).unref();
  http.createServer((req, res) => { handle(req, res).catch(e => { console.error(e); if (!res.headersSent) send(res, 500, { error: 'Erreur serveur' }); }); })
    .listen(CONFIG.port, CONFIG.host, () => {
      console.log(`RB Partners CRM V27 sur http://localhost:${CONFIG.port}`);
      console.log(`Pennylane — cabinet : ${CONFIG.pennylane.cabinetToken ? 'configuré' : 'non configuré'} · API cabinet : ${CONFIG.pennylane.firmToken ? 'configurée' : 'non configurée'}`);
    });
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { normInvoice, normCustomer, normTrialBalance, plList, buildIndex };
