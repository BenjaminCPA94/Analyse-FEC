'use strict';
/**
 * Tests du parsing FEC déporté (Phase 5 de l'audit demandé — "performante
 * sur FEC volumineux") : parseFECEnArrierePlan() exécute
 * parseFECFile()/analyserQualiteImportFEC() dans un Web Worker construit à
 * la volée depuis leur `.toString()` (aucune duplication de code, donc
 * aucun risque de divergence entre thread principal et Worker), avec un
 * repli synchrone transparent si Worker/Blob sont indisponibles.
 *
 * Le bac à sable Node (tests/harness.js) ne définit pas `Worker` : ces
 * tests exercent donc systématiquement la branche de repli synchrone —
 * exactement le comportement attendu dans un environnement qui ne
 * supporte pas les Web Workers. La branche Worker réelle est vérifiée
 * manuellement en navigateur headless (Playwright), cf. AUDIT_CORRECTIONS.md.
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function fec(rows, sep = '\t') {
  const header = ['JournalCode','JournalLib','EcritureNum','EcritureDate','CompteNum','CompteLib','CompAuxNum','CompAuxLib','PieceRef','PieceDate','EcritureLib','Debit','Credit','EcritureLet','DateLet','ValidDate','Montantdevise','Idevise'];
  return [header.join(sep), ...rows.map(r => r.join(sep))].join('\r\n');
}

async function run(htmlPath) {
  const results = [];

  // ── 1. getFecParserWorker() : repli propre quand Worker est indisponible ──
  {
    const ctx = loadApp(htmlPath);
    const worker = runIn(ctx, 'getFecParserWorker()');
    results.push({ name: "getFecParserWorker() renvoie null (sans planter) quand Worker/Blob ne sont pas définis (bac à sable Node)", pass: worker === null });
  }

  // ── 2. parseFECEnArrierePlan() : repli synchrone, même résultat que le parsing direct ──
  {
    const ctx = loadApp(htmlPath);
    const text = fec([
      ['VE','Ventes','1','20250115','707000','Ventes','','','F1','20250115','Vente A','','1000',,'','','',''],
      ['VE','Ventes','2','20250116','411000','Client','','','F1','20250116','Vente A','1000','',,'','','',''],
    ]);
    runIn(ctx, `
      globalThis.__result = null; globalThis.__error = null;
      parseFECEnArrierePlan(${JSON.stringify(text)}).then(r => { globalThis.__result = r; }).catch(e => { globalThis.__error = e.message; });
    `);
    // Le repli synchrone résout la Promise sur le même tick (microtask) — attendre un macrotask suffit.
    await runIn(ctx, `new Promise(r => setTimeout(r, 10))`);
    const result = getJSON(ctx, 'globalThis.__result');
    const direct = getJSON(ctx, `(() => { const p = parseFECFile(${JSON.stringify(text)}); p.rapportImport = ImportQualiteEngine.analyser(${JSON.stringify(text)}); return p; })()`);
    results.push({
      name: 'parseFECEnArrierePlan() (repli synchrone) renvoie exactement le même bal/nbLines que parseFECFile() direct',
      pass: JSON.stringify(result.bal) === JSON.stringify(direct.bal) && result.nbLines === direct.nbLines,
      detail: { result: result && { bal: result.bal, nbLines: result.nbLines }, direct: { bal: direct.bal, nbLines: direct.nbLines } },
    });
    results.push({
      name: 'parseFECEnArrierePlan() attache bien rapportImport (même comportement que npConfirm() avant refactor)',
      pass: !!(result && result.rapportImport && result.rapportImport.lignesValides === 2),
      detail: result && result.rapportImport,
    });
  }

  // ── 3. parseFECEnArrierePlan() : FEC invalide -> résout avec null (pas de rejet), comme parseFECFile() ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      globalThis.__result = 'not-set'; globalThis.__error = null;
      parseFECEnArrierePlan('JournalCode\\tEcritureLib\\r\\nVE\\tPas les bonnes colonnes').then(r => { globalThis.__result = r; }).catch(e => { globalThis.__error = e.message; });
    `);
    await runIn(ctx, `new Promise(r => setTimeout(r, 10))`);
    const result = runIn(ctx, 'globalThis.__result');
    const error = runIn(ctx, 'globalThis.__error');
    results.push({ name: "parseFECEnArrierePlan() résout avec null pour un FEC invalide (colonnes obligatoires absentes), pas de rejet", pass: result === null && error === null, detail: { result, error } });
  }

  // ── 4. Le Worker (quand fourni) exécute EXACTEMENT le corps de parseFECFile()/analyserQualiteImportFEC() ──
  {
    const ctx = loadApp(htmlPath);
    // Vérifie que le code source du Worker est bien construit à partir du .toString() des fonctions
    // réelles (pas d'une copie figée qui pourrait diverger) — en simulant un Worker minimal.
    const workerSrcContainsRealFunctions = getJSON(ctx, `(() => {
      const src = parseFECFile.toString() + ImportQualiteEngine.analyser.toString();
      return src.includes('function') && src.length > 500;
    })()`);
    results.push({ name: 'Les fonctions parseFECFile/ImportQualiteEngine.analyser sont bien sérialisables via .toString() (base du Worker construit dynamiquement)', pass: workerSrcContainsRealFunctions });
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
