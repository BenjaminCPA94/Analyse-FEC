'use strict';
/**
 * Tests du moteur de calcul du prévisionnel financier (PrevisionnelEngine).
 * Fonctions pures, testées indépendamment de tout dossier réel — cf.
 * FEC_Analyse_v6.html, section "MODULE PRÉVISIONNEL — MOTEUR".
 *
 * Couvre : cas feuille vierge (tout à zéro, aucun NaN/Infinity), cas
 * réaliste complet (CA, marge, investissement, emprunt, apport, BFR) avec
 * vérification de l'équilibre actif=passif sur chaque exercice, cohérence
 * exacte entre le Plan de trésorerie mensuel et le Plan de financement
 * annuel, 3 types d'échéancier d'emprunt (annuités constantes, capital
 * constant, in fine), et détection d'un bilan d'ouverture déséquilibré.
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function fixtureRealiste() {
  return {
    horizonYears: 3, startYear: 2026,
    hypotheses: {
      global: { tauxTVA: 0.20, delaiClientJours: 45, delaiFournisseurJours: 30, delaiTVAJours: 30, delaiChargesSocialesJours: 30, delaiISJours: 90, tauxIS: 0.25 },
      basePeriode: { ca: 500000, chargesExternes: 80000, masseSalariale: 150000, impotsTaxes: 4000, dotationAnnuelleParcExistant: 8000 },
      parExercice: [
        { annee: 2026, croissanceCA: 0.10, tauxMargeSurCA: 0.60, croissanceChargesExternes: 0.03, croissanceMasseSalariale: 0.05, tauxChargesPatronales: 0.42, croissanceImpotsTaxes: 0.02, tauxStockSurCA: 0.02 },
        { annee: 2027, croissanceCA: 0.12, tauxMargeSurCA: 0.61, croissanceChargesExternes: 0.02, croissanceMasseSalariale: 0.04, tauxChargesPatronales: 0.42, croissanceImpotsTaxes: 0.02, tauxStockSurCA: 0.02 },
        { annee: 2028, croissanceCA: 0.08, tauxMargeSurCA: 0.62, croissanceChargesExternes: 0.02, croissanceMasseSalariale: 0.03, tauxChargesPatronales: 0.42, croissanceImpotsTaxes: 0.02, tauxStockSurCA: 0.02 },
      ],
    },
    ouverture: {
      immobilisationsBrutes: 60000, amortissementsCumules: 20000, stocks: 5000, creancesClients: 40000,
      autresCreances: 0, tresorerie: 30000, capitauxPropres: 70000, provisions: 0,
      dettesFinancieres: 20000, dettesFournisseurs: 25000, autresDettes: 0, dotationAnnuelleParcExistant: 8000,
    },
    investissements: [
      { id: 'i1', libelle: 'Matériel', annee: 2026, mois: 3, montantHT: 24000, dureeAns: 4 },
      { id: 'i2', libelle: 'Véhicule', annee: 2027, mois: 6, montantHT: 18000, dureeAns: 5 },
    ],
    emprunts: [
      { id: 'e1', libelle: 'Emprunt matériel', montant: 24000, tauxAnnuel: 0.04, dureeAns: 4, annee: 2026, mois: 3, differeMois: 0, typeAmortissement: 'annuite' },
    ],
    apports: [
      { id: 'a1', libelle: 'Apport associé', montant: 10000, annee: 2026, mois: 1, type: 'capital' },
    ],
  };
}

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const results = [];

  // ── 1. Feuille vierge intégrale ────────────────────────────────────────
  {
    const record = {
      horizonYears: 3, startYear: 2026,
      hypotheses: {
        global: { tauxTVA: 0.20, delaiClientJours: 0, delaiFournisseurJours: 0, delaiTVAJours: 0, delaiChargesSocialesJours: 0, delaiISJours: 0, tauxIS: 0.25 },
        basePeriode: { ca: 0, chargesExternes: 0, masseSalariale: 0, impotsTaxes: 0, dotationAnnuelleParcExistant: 0 },
        parExercice: [2026, 2027, 2028].map(annee => ({ annee, croissanceCA: 0, tauxMargeSurCA: 0, croissanceChargesExternes: 0, croissanceMasseSalariale: 0, tauxChargesPatronales: 0, croissanceImpotsTaxes: 0, tauxStockSurCA: 0 })),
      },
      ouverture: { immobilisationsBrutes: 0, amortissementsCumules: 0, stocks: 0, creancesClients: 0, autresCreances: 0, tresorerie: 0, capitauxPropres: 0, provisions: 0, dettesFinancieres: 0, dettesFournisseurs: 0, autresDettes: 0, dotationAnnuelleParcExistant: 0 },
      investissements: [], emprunts: [], apports: [],
    };
    ctx.__record = record;
    const res = getJSON(ctx, 'PrevisionnelEngine.calculerPrevisionnel(__record)');
    results.push({ name: 'Feuille vierge : résultat net nul chaque année', pass: res.cr.every(r => r.resultatNet === 0), detail: res.cr.map(r => r.resultatNet) });
    results.push({ name: 'Feuille vierge : actif = passif (écart nul) chaque année', pass: res.bilan.every(b => Math.abs(b.ecart) < 1e-6), detail: res.bilan.map(b => b.ecart) });
    results.push({ name: 'Feuille vierge : 36 mois générés (horizon 3 ans)', pass: res.tresorerieMensuelle.length === 36, detail: res.tresorerieMensuelle.length });
    results.push({ name: 'Feuille vierge : solde de trésorerie mensuel toujours nul', pass: res.tresorerieMensuelle.every(m => m.soldeFin === 0), detail: null });
    results.push({ name: 'Feuille vierge : aucun NaN/Infinity dans le compte de résultat', pass: res.cr.every(r => Number.isFinite(r.resultatNet) && Number.isFinite(r.ca)), detail: res.cr });
  }

  // ── 2. Scénario réaliste complet ───────────────────────────────────────
  {
    ctx.__record = fixtureRealiste();
    const res = getJSON(ctx, 'PrevisionnelEngine.calculerPrevisionnel(__record)');

    res.bilan.forEach(b => {
      results.push({
        name: `Bilan an ${b.annee} : actif = passif`,
        pass: Math.abs(b.totalActif - b.totalPassif) < 0.01,
        detail: `actif=${b.totalActif.toFixed(2)} passif=${b.totalPassif.toFixed(2)}`,
      });
    });

    // Cohérence trésorerie mensuelle <-> annuelle (garantie de construction du moteur)
    res.cr.forEach((r, n) => {
      const moisAnnee = res.tresorerieMensuelle.filter(m => m.annee === r.annee);
      const sommeFluxMensuels = moisAnnee.reduce((s, m) => s + m.fluxNet, 0);
      results.push({
        name: `Somme des flux mensuels ${r.annee} = variation de trésorerie annuelle (plan de financement)`,
        pass: Math.abs(sommeFluxMensuels - res.planFinancement[n].variationTresorerie) < 0.01,
        detail: `mensuel=${sommeFluxMensuels.toFixed(2)} annuel=${res.planFinancement[n].variationTresorerie.toFixed(2)}`,
      });
      const soldeFinAnnee = moisAnnee[moisAnnee.length - 1].soldeFin;
      results.push({
        name: `Solde de trésorerie de décembre ${r.annee} = trésorerie du Bilan`,
        pass: Math.abs(soldeFinAnnee - res.bilan[n].tresorerie) < 0.01,
        detail: `mensuel=${soldeFinAnnee.toFixed(2)} bilan=${res.bilan[n].tresorerie.toFixed(2)}`,
      });
    });

    results.push({ name: 'VNC des immobilisations jamais négative', pass: res.bilan.every(b => b.immobilisationsNettes >= -1e-6), detail: res.bilan.map(b => b.immobilisationsNettes) });
    results.push({ name: 'CAF cohérente = résultat net + dotations sur chaque exercice', pass: res.cr.every((r, i) => Math.abs((r.resultatNet + r.dotations) - res.planFinancement[i].caf) < 0.01), detail: null });
  }

  // ── 3. Tableaux d'amortissement d'emprunt (3 méthodes) ─────────────────
  {
    ctx.__empAnnuite = { montant: 24000, tauxAnnuel: 0.04, dureeAns: 4, annee: 2026, mois: 3, typeAmortissement: 'annuite' };
    const schedA = getJSON(ctx, 'PrevisionnelEngine.calculerTableauEmprunt(__empAnnuite, 2026)');
    results.push({ name: 'Emprunt annuités constantes : capital soldé en fin de durée', pass: Math.abs(schedA[schedA.length - 1].capitalFin) < 0.01, detail: schedA[schedA.length - 1].capitalFin });
    const decroissant = schedA.every((m, i) => i === 0 || m.capitalFin <= schedA[i - 1].capitalFin + 1e-9);
    results.push({ name: 'Emprunt annuités constantes : capital restant dû strictement décroissant', pass: decroissant, detail: null });
    const annuites = schedA.map(m => m.interets + m.amortissement);
    const mensualiteStable = annuites.every(a => Math.abs(a - annuites[0]) < 0.5);
    results.push({ name: 'Emprunt annuités constantes : mensualité stable sur toute la durée', pass: mensualiteStable, detail: annuites.slice(0, 3) });

    ctx.__empConstant = { montant: 12000, tauxAnnuel: 0.03, dureeAns: 2, annee: 2026, mois: 1, typeAmortissement: 'constant' };
    const schedC = getJSON(ctx, 'PrevisionnelEngine.calculerTableauEmprunt(__empConstant, 2026)');
    results.push({ name: 'Emprunt capital constant : soldé en fin de durée', pass: Math.abs(schedC[schedC.length - 1].capitalFin) < 0.01, detail: schedC[schedC.length - 1].capitalFin });
    results.push({ name: 'Emprunt capital constant : même montant de capital remboursé chaque mois', pass: Math.abs(schedC[0].amortissement - 12000 / 24) < 0.01, detail: schedC[0].amortissement });

    ctx.__empInFine = { montant: 12000, tauxAnnuel: 0.03, dureeAns: 2, annee: 2026, mois: 1, typeAmortissement: 'infine' };
    const schedF = getJSON(ctx, 'PrevisionnelEngine.calculerTableauEmprunt(__empInFine, 2026)');
    results.push({ name: 'Emprunt in fine : aucun remboursement de capital avant le dernier mois', pass: schedF.slice(0, -1).every(m => m.amortissement === 0), detail: null });
    results.push({ name: 'Emprunt in fine : capital remboursé intégralement au dernier mois', pass: Math.abs(schedF[schedF.length - 1].amortissement - 12000) < 0.01, detail: schedF[schedF.length - 1].amortissement });
  }

  // ── 4. Cas limites / gestion d'erreurs ─────────────────────────────────
  {
    // Marge très faible -> TVA nette proche de zéro voire négative (crédit de TVA)
    const recMarge = fixtureRealiste();
    recMarge.hypotheses.parExercice.forEach(h => { h.tauxMargeSurCA = 0.05; });
    ctx.__recMarge = recMarge;
    const resMarge = getJSON(ctx, 'PrevisionnelEngine.calculerPrevisionnel(__recMarge)');
    results.push({
      name: 'Marge faible / TVA quasi-nulle : équilibre actif=passif toujours vérifié',
      pass: resMarge.bilan.every(b => Math.abs(b.ecart) < 0.01),
      detail: resMarge.bilan.map(b => b.ecart),
    });

    // Horizon 1 an, sans investissement ni emprunt (cas le plus simple)
    const rec1an = {
      horizonYears: 1, startYear: 2026,
      hypotheses: {
        global: { tauxTVA: 0.20, delaiClientJours: 30, delaiFournisseurJours: 30, delaiTVAJours: 30, delaiChargesSocialesJours: 30, delaiISJours: 60, tauxIS: 0.25 },
        basePeriode: { ca: 100000, chargesExternes: 20000, masseSalariale: 30000, impotsTaxes: 1000, dotationAnnuelleParcExistant: 0 },
        parExercice: [{ annee: 2026, croissanceCA: 0, tauxMargeSurCA: 0.5, croissanceChargesExternes: 0, croissanceMasseSalariale: 0, tauxChargesPatronales: 0.4, croissanceImpotsTaxes: 0, tauxStockSurCA: 0 }],
      },
      ouverture: { immobilisationsBrutes: 0, amortissementsCumules: 0, stocks: 0, creancesClients: 0, autresCreances: 0, tresorerie: 5000, capitauxPropres: 5000, provisions: 0, dettesFinancieres: 0, dettesFournisseurs: 0, autresDettes: 0, dotationAnnuelleParcExistant: 0 },
      investissements: [], emprunts: [], apports: [],
    };
    ctx.__rec1an = rec1an;
    const res1an = getJSON(ctx, 'PrevisionnelEngine.calculerPrevisionnel(__rec1an)');
    results.push({ name: 'Horizon 1 an : bilan équilibré', pass: Math.abs(res1an.bilan[0].ecart) < 0.01, detail: res1an.bilan[0].ecart });
    results.push({ name: 'Horizon 1 an : 12 mois générés', pass: res1an.tresorerieMensuelle.length === 12, detail: res1an.tresorerieMensuelle.length });

    // validerOuverture() détecte un bilan d'ouverture déséquilibré
    ctx.__ouvertureDesequilibree = { immobilisationsBrutes: 100000, amortissementsCumules: 0, stocks: 0, creancesClients: 0, autresCreances: 0, tresorerie: 0, capitauxPropres: 50000, provisions: 0, dettesFinancieres: 0, dettesFournisseurs: 0, autresDettes: 0 };
    const val = getJSON(ctx, 'PrevisionnelEngine.validerOuverture(__ouvertureDesequilibree)');
    results.push({ name: 'validerOuverture() détecte un déséquilibre de 50 000 €', pass: !val.equilibre && Math.abs(val.ecart - 50000) < 0.01, detail: val });

    ctx.__ouvertureEquilibree = { immobilisationsBrutes: 100000, amortissementsCumules: 0, stocks: 0, creancesClients: 0, autresCreances: 0, tresorerie: 0, capitauxPropres: 100000, provisions: 0, dettesFinancieres: 0, dettesFournisseurs: 0, autresDettes: 0 };
    const valOk = getJSON(ctx, 'PrevisionnelEngine.validerOuverture(__ouvertureEquilibree)');
    results.push({ name: 'validerOuverture() valide un bilan d’ouverture équilibré', pass: valOk.equilibre && Math.abs(valOk.ecart) < 1, detail: valOk });
  }

  // ── 5. Amortissement du plan d'investissement ───────────────────────────
  {
    runIn(ctx, `
      var __planAmort = PrevisionnelEngine.calculerPlanAmortissement({
        investissements: [{ annee: 2026, montantHT: 10000, dureeAns: 5 }],
        dotationAnnuelleParcExistant: 0, vncParcExistantOuverture: 0,
        horizonYears: 3, startYear: 2026,
      });
    `);
    const planAmort = getJSON(ctx, '__planAmort');
    results.push({ name: 'Amortissement linéaire : dotation annuelle = montant / durée', pass: Math.abs(planAmort.dotations[0] - 2000) < 0.01, detail: planAmort.dotations });
    results.push({ name: 'Amortissement linéaire : VNC décroît chaque exercice', pass: Math.abs(planAmort.vncFin[0] - 8000) < 0.01 && Math.abs(planAmort.vncFin[1] - 6000) < 0.01, detail: planAmort.vncFin });
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
