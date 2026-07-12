'use strict';
/**
 * Test de non-régression — détection d'encodage FEC (UTF-8 / Latin-1).
 * cf. AUDIT.md §(f) : reader.readAsText(file,'latin1') forçait un
 * décodage Latin-1 systématique, corrompant tout FEC exporté en UTF-8.
 */
const path = require('path');
const { loadApp, runIn } = require('./harness.js');

function toBuffer(str, encoding) {
  return new Uint8Array(Buffer.from(str, encoding)).buffer;
}

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const results = [];

  // 1. UTF-8 avec BOM
  const withBom = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('Ventes de marchandises', 'utf-8')]);
  ctx.__b1 = new Uint8Array(withBom).buffer;
  const r1 = runIn(ctx, 'decodeFecBuffer(__b1)');
  results.push({ name: 'BOM UTF-8 détecté et retiré', pass: r1 === 'Ventes de marchandises', detail: r1 });

  // 2. UTF-8 sans BOM (cas fréquent des exports FEC récents)
  const utf8 = 'Achats de matières premières — Société Générale';
  ctx.__b2 = toBuffer(utf8, 'utf-8');
  const r2 = runIn(ctx, 'decodeFecBuffer(__b2)');
  results.push({ name: 'UTF-8 sans BOM décodé correctement (pas de mojibake)', pass: r2 === utf8, detail: r2 });

  // 3. Latin-1 / Windows-1252 (ancien export FEC)
  const latin1Str = 'Charges à répartir - clôture';
  ctx.__b3 = toBuffer(latin1Str, 'latin1');
  const r3 = runIn(ctx, 'decodeFecBuffer(__b3)');
  results.push({ name: 'Repli Windows-1252/Latin-1 quand UTF-8 invalide', pass: r3 === latin1Str, detail: r3 });

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
