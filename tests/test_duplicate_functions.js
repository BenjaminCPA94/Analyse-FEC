'use strict';
/**
 * Test statique — aucune fonction globale (top-level) ne doit être
 * déclarée deux fois dans le script principal. cf.
 * AUDIT_CORRECTIONS.md, correctif critique "fonctions JavaScript
 * dupliquées".
 *
 * AVANT correctif : showAffecPanel() était déclarée deux fois. La
 * seconde déclaration (plus loin dans le fichier) écrasait
 * silencieusement la première au chargement du script — en JavaScript,
 * deux `function foo(){}` de même nom dans la même portée ne lèvent
 * aucune erreur, la dernière l'emporte simplement. La première
 * déclaration contenait le rafraîchissement du panneau "Comptes non
 * affectés" (setTimeout(renderOrphanPanel,0) au changement d'onglet
 * SIG/Bilan) ; la seconde, plus courte, ne l'avait pas — ce panneau ne
 * se rafraîchissait donc plus jamais en pratique.
 */
const fs = require('fs');
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

async function run(htmlPath) {
  const results = [];

  // ── 1. Analyse statique : aucune fonction top-level dupliquée ──────────
  {
    const { extractMainScript } = require('./harness.js');
    const src = extractMainScript(htmlPath);
    const re = /^function\s+([A-Za-z0-9_$]+)\s*\(/gm;
    const counts = {};
    let m;
    while ((m = re.exec(src))) { counts[m[1]] = (counts[m[1]] || 0) + 1; }
    const duplicates = Object.entries(counts).filter(([, n]) => n > 1);

    results.push({
      name: `Aucune fonction globale déclarée plusieurs fois (${Object.keys(counts).length} fonctions distinctes analysées)`,
      pass: duplicates.length === 0,
      detail: duplicates,
    });
    results.push({
      name: 'showAffecPanel() (dupliquée avant correctif) n\'est plus déclarée qu\'une seule fois',
      pass: (counts['showAffecPanel'] || 0) === 1,
      detail: counts['showAffecPanel'],
    });
  }

  // ── 2. Comportement réel : le panneau des comptes non affectés se ──────
  // rafraîchit bien au changement d'onglet SIG/Bilan (la régression que
  // la duplication provoquait silencieusement).
  {
    const ctx = loadApp(htmlPath);
    let orphanPanelCalls = 0;
    runIn(ctx, `
      ACTIVE.id = 'd1';
      ACTIVE.bal = { '707': -1000, '607': 400 };
      ACTIVE.libs = {};
      ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
      document._elements.set('affec-cr', document.createElement('div'));
      document._elements.set('affec-bilan', document.createElement('div'));
      window.__orphanCalls = 0;
      renderOrphanPanel = function(){ window.__orphanCalls++; };
      showAffecPanel('cr', null);
    `);
    // renderOrphanPanel() est appelée via setTimeout(...,0) — on laisse le
    // timer réel de Node s'exécuter avant de lire le compteur (setTimeout
    // du bac à sable est directement le setTimeout de Node, cf. harness.js).
    await new Promise(resolve => setTimeout(resolve, 20));
    const calls = runIn(ctx, 'window.__orphanCalls');
    results.push({
      name: 'showAffecPanel(\'cr\', ...) déclenche bien le rafraîchissement du panneau des comptes non affectés',
      pass: calls >= 1,
      detail: calls,
    });
  }

  return results;
}

if (require.main === module) {
  const htmlPath = process.argv[2] || path.join(__dirname, '..', 'FEC_Analyse_v6.html');
  Promise.resolve(run(htmlPath)).then(results => {
    let failed = 0;
    for (const r of results) {
      console.log(`${r.pass ? 'PASS' : 'FAIL'} — ${r.name}${r.pass ? '' : ' :: ' + JSON.stringify(r.detail)}`);
      if (!r.pass) failed++;
    }
    process.exit(failed ? 1 : 0);
  });
}

module.exports = { run };
