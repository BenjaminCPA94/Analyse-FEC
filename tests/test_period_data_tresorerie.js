'use strict';
/**
 * Phase 7 de l'audit demandé (extension des tests automatiques) : couverture
 * du moteur d'agrégation par période (getPeriodData(), utilisé par le
 * tableau de bord ET le module Trésorerie pour les graphiques de flux/
 * position de trésorerie) et des fonctions de formatage monétaire
 * (fmtV/fmtK/pct, bascule €/K€/M€) — aucune de ces fonctions, pourtant
 * au cœur de tous les chiffres affichés à l'utilisateur, n'avait de test
 * dédié avant cette passe.
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function run(htmlPath) {
  const results = [];

  // ── 1. getPeriodData() — agrégation mensuelle ───────────────────────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      ACTIVE = { months: {
        '202501': { ca: 1000, ch: 400, fin: 900, fout: 300 },
        '202502': { ca: 1200, ch: 500, fin: 1100, fout: 600 },
        '202503': { ca: 800,  ch: 300, fin: 700,  fout: 200 },
      }};
      PERIOD = 'monthly'; RANGE_N = 12;
    `);
    const pd = getJSON(ctx, 'getPeriodData()');
    results.push({ name: 'getPeriodData() (mensuel) renvoie 3 labels pour 3 mois de données', pass: pd.labels.length === 3, detail: pd.labels });
    results.push({ name: 'getPeriodData() (mensuel) reprend les libellés de mois français dans l\'ordre chronologique', pass: JSON.stringify(pd.labels) === JSON.stringify(['Jan', 'Fév', 'Mar']), detail: pd.labels });
    results.push({ name: 'getPeriodData() (mensuel) reprend le CA de chaque mois sans le déformer', pass: JSON.stringify(pd.ca) === JSON.stringify([1000, 1200, 800]), detail: pd.ca });
    results.push({
      name: 'getPeriodData() calcule la position de trésorerie cumulée (treso) = somme cumulée de (entrées - sorties)',
      pass: JSON.stringify(pd.treso) === JSON.stringify([600, 1100, 1600]), // 900-300=600 ; +(1100-600)=500→1100 ; +(700-200)=500→1600
      detail: pd.treso,
    });
  }

  // ── 2. getPeriodData() — agrégation trimestrielle (3 mois par trimestre) ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      ACTIVE = { months: {
        '202501': { ca: 100, ch: 0, fin: 0, fout: 0 },
        '202502': { ca: 200, ch: 0, fin: 0, fout: 0 },
        '202503': { ca: 300, ch: 0, fin: 0, fout: 0 },
        '202504': { ca: 400, ch: 0, fin: 0, fout: 0 },
      }};
      PERIOD = 'quarterly'; RANGE_N = 12;
    `);
    const pd = getJSON(ctx, 'getPeriodData()');
    results.push({
      name: 'getPeriodData() (trimestriel) additionne bien les 3 premiers mois dans T1 2025 (100+200+300=600)',
      pass: pd.ca[0] === 600,
      detail: pd,
    });
  }

  // ── 3. getPeriodData() — agrégation semestrielle (6 mois par semestre) ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      ACTIVE = { months: Object.fromEntries(Array.from({length:8},(_,i)=>['2025'+String(i+1).padStart(2,'0'),{ca:100,ch:0,fin:0,fout:0}])) };
      PERIOD = 'semestrial'; RANGE_N = 12;
    `);
    const pd = getJSON(ctx, 'getPeriodData()');
    results.push({
      name: 'getPeriodData() (semestriel) additionne 6 mois pour S1 2025 (6×100=600)',
      pass: pd.ca[0] === 600,
      detail: pd,
    });
  }

  // ── 4. getPeriodData() — agrégation annuelle ─────────────────────────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      ACTIVE = { months: {
        '202501': { ca: 500, ch: 0, fin: 0, fout: 0 },
        '202506': { ca: 700, ch: 0, fin: 0, fout: 0 },
        '202412': { ca: 300, ch: 0, fin: 0, fout: 0 },
      }};
      PERIOD = 'annual'; RANGE_N = 12;
    `);
    const pd = getJSON(ctx, 'getPeriodData()');
    results.push({ name: 'getPeriodData() (annuel) regroupe par année : 2024 et 2025 distincts', pass: pd.labels.length === 2 && pd.labels.includes('2024') && pd.labels.includes('2025'), detail: pd.labels });
    const idx2025 = getJSON(ctx, `getPeriodData().labels.indexOf('2025')`);
    results.push({ name: 'getPeriodData() (annuel) additionne bien les 2 mois de 2025 (500+700=1200)', pass: pd.ca[idx2025] === 1200, detail: pd.ca });
  }

  // ── 5. getPeriodData() — RANGE_N limite bien aux N dernières périodes ───
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      ACTIVE = { months: Object.fromEntries(Array.from({length:12},(_,i)=>['2025'+String(i+1).padStart(2,'0'),{ca:i+1,ch:0,fin:0,fout:0}])) };
      PERIOD = 'monthly'; RANGE_N = 3;
    `);
    const pd = getJSON(ctx, 'getPeriodData()');
    results.push({
      name: 'getPeriodData() (mensuel) avec RANGE_N=3 ne renvoie que les 3 derniers mois (Oct/Nov/Déc)',
      pass: JSON.stringify(pd.labels) === JSON.stringify(['Oct', 'Nov', 'Déc']) && JSON.stringify(pd.ca) === JSON.stringify([10, 11, 12]),
      detail: pd,
    });
  }

  // ── 6. getPeriodData() — dossier sans aucun mois : résultat vide, pas de crash ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `ACTIVE = { months: {} }; PERIOD = 'monthly'; RANGE_N = 12;`);
    const pd = getJSON(ctx, 'getPeriodData()');
    results.push({ name: "getPeriodData() sur un dossier sans mois renvoie des tableaux vides sans planter", pass: pd.labels.length === 0 && pd.treso.length === 0, detail: pd });
  }

  // ── 7. fmtV() — formatage devise (€ / K€ / M€), y compris valeurs négatives ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `CURRENCY = 'eur';`);
    const eurPos = runIn(ctx, 'fmtV(125000)');
    results.push({ name: "fmtV() en mode € formate un montant positif avec le symbole euro (Intl.NumberFormat fr-FR)", pass: eurPos.includes('€') && eurPos.includes('125'), detail: eurPos });

    runIn(ctx, `CURRENCY = 'keur';`);
    const keur = runIn(ctx, 'fmtV(125000)');
    results.push({ name: 'fmtV() en mode K€ convertit 125 000 € en "125 K€"', pass: keur.includes('125') && keur.includes('K€'), detail: keur });
    const keurNeg = runIn(ctx, 'fmtV(-125000)');
    results.push({ name: 'fmtV() en mode K€ conserve le signe négatif (moins − unicode)', pass: keurNeg.includes('−') && keurNeg.includes('125'), detail: keurNeg });

    runIn(ctx, `CURRENCY = 'meur';`);
    const meur = runIn(ctx, 'fmtV(2500000)');
    results.push({ name: 'fmtV() en mode M€ convertit 2 500 000 € en "2,50 M€"', pass: meur.includes('2,50') && meur.includes('M€'), detail: meur });
  }

  // ── 8. fmtK() — variante compacte utilisée dans les KPI ─────────────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `CURRENCY = 'eur';`);
    const small = runIn(ctx, 'fmtK(5000)');
    results.push({ name: 'fmtK() en mode € (petit montant < 10K) affiche la valeur brute en €', pass: small.includes('€') && !small.includes('K€'), detail: small });
    const big = runIn(ctx, 'fmtK(12000000)');
    results.push({ name: 'fmtK() bascule automatiquement en M€ pour un très gros montant (≥1e6), même en mode €', pass: big.includes('M€'), detail: big });

    runIn(ctx, `CURRENCY = 'meur';`);
    const meurExplicit = runIn(ctx, 'fmtK(2500000)');
    results.push({
      name: 'fmtK() en mode M€ explicite utilise la virgule décimale française, pas le point anglais (régression détectée par cette suite)',
      pass: meurExplicit.includes('2,5') && !meurExplicit.includes('2.5'),
      detail: meurExplicit,
    });
  }

  // ── 9. pct() — pourcentage avec protection division par zéro ────────────
  {
    const ctx = loadApp(htmlPath);
    const p = runIn(ctx, 'pct(25, 200)');
    results.push({ name: 'pct(25, 200) renvoie "12.5 %"', pass: p === '12.5 %', detail: p });
    const pZero = runIn(ctx, 'pct(25, 0)');
    results.push({ name: 'pct(x, 0) ne divise jamais par zéro — renvoie "—"', pass: pZero === '—', detail: pZero });
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
