'use strict';
/**
 * Tests des exports (Phase 4 industrialisation) : CSV CR/Bilan et
 * sauvegarde/restauration JSON complète d'un dossier.
 */
const fs = require('fs');
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function setupDossier(ctx) {
  const fec = fs.readFileSync(path.join(__dirname, 'fixtures', 'mini_fec_complet.txt'), 'utf-8');
  ctx.__fec = fec;
  runIn(ctx, `
    const parsed = parseFECFile(__fec);
    ACTIVE.id = 'export-test';
    ACTIVE.name = 'Société Test';
    ACTIVE.bal = parsed.bal;
    ACTIVE.libs = parsed.libs;
    ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
    autoAffectOrphans();
  `);
}

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  setupDossier(ctx);
  const results = [];

  // CSV — Compte de Résultat
  const crRows = getJSON(ctx, 'buildCRCsvRows()');
  const crTotalRow = crRows.find(r => r[0] && r[0].includes('Résultat net'));
  results.push({
    name: 'buildCRCsvRows() contient une ligne d\'en-tête + le résultat net',
    pass: crRows[0][0] === 'Poste' && !!crTotalRow,
    detail: crTotalRow,
  });
  results.push({
    name: 'buildCRCsvRows() détaille chaque compte (707 présent)',
    pass: crRows.some(r => r[2] === '707' && r[4] === '10000.00'),
    detail: crRows.filter(r => r[2] === '707'),
  });

  // CSV — Bilan
  const bilanRows = getJSON(ctx, 'buildBilanCsvRows()');
  results.push({
    name: 'buildBilanCsvRows() sépare actif et passif',
    pass: bilanRows.some(r => r[0] === 'actif') && bilanRows.some(r => r[0] === 'passif'),
    detail: [...new Set(bilanRows.map(r => r[0]))],
  });

  // Échappement CSV (point-virgule / guillemets dans un libellé)
  runIn(ctx, `ACTIVE.libs['707'] = 'Ventes; "spéciales"';`);
  const csv = runIn(ctx, 'csvFromRows(buildCRCsvRows())');
  results.push({
    name: 'csvFromRows() échappe les libellés contenant ; ou "',
    pass: csv.includes('"Ventes; ""spéciales"""'),
    detail: csv.split('\r\n').find(l => l.includes('Ventes')),
  });

  // JSON — export / import round-trip
  runIn(ctx, 'saveActiveDossier();');
  const store = getJSON(ctx, 'loadStore()');
  const payload = JSON.stringify({ fecAnalyseExport: 1, exportedAt: 'test', dossier: store['export-test'] });
  ctx.__payload = payload;
  const newId = runIn(ctx, 'importDossierJSON(__payload)');
  results.push({ name: 'importDossierJSON() retourne un nouvel id', pass: !!newId && newId !== 'export-test', detail: newId });

  const store2 = getJSON(ctx, 'loadStore()');
  const imported = store2[newId];
  results.push({
    name: 'Le dossier importé conserve balance et libellés',
    pass: !!imported && Object.keys(imported.bal).length === Object.keys(store['export-test'].bal).length,
    detail: imported && Object.keys(imported.bal).length,
  });
  results.push({
    name: 'Le dossier importé force la régénération du mapping (mps_version=0)',
    pass: !!imported && imported.mps_version === 0,
    detail: imported && imported.mps_version,
  });

  // JSON invalide → message d'erreur, pas d'exception
  let threw = false;
  const badResult = runIn(ctx, `(function(){ try { return importDossierJSON('{ceci nest pas du json'); } catch(e) { return 'THREW'; } })()`);
  results.push({
    name: 'importDossierJSON() sur un fichier invalide ne plante pas et retourne null',
    pass: badResult === null,
    detail: badResult,
  });

  // Import groupé (lot) — ex. export Pennylane de plusieurs dossiers d'un coup
  {
    const batch = {
      fecAnalyseExportBatch: 1, exportedAt: 'test',
      dossiers: [
        { name: 'Client A', group: 'non-classes', bal: { '411': 1000, '707': -1000 }, libs: {}, months: {}, nbLines: 2, periodStart: '202601', periodEnd: '202609', filename: 'a.txt' },
        { name: 'Client B', group: 'non-classes', bal: { '401': -500, '607': 500 }, libs: {}, months: {}, nbLines: 2, periodStart: '202601', periodEnd: '202609', filename: 'b.txt' },
        { name: 'Client invalide (pas de bal)', group: 'non-classes' },
      ],
    };
    ctx.__batchPayload = JSON.stringify(batch);
    const created = getJSON(ctx, 'importDossiersJSONBatch(__batchPayload)');
    results.push({
      name: 'importDossiersJSONBatch() importe chaque dossier valide du lot et ignore les entrées invalides',
      pass: created.length === 2 && created[0].name === 'Client A' && created[1].name === 'Client B',
      detail: created,
    });
    const storeAfterBatch = getJSON(ctx, 'loadStore()');
    const idA = created[0] && created[0].id;
    results.push({
      name: 'Chaque dossier du lot reçoit un id distinct et force la régénération du mapping',
      pass: !!idA && !!storeAfterBatch[idA] && storeAfterBatch[idA].mps_version === 0
        && storeAfterBatch[idA].bal['411'] === 1000,
      detail: idA && storeAfterBatch[idA],
    });
    const emptyBatchResult = runIn(ctx, `importDossiersJSONBatch('{"fecAnalyseExportBatch":1,"dossiers":[]}')`);
    results.push({
      name: 'importDossiersJSONBatch() sur un lot vide ne plante pas et ne crée rien',
      pass: Array.isArray(emptyBatchResult) && emptyBatchResult.length === 0,
      detail: emptyBatchResult,
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
