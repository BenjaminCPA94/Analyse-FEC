'use strict';
/**
 * Tests du système de caisses paramétrables du module TNS
 * (TNS_CAISSES_DEFAUT, TnsEngine.calculerCotisationsCaisse,
 * chargerCaissesEffectives/sauvegarderCaisseOverride/reinitialiserCaisseOverride).
 * Cf. FEC_Analyse_v6.html, sections "MODULE TNS — CAISSES PARAMÉTRABLES" et
 * "MODULE TNS — PARAMÉTRAGE DES CAISSES". Couvre les deux modes de calcul
 * (tranches %/PASS et classes forfaitaires), la CSG scindée déductible/non
 * déductible, la non-régression avec le régime commerçant historique, les
 * caisses "à paramétrer" (montants à 0, ne doivent jamais planter), et la
 * persistance des surcharges utilisateur (localStorage) avec réinitialisation.
 */
const { loadApp, getJSON } = require('./harness.js');

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const results = [];
  const push = (name, pass, detail) => results.push({ name, pass, detail });
  const close = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 1 : eps);

  // ── 1. Catalogue — structure et exhaustivité ──────────────────────────
  {
    const ids = getJSON(ctx, 'Object.keys(TNS_CAISSES_DEFAUT)');
    push('TNS_CAISSES_DEFAUT contient les 16 caisses attendues', ids.length === 16, ids);
    const attendues = ['ava_artisan', 'organic_commercant', 'carcdsf_dentiste', 'carcdsf_sage_femme', 'carmf_medecin',
      'carpimko_aux_medical', 'carpv_veterinaire', 'cavec_expert_comptable', 'cavp_pharmacien', 'cavp_biologiste',
      'cipav_liberal', 'cnbf_avocat', 'crn_notaire', 'cavamac_agent_assurance', 'cavom_officier_ministeriel', 'msa'];
    const toutesPresentes = attendues.every(id => ids.includes(id));
    push('Toutes les caisses des captures utilisateur sont présentes', toutesPresentes, { attendues, ids });

    const modes = getJSON(ctx, 'Object.fromEntries(Object.entries(TNS_CAISSES_DEFAUT).map(([id,c]) => [id, c.mode]))');
    push('AVA/ORGANIC/CIPAV en mode tranches (barèmes réels réutilisés)', modes.ava_artisan === 'tranches' && modes.organic_commercant === 'tranches' && modes.cipav_liberal === 'tranches', modes);
    push('CNBF en mode classes (cotisation forfaitaire par classe)', modes.cnbf_avocat === 'classes', modes.cnbf_avocat);

    const cnbfClasses = getJSON(ctx, 'TNS_CAISSES_DEFAUT.cnbf_avocat.postesClasses.retraiteBase.classes.map(c => c.code)');
    push('CNBF retraiteBase a bien les 8 classes des captures (plafond, classe1..4, 2+/3+/4-T5)', cnbfClasses.length === 8, cnbfClasses);
  }

  // ── 2. Non-duplication : AVA/ORGANIC/CIPAV réutilisent les barèmes réels existants ─
  {
    const memeCommercant = getJSON(ctx, `JSON.stringify(TNS_CAISSES_DEFAUT.ava_artisan.lignes) === JSON.stringify(TNS_BAREME_REEL_DEFAUT.commercant.tranches)`);
    push('AVA-Artisan réutilise TNS_BAREME_REEL_DEFAUT.commercant (mêmes valeurs, pas de duplication divergente)', memeCommercant === true, memeCommercant);
    const memeLiberal = getJSON(ctx, `JSON.stringify(TNS_CAISSES_DEFAUT.cipav_liberal.lignes) === JSON.stringify(TNS_BAREME_REEL_DEFAUT.liberal.tranches)`);
    push('CIPAV-Libéral réutilise TNS_BAREME_REEL_DEFAUT.liberal', memeLiberal === true, memeLiberal);
  }

  // ── 3. calculerCotisationsCaisse — mode tranches, parité avec calculerTNSReel ─
  {
    ctx.__pass = 47100;
    const viaCaisse = getJSON(ctx, `TnsEngine.calculerCotisationsCaisse(TNS_CAISSES_DEFAUT.ava_artisan, 40000, {}, __pass, {})`);
    const viaAncien = getJSON(ctx, `TnsEngine.calculerTNSReel(40000, baremeReelAvecPass(TNS_BAREME_REEL_DEFAUT.commercant, __pass), {})`);
    push('Mode tranches : total plausible (mêmes postes que le régime commerçant historique)', viaCaisse.total > 0 && viaCaisse.total < 40000, viaCaisse.total);
    push('Mode tranches : mêmes postes hors CSG que calculerTNSReel (retraiteBase identique)', close(viaCaisse.retraiteBase, viaAncien.retraiteBase, 0.01), { caisse: viaCaisse.retraiteBase, ancien: viaAncien.retraiteBase });
    push('Mode tranches : CSG scindée déductible/non déductible ≈ ancien taux fusionné 9.7%', close(viaCaisse.csgDeductible + viaCaisse.csgNonDeductible, viaCaisse.baseCSG * 0.097, 1), { d: viaCaisse.csgDeductible, nd: viaCaisse.csgNonDeductible, base: viaCaisse.baseCSG });
    push('Mode tranches : revenuNet = revenu - total', close(viaCaisse.revenuNet, 40000 - viaCaisse.total, 0.01), viaCaisse);
  }

  // ── 4. calculerCotisationsCaisse — mode classes, choix de classe ──────
  {
    ctx.__caisseTest = {
      code: 'TEST', label: 'Caisse test', mode: 'classes',
      postesClasses: {
        retraiteBase: { classes: [{ code: 'c1', label: 'Classe 1', montant: 1500 }, { code: 'c2', label: 'Classe 2', montant: 3000 }], classeParDefaut: 'c1' },
        formationPro: { classes: [{ code: 'unique', label: 'Cotisation', montant: 50 }], classeParDefaut: 'unique' },
      },
      csgDeductibleTaux: 0.068, csgNonDeductibleTaux: 0.029,
    };
    const resDefaut = getJSON(ctx, `TnsEngine.calculerCotisationsCaisse(__caisseTest, 60000, {}, __pass, {})`);
    push('Mode classes : classe par défaut retenue (1500)', close(resDefaut.retraiteBase, 1500, 0.01), resDefaut.retraiteBase);
    const resChoisi = getJSON(ctx, `TnsEngine.calculerCotisationsCaisse(__caisseTest, 60000, { retraiteBase: 'c2' }, __pass, {})`);
    push('Mode classes : classe explicitement choisie (3000)', close(resChoisi.retraiteBase, 3000, 0.01), resChoisi.retraiteBase);
    push('Mode classes : baseCSG = revenu + total forfaitaire', close(resDefaut.baseCSG, 60000 + 1500 + 50, 0.01), resDefaut.baseCSG);
  }

  // ── 5. ACRE réduit les postes (tranches et classes) ────────────────────
  {
    const sansAcre = getJSON(ctx, `TnsEngine.calculerCotisationsCaisse(TNS_CAISSES_DEFAUT.ava_artisan, 40000, {}, __pass, {})`);
    const avecAcre = getJSON(ctx, `TnsEngine.calculerCotisationsCaisse(TNS_CAISSES_DEFAUT.ava_artisan, 40000, {}, __pass, { acre: true })`);
    push('ACRE (taux par défaut 50%) réduit le total de moitié', close(avecAcre.total, sansAcre.total * 0.5, 0.5), { sansAcre: sansAcre.total, avecAcre: avecAcre.total });
  }

  // ── 6. Caisses "à paramétrer" (montants à 0) ne cassent jamais le calcul ─
  {
    const idsAParametrer = getJSON(ctx, `Object.entries(TNS_CAISSES_DEFAUT).filter(([,c]) => c.aParametrer).map(([id]) => id)`);
    push('Au moins 11 caisses marquées "à paramétrer" (données non vérifiables sans accès réseau)', idsAParametrer.length >= 11, idsAParametrer.length);
    for (const id of idsAParametrer.slice(0, 3)) {
      ctx.__idTest = id;
      const res = getJSON(ctx, `TnsEngine.calculerCotisationsCaisse(TNS_CAISSES_DEFAUT[__idTest], 40000, {}, __pass, {})`);
      push(`Caisse "à paramétrer" (${id}) : total = 0, pas de NaN/exception`, res.total === 0 && Number.isFinite(res.revenuNet), res);
    }
  }

  // ── 7. Persistance des surcharges (paramétrage utilisateur) ───────────
  {
    // Nettoie un éventuel état résiduel puis vérifie le cycle complet override -> reset
    getJSON(ctx, `(() => { localStorage.removeItem(TNS_CAISSES_STORE_KEY); return true; })()`);
    const avantOverride = getJSON(ctx, `chargerCaissesEffectives().ava_artisan.csgDeductibleTaux`);
    push('Avant surcharge : caisse effective = valeur par défaut (0.068)', close(avantOverride, 0.068, 0.0001), avantOverride);

    getJSON(ctx, `(() => {
      const c = JSON.parse(JSON.stringify(TNS_CAISSES_DEFAUT.ava_artisan));
      c.csgDeductibleTaux = 0.10;
      sauvegarderCaisseOverride('ava_artisan', c);
      return true;
    })()`);
    const apresOverride = getJSON(ctx, `chargerCaissesEffectives().ava_artisan.csgDeductibleTaux`);
    push('Après surcharge enregistrée : caisse effective reflète la modification (0.10)', close(apresOverride, 0.10, 0.0001), apresOverride);

    const defautInchange = getJSON(ctx, `TNS_CAISSES_DEFAUT.ava_artisan.csgDeductibleTaux`);
    push('Le catalogue par défaut TNS_CAISSES_DEFAUT reste inchangé (jamais muté directement)', close(defautInchange, 0.068, 0.0001), defautInchange);

    getJSON(ctx, `(() => { reinitialiserCaisseOverride('ava_artisan'); return true; })()`);
    const apresReset = getJSON(ctx, `chargerCaissesEffectives().ava_artisan.csgDeductibleTaux`);
    push('Après réinitialisation : caisse effective revient à la valeur par défaut', close(apresReset, 0.068, 0.0001), apresReset);
  }

  // ── 8. Enregistrement TNS avec regime "caisse" — champs du dossier ────
  {
    const vierge = getJSON(ctx, `creerTnsVierge()`);
    push('creerTnsVierge() initialise caisseId et classesChoisies', vierge.caisseId === 'ava_artisan' && typeof vierge.classesChoisies === 'object', vierge);
  }

  return results;
}

module.exports = { run };
