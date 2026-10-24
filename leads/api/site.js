/*
 * Analyse du site d'une société : page d'accueil et jusqu'à trois pages « contact », « mentions
 * légales », « à propos » du même site. Renvoie les e-mails, téléphones et liens vers Instagram,
 * Facebook, LinkedIn et TikTok publiés par la société elle-même.
 *  GET /api/site?url=https://exemple.fr → { site, emails, phones, socials, pages }
 * Protégé par le mot de passe de l'équipe sur Vercel ; adresses internes refusées.
 */
'use strict';
const dns = require('node:dns').promises;
const net = require('node:net');
const { teamAuth, sendJson } = require('../lib/auth');

const MAX_BYTES = 1500 * 1024;
const UA = 'Mozilla/5.0 (compatible; LeadsExpertComptable/1.0)';

function privateIp(ip) {
  if (net.isIPv6(ip)) { const v = ip.toLowerCase(); if (v.startsWith('::ffff:')) return privateIp(v.slice(7)); return v === '::1' || v === '::' || /^(fc|fd|fe8|fe9|fea|feb)/.test(v); }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
const allowLocal = () => process.env.LEADS_SITE_ALLOW_LOCAL === '1' && !process.env.VERCEL; // tests uniquement
async function checkHost(u) {
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw Object.assign(new Error('Adresse non autorisée'), { status: 400 });
  if (allowLocal()) return;
  const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await dns.lookup(u.hostname, { all: true }).catch(() => { throw Object.assign(new Error('Site introuvable'), { status: 404 }); });
  if (!addrs.length || addrs.some(a => privateIp(a.address))) throw Object.assign(new Error('Adresse non autorisée'), { status: 400 });
}

/* Page HTML, redirections suivies (3 au plus) en revérifiant chaque adresse, taille limitée. */
async function getPage(url) {
  let u = new URL(url);
  for (let i = 0; i < 4; i++) {
    await checkHost(u);
    const r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(8000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u); continue; }
    if (!r.ok) throw Object.assign(new Error('Site : erreur ' + r.status), { status: 502 });
    if (!/html|xml|text\/plain/i.test(r.headers.get('content-type') || 'text/html')) return { url: u.href, html: '' };
    const reader = r.body.getReader(), chunks = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; chunks.push(value); if (size > MAX_BYTES) { reader.cancel(); break; } }
    return { url: u.href, html: Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8') };
  }
  throw Object.assign(new Error('Trop de redirections'), { status: 502 });
}

const decode = s => s.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&commat;/g, '@').replace(/&period;/g, '.').replace(/&amp;/g, '&').replace(/\s*[[(]\s*(at|arobase)\s*[\])]\s*/gi, '@').replace(/\s*[[(]\s*(dot|point)\s*[\])]\s*/gi, '.');
const BAD_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|@(example|domain|email|exemple|votre-?domaine|sentry|wixpress|sentry-next)\.|^(no-?reply|ne-pas-repondre)@|@\d+x\./i;
const SOCIAL = /https?:\/\/(?:[a-z]{2,3}\.)?(instagram\.com|facebook\.com|fb\.com|linkedin\.com|tiktok\.com)\/[^\s"'<>)\\]+/gi;
const SOCIAL_SKIP = /\/(sharer|share|intent|plugins|dialog|tr\b|login|signup|policy|legal|help|privacy|hashtag|explore|watch|p\/|reel\/|posts?\/|stories)|shareArticle/i;

function extract(html, base) {
  const text = decode(html), out = { emails: new Set(), phones: new Set(), socials: {} };
  for (const m of text.matchAll(/mailto:([^"'?>\s]+)/gi)) out.emails.add(decodeURIComponent(m[1]).toLowerCase());
  for (const m of text.matchAll(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi)) out.emails.add(m[0].toLowerCase());
  for (const m of text.matchAll(/tel:([+\d\s().-]{8,})/gi)) out.phones.add(m[1].trim());
  for (const m of text.replace(/<[^>]+>/g, ' ').matchAll(/(?:\+33\s?\(?0?\)?\s?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g)) out.phones.add(m[0].trim());
  for (const m of text.matchAll(SOCIAL)) {
    const link = m[0].replace(/[?#].*$/, '').replace(/\/+$/, '');
    if (SOCIAL_SKIP.test(link)) continue;
    const host = m[1].replace('fb.com', 'facebook.com'), key = host === 'linkedin.com' ? (/\/in\//.test(link) ? 'linkedinPerson' : 'linkedin') : host.split('.')[0];
    if (link.split('/').length < 4) continue; // page d'accueil du réseau, pas un compte
    if (!out.socials[key]) out.socials[key] = link;
  }
  const links = [];
  for (const m of html.matchAll(/href=["']([^"'#]+)["'][^>]*>([\s\S]{0,80}?)</gi)) {
    if (!/contact|mentions|a-propos|apropos|about|qui-sommes|equipe|team/i.test(m[1] + ' ' + m[2])) continue;
    try { const u = new URL(m[1], base); if (u.host === new URL(base).host && !links.includes(u.href)) links.push(u.href); } catch { /* lien invalide */ }
  }
  out.emails = [...out.emails].filter(e => !BAD_EMAIL.test(e));
  return { ...out, phones: [...out.phones], links: links.slice(0, 3) };
}

async function analyze(site) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(site) && !/^https?:\/\//i.test(site)) throw Object.assign(new Error('Adresse non autorisée'), { status: 400 });
  const home = await getPage(/^https?:\/\//i.test(site) ? site : 'https://' + site);
  const res = extract(home.html, home.url), pages = [home.url];
  for (const link of res.links) {
    try {
      const p = await getPage(link), x = extract(p.html, p.url); pages.push(p.url);
      x.emails.forEach(e => !res.emails.includes(e) && res.emails.push(e));
      x.phones.forEach(t => !res.phones.includes(t) && res.phones.push(t));
      for (const [k, v] of Object.entries(x.socials)) if (!res.socials[k]) res.socials[k] = v;
    } catch { /* page secondaire ignorée */ }
  }
  // E-mails du domaine de la société en premier.
  const host = new URL(home.url).hostname.replace(/^www\./, '');
  res.emails.sort((a, b) => (b.endsWith('@' + host) || b.endsWith('.' + host)) - (a.endsWith('@' + host) || a.endsWith('.' + host)));
  return { site: home.url, emails: res.emails.slice(0, 10), phones: res.phones.slice(0, 5), socials: res.socials, pages };
}

module.exports = async function site(req, res) {
  const auth = teamAuth(req);
  if (process.env.VERCEL && !auth.configured) return sendJson(res, 503, { error: 'Analyse des sites réservée à l\'équipe : configure LEADS_TEAM_PASSWORD.' });
  if (auth.configured && !auth.ok) return sendJson(res, 401, { error: 'Mot de passe d\'équipe incorrect.' });
  const target = new URL(req.url, 'http://local').searchParams.get('url');
  if (!target) return sendJson(res, 400, { error: 'Adresse manquante' });
  try { return sendJson(res, 200, await analyze(target)); }
  catch (e) { return sendJson(res, e.status || 502, { error: e.status ? e.message : 'Site injoignable' }); }
};
module.exports.extract = extract;
module.exports.privateIp = privateIp;
