'use strict';
/**
 * Tests de la sauvegarde de secours IndexedDB (Phase 5, volet 2 de
 * l'audit demandé — lever une partie du plafond de capacité du
 * localStorage). loadStore()/saveStore() restent strictement
 * SYNCHRONES (34 usages dans le code, cf. AUDIT_CORRECTIONS.md §12) :
 * IndexedDB sert uniquement de miroir asynchrone best-effort, jamais de
 * source de vérité principale dans cette passe.
 *
 * Le bac à sable Node (tests/harness.js) ne définit pas `indexedDB` :
 * ces tests vérifient donc que toute la couche se dégrade proprement
 * (jamais d'exception, jamais de blocage) dans cet environnement, en
 * plus du comportement fonctionnel de restaurerDepuisIndexedDB() via des
 * doublures (idbBackupGetStore/idbBackupPutStore redéfinies).
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

async function run(htmlPath) {
  const results = [];

  // ── 1. ouvrirIndexedDBSecours() : dégradation propre sans indexedDB ────
  {
    const ctx = loadApp(htmlPath);
    const db = await runIn(ctx, 'ouvrirIndexedDBSecours()');
    results.push({ name: "ouvrirIndexedDBSecours() résout à null (sans planter) quand indexedDB n'est pas défini (bac à sable Node)", pass: db === null });
  }

  // ── 2. idbBackupPutStore() / idbBackupGetStore() : jamais d'exception ──
  {
    const ctx = loadApp(htmlPath);
    const putResult = await runIn(ctx, `idbBackupPutStore({ d1: { id: 'd1', name: 'Test' } })`);
    results.push({ name: "idbBackupPutStore() renvoie false (sans exception) quand IndexedDB est indisponible", pass: putResult === false });
    const getResult = await runIn(ctx, `idbBackupGetStore()`);
    results.push({ name: "idbBackupGetStore() renvoie null (sans exception) quand IndexedDB est indisponible", pass: getResult === null });
  }

  // ── 3. saveStore() reste strictement synchrone et fonctionne à l'identique ──
  {
    const ctx = loadApp(htmlPath);
    const ok = runIn(ctx, `saveStore({ d1: { id: 'd1', name: 'Test' } })`);
    results.push({ name: "saveStore() renvoie toujours true de façon synchrone (le miroir IndexedDB ne bloque ni ne modifie la valeur de retour)", pass: ok === true });
    const stored = getJSON(ctx, `JSON.parse(localStorage.getItem(STORE_KEY))`);
    results.push({ name: 'saveStore() a bien persisté les données dans localStorage comme avant (comportement inchangé)', pass: stored.d1 && stored.d1.name === 'Test', detail: stored });
  }

  // ── 4. saveStore() : le message d'erreur quota mentionne la sauvegarde de secours ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      __lastToast = null; __lastToastIsErr = null;
      function toast(msg, isErr){ __lastToast = msg; __lastToastIsErr = isErr; }
      localStorage._quotaBytes = 1; // force QuotaExceededError sur le prochain setItem
    `);
    runIn(ctx, `saveStore({ d1: { id: 'd1', name: 'x'.repeat(1000) } })`);
    const toastMsg = runIn(ctx, '__lastToast');
    results.push({
      name: 'saveStore() en cas de quota localStorage dépassé mentionne la sauvegarde de secours IndexedDB (donnée pas nécessairement perdue)',
      pass: /secours|IndexedDB/i.test(toastMsg || ''),
      detail: toastMsg,
    });
  }

  // ── 5. restaurerDepuisIndexedDB() : aucune sauvegarde trouvée ────────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      __lastToast = null;
      function toast(msg){ __lastToast = msg; }
      async function idbBackupGetStore(){ return null; }
    `);
    await runIn(ctx, `restaurerDepuisIndexedDB()`);
    const toastMsg = runIn(ctx, '__lastToast');
    results.push({ name: "restaurerDepuisIndexedDB() affiche un message clair quand aucune sauvegarde de secours n'existe", pass: /aucune sauvegarde/i.test(toastMsg || ''), detail: toastMsg });
  }

  // ── 6. restaurerDepuisIndexedDB() : restauration effective (confirm() stubbé à true) ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      __lastToast = null;
      function toast(msg){ __lastToast = msg; }
      async function idbBackupGetStore(){ return { 'd1': { id: 'd1', name: 'Dossier restauré depuis IndexedDB' } }; }
      localStorage.setItem(STORE_KEY, JSON.stringify({}));
    `);
    await runIn(ctx, `restaurerDepuisIndexedDB()`);
    const stored = getJSON(ctx, `JSON.parse(localStorage.getItem(STORE_KEY))`);
    results.push({
      name: 'restaurerDepuisIndexedDB() écrit bien la sauvegarde de secours dans localStorage quand elle existe (confirm() accepté)',
      pass: stored.d1 && stored.d1.name === 'Dossier restauré depuis IndexedDB',
      detail: stored,
    });
  }

  // ── 7. Non-régression : deleteAllIndexedDbData() reste un no-op sûr ─────
  {
    const ctx = loadApp(htmlPath);
    const ok = await runIn(ctx, 'deleteAllIndexedDbData()');
    results.push({ name: "deleteAllIndexedDbData() (Phase 1) continue de fonctionner sans exception avec la nouvelle base IndexedDB de secours (nettoyage générique par indexedDB.databases(), aucun couplage par nom nécessaire)", pass: ok === true });
  }

  return results;
}

if (require.main === module) {
  const htmlPath = process.argv[2] || path.join(__dirname, '..', 'FEC_Analyse_v6.html');
  run(htmlPath).then(results => {
    let failed = 0;
    for (const r of results) {
      console.log(`${r.pass ? 'PASS' : 'FAIL'} — ${r.name}${r.pass ? '' : ' :: ' + JSON.stringify(r.detail)}`);
      if (!r.pass) failed++;
    }
    process.exit(failed ? 1 : 0);
  });
}

module.exports = { run };
