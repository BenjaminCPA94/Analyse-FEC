#!/usr/bin/env node
'use strict';
/**
 * Suite de tests complète — FEC Analyse.
 * Usage : node tests/run_all.js [chemin/vers/FEC_Analyse.html]
 * Sort avec un code retour non nul si un test échoue.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { extractMainScript } = require('./harness.js');

const htmlPath = process.argv[2] || path.join(__dirname, '..', 'FEC_Analyse_v6.html');

let totalPass = 0;
let totalFail = 0;
const failedSuites = [];

function section(title) {
  console.log('\n═══ ' + title + ' ═══');
}

function reportResults(suiteName, results) {
  let pass = 0, fail = 0;
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'} — ${r.name}${r.pass ? '' : ' :: ' + JSON.stringify(r.detail)}`);
    if (r.pass) pass++; else fail++;
  }
  totalPass += pass;
  totalFail += fail;
  if (fail > 0) failedSuites.push(suiteName);
  console.log(`  → ${suiteName} : ${pass} succès, ${fail} échec(s)`);
}

// ── 1. Syntaxe ────────────────────────────────────────────────────────────
section('1. Syntaxe (node --check)');
{
  const tmpFile = path.join(require('os').tmpdir(), `fec_analyse_check_${Date.now()}.js`);
  try {
    const src = extractMainScript(htmlPath);
    fs.writeFileSync(tmpFile, src);
    execFileSync(process.execPath, ['--check', tmpFile], { stdio: 'pipe' });
    console.log('  PASS — script principal syntaxiquement valide');
    totalPass++;
  } catch (e) {
    console.log('  FAIL — erreur de syntaxe :', e.stderr ? e.stderr.toString() : e.message);
    totalFail++;
    failedSuites.push('Syntaxe');
  } finally {
    fs.existsSync(tmpFile) && fs.unlinkSync(tmpFile);
  }
}

// ── 2. E2E propre ─────────────────────────────────────────────────────────
section('2. E2E — mapping propre (FEC de test bien formé)');
reportResults('E2E propre', require('./test_e2e_clean.js').run(htmlPath));

// ── 3. E2E pollué ─────────────────────────────────────────────────────────
section('3. E2E — mapping volontairement pollué');
reportResults('E2E pollué', require('./test_e2e_polluted.js').run(htmlPath));

// ── 4. Table de vérité PCG ────────────────────────────────────────────────
section('4. Table de vérité PCG (routage des comptes)');
reportResults('PCG routing', require('./test_pcg_routing.js').run(htmlPath));

// ── 5. Robustesse du parseur ──────────────────────────────────────────────
section('5. Robustesse du parseur FEC');
reportResults('Parseur', require('./test_parser.js').run(htmlPath));

// ── 5bis. Détection d'encodage ────────────────────────────────────────────
section('5bis. Détection d\'encodage UTF-8 / Latin-1');
reportResults('Encodage', require('./test_encoding.js').run(htmlPath));

// ── 6. SIG (mini-FEC à la main) ───────────────────────────────────────────
section('6. SIG — sous-totaux connus à l\'euro près');
reportResults('SIG', require('./test_sig.js').run(htmlPath));

// ── 7. Idempotence + invariants bilan + XSS ──────────────────────────────
section('7. Idempotence, invariants bilan, non-régression corruption mapping');
reportResults('Bilan / idempotence', require('./test_bilan_balance.js').run(htmlPath));

section('8. Sécurité — XSS');
reportResults('XSS', require('./test_xss.js').run(htmlPath));

section('9. Exports CSV / JSON (industrialisation)');
reportResults('Exports', require('./test_exports.js').run(htmlPath));

section('10. Multi-exercices — migration, ajout, comparaison N/N-1');
reportResults('Multi-exercices', require('./test_multi_exercices.js').run(htmlPath));

section('11. Grand livre — détail par compte');
reportResults('Grand livre', require('./test_grand_livre.js').run(htmlPath));

section('12. Prévisionnel — moteur de calcul (PrevisionnelEngine)');
reportResults('Prévisionnel', require('./test_previsionnel_engine.js').run(htmlPath));

section('13. TNS — cotisations sociales des indépendants (TnsEngine)');
reportResults('TNS', require('./test_tns.js').run(htmlPath));

section('14. Rémunération dirigeant — moteur d\'optimisation (RemunerationEngine)');
reportResults('Rémunération dirigeant', require('./test_remuneration_engine.js').run(htmlPath));

// ── Bilan final ───────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════');
console.log(`TOTAL : ${totalPass} succès, ${totalFail} échec(s)`);
if (failedSuites.length > 0) {
  console.log('Suites en échec :', [...new Set(failedSuites)].join(', '));
  process.exit(1);
}
console.log('✓ Suite de tests intégralement verte.');
process.exit(0);
