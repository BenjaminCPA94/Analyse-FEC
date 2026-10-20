'use strict';
/**
 * Tests de la vue "Contributif en colonnes" (détail par société) d'un
 * dossier Consolidé — cf. CHANGELOG.md. Complète tests/test_consolide.js
 * (qui couvre l'agrégation elle-même) en vérifiant que buildCRTable(),
 * buildLegalCRTable() et buildBilanTables() délèguent correctement vers
 * leurs variantes *Contributif() quand _consolideView === 'contributif'
 * sur un dossier de type 'consolide', et que chaque colonne affiche bien
 * la contribution du bon dossier membre + une colonne Total cohérente
 * avec la somme (= vue "Total" historique, jamais modifiée).
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

// fmtV() utilise Intl.NumberFormat('fr-FR', ...), qui insère des espaces
// insécables (U+202F/U+00A0) comme séparateur de milliers.
const norm = s => s.replace(/[\u00A0\u202F]/g, ' ');

function setupConsolideActive(ctx) {
  runIn(ctx, `
    ACTIVE.id = 'c1';
    ACTIVE.name = 'Groupe STOIK';
    ACTIVE.type = 'consolide';
    ACTIVE.consolideMembers = [
      { id: 'r1', name: 'STOIK HOLDING', bal: { '707': -100000, '607': 40000, '411': 5000 } },
      { id: 'r2', name: 'STOIK CERT',    bal: { '707': -80000,  '607': 30000 } },
      { id: 'r3', name: 'STOIK FRANCE',  bal: { '707': -50000,  '607': 20000, '411': 2000 } },
    ];
    ACTIVE.bal = { '707': -230000, '607': 90000, '411': 7000 };
    ACTIVE.libs = {};
    ACTIVE.months = {};
    ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
    autoAffectOrphans();
    _consolideView = 'contributif';
    ['thead-cr','tbCR','thead-legalcr','tbLegalCR','thead-actif','tbActif','thead-passif','tbPassif','bilan-equilibre']
      .forEach(id => document._elements.set(id, document.createElement('div')));
  `);
}

function run(htmlPath) {
  const results = [];

  // ── 1. buildCRTable() délègue vers buildCRTableContributif() en mode contributif ──
  {
    const ctx = loadApp(htmlPath);
    setupConsolideActive(ctx);
    runIn(ctx, 'buildCRTable();');
    const theadHtml = norm(runIn(ctx, "document._elements.get('thead-cr').innerHTML"));
    const bodyHtml = norm(runIn(ctx, "document._elements.get('tbCR').innerHTML"));

    results.push({
      name: 'SIG (buildCRTable) : en-tête liste les 3 sociétés + Total',
      pass: ['STOIK HOLDING', 'STOIK CERT', 'STOIK FRANCE', 'Total'].every(s => theadHtml.includes(s)),
      detail: theadHtml,
    });
    results.push({
      name: 'SIG : la colonne de chaque société affiche son propre montant de vente (707)',
      pass: bodyHtml.includes('100 000') && bodyHtml.includes('80 000') && bodyHtml.includes('50 000'),
      detail: bodyHtml.slice(0, 600),
    });
    results.push({
      name: 'SIG : la colonne Total affiche la somme (230 000)',
      pass: bodyHtml.includes('230 000'),
      detail: bodyHtml.slice(0, 600),
    });
    results.push({
      name: 'SIG : les comptes restent cliquables (dcs-acct → openGrandLivre) au niveau le plus fin',
      pass: /onclick="event.stopPropagation\(\);openGrandLivre\('707'\)"/.test(bodyHtml) || /openGrandLivre\('707'\)/.test(bodyHtml),
      detail: bodyHtml.includes('707'),
    });
  }

  // ── 2. Vue "total" par défaut reste inchangée (non-régression) ─────────
  {
    const ctx = loadApp(htmlPath);
    setupConsolideActive(ctx);
    runIn(ctx, `_consolideView = 'total'; buildCRTable();`);
    const theadHtml = norm(runIn(ctx, "document._elements.get('thead-cr').innerHTML"));
    results.push({
      name: 'SIG : en mode "total", l\'en-tête reste "Poste / Montant / % CA" (comportement historique)',
      pass: theadHtml.includes('Poste') && theadHtml.includes('Montant') && !theadHtml.includes('STOIK'),
      detail: theadHtml,
    });
  }

  // ── 3. buildLegalCRTable() délègue vers sa variante Contributif ────────
  {
    const ctx = loadApp(htmlPath);
    setupConsolideActive(ctx);
    runIn(ctx, 'buildLegalCRTable();');
    const theadHtml = norm(runIn(ctx, "document._elements.get('thead-legalcr').innerHTML"));
    const bodyHtml = norm(runIn(ctx, "document._elements.get('tbLegalCR').innerHTML"));
    results.push({
      name: 'Compte de résultat légal : en-tête liste les 3 sociétés + Total',
      pass: ['STOIK HOLDING', 'STOIK CERT', 'STOIK FRANCE', 'Total'].every(s => theadHtml.includes(s)),
      detail: theadHtml,
    });
    results.push({
      name: 'Compte de résultat légal : le detail par compte (707) apparaît avec les 3 valeurs par société',
      pass: bodyHtml.includes('100 000') && bodyHtml.includes('80 000') && bodyHtml.includes('50 000'),
      detail: bodyHtml.slice(0, 800),
    });
  }

  // ── 4. buildBilanTables() délègue vers sa variante Contributif ─────────
  {
    const ctx = loadApp(htmlPath);
    setupConsolideActive(ctx);
    runIn(ctx, 'buildBilanTables();');
    const theadA = norm(runIn(ctx, "document._elements.get('thead-actif').innerHTML"));
    const bodyA = norm(runIn(ctx, "document._elements.get('tbActif').innerHTML"));
    results.push({
      name: 'Bilan (Actif) : en-tête liste les 3 sociétés + Total',
      pass: ['STOIK HOLDING', 'STOIK CERT', 'STOIK FRANCE', 'Total'].every(s => theadA.includes(s)),
      detail: theadA,
    });
    results.push({
      name: 'Bilan (Actif) : le compte 411 (Créances clients) détaille STOIK HOLDING (5000) et STOIK FRANCE (2000)',
      pass: bodyA.includes('5 000') && bodyA.includes('2 000') && bodyA.includes('7 000'),
      detail: bodyA.slice(0, 900),
    });
    const equilibre = runIn(ctx, "document._elements.get('bilan-equilibre').innerHTML");
    results.push({
      name: "Bilan : l'indicateur d'équilibre reste calculé (non vide) en mode contributif",
      pass: typeof equilibre === 'string' && equilibre.length > 0,
      detail: equilibre,
    });
  }

  // ── 5. Un dossier Reporting (non consolidé) ignore _consolideView ──────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      ACTIVE.id = 'r-solo';
      ACTIVE.type = undefined;
      ACTIVE.consolideMembers = undefined;
      ACTIVE.bal = { '707': -1000, '607': 400 };
      ACTIVE.libs = {}; ACTIVE.months = {};
      ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
      autoAffectOrphans();
      _consolideView = 'contributif'; // ne doit avoir aucun effet hors dossier Consolidé
      ['thead-cr','tbCR'].forEach(id => document._elements.set(id, document.createElement('div')));
      buildCRTable();
    `);
    const theadHtml = runIn(ctx, "document._elements.get('thead-cr').innerHTML");
    results.push({
      name: 'Un dossier Reporting (type != "consolide") reste sur la vue "total" même si _consolideView="contributif"',
      pass: theadHtml.includes('Poste') && theadHtml.includes('% CA'),
      detail: theadHtml,
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
