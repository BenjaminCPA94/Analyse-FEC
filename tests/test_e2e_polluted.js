'use strict';
/**
 * Test E2E "mapping pollué" — cf. brief Phase 3, point 3.
 * Part d'un mapping propre puis le corrompt volontairement (doublons
 * cross-table, comptes déplacés au mauvais poste, orphelins créés en
 * retirant des comptes), puis vérifie qu'un seul passage de
 * autoAffectOrphans() rétablit : 0 doublon, 0 orphelin, équilibre.
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  runIn(ctx, `
    ACTIVE.id = 'e2e-pollue';
    ACTIVE.bal = DEFAULT_BAL;
    ACTIVE.libs = {};
    ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
    autoAffectOrphans();
  `);

  // ── Pollution volontaire du mapping ──────────────────────────────────
  runIn(ctx, `
    (function() {
      const bilan = ACTIVE.mps.bilan;
      const ba7 = bilan.find(g => g.id === 'ba7');
      const bp6 = bilan.find(g => g.id === 'bp6');
      const sub1 = ba7.subs[0];
      const sub2 = bp6.subs[0];

      // 1. Doublon cross-table : dupliquer un compte de bp6 aussi dans ba7
      if (sub2.accounts.length > 0) {
        const dup = sub2.accounts[0];
        if (!sub1.accounts.includes(dup)) sub1.accounts.push(dup);
      }

      // 2. Compte déplacé au mauvais poste : prendre un compte de bp6 et le
      //    mettre dans un groupe sans rapport (ba8 = trésorerie)
      const ba8 = bilan.find(g => g.id === 'ba8');
      if (sub2.accounts.length > 1) {
        const moved = sub2.accounts.pop();
        ba8.subs[0].accounts.push(moved);
      }

      // 3. Orphelins : retirer purement et simplement des comptes du mapping
      const ba6 = bilan.find(g => g.id === 'ba6');
      ba6.subs[0].accounts = ba6.subs[0].accounts.slice(0, -2);

      const cr = ACTIVE.mps.cr;
      const gfp = cr.find(g => g.id === 'g_fp');
      if (gfp.subs[0].accounts.length > 0) gfp.subs[0].accounts.pop();
    })();
  `);

  const beforeMapped = getJSON(ctx, '[...getAllMappedAccountsBoth()].length');
  const balKeys = getJSON(ctx, 'Object.keys(ACTIVE.bal).length');

  // Un seul passage de correction
  runIn(ctx, 'autoAffectOrphans();');
  runIn(ctx, 'fixAllDuplicates();');

  const results = [];
  results.push({
    name: 'La pollution volontaire a bien créé des orphelins (précondition du test)',
    pass: beforeMapped < balKeys,
    detail: `${beforeMapped}/${balKeys} avant correction`,
  });

  const afterMapped = getJSON(ctx, '[...getAllMappedAccountsBoth()].length');
  results.push({
    name: '0 orphelin après un passage de autoAffectOrphans()+fixAllDuplicates()',
    pass: afterMapped === balKeys,
    detail: `${afterMapped}/${balKeys}`,
  });

  // 0 doublon cross-table : chaque compte présent dans au plus 1 poste (cr XOR bilan, jamais les deux)
  const inCR = getJSON(ctx, '[...getAllMappedAccounts("cr").keys()]');
  const inBilan = getJSON(ctx, '[...getAllMappedAccounts("bilan").keys()]');
  const crossDupes = inCR.filter(n => inBilan.includes(n));
  results.push({
    name: '0 doublon cross-table (CR ∩ Bilan = ∅)',
    pass: crossDupes.length === 0,
    detail: crossDupes,
  });

  // 0 doublon intra-table (un compte affecté à un seul groupe/sous-groupe)
  function intraDupes(key) {
    const seen = new Set();
    const dupes = [];
    (getJSON(ctx, `ACTIVE.mps.${key}`)).forEach(g => {
      (g.accounts || []).forEach(n => { if (seen.has(n)) dupes.push(n); seen.add(n); });
      (g.subs || []).forEach(s => (s.accounts || []).forEach(n => { if (seen.has(n)) dupes.push(n); seen.add(n); }));
    });
    return dupes;
  }
  const dupesCR = intraDupes('cr');
  const dupesBilan = intraDupes('bilan');
  results.push({ name: '0 doublon intra-table CR', pass: dupesCR.length === 0, detail: dupesCR });
  results.push({ name: '0 doublon intra-table Bilan', pass: dupesBilan.length === 0, detail: dupesBilan });

  // Équilibre rétabli (< 5€)
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
    name: 'Équilibre Actif = Passif + Résultat net rétabli (< 5€)',
    pass: ecart < 5,
    detail: `écart = ${ecart.toFixed(2)}`,
  });

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
