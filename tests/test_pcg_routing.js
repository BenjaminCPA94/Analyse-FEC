'use strict';
/**
 * Table de vérité PCG — cf. brief Phase 3, point 4, et AUDIT.md §(g).
 * Vérifie que chaque famille de comptes est routée vers le bon côté
 * (actif/passif) et, quand c'est pertinent, vers le bon poste.
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function whereIs(ctx, key, n) {
  const groups = getJSON(ctx, `ACTIVE.mps.${key}`);
  let where = null;
  groups.forEach(g => {
    if ((g.accounts || []).includes(n)) where = { gid: g.id, side: g.side };
    (g.subs || []).forEach(s => {
      if ((s.accounts || []).includes(n)) where = { gid: g.id, subId: s.id, side: g.side };
    });
  });
  return where;
}

// [compte, solde, côté attendu ('actif'|'passif'|null si CR|'cr'), description]
const CASES = [
  ['4456400001', 100, 'actif', 'TVA déductible (4456x) → actif'],
  ['4457400001', -100, 'passif', 'TVA collectée (4457x) → passif'],
  ['4421', -500, 'passif', 'IS retenu à la source (4421) → passif'],
  ['441', 300, 'actif', '441 débiteur → actif'],
  ['44583', 200, 'actif', 'Remboursement TVA demandé (44583) → actif quel que soit le solde'],
  ['4860001', 150, 'actif', 'Charges constatées d’avance (486) → actif'],
  ['4870001', -150, 'passif', 'Produits constatés d’avance (487) → passif'],
  ['4190001', -400, 'passif', 'Avances et acomptes reçus clients (419) → passif'],
  ['4090001', 400, 'actif', 'Avances et acomptes versés fournisseurs (409) → actif'],
  ['5190001', -900, 'passif', 'Concours bancaires courants (519) → passif'],
  ['2805', -100, 'actif', 'Amortissements (28x) → actif (en diminution)'],
  ['2905', -100, 'actif', 'Dépréciations (29x) → actif (en diminution)'],
  ['3905', -100, 'actif', 'Dépréciations de stocks (39x) → actif (en diminution)'],
  ['4915', -100, 'actif', 'Dépréciations créances clients (49x/491x) → actif (en diminution)'],
  ['5905', -100, 'actif', 'Dépréciations VMP (59x) → actif (en diminution)'],
];

const CR_CASES = [
  ['6490001', 500, 'g_fp', '649 → charges de personnel (g_fp)'],
  ['7090001', 500, 'g_prod', '709 (RRR sur ventes) → production (g_prod)'],
  ['6990001', -300, 'g_is', '699 (CIR/CII) → IS et participation (g_is)'],
];

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const bal = {};
  CASES.forEach(([n, v]) => { bal[n] = v; });
  CR_CASES.forEach(([n, v]) => { bal[n] = v; });
  bal['5890001'] = 1000; // virement interne 58x — ne doit pas être affecté

  runIn(ctx, `
    ACTIVE.id = 't-pcg';
    ACTIVE.bal = ${JSON.stringify(bal)};
    ACTIVE.libs = {};
    ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
    autoAffectOrphans();
  `);

  const results = [];
  for (const [n, v, side, desc] of CASES) {
    const where = whereIs(ctx, 'bilan', n);
    results.push({
      name: `${n} (solde ${v}) — ${desc}`,
      pass: !!where && where.side === side,
      detail: where,
    });
  }
  for (const [n, v, gid, desc] of CR_CASES) {
    const where = whereIs(ctx, 'cr', n);
    results.push({
      name: `${n} (solde ${v}) — ${desc}`,
      pass: !!where && where.gid === gid,
      detail: where,
    });
  }

  // Comptes mixtes 444/4458 : actif si débiteur, passif si créditeur (cf. correctif §(g))
  {
    const balMixte = { '444': 400 };
    runIn(ctx, `
      ACTIVE.bal = ${JSON.stringify(balMixte)};
      ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
      autoAffectOrphans();
    `);
    const where = whereIs(ctx, 'bilan', '444');
    results.push({ name: '444 débiteur (400) → actif (mixte)', pass: !!where && where.side === 'actif', detail: where });
  }
  {
    const balMixte = { '444': -400 };
    runIn(ctx, `
      ACTIVE.bal = ${JSON.stringify(balMixte)};
      ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
      autoAffectOrphans();
    `);
    const where = whereIs(ctx, 'bilan', '444');
    results.push({ name: '444 créditeur (-400) → passif (mixte)', pass: !!where && where.side === 'passif', detail: where });
  }
  {
    const balMixte = { '4458': 400 };
    runIn(ctx, `
      ACTIVE.bal = ${JSON.stringify(balMixte)};
      ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
      autoAffectOrphans();
    `);
    const where = whereIs(ctx, 'bilan', '4458');
    results.push({ name: '4458 débiteur (400) → actif (mixte)', pass: !!where && where.side === 'actif', detail: where });
  }
  {
    const balMixte = { '4458': -400 };
    runIn(ctx, `
      ACTIVE.bal = ${JSON.stringify(balMixte)};
      ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
      autoAffectOrphans();
    `);
    const where = whereIs(ctx, 'bilan', '4458');
    results.push({ name: '4458 créditeur (-400) → passif (mixte)', pass: !!where && where.side === 'passif', detail: where });
  }
  {
    // 58x (virements internes) : ne doit jamais être affecté au bilan
    const balVir = { '5890001': 1000 };
    runIn(ctx, `
      ACTIVE.bal = ${JSON.stringify(balVir)};
      ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
      autoAffectOrphans();
    `);
    const where = whereIs(ctx, 'bilan', '5890001');
    results.push({ name: '58x (virement interne) → non affecté au bilan', pass: where === null, detail: where });
  }

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
