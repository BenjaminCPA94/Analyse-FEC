'use strict';
/**
 * Tests de la Phase 3 de l'audit demandé : comptes "mixtes" (classe 4
 * principalement, cf. MIXED_ROUTES) dont l'affectation actif/passif
 * dépend du signe réel du solde. LIMITE CONNUE déjà documentée dans
 * addExerciceToActiveDossier() : un compte mixte déjà classé sur un
 * exercice reste sur le même poste même si son solde change de signe sur
 * un autre exercice du même dossier (mapping partagé entre exercices),
 * car autoAffectOrphans() ne réévalue que les comptes jamais encore
 * classés ("orphelins").
 *
 * Conformément à la règle impérative n°8 de la demande ("ne pas inventer
 * de règle incertaine, prévoir une alerte claire"), le correctif ne
 * déplace JAMAIS un compte automatiquement et silencieusement : il
 * détecte l'incohérence (detecterComptesMixtesIncoherents()) et laisse à
 * l'utilisateur le geste explicite de réaffecter (reaffecterCompteMixte()
 * / reaffecterTousComptesMixtes()), via un bandeau sur la page Bilan.
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function run(htmlPath) {
  const results = [];

  // ── 1. Détection : compte 411 (client) classé en Actif mais désormais créditeur ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      ACTIVE = { id: 'd1', name: 'Test', type: 'reporting',
        bal: { '411000': -500 }, // créditeur (avance client) sur l'exercice affiché
        libs: { '411000': 'Client Dupont' },
        mps: { cr: [], bilan: defaultMPS_Bilan({ '411000': -500 }) },
      };
      // Simule le classement hérité d'un exercice précédent où 411000 était débiteur (Actif, ba6_a)
      const g = ACTIVE.mps.bilan.find(g => g.id === 'ba6');
      const sub = g.subs.find(s => s.id === 'ba6_a');
      sub.accounts.push('411000');
    `);
    const incoherents = getJSON(ctx, 'detecterComptesMixtesIncoherents()');
    results.push({
      name: "detecterComptesMixtesIncoherents() détecte le compte 411000 classé en Actif alors qu'il est créditeur sur l'exercice affiché",
      pass: incoherents.length === 1 && incoherents[0].compte === '411000' && incoherents[0].attendu.gid === 'bp7',
      detail: incoherents,
    });
  }

  // ── 2. Aucune incohérence quand le classement correspond déjà au signe ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      ACTIVE = { id: 'd1', name: 'Test', type: 'reporting',
        bal: { '411000': 500 }, // débiteur normal
        libs: {},
        mps: { cr: [], bilan: defaultMPS_Bilan({ '411000': 500 }) },
      };
      autoAffectOrphans();
    `);
    const incoherents = getJSON(ctx, 'detecterComptesMixtesIncoherents()');
    results.push({
      name: "Aucune incohérence signalée quand autoAffectOrphans() a classé le compte selon son signe actuel",
      pass: incoherents.length === 0,
      detail: incoherents,
    });
  }

  // ── 3. Compte non mixte (ex. 512 banque) jamais signalé ─────────────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      ACTIVE = { id: 'd1', name: 'Test', type: 'reporting',
        bal: { '512000': -100 },
        libs: {},
        mps: { cr: [], bilan: defaultMPS_Bilan({ '512000': -100 }) },
      };
    `);
    const incoherents = getJSON(ctx, 'detecterComptesMixtesIncoherents()');
    results.push({ name: "Un compte hors MIXED_ROUTES (512, banque) n'est jamais signalé, même à découvert", pass: incoherents.length === 0, detail: incoherents });
  }

  // ── 4. reaffecterCompteMixte() corrige un seul compte ────────────────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      document._elements.set('comptes-mixtes-alerte', document.createElement('div'));
      document._elements.set('bilan-equilibre', document.createElement('div'));
      document._elements.set('thead-actif', document.createElement('div'));
      document._elements.set('thead-passif', document.createElement('div'));
      ACTIVE = { id: 'd1', name: 'Test', type: 'reporting',
        bal: { '411000': -500 }, libs: {},
        mps: { cr: [], bilan: defaultMPS_Bilan({ '411000': -500 }) },
      };
      ACTIVE.mps.bilan.find(g => g.id === 'ba6').subs.find(s => s.id === 'ba6_a').accounts.push('411000');
      reaffecterCompteMixte('411000');
    `);
    const stillInActif = getJSON(ctx, `ACTIVE.mps.bilan.find(g => g.id === 'ba6').subs.find(s => s.id === 'ba6_a').accounts.includes('411000')`);
    const nowInPassif = getJSON(ctx, `ACTIVE.mps.bilan.find(g => g.id === 'bp7').subs.find(s => s.id === 'bp7_b').accounts.includes('411000')`);
    results.push({
      name: "reaffecterCompteMixte('411000') déplace le compte de l'Actif vers le Passif (bp7_b)",
      pass: !stillInActif && nowInPassif,
      detail: { stillInActif, nowInPassif },
    });
    const incoherentsAfter = getJSON(ctx, 'detecterComptesMixtesIncoherents()');
    results.push({ name: 'Après réaffectation, plus aucune incohérence détectée pour ce compte', pass: incoherentsAfter.length === 0, detail: incoherentsAfter });
  }

  // ── 5. reaffecterTousComptesMixtes() corrige tous les comptes en une fois ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      document._elements.set('comptes-mixtes-alerte', document.createElement('div'));
      document._elements.set('bilan-equilibre', document.createElement('div'));
      document._elements.set('thead-actif', document.createElement('div'));
      document._elements.set('thead-passif', document.createElement('div'));
      ACTIVE = { id: 'd1', name: 'Test', type: 'reporting',
        bal: { '411000': -500, '401000': 300 }, libs: {},
        mps: { cr: [], bilan: defaultMPS_Bilan({ '411000': -500, '401000': 300 }) },
      };
      // 411000 (client) forcé en Actif alors que créditeur ; 401000 (fournisseur) forcé en Passif alors que débiteur
      ACTIVE.mps.bilan.find(g => g.id === 'ba6').subs.find(s => s.id === 'ba6_a').accounts.push('411000');
      ACTIVE.mps.bilan.find(g => g.id === 'bp5').subs.find(s => s.id === 'bp5_a').accounts.push('401000');
      reaffecterTousComptesMixtes();
    `);
    const incoherentsAfter = getJSON(ctx, 'detecterComptesMixtesIncoherents()');
    results.push({ name: 'reaffecterTousComptesMixtes() corrige tous les comptes incohérents en un seul appel', pass: incoherentsAfter.length === 0, detail: incoherentsAfter });
  }

  // ── 6. renderComptesMixtesAlerte() : bandeau non intrusif, échappement HTML ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      document._elements.set('comptes-mixtes-alerte', document.createElement('div'));
      ACTIVE = { id: 'd1', name: 'Test', type: 'reporting',
        bal: { '411000': -500 }, libs: { '411000': '<script>alert(1)</script>' },
        mps: { cr: [], bilan: defaultMPS_Bilan({ '411000': -500 }) },
      };
      ACTIVE.mps.bilan.find(g => g.id === 'ba6').subs.find(s => s.id === 'ba6_a').accounts.push('411000');
      renderComptesMixtesAlerte();
    `);
    const html = runIn(ctx, "document._elements.get('comptes-mixtes-alerte').innerHTML");
    results.push({ name: 'renderComptesMixtesAlerte() affiche un bandeau mentionnant le compte incohérent', pass: html.includes('411000') && html.includes('Réaffecter'), detail: html.slice(0, 200) });
    results.push({ name: "renderComptesMixtesAlerte() échappe le libellé de compte (pas d'injection HTML)", pass: !html.includes('<script>alert'), detail: html });

    runIn(ctx, `ACTIVE.bal['411000'] = 500; reaffecterCompteMixte('411000'); renderComptesMixtesAlerte();`);
    const htmlClean = runIn(ctx, "document._elements.get('comptes-mixtes-alerte').innerHTML");
    results.push({ name: 'renderComptesMixtesAlerte() reste vide quand aucune incohérence ne subsiste', pass: htmlClean === '', detail: htmlClean });
  }

  // ── 7. Scénario bout en bout : ajout d'un 2e exercice avec signe inversé ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      document._elements.set('comptes-mixtes-alerte', document.createElement('div'));
      document._elements.set('bilan-equilibre', document.createElement('div'));
      document._elements.set('thead-actif', document.createElement('div'));
      document._elements.set('thead-passif', document.createElement('div'));
      ACTIVE = { id: 'd1', name: 'Test', type: 'reporting', exercices: {},
        bal: { '411000': 1000 }, libs: {},
        mps: { cr: [], bilan: defaultMPS_Bilan({ '411000': 1000 }) },
      };
      autoAffectOrphans(); // Exercice 1 : 411000 débiteur → classé en Actif (comportement normal)
    `);
    const afterEx1 = getJSON(ctx, `ACTIVE.mps.bilan.find(g => g.id === 'ba6').subs.find(s => s.id === 'ba6_a').accounts.includes('411000')`);
    results.push({ name: "Exercice 1 : le compte 411000 (débiteur) est bien classé en Actif par autoAffectOrphans()", pass: afterEx1 });

    // Exercice 2 ajouté au même dossier (addExerciceToActiveDossier) : le solde s'inverse (créditeur).
    runIn(ctx, `
      addExerciceToActiveDossier({ bal: { '411000': -800 }, libs: {}, months: {}, nbLines: 1, periodStart: '202601', periodEnd: '202612', ledger: {} }, 'ex2.txt');
    `);
    const incoherentsEx2 = getJSON(ctx, 'detecterComptesMixtesIncoherents()');
    results.push({
      name: "Exercice 2 (solde inversé) : le compte reste sur son ancien classement (Actif) et l'incohérence est détectée — reproduit la LIMITE CONNUE documentée",
      pass: incoherentsEx2.length === 1 && incoherentsEx2[0].compte === '411000',
      detail: incoherentsEx2,
    });
    runIn(ctx, `reaffecterTousComptesMixtes();`);
    const nowInPassifEx2 = getJSON(ctx, `ACTIVE.mps.bilan.find(g => g.id === 'bp7').subs.find(s => s.id === 'bp7_b').accounts.includes('411000')`);
    results.push({ name: "L'utilisateur peut corriger explicitement (reaffecterTousComptesMixtes()) sans que la correction ne soit jamais silencieuse/automatique", pass: nowInPassifEx2 });
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
