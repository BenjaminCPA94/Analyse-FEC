/*
 * Suivi partagé de l'équipe.
 *  GET  /api/follow                       → { follow, settings, user }
 *  POST /api/follow { op: 'patch', id, patch, lead }   → fiche mise à jour (champ par champ, auteur et date)
 *  POST /api/follow { op: 'import', follow }           → fusion d'un suivi local (la fiche la plus récente l'emporte)
 *  POST /api/follow { op: 'settings', settings }       → réglages communs (clients, messages, cabinet)
 */
'use strict';
const { createStore, meaningful } = require('../lib/store');
const { teamAuth, sendJson, readJson } = require('../lib/auth');

const ID = /^[\w.-]{1,80}$/;
const SETTING_KEYS = ['clients', 'cabinet', 'templates', 'seqTemplates', 'seqCfg'];

module.exports = async function follow(req, res) {
  const auth = teamAuth(req);
  if (!auth.configured) return sendJson(res, 503, { error: 'Suivi partagé non configuré (LEADS_TEAM_PASSWORD).' });
  if (!auth.ok) return sendJson(res, 401, { error: 'Mot de passe d\'équipe incorrect.' });
  const store = createStore();
  if (!store) return sendJson(res, 503, { error: 'Base de données non connectée : ajoute « Upstash for Redis » au projet Vercel.' });
  try {
    if (req.method === 'GET') return sendJson(res, 200, { follow: await store.all(), settings: await store.settings(), user: auth.user });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Méthode non autorisée' });
    const b = await readJson(req), now = new Date().toISOString();
    if (b.op === 'patch') {
      if (!ID.test(String(b.id || '')) || typeof b.patch !== 'object' || !b.patch) return sendJson(res, 400, { error: 'Fiche invalide' });
      const old = (await store.get(b.id)) || {};
      const next = { ...old, ...b.patch, lead: b.lead && typeof b.lead === 'object' ? b.lead : old.lead, updated: now, by: auth.user };
      const keep = meaningful(next) ? next : null;
      await store.set(b.id, keep);
      return sendJson(res, 200, { entry: keep });
    }
    if (b.op === 'import') {
      if (typeof b.follow !== 'object' || !b.follow) return sendJson(res, 400, { error: 'Suivi invalide' });
      const cur = await store.all(); let n = 0;
      for (const [id, e] of Object.entries(b.follow)) {
        if (!ID.test(id) || !meaningful(e)) continue;
        if (!cur[id] || String(e.updated || '') > String(cur[id].updated || '')) { await store.set(id, { ...e, by: e.by || auth.user }); n++; }
      }
      return sendJson(res, 200, { imported: n, follow: await store.all() });
    }
    if (b.op === 'settings') {
      const s = await store.settings();
      for (const k of SETTING_KEYS) if (b.settings && k in b.settings) s[k] = b.settings[k];
      s.updated = now; s.by = auth.user;
      await store.setSettings(s);
      return sendJson(res, 200, { settings: s });
    }
    return sendJson(res, 400, { error: 'Opération inconnue' });
  } catch (e) {
    return sendJson(res, e.status || 502, { error: e.message });
  }
};
