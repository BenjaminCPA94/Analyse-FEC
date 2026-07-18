'use strict';
/**
 * Tests du dossier "Consolidé" (agrégation simple de plusieurs dossiers
 * Reporting existants du même groupe) — cf. CHANGELOG.md.
 *
 * Décisions produit actées (AskUserQuestion) :
 *  - Agrégation simple : somme des comptes, réutilisation intégrale du
 *    moteur de rendu CR/SIG/Bilan/Trésorerie existant. Pas d'élimination
 *    intragroupe, pas d'intérêts minoritaires.
 *  - Rattachement : on choisit parmi les dossiers Reporting déjà existants
 *    du même groupe (jamais de création de reporting "dans" le consolidé).
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const results = [];

  // ── 1. computeConsolidatedData() : somme des comptes / mois / libellés ──
  {
    runIn(ctx, `
      const store2 = {};
      store2['r1'] = { id:'r1', name:'Medikare NOGENT', group:'expand-cpa', type:'reporting',
        bal:{'411':1000,'707':-5000,'607':2000}, libs:{'411':'Clients','707':'Ventes'},
        months:{'202501':{ca:5000,ch:2000}}, nbLines:10, periodStart:'202501', periodEnd:'202512',
      };
      store2['r2'] = { id:'r2', name:'Medikare JAVEL', group:'expand-cpa', type:'reporting',
        bal:{'411':2000,'707':-8000,'607':3000}, libs:{'411':'Clients (dup)'},
        months:{'202501':{ca:8000,ch:3000}}, nbLines:12, periodStart:'202501', periodEnd:'202512',
      };
      store2['r3'] = { id:'r3', name:'CBJ & Co', group:'expand-cpa', type:'reporting',
        bal:{'411':500,'607':1000}, libs:{},
        months:{'202502':{ca:1500,ch:1000}}, nbLines:5, periodStart:'202502', periodEnd:'202512',
      };
      localStorage.setItem(STORE_KEY, JSON.stringify(store2));
    `);
    const agg = getJSON(ctx, `computeConsolidatedData(['r1','r2','r3'])`);
    results.push({
      name: 'computeConsolidatedData() additionne le solde du compte 411 sur les 3 dossiers (1000+2000+500=3500)',
      pass: agg.bal['411'] === 3500,
      detail: agg.bal,
    });
    results.push({
      name: 'computeConsolidatedData() additionne le solde du compte 707 (seulement 2 dossiers le portent) : -5000-8000=-13000',
      pass: agg.bal['707'] === -13000,
      detail: agg.bal,
    });
    results.push({
      name: 'computeConsolidatedData() additionne le compte 607 sur les 3 dossiers : 2000+3000+1000=6000',
      pass: agg.bal['607'] === 6000,
      detail: agg.bal,
    });
    results.push({
      name: 'computeConsolidatedData() additionne les valeurs mensuelles (ca de janvier = 5000+8000=13000)',
      pass: agg.months['202501'].ca === 13000,
      detail: agg.months,
    });
    results.push({
      name: 'computeConsolidatedData() conserve le premier libellé rencontré pour un compte (pas d’écrasement)',
      pass: agg.libs['411'] === 'Clients',
      detail: agg.libs,
    });
    results.push({
      name: 'computeConsolidatedData() calcule la période globale (min periodStart, max periodEnd)',
      pass: agg.periodStart === '202501' && agg.periodEnd === '202512',
      detail: { periodStart: agg.periodStart, periodEnd: agg.periodEnd },
    });
    results.push({
      name: 'computeConsolidatedData() additionne nbLines (10+12+5=27)',
      pass: agg.nbLines === 27,
      detail: agg.nbLines,
    });
    results.push({ name: 'computeConsolidatedData() ne signale aucun dossier manquant quand tous existent', pass: agg.missing.length === 0 });

    const aggMissing = getJSON(ctx, `computeConsolidatedData(['r1','r-does-not-exist'])`);
    results.push({
      name: 'computeConsolidatedData() signale les dossiers membres introuvables sans planter',
      pass: aggMissing.missing.length === 1 && aggMissing.missing[0] === 'r-does-not-exist' && aggMissing.bal['411'] === 1000,
      detail: aggMissing,
    });
  }

  // ── 2. openDossier() sur un dossier de type 'consolide' ─────────────────
  {
    const ctx2 = loadApp(htmlPath);
    runIn(ctx2, `
      // openDossier() bascule l'affichage home-screen/dashboard-screen — on
      // enregistre les 2 éléments attendus pour éviter un crash DOM, sans
      // avoir besoin de tout le reste de l'UI (non pertinent ici : seule la
      // partie synchrone qui peuple ACTIVE nous intéresse).
      document._elements.set('home-screen', document.createElement('div'));
      document._elements.set('dashboard-screen', document.createElement('div'));
      const store = {};
      store['a'] = { id:'a', name:'Filiale A', group:'g1', type:'reporting', bal:{'707':-10000,'607':4000}, libs:{}, months:{}, nbLines:1, periodStart:'202501', periodEnd:'202512' };
      store['b'] = { id:'b', name:'Filiale B', group:'g1', type:'reporting', bal:{'707':-6000,'607':2000}, libs:{}, months:{}, nbLines:1, periodStart:'202501', periodEnd:'202512' };
      store['c'] = { id:'c', name:'Groupe Consolidé', group:'g1', type:'consolide', memberIds:['a','b'], mps:null, mps_version:0, savedAt:1 };
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
      openDossier('c');
    `);
    const activeBal = getJSON(ctx2, 'ACTIVE.bal');
    results.push({
      name: "openDossier() sur un dossier consolidé calcule bal = somme des membres (707: -16000)",
      pass: activeBal['707'] === -16000 && activeBal['607'] === 6000,
      detail: activeBal,
    });
    const activeType = getJSON(ctx2, 'ACTIVE.type');
    results.push({ name: 'openDossier() marque ACTIVE.type = "consolide"', pass: activeType === 'consolide' });
    const hasMps = getJSON(ctx2, '!!(ACTIVE.mps && ACTIVE.mps.cr && ACTIVE.mps.bilan)');
    results.push({ name: 'openDossier() génère un mapping (mps) pour le dossier consolidé nouvellement ouvert', pass: hasMps });
    const nbEx = getJSON(ctx2, 'Object.keys(ACTIVE.exercices).length');
    results.push({ name: 'openDossier() construit un unique exercice synthétique pour le consolidé', pass: nbEx === 1, detail: nbEx });

    // La sauvegarde ne doit JAMAIS figer le bal agrégé : seul memberIds/mps/name persistent.
    runIn(ctx2, 'saveActiveDossier();');
    const savedRecord = getJSON(ctx2, `JSON.parse(localStorage.getItem(STORE_KEY))['c']`);
    results.push({
      name: "saveActiveDossier() sur un consolidé ne persiste PAS de bal figé (toujours recalculé à l'ouverture)",
      pass: savedRecord.bal === undefined && Array.isArray(savedRecord.memberIds) && savedRecord.memberIds.length === 2,
      detail: savedRecord,
    });
    results.push({ name: 'saveActiveDossier() conserve type="consolide" après sauvegarde', pass: savedRecord.type === 'consolide' });

    // Si un membre est modifié (rouvert), la ré-ouverture du consolidé doit refléter la nouvelle donnée (pas de cache figé).
    runIn(ctx2, `
      const store2 = JSON.parse(localStorage.getItem(STORE_KEY));
      store2['a'].bal['707'] = -99000;
      localStorage.setItem(STORE_KEY, JSON.stringify(store2));
      openDossier('c');
    `);
    const balAfterMemberEdit = getJSON(ctx2, 'ACTIVE.bal');
    results.push({
      name: "Modifier un dossier membre puis rouvrir le consolidé recalcule l'agrégation (jamais figée)",
      pass: balAfterMemberEdit['707'] === -99000 - 6000,
      detail: balAfterMemberEdit,
    });
  }

  // ── 3. Un dossier consolidé n'est jamais éligible comme membre d'un autre consolidé ──
  {
    const ctx3 = loadApp(htmlPath);
    runIn(ctx3, `
      const store = {};
      store['x'] = { id:'x', name:'X', group:'g2', type:'reporting', bal:{'411':100}, libs:{}, months:{}, periodStart:'202501', periodEnd:'202512' };
      store['y'] = { id:'y', name:'Consolidé Y', group:'g2', type:'consolide', memberIds:['x'], mps:null, mps_version:0 };
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    `);
    const agg = getJSON(ctx3, `computeConsolidatedData(['x','y'])`);
    results.push({
      name: "computeConsolidatedData() exclut un dossier consolidé listé par erreur comme membre d'un autre consolidé",
      pass: agg.missing.includes('y') && agg.bal['411'] === 100,
      detail: agg,
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
