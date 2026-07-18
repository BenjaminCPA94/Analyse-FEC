'use strict';
/**
 * Tests du moteur de calcul TNS (TnsEngine) — cotisations sociales des
 * travailleurs non salariés. Cf. FEC_Analyse_v6.html, section
 * "MODULE TNS — MOTEUR". Barèmes indicatifs (année de référence 2025),
 * testés pour leur cohérence de calcul (progressivité, ACRE, versement
 * libératoire), pas pour leur exactitude légale au centime près.
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const results = [];

  // ── 1. cotisationParTranches() — barème par paliers ────────────────────
  {
    runIn(ctx, `
      var __tranches = [{ jusqu: 10000, taux: 0.10 }, { jusqu: 20000, taux: 0.20 }, { jusqu: Infinity, taux: 0.30 }];
    `);
    const c1 = getJSON(ctx, 'TnsEngine.cotisationParTranches(5000, __tranches)');
    results.push({ name: 'Tranches : assiette dans la 1ère tranche (5000 × 10%)', pass: Math.abs(c1 - 500) < 0.01, detail: c1 });
    const c2 = getJSON(ctx, 'TnsEngine.cotisationParTranches(15000, __tranches)');
    results.push({ name: 'Tranches : assiette à cheval (10000×10% + 5000×20%)', pass: Math.abs(c2 - 2000) < 0.01, detail: c2 });
    const c3 = getJSON(ctx, 'TnsEngine.cotisationParTranches(50000, __tranches)');
    results.push({ name: 'Tranches : assiette dans la dernière tranche (10000×10%+10000×20%+30000×30%)', pass: Math.abs(c3 - 12000) < 0.01, detail: c3 });
    const c0 = getJSON(ctx, 'TnsEngine.cotisationParTranches(0, __tranches)');
    results.push({ name: 'Tranches : assiette nulle -> cotisation nulle', pass: c0 === 0, detail: c0 });
  }

  // ── 2. Régime réel (commerçant) ────────────────────────────────────────
  {
    runIn(ctx, `var __baremeCommercant = baremeReelAvecPass(TNS_BAREME_REEL_DEFAUT.commercant, TNS_PASS_REF);`);
    const res40k = getJSON(ctx, 'TnsEngine.calculerTNSReel(40000, __baremeCommercant, {})');
    results.push({ name: 'Réel commerçant, revenu 40 000 € : total > 0 et < revenu (cotisations plausibles)', pass: res40k.total > 0 && res40k.total < 40000, detail: res40k.total });
    results.push({ name: 'Réel commerçant : revenu net = revenu - total', pass: Math.abs(res40k.revenuNet - (40000 - res40k.total)) < 0.01, detail: res40k });
    results.push({ name: 'Réel commerçant : taux global dans une fourchette réaliste (25%-55%)', pass: res40k.tauxGlobal > 0.25 && res40k.tauxGlobal < 0.55, detail: res40k.tauxGlobal });

    // Revenu nul : seule la formation professionnelle (CFP, montant fixe indépendant
    // du revenu) reste due, avec la CSG-CRDS calculée dessus — comportement réel
    // des TNS (cotisation minimale même à revenu nul) — jamais de NaN/Infinity.
    const resNul = getJSON(ctx, 'TnsEngine.calculerTNSReel(0, __baremeCommercant, {})');
    const cfpAttendue = getJSON(ctx, 'TNS_PASS_REF') * 0.0025;
    results.push({
      name: 'Réel commerçant, revenu nul : seule la CFP (montant fixe) + sa CSG-CRDS restent dues, aucun NaN',
      pass: Number.isFinite(resNul.total) && resNul.total > 0 && Math.abs(resNul.total - cfpAttendue * (1 + 0.097)) < 0.5,
      detail: resNul,
    });

    // Progressivité : un revenu plus élevé doit générer un total de cotisations plus élevé
    const res20k = getJSON(ctx, 'TnsEngine.calculerTNSReel(20000, __baremeCommercant, {})');
    const res80k = getJSON(ctx, 'TnsEngine.calculerTNSReel(80000, __baremeCommercant, {})');
    results.push({ name: 'Réel commerçant : total croissant avec le revenu (20k < 40k < 80k)', pass: res20k.total < res40k.total && res40k.total < res80k.total, detail: [res20k.total, res40k.total, res80k.total] });

    // ACRE : réduction effective du total
    const resAcre = getJSON(ctx, 'TnsEngine.calculerTNSReel(40000, __baremeCommercant, {acre:true, tauxReductionACRE:0.5})');
    results.push({ name: 'ACRE 50% : total réduit de moitié par rapport au cas sans ACRE', pass: Math.abs(resAcre.total - res40k.total * 0.5) < 0.5, detail: [resAcre.total, res40k.total] });
  }

  // ── 3. Régime réel (profession libérale) — barème distinct ────────────
  {
    runIn(ctx, `var __baremeLiberal = baremeReelAvecPass(TNS_BAREME_REEL_DEFAUT.liberal, TNS_PASS_REF);`);
    const resLib = getJSON(ctx, 'TnsEngine.calculerTNSReel(40000, __baremeLiberal, {})');
    results.push({ name: 'Réel profession libérale : calcul cohérent (total > 0, fini)', pass: resLib.total > 0 && Number.isFinite(resLib.total), detail: resLib.total });
  }

  // ── 4. Micro-entrepreneur ───────────────────────────────────────────────
  {
    const resMicroVente = getJSON(ctx, 'TnsEngine.calculerTNSMicro(30000, TNS_BAREME_MICRO_DEFAUT.vente, {})');
    results.push({ name: 'Micro vente : total = CA × (tauxCotisations + tauxCFP)', pass: Math.abs(resMicroVente.total - 30000 * (0.123 + 0.001)) < 0.01, detail: resMicroVente.total });

    const resMicroLib = getJSON(ctx, 'TnsEngine.calculerTNSMicro(30000, TNS_BAREME_MICRO_DEFAUT.liberal, {versementLiberatoire:true})');
    results.push({ name: 'Micro libéral + versement libératoire : total inclut le versement libératoire', pass: resMicroLib.versementLiberatoire > 0 && Math.abs(resMicroLib.total - (30000 * (0.211 + 0.002 + 0.022))) < 0.01, detail: resMicroLib });

    const resMicroSansVL = getJSON(ctx, 'TnsEngine.calculerTNSMicro(30000, TNS_BAREME_MICRO_DEFAUT.liberal, {versementLiberatoire:false})');
    results.push({ name: 'Micro sans versement libératoire : montant du versement à 0', pass: resMicroSansVL.versementLiberatoire === 0, detail: resMicroSansVL.versementLiberatoire });

    const resMicroAcre = getJSON(ctx, 'TnsEngine.calculerTNSMicro(30000, TNS_BAREME_MICRO_DEFAUT.servicesBIC, {acre:true, tauxReductionACRE:0.5})');
    const resMicroSansAcre = getJSON(ctx, 'TnsEngine.calculerTNSMicro(30000, TNS_BAREME_MICRO_DEFAUT.servicesBIC, {})');
    results.push({ name: 'Micro + ACRE : cotisations sociales réduites, CFP inchangé', pass: Math.abs(resMicroAcre.cotisationsSociales - resMicroSansAcre.cotisationsSociales * 0.5) < 0.01 && Math.abs(resMicroAcre.cfp - resMicroSansAcre.cfp) < 0.01, detail: [resMicroAcre, resMicroSansAcre] });

    const resMicroNul = getJSON(ctx, 'TnsEngine.calculerTNSMicro(0, TNS_BAREME_MICRO_DEFAUT.vente, {})');
    results.push({ name: 'Micro, CA nul : aucune cotisation, aucun NaN', pass: resMicroNul.total === 0 && Number.isFinite(resMicroNul.total), detail: resMicroNul });
  }

  // ── 5. Stockage et cycle de vie d'un enregistrement TNS ─────────────────
  {
    runIn(ctx, `
      localStorage.clear();
      var __t1 = creerTnsVierge();
      saveTns(__t1);
    `);
    const stored = getJSON(ctx, 'loadTnsStore()');
    results.push({ name: 'saveTns() persiste le calcul dans localStorage', pass: Object.keys(stored).length === 1, detail: Object.keys(stored) });
    const listed = getJSON(ctx, 'listTns()');
    results.push({ name: 'listTns() retrouve le calcul sauvegardé', pass: listed.length === 1 && listed[0].regime === 'reel_commercant', detail: listed });
    runIn(ctx, `deleteTnsById(__t1.id);`);
    const afterDelete = getJSON(ctx, 'listTns()');
    results.push({ name: 'deleteTnsById() supprime bien le calcul', pass: afterDelete.length === 0, detail: afterDelete });
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
