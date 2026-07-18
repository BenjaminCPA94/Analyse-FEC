'use strict';
/**
 * Test statique — aucun id HTML ne doit être dupliqué dans le document.
 * cf. AUDIT_CORRECTIONS.md, correctif critique "identifiants HTML
 * dupliqués".
 *
 * AVANT correctif : 7 ids étaient dupliqués (params-overlay,
 * params-dossier-title, params-name-input, ptab-parametres,
 * ptab-mapping, ppanel-parametres, ppanel-mapping) entre la modale
 * "Paramètres" accessible depuis l'icône ⚙ d'une carte sur l'écran
 * d'accueil et l'onglet "Paramètres" du dossier ouvert. Conséquence
 * concrète (pas seulement théorique) : document.getElementById()
 * résout toujours le PREMIER élément — le changement d'onglet Mapping/
 * Paramètres et la synchronisation du nom du dossier échouaient
 * silencieusement dans l'un des deux écrans selon lequel apparaissait
 * en premier dans le document.
 */
const fs = require('fs');
const path = require('path');

function run(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const results = [];

  // Extrait tous les attributs id="..." du document (hors <script>, où
  // "id" peut apparaître dans des chaînes de code sans rapport avec le DOM).
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const ids = [...withoutScripts.matchAll(/\bid="([^"]*)"/g)].map(m => m[1]);

  const counts = {};
  ids.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  const duplicates = Object.entries(counts).filter(([, n]) => n > 1);

  results.push({
    name: `Aucun id HTML dupliqué dans le document (${ids.length} ids au total)`,
    pass: duplicates.length === 0,
    detail: duplicates,
  });

  // Garde spécifique contre une régression des 7 ids identifiés dans l'audit.
  const previouslyDuplicated = [
    'params-overlay', 'params-dossier-title', 'params-name-input',
    'ptab-parametres', 'ptab-mapping', 'ppanel-parametres', 'ppanel-mapping',
  ];
  previouslyDuplicated.forEach(id => {
    results.push({
      name: `L'id "${id}" (dupliqué avant correctif) n'apparaît plus qu'une seule fois`,
      pass: (counts[id] || 0) <= 1,
      detail: counts[id],
    });
  });

  // Les deux écrans "Paramètres" doivent chacun conserver leur jeu d'ids
  // propre et fonctionnel (aucun des deux n'a été supprimé par erreur).
  results.push({
    name: 'La modale "Paramètres" (icône ⚙, écran d\'accueil) conserve ses ids réels (params-overlay, params-name-input, params-dossier-title, ptab-parametres, ptab-mapping, ppanel-parametres, ppanel-mapping)',
    pass: ['params-overlay', 'params-name-input', 'params-dossier-title', 'ptab-parametres', 'ptab-mapping', 'ppanel-parametres', 'ppanel-mapping'].every(id => (counts[id] || 0) === 1),
  });
  results.push({
    name: 'L\'onglet "Paramètres" du dossier ouvert (#module-params) a bien ses propres ids suffixés -module',
    pass: ['params-name-input-module', 'params-dossier-title-module', 'ptab-parametres-module', 'ptab-mapping-module', 'ppanel-parametres-module', 'ppanel-mapping-module'].every(id => (counts[id] || 0) === 1),
  });

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
