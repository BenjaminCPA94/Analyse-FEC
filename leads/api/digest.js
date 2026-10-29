/*
 * Résumé hebdomadaire par e-mail : chaque lundi matin (tâche planifiée Vercel), les leads de la
 * semaine sur la zone choisie, déjà triés et complétés avec l'annuaire. Le score et la lecture
 * des annonces sont ceux de la page (bloc CORE de Leads_Expert_Comptable.html), sans copie.
 *
 * Variables d'environnement (Vercel › Settings › Environment Variables) :
 *  RESEND_API_KEY      clé resend.com (envoi des e-mails)
 *  LEADS_EMAIL_TO      destinataire(s), séparés par des virgules
 *  CRON_SECRET         secret de la tâche planifiée (Vercel l'envoie tout seul)
 *  LEADS_DEPS          départements (défaut : 75,92,93,94)
 *  LEADS_TARGET        activités recherchées, LEADS_EXCLUDE mots-clés à exclure
 *  LEADS_CLIENTS       SIREN des clients à exclure
 *  LEADS_FORMES        formes gardées (défaut : SAS,SASU,SARL,EURL,SA,SNC,Autre ; ajouter SCI, EI)
 *  LEADS_CAPITAL_MIN / LEADS_CAPITAL_MAX   capital social en euros ; LEADS_ZONES codes postaux ou villes
 *  LEADS_MIN_SCORE     score minimum (défaut : 60), LEADS_EMAIL_FROM expéditeur
 * Avec le suivi partagé, les sociétés déjà traitées par l'équipe sont écartées et les relances de la
 * semaine listées ; avec FT_CLIENT_ID / FT_CLIENT_SECRET, les entreprises qui recrutent un comptable.
 * Aperçu sans envoi : /api/digest?secret=<CRON_SECRET>&dry=1
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createStore } = require('../lib/store');
const ft = require('../lib/francetravail');

function loadCore() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'Leads_Expert_Comptable.html'), 'utf8');
  const block = html.match(/\/\* CORE:START[\s\S]*?\/\* CORE:END \*\//);
  if (!block) throw new Error('Bloc CORE introuvable dans la page');
  const ctx = vm.createContext({});
  vm.runInContext(block[0] + '\n;this.core = { BODACC_DATASET, ANNUAIRE, BODACC_FIELDS, whereClause, toLeads, applyAnnuaire, score, shortForme, jobsToLeads, passesFilters, FORMES_DEFAUT, migrateEntry, CLOSED };', ctx);
  return ctx.core;
}

const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function settings(env = process.env, core) {
  return {
    formes: env.LEADS_FORMES ? list(env.LEADS_FORMES).map(x => x.toUpperCase() === 'AUTRE' ? 'Autre' : x.toUpperCase()) : core.FORMES_DEFAUT,
    capMin: Number(env.LEADS_CAPITAL_MIN || 0), capMax: Number(env.LEADS_CAPITAL_MAX || 0), capUnknown: true, zones: list(env.LEADS_ZONES).map(x => x.toLowerCase()),
    deps: list(env.LEADS_DEPS || '75,92,93,94').map(d => d.toUpperCase().replace(/^(\d)$/, '0$1')),
    days: 7, target: list(env.LEADS_TARGET).map(x => x.toLowerCase()), exclude: list(env.LEADS_EXCLUDE).map(x => x.toLowerCase()),
    signals: ['vente', 'transfert', 'dirigeant', 'forme'], clients: new Set(list(env.LEADS_CLIENTS).map(x => x.replace(/\D/g, ''))),
    minScore: Number(env.LEADS_MIN_SCORE || 60),
  };
}

async function getJson(url) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (r.ok) return r.json();
    if (r.status === 429 && i < 3) { await sleep(1500 * (i + 1)); continue; }
    throw new Error(`${new URL(url).hostname} : erreur ${r.status}`);
  }
}

async function collect(core, c, shared) {
  const out = {}, follow = shared.follow || {};
  // Anciens statuts repris ; toute étape au-delà de « À traiter » vaut lead déjà traité.
  Object.values(follow).forEach(core.migrateEntry);
  const DONE = s => Boolean(s) && s !== 'À traiter';
  const treated = l => DONE(follow[l.id]?.status) || Boolean(l.siren && DONE(follow[l.siren]?.status));
  for (const kind of ['new', 'change']) {
    const q = `where=${encodeURIComponent(core.whereClause(c, kind))}&order_by=${encodeURIComponent('dateparution desc')}&select=${core.BODACC_FIELDS}&limit=-1`;
    const raw = await getJson(`${core.BODACC_DATASET}/exports/json?${q}`);
    const keep = l => core.passesFilters(l, c) && !(l.siren && c.clients.has(l.siren)) && !treated(l);
    // Annuaire pour les mieux notés seulement (7 requêtes par seconde au plus), puis nouveau tri.
    const leads = core.toLeads(raw, c, kind).filter(keep).sort((a, b) => b.score - a.score).slice(0, 60);
    for (const l of leads) {
      if (!l.siren) continue;
      try {
        const x = ((await getJson(`${core.ANNUAIRE}?q=${l.siren}&per_page=1`)).results || []).find(y => y.siren === l.siren);
        if (x) { core.applyAnnuaire(l, x); l.score = core.score(l, c); }
      } catch { /* lead gardé sans complément */ }
      await sleep(150);
    }
    out[kind] = { total: raw.length, leads: leads.filter(l => keep(l) && !l.etablissement && l.score >= c.minScore).sort((a, b) => b.score - a.score).slice(0, 25) };
  }
  if (ft.configured()) {
    const offers = await ft.searchOffers({ deps: c.deps, days: 7 });
    const jobs = core.jobsToLeads(offers, c).filter(l => !l.anonymous && !treated(l) && core.passesFilters(l, c));
    out.jobs = { total: offers.length, leads: jobs.filter(l => l.score >= c.minScore).sort((a, b) => b.score - a.score).slice(0, 20) };
  }
  // Relances prévues d'ici dimanche.
  const end = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  out.relances = Object.entries(follow).filter(([, f]) => f.relance && f.relance <= end && !core.CLOSED.includes(f.status))
    .map(([id, f]) => ({ id, relance: f.relance, by: f.by, nom: f.lead?.nom || id, email: f.email || '', ville: f.lead?.ville || '' })).sort((a, b) => a.relance.localeCompare(b.relance));
  return out;
}

function renderEmail(core, res, appUrl) {
  const row = l => `<tr>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:700;color:${l.score >= 75 ? '#3B6D11' : '#b4531f'}">${l.score}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee"><b>${esc(l.nom)}</b><br><span style="color:#6b6960;font-size:12px">${esc([core.shortForme(l.forme), l.siren].filter(Boolean).join(' · '))}</span></td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(l.signal)}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#6b6960">${esc(String(l.naf || l.activite || '').slice(0, 90))}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(l.ville)}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px">${esc(String(l.dirigeantsAnnuaire || l.dirigeants || '').slice(0, 80))}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px">${l.siren ? `<a href="https://annuaire-entreprises.data.gouv.fr/entreprise/${l.siren}">Annuaire</a>` : ''}${l.url ? ` · <a href="${esc(l.url)}">Annonce</a>` : ''}</td></tr>`;
  const section = (title, r) => `<h2 style="font-size:16px;margin:24px 0 8px">${title} — ${r.leads.length} lead(s) prioritaire(s)</h2>` + (r.leads.length
    ? `<table style="border-collapse:collapse;width:100%;font-size:13px"><tr style="text-align:left;color:#6b6960;font-size:11px;text-transform:uppercase"><th style="padding:6px 8px">Score</th><th style="padding:6px 8px">Société</th><th style="padding:6px 8px">Événement</th><th style="padding:6px 8px">Activité</th><th style="padding:6px 8px">Lieu</th><th style="padding:6px 8px">Dirigeants</th><th style="padding:6px 8px">Liens</th></tr>${r.leads.map(row).join('')}</table>`
    : '<p style="color:#6b6960">Aucun lead au-dessus du score minimum cette semaine.</p>');
  return `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1a1916;max-width:1000px">
    <h1 style="font-size:18px">Leads expert-comptable de la semaine</h1>
    <p style="color:#6b6960">${res.new.total + res.change.total} annonce(s) lues au BODACC sur 7 jours${res.jobs ? `, ${res.jobs.total} offre(s) de comptable sur France Travail` : ''}. Tes clients, les sociétés déjà contactées, les sociétés cessées et les simples ouvertures d'établissement sont exclus.${appUrl ? ` <a href="${esc(appUrl)}">Ouvrir l'outil</a> pour le suivi et la recherche d'e-mails.` : ''}</p>
    ${res.relances.length ? `<h2 style="font-size:16px;margin:24px 0 8px">Relances de la semaine — ${res.relances.length}</h2><ul style="font-size:13px">${res.relances.map(r => `<li>${r.relance.split('-').reverse().join('/')} : <b>${esc(r.nom)}</b>${r.ville ? ' (' + esc(r.ville) + ')' : ''}${r.email ? ' · ' + esc(r.email) : ''}${r.by ? ' · suivi par ' + esc(r.by) : ''}</li>`).join('')}</ul>` : ''}
    ${section('Nouvelles sociétés', res.new)}${section('Sociétés en changement', res.change)}${res.jobs ? section('Entreprises qui recrutent un comptable', res.jobs) : ''}</div>`;
}

module.exports = async function digest(req, res) {
  const url = new URL(req.url, 'http://local'), secret = process.env.CRON_SECRET;
  const send = (status, body, type = 'application/json; charset=utf-8') => { res.statusCode = status; res.setHeader('Content-Type', type); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
  if (!secret) return send(503, { error: 'CRON_SECRET non configuré' });
  if (req.headers.authorization !== 'Bearer ' + secret && url.searchParams.get('secret') !== secret) return send(401, { error: 'Accès refusé' });
  try {
    const core = loadCore(), c = settings(process.env, core), store = createStore();
    // Suivi partagé : sociétés déjà traitées, relances, clients ajoutés dans l'outil.
    const shared = store && process.env.LEADS_TEAM_PASSWORD ? { follow: await store.all().catch(() => ({})), settings: await store.settings().catch(() => ({})) } : {};
    for (const sr of shared.settings?.clients || []) c.clients.add(String(sr));
    const res2 = await collect(core, c, shared);
    const appUrl = process.env.LEADS_APP_URL || (req.headers.host ? 'https://' + req.headers.host : '');
    const html = renderEmail(core, res2, appUrl);
    if (url.searchParams.get('dry')) return send(200, html, 'text/html; charset=utf-8');
    const to = list(process.env.LEADS_EMAIL_TO);
    if (!process.env.RESEND_API_KEY || !to.length) return send(503, { error: 'RESEND_API_KEY ou LEADS_EMAIL_TO manquant' });
    const n = res2.new.leads.length + res2.change.leads.length + (res2.jobs?.leads.length || 0);
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.LEADS_EMAIL_FROM || 'Leads <onboarding@resend.dev>', to, subject: `${n} lead(s) expert-comptable cette semaine`, html }),
    });
    if (!r.ok) return send(502, { error: 'Envoi refusé par Resend : ' + (await r.text()).slice(0, 300) });
    return send(200, { sent: true, to, nouvelles: res2.new.leads.length, changements: res2.change.leads.length, recrutements: res2.jobs?.leads.length || 0, relances: res2.relances.length });
  } catch (e) {
    return send(502, { error: e.message });
  }
};
module.exports.loadCore = loadCore;
