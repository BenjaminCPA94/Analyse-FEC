/*
 * RB Partners CRM — cœur du serveur V27 (commun au serveur local et à Vercel).
 * Aucune dépendance. Sert le CRM, gère les comptes, la base partagée versionnée,
 * la recherche SIREN et le pont Pennylane (les clés API restent côté serveur).
 *
 * Stockage :
 *  - fichiers dans data/ (serveur local) ;
 *  - Upstash Redis via son API REST (Vercel) dès que KV_REST_API_URL / KV_REST_API_TOKEN
 *    (ou UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) sont définies.
 * Sessions : cookie signé (HMAC), sans état côté serveur.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const HISTORY_SIZE = 30;

function config() {
  return {
    dataDir: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    sessionHours: Number(process.env.SESSION_HOURS || 12),
    redisUrl: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, ''),
    redisToken: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
    pennylane: {
      apiBase: (process.env.PENNYLANE_API_BASE || 'https://app.pennylane.com/api/external/v2').replace(/\/$/, ''),
      firmBase: (process.env.PENNYLANE_FIRM_API_BASE || 'https://app.pennylane.com/api/external/firm/v1').replace(/\/$/, ''),
      cabinetToken: process.env.PENNYLANE_CABINET_TOKEN || '',
      firmToken: process.env.PENNYLANE_FIRM_TOKEN || '',
    },
  };
}

/* ---------- stockage : fichiers ---------- */
class FileStore {
  constructor(dir) {
    this.dir = dir;
    this.files = { users: path.join(dir, 'users.json'), state: path.join(dir, 'state.json'), history: path.join(dir, 'history'), secret: path.join(dir, 'secret.key') };
    this.failures = new Map();
    fs.mkdirSync(this.files.history, { recursive: true, mode: 0o700 });
  }
  get kind() { return 'fichiers (' + this.dir + ')'; }
  read(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
      if (e.code === 'ENOENT') return fallback;
      throw new Error('Fichier illisible : ' + file + ' (' + e.message + ')');
    }
  }
  write(file, value) {
    const tmp = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, typeof value === 'string' ? value : JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  async secret() {
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
    if (!fs.existsSync(this.files.secret)) this.write(this.files.secret, crypto.randomBytes(32).toString('hex'));
    return fs.readFileSync(this.files.secret, 'utf8').trim();
  }
  async getUsers() { return this.read(this.files.users, []); }
  async setUsers(list) { this.write(this.files.users, list); }
  async getShared() { return this.read(this.files.state, { revision: 0, state: null, updatedAt: null, updatedBy: null }); }
  async saveShared(expected, state, username) {
    const cur = await this.getShared();
    if (cur.revision !== expected) return { conflict: true, updatedBy: cur.updatedBy };
    if (cur.state) {
      this.write(path.join(this.files.history, `state-r${String(cur.revision).padStart(6, '0')}.json`), cur);
      const old = fs.readdirSync(this.files.history).filter(f => f.startsWith('state-r')).sort();
      for (const f of old.slice(0, Math.max(0, old.length - HISTORY_SIZE))) fs.unlinkSync(path.join(this.files.history, f));
    }
    const next = { revision: cur.revision + 1, state, updatedAt: new Date().toISOString(), updatedBy: username };
    this.write(this.files.state, next);
    return { revision: next.revision };
  }
  async failCount(key) { const f = this.failures.get(key); return f && f.until > Date.now() ? f.count : 0; }
  async addFailure(key) { const n = (await this.failCount(key)) + 1; this.failures.set(key, { count: n, until: Date.now() + 15 * 60e3 }); }
  async clearFailures(key) { this.failures.delete(key); }
}

/* ---------- stockage : Upstash Redis (REST) ---------- */
class RedisStore {
  constructor(url, token) { this.url = url; this.token = token; }
  get kind() { return 'Upstash Redis'; }
  async cmd(...args) {
    const r = await fetch(this.url, { method: 'POST', headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(15000) });
    const x = await r.json().catch(() => ({}));
    if (!r.ok || x.error) throw new Error('Base de données indisponible : ' + (x.error || r.status));
    return x.result;
  }
  async secret() {
    return process.env.SESSION_SECRET || crypto.createHash('sha256').update('rb-crm-session|' + this.token).digest('hex');
  }
  async getUsers() { const v = await this.cmd('GET', 'rb:users'); return v ? JSON.parse(v) : []; }
  async setUsers(list) { await this.cmd('SET', 'rb:users', JSON.stringify(list)); }
  async getShared() {
    const [rev, state, meta] = await this.cmd('MGET', 'rb:rev', 'rb:state', 'rb:meta');
    const m = meta ? JSON.parse(meta) : {};
    return { revision: Number(rev || 0), state: state ? JSON.parse(state) : null, updatedAt: m.updatedAt || null, updatedBy: m.updatedBy || null };
  }
  async saveShared(expected, state, username) {
    const lock = crypto.randomBytes(8).toString('hex');
    for (let i = 0; ; i++) {
      if (await this.cmd('SET', 'rb:lock', lock, 'NX', 'PX', '10000')) break;
      if (i >= 20) throw Object.assign(new Error('Enregistrement simultané en cours, réessaie.'), { status: 503 });
      await new Promise(r => setTimeout(r, 150));
    }
    try {
      const [rev, oldState, oldMeta] = await this.cmd('MGET', 'rb:rev', 'rb:state', 'rb:meta');
      const cur = Number(rev || 0);
      if (cur !== expected) return { conflict: true, updatedBy: oldMeta ? JSON.parse(oldMeta).updatedBy : null };
      if (oldState) {
        await this.cmd('LPUSH', 'rb:history', JSON.stringify({ revision: cur, meta: oldMeta ? JSON.parse(oldMeta) : {}, state: oldState }));
        await this.cmd('LTRIM', 'rb:history', '0', String(HISTORY_SIZE - 1));
      }
      await this.cmd('MSET', 'rb:state', JSON.stringify(state), 'rb:meta', JSON.stringify({ updatedAt: new Date().toISOString(), updatedBy: username }), 'rb:rev', String(cur + 1));
      return { revision: cur + 1 };
    } finally {
      if (await this.cmd('GET', 'rb:lock') === lock) await this.cmd('DEL', 'rb:lock');
    }
  }
  async failCount(key) { return Number(await this.cmd('GET', 'rb:fail:' + key) || 0); }
  async addFailure(key) { if (await this.cmd('INCR', 'rb:fail:' + key) === 1) await this.cmd('EXPIRE', 'rb:fail:' + key, '900'); }
  async clearFailures(key) { await this.cmd('DEL', 'rb:fail:' + key); }
}

function createStore(cfg = config()) {
  if (process.env.VERCEL && !(cfg.redisUrl && cfg.redisToken)) throw new Error('Base de données non connectée : ajoute « Upstash for Redis » au projet Vercel (onglet Storage), puis redéploie.');
  return cfg.redisUrl && cfg.redisToken ? new RedisStore(cfg.redisUrl, cfg.redisToken) : new FileStore(cfg.dataDir);
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
const USERNAME = /^[A-Za-z0-9._-]{2,40}$/;
function newUser(username, password, role) {
  if (!USERNAME.test(username || '')) throw Object.assign(new Error('Identifiant invalide (2 à 40 caractères : lettres, chiffres, . _ -)'), { status: 400 });
  if (String(password || '').length < 12) throw Object.assign(new Error('Mot de passe trop court (12 caractères minimum).'), { status: 400 });
  return { username, role: role === 'admin' ? 'admin' : 'user', ...hashPassword(String(password)), createdAt: new Date().toISOString() };
}

/* ---------- Pennylane ---------- */
class PennylaneError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
async function plFetch(url, token, attempt = 0) {
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
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
    items.push(...(body?.items || body?.data || (Array.isArray(body) ? body : [])));
    if (body?.has_more && body?.next_cursor) { cursor = body.next_cursor; continue; }
    if (!cursor && body?.total_pages && body.current_page < body.total_pages) { page = body.current_page + 1; continue; }
    break;
  }
  return items;
}
const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
function normInvoice(x) {
  const ttc = num(x.currency_amount ?? x.amount) ?? 0;
  const ht = num(x.currency_amount_before_tax ?? x.amount_before_tax) ?? ttc - (num(x.currency_tax ?? x.tax) ?? 0);
  const remaining = num(x.remaining_amount_with_tax ?? x.remaining_amount);
  return {
    plId: x.id, number: x.invoice_number || '', label: x.label || '', date: x.date || '', deadline: x.deadline || '',
    amountHT: ht, amountTTC: ttc, remainingTTC: remaining ?? (x.paid ? 0 : ttc),
    status: x.status || (x.paid ? 'paid' : ''), draft: Boolean(x.draft) || x.status === 'draft', creditNote: Boolean(x.credit_note) || ttc < 0,
    customerId: x.customer?.id ?? x.customer_id ?? null, customerName: x.customer?.name || '', url: x.public_file_url || x.public_url || '',
  };
}
function normCustomer(x) {
  return { id: x.id, name: x.name || [x.first_name, x.last_name].filter(Boolean).join(' '), siren: String(x.reg_no || '').replace(/\s/g, '').slice(0, 9), emails: x.emails || [], reference: x.external_reference || '' };
}

/* ---------- page du CRM ---------- */
function buildIndex() {
  const base = fs.readFileSync(path.join(ROOT, 'src', 'crm_v26.html'), 'utf8');
  const modules = ['v27_pennylane.js', 'v27_boards.js', 'v27_portfolio.js', 'v27_fiscal.js', 'v27_reprise.js', 'v27_cabinet.js', 'v27_style.js'].map(f => '<script>\n' + fs.readFileSync(path.join(ROOT, 'src', f), 'utf8') + '\n</script>\n').join('');
  const i = base.lastIndexOf('</body>');
  if (i < 0) throw new Error('crm_v26.html : balise </body> introuvable');
  return base.slice(0, i) + modules + base.slice(i);
}

/* ---------- HTTP ---------- */
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
  // Vercel analyse déjà le corps JSON et l'expose dans req.body.
  if (process.env.VERCEL && 'body' in req) { const b = req.body; return Promise.resolve(typeof b === 'string' ? JSON.parse(b || '{}') : b || {}); }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Données trop volumineuses'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('JSON invalide'), { status: 400 })); } });
    req.on('error', reject);
  });
}
function parseCookies(header) {
  return Object.fromEntries(header.split(';').map(x => x.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === (req.headers['x-forwarded-host'] || req.headers.host); } catch { return false; }
}
function clientIp(req) { return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || ''; }
function validState(s) {
  return s && typeof s === 'object' && Array.isArray(s.clients) && Array.isArray(s.prospects) && Array.isArray(s.invoices) && Array.isArray(s.time)
    && ['onboarding', 'fiscal', 'closing', 'legal'].every(k => Array.isArray(s[k]));
}
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const httpError = (status, message) => Object.assign(new Error(message), { status });

function createApp({ store = createStore(), cfg = config() } = {}) {
  let INDEX = null;
  const sign = async payload => {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return data + '.' + crypto.createHmac('sha256', await store.secret()).update(data).digest('base64url');
  };
  const cookie = (req, value, maxAge) => {
    const secure = cfg.cookieSecure || req.headers['x-forwarded-proto'] === 'https';
    return `rb_sid=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  };
  async function sessionOf(req) {
    const raw = parseCookies(req.headers.cookie || '').rb_sid || '';
    const [data, sig] = raw.split('.');
    if (!data || !sig) return null;
    const expected = crypto.createHmac('sha256', await store.secret()).update(data).digest('base64url');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    let p; try { p = JSON.parse(Buffer.from(data, 'base64url').toString()); } catch { return null; }
    if (!p.exp || p.exp < Date.now()) return null;
    // Le compte doit toujours exister et son mot de passe ne pas avoir changé.
    const user = (await store.getUsers()).find(u => u.username === p.u);
    if (!user || user.hash.slice(0, 16) !== p.v) return null;
    return { username: user.username, role: user.role };
  }
  async function openSession(req, res, user) {
    const token = await sign({ u: user.username, v: user.hash.slice(0, 16), exp: Date.now() + cfg.sessionHours * 3600e3 });
    send(res, 200, { username: user.username, role: user.role }, { 'Set-Cookie': cookie(req, token, cfg.sessionHours * 3600) });
  }
  const admin = s => { if (s.role !== 'admin') throw httpError(403, 'Réservé aux administrateurs'); };
  const requireCabinet = () => { if (!cfg.pennylane.cabinetToken) throw new PennylaneError('PENNYLANE_CABINET_TOKEN non renseigné sur le serveur.', 400); };

  const routes = {
    'POST /api/login': async (req, res) => {
      const { username = '', password = '' } = await readBody(req, 10_000);
      const key = crypto.createHash('sha256').update(clientIp(req) + '|' + String(username).toLowerCase()).digest('hex').slice(0, 32);
      if (await store.failCount(key) >= 5) return send(res, 429, { error: 'Trop de tentatives. Réessaie dans 15 minutes.' });
      let list = await store.getUsers();
      // Premier démarrage : le compte administrateur défini par ADMIN_USERNAME / ADMIN_PASSWORD est créé à la première connexion.
      if (!list.length && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD
        && username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        list = [newUser(username, password, 'admin')];
        await store.setUsers(list);
      }
      const user = list.find(u => u.username.toLowerCase() === String(username).toLowerCase());
      if (!user || !checkPassword(user, String(password))) {
        await store.addFailure(key);
        return send(res, 401, { error: 'Identifiants incorrects' });
      }
      await store.clearFailures(key);
      await openSession(req, res, user);
    },
    'POST /api/logout': async (req, res) => send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) }),
    'GET /api/session': async (req, res, s) => send(res, 200, s),
    'GET /api/state': async (req, res) => send(res, 200, await store.getShared()),
    'PUT /api/state': async (req, res, s) => {
      const body = await readBody(req);
      if (!validState(body.state)) return send(res, 400, { error: 'Structure de données invalide' });
      const r = await store.saveShared(Number(body.revision), body.state, s.username);
      if (r.conflict) return send(res, 409, { error: `Les données ont été modifiées par ${r.updatedBy || 'un autre utilisateur'} : recharge avant de continuer.` });
      send(res, 200, { revision: r.revision });
    },
    'GET /api/company': async (req, res, s, url) => {
      const siren = url.searchParams.get('siren') || '';
      if (!/^\d{9}$/.test(siren)) return send(res, 400, { error: 'SIREN invalide' });
      const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${siren}&per_page=1`, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
      if (!r.ok) return send(res, r.status === 429 ? 429 : 502, { error: 'Service de recherche indisponible' });
      const data = await r.json();
      // L'annuaire public ne donne pas le capital social : Pappers le complète si une clé est configurée.
      if (process.env.PAPPERS_API_KEY) {
        try {
          const p = await fetch(`https://api.pappers.fr/v2/entreprise?siren=${siren}`, { headers: { 'api-key': process.env.PAPPERS_API_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
          const hit = (data.results || []).find(x => x.siren === siren);
          if (p.ok && hit) { const j = await p.json(); if (j.capital != null) hit.capital_pappers = j.capital; }
        } catch (e) { console.error('Pappers', e.message); }
      }
      send(res, 200, data);
    },

    /* --- comptes --- */
    'GET /api/users': async (req, res, s) => { admin(s); send(res, 200, { items: (await store.getUsers()).map(u => ({ username: u.username, role: u.role, createdAt: u.createdAt })) }); },
    'POST /api/users': async (req, res, s) => {
      admin(s);
      const { username, password, role } = await readBody(req, 10_000);
      const list = await store.getUsers();
      if (list.some(u => u.username.toLowerCase() === String(username || '').toLowerCase())) throw httpError(409, 'Ce compte existe déjà.');
      list.push(newUser(username, password, role));
      await store.setUsers(list);
      send(res, 200, { ok: true });
    },
    'POST /api/users/delete': async (req, res, s) => {
      admin(s);
      const { username } = await readBody(req, 10_000);
      if (username === s.username) throw httpError(400, 'Tu ne peux pas supprimer ton propre compte.');
      await store.setUsers((await store.getUsers()).filter(u => u.username !== username));
      send(res, 200, { ok: true });
    },
    'POST /api/password': async (req, res, s) => {
      const { current, password } = await readBody(req, 10_000);
      const list = await store.getUsers(), i = list.findIndex(u => u.username === s.username);
      if (i < 0 || !checkPassword(list[i], String(current || ''))) throw httpError(400, 'Mot de passe actuel incorrect.');
      list[i] = { ...newUser(s.username, password, list[i].role), createdAt: list[i].createdAt };
      await store.setUsers(list);
      await openSession(req, res, list[i]);
    },

    /* --- Pennylane --- */
    'GET /api/pennylane/status': async (req, res) => send(res, 200, { cabinet: Boolean(cfg.pennylane.cabinetToken), firm: Boolean(cfg.pennylane.firmToken), pappers: Boolean(process.env.PAPPERS_API_KEY), storage: store.kind.split(' (')[0] }),
    'POST /api/pennylane/test': async (req, res) => {
      const out = {};
      if (cfg.pennylane.cabinetToken) {
        try { const me = await plFetch(cfg.pennylane.apiBase + '/me', cfg.pennylane.cabinetToken); out.cabinet = { ok: true, company: me?.company?.name || '', user: me?.user?.email || '' }; }
        catch (e) { out.cabinet = { ok: false, error: e.message }; }
      } else out.cabinet = { ok: false, error: 'PENNYLANE_CABINET_TOKEN non renseigné' };
      if (cfg.pennylane.firmToken) {
        try { const b = await plFetch(cfg.pennylane.firmBase + '/companies?limit=1', cfg.pennylane.firmToken); out.firm = { ok: true, sample: (b?.items || b?.data || [])[0]?.name || '' }; }
        catch (e) { out.firm = { ok: false, error: e.message }; }
      } else out.firm = { ok: false, error: 'PENNYLANE_FIRM_TOKEN non renseigné' };
      send(res, 200, out);
    },
    'GET /api/pennylane/customers': async (req, res) => {
      requireCabinet();
      send(res, 200, { items: (await plList(cfg.pennylane.apiBase, '/customers', cfg.pennylane.cabinetToken)).map(normCustomer) });
    },
    'GET /api/pennylane/invoices': async (req, res, s, url) => {
      requireCabinet();
      const from = url.searchParams.get('from');
      const params = isDate(from) ? { filter: JSON.stringify([{ field: 'date', operator: 'gteq', value: from }]) } : {};
      const [invoices, customers] = await Promise.all([
        plList(cfg.pennylane.apiBase, '/customer_invoices', cfg.pennylane.cabinetToken, params),
        plList(cfg.pennylane.apiBase, '/customers', cfg.pennylane.cabinetToken),
      ]);
      const items = invoices.map(normInvoice).filter(i => !isDate(from) || i.date >= from);
      send(res, 200, { items, customers: customers.map(normCustomer), fetchedAt: new Date().toISOString() });
    },
    'GET /api/pennylane/companies': async (req, res) => {
      if (!cfg.pennylane.firmToken) throw new PennylaneError('PENNYLANE_FIRM_TOKEN non renseigné sur le serveur.', 400);
      const items = await plList(cfg.pennylane.firmBase, '/companies', cfg.pennylane.firmToken);
      send(res, 200, { items: items.map(x => ({ id: x.id, name: x.name || '', siren: String(x.reg_no || x.siren || '').replace(/\s/g, '').slice(0, 9) })) });
    },
  };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return send(res, 200, INDEX || (INDEX = buildIndex()));
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
      const route = routes[`${req.method} ${url.pathname}`];
      if (!route) return send(res, 404, { error: 'Introuvable' });
      if (req.method !== 'GET') {
        if (!sameOrigin(req)) return send(res, 403, { error: 'Origine refusée' });
        if (!String(req.headers['content-type'] || '').includes('application/json') && url.pathname !== '/api/logout') return send(res, 415, { error: 'JSON attendu' });
      }
      const open = ['/api/login', '/api/logout'].includes(url.pathname);
      const s = open ? null : await sessionOf(req);
      if (!open && !s) return send(res, 401, { error: 'Session expirée' });
      await route(req, res, s, url);
    } catch (e) {
      const status = e.status && e.status >= 400 && e.status < 600 ? (e instanceof PennylaneError && e.status >= 500 ? 502 : e.status) : 500;
      if (status >= 500) console.error(new Date().toISOString(), req.method, url.pathname, e);
      if (!res.headersSent) send(res, status, { error: e.name === 'TimeoutError' ? 'Le service distant n’a pas répondu à temps.' : e.message });
    }
  }
  return { handle, store, cfg };
}

module.exports = { createApp, createStore, config, newUser, buildIndex, normInvoice, normCustomer, plList, FileStore, RedisStore };
