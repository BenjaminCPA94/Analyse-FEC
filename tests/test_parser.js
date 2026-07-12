'use strict';
/**
 * Tests de robustesse du parseur FEC — cf. brief Phase 3, point 5, et
 * AUDIT.md §(f).
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const results = [];

  // 1. Séparateur '|' (au lieu de tabulation)
  {
    const fec = [
      'JournalCode|EcritureDate|CompteNum|CompteLib|EcritureLib|Debit|Credit',
      'VE|20240115|707|Ventes|Vente 1|0,00|1000,00',
      'AC|20240110|607|Achats|Achat 1|400,00|0,00',
    ].join('\n');
    const parsed = getJSON(ctx, `parseFECFile(${JSON.stringify(fec)})`);
    results.push({
      name: "Séparateur '|' reconnu",
      pass: !!parsed && parsed.bal['707'] === 1000 && parsed.bal['607'] === 400,
      detail: parsed && parsed.bal,
    });
  }

  // 2. Colonnes dans un ordre différent (Credit avant Debit, Compte après le libellé)
  {
    const fec = [
      'EcritureDate\tCompteLib\tCompteNum\tCredit\tDebit\tJournalCode\tEcritureLib',
      '20240115\tVentes\t707\t1000,00\t0,00\tVE\tVente 1',
      '20240110\tAchats\t607\t0,00\t400,00\tAC\tAchat 1',
    ].join('\n');
    const parsed = getJSON(ctx, `parseFECFile(${JSON.stringify(fec)})`);
    results.push({
      name: 'Colonnes permutées résolues par nom d\'en-tête',
      pass: !!parsed && parsed.bal['707'] === 1000 && parsed.bal['607'] === 400,
      detail: parsed && parsed.bal,
    });
  }

  // 3. Montants avec séparateur de milliers espace + virgule décimale
  {
    const fec = [
      'JournalCode\tEcritureDate\tCompteNum\tCompteLib\tEcritureLib\tDebit\tCredit',
      'VE\t20240115\t707\tVentes\tVente 1\t0,00\t1 234,56',
    ].join('\n');
    const parsed = getJSON(ctx, `parseFECFile(${JSON.stringify(fec)})`);
    results.push({
      name: "Montant '1 234,56' correctement interprété (1234.56)",
      pass: !!parsed && Math.abs(parsed.bal['707'] - 1234.56) < 1e-9,
      detail: parsed && parsed.bal,
    });
  }

  // 4. À-Nouveaux : exclus des classes 6-7, inclus classes 1-5
  {
    const fec = [
      'JournalCode\tEcritureDate\tCompteNum\tCompteLib\tEcritureLib\tDebit\tCredit',
      'AN\t20240101\t411\tClients\tA-nouveau\t500,00\t0,00',
      'AN\t20240101\t707\tVentes\tA-nouveau\t0,00\t9999,00',
      'VE\t20240115\t707\tVentes\tVente normale\t0,00\t1000,00',
    ].join('\n');
    const parsed = getJSON(ctx, `parseFECFile(${JSON.stringify(fec)})`);
    results.push({
      name: 'AN inclus en classe 1-5 (bilan)',
      pass: !!parsed && parsed.bal['411'] === 500,
      detail: parsed && parsed.bal['411'],
    });
    results.push({
      name: 'AN exclu des classes 6-7 (CR) — seule la vente normale compte',
      pass: !!parsed && parsed.bal['707'] === 1000,
      detail: parsed && parsed.bal['707'],
    });
  }

  // 5. Lignes vides / malformées ignorées sans plantage
  {
    const fec = [
      'JournalCode\tEcritureDate\tCompteNum\tCompteLib\tEcritureLib\tDebit\tCredit',
      'VE\t20240115\t707\tVentes\tVente 1\t0,00\t1000,00',
      '',
      'ligne malformée sans assez de colonnes',
      '   ',
      'AC\t20240110\t607\tAchats\tAchat 1\t400,00\t0,00',
    ].join('\n');
    let threw = false;
    let parsed = null;
    try {
      parsed = getJSON(ctx, `parseFECFile(${JSON.stringify(fec)})`);
    } catch (e) { threw = true; }
    results.push({
      name: 'Lignes vides/malformées ignorées sans exception',
      pass: !threw && !!parsed && parsed.bal['707'] === 1000 && parsed.bal['607'] === 400,
      detail: parsed && parsed.bal,
    });
  }

  // 6. Fichier trop court (< 2 lignes) → null, pas d'exception
  {
    const parsed = getJSON(ctx, `parseFECFile("JournalCode\\tCompteNum\\tDebit\\tCredit")`);
    results.push({
      name: 'FEC vide (en-tête seul) → null sans exception',
      pass: parsed === null,
      detail: parsed,
    });
  }

  return results;
}

if (require.main === module) {
  const htmlPath = process.argv[2] || path.join(__dirname, '..', 'FEC_Analyse_v5_code_complet.html');
  const results = run(htmlPath);
  let failed = 0;
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} — ${r.name}${r.pass ? '' : ' :: ' + JSON.stringify(r.detail)}`);
    if (!r.pass) failed++;
  }
  process.exit(failed ? 1 : 0);
}

module.exports = { run };
