'use strict';
/**
 * Tests du moteur IRPP (IrppEngine) et du catalogue de recherche de cases
 * (IRPP_CASES / rechercherCasesIrpp). Fonctions pures, testées
 * indépendamment de tout dossier réel — cf. FEC_Analyse_v6.html, sections
 * "MODULE IRPP — MOTEUR" et "MODULE IRPP — CATALOGUE DE CASES". Couvre :
 * abattements bornés (salaires/pensions), option PFU vs barème sur les
 * RCM, déductions (pensions alimentaires, PER et son plafonnement),
 * réductions d'impôt (dons à deux taux avec report, plafonnement global
 * des niches fiscales, non-remboursabilité), crédits d'impôt
 * (remboursables, peuvent générer une restitution), micro-foncier vs
 * réel, taux marginal par tranche, décote, et la recherche en langage
 * courant du cas explicitement demandé par l'utilisateur ("dons" -> 7UD/7UF).
 */
const { loadApp, getJSON } = require('./harness.js');

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const results = [];
  const E = 'IrppEngine', G = 'REGLES_IR_2025';
  const push = (name, pass, detail) => results.push({ name, pass, detail });
  const close = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 1 : eps);

  // ── Cas 1 : salarié célibataire simple, 1 part ───────────────────────
  {
    ctx.__d1 = { situationFamiliale: 'celibataire', nbParts: 1, revenus: { salairesDecl1: 30000 } };
    const res = getJSON(ctx, `${E}.calculerDeclaration(__d1, ${G})`);
    push('cas1 salairesNet = 27000 (abattement 10% borné)', close(res.salairesNet, 27000, 0.01), res.salairesNet);
    const irAvantDecote = 15503 * 0.11;
    const decote = Math.min(irAvantDecote, Math.max(0, 889 - irAvantDecote * 0.4525));
    const irAttendu = irAvantDecote - decote;
    push('cas1 irBrut (après décote) ≈ ' + irAttendu.toFixed(2), close(res.irBrut, irAttendu, 0.5), res.irBrut);
    push('cas1 irNetFinal == irBrut (pas de réduction/crédit/RCM)', close(res.irNetFinal, irAttendu, 0.5), res.irNetFinal);
    push('cas1 aucune alerte', res.alertes.length === 0, res.alertes);
  }

  // ── Cas 2 : dons — exemple explicite de l'utilisateur ("j'ai fait des dons") ─
  {
    ctx.__d2 = { situationFamiliale: 'celibataire', nbParts: 1, revenus: { salairesDecl1: 30000 }, reductions: { donsAutresOrganismes: 300 } };
    const res = getJSON(ctx, `${E}.calculerDeclaration(__d2, ${G})`);
    push('cas2 reductionDons = 300*0.66 = 198', close(res.reductionDons, 198, 0.01), res.reductionDons);
    const irAvantDecote = 15503 * 0.11;
    const decote = Math.min(irAvantDecote, Math.max(0, 889 - irAvantDecote * 0.4525));
    const irBrutAttendu = irAvantDecote - decote;
    push('cas2 irApresReductions = irBrut - 198', close(res.irApresReductions, irBrutAttendu - 198, 0.5), res.irApresReductions);
    push('cas2 irNetFinal == irApresReductions (pas de crédit/RCM)', close(res.irNetFinal, res.irApresReductions, 0.01), res.irNetFinal);
  }

  // ── Cas 2bis : don renforcé (organismes aide aux personnes en difficulté) + report excédent ─
  {
    ctx.__d2b = { situationFamiliale: 'celibataire', nbParts: 1, revenus: { salairesDecl1: 30000 }, reductions: { donsOrganismesDifficulte: 1500 } };
    const res = getJSON(ctx, `${E}.calculerDeclaration(__d2b, ${G})`);
    const attendu = 1000 * 0.75 + 500 * 0.66;
    push('cas2bis don renforcé plafonné à 1000€@75%, excédent @66%', close(res.reductionDons, attendu, 0.01), res.reductionDons);
  }

  // ── Cas 3 : versement PER déductible ──────────────────────────────────
  {
    ctx.__d3 = { situationFamiliale: 'celibataire', nbParts: 1, revenus: { salairesDecl1: 30000 }, deductions: { versementsPER: 3000, revenuProfessionnelPourPER: 0 } };
    const res = getJSON(ctx, `${E}.calculerDeclaration(__d3, ${G})`);
    push('cas3 dedPER = 3000 (< plafond min 4399)', close(res.dedPER, 3000, 0.01), res.dedPER);
    push('cas3 revenuNetGlobal = 27000-3000 = 24000', close(res.revenuNetGlobal, 24000, 0.01), res.revenuNetGlobal);
    push('cas3 aucune alerte (sous le plafond)', res.alertes.length === 0, res.alertes);
  }

  // ── Cas 3bis : PER excède le plafond → alerte ─────────────────────────
  {
    ctx.__d3b = { situationFamiliale: 'celibataire', nbParts: 1, revenus: { salairesDecl1: 30000 }, deductions: { versementsPER: 10000, revenuProfessionnelPourPER: 0 } };
    const res = getJSON(ctx, `${E}.calculerDeclaration(__d3b, ${G})`);
    push('cas3bis dedPER plafonné à 4399', close(res.dedPER, 4399, 0.01), res.dedPER);
    push('cas3bis alerte PER présente', res.alertes.some(a => a.includes('PER')), res.alertes);
  }

  // ── Cas 4 : plafonnement global des niches fiscales dépassé ──────────
  {
    ctx.__d4 = { situationFamiliale: 'celibataire', nbParts: 1, revenus: { salairesDecl1: 80000 }, reductions: { souscriptionPME: 100000, tauxPME: 0.18 } };
    const res = getJSON(ctx, `${E}.calculerDeclaration(__d4, ${G})`);
    push('cas4 reductionsPlafonnablesRetenues = 10000 (plafonné)', close(res.reductionsPlafonnablesRetenues, 10000, 0.01), res.reductionsPlafonnablesRetenues);
    push('cas4 alerte plafond niches fiscales', res.alertes.some(a => a.includes('niches fiscales')), res.alertes);
  }

  // ── Cas 5 : crédit d'impôt supérieur à l'IR brut → restitution ───────
  {
    ctx.__d5 = { situationFamiliale: 'celibataire', nbParts: 1, revenus: { salairesDecl1: 20000 }, credits: { fraisGardeMontant: 2000, fraisGardeNbEnfants: 1 } };
    const res = getJSON(ctx, `${E}.calculerDeclaration(__d5, ${G})`);
    push('cas5 creditGarde = min(2000,3500)*0.5 = 1000', close(res.creditGarde, 1000, 0.01), res.creditGarde);
    push('cas5 irNetFinal négatif (restitution)', res.irNetFinal < 0, res.irNetFinal);
    push('cas5 irNetAvantPFU == irNetFinal (pas de RCM)', close(res.irNetAvantPFU, res.irNetFinal, 0.01), res.irNetFinal);
  }

  // ── Cas 6 : réduction d'impôt non remboursable (excédent perdu) → alerte ─
  {
    ctx.__d6 = { situationFamiliale: 'celibataire', nbParts: 1, revenus: { salairesDecl1: 15000 }, reductions: { donsAutresOrganismes: 5000 } };
    const res = getJSON(ctx, `${E}.calculerDeclaration(__d6, ${G})`);
    push('cas6 reductionsImputees plafonnée à irBrut', close(res.reductionsImputees, res.irBrut, 0.01), res.reductionsImputees);
    push('cas6 irApresReductions = 0', close(res.irApresReductions, 0, 0.01), res.irApresReductions);
    push('cas6 alerte réduction perdue', res.alertes.some(a => a.includes('jamais remboursable')), res.alertes);
  }

  // ── Cas 7 : PFU sur dividendes (option par défaut) ────────────────────
  {
    ctx.__d7 = { situationFamiliale: 'celibataire', nbParts: 1, revenus: { salairesDecl1: 30000, dividendes: 10000 }, optionBaremeRCM: false };
    const res = getJSON(ctx, `${E}.calculerDeclaration(__d7, ${G})`);
    const pfuAttendu = 10000 * 0.128 + 10000 * 0.172;
    push('cas7 PFU total = 12.8%+17.2% de 10000 = 3000', close(res.prelevementForfaitaire.total, pfuAttendu, 0.01), res.prelevementForfaitaire.total);
    push('cas7 dividendes hors revenuBrutGlobal (PFU)', close(res.revenuBrutGlobal, 27000, 0.01), res.revenuBrutGlobal);
  }

  // ── Cas 8 : option barème sur RCM (abattement 40% dividendes, PS toujours dus) ─
  {
    ctx.__d8 = { situationFamiliale: 'celibataire', nbParts: 1, revenus: { salairesDecl1: 30000, dividendes: 10000 }, optionBaremeRCM: true };
    const res = getJSON(ctx, `${E}.calculerDeclaration(__d8, ${G})`);
    push('cas8 revenuBrutGlobal inclut dividendes*(1-40%) = 6000', close(res.revenuBrutGlobal, 27000 + 6000, 0.01), res.revenuBrutGlobal);
    push('cas8 PS dus mais pas IR forfaitaire', close(res.prelevementForfaitaire.total, 10000 * 0.172, 0.01) && res.prelevementForfaitaire.ir === 0, res.prelevementForfaitaire);
  }

  // ── Cas 9 : quotient familial (couple + enfants) sans exception ──────
  {
    ctx.__d9 = { situationFamiliale: 'couple', nbParts: 3, revenus: { salairesDecl1: 60000, salairesDecl2: 0 } };
    const res = getJSON(ctx, `${E}.calculerDeclaration(__d9, ${G})`);
    push('cas9 irBrut calculé sans exception et positif', Number.isFinite(res.irBrut) && res.irBrut > 0, res.irBrut);
  }

  // ── Cas 10 : tauxMarginalPourRevenu — vérification par tranche ───────
  {
    push('marginal(5000,1) = 0%', getJSON(ctx, `${E}.tauxMarginalPourRevenu(5000, 1, ${G})`) === 0);
    push('marginal(20000,1) = 11%', getJSON(ctx, `${E}.tauxMarginalPourRevenu(20000, 1, ${G})`) === 0.11);
    push('marginal(50000,1) = 30%', getJSON(ctx, `${E}.tauxMarginalPourRevenu(50000, 1, ${G})`) === 0.30);
    push('marginal(100000,1) = 41%', getJSON(ctx, `${E}.tauxMarginalPourRevenu(100000, 1, ${G})`) === 0.41);
    push('marginal(200000,1) = 45%', getJSON(ctx, `${E}.tauxMarginalPourRevenu(200000, 1, ${G})`) === 0.45);
    push('marginal(0,1) = 0%', getJSON(ctx, `${E}.tauxMarginalPourRevenu(0, 1, ${G})`) === 0);
    push('marginal(100000,2) = 30% (quotient=50000)', getJSON(ctx, `${E}.tauxMarginalPourRevenu(100000, 2, ${G})`) === 0.30);
  }

  // ── Cas 11 : foncier micro vs réel ────────────────────────────────────
  {
    ctx.__d11a = { situationFamiliale: 'celibataire', nbParts: 1, revenus: { fonciersBrut: 10000, fonciersMicro: true } };
    const resMicro = getJSON(ctx, `${E}.calculerDeclaration(__d11a, ${G})`);
    push('cas11 micro-foncier abattement 30% -> net 7000', close(resMicro.fonciersNet, 7000, 0.01), resMicro.fonciersNet);
    ctx.__d11b = { situationFamiliale: 'celibataire', nbParts: 1, revenus: { fonciersBrut: 7000, fonciersMicro: false } };
    const resReel = getJSON(ctx, `${E}.calculerDeclaration(__d11b, ${G})`);
    push('cas11 régime réel : net saisi directement = 7000', close(resReel.fonciersNet, 7000, 0.01), resReel.fonciersNet);
  }

  // ── Cas 12 : REGLES_IR_2025 réutilise le barème/décote de la Rémunération (pas de duplication) ─
  {
    const memeBareme = getJSON(ctx, `${G}.bareme === REGLES_REMUNERATION_2025.ir.bareme`);
    push('REGLES_IR_2025.bareme référence REGLES_REMUNERATION_2025.ir.bareme (même objet, jamais dupliqué)', memeBareme === true, memeBareme);
  }

  // ── Cas 12bis : calculerNbParts — quotient familial standard (mode simplifié) ─
  {
    const attendus = [
      ['celibataire', 0, 1], ['celibataire', 1, 1.5], ['celibataire', 2, 2],
      ['celibataire', 3, 3], ['celibataire', 4, 4],
      ['couple', 0, 2], ['couple', 1, 2.5], ['couple', 2, 3], ['couple', 3, 4],
    ];
    for (const [sit, n, attendu] of attendus) {
      const r = getJSON(ctx, `${E}.calculerNbParts('${sit}', ${n})`);
      push(`calculerNbParts('${sit}', ${n}) = ${attendu}`, close(r, attendu, 1e-9), r);
    }
  }

  // ── Cas 13 : recherche de case — demande explicite de l'utilisateur ("dons") ─
  {
    const resDons = getJSON(ctx, `rechercherCasesIrpp('dons')`);
    const codes = resDons.slice(0, 2).map(r => r.code).sort();
    push("recherche 'dons' -> renvoie 7UD et 7UF en tête de liste", JSON.stringify(codes) === JSON.stringify(['7UD', '7UF']), codes);

    const resPhrase = getJSON(ctx, `rechercherCasesIrpp("j'ai fait des dons")`);
    push("recherche en phrase complète \"j'ai fait des dons\" -> trouve un résultat exploitable", resPhrase.length > 0 && (resPhrase[0].code === '7UD' || resPhrase[0].code === '7UF'), resPhrase[0]);

    const resNounou = getJSON(ctx, `rechercherCasesIrpp('nounou')`);
    push("recherche 'nounou' -> case 7GA (frais de garde)", resNounou.length > 0 && resNounou[0].code === '7GA', resNounou[0]);

    const resPER = getJSON(ctx, `rechercherCasesIrpp('plan epargne retraite')`);
    push("recherche 'plan epargne retraite' -> case 6NS", resPER.length > 0 && resPER[0].code === '6NS', resPER[0]);

    const resVide = getJSON(ctx, `rechercherCasesIrpp('xyzzyfoobarblah')`);
    push('recherche sans correspondance -> liste vide (pas d’exception)', Array.isArray(resVide) && resVide.length === 0, resVide);

    const nbCases = getJSON(ctx, `IRPP_CASES.length`);
    push('IRPP_CASES contient au moins 15 cases courantes', nbCases >= 15, nbCases);
  }

  // ── Cas 14 : décote au-dessus du seuil = 0 (réutilise RemunerationEngine.calculerDecote) ─
  {
    const d1 = getJSON(ctx, `RemunerationEngine.calculerDecote(2500, 'celibataire', ${G})`);
    push('decote(2500, célibataire) = 0 (>= seuil 1964)', d1 === 0, d1);
    const d2 = getJSON(ctx, `RemunerationEngine.calculerDecote(1000, 'celibataire', ${G})`);
    push('decote(1000, célibataire) > 0 (< seuil 1964)', d2 > 0, d2);
  }

  // ── Cas 15 : multi-années — chargerReglesIrppEffectives / irDupliquerAnnee ─
  {
    getJSON(ctx, `(() => { localStorage.removeItem(REGLES_IR_STORE_KEY); return true; })()`);

    const annees0 = getJSON(ctx, `anneesIrppDisponibles()`);
    push('anneesIrppDisponibles() ne contient que 2025 sans surcharge', JSON.stringify(annees0) === JSON.stringify([2025]), annees0);

    const res2030 = getJSON(ctx, `chargerReglesIrppEffectives(2030)`);
    push('Demander 2030 (inconnue) replie sur 2025 (anneeUtilisee)', res2030.anneeUtilisee === 2025, res2030.anneeUtilisee);
    push('Le repli 2030->2025 renvoie le plafond de dons renforcé 2025 (1000)', res2030.regles.dons.plafondRenforce === 1000, res2030.regles.dons.plafondRenforce);

    const dupliqueOk = getJSON(ctx, `irDupliquerAnnee(2025, 2030)`);
    push('irDupliquerAnnee(2025, 2030) réussit', dupliqueOk === true, dupliqueOk);
    const annees1 = getJSON(ctx, `anneesIrppDisponibles()`);
    push('anneesIrppDisponibles() inclut désormais 2030', annees1.includes(2030), annees1);
    const res2030bis = getJSON(ctx, `chargerReglesIrppEffectives(2030)`);
    push('Après duplication, 2030 est résolue exactement (plus de repli)', res2030bis.anneeUtilisee === 2030, res2030bis.anneeUtilisee);

    getJSON(ctx, `(() => {
      const overrides = loadReglesIrppOverrides();
      overrides[2030].dons.plafondRenforce = 2500;
      localStorage.setItem(REGLES_IR_STORE_KEY, JSON.stringify(overrides));
      return true;
    })()`);
    const plafondOriginalIntact = getJSON(ctx, `${G}.dons.plafondRenforce`);
    push('Modifier la surcharge 2030 n’affecte pas REGLES_IR_2025 (isolation)', plafondOriginalIntact === 1000, plafondOriginalIntact);
    const res2030ter = getJSON(ctx, `chargerReglesIrppEffectives(2030).regles.dons.plafondRenforce`);
    push('La modification 2030 est bien prise en compte pour 2030 (2500)', res2030ter === 2500, res2030ter);

    // Le barème IR (partagé avec la Rémunération) reste identique quelle que soit la surcharge IRPP propre
    const baremeIdentique = getJSON(ctx, `JSON.stringify(chargerReglesIrppEffectives(2030).regles.bareme) === JSON.stringify(chargerReglesRemunerationEffectives(2030).regles.ir.bareme)`);
    push('Le barème IR de la déclaration 2030 reste identique à celui de la Rémunération 2030 (jamais dupliqué/divergent)', baremeIdentique === true, baremeIdentique);

    getJSON(ctx, `(() => { localStorage.removeItem(REGLES_IR_STORE_KEY); return true; })()`);
  }

  // ── Cas 16 : creerIrppVierge() initialise anneeDemandee et un reglesSnapshot cohérent ─
  {
    const vierge = getJSON(ctx, `creerIrppVierge()`);
    push('creerIrppVierge() initialise anneeDemandee à 2025', vierge.anneeDemandee === 2025, vierge.anneeDemandee);
    push('creerIrppVierge() initialise un reglesSnapshot avec annee 2025', vierge.reglesSnapshot && vierge.reglesSnapshot.annee === 2025, vierge.reglesSnapshot && vierge.reglesSnapshot.annee);
  }

  return results;
}

module.exports = { run };
