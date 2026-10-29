/*
 * Stockage partagé du suivi de l'équipe : Upstash Redis sur Vercel (KV_REST_API_URL / KV_REST_API_TOKEN,
 * ajoutées par Vercel quand on connecte « Upstash for Redis »), fichiers dans data/ en local.
 * Une fiche par société (clé = SIREN ou identifiant du lead), plus un objet de réglages communs.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const FOLLOW = 'leads:follow', SETTINGS = 'leads:settings';

class RedisStore {
  constructor(url, token) { this.url = url; this.token = token; }
  async cmd(...args) {
    const r = await fetch(this.url, { method: 'POST', headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(15000) });
    const x = await r.json().catch(() => ({}));
    if (!r.ok || x.error) throw new Error('Base de données indisponible : ' + (x.error || r.status));
    return x.result;
  }
  async all() { const a = (await this.cmd('HGETALL', FOLLOW)) || [], o = {}; for (let i = 0; i < a.length; i += 2) o[a[i]] = JSON.parse(a[i + 1]); return o; }
  async get(id) { const v = await this.cmd('HGET', FOLLOW, id); return v ? JSON.parse(v) : null; }
  async set(id, entry) { if (entry) await this.cmd('HSET', FOLLOW, id, JSON.stringify(entry)); else await this.cmd('HDEL', FOLLOW, id); }
  async settings() { const v = await this.cmd('GET', SETTINGS); return v ? JSON.parse(v) : {}; }
  async setSettings(s) { await this.cmd('SET', SETTINGS, JSON.stringify(s)); }
}

class FileStore {
  constructor(dir) { this.dir = dir; fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); }
  read(name, d) { try { return JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return d; throw e; } }
  write(name, v) { const f = path.join(this.dir, name), tmp = f + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v), { mode: 0o600 }); fs.renameSync(tmp, f); }
  async all() { return this.read('follow.json', {}); }
  async get(id) { return (await this.all())[id] || null; }
  async set(id, entry) { const a = await this.all(); if (entry) a[id] = entry; else delete a[id]; this.write('follow.json', a); }
  async settings() { return this.read('settings.json', {}); }
  async setSettings(s) { this.write('settings.json', s); }
}

function createStore(env = process.env) {
  const url = (env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, ''), token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '';
  if (url && token) return new RedisStore(url, token);
  if (env.VERCEL) return null; // pas de disque durable sur Vercel : suivi partagé indisponible sans Redis
  return new FileStore(path.resolve(__dirname, '..', env.LEADS_DATA_DIR || 'data'));
}

/* Une fiche est conservée tant qu'elle porte une information de suivi. */
const KEPT = ['status', 'note', 'email', 'phone', 'site', 'found', 'tried', 'relance', 'contacts', 'socials', 'seq'];
const meaningful = e => e && KEPT.some(k => e[k] && (typeof e[k] !== 'object' || Object.keys(e[k]).length));

module.exports = { createStore, meaningful };
