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

/**
 * reportResults — accepte indifféremment un tableau de résultats
 * (17 suites historiques, toutes synchrones) ou une Promise s'y résolvant
 * (nouvelles suites asynchrones, ex. test_cloud_repository.js qui exerce
 * des repositories réseau simulés). `await` sur une valeur qui n'est pas
 * une Promise se résout immédiatement — aucun changement de comportement
 * pour les suites existantes.
 */
async function reportResults(suiteName, resultsOrPromise) {
  const results = await resultsOrPromise;
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

async function main() {
  // ── 1. Syntaxe ──────────────────────────────────────────────────────────
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

  section('2. E2E — mapping propre (FEC de test bien formé)');
  await reportResults('E2E propre', require('./test_e2e_clean.js').run(htmlPath));

  section('3. E2E — mapping volontairement pollué');
  await reportResults('E2E pollué', require('./test_e2e_polluted.js').run(htmlPath));

  section('4. Table de vérité PCG (routage des comptes)');
  await reportResults('PCG routing', require('./test_pcg_routing.js').run(htmlPath));

  section('5. Robustesse du parseur FEC');
  await reportResults('Parseur', require('./test_parser.js').run(htmlPath));

  section('5bis. Détection d\'encodage UTF-8 / Latin-1');
  await reportResults('Encodage', require('./test_encoding.js').run(htmlPath));

  section('6. SIG — sous-totaux connus à l\'euro près');
  await reportResults('SIG', require('./test_sig.js').run(htmlPath));

  section('7. Idempotence, invariants bilan, non-régression corruption mapping');
  await reportResults('Bilan / idempotence', require('./test_bilan_balance.js').run(htmlPath));

  section('8. Sécurité — XSS');
  await reportResults('XSS', require('./test_xss.js').run(htmlPath));

  section('9. Exports CSV / JSON (industrialisation)');
  await reportResults('Exports', require('./test_exports.js').run(htmlPath));

  section('10. Multi-exercices — migration, ajout, comparaison N/N-1');
  await reportResults('Multi-exercices', require('./test_multi_exercices.js').run(htmlPath));

  section('11. Grand livre — détail par compte');
  await reportResults('Grand livre', require('./test_grand_livre.js').run(htmlPath));

  section('12. Prévisionnel — moteur de calcul (PrevisionnelEngine)');
  await reportResults('Prévisionnel', require('./test_previsionnel_engine.js').run(htmlPath));

  section('13. TNS — cotisations sociales des indépendants (TnsEngine)');
  await reportResults('TNS', require('./test_tns.js').run(htmlPath));

  section('14. Rémunération dirigeant — moteur d\'optimisation (RemunerationEngine)');
  await reportResults('Rémunération dirigeant', require('./test_remuneration_engine.js').run(htmlPath));

  section('15. IRPP — moteur de calcul et recherche de cases (IrppEngine / IRPP_CASES)');
  await reportResults('IRPP', require('./test_irpp_engine.js').run(htmlPath));

  section('16. TNS — caisses professionnelles paramétrables (TNS_CAISSES_DEFAUT)');
  await reportResults('TNS caisses', require('./test_tns_caisses.js').run(htmlPath));

  section('17. Couche de stockage — repository générique (createLocalStorageRepository)');
  await reportResults('Storage repository', require('./test_storage_repository.js').run(htmlPath));

  section('18. Préparation cloud — schéma SQL Supabase (analyse statique, sans base réelle)');
  await reportResults('Schéma Supabase', require('./test_supabase_schema.js').run(htmlPath));

  section('19. Préparation cloud — CloudRepository / SupabaseClient (client Supabase simulé)');
  await reportResults('Cloud repository', require('./test_cloud_repository.js').run(htmlPath));

  section('20. Préparation cloud — service de migration localStorage → cloud');
  await reportResults('Migration service', require('./test_migration_service.js').run(htmlPath));

  section('21. Dossier Consolidé — agrégation simple de dossiers Reporting existants');
  await reportResults('Consolidé', require('./test_consolide.js').run(htmlPath));

  section('22. Dossier Consolidé — vue "Contributif en colonnes" (détail par société)');
  await reportResults('Consolidé contributif', require('./test_consolide_contributif.js').run(htmlPath));

  section('23. Suppression complète des données (audit sécurité — correctif critique)');
  await reportResults('Suppression données', require('./test_delete_all_data.js').run(htmlPath));

  section('24. Injection de formule CSV (audit sécurité — correctif critique)');
  await reportResults('Injection CSV', require('./test_csv_injection.js').run(htmlPath));

  section('25. Identifiants HTML dupliqués (audit — correctif critique)');
  await reportResults('IDs HTML', require('./test_html_ids.js').run(htmlPath));

  section('26. Fonctions JavaScript dupliquées (audit — correctif critique)');
  await reportResults('Fonctions dupliquées', await require('./test_duplicate_functions.js').run(htmlPath));

  section('27. Barèmes non validés + caisses TNS incomplètes (audit — correctif critique)');
  await reportResults('Barèmes non validés', require('./test_baremes_non_valides.js').run(htmlPath));

  section('28. Agrégation multi-sociétés — renommage "Consolidé" + bannière permanente (Phase 4)');
  await reportResults('Agrégation multi-sociétés', require('./test_agregation_rename.js').run(htmlPath));

  section('29. Rapport d\'import FEC structuré (Phase 2 de l\'audit)');
  await reportResults('Rapport d\'import FEC', require('./test_rapport_import_fec.js').run(htmlPath));

  section('30. Comptes mixtes multi-exercices (Phase 3 de l\'audit)');
  await reportResults('Comptes mixtes multi-exercices', require('./test_comptes_mixtes_multi_exercice.js').run(htmlPath));

  section('31. Parsing FEC déporté (Web Worker) — Phase 5 de l\'audit');
  await reportResults('Parsing FEC déporté', require('./test_fec_worker_parsing.js').run(htmlPath));

  section('32. Sauvegarde de secours IndexedDB — Phase 5 de l\'audit');
  await reportResults('Sauvegarde de secours IndexedDB', await require('./test_indexeddb_backup.js').run(htmlPath));

  // ── Bilan final ─────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════');
  console.log(`TOTAL : ${totalPass} succès, ${totalFail} échec(s)`);
  if (failedSuites.length > 0) {
    console.log('Suites en échec :', [...new Set(failedSuites)].join(', '));
    process.exit(1);
  }
  console.log('✓ Suite de tests intégralement verte.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Erreur inattendue dans la suite de tests :', e);
  process.exit(1);
});
