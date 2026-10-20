'use strict';
/**
 * Tests multi-exercices — cf. AUDIT.md §(p).
 * Vérifie : migration des dossiers mono-exercice existants, ajout d'un
 * exercice supplémentaire avec fusion du mapping partagé, bascule entre
 * exercices, et calcul de la comparaison N/N-1 (CR et Bilan).
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const results = [];

  // ── 1. Migration d'un dossier mono-exercice existant ──────────────────
  {
    const legacyDossier = {
      id: 'd-legacy', name: 'Test Legacy',
      bal: { '707': -1000, '411': 1000 }, libs: {}, months: {},
      nbLines: 2, periodStart: '202401', periodEnd: '202412',
      filename: 'old.txt', savedAt: 123456,
    };
    const migrated = getJSON(ctx, `ensureExercices(${JSON.stringify(legacyDossier)})`);
    const exIds = Object.keys(migrated.exercices);
    results.push({
      name: 'ensureExercices() migre un dossier mono-exercice en 1 exercice',
      pass: exIds.length === 1 && migrated.exercices[exIds[0]].bal['707'] === -1000,
      detail: migrated,
    });
    results.push({
      name: 'ensureExercices() est idempotent (ré-appliqué sur un dossier déjà migré)',
      pass: (() => {
        const again = getJSON(ctx, `ensureExercices(${JSON.stringify({ ...legacyDossier, ...migrated })})`);
        return Object.keys(again.exercices).length === 1 && again.activeExerciceId === migrated.activeExerciceId;
      })(),
    });
  }

  // ── 2. Ajout d'un exercice + fusion du mapping partagé ────────────────
  {
    runIn(ctx, `
      ACTIVE.id = 'd-multi';
      ACTIVE.name = 'Société Multi';
      ACTIVE.bal = { '411': 1000, '707': -1000 };
      ACTIVE.libs = {};
      ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
      ACTIVE.exercices = null;
      ACTIVE.activeExerciceId = null;
      autoAffectOrphans();
    `);
    const ex1Id = getJSON(ctx, `(() => {
      ACTIVE.exercices = { 'ex-2024': { id: 'ex-2024', label: '2024', bal: ACTIVE.bal, libs: ACTIVE.libs, months: {}, nbLines: 2, periodStart: '202401', periodEnd: '202412', filename: 'f2024.txt', importedAt: Date.now() } };
      ACTIVE.activeExerciceId = 'ex-2024';
      return 'ex-2024';
    })()`);

    // Nouvel exercice 2025 : mêmes comptes (411/707) + un nouveau compte (401, fournisseur)
    const parsed2025 = { bal: { '411': 1500, '707': -1500, '401': -500 }, libs: {}, months: {}, nbLines: 3, periodStart: '202501', periodEnd: '202512' };
    runIn(ctx, `addExerciceToActiveDossier(${JSON.stringify(parsed2025)}, 'f2025.txt')`);
    // autoAffectOrphans() tourne dans un setTimeout(600ms) — on l'invoque directement ici pour le test
    runIn(ctx, 'autoAffectOrphans();');

    const nbExercices = getJSON(ctx, 'Object.keys(ACTIVE.exercices).length');
    results.push({ name: 'addExerciceToActiveDossier() ajoute un 2e exercice au même dossier', pass: nbExercices === 2, detail: nbExercices });

    const activeExId = getJSON(ctx, 'ACTIVE.activeExerciceId');
    results.push({ name: "addExerciceToActiveDossier() bascule sur le nouvel exercice ajouté", pass: activeExId !== 'ex-2024', detail: activeExId });

    // Le compte 401 (nouveau en 2025) doit être affecté par le mapping partagé
    const mapped = getJSON(ctx, '[...getAllMappedAccountsBoth()]');
    results.push({
      name: 'Le nouveau compte 401 (2025) est affecté via le mapping partagé',
      pass: mapped.includes('401'),
      detail: mapped,
    });
    // Les comptes 411/707 déjà affectés pour 2024 restent affectés (pas de doublon détruit)
    results.push({
      name: 'Les comptes 411/707 déjà affectés pour 2024 restent affectés',
      pass: mapped.includes('411') && mapped.includes('707'),
      detail: mapped,
    });

    // ── 3. switchExercice() bascule correctement les données ────────────
    runIn(ctx, `switchExercice('ex-2024');`);
    const balAfterSwitch = getJSON(ctx, 'ACTIVE.bal');
    results.push({
      name: "switchExercice('ex-2024') recharge le bal de l'exercice 2024",
      pass: balAfterSwitch['411'] === 1000 && balAfterSwitch['707'] === -1000,
      detail: balAfterSwitch,
    });
    const mpsStillShared = getJSON(ctx, '!!ACTIVE.mps');
    results.push({ name: 'Le mapping (ACTIVE.mps) reste partagé après un changement d’exercice', pass: mpsStillShared });
  }

  // fmtV() utilise Intl.NumberFormat('fr-FR', ...), qui insere des espaces
  // insecables (U+202F/U+00A0) comme separateur de milliers -- on les
  // normalise en espace classique avant toute comparaison de sous-chaine.
  const norm = s => s.replace(/[\u00A0\u202F]/g, ' ');

  // -- 4. Comparaison N/N-1 sur le CR --
  {
    const ctx2 = loadApp(htmlPath);
    runIn(ctx2, `
      ACTIVE.id = 'd-cmp';
      ACTIVE.bal = { '707': 10000, '607': 4000 }; // N : marge commerciale = 10000-4000 = 6000
      ACTIVE.libs = {};
      ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
      autoAffectOrphans();
      ACTIVE.exercices = {
        'ex-N':   { id: 'ex-N',   label: '2025', bal: ACTIVE.bal, libs: {}, months: {}, periodStart: '202501', periodEnd: '202512' },
        'ex-N-1': { id: 'ex-N-1', label: '2024', bal: { '707': 8000, '607': 5000 }, libs: {}, months: {}, periodStart: '202401', periodEnd: '202412' }, // N-1 : marge commerciale = 8000-5000 = 3000
      };
      ACTIVE.activeExerciceId = 'ex-N';
      document._elements.set('tbCR', document.createElement('div'));
      document._elements.set('thead-cr', document.createElement('div'));
      _compareExIdCR = 'ex-N-1';
      buildCRTableCompare();
    `);
    const crHtml = norm(runIn(ctx2, "document._elements.get('tbCR').innerHTML"));
    results.push({
      name: 'buildCRTableCompare() calcule la marge commerciale N (6000) et N-1 (3000)',
      pass: crHtml.includes('6 000') && crHtml.includes('3 000') && crHtml.includes('+3 000'),
      detail: crHtml.slice(0, 400),
    });
  }

  // -- 5. Comparaison N/N-1 sur le Bilan --
  {
    const ctx3 = loadApp(htmlPath);
    runIn(ctx3, `
      ACTIVE.id = 'd-cmp-bilan';
      ACTIVE.bal = { '411': 2000, '401': -1000 }; // N
      ACTIVE.libs = {};
      ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
      autoAffectOrphans();
      ACTIVE.exercices = {
        'ex-N':   { id: 'ex-N',   label: '2025', bal: ACTIVE.bal, libs: {}, months: {} },
        'ex-N-1': { id: 'ex-N-1', label: '2024', bal: { '411': 1200, '401': -700 }, libs: {}, months: {} },
      };
      ACTIVE.activeExerciceId = 'ex-N';
      document._elements.set('tbActif', document.createElement('div'));
      document._elements.set('tbPassif', document.createElement('div'));
      document._elements.set('thead-actif', document.createElement('div'));
      document._elements.set('thead-passif', document.createElement('div'));
      _compareExIdBilan = 'ex-N-1';
      buildBilanTablesCompare();
    `);
    const actifHtml = norm(runIn(ctx3, "document._elements.get('tbActif').innerHTML"));
    const passifHtml = norm(runIn(ctx3, "document._elements.get('tbPassif').innerHTML"));
    results.push({
      name: 'buildBilanTablesCompare() calcule le poste Creances clients N (2000) et N-1 (1200)',
      pass: actifHtml.includes('2 000') && actifHtml.includes('1 200'),
      detail: actifHtml.slice(0, 900),
    });
    results.push({
      name: 'buildBilanTablesCompare() calcule le poste Fournisseurs N (1000) et N-1 (700) au passif',
      pass: passifHtml.includes('1 000') && passifHtml.includes('700'),
      detail: passifHtml.slice(0, 900),
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
