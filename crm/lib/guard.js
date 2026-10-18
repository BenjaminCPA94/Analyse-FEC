/*
 * Contrôles serveur de l'état partagé : intégrité, droits par rôle et journal des modifications.
 * Le navigateur envoie l'état complet ; le serveur compare à la version enregistrée et refuse
 * ce que le rôle de la session ne permet pas. L'auteur est toujours celui de la session, jamais
 * une valeur transmise par le navigateur.
 */
'use strict';

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Collections d'entités suivies : chemin, libellé, nom affiché.
const COLLECTIONS = [
  ['clients', s => s.clients, 'client', e => e.name],
  ['prospects', s => s.prospects, 'prospect', e => e.name],
  ['invoices', s => (s.invoices || []).filter(i => i.source !== 'pennylane'), 'facture déclarée', e => e.label || e.number],
  ['time', s => s.time, 'temps', e => `${e.date || ''} ${e.hours || ''} h`],
  ['exc', s => s.exc27?.items, 'travail exceptionnel', e => e.name],
  ['creation', s => s.creation27?.items, 'dossier de création', e => e.name],
];
const list = (s, get) => (Array.isArray(get(s)) ? get(s) : []);
const byId = arr => new Map(arr.filter(e => isObj(e) && typeof e.id === 'string').map(e => [e.id, e]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* Anomalies d'intégrité : on ne refuse que celles qu'une sauvegarde ajoute (les données historiques restent acceptées). */
function violations(s) {
  const out = new Set(), clientIds = new Set(list(s, x => x.clients).map(c => c.id));
  for (const [key, get] of COLLECTIONS) {
    const seen = new Set();
    for (const e of list(s, get)) {
      if (!isObj(e)) { out.add(`${key}: élément invalide`); continue; }
      if (typeof e.id !== 'string' || !e.id.trim() || e.id.length > 80) out.add(`${key}: identifiant invalide (${JSON.stringify(e.id)})`);
      else if (seen.has(e.id)) out.add(`${key}: identifiant en double ${e.id}`);
      seen.add(e.id);
    }
  }
  for (const c of list(s, x => x.clients)) {
    if (typeof c.name !== 'string' || !c.name.trim()) out.add(`clients: nom manquant ${c.id}`);
    if (c.siren && !/^\d{9}$/.test(String(c.siren).replace(/\s/g, ''))) out.add(`clients: SIREN invalide ${c.id}`);
    if (c.entry && !DATE.test(c.entry)) out.add(`clients: date d'entrée invalide ${c.id}`);
    for (const v of [c.annualFees, c.budgetHours, ...Object.values(c.feesBreakdown || {})]) if (v != null && v !== '' && !Number.isFinite(Number(v))) out.add(`clients: montant invalide ${c.id}`);
  }
  for (const i of list(s, x => (x.invoices || []).filter(i => i.source !== 'pennylane'))) {
    if (i.client && !clientIds.has(i.client)) out.add(`invoices: client inexistant ${i.id}`);
    if (i.date && !DATE.test(i.date)) out.add(`invoices: date invalide ${i.id}`);
    if (i.ht != null && i.ht !== '' && !Number.isFinite(Number(i.ht))) out.add(`invoices: montant invalide ${i.id}`);
  }
  for (const t of list(s, x => x.time)) {
    if (t.client && !clientIds.has(t.client)) out.add(`time: client inexistant ${t.id}`);
    if (t.date && !DATE.test(t.date)) out.add(`time: date invalide ${t.id}`);
    const h = Number(t.hours); if (!(h > 0 && h <= 24)) out.add(`time: durée invalide ${t.id}`);
  }
  for (const w of list(s, x => x.exc27?.items)) {
    if (w.client && !clientIds.has(w.client)) out.add(`exc: client inexistant ${w.id}`);
    if (w.fees != null && w.fees !== '' && !Number.isFinite(Number(w.fees))) out.add(`exc: honoraires invalides ${w.id}`);
  }
  return out;
}
function newViolations(oldState, next) {
  const before = oldState ? violations(oldState) : new Set();
  return [...violations(next)].filter(v => !before.has(v));
}

// Forme normalisée : un objet vide ou des zéros créés à l'affichage ne comptent pas comme une modification.
const nz = o => Object.fromEntries(Object.entries(isObj(o) ? o : {}).filter(([, v]) => v && Number(v) !== 0).map(([k, v]) => [k, typeof v === 'boolean' ? v : Number(v)]).sort());
const feeShape = c => [Number(c.annualFees || 0), nz(c.feesBreakdown), Number(c.budgetHours || 0), nz(c.missions)];
const memberShape = m => ({ name: m.name, role: m.role, capacity: m.capacity, active: m.active, user: m.user });

/* Droits : renvoie la liste des refus (vide si tout est autorisé). */
function permissionErrors(oldState, next, perms, username) {
  const errs = [];
  if (!oldState) return errs;
  for (const [key, get, label, name] of COLLECTIONS) {
    const before = byId(list(oldState, get)), after = byId(list(next, get));
    for (const [id, e] of before) {
      if (after.has(id)) continue;
      // Un collaborateur peut supprimer ses propres saisies de temps.
      if (key === 'time' && e.createdBy && e.createdBy === username) continue;
      if (!perms.delete) errs.push(`Suppression non autorisée pour ton rôle : ${label} « ${name(e) || id} ».`);
    }
  }
  if (!perms.import) {
    const before = byId(list(oldState, s => s.clients)), added = list(next, s => s.clients).filter(c => !before.has(c.id)).length;
    if (added > 5) errs.push(`Création de ${added} clients en une fois (import) réservée aux managers, associés et administrateurs.`);
  }
  if (!perms.settings && !same(oldState.cabinet26, next.cabinet26) && oldState.cabinet26) errs.push('Modification des paramètres du cabinet réservée aux associés et administrateurs.');
  const teamBefore = byId(list(oldState, s => s.team27)), teamAfter = byId(list(next, s => s.team27));
  for (const [id, m] of teamBefore) {
    const n = teamAfter.get(id);
    if (!n) { if (!perms.settings) errs.push(`Suppression du collaborateur « ${m.name} » non autorisée.`); continue; }
    if (!perms.settings && !same(memberShape(m), memberShape(n))) errs.push(`Modification de la fiche équipe « ${m.name} » réservée aux associés et administrateurs.`);
    if (!perms.costs && Number(m.cost) !== Number(n.cost)) errs.push(`Modification du coût horaire de « ${m.name} » non autorisée.`);
  }
  for (const [id, n] of teamAfter) if (!teamBefore.has(id) && !perms.settings && !n.auto) errs.push(`Ajout du collaborateur « ${n.name} » réservé aux associés et administrateurs.`);
  const clientsBefore = byId(list(oldState, s => s.clients));
  for (const c of list(next, s => s.clients)) {
    const o = clientsBefore.get(c.id);
    if (o && !perms.fees && !same(feeShape(o), feeShape(c))) errs.push(`Honoraires, budget ou missions de « ${c.name} » : modification réservée aux managers, associés et administrateurs.`);
    if (!perms.force && c.onbValidated27?.forced && !same(o?.onbValidated27, c.onbValidated27)) errs.push(`Validation exceptionnelle de l'onboarding de « ${c.name} » réservée aux associés et administrateurs.`);
  }
  return [...new Set(errs)].slice(0, 20);
}

/* Le serveur date et signe les nouvelles entités avec l'auteur réel de la session. */
function stampAuthors(oldState, next, username) {
  const now = new Date().toISOString();
  for (const [, get] of COLLECTIONS) {
    const before = oldState ? byId(list(oldState, get)) : new Map();
    for (const e of list(next, get)) {
      if (!isObj(e)) continue;
      const o = before.get(e.id);
      if (o) { e.createdBy = o.createdBy; e.createdAt = o.createdAt; }
      else { e.createdBy = username; e.createdAt = e.createdAt || now; }
    }
  }
}

/* Coûts horaires masqués pour les rôles sans accès : retirés à la lecture, réinjectés à l'écriture. */
function hideCosts(state) {
  if (!state) return state;
  const s = { ...state };
  if (Array.isArray(s.team27)) s.team27 = s.team27.map(m => ({ ...m, cost: null, costHidden: true }));
  return s;
}
function restoreCosts(oldState, next) {
  if (!Array.isArray(next.team27)) return;
  const before = byId(list(oldState || {}, s => s.team27));
  for (const m of next.team27) {
    if (!isObj(m)) continue;
    if (before.has(m.id)) m.cost = before.get(m.id).cost;
    else if (m.cost == null) m.cost = 50;
    delete m.costHidden;
  }
}

/* Journal : ce qui a changé, entité par entité, avec quelques valeurs avant / après utiles (statuts, montants). */
const TRACKED = ['status', 'stage', 'statut', 'name', 'siren', 'annualFees', 'budgetHours', 'ht', 'date', 'hours', 'fees', 'onbValidated27'];
function changes(oldState, next) {
  const out = [];
  for (const [key, get, label, name] of COLLECTIONS) {
    const before = byId(list(oldState || {}, get)), after = byId(list(next, get));
    for (const [id, e] of after) {
      const o = before.get(id);
      if (!o) { out.push({ type: key, id, name: name(e), op: 'création' }); continue; }
      if (same(o, e)) continue;
      const keys = [...new Set([...Object.keys(o), ...Object.keys(e)])].filter(k => !same(o[k], e[k]));
      const diff = {};
      for (const k of keys.filter(k => TRACKED.includes(k))) diff[k] = [o[k] ?? null, e[k] ?? null];
      out.push({ type: key, id, name: name(e), op: 'modification', keys: keys.slice(0, 30), diff });
    }
    for (const [id, o] of before) if (!after.has(id)) out.push({ type: key, id, name: name(o), op: 'suppression' });
  }
  for (const k of ['cabinet26', 'team27', 'billing27', 'boards27', 'fiscView27']) if (oldState && !same(oldState[k], next[k])) out.push({ type: k, op: 'modification' });
  return out;
}

module.exports = { violations, newViolations, permissionErrors, stampAuthors, hideCosts, restoreCosts, changes };
