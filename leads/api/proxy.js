/*
 * Relais vers les fournisseurs de contacts (Hunter, Apollo, Icypeas, Dropcontact, Lusha).
 * Ces services refusent souvent les appels lancés directement depuis une page web : la page
 * passe donc par ce relais, qui transmet la requête telle quelle (clé comprise) et renvoie
 * la réponse. Il ne garde rien et ne joint que les adresses autorisées ci-dessous.
 */
'use strict';
const ALLOWED = new Set(['google.serper.dev', 'places.googleapis.com', 'api.hunter.io', 'api.apollo.io', 'app.icypeas.com', 'api.dropcontact.com', 'api.lusha.com']);
const PASS = ['accept', 'content-type', 'authorization', 'x-goog-api-key', 'x-goog-fieldmask', 'x-api-key', 'x-access-token', 'api_key', 'cache-control'];
const MAX_BODY = 100 * 1024;

function readBody(req) {
  if (req.body !== undefined) return Promise.resolve(typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body));
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Requête trop volumineuse'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

module.exports = async function proxy(req, res) {
  const reply = (status, body, type = 'application/json') => {
    res.statusCode = status;
    res.setHeader('Content-Type', type);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', PASS.join(', '));
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('x-leads-proxy', '1');
    res.end(body);
  };
  if (req.method === 'OPTIONS') return reply(204, '');
  if (!['GET', 'POST'].includes(req.method)) return reply(405, JSON.stringify({ error: 'Méthode non autorisée' }));
  let target;
  try { target = new URL(new URL(req.url, 'http://local').searchParams.get('url') || ''); } catch { return reply(400, JSON.stringify({ error: 'Adresse manquante' })); }
  if (target.protocol !== 'https:' || !ALLOWED.has(target.hostname)) return reply(403, JSON.stringify({ error: 'Adresse non autorisée' }));
  const headers = {};
  for (const h of PASS) if (req.headers[h]) headers[h] = req.headers[h];
  try {
    const body = req.method === 'POST' ? await readBody(req) : undefined;
    const r = await fetch(target, { method: req.method, headers, body, signal: AbortSignal.timeout(25000) });
    return reply(r.status, await r.text(), r.headers.get('content-type') || 'application/json');
  } catch (e) {
    return reply(e.status || 502, JSON.stringify({ error: e.status ? e.message : 'Fournisseur injoignable' }));
  }
};
