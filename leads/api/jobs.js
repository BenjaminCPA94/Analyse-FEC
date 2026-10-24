/* Offres de comptable publiées sur France Travail : GET /api/jobs?deps=75,92&days=14 → { offers }. */
'use strict';
const ft = require('../lib/francetravail');
const { teamAuth, sendJson } = require('../lib/auth');

module.exports = async function jobs(req, res) {
  if (!ft.configured()) return sendJson(res, 503, { error: 'Offres France Travail non configurées (FT_CLIENT_ID, FT_CLIENT_SECRET).' });
  const auth = teamAuth(req);
  if (auth.configured && !auth.ok) return sendJson(res, 401, { error: 'Mot de passe d\'équipe incorrect.' });
  const u = new URL(req.url, 'http://local');
  const deps = String(u.searchParams.get('deps') || '').split(',').map(x => x.trim().toUpperCase()).filter(x => /^(\d{2,3}|2[AB])$/.test(x));
  if (!deps.length) return sendJson(res, 400, { error: 'Départements manquants' });
  try { return sendJson(res, 200, { offers: await ft.searchOffers({ deps, days: Number(u.searchParams.get('days') || 14) }) }); }
  catch (e) { return sendJson(res, 502, { error: e.message }); }
};
