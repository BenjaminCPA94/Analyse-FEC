'use strict';
/**
 * Test SIG (Soldes Intermédiaires de Gestion) — cf. brief Phase 3, point 6.
 * Mini-FEC construit à la main (tests/fixtures/mini_fec_sig.txt) dont
 * chaque sous-total est connu à l'euro près.
 *
 * Détail du calcul attendu :
 *   Marge commerciale = 707(10000) - 607(4000)              = 6000
 *   Production        = 706(20000)                          = 20000
 *   Conso. intermédiaires = -601(3000)                       = -3000
 *   VA    = 6000 + 20000 - 3000                              = 23000
 *   EBE   = VA - 631(500) - 641(8000)                        = 14500
 *   REX   = EBE - 6811(1000) + 758(200)                      = 13700
 *   RCAI  = REX - 661(300)                                    = 13400
 *   RN    = RCAI + 771(100) - 695(2000)                       = 11500
 */
const fs = require('fs');
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

const EXPECTED = {
  g_vmc: 6000,
  g_prod: 20000,
  g_va: 23000,
  g_ebe: 14500,
  g_rex: 13700,
  g_rcai: 13400,
  g_rn: 11500,
};

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const fec = fs.readFileSync(path.join(__dirname, 'fixtures', 'mini_fec_sig.txt'), 'utf-8');
  ctx.__fec = fec;
  runIn(ctx, `
    const parsed = parseFECFile(__fec);
    ACTIVE.id = 'sig-test';
    ACTIVE.bal = parsed.bal;
    ACTIVE.libs = parsed.libs;
    ACTIVE.mps = { cr: defaultMPS_CR(ACTIVE.bal), bilan: defaultMPS_Bilan(ACTIVE.bal) };
    autoAffectOrphans();
  `);

  const bal = getJSON(ctx, 'ACTIVE.bal');
  const cr = getJSON(ctx, 'ACTIVE.mps.cr');
  const plV = n => { const v = bal[n] || 0, cl = n[0]; if (cl === '7') return v; if (cl === '6') return -v; return 0; };
  const groupTotal = g => (g.accounts || []).reduce((s, n) => s + plV(n), 0)
    + (g.subs || []).reduce((s, sub) => s + (sub.accounts || []).reduce((s2, n) => s2 + plV(n), 0), 0);

  let running = 0;
  const actual = {};
  cr.forEach(g => {
    if (g.type === 'normal') {
      const gTotal = groupTotal(g);
      running += gTotal;
      if (g.id in EXPECTED) actual[g.id] = gTotal;
    } else {
      // subtotal / total : snapshot du running courant (ne s'ajoute pas à lui-même)
      if (g.id in EXPECTED) actual[g.id] = running;
    }
  });

  const results = [];
  for (const [gid, expected] of Object.entries(EXPECTED)) {
    results.push({
      name: `${gid} = ${expected} €`,
      pass: actual[gid] === expected,
      detail: `attendu ${expected}, obtenu ${actual[gid]}`,
    });
  }
  return results;
}

if (require.main === module) {
  const htmlPath = process.argv[2] || path.join(__dirname, '..', 'FEC_Analyse_v5_code_complet.html');
  const results = run(htmlPath);
  let failed = 0;
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} — ${r.name}${r.pass ? '' : ' :: ' + r.detail}`);
    if (!r.pass) failed++;
  }
  process.exit(failed ? 1 : 0);
}

module.exports = { run };
