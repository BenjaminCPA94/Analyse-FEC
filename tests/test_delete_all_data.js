'use strict';
/**
 * Tests de la suppression complète des données ("Supprimer toutes les
 * données") — cf. AUDIT_CORRECTIONS.md, correctif critique n°1.
 *
 * AVANT correctif : deleteAllLocalData() n'aurait supprimé que STORE_KEY
 * de façon non centralisée, sans vérification après coup ni signalement
 * explicite d'un échec partiel — un vrai risque RGPD/confidentialité pour
 * un cabinet qui croit avoir tout effacé.
 *
 * Cette branche ne comporte qu'un seul module de stockage (les dossiers,
 * STORE_KEY) — pas de prévisionnels/TNS/rémunération/IRPP séparés. Ces
 * tests vérifient : la liste centralisée ALL_STORAGE_KEYS couvre bien
 * cette clé, deleteAllLocalData() la supprime, la fonction détecte et
 * signale une suppression incomplète au lieu de prétendre avoir réussi,
 * et confirmDeleteAllData() respecte l'annulation de l'utilisateur
 * (confirm() = false → aucune suppression).
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

const EXPECTED_KEYS = [
  'fec_analyse_v2',
];

function run(htmlPath) {
  const results = [];

  // ── 1. ALL_STORAGE_KEYS couvre exactement la clé connue ────────────────
  {
    const ctx = loadApp(htmlPath);
    const keys = getJSON(ctx, 'ALL_STORAGE_KEYS');
    results.push({
      name: 'ALL_STORAGE_KEYS contient la clé de stockage connue de l\'application',
      pass: Array.isArray(keys) && EXPECTED_KEYS.every(k => keys.includes(k)) && keys.length === EXPECTED_KEYS.length,
      detail: keys,
    });
  }

  // ── 2. deleteAllLocalData() supprime bien TOUTES les clés ──────────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      ALL_STORAGE_KEYS.forEach(k => localStorage.setItem(k, JSON.stringify({ demo: true })));
    `);
    const beforeCount = getJSON(ctx, "ALL_STORAGE_KEYS.filter(k => localStorage.getItem(k) !== null).length");
    results.push({ name: 'Fixture : la clé est bien peuplée avant suppression', pass: beforeCount === 1, detail: beforeCount });

    const ok = getJSON(ctx, 'deleteAllLocalData()');
    results.push({ name: 'deleteAllLocalData() renvoie true en cas de succès', pass: ok === true });

    const afterCount = getJSON(ctx, "ALL_STORAGE_KEYS.filter(k => localStorage.getItem(k) !== null).length");
    results.push({
      name: 'deleteAllLocalData() supprime bien la clé de stockage',
      pass: afterCount === 0,
      detail: afterCount,
    });
  }

  // ── 3. deleteAllLocalData() ne prétend jamais avoir réussi si une clé survit ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      ALL_STORAGE_KEYS.forEach(k => localStorage.setItem(k, JSON.stringify({ demo: true })));
      // Simule un échec partiel : removeItem() ne supprime jamais STORE_KEY
      // (ex. clé verrouillée par un autre onglet, quota, bug futur...).
      const _origRemove = localStorage.removeItem.bind(localStorage);
      localStorage.removeItem = (k) => { if (k === STORE_KEY) return; _origRemove(k); };
    `);
    const ok = getJSON(ctx, 'deleteAllLocalData()');
    results.push({
      name: 'deleteAllLocalData() renvoie false si une clé survit après suppression (jamais un faux succès)',
      pass: ok === false,
      detail: ok,
    });
    const toastShown = getJSON(ctx, 'document.body.children.some(c => (c.textContent||"").includes("subsistent"))');
    results.push({
      name: 'deleteAllLocalData() affiche un message explicite listant la clé qui a survécu',
      pass: toastShown === true,
    });
  }

  // ── 4. confirmDeleteAllData() respecte l'annulation utilisateur ────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      ALL_STORAGE_KEYS.forEach(k => localStorage.setItem(k, JSON.stringify({ demo: true })));
      confirm = () => false; // l'utilisateur annule la confirmation
    `);
    runIn(ctx, 'confirmDeleteAllData();');
    const stillThere = getJSON(ctx, "ALL_STORAGE_KEYS.filter(k => localStorage.getItem(k) !== null).length");
    results.push({
      name: "confirmDeleteAllData() n'efface rien si l'utilisateur annule la confirmation",
      pass: stillThere === 1,
      detail: stillThere,
    });
  }

  // ── 5. confirmDeleteAllData() efface tout quand l'utilisateur confirme ─
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      ALL_STORAGE_KEYS.forEach(k => localStorage.setItem(k, JSON.stringify({ demo: true })));
      confirm = () => true;
      location = { reload() {} }; // évite un crash sur location.reload() en sandbox
    `);
    runIn(ctx, 'confirmDeleteAllData();');
    const remaining = getJSON(ctx, "ALL_STORAGE_KEYS.filter(k => localStorage.getItem(k) !== null).length");
    results.push({
      name: 'confirmDeleteAllData() supprime bien la clé quand la confirmation est acceptée',
      pass: remaining === 0,
      detail: remaining,
    });
  }

  // ── 6. deleteAllIndexedDbData() ne plante jamais quand IndexedDB est absent ──
  {
    const ctx = loadApp(htmlPath);
    let threw = false;
    try {
      runIn(ctx, 'deleteAllIndexedDbData()');
    } catch (e) { threw = true; }
    results.push({
      name: "deleteAllIndexedDbData() ne lève jamais d'exception même si l'API IndexedDB est absente (navigateur ancien, sandbox de test)",
      pass: !threw,
    });
  }

  return results;
}

if (require.main === module) {
  const htmlPath = process.argv[2] || path.join(__dirname, '..', 'FEC_Analyse_v6.html');
  const results = run(htmlPath);
  let failed = 0;
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} — ${r.name}${r.pass ? '' : ' :: ' + JSON.stringify(r.detail)}`);
    if (!r.pass) failed++;
  }
  process.exit(failed ? 1 : 0);
}

module.exports = { run };
