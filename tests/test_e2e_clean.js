'use strict';
/**
 * Test E2E "mapping propre" — cf. brief Phase 3, point 2.
 * Parse un FEC de test en partie double équilibrée
 * (tests/fixtures/mini_fec_complet.txt) → génère le squelette →
 * autoAffectOrphans() → vérifie 0 orphelin, 0 doublon, écart bilan < 5€.
 */
const fs = require('fs');
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const fec = fs.readFileSync(path.join(__dirname, 'fixtures', 'mini_fec_complet.txt'), 'utf-8');
  ctx.__fec = fec;

  const results = [];

  // Le fixture doit lui-même être en partie double (Σdébit = Σcrédit)
  const lines = fec.trim().split('\n').slice(1);
  let totD = 0, totC = 0;
  lines.forEach(l => {
    const c = l.split('\t');
    totD += parseFloat((c[11] || '0').replace(',', '.')) || 0;
    totC += parseFloat((c[12] || '0').replace(',', '.')) || 0;
  });
  results.push({
    name: 'Fixture en partie double (Σdébit = Σcrédit)',
    pass: Math.abs(totD - totC) < 1e-9,
    detail: `débit=${totD} crédit=${totC}`,
  });

  runIn(ctx, `
    const parsed = parseFECFile(__fec);
    ACTIVE.id = 'e2e-clean';
    ACTIVE.bal = parsed.bal;
    ACTIVE.libs = parsed.libs;
    ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
    autoAffectOrphans();
  `);

  const balKeys = getJSON(ctx, 'Object.keys(ACTIVE.bal).length');
  const mapped = getJSON(ctx, '[...getAllMappedAccountsBoth()].length');
  results.push({
    name: '0 compte orphelin après autoAffectOrphans()',
    pass: mapped === balKeys,
    detail: `${mapped}/${balKeys}`,
  });

  const inCR = getJSON(ctx, '[...getAllMappedAccounts("cr").keys()]');
  const inBilan = getJSON(ctx, '[...getAllMappedAccounts("bilan").keys()]');
  const crossDupes = inCR.filter(n => inBilan.includes(n));
  results.push({ name: '0 doublon cross-table (CR ∩ Bilan = ∅)', pass: crossDupes.length === 0, detail: crossDupes });

  const bal = getJSON(ctx, 'ACTIVE.bal');
  let resultatCalcule = 0;
  Object.keys(bal).forEach(n => {
    const cl = n[0];
    if (cl === '7') resultatCalcule += bal[n];
    if (cl === '6') resultatCalcule -= bal[n];
  });
  const bilan = getJSON(ctx, 'ACTIVE.mps.bilan');
  let totalActif = 0, totalPassif = 0;
  bilan.forEach(g => {
    if (g.type !== 'normal') return;
    const sumG = (g.accounts || []).reduce((s, n) => s + bal[n], 0)
      + (g.subs || []).reduce((s, sub) => s + (sub.accounts || []).reduce((s2, n) => s2 + bal[n], 0), 0);
    if (g.side === 'actif') totalActif += sumG; else totalPassif += -sumG;
  });
  totalPassif += resultatCalcule;
  const ecart = Math.abs(totalActif - totalPassif);
  results.push({
    name: 'Écart Actif = Passif + Résultat net < 5€',
    pass: ecart < 5,
    detail: `Actif=${totalActif.toFixed(2)} Passif+RN=${totalPassif.toFixed(2)} écart=${ecart.toFixed(2)}`,
  });

  return results;
}

if (require.main === module) {
  const htmlPath = process.argv[2] || path.join(__dirname, '..', 'FEC_Analyse_v5_code_complet.html');
  const results = run(htmlPath);
  let failed = 0;
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} — ${r.name}${r.pass ? '' : ' :: ' + JSON.stringify(r.detail)}`);
    if (!r.pass) failed++;
  }
  process.exit(failed ? 1 : 0);
}

module.exports = { run };
