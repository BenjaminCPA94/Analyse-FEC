'use strict';
/**
 * Tests du statut des barèmes créés par duplication (TNS caisses,
 * Rémunération dirigeant, IRPP) et du blocage des caisses TNS
 * incomplètes — cf. AUDIT_CORRECTIONS.md §7-8.
 *
 * AVANT correctif : anneeResolue() basculait silencieusement vers
 * l'année disponible la plus proche sans distinction "exact"/"repli" ni
 * statut de validation ; une caisse TNS non paramétrée (montants à 0)
 * produisait un résultat chiffré plausible au lieu d'un blocage.
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function run(htmlPath) {
  const results = [];

  // ── 1. creerMetaBareme() / baremeEstValide() ────────────────────────────
  {
    const ctx = loadApp(htmlPath);
    const meta = getJSON(ctx, `creerMetaBareme('Copié depuis 2025')`);
    results.push({ name: 'creerMetaBareme() crée toujours un barème en statut "draft" (jamais validé par défaut)', pass: meta.statut === 'draft', detail: meta });
    results.push({ name: 'creerMetaBareme() horodate réellement (creeLe présent, format ISO)', pass: typeof meta.creeLe === 'string' && !isNaN(Date.parse(meta.creeLe)) });
    results.push({ name: "creerMetaBareme() ne fabrique jamais d'auteur (chaîne vide, pas de nom inventé)", pass: meta.auteur === '' });
    results.push({ name: 'creerMetaBareme() conserve la source fournie', pass: meta.source === 'Copié depuis 2025' });

    results.push({ name: 'baremeEstValide(null) = true (barème historique fourni par l\'application)', pass: getJSON(ctx, 'baremeEstValide(null)') === true });
    results.push({ name: 'baremeEstValide({statut:"draft"}) = false', pass: getJSON(ctx, `baremeEstValide({statut:'draft'})`) === false });
    results.push({ name: 'baremeEstValide({statut:"validated"}) = true', pass: getJSON(ctx, `baremeEstValide({statut:'validated'})`) === true });

    const bannerDraft = getJSON(ctx, `baremeAvertissementHtml({statut:'draft', source:'x', creeLe: new Date().toISOString()}, {})`);
    results.push({ name: 'baremeAvertissementHtml() affiche un bandeau "non validé" pour un barème en draft', pass: bannerDraft.includes('non validé'), detail: bannerDraft });
    const bannerValide = getJSON(ctx, `baremeAvertissementHtml(null, {})`);
    results.push({ name: "baremeAvertissementHtml() n'affiche rien pour un barème validé/historique sans repli d'année", pass: bannerValide === '' });
    const bannerRepli = getJSON(ctx, `baremeAvertissementHtml(null, {anneeDemandee: 2026, anneeUtilisee: 2025})`);
    results.push({ name: "baremeAvertissementHtml() signale un repli d'année même si le barème utilisé est validé", pass: bannerRepli.includes('2026') && bannerRepli.includes('2025'), detail: bannerRepli });
  }

  // ── 2. TNS caisses : dupliquer -> draft -> valider ──────────────────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `tnsDupliquerAnneeCaisses(2025, 2099);`);
    const meta1 = getJSON(ctx, `chargerCaissesEffectives(2099).meta`);
    results.push({ name: 'tnsDupliquerAnneeCaisses() marque le nouveau barème "draft"', pass: meta1 && meta1.statut === 'draft', detail: meta1 });
    runIn(ctx, `tnsValiderAnneeCaisses(2099);`);
    const meta2 = getJSON(ctx, `chargerCaissesEffectives(2099).meta`);
    results.push({ name: 'tnsValiderAnneeCaisses() passe le statut à "validated"', pass: meta2 && meta2.statut === 'validated', detail: meta2 });
    const anneeUtilisee = getJSON(ctx, `chargerCaissesEffectives(2099).anneeUtilisee`);
    results.push({ name: 'chargerCaissesEffectives(2099) résout bien sur 2099 (pas de repli, année dupliquée)', pass: anneeUtilisee === 2099 });
  }

  // ── 3. Rémunération : dupliquer -> draft -> valider ─────────────────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `rmDupliquerAnnee(2025, 2099);`);
    const meta1 = getJSON(ctx, `chargerReglesRemunerationEffectives(2099).meta`);
    results.push({ name: 'rmDupliquerAnnee() marque le nouveau barème "draft"', pass: meta1 && meta1.statut === 'draft', detail: meta1 });
    runIn(ctx, `rmValiderAnnee(2099);`);
    const meta2 = getJSON(ctx, `chargerReglesRemunerationEffectives(2099).meta`);
    results.push({ name: 'rmValiderAnnee() passe le statut à "validated"', pass: meta2 && meta2.statut === 'validated', detail: meta2 });
  }

  // ── 4. IRPP : dupliquer -> draft -> valider + héritage du statut Rémunération ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `irDupliquerAnnee(2025, 2099);`);
    const meta1 = getJSON(ctx, `chargerReglesIrppEffectives(2099).meta`);
    results.push({ name: 'irDupliquerAnnee() marque le nouveau barème IRPP "draft"', pass: meta1 && meta1.statut === 'draft', detail: meta1 });
    runIn(ctx, `irValiderAnnee(2099);`);
    const meta2 = getJSON(ctx, `chargerReglesIrppEffectives(2099).meta`);
    results.push({ name: 'irValiderAnnee() passe le statut IRPP à "validated"', pass: meta2 && meta2.statut === 'validated', detail: meta2 });

    // Si le barème Rémunération sous-jacent (dont l'IRPP emprunte les tranches)
    // n'est pas validé, l'IRPP doit hériter de cette réserve.
    const ctx2 = loadApp(htmlPath);
    runIn(ctx2, `rmDupliquerAnnee(2025, 2098); irDupliquerAnnee(2025, 2098); irValiderAnnee(2098);`);
    const metaHeritee = getJSON(ctx2, `chargerReglesIrppEffectives(2098).meta`);
    results.push({
      name: "IRPP hérite du statut non validé de la Rémunération sous-jacente même si sa propre surcharge IRPP est validée",
      pass: metaHeritee && metaHeritee.statut === 'draft',
      detail: metaHeritee,
    });
  }

  // ── 5. Caisses TNS incomplètes : validerCompletudeCaisse() ──────────────
  {
    const ctx = loadApp(htmlPath);
    const completAva = getJSON(ctx, `validerCompletudeCaisse(TNS_CAISSES_DEFAUT.ava_artisan)`);
    results.push({ name: 'validerCompletudeCaisse() : AVA-Artisan (barème réel vérifié) est complet', pass: completAva.complete === true, detail: completAva });

    const completCarmf = getJSON(ctx, `validerCompletudeCaisse(TNS_CAISSES_DEFAUT.carmf_medecin)`);
    results.push({ name: 'validerCompletudeCaisse() : CARMF (non vérifiée, aParametrer) est incomplète', pass: completCarmf.complete === false && completCarmf.manquants.length > 0, detail: completCarmf });

    // Un taux réellement à 0 (explicitement renseigné) ne doit PAS être signalé comme manquant.
    const zeroExplicite = getJSON(ctx, `(() => {
      const c = JSON.parse(JSON.stringify(TNS_CAISSES_DEFAUT.carmf_medecin));
      Object.values(c.postesClasses).forEach(p => p.classes.forEach(cl => cl.montant = 0));
      c.csgDeductibleTaux = 0; c.csgNonDeductibleTaux = 0;
      return validerCompletudeCaisse(c);
    })()`);
    results.push({ name: 'validerCompletudeCaisse() : un taux à 0 explicitement renseigné (pas null) est accepté, jamais signalé comme manquant', pass: zeroExplicite.complete === true, detail: zeroExplicite });
  }

  // ── 6. renderTns() bloque réellement le calcul pour une caisse incomplète ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      TNS_ACTIVE = creerTnsVierge();
      TNS_ACTIVE.regime = 'caisse';
      TNS_ACTIVE.caisseId = 'carmf_medecin';
      TNS_ACTIVE.revenu = 80000;
      document._elements.set('tns-content', document.createElement('div'));
      document._elements.set('tns-name-input', document.createElement('input'));
      renderTns();
    `);
    const html = runIn(ctx, "document._elements.get('tns-content').innerHTML");
    results.push({
      name: 'renderTns() affiche "Calcul bloqué" pour une caisse incomplète (CARMF, non paramétrée)',
      pass: html.includes('Calcul bloqué'),
      detail: html.slice(0, 300),
    });
    results.push({
      name: "renderTns() n'affiche PAS de tableau de résultat chiffré (\"Total cotisations\") quand le calcul est bloqué",
      pass: !html.includes('Total cotisations'),
      detail: html.includes('Total cotisations'),
    });

    // Une caisse complète (AVA-Artisan) doit continuer à produire un résultat normalement.
    runIn(ctx, `
      TNS_ACTIVE.caisseId = 'ava_artisan';
      renderTns();
    `);
    const htmlOk = runIn(ctx, "document._elements.get('tns-content').innerHTML");
    results.push({
      name: 'renderTns() calcule normalement pour une caisse complète (AVA-Artisan) — non-régression',
      pass: htmlOk.includes('Total cotisations') && !htmlOk.includes('Calcul bloqué'),
      detail: htmlOk.slice(0, 200),
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
