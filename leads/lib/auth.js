/* Accès de l'équipe : mot de passe commun (LEADS_TEAM_PASSWORD), nom de la personne pour l'historique. */
'use strict';
const crypto = require('node:crypto');

function teamAuth(req) {
  const pass = process.env.LEADS_TEAM_PASSWORD || '';
  if (!pass) return { configured: false };
  const given = String(req.headers['x-leads-key'] || '');
  const a = crypto.createHash('sha256').update(given).digest(), b = crypto.createHash('sha256').update(pass).digest();
  let user = '';
  try { user = decodeURIComponent(String(req.headers['x-leads-user'] || '')).trim().slice(0, 60); } catch { /* nom illisible */ }
  return { configured: true, ok: crypto.timingSafeEqual(a, b) && given.length > 0, user: user || 'Équipe' };
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readJson(req, limit = 2 * 1024 * 1024) {
  if (req.body !== undefined) return Promise.resolve(typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body);
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Requête trop volumineuse'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(Object.assign(new Error('JSON invalide'), { status: 400 })); } });
    req.on('error', reject);
  });
}

module.exports = { teamAuth, sendJson, readJson };
