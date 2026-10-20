'use strict';
/**
 * Test de l'injection de formule CSV ("CSV Injection", OWASP) — cf.
 * AUDIT_CORRECTIONS.md, correctif critique.
 *
 * Excel, LibreOffice et Google Sheets interprètent comme une FORMULE
 * toute cellule d'un fichier CSV commençant par =, +, -, @ (ou une
 * tabulation/retour chariot). Comme tous les exports CSV de
 * l'application (SIG, Compte de résultat, Bilan, Prévisionnel, TNS,
 * Rémunération, IRPP) passent par la même fonction centrale
 * csvFromRows()/csvEscapeCell(), un seul correctif protège les 11
 * fonctions d'export existantes contre un libellé de compte, un nom de
 * dossier ou un commentaire malveillant qui déclencherait une formule
 * (ex. exfiltration de données via =HYPERLINK()) à l'ouverture du
 * fichier exporté.
 */
const path = require('path');
const { loadApp, getJSON } = require('./harness.js');

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const results = [];

  const DANGEROUS = [
    '=HYPERLINK("https://example.com")',
    '+1+1',
    '-2+3',
    '@SUM(A1:A2)',
  ];

  DANGEROUS.forEach(payload => {
    const safe = getJSON(ctx, `csvSafeValue(${JSON.stringify(payload)})`);
    results.push({
      name: `csvSafeValue() neutralise "${payload}" (préfixe une apostrophe, jamais interprété comme formule)`,
      pass: safe === "'" + payload && !/^[=+\-@]/.test(safe),
      detail: safe,
    });
  });

  // Une valeur "normale" (chiffre, texte, montant) ne doit JAMAIS être modifiée.
  ['Ventes de marchandises', '1234.56', 'Société Dupont', '-', ''].forEach(v => {
    const safe = getJSON(ctx, `csvSafeValue(${JSON.stringify(v)})`);
    // '-' seul est un cas limite volontairement neutralisé (commence par '-' : un
    // vrai texte "-" isolé est rarissime dans les libellés comptables, alors qu'un
    // payload "-2+3" doit être bloqué — la règle OWASP s'applique au premier caractère).
    if (v === '-') {
      results.push({ name: `csvSafeValue("-") neutralise aussi un simple tiret en tête (règle OWASP appliquée au 1er caractère, cas limite accepté)`, pass: safe === "'-" });
    } else {
      results.push({
        name: `csvSafeValue() ne modifie jamais une valeur normale : "${v}"`,
        pass: safe === v,
        detail: safe,
      });
    }
  });

  // csvEscapeCell() applique la neutralisation ET conserve l'échappement CSV standard.
  const withSemicolon = getJSON(ctx, `csvEscapeCell(${JSON.stringify('=HYPERLINK("x");malveillant')})`);
  results.push({
    name: 'csvEscapeCell() neutralise la formule ET échappe correctement le point-virgule/les guillemets internes',
    pass: withSemicolon.startsWith('"') && withSemicolon.includes("'=HYPERLINK") && withSemicolon.includes('""x""'),
    detail: withSemicolon,
  });

  // csvFromRows() (utilisée par les 11 fonctions d'export) neutralise bien un libellé
  // de compte malveillant au sein d'un tableau de lignes complet.
  const csvOut = getJSON(ctx, `csvFromRows([
    ['Poste', 'Compte', 'Libellé', 'Montant'],
    ['Achats', '607', ${JSON.stringify('=HYPERLINK("https://exfiltrate.example")')}, '100.00'],
  ])`);
  results.push({
    name: "csvFromRows() neutralise un libellé de compte malveillant dans un export réel (SIG/Bilan/CR/...)",
    pass: !/;=HYPERLINK|^=HYPERLINK/m.test(csvOut) && csvOut.includes("'=HYPERLINK"),
    detail: csvOut,
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
