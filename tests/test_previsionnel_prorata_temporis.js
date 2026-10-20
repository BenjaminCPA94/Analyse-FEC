'use strict';
/**
 * Phase 8 de l'audit demandé (améliorations fonctionnelles du module
 * Prévisionnel) : calculerPlanAmortissement() appliquait une dotation
 * pleine dès l'exercice d'acquisition, quel que soit le mois réel
 * d'acquisition (`inv.mois`, déjà saisi par l'utilisateur et déjà utilisé
 * pour le placement exact des flux de trésorerie, mais jusqu'ici ignoré
 * par le calcul d'amortissement comptable). Ce correctif introduit le
 * prorata temporis mensuel standard : la première annuité est
 * proportionnelle au nombre de mois restants dans l'exercice
 * d'acquisition, et la durée d'amortissement se prolonge d'un exercice
 * partiel supplémentaire en fin de plan — comme en comptabilité réelle.
 *
 * `inv.mois === 1` (valeur par défaut à la création, cf. pvAddInvestissement())
 * donne un prorata de 12/12 : comportement STRICTEMENT IDENTIQUE à
 * l'ancien calcul pour tous les investissements déjà saisis sans
 * modification du mois — vérifié explicitement ci-dessous (non-régression).
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function run(htmlPath) {
  const results = [];
  const ctx = loadApp(htmlPath);

  // ── 1. Non-régression : mois=1 (défaut) = comportement historique (12/12) ──
  {
    const r = getJSON(ctx, `PrevisionnelEngine.calculerPlanAmortissement({
      investissements: [{ annee: 2025, mois: 1, montantHT: 12000, dureeAns: 3 }],
      dotationAnnuelleParcExistant: 0, vncParcExistantOuverture: 0,
      horizonYears: 4, startYear: 2025,
    })`);
    results.push({
      name: 'mois=1 (janvier, défaut) : dotation pleine dès la 1ère année, identique à l\'ancien calcul (12000/3=4000/an)',
      pass: r.dotations[0] === 4000 && r.dotations[1] === 4000 && r.dotations[2] === 4000 && r.dotations[3] === 0,
      detail: r.dotations,
    });
    results.push({
      name: 'mois=1 : VNC fin d\'exercice décroît linéairement (8000 puis 4000 puis 0)',
      pass: r.vncFin[0] === 8000 && r.vncFin[1] === 4000 && r.vncFin[2] === 0,
      detail: r.vncFin,
    });
  }

  // ── 2. Acquisition en juillet (mois=7) : prorata 6/12 la 1ère année ─────
  {
    const r = getJSON(ctx, `PrevisionnelEngine.calculerPlanAmortissement({
      investissements: [{ annee: 2025, mois: 7, montantHT: 12000, dureeAns: 3 }],
      dotationAnnuelleParcExistant: 0, vncParcExistantOuverture: 0,
      horizonYears: 5, startYear: 2025,
    })`);
    // Dotation annuelle pleine = 4000. Juillet → 6 mois restants (juil.-déc.) → 2000 la 1ère année.
    // Total à amortir = 36 mois. Année 1 = 6 mois, années 2-3 = 24 mois (12+12), reste = 6 mois → année 4 = 6 mois (2000).
    results.push({
      name: 'mois=7 (juillet) : la dotation de la 1ère année est proratisée à 6/12 (2000 au lieu de 4000)',
      pass: Math.abs(r.dotations[0] - 2000) < 0.01,
      detail: r.dotations,
    });
    results.push({
      name: 'mois=7 : les années pleines suivantes (2026, 2027) reçoivent la dotation annuelle complète (4000)',
      pass: Math.abs(r.dotations[1] - 4000) < 0.01 && Math.abs(r.dotations[2] - 4000) < 0.01,
      detail: r.dotations,
    });
    results.push({
      name: 'mois=7 : le solde (6 mois restants) est amorti sur un exercice supplémentaire (2028), prolongeant le plan au-delà de dureeAns=3',
      pass: Math.abs(r.dotations[3] - 2000) < 0.01 && r.dotations[4] === 0,
      detail: r.dotations,
    });
    const totalDotations = r.dotations.reduce((s, d) => s + d, 0);
    results.push({ name: 'mois=7 : la somme des dotations sur toute la durée reconstitue exactement le montant HT (12000, conservation de la valeur)', pass: Math.abs(totalDotations - 12000) < 0.01, detail: totalDotations });
  }

  // ── 3. Acquisition en décembre (mois=12) : prorata minimal 1/12 ─────────
  {
    const r = getJSON(ctx, `PrevisionnelEngine.calculerPlanAmortissement({
      investissements: [{ annee: 2025, mois: 12, montantHT: 12000, dureeAns: 3 }],
      dotationAnnuelleParcExistant: 0, vncParcExistantOuverture: 0,
      horizonYears: 5, startYear: 2025,
    })`);
    // 1 mois la 1ère année (333.33), puis 12+12 mois pleins, puis 11 mois restants la dernière année.
    results.push({
      name: 'mois=12 (décembre) : dotation minimale la 1ère année (1/12 de 4000 ≈ 333,33)',
      pass: Math.abs(r.dotations[0] - (4000 / 12)) < 0.01,
      detail: r.dotations,
    });
    const totalDotations = r.dotations.reduce((s, d) => s + d, 0);
    results.push({ name: 'mois=12 : conservation de la valeur totale (somme des dotations = 12000)', pass: Math.abs(totalDotations - 12000) < 0.01, detail: totalDotations });
  }

  // ── 4. inv.mois absent (ancien enregistrement Prévisionnel sans ce champ) ──
  {
    const r = getJSON(ctx, `PrevisionnelEngine.calculerPlanAmortissement({
      investissements: [{ annee: 2025, montantHT: 6000, dureeAns: 2 }],
      dotationAnnuelleParcExistant: 0, vncParcExistantOuverture: 0,
      horizonYears: 3, startYear: 2025,
    })`);
    results.push({
      name: "inv.mois absent (dossiers Prévisionnel créés avant cette fonctionnalité) : traité comme janvier, comportement historique préservé",
      pass: r.dotations[0] === 3000 && r.dotations[1] === 3000 && r.dotations[2] === 0,
      detail: r.dotations,
    });
  }

  // ── 5. Le parc d'immobilisations existant (sans date d'acquisition) n'est pas affecté ──
  {
    const r = getJSON(ctx, `PrevisionnelEngine.calculerPlanAmortissement({
      investissements: [],
      dotationAnnuelleParcExistant: 1000, vncParcExistantOuverture: 2500,
      horizonYears: 4, startYear: 2025,
    })`);
    results.push({
      name: "Le parc existant (dotationAnnuelleParcExistant/vncParcExistantOuverture) reste amorti à un rythme annuel constant, sans prorata (pas de mois d'acquisition connu)",
      pass: r.dotations[0] === 1000 && r.dotations[1] === 1000 && r.dotations[2] === 500 && r.dotations[3] === 0,
      detail: r.dotations,
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
