'use strict';
/**
 * Tests du moteur d'optimisation de la rémunération du dirigeant
 * (RemunerationEngine). Fonctions pures, testées indépendamment de tout
 * dossier réel — cf. FEC_Analyse_v6.html, section "MODULE RÉMUNÉRATION
 * DIRIGEANT — MOTEUR". Couvre les 15 cas de test du cahier des charges
 * (§30) : IS taux réduit/normal, IR (barème/quotient/décote), PFU vs
 * barème, SASU (dividendes seuls, 60k rémunération, arbitrage),
 * EURL/SARL-IS gérant majoritaire (cotisations TNS, seuil des 10% sur
 * dividendes), EURL/EI-IR, foyer avec autres revenus, résultat
 * insuffisant/déficitaire, trésorerie insuffisante, coût société fixe,
 * revenu net cible (simulation inversée), changement d'année fiscale
 * (snapshot de règles).
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

const FOYER_SIMPLE = { salaires: 0, bic: 0, bnc: 0, fonciers: 0, pensions: 0, autresImposables: 0, nbParts: 1, situationFamiliale: 'celibataire' };

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const results = [];
  const R = 'RemunerationEngine', G = 'REGLES_REMUNERATION_2025';
  const push = (name, pass, detail) => results.push({ name, pass, detail });

  // ── IS : taux réduit puis taux normal ────────────────────────────────
  {
    ctx.__foyer = FOYER_SIMPLE;
    const is1 = getJSON(ctx, `${R}.calculerIS(30000, ${G}.is, true)`);
    push('IS : résultat sous le seuil -> 100% au taux réduit', Math.abs(is1.isTotal - 30000 * 0.15) < 0.01, is1);
    const is2 = getJSON(ctx, `${R}.calculerIS(100000, ${G}.is, true)`);
    push('IS : résultat au-dessus du seuil -> réparti taux réduit + taux normal', Math.abs(is2.isTotal - (42500 * 0.15 + 57500 * 0.25)) < 0.01, is2);
    const is3 = getJSON(ctx, `${R}.calculerIS(100000, ${G}.is, false)`);
    push('IS : non éligible taux réduit -> tout au taux normal', Math.abs(is3.isTotal - 25000) < 0.01, is3);
    const is4 = getJSON(ctx, `${R}.calculerIS(-5000, ${G}.is, true)`);
    push('IS : résultat négatif -> IS nul (pas de NaN)', is4.isTotal === 0, is4);
  }

  // ── IR : barème, décote, quotient familial plafonné ──────────────────
  {
    const irCeliba = getJSON(ctx, `${R}.calculerIRAvecPlafonnement(30000, 1, 'celibataire', ${G}.ir)`);
    push('IR céliba 30k€ : montant plausible', irCeliba > 0 && irCeliba < 9000, irCeliba);
    const irBas = getJSON(ctx, `${R}.calculerIRAvecPlafonnement(15000, 1, 'celibataire', ${G}.ir)`);
    const irBrut = getJSON(ctx, `${R}.calculerIRBaremeParPart(15000, 1, ${G}.ir.bareme)`);
    push('IR foyer modeste : la décote réduit l’impôt sous l’impôt brut', irBas < irBrut, { irBas, irBrut });
    const ir2parts = getJSON(ctx, `${R}.calculerIRAvecPlafonnement(120000, 2, 'couple', ${G}.ir)`);
    const ir3parts = getJSON(ctx, `${R}.calculerIRAvecPlafonnement(120000, 3, 'couple', ${G}.ir)`);
    push('Quotient familial : 3 parts < 2 parts à revenu identique', ir3parts < ir2parts, { ir2parts, ir3parts });
  }

  // ── Dividendes : PFU vs barème ────────────────────────────────────────
  {
    ctx.__foyerTMIeleve = { ...FOYER_SIMPLE, salaires: 150000 };
    const compHaut = getJSON(ctx, `${R}.comparerPFUvsBareme(20000, __foyerTMIeleve, 1, 'celibataire', ${G})`);
    push('PFU vs barème : foyer TMI élevé -> PFU plus favorable', compHaut.meilleure === 'pfu', compHaut.meilleure);
    ctx.__foyerTMIbas = { ...FOYER_SIMPLE, salaires: 0 };
    const compBas = getJSON(ctx, `${R}.comparerPFUvsBareme(5000, __foyerTMIbas, 1, 'celibataire', ${G})`);
    push('PFU vs barème : foyer TMI nul -> barème plus favorable (abattement 40%)', compBas.meilleure === 'bareme', compBas.meilleure);
  }

  // ── SASU cas 1 : dividendes uniquement ───────────────────────────────
  {
    ctx.__entreeSasu1 = {
      resultatAvantRemuneration: 100000, remunerationBrute: 0, dividendesBrutsVerses: Infinity,
      reservesDisponibles: 0, tresorerieDisponible: 200000, deficitReportable: 0, eligibleTauxReduitIS: true, foyer: FOYER_SIMPLE,
    };
    const res = getJSON(ctx, `${R}.calculerSASU(__entreeSasu1, ${G})`);
    push('SASU cas 1 : rémunération nulle', res.remunerationBrute === 0, res.remunerationBrute);
    push('SASU cas 1 : aucune charge sociale sans rémunération', res.chargesSalariales === 0, res.chargesSalariales);
    push('SASU cas 1 : dividendes distribués (plafonnés au distribuable)', res.dividendesBrutsVerses > 0, res.dividendesBrutsVerses);
    push('SASU cas 1 : revenu net personnel plausible', res.revenuNetPersonnelFinal > 0 && res.revenuNetPersonnelFinal < 100000, res.revenuNetPersonnelFinal);
  }

  // ── SASU cas 2 : 60 000 € de rémunération ────────────────────────────
  {
    ctx.__entreeSasu2 = {
      resultatAvantRemuneration: 100000, remunerationBrute: 60000, dividendesBrutsVerses: 0,
      reservesDisponibles: 0, tresorerieDisponible: 200000, deficitReportable: 0, eligibleTauxReduitIS: true, foyer: FOYER_SIMPLE,
    };
    const res = getJSON(ctx, `${R}.calculerSASU(__entreeSasu2, ${G})`);
    push('SASU cas 2 : charges patronales et salariales générées', res.chargesPatronales > 0 && res.chargesSalariales > 0, res);
    push('SASU cas 2 : coût total = brut + charges patronales', Math.abs(res.coutTotalRemuneration - (60000 + res.chargesPatronales)) < 0.01, res.coutTotalRemuneration);
    push('SASU cas 2 : revenu net final < brut', res.revenuNetPersonnelFinal > 0 && res.revenuNetPersonnelFinal < 60000, res.revenuNetPersonnelFinal);
  }

  // ── SASU cas 3 : arbitrage rémunération/dividendes ───────────────────
  {
    ctx.__baseSasu3 = { resultatAvantRemuneration: 150000, reservesDisponibles: 0, tresorerieDisponible: 300000, deficitReportable: 0, eligibleTauxReduitIS: true, foyer: FOYER_SIMPLE };
    // "100% rémunération" doit tenir compte des charges patronales (SASU) :
    // rem=150000 avec dividendes=0 serait en réalité infaisable (coût > budget).
    const toutRem = getJSON(ctx, `${R}.remunerationMaxFaisable('sasu', __baseSasu3, ${G}, 150000)`);
    push('SASU cas 3 : "100% rémunération" reste financièrement faisable (coût <= budget)', toutRem.coutTotalRemuneration <= 150000 + 1, toutRem.coutTotalRemuneration);
    const toutDiv = getJSON(ctx, `${R}.calculerSASU({...__baseSasu3, remunerationBrute:0, dividendesBrutsVerses:Infinity}, ${G})`);
    const optimum = getJSON(ctx, `${R}.optimiser('sasu', __baseSasu3, ${G}, {budget:150000})`);
    push('SASU cas 3 : optimum financièrement faisable', optimum.resultatApresRemuneration >= -1, optimum.resultatApresRemuneration);
    push('SASU cas 3 : optimum >= 100% rémunération', optimum.revenuNetPersonnelFinal >= toutRem.revenuNetPersonnelFinal - 1, { optimum: optimum.revenuNetPersonnelFinal, toutRem: toutRem.revenuNetPersonnelFinal });
    push('SASU cas 3 : optimum >= 100% dividendes', optimum.revenuNetPersonnelFinal >= toutDiv.revenuNetPersonnelFinal - 1, { optimum: optimum.revenuNetPersonnelFinal, toutDiv: toutDiv.revenuNetPersonnelFinal });
  }

  // ── EURL/SARL-IS, gérant majoritaire ──────────────────────────────────
  {
    ctx.__entreeEurl4 = {
      formeJuridique: 'eurl_is', resultatAvantRemuneration: 80000, remunerationBrute: 40000, dividendesBrutsVerses: 0,
      reservesDisponibles: 0, tresorerieDisponible: 150000, deficitReportable: 0, eligibleTauxReduitIS: true,
      capitalSocial: 10000, primesEmission: 0, compteCourantAssocie: 0, foyer: FOYER_SIMPLE,
    };
    const res = getJSON(ctx, `${R}.calculerEURL_IS(__entreeEurl4, ${G})`);
    push('EURL-IS cas 4 : cotisations TNS générées', res.cotisationsTNS.total > 0, res.cotisationsTNS.total);
    push('EURL-IS cas 4 : net avant IR < brut', res.netAvantIRDirigeant < 40000, res.netAvantIRDirigeant);
  }

  // ── EURL/SARL-IS : dividendes dépassant le seuil des 10% ────────────
  {
    ctx.__entreeEurl5 = {
      formeJuridique: 'eurl_is', resultatAvantRemuneration: 150000, remunerationBrute: 20000, dividendesBrutsVerses: Infinity,
      reservesDisponibles: 0, tresorerieDisponible: 300000, deficitReportable: 0, eligibleTauxReduitIS: true,
      capitalSocial: 5000, primesEmission: 0, compteCourantAssocie: 0, foyer: FOYER_SIMPLE,
    };
    const res = getJSON(ctx, `${R}.calculerEURL_IS(__entreeEurl5, ${G})`);
    push('EURL-IS cas 5 : fraction de dividendes soumise aux cotisations TNS', res.dividendesSoumisCotisationsSociales > 0, res.dividendesSoumisCotisationsSociales);
    push('EURL-IS cas 5 : cotisations sociales sur dividendes > 0', res.chargesSocialesDividendes > 0, res.chargesSocialesDividendes);
    push('EURL-IS cas 5 : alerte explicite sur le seuil de 10%', res.alertes.some(a => a.includes('10 %')), res.alertes);

    ctx.__entreeEurl5b = { ...ctx.__entreeEurl5, capitalSocial: 2000000 };
    const resCapitalEleve = getJSON(ctx, `${R}.calculerEURL_IS(__entreeEurl5b, ${G})`);
    push('EURL-IS : capital social élevé -> aucun dividende soumis à TNS', resCapitalEleve.dividendesSoumisCotisationsSociales === 0, resCapitalEleve.dividendesSoumisCotisationsSociales);
  }

  // ── EURL / EI à l'IR ───────────────────────────────────────────────────
  {
    ctx.__entreeEurl6 = {
      formeJuridique: 'eurl_ir', resultatAvantRemuneration: 60000, natureActivite: 'bic',
      tresorerieDisponible: 50000, prelevementsPersonnelsEnvisages: 40000, foyer: FOYER_SIMPLE,
    };
    const res = getJSON(ctx, `${R}.calculerIR_Direct(__entreeEurl6, ${G})`);
    push('EURL-IR cas 6 : cotisations TNS calculées sur le bénéfice', res.cotisationsTNS.total > 0, res.cotisationsTNS.total);
    push('EURL-IR cas 6 : revenu imposable = bénéfice - cotisations', res.revenuProfessionnelImposable < 60000, res.revenuProfessionnelImposable);
    push('EURL-IR cas 6 : avertissement prélèvements ≠ résultat', res.alertes.some(a => a.includes('prélèvements personnels')), res.alertes);
    push('EURL-IR cas 6 : pas d’IS (structure à l’IR)', res.is === null, res.is);
  }

  // ── Foyer fiscal avec autres revenus importants ───────────────────────
  {
    ctx.__foyerRiche = { ...FOYER_SIMPLE, salaires: 80000, situationFamiliale: 'couple', nbParts: 3 };
    ctx.__foyerPauvre = { ...FOYER_SIMPLE };
    const base = { resultatAvantRemuneration: 100000, remunerationBrute: 40000, dividendesBrutsVerses: 0, reservesDisponibles: 0, tresorerieDisponible: 100000, deficitReportable: 0, eligibleTauxReduitIS: true };
    ctx.__entreeFoyerRiche = { ...base, foyer: ctx.__foyerRiche };
    ctx.__entreeFoyerPauvre = { ...base, foyer: ctx.__foyerPauvre };
    const resRiche = getJSON(ctx, `${R}.calculerSASU(__entreeFoyerRiche, ${G})`);
    const resPauvre = getJSON(ctx, `${R}.calculerSASU(__entreeFoyerPauvre, ${G})`);
    push('Foyer avec autres revenus importants : IR marginal positif', resRiche.irGenereParRemuneration > 0, resRiche.irGenereParRemuneration);
    push('Foyer avec autres revenus importants : IR marginal > foyer sans autres revenus', resRiche.irGenereParRemuneration > resPauvre.irGenereParRemuneration, { riche: resRiche.irGenereParRemuneration, pauvre: resPauvre.irGenereParRemuneration });
  }

  // ── Résultat insuffisant pour la rémunération cible ───────────────────
  {
    ctx.__entreeInsuf = { resultatAvantRemuneration: 20000, remunerationBrute: 60000, dividendesBrutsVerses: 0, reservesDisponibles: 0, tresorerieDisponible: 5000, deficitReportable: 0, eligibleTauxReduitIS: true, foyer: FOYER_SIMPLE };
    const res = getJSON(ctx, `${R}.calculerSASU(__entreeInsuf, ${G})`);
    push('Résultat insuffisant : résultat après rémunération négatif', res.resultatApresRemuneration < 0, res.resultatApresRemuneration);
    push('Résultat insuffisant : alerte explicite générée', res.alertes.some(a => a.includes('capacité financière')), res.alertes);
    push('Résultat insuffisant : pas de NaN', Number.isFinite(res.revenuNetPersonnelFinal), res.revenuNetPersonnelFinal);
  }

  // ── Dividende distribuable mais trésorerie insuffisante ───────────────
  {
    ctx.__entreeTreso = { resultatAvantRemuneration: 200000, remunerationBrute: 0, dividendesBrutsVerses: Infinity, reservesDisponibles: 0, tresorerieDisponible: 5000, deficitReportable: 0, eligibleTauxReduitIS: true, foyer: FOYER_SIMPLE };
    const res = getJSON(ctx, `${R}.calculerSASU(__entreeTreso, ${G})`);
    push('Dividende > trésorerie : dividende calculé bien supérieur à la trésorerie', res.dividendesBrutsVerses > 5000, res.dividendesBrutsVerses);
    push('Dividende > trésorerie : alerte de tension de trésorerie', res.alertes.some(a => a.includes('trésorerie')), res.alertes);
  }

  // ── Résultat déficitaire ───────────────────────────────────────────────
  {
    ctx.__entreeDeficit = { resultatAvantRemuneration: -30000, remunerationBrute: 0, dividendesBrutsVerses: 0, reservesDisponibles: 0, tresorerieDisponible: 10000, deficitReportable: 0, eligibleTauxReduitIS: true, foyer: FOYER_SIMPLE };
    const res = getJSON(ctx, `${R}.calculerSASU(__entreeDeficit, ${G})`);
    push('Résultat déficitaire : IS nul', res.is.isTotal === 0, res.is.isTotal);
    push('Résultat déficitaire : distribuable nul (jamais négatif)', res.resultatDistribuable === 0, res.resultatDistribuable);
    push('Résultat déficitaire : pas de NaN', Number.isFinite(res.revenuNetPersonnelFinal), res.revenuNetPersonnelFinal);
  }

  // ── Optimisation à coût société fixe ───────────────────────────────────
  {
    ctx.__baseCoutFixe = { resultatAvantRemuneration: 120000, reservesDisponibles: 0, tresorerieDisponible: 200000, deficitReportable: 0, eligibleTauxReduitIS: true, foyer: FOYER_SIMPLE };
    const scenarios = getJSON(ctx, `${R}.balayerRemuneration('sasu', __baseCoutFixe, ${G}, {budget:60000, pas:2000, dividendeStrategy:'maximal'})`);
    push('Coût société fixe : plusieurs scénarios générés', scenarios.length > 5, scenarios.length);
    push('Coût société fixe : aucune rémunération ne dépasse le budget', scenarios.every(s => s.remunerationBrute <= 60000 + 1e-6), null);
  }

  // ── Revenu net cible (simulation inversée) ─────────────────────────────
  {
    ctx.__baseCible = { resultatAvantRemuneration: 150000, reservesDisponibles: 0, tresorerieDisponible: 200000, deficitReportable: 0, eligibleTauxReduitIS: true, foyer: FOYER_SIMPLE };
    const res = getJSON(ctx, `${R}.simulationInversee(5000, 'sasu', __baseCible, ${G})`);
    push('Simulation inversée : net annuel proche de la cible (60000€/an)', Math.abs(res.revenuNetPersonnelFinal - 60000) < 1000, res.revenuNetPersonnelFinal);
    push('Simulation inversée : rémunération brute nécessaire > net cible', res.remunerationBrute > 60000, res.remunerationBrute);
  }

  // ── Non-régression : l'optimiseur ne doit jamais recommander une
  // rémunération que la société ne peut pas financer (coût total > résultat
  // avant rémunération). Sans le filtrage de faisabilité, une rémunération
  // proche du budget brut (en ignorant les charges patronales) peut sembler
  // "optimale" sur le seul plan personnel, alors que resultatApresRemuneration
  // est en réalité négatif — cf. balayerRemuneration()/filtrerFaisables().
  {
    ctx.__foyerNonFaisable = { ...FOYER_SIMPLE, salaires: 50000, situationFamiliale: 'couple', nbParts: 3 };
    ctx.__baseNonFaisable = { resultatAvantRemuneration: 200000, reservesDisponibles: 0, tresorerieDisponible: 200000, deficitReportable: 0, eligibleTauxReduitIS: true, foyer: ctx.__foyerNonFaisable };
    const optimum = getJSON(ctx, `${R}.optimiser('sasu', __baseNonFaisable, ${G}, {budget:200000})`);
    push('Optimiseur : le scénario recommandé est toujours financièrement faisable', optimum.resultatApresRemuneration >= -1, optimum.resultatApresRemuneration);
    const balayage = getJSON(ctx, `${R}.balayerRemuneration('sasu', __baseNonFaisable, ${G}, {budget:200000, pas:5000, dividendeStrategy:'maximal'})`);
    push('Optimiseur : balayerRemuneration() n’expose que des scénarios faisables', balayage.every(s => s.resultatApresRemuneration >= -1), balayage.filter(s => s.resultatApresRemuneration < -1).length);
  }

  // ── Changement d'année fiscale (snapshot de règles reproductible) ────
  {
    runIn(ctx, `var __regles2030 = JSON.parse(JSON.stringify(${G})); __regles2030.is.tauxNormal = 0.20;`);
    const res2025 = getJSON(ctx, `${R}.calculerIS(100000, ${G}.is, true)`);
    const res2030 = getJSON(ctx, `${R}.calculerIS(100000, __regles2030.is, true)`);
    push('Changement d’année fiscale : deux jeux de règles produisent des résultats différents', res2025.isTotal !== res2030.isTotal, { 2025: res2025.isTotal, 2030: res2030.isTotal });
    const tauxOriginal = getJSON(ctx, `${G}.is.tauxNormal`);
    push('Changement d’année fiscale : le jeu de règles original reste inchangé', Math.abs(tauxOriginal - 0.25) < 0.001, tauxOriginal);
  }

  // ── Multi-années — chargerReglesRemunerationEffectives / rmDupliquerAnnee ─
  {
    getJSON(ctx, `(() => { localStorage.removeItem(REGLES_REMUNERATION_STORE_KEY); return true; })()`);

    const annees0 = getJSON(ctx, `anneesRemunerationDisponibles()`);
    push('anneesRemunerationDisponibles() ne contient que 2025 sans surcharge', JSON.stringify(annees0) === JSON.stringify([2025]), annees0);

    const res2030 = getJSON(ctx, `chargerReglesRemunerationEffectives(2030)`);
    push('Demander 2030 (inconnue) replie sur 2025 (anneeUtilisee)', res2030.anneeUtilisee === 2025, res2030.anneeUtilisee);
    push('Le repli 2030->2025 renvoie le taux IS normal 2025 (0.25)', Math.abs(res2030.regles.is.tauxNormal - 0.25) < 0.001, res2030.regles.is.tauxNormal);

    const dupliqueOk = getJSON(ctx, `rmDupliquerAnnee(2025, 2030)`);
    push('rmDupliquerAnnee(2025, 2030) réussit', dupliqueOk === true, dupliqueOk);
    const annees1 = getJSON(ctx, `anneesRemunerationDisponibles()`);
    push('anneesRemunerationDisponibles() inclut désormais 2030', annees1.includes(2030), annees1);
    const res2030bis = getJSON(ctx, `chargerReglesRemunerationEffectives(2030)`);
    push('Après duplication, 2030 est résolue exactement (plus de repli)', res2030bis.anneeUtilisee === 2030, res2030bis.anneeUtilisee);

    getJSON(ctx, `(() => {
      const overrides = loadReglesRemunerationOverrides();
      overrides[2030].is.tauxNormal = 0.99;
      localStorage.setItem(REGLES_REMUNERATION_STORE_KEY, JSON.stringify(overrides));
      return true;
    })()`);
    const tauxOriginalIntact = getJSON(ctx, `${G}.is.tauxNormal`);
    push("Modifier la surcharge 2030 n'affecte pas REGLES_REMUNERATION_2025 (isolation)", Math.abs(tauxOriginalIntact - 0.25) < 0.001, tauxOriginalIntact);
    const res2030ter = getJSON(ctx, `chargerReglesRemunerationEffectives(2030).regles.is.tauxNormal`);
    push('La modification 2030 est bien prise en compte pour 2030 (0.99)', Math.abs(res2030ter - 0.99) < 0.001, res2030ter);

    getJSON(ctx, `(() => { localStorage.removeItem(REGLES_REMUNERATION_STORE_KEY); return true; })()`);
  }

  // ── creerRemuVierge() initialise anneeDemandee et un reglesSnapshot cohérent ─
  {
    const vierge = getJSON(ctx, `creerRemuVierge()`);
    push('creerRemuVierge() initialise anneeDemandee à 2025', vierge.anneeDemandee === 2025, vierge.anneeDemandee);
    push('creerRemuVierge() initialise un reglesSnapshot avec annee 2025', vierge.reglesSnapshot && vierge.reglesSnapshot.annee === 2025, vierge.reglesSnapshot && vierge.reglesSnapshot.annee);
  }

  // ── rmClasserScenarios — recommandation « meilleure forme juridique » ──
  {
    ctx.__scenariosTest = [
      { label: 'Forme A', res: { revenuNetPersonnelFinal: 30000 } },
      { label: 'Forme B', res: { revenuNetPersonnelFinal: 45000 } },
      { label: 'Forme C', res: { revenuNetPersonnelFinal: 38000 } },
    ];
    const classe = getJSON(ctx, `rmClasserScenarios(__scenariosTest)`);
    push('rmClasserScenarios : trie par revenu net décroissant (B, C, A)', classe.map(s => s.label).join(',') === 'Forme B,Forme C,Forme A', classe.map(s => s.label));
    push('rmClasserScenarios : rang 1 = 45000 (Forme B)', classe[0].rang === 1 && classe[0].net === 45000, classe[0]);
    push('rmClasserScenarios : rang croissant 1,2,3', classe.map(s => s.rang).join(',') === '1,2,3', classe.map(s => s.rang));

    // Égalité : les deux meilleurs scénarios sont classés côte à côte (rang 1 et 2), sans planter
    ctx.__scenariosEgalite = [
      { label: 'Forme X', res: { revenuNetPersonnelFinal: 40000 } },
      { label: 'Forme Y', res: { revenuNetPersonnelFinal: 40000 } },
    ];
    const classeEgalite = getJSON(ctx, `rmClasserScenarios(__scenariosEgalite)`);
    push('rmClasserScenarios : égalité gérée sans exception (2 scénarios classés)', classeEgalite.length === 2 && classeEgalite[0].rang === 1 && classeEgalite[1].rang === 2, classeEgalite);

    // Scénario avec revenuNetPersonnelFinal manquant/undefined -> traité comme 0, pas de NaN
    ctx.__scenariosPartiels = [
      { label: 'Forme Z', res: {} },
      { label: 'Forme W', res: { revenuNetPersonnelFinal: 10000 } },
    ];
    const classePartiel = getJSON(ctx, `rmClasserScenarios(__scenariosPartiels)`);
    push('rmClasserScenarios : revenuNetPersonnelFinal manquant traité comme 0 (pas de NaN)', classePartiel[0].label === 'Forme W' && classePartiel[1].net === 0, classePartiel);
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
