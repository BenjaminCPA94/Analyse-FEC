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
