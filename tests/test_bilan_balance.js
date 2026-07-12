'use strict';
/**
 * Test de non-régression — corruption du mapping par buildBilanTables().
 * cf. AUDIT.md §(h).
 *
 * Avant correctif : le bloc "CORRECTION 2" de buildBilanTables() écrasait
 * les comptes des sous-groupes bp6_b/bp6_c à chaque rendu, faisant
 * disparaître des comptes (4421, 44191, 44586, 44571009 sur le FEC de
 * référence) et dupliquant des comptes entre bp6_b et bp6_c.
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  runIn(ctx, `
    ACTIVE.id='t1';
    ACTIVE.bal = DEFAULT_BAL;
    ACTIVE.libs = {};
    ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
    autoAffectOrphans();
  `);

  const results = [];

  const totalMapped = getJSON(ctx, '[...getAllMappedAccountsBoth()].length');
  const balKeys = getJSON(ctx, 'Object.keys(ACTIVE.bal).length');
  results.push({
    name: '0 compte orphelin après autoAffectOrphans() sur le FEC de référence',
    pass: totalMapped === balKeys,
    detail: `${totalMapped}/${balKeys} comptes affectés`,
  });

  const bilan = getJSON(ctx, 'ACTIVE.mps.bilan');
  const bp6 = bilan.find(g => g.id === 'bp6');
  const bp6b = bp6.subs.find(s => s.id === 'bp6_b').accounts;
  const bp6c = bp6.subs.find(s => s.id === 'bp6_c').accounts;
  const overlap = bp6b.filter(n => bp6c.includes(n));
  results.push({
    name: 'Unicité stricte : aucun compte en double entre bp6_b et bp6_c',
    pass: overlap.length === 0,
    detail: overlap,
  });

  for (const n of ['4421', '44191', '44586', '44571009']) {
    const present = getJSON(ctx, '[...getAllMappedAccountsBoth()]').includes(n);
    results.push({ name: `Le compte ${n} n'est pas perdu`, pass: present, detail: present });
  }

  // Invariant Actif = Passif + Résultat net (tolérance 5€, cf. AUDIT.md §(i))
  const bal = getJSON(ctx, 'ACTIVE.bal');
  let resultatCalcule = 0;
  Object.keys(bal).forEach(n => {
    const cl = n[0];
    if (cl === '7') resultatCalcule += bal[n];
    if (cl === '6') resultatCalcule -= bal[n];
  });
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
    name: 'Actif = Passif + Résultat net (tolérance < 5€ arrondis FEC)',
    pass: ecart < 5,
    detail: `Actif=${totalActif.toFixed(2)} Passif+RN=${totalPassif.toFixed(2)} écart=${ecart.toFixed(2)}`,
  });

  // Idempotence : un second passage ne doit rien changer et ne déclenche aucun toast.
  const toasts = [];
  runIn(ctx, `(function(){ const _orig = toast; toast = (m)=>{ __toasts.push(m); }; })();`);
  ctx.__toasts = toasts;
  const mpsBefore = getJSON(ctx, 'ACTIVE.mps');
  runIn(ctx, 'autoAffectOrphans();');
  const mpsAfter = getJSON(ctx, 'ACTIVE.mps');
  results.push({
    name: 'Idempotence : mapping inchangé au second passage',
    pass: JSON.stringify(mpsBefore) === JSON.stringify(mpsAfter),
    detail: 'diff' in {} ? '' : undefined,
  });
  results.push({
    name: 'Idempotence : aucun toast au second passage',
    pass: toasts.length === 0,
    detail: toasts,
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
