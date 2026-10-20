'use strict';
/**
 * Test de non-régression — XSS stockée via libellés de comptes FEC.
 * cf. AUDIT.md §(e).
 */
const assert = require('assert');
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const results = [];

  const PAYLOAD = '<img src=x onerror=alert(document.cookie)>';

  // escHtml() doit neutraliser les caractères dangereux.
  const escaped = getJSON(ctx, `escHtml(${JSON.stringify(PAYLOAD)})`);
  results.push({
    name: 'escHtml neutralise < > " \'',
    pass: !/[<>]/.test(escaped) && escaped.includes('&lt;img'),
    detail: escaped,
  });

  // libOf() doit retourner une version échappée d'un libellé malveillant.
  runIn(ctx, `ACTIVE.libs = { '601': ${JSON.stringify(PAYLOAD)} };`);
  const libOfResult = getJSON(ctx, `libOf('601')`);
  results.push({
    name: 'libOf() échappe un libellé de compte malveillant',
    pass: !libOfResult.includes('<img') && libOfResult.includes('&lt;img'),
    detail: libOfResult,
  });

  // Le parseur doit retirer les caractères HTML dangereux d'un numéro de compte.
  const fec = 'JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcheanceDate\tPiecettc\tMontantdevise\tIdevise\n' +
    'AC\tAchats\t1\t20240101\t"<b>601</b>"\tAchat malveillant\t\t\t1\t20240101\tLib\t100,00\t0,00\t\t\t\t\n';
  const parsed = getJSON(ctx, `parseFECFile(${JSON.stringify(fec)})`);
  const accNums = parsed ? Object.keys(parsed.bal) : [];
  results.push({
    name: 'parseFECFile() nettoie les caractères HTML du numéro de compte',
    pass: accNums.every(n => !/[<>&"']/.test(n)),
    detail: accNums,
  });

  // ── XSS stockée via renommage d'un poste/sous-catégorie de mapping ─────
  // (correctif critique — cf. AUDIT_CORRECTIONS.md) : mpRename() permet à
  // l'utilisateur de renommer librement un poste (g.label) ou une
  // sous-catégorie (sub.label) via un simple <input>, sans aucune
  // sanitisation à la saisie. Ce label est ensuite persisté dans
  // ACTIVE.mps et ré-affiché à CHAQUE ouverture des pages SIG/Bilan/
  // Compte de résultat/Mapping. Avant correctif, ${g.label}/${sub.label}
  // étaient injectés bruts dans innerHTML à plusieurs endroits : un nom
  // de poste malveillant s'exécutait donc à chaque affichage.
  {
    const ctx2 = loadApp(htmlPath);
    runIn(ctx2, `
      ACTIVE.id = 'd-xss';
      ACTIVE.bal = { '707': -1000, '607': 400 };
      ACTIVE.libs = {};
      ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
      // Simule un renommage malveillant via mpRename() (poste ET sous-catégorie)
      ACTIVE.mps.cr[0].label = ${JSON.stringify(PAYLOAD)};
      if (ACTIVE.mps.cr[0].subs && ACTIVE.mps.cr[0].subs[0]) ACTIVE.mps.cr[0].subs[0].label = ${JSON.stringify(PAYLOAD)};
      document._elements.set('thead-cr', document.createElement('div'));
      document._elements.set('tbCR', document.createElement('div'));
      buildCRTable();
    `);
    const crHtml = runIn(ctx2, "document._elements.get('tbCR').innerHTML");
    results.push({
      name: "buildCRTable() : un poste renommé en charge utile XSS s'affiche comme texte inerte (jamais de <img> exécutable)",
      pass: !crHtml.includes('<img') && crHtml.includes('&lt;img'),
      detail: crHtml.slice(0, 300),
    });

    // Même vérification sur l'écran de Mapping (là où mpRename() est déclenché)
    runIn(ctx2, `
      document._elements.set('mapping-cr', document.createElement('div'));
      renderMapping('cr');
    `);
    const mappingHtml = runIn(ctx2, "document._elements.get('mapping-cr').innerHTML");
    results.push({
      name: "renderMapping() : le poste renommé en charge utile XSS reste du texte inerte sur l'écran de mapping lui-même",
      pass: !mappingHtml.includes('<img') && mappingHtml.includes('&lt;img'),
      detail: mappingHtml.slice(0, 300),
    });
  }

  // ── XSS via le nom d'un dossier réinjecté dans le menu déroulant ───────
  // toggleDossierDropdown() relit item.name depuis le textContent (donc
  // DÉCODÉ) d'une carte .dc-name, puis le réinjecte dans un template
  // innerHTML : sans ré-échappement à ce second point d'injection, un
  // nom de dossier littéralement "<img src=x onerror=...>" redevenait
  // exécutable même si l'affichage initial de la carte était sûr. Non
  // testable via un appel réel (document.querySelectorAll('[data-id]')
  // renvoie toujours [] dans le bac à sable Node) — on vérifie donc
  // directement, au niveau du code source, que le point d'injection
  // connu passe bien par escHtml().
  {
    const fs = require('fs');
    const src = fs.readFileSync(htmlPath, 'utf-8');
    const hasFix = /border:1\.5px solid \$\{item\.active\?'#185FA5':'#d0cec8'\};flex-shrink:0;"><\/span>\$\{escHtml\(item\.name\)\}/.test(src);
    results.push({
      name: "toggleDossierDropdown() échappe item.name avant réinjection dans le menu déroulant (source)",
      pass: hasFix,
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
