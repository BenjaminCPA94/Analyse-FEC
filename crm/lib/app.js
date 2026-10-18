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
const vm = require('node:vm');
const zlib = require('node:zlib');
const guard = require('./guard');

const ROOT = path.join(__dirname, '..');
const HISTORY_SIZE = 30;
const AUDIT_SIZE = 5000;
// KEYS : révision, état, méta, historique — ARGV : révision attendue, état, méta, taille de l'historique.
const SAVE_LUA = `local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
if cur ~= tonumber(ARGV[1]) then return {0, cur, redis.call('GET', KEYS[3]) or ''} end
local old = redis.call('GET', KEYS[2])
if old then
  redis.call('LPUSH', KEYS[4], '{"revision":' .. cur .. ',"meta":' .. (redis.call('GET', KEYS[3]) or '{}') .. ',"state":' .. cjson.encode(old) .. '}')
  redis.call('LTRIM', KEYS[4], 0, tonumber(ARGV[4]) - 1)
end
redis.call('SET', KEYS[2], ARGV[2])
redis.call('SET', KEYS[3], ARGV[3])
redis.call('SET', KEYS[1], tostring(cur + 1))
return {1, cur + 1, ''}`;
const UNLOCK_LUA = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

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
  // Lecture, contrôle de version et écriture sans aucune attente entre les deux : atomique dans le processus.
  async saveShared(expected, state, username) {
    const cur = this.read(this.files.state, { revision: 0, state: null });
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
  async getRevision(rev) {
    const cur = await this.getShared();
    if (cur.revision === rev) return cur.state;
    const f = path.join(this.files.history, `state-r${String(rev).padStart(6, '0')}.json`);
    return fs.existsSync(f) ? this.read(f, {}).state || null : null;
  }
  async auditPush(entry) {
    const f = path.join(this.dir, 'audit.jsonl');
    fs.appendFileSync(f, JSON.stringify(entry) + '\n', { mode: 0o600 });
    if (fs.statSync(f).size > 8 * 1024 * 1024) { const lines = fs.readFileSync(f, 'utf8').trim().split('\n'); this.write(f, lines.slice(-AUDIT_SIZE).join('\n') + '\n'); }
  }
  async auditList(limit = 200) {
    try { return fs.readFileSync(path.join(this.dir, 'audit.jsonl'), 'utf8').trim().split('\n').filter(Boolean).slice(-limit).reverse().map(l => JSON.parse(l)); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }
  // Un seul processus écrit dans data/ : les lectures-écritures synchrones sont déjà atomiques.
  async withLock(name, fn) { return fn(); }
  async incrWindow(key, seconds) { const now = Date.now(), f = this.failures.get('rl:' + key); if (!f || f.until < now) { this.failures.set('rl:' + key, { count: 1, until: now + seconds * 1000 }); return 1; } f.count++; return f.count; }
  kvFile(key) { const d = path.join(this.dir, 'kv'); fs.mkdirSync(d, { recursive: true, mode: 0o700 }); return path.join(d, encodeURIComponent(key) + '.json'); }
  async kvGet(key) { return this.read(this.kvFile(key), null); }
  async kvSet(key, value) { this.write(this.kvFile(key), value); }
  async kvDel(key) { try { fs.unlinkSync(this.kvFile(key)); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
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
  /* Contrôle de version et écriture en une seule opération atomique (script Lua exécuté par Redis) :
   * aucun écrasement possible entre la lecture de la révision et l'écriture. Repli sur verrou si EVAL est refusé. */
  async saveShared(expected, state, username) {
    const meta = JSON.stringify({ updatedAt: new Date().toISOString(), updatedBy: username });
    if (!this.noEval) {
      try {
        const [ok, rev, oldMeta] = await this.cmd('EVAL', SAVE_LUA, '4', 'rb:rev', 'rb:state', 'rb:meta', 'rb:history', String(expected), JSON.stringify(state), meta, String(HISTORY_SIZE));
        if (Number(ok) !== 1) return { conflict: true, updatedBy: oldMeta ? JSON.parse(oldMeta).updatedBy : null };
        return { revision: Number(rev) };
      } catch (e) {
        if (!/unknown command|not supported|NOSCRIPT|disabled|ERR unknown/i.test(e.message)) throw e;
        this.noEval = true; console.error('EVAL indisponible, repli sur verrou :', e.message);
      }
    }
    return this.withLock('state', async () => {
      const [rev, oldState, oldMeta] = await this.cmd('MGET', 'rb:rev', 'rb:state', 'rb:meta');
      const cur = Number(rev || 0);
      if (cur !== expected) return { conflict: true, updatedBy: oldMeta ? JSON.parse(oldMeta).updatedBy : null };
      if (oldState) {
        await this.cmd('LPUSH', 'rb:history', JSON.stringify({ revision: cur, meta: oldMeta ? JSON.parse(oldMeta) : {}, state: oldState }));
        await this.cmd('LTRIM', 'rb:history', '0', String(HISTORY_SIZE - 1));
      }
      await this.cmd('MSET', 'rb:state', JSON.stringify(state), 'rb:meta', meta, 'rb:rev', String(cur + 1));
      return { revision: cur + 1 };
    });
  }
  /* Verrou court avec jeton : libéré seulement par son détenteur (comparaison et suppression atomiques). */
  async withLock(name, fn) {
    const key = 'rb:lock:' + name, lock = crypto.randomBytes(8).toString('hex');
    for (let i = 0; ; i++) {
      if (await this.cmd('SET', key, lock, 'NX', 'PX', '15000')) break;
      if (i >= 40) throw Object.assign(new Error('Enregistrement simultané en cours, réessaie.'), { status: 503, public: true });
      await new Promise(r => setTimeout(r, 120));
    }
    try { return await fn(); } finally {
      try { await this.cmd('EVAL', UNLOCK_LUA, '1', key, lock); } catch { if (await this.cmd('GET', key) === lock) await this.cmd('DEL', key); }
    }
  }
  async kvGet(key) { const v = await this.cmd('GET', 'rb:kv:' + key); return v ? JSON.parse(v) : null; }
  async kvSet(key, value) { await this.cmd('SET', 'rb:kv:' + key, JSON.stringify(value)); }
  async kvDel(key) { await this.cmd('DEL', 'rb:kv:' + key); }
  async getRevision(rev) {
    const cur = Number(await this.cmd('GET', 'rb:rev') || 0);
    if (rev === cur) return JSON.parse((await this.cmd('GET', 'rb:state')) || 'null');
    const i = cur - rev - 1;
    if (i < 0 || i >= HISTORY_SIZE) return null;
    const h = await this.cmd('LINDEX', 'rb:history', String(i));
    if (!h) return null;
    const e = JSON.parse(h);
    return e.revision === rev ? JSON.parse(e.state) : null;
  }
  async auditPush(entry) { await this.cmd('LPUSH', 'rb:audit', JSON.stringify(entry)); await this.cmd('LTRIM', 'rb:audit', '0', String(AUDIT_SIZE - 1)); }
  async auditList(limit = 200) { return ((await this.cmd('LRANGE', 'rb:audit', '0', String(limit - 1))) || []).map(x => JSON.parse(x)); }
  async incrWindow(key, seconds) { const n = await this.cmd('INCR', 'rb:rl:' + key); if (n === 1) await this.cmd('EXPIRE', 'rb:rl:' + key, String(seconds)); return n; }
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
  return { username, role: normRole(role), ...hashPassword(String(password)), createdAt: new Date().toISOString() };
}
/* Rôles et droits, appliqués par le serveur (l'interface ne fait que masquer).
 * L'ancien rôle « user » correspond à « collaborateur » (le plus restreint) : l'administrateur ajuste ensuite. */
const ROLES = ['admin', 'associe', 'manager', 'collaborateur'];
function normRole(r) { return ROLES.includes(r) ? r : 'collaborateur'; }
const PERMS = {
  admin: { users: true, settings: true, costs: true, delete: true, import: true, fees: true, force: true, backup: true, audit: true },
  associe: { users: false, settings: true, costs: true, delete: true, import: true, fees: true, force: true, backup: false, audit: true },
  manager: { users: false, settings: false, costs: false, delete: false, import: true, fees: true, force: false, backup: false, audit: false },
  collaborateur: { users: false, settings: false, costs: false, delete: false, import: false, fees: false, force: false, backup: false, audit: false },
};
function permsOf(role) { return PERMS[normRole(role)]; }

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
  const modules = ['v27_pennylane.js', 'v27_boards.js', 'v27_portfolio.js', 'v27_fiscal.js', 'v27_reprise.js', 'v27_cabinet.js', 'v27_billing.js', 'v27_team.js', 'v27_history.js', 'creation_fields.js', 'v27_creation.js', 'v27_sync.js', 'v27_imports.js', 'v27_style.js'].map(f => '<script>\n' + fs.readFileSync(path.join(ROOT, 'src', f), 'utf8') + '\n</script>\n').join('');
  const i = base.lastIndexOf('</body>');
  if (i < 0) throw new Error('crm_v26.html : balise </body> introuvable');
  return base.slice(0, i) + modules + base.slice(i);
}

function buildCreationForm() {
  const fields = fs.readFileSync(path.join(ROOT, 'src', 'creation_fields.js'), 'utf8');
  return fs.readFileSync(path.join(ROOT, 'src', 'creation_form.html'), 'utf8').replace('/*CREATION_FIELDS*/', () => fields);
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
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const MAX_FILE = 3 * 1024 * 1024, MAX_FILES = 30, MAX_FILES_BYTES = 25 * 1024 * 1024;
const LINK_DAYS = Number(process.env.CREATION_LINK_DAYS || 60);
/* Type réel d'un fichier, d'après ses premiers octets (le type déclaré par le navigateur n'est pas fiable). */
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.slice(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|hevc|mif1|msf1)$/.test(buf.slice(8, 12).toString('latin1'))) return 'image/heic';
  return null;
}
function linkInfo(l) {
  const state = l.revokedAt ? 'révoqué' : l.closedAt ? 'clôturé' : l.expiresAt && Date.parse(l.expiresAt) < Date.now() ? 'expiré' : 'actif';
  return { state, expiresAt: l.expiresAt || null, revokedAt: l.revokedAt || null, closedAt: l.closedAt || null, createdAt: l.createdAt || null };
}
/* Champs obligatoires : la même liste que le formulaire (src/creation_fields.js), vérifiée côté serveur. */
let CREATION_FIELDS_CACHE = null;
function creationFields() {
  if (!CREATION_FIELDS_CACHE) { const ctx = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src', 'creation_fields.js'), 'utf8') + ';this.F=CREATION_FIELDS;', ctx); CREATION_FIELDS_CACHE = ctx.F; }
  return CREATION_FIELDS_CACHE;
}
function creationMissing(fields, files) {
  return creationFields().filter(f => f.required && (f.type === 'file' ? !files.some(x => x.kind === f.key) : !String(fields[f.key] || '').trim())).map(f => f.label.split(',')[0]);
}
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
/* Chemins des modifications par élément : ['clients', '#C_x'], ['boards27', 'bilan', 'C_x|2025']… */
const BAD_KEY = /^(__proto__|constructor|prototype)$/;
function validOp(o) { return o && Array.isArray(o.path) && o.path.length >= 1 && o.path.length <= 6 && o.path.every(k => (typeof k === 'string' && k.length <= 120 && !BAD_KEY.test(k.replace(/^#/, ''))) || Number.isInteger(k)); }
function getAt(root, p) { let o = root; for (const k of p) { if (o == null) return undefined; o = String(k).startsWith('#') && Array.isArray(o) ? o.find(x => x && x.id === k.slice(1)) : o[k]; } return o; }
function putAt(root, p, value) {
  let o = root;
  for (let i = 0; i < p.length - 1; i++) {
    const k = p[i], nk = p[i + 1];
    let n = String(k).startsWith('#') && Array.isArray(o) ? o.find(x => x && x.id === k.slice(1)) : o[k];
    if (n == null || typeof n !== 'object') { n = String(nk).startsWith('#') ? [] : {}; if (String(k).startsWith('#')) return; o[k] = n; }
    o = n;
  }
  const last = p[p.length - 1];
  if (String(last).startsWith('#') && Array.isArray(o)) { const id = last.slice(1), i = o.findIndex(x => x && x.id === id); if (value == null) { if (i >= 0) o.splice(i, 1); } else if (i >= 0) o[i] = value; else o.push(value); }
  else if (value == null) delete o[last]; else o[last] = value;
}
const httpError = (status, message) => Object.assign(new Error(message), { status, public: true });
const BACKUP_KEEP = 14;
const MAX_STATE = Number(process.env.MAX_STATE_KB || 3500) * 1024;

function createApp({ store = createStore(), cfg = config() } = {}) {
  let INDEX = null, CREATION_FORM = null;
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
    // Sessions révoquées par l'administrateur (déconnexion forcée de tous les appareils).
    if (user.revokedAt && (!p.iat || p.iat < Date.parse(user.revokedAt))) return null;
    const role = normRole(user.role);
    return { username: user.username, role, perms: permsOf(role) };
  }
  async function openSession(req, res, user) {
    const token = await sign({ u: user.username, v: user.hash.slice(0, 16), iat: Date.now(), exp: Date.now() + cfg.sessionHours * 3600e3 });
    const role = normRole(user.role);
    send(res, 200, { username: user.username, role, perms: permsOf(role) }, { 'Set-Cookie': cookie(req, token, cfg.sessionHours * 3600) });
  }
  async function publicLink(req, token, write) {
    const ip = 'pub:' + clientIp(req);
    if (await store.failCount(ip) >= 30) throw httpError(429, 'Trop de tentatives, réessaie plus tard.');
    const link = TOKEN_RE.test(String(token || '')) ? await store.kvGet('cr:link:' + token) : null;
    if (!link) { await store.addFailure(ip); throw httpError(404, 'Ce lien n’est plus valide. Contacte ton cabinet.'); }
    const st = linkInfo(link).state;
    if (st === 'révoqué') throw httpError(410, 'Ce lien a été désactivé par le cabinet. Contacte-le pour en obtenir un nouveau.');
    if (st === 'expiré') throw httpError(410, 'Ce lien a expiré. Contacte ton cabinet pour le prolonger.');
    if (st === 'clôturé' && write) throw httpError(410, 'Ce dossier est clôturé : il n’est plus modifiable. Contacte ton cabinet si besoin.');
    if (write && await store.incrWindow('cr:' + token, 3600) > 600) throw httpError(429, 'Trop de modifications en peu de temps. Réessaie dans une heure.');
    return { token, link };
  }
  // Fichiers : index séparé (nouveau format) + anciens fichiers listés dans la réponse (format précédent).
  async function creationFiles(token, sub) { return [...(sub?.files || []), ...((await store.kvGet('cr:files:' + token)) || [])]; }
  async function touchSub(token) { const sub = (await store.kvGet('cr:sub:' + token)) || { fields: {} }; sub.updatedAt = new Date().toISOString(); sub.rev = Number(sub.rev || 0) + 1; await store.kvSet('cr:sub:' + token, sub); }
  /* Contrôles communs aux deux modes d'enregistrement, puis écriture atomique et journal. */
  async function commitState(s, cur, next) {
    if (!validState(next)) return { status: 400, body: { error: 'Structure de données invalide' } };
    if (!s.perms.costs) guard.restoreCosts(cur.state, next);
    const bad = guard.newViolations(cur.state, next);
    if (bad.length) return { status: 422, body: { error: 'Données incohérentes refusées : ' + bad.slice(0, 5).join(' ; '), details: bad.slice(0, 50) } };
    const denied = guard.permissionErrors(cur.state, next, s.perms, s.username);
    if (denied.length) { await audit(s, 'enregistrement refusé (droits)', { reasons: denied }); return { status: 403, body: { error: denied.join(' '), details: denied } }; }
    guard.stampAuthors(cur.state, next, s.username);
    const size = Buffer.byteLength(JSON.stringify(next));
    if (size > MAX_STATE) return { status: 413, body: { error: `Données trop volumineuses (${Math.round(size / 1024)} Ko, maximum ${Math.round(MAX_STATE / 1024)} Ko).` } };
    const r = await store.saveShared(cur.revision, next, s.username);
    if (r.conflict) return { status: 409, body: { error: `Les données ont été modifiées par ${r.updatedBy || 'un autre utilisateur'}.`, updatedBy: r.updatedBy } };
    const ch = guard.changes(cur.state, next);
    if (ch.length) await audit(s, 'enregistrement', { revision: r.revision, changes: ch.slice(0, 200), more: Math.max(0, ch.length - 200) });
    return { status: 200, body: { revision: r.revision, size } };
  }
  /* Instantané : état partagé, comptes (empreintes de mot de passe), liens et réponses de création ;
   * contenus des justificatifs seulement sur demande (taille). */
  async function snapshot(withFiles) {
    const shared = await store.getShared(), tokens = (shared.state?.creation27?.items || []).map(i => i.token).filter(t => TOKEN_RE.test(String(t || '')));
    const creation = { links: [], subs: [], indexes: [], files: [] };
    for (const token of tokens) {
      const link = await store.kvGet('cr:link:' + token), sub = await store.kvGet('cr:sub:' + token), index = await store.kvGet('cr:files:' + token);
      if (link) creation.links.push({ token, link });
      if (sub) creation.subs.push({ token, sub });
      if (index) creation.indexes.push({ token, files: index });
      for (const f of await creationFiles(token, sub)) {
        const item = { token, id: f.id, name: f.name, kind: f.kind, type: f.type, size: f.size };
        if (withFiles) { const d = await store.kvGet(`cr:file:${token}:${f.id}`); if (d) item.data = d.data; }
        creation.files.push(item);
      }
    }
    return { format: 'RB27-backup', createdAt: new Date().toISOString(), shared, users: await store.getUsers(), creation };
  }
  /* Conservation : justificatifs des dossiers clôturés ou révoqués effacés après CREATION_RETENTION_DAYS jours (0 = conservés). */
  async function purgeCreationFiles(b) {
    const days = Number(process.env.CREATION_RETENTION_DAYS || 0);
    if (!days) return 0;
    let n = 0;
    for (const { token, link } of b.creation.links) {
      const end = link.closedAt || link.revokedAt;
      if (!end || Date.parse(end) > Date.now() - days * 864e5) continue;
      const sub = await store.kvGet('cr:sub:' + token);
      for (const f of await creationFiles(token, sub)) { await store.kvDel(`cr:file:${token}:${f.id}`); n++; }
      await store.kvDel('cr:files:' + token);
      if (sub?.files) { sub.files = []; sub.filesPurgedAt = new Date().toISOString(); await store.kvSet('cr:sub:' + token, sub); }
    }
    return n;
  }
  const admin = s => { if (s.role !== 'admin') throw httpError(403, 'Réservé aux administrateurs'); };
  const need = (s, perm, label) => { if (!s.perms?.[perm]) throw httpError(403, label || 'Action non autorisée pour ton rôle.'); };
  /* Journal serveur des opérations sensibles : auteur = session, jamais une valeur envoyée par le navigateur. */
  const audit = async (s, action, detail = {}) => {
    try { await store.auditPush({ at: new Date().toISOString(), user: s?.username || 'public', role: s?.role || '', action, ...detail }); }
    catch (e) { console.error('journal', e.message); }
  };
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
        await audit(null, 'connexion refusée', { target: String(username).slice(0, 40), ip: clientIp(req) });
        return send(res, 401, { error: 'Identifiants incorrects' });
      }
      await store.clearFailures(key);
      await audit({ username: user.username, role: normRole(user.role) }, 'connexion', { ip: clientIp(req) });
      await openSession(req, res, user);
    },
    'POST /api/logout': async (req, res) => send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) }),
    'GET /api/session': async (req, res, s) => send(res, 200, s),
    'GET /api/state': async (req, res, s) => {
      const shared = await store.getShared();
      send(res, 200, s.perms.costs ? shared : { ...shared, state: guard.hideCosts(shared.state) });
    },
    /* Enregistrement complet (ancien mode, toujours accepté). */
    'PUT /api/state': async (req, res, s) => {
      const body = await readBody(req), expected = Number(body.revision);
      const cur = await store.getShared();
      if (cur.revision !== expected) return send(res, 409, { error: `Les données ont été modifiées par ${cur.updatedBy || 'un autre utilisateur'}.`, updatedBy: cur.updatedBy, revision: cur.revision });
      const r = await commitState(s, cur, body.state);
      send(res, r.status, r.body);
    },
    /* Enregistrement par élément : seuls les éléments modifiés sont envoyés (client, facture, ligne de tableau…).
     * Si quelqu'un a enregistré entre-temps, les modifications sont appliquées sur sa version à condition qu'il n'ait
     * pas touché aux mêmes éléments ; sinon, conflit (le navigateur fusionne et affiche les écarts). */
    'PATCH /api/state': async (req, res, s) => {
      const body = await readBody(req), base = Number(body.baseRevision), ops = body.ops;
      if (!Array.isArray(ops) || ops.length > 20000 || !ops.every(validOp)) return send(res, 400, { error: 'Modifications invalides' });
      for (let attempt = 0; attempt < 3; attempt++) {
        const cur = await store.getShared();
        let conflicts = [];
        if (cur.revision !== base) {
          const baseState = await store.getRevision(base);
          if (!baseState) return send(res, 409, { error: 'Version de départ trop ancienne : rechargement nécessaire.', updatedBy: cur.updatedBy });
          conflicts = ops.filter(o => JSON.stringify(getAt(baseState, o.path) ?? null) !== JSON.stringify(getAt(cur.state, o.path) ?? null)).map(o => o.path);
          if (conflicts.length) return send(res, 409, { error: `Les mêmes éléments ont été modifiés par ${cur.updatedBy || 'un autre utilisateur'}.`, updatedBy: cur.updatedBy, conflicts: conflicts.slice(0, 50) });
        }
        const next = JSON.parse(JSON.stringify(cur.state || {}));
        for (const o of ops) putAt(next, o.path, o.value);
        const r = await commitState(s, cur, next);
        if (r.status === 409 && attempt < 2) continue;
        if (r.status === 200) r.body.rebased = cur.revision !== base;
        return send(res, r.status, r.body);
      }
    },
    'GET /api/audit': async (req, res, s, url) => {
      need(s, 'audit', 'Journal réservé aux associés et administrateurs.');
      send(res, 200, { items: await store.auditList(Math.min(1000, Number(url.searchParams.get('limit')) || 200)) });
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
    'GET /api/users': async (req, res, s) => { admin(s); send(res, 200, { roles: ROLES, items: (await store.getUsers()).map(u => ({ username: u.username, role: normRole(u.role), createdAt: u.createdAt, revokedAt: u.revokedAt || null })) }); },
    'POST /api/users': async (req, res, s) => {
      admin(s);
      const { username, password, role } = await readBody(req, 10_000);
      await store.withLock('users', async () => {
        const list = await store.getUsers();
        if (list.some(u => u.username.toLowerCase() === String(username || '').toLowerCase())) throw httpError(409, 'Ce compte existe déjà.');
        list.push(newUser(username, password, role));
        await store.setUsers(list);
      });
      await audit(s, 'compte créé', { target: username, newRole: normRole(role) });
      send(res, 200, { ok: true });
    },
    'POST /api/users/delete': async (req, res, s) => {
      admin(s);
      const { username } = await readBody(req, 10_000);
      if (username === s.username) throw httpError(400, 'Tu ne peux pas supprimer ton propre compte.');
      await store.withLock('users', async () => store.setUsers((await store.getUsers()).filter(u => u.username !== username)));
      await audit(s, 'compte supprimé', { target: username });
      send(res, 200, { ok: true });
    },
    'POST /api/users/role': async (req, res, s) => {
      admin(s);
      const { username, role } = await readBody(req, 10_000);
      if (!ROLES.includes(role)) throw httpError(400, 'Rôle inconnu.');
      if (username === s.username && role !== 'admin') throw httpError(400, 'Tu ne peux pas retirer ton propre rôle administrateur.');
      await store.withLock('users', async () => {
        const list = await store.getUsers(), u = list.find(x => x.username === username);
        if (!u) throw httpError(404, 'Compte introuvable.');
        u.role = role; await store.setUsers(list);
      });
      await audit(s, 'rôle modifié', { target: username, newRole: role });
      send(res, 200, { ok: true });
    },
    'POST /api/users/revoke': async (req, res, s) => {
      admin(s);
      const { username } = await readBody(req, 10_000);
      await store.withLock('users', async () => {
        const list = await store.getUsers(), u = list.find(x => x.username === username);
        if (!u) throw httpError(404, 'Compte introuvable.');
        u.revokedAt = new Date(Date.now() + 1).toISOString(); await store.setUsers(list);
      });
      await audit(s, 'sessions révoquées', { target: username });
      send(res, 200, { ok: true });
    },
    'POST /api/password': async (req, res, s) => {
      const { current, password } = await readBody(req, 10_000);
      const user = await store.withLock('users', async () => {
        const list = await store.getUsers(), i = list.findIndex(u => u.username === s.username);
        if (i < 0 || !checkPassword(list[i], String(current || ''))) throw httpError(400, 'Mot de passe actuel incorrect.');
        list[i] = { ...newUser(s.username, password, list[i].role), createdAt: list[i].createdAt };
        await store.setUsers(list);
        return list[i];
      });
      await audit(s, 'mot de passe modifié');
      await openSession(req, res, user);
    },

    /* --- Pennylane --- */
    /* Matrice création : liens envoyés aux futurs clients et réponses reçues (stockées à part de l'état partagé).
     * Lien : expiration, révocation et clôture ; fichiers : type réel vérifié, taille et nombre limités ; réponses versionnées. */
    'POST /api/creation/link': async (req, res, s) => {
      const b = await readBody(req, 10_000), token = crypto.randomBytes(18).toString('base64url'), now = Date.now();
      const link = { name: String(b.name || '').slice(0, 200), legalForm: String(b.legalForm || '').slice(0, 40), cabinet: String(b.cabinet || '').slice(0, 200), createdAt: new Date(now).toISOString(), createdBy: s.username, expiresAt: new Date(now + LINK_DAYS * 864e5).toISOString() };
      await store.kvSet('cr:link:' + token, link);
      await audit(s, 'lien de création créé', { target: link.name });
      send(res, 200, { token, expiresAt: link.expiresAt });
    },
    // Le CRM envoie la liste de ses liens (elle fait partie de l'état partagé) et reçoit les réponses des clients.
    'POST /api/creation/list': async (req, res) => {
      const { tokens } = await readBody(req), items = [];
      for (const token of (Array.isArray(tokens) ? tokens : []).filter(t => TOKEN_RE.test(String(t))).slice(0, 500)) {
        const [sub, link] = [await store.kvGet('cr:sub:' + token), await store.kvGet('cr:link:' + token)];
        const files = await creationFiles(token, sub);
        items.push({ token, link: link ? linkInfo(link) : { state: 'supprimé' }, fields: sub?.fields || {}, files: files.map(({ id, name, kind, size, at, type }) => ({ id, name, kind, size, at, type })), submittedAt: sub?.submittedAt || null, updatedAt: sub?.updatedAt || null, rev: sub?.rev || 0 });
      }
      send(res, 200, { items });
    },
    'GET /api/creation/file': async (req, res, s, url) => {
      const token = url.searchParams.get('t') || '', id = url.searchParams.get('id') || '';
      if (!TOKEN_RE.test(token) || !/^[a-z0-9]{6,20}$/.test(id)) throw httpError(400, 'Paramètres invalides');
      const f = await store.kvGet(`cr:file:${token}:${id}`);
      if (!f) throw httpError(404, 'Fichier introuvable');
      const type = sniff(Buffer.from(f.data, 'base64')) || 'application/octet-stream';
      res.writeHead(200, { ...SECURITY_HEADERS, 'Cache-Control': 'no-store', 'Content-Type': type, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}` });
      res.end(Buffer.from(f.data, 'base64'));
    },
    'POST /api/creation/state': async (req, res, s) => {
      const { token, action, days } = await readBody(req, 10_000);
      if (!TOKEN_RE.test(String(token || ''))) throw httpError(400, 'Lien invalide');
      const link = await store.kvGet('cr:link:' + token);
      if (!link) throw httpError(404, 'Lien introuvable');
      const now = new Date().toISOString();
      if (action === 'revoke') link.revokedAt = now;
      else if (action === 'close') link.closedAt = now;
      else if (action === 'reopen') { delete link.closedAt; delete link.revokedAt; link.expiresAt = new Date(Date.now() + LINK_DAYS * 864e5).toISOString(); }
      else if (action === 'extend') link.expiresAt = new Date(Math.max(Date.now(), Date.parse(link.expiresAt || 0)) + Math.min(365, Math.max(1, Number(days) || LINK_DAYS)) * 864e5).toISOString();
      else throw httpError(400, 'Action inconnue');
      await store.kvSet('cr:link:' + token, link);
      await audit(s, 'lien de création : ' + action, { target: link.name });
      send(res, 200, { link: linkInfo(link) });
    },
    'POST /api/creation/delete': async (req, res, s) => {
      need(s, 'delete', 'Suppression réservée aux associés et administrateurs.');
      const { token } = await readBody(req, 10_000);
      if (!TOKEN_RE.test(String(token || ''))) throw httpError(400, 'Lien invalide');
      const sub = await store.kvGet('cr:sub:' + token);
      for (const f of await creationFiles(token, sub)) await store.kvDel(`cr:file:${token}:${f.id}`);
      await store.kvDel('cr:sub:' + token); await store.kvDel('cr:files:' + token); await store.kvDel('cr:link:' + token);
      await audit(s, 'dossier de création supprimé', { token: token.slice(0, 6) + '…' });
      send(res, 200, { ok: true });
    },
    /* Formulaire public (sans connexion) : l'accès se fait uniquement avec le lien secret envoyé au client. */
    'GET /api/public/creation': async (req, res, s, url) => {
      const { token, link } = await publicLink(req, url.searchParams.get('t'), false);
      const sub = await store.kvGet('cr:sub:' + token), files = await creationFiles(token, sub);
      send(res, 200, { name: link.name, legalForm: link.legalForm, cabinet: link.cabinet, expiresAt: link.expiresAt || null, fields: sub?.fields || {}, files: files.map(({ id, name, kind, size }) => ({ id, name, kind, size })), submittedAt: sub?.submittedAt || null, rev: sub?.rev || 0 });
    },
    'POST /api/public/creation/file': async (req, res, s, url) => {
      const { token } = await publicLink(req, url.searchParams.get('t'), true);
      const b = await readBody(req, 6 * 1024 * 1024), data = String(b.data || '');
      if (!data || !/^[A-Za-z0-9+/=]+$/.test(data)) throw httpError(400, 'Fichier illisible');
      const buf = Buffer.from(data, 'base64');
      if (buf.length > MAX_FILE) throw httpError(413, 'Fichier trop volumineux (3 Mo maximum).');
      const type = sniff(buf);
      if (!type) { await audit(null, 'fichier refusé (type)', { token: token.slice(0, 6) + '…', name: String(b.name || '').slice(0, 80) }); throw httpError(415, 'Format non accepté : envoie un PDF ou une photo (JPEG, PNG, HEIC, WEBP).'); }
      const result = await store.withLock('cr:' + token, async () => {
        const files = await creationFiles(token, await store.kvGet('cr:sub:' + token));
        if (files.length >= MAX_FILES) throw httpError(400, `Nombre maximum de fichiers atteint (${MAX_FILES}).`);
        const total = files.reduce((a, f) => a + Number(f.size || 0), 0);
        if (total + buf.length > MAX_FILES_BYTES) throw httpError(413, 'Volume total des justificatifs atteint (25 Mo). Contacte le cabinet.');
        const id = crypto.randomBytes(6).toString('hex'), meta = { id, name: String(b.name || 'document').replace(/[\\/\r\n"<>]/g, '_').slice(0, 120), kind: String(b.kind || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40), type, size: buf.length, at: new Date().toISOString() };
        await store.kvSet(`cr:file:${token}:${id}`, { name: meta.name, type, data });
        const index = (await store.kvGet('cr:files:' + token)) || [];
        await store.kvSet('cr:files:' + token, [...index, meta]);
        await touchSub(token);
        return meta;
      });
      send(res, 200, { id: result.id, name: result.name, kind: result.kind, size: result.size });
    },
    'POST /api/public/creation/file/delete': async (req, res, s, url) => {
      const { token } = await publicLink(req, url.searchParams.get('t'), true);
      const { id } = await readBody(req, 10_000);
      await store.withLock('cr:' + token, async () => {
        const index = (await store.kvGet('cr:files:' + token)) || [], sub = await store.kvGet('cr:sub:' + token);
        if (index.some(f => f.id === id)) await store.kvSet('cr:files:' + token, index.filter(f => f.id !== id));
        else if (sub?.files?.some(f => f.id === id)) { sub.files = sub.files.filter(f => f.id !== id); await store.kvSet('cr:sub:' + token, sub); }
        else return;
        await store.kvDel(`cr:file:${token}:${id}`);
        await touchSub(token);
      });
      send(res, 200, { ok: true });
    },
    'POST /api/public/creation': async (req, res, s, url) => {
      const { token } = await publicLink(req, url.searchParams.get('t'), true);
      const b = await readBody(req, 200 * 1024), fields = {};
      for (const [k, v] of Object.entries(b.fields || {})) if (/^[a-zA-Z0-9]{1,30}$/.test(k) && Object.keys(fields).length < 60) fields[k] = String(v ?? '').slice(0, 5000);
      const out = await store.withLock('cr:' + token, async () => {
        const sub = (await store.kvGet('cr:sub:' + token)) || {}, rev = Number(sub.rev || 0);
        // Deux onglets ouverts : la version la plus ancienne ne peut pas écraser la plus récente.
        if (b.rev != null && Number(b.rev) !== rev) throw Object.assign(httpError(409, 'Le formulaire a été modifié depuis un autre onglet ou appareil. Recharge la page pour reprendre la dernière version.'), { rev });
        let submittedAt = sub.submittedAt || null;
        if (b.final) {
          const missing = creationMissing(fields, await creationFiles(token, sub));
          if (missing.length) throw Object.assign(httpError(422, 'Informations obligatoires manquantes : ' + missing.join(' · ')), { missing });
          submittedAt = new Date().toISOString();
        }
        const next = { ...sub, fields, files: sub.files, submittedAt, updatedAt: new Date().toISOString(), rev: rev + 1 };
        await store.kvSet('cr:sub:' + token, next);
        return next;
      });
      send(res, 200, { ok: true, rev: out.rev, submittedAt: out.submittedAt });
    },
    /* --- Imports : données de retour arrière (compressées), 10 derniers imports conservés --- */
    'POST /api/imports': async (req, res, s) => {
      need(s, 'import', 'Imports réservés aux managers, associés et administrateurs.');
      const b = await readBody(req, 20 * 1024 * 1024), id = String(b.meta?.id || '');
      if (!/^IMP_[a-z0-9]{4,20}$/i.test(id) || !Array.isArray(b.changes)) throw httpError(400, 'Import invalide');
      const meta = { ...b.meta, user: s.username, storedAt: new Date().toISOString() };
      await store.kvSet('import:' + id, { meta, gz: zlib.gzipSync(JSON.stringify(b.changes)).toString('base64') });
      const index = ((await store.kvGet('import:index')) || []).filter(x => x !== id);
      index.unshift(id);
      for (const old of index.slice(10)) await store.kvDel('import:' + old);
      await store.kvSet('import:index', index.slice(0, 10));
      await audit(s, 'import appliqué', { target: String(meta.file || '').slice(0, 120), created: meta.created, modified: meta.modified, replaced: meta.replaced, errors: meta.errors });
      send(res, 200, { ok: true });
    },
    'GET /api/imports': async (req, res, s, url) => {
      need(s, 'import', 'Imports réservés aux managers, associés et administrateurs.');
      const rec = await store.kvGet('import:' + String(url.searchParams.get('id') || '').replace(/[^A-Za-z0-9_]/g, ''));
      if (!rec) throw httpError(404, 'Données de retour arrière introuvables (seuls les 10 derniers imports sont conservés).');
      await audit(s, 'annulation d’import demandée', { target: String(rec.meta?.file || '').slice(0, 120) });
      send(res, 200, { meta: rec.meta, changes: JSON.parse(zlib.gunzipSync(Buffer.from(rec.gz, 'base64')).toString()) });
    },
    /* --- Sauvegardes indépendantes de l'historique des 30 versions --- */
    'GET /api/backup': async (req, res, s, url) => {
      need(s, 'backup', 'Sauvegarde complète réservée aux administrateurs.');
      const b = await snapshot(url.searchParams.get('files') === '1');
      await audit(s, 'sauvegarde téléchargée', { files: b.creation.files.length, withData: url.searchParams.get('files') === '1' });
      send(res, 200, b, { 'Content-Disposition': `attachment; filename="RB_Partners_sauvegarde_${b.createdAt.slice(0, 10)}.json"` });
    },
    'GET /api/backups': async (req, res, s) => { need(s, 'backup'); send(res, 200, { items: (await store.kvGet('backup:index')) || [] }); },
    'POST /api/restore': async (req, res, s) => {
      need(s, 'backup', 'Restauration réservée aux administrateurs.');
      const b = await readBody(req, 30 * 1024 * 1024);
      const backup = b.date ? await store.kvGet('backup:' + String(b.date).replace(/[^0-9-]/g, '')) : b.backup;
      if (!backup || backup.format !== 'RB27-backup' || !validState(backup.shared?.state)) throw httpError(400, 'Sauvegarde invalide ou introuvable.');
      const cur = await store.getShared(), count = st => ({ clients: st?.clients?.length || 0, prospects: st?.prospects?.length || 0, factures: (st?.invoices || []).filter(i => i.source !== 'pennylane').length, temps: st?.time?.length || 0, creations: st?.creation27?.items?.length || 0 });
      const preview = { backupDate: backup.createdAt, current: count(cur.state), backup: count(backup.shared.state), users: (backup.users || []).length, creationLinks: backup.creation?.links?.length || 0, files: backup.creation?.files?.length || 0, filesWithData: (backup.creation?.files || []).filter(f => f.data).length };
      if (!b.apply) return send(res, 200, { preview });
      // L'état actuel reste dans l'historique : la restauration est elle-même réversible.
      const r = await store.saveShared(cur.revision, backup.shared.state, s.username);
      if (r.conflict) throw httpError(409, 'Les données ont changé pendant la restauration : recommence.');
      for (const l of backup.creation?.links || []) await store.kvSet('cr:link:' + l.token, l.link);
      for (const x of backup.creation?.subs || []) await store.kvSet('cr:sub:' + x.token, x.sub);
      for (const x of backup.creation?.indexes || []) await store.kvSet('cr:files:' + x.token, x.files);
      let restoredFiles = 0;
      for (const f of backup.creation?.files || []) if (f.data && TOKEN_RE.test(f.token) && /^[a-z0-9]{6,20}$/.test(f.id)) { await store.kvSet(`cr:file:${f.token}:${f.id}`, { name: f.name, type: f.type, data: f.data }); restoredFiles++; }
      if (b.users && Array.isArray(backup.users) && backup.users.length) await store.withLock('users', () => store.setUsers(backup.users));
      await audit(s, 'restauration', { from: backup.createdAt, revision: r.revision, restoredFiles, users: Boolean(b.users) });
      send(res, 200, { ok: true, revision: r.revision, preview, restoredFiles });
    },
    // Sauvegarde quotidienne (tâche planifiée Vercel) : état, comptes et réponses de formulaires ; 14 jours conservés.
    'GET /api/cron/backup': async (req, res) => {
      const secret = process.env.CRON_SECRET || '';
      if (!secret || req.headers.authorization !== 'Bearer ' + secret) throw httpError(401, 'Non autorisé');
      const b = await snapshot(false), day = b.createdAt.slice(0, 10);
      await store.kvSet('backup:' + day, b);
      const index = ((await store.kvGet('backup:index')) || []).filter(x => x.date !== day);
      index.unshift({ date: day, createdAt: b.createdAt, revision: b.shared.revision, clients: b.shared.state?.clients?.length || 0 });
      for (const old of index.slice(BACKUP_KEEP)) await store.kvDel('backup:' + old.date);
      await store.kvSet('backup:index', index.slice(0, BACKUP_KEEP));
      const purged = await purgeCreationFiles(b);
      await audit({ username: 'tâche planifiée', role: 'système' }, 'sauvegarde quotidienne', { date: day, purgedFiles: purged });
      send(res, 200, { ok: true, date: day, purgedFiles: purged });
    },
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
      if (req.method === 'GET' && /^\/creation\/[A-Za-z0-9_-]{20,64}$/.test(url.pathname)) return send(res, 200, CREATION_FORM || (CREATION_FORM = buildCreationForm()), { 'Referrer-Policy': 'no-referrer' });
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
      const route = routes[`${req.method} ${url.pathname}`];
      if (!route) return send(res, 404, { error: 'Introuvable' });
      if (req.method !== 'GET') {
        if (!sameOrigin(req)) return send(res, 403, { error: 'Origine refusée' });
        if (!String(req.headers['content-type'] || '').includes('application/json') && url.pathname !== '/api/logout') return send(res, 415, { error: 'JSON attendu' });
      }
      const open = ['/api/login', '/api/logout', '/api/cron/backup'].includes(url.pathname) || url.pathname.startsWith('/api/public/');
      const s = open ? null : await sessionOf(req);
      if (!open && !s) return send(res, 401, { error: 'Session expirée' });
      await route(req, res, s, url);
    } catch (e) {
      const status = e.status && e.status >= 400 && e.status < 600 ? (e instanceof PennylaneError && e.status >= 500 ? 502 : e.status) : 500;
      if (status >= 500) console.error(new Date().toISOString(), req.method, url.pathname, e);
      // Les erreurs internes ne sont pas détaillées au navigateur (journal serveur uniquement).
      const message = e.name === 'TimeoutError' ? 'Le service distant n’a pas répondu à temps.' : status >= 500 && !(e instanceof PennylaneError) && !e.public ? 'Erreur interne du serveur. Réessaie ; si le problème persiste, contacte l’administrateur.' : e.message;
      if (!res.headersSent) send(res, status, { error: message });
    }
  }
  return { handle, store, cfg };
}

module.exports = { sniff, creationMissing, createApp, createStore, config, newUser, buildIndex, buildCreationForm, normInvoice, normCustomer, plList, FileStore, RedisStore };
