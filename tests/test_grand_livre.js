'use strict';
/**
 * Tests grand livre (détail écriture par écriture par compte) — cf.
 * AUDIT.md §(q). Vérifie : parseFECFile() construit un ledger correct,
 * openGrandLivre() affiche le détail (ou un message explicite si absent),
 * et saveActiveDossier() exclut bien le ledger du payload persisté en
 * localStorage (contrainte de taille — cf. commentaire dans le code).
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const results = [];

  const norm = s => s.replace(/[  ]/g, ' ');

  // ── 1. parseFECFile() construit le ledger par compte ──────────────────
  {
    const fec = [
      'JournalCode\tEcritureDate\tCompteNum\tCompteLib\tPieceRef\tEcritureLib\tDebit\tCredit',
      'VE\t20240115\t707\tVentes\tP1\tVente du 15/01\t0,00\t1000,00',
      'AC\t20240110\t607\tAchats\tP2\tAchat du 10/01\t400,00\t0,00',
      'AC\t20240120\t607\tAchats\tP3\tAchat du 20/01\t150,00\t0,00',
    ].join('\n');
    const parsed = getJSON(ctx, `parseFECFile(${JSON.stringify(fec)})`);
    results.push({
      name: 'parseFECFile() construit un ledger avec une entrée par compte/ligne',
      pass: !!parsed && !!parsed.ledger && parsed.ledger['707'].length === 1 && parsed.ledger['607'].length === 2,
      detail: parsed && parsed.ledger,
    });
    results.push({
      name: 'Le ledger conserve date/journal/pièce/libellé/débit/crédit',
      pass: !!parsed && parsed.ledger['707'][0].dt === '20240115'
        && parsed.ledger['707'][0].jr === 'VE'
        && parsed.ledger['707'][0].pc === 'P1'
        && parsed.ledger['707'][0].lb === 'Vente du 15/01'
        && parsed.ledger['707'][0].cr === 1000,
      detail: parsed && parsed.ledger['707'],
    });
  }

  // ── 2. openGrandLivre() affiche le détail quand ACTIVE.ledger existe ──
  {
    runIn(ctx, `
      ACTIVE.id = 'd-gl';
      ACTIVE.libs = { '707': 'Ventes de marchandises' };
      ACTIVE.ledger = { '707': [
        { dt: '20240115', jr: 'VE', pc: 'P1', lb: 'Vente A', d: 0, cr: 1000 },
        { dt: '20240120', jr: 'VE', pc: 'P2', lb: 'Vente B', d: 0, cr: 500 },
      ] };
      document._elements.set('gl-overlay', document.createElement('div'));
      openGrandLivre('707');
    `);
    const bodyChildren = getJSON(ctx, 'document.body.children.length');
    const overlayHtml = norm(runIn(ctx, "document.body.children[document.body.children.length-1].innerHTML"));
    results.push({
      name: "openGrandLivre() ouvre une fenêtre listant les écritures du compte",
      pass: bodyChildren > 0 && overlayHtml.includes('Vente A') && overlayHtml.includes('Vente B')
        && overlayHtml.includes('1 000') && overlayHtml.includes('500') && overlayHtml.includes('15/01/2024'),
      detail: overlayHtml.slice(0, 600),
    });
  }

  // ── 3. openGrandLivre() affiche un message clair si le détail est absent ──
  {
    runIn(ctx, `
      ACTIVE.id = 'd-gl2';
      ACTIVE.libs = { '411': 'Clients' };
      ACTIVE.ledger = null;
      openGrandLivre('411');
    `);
    const overlayHtml = runIn(ctx, "document.body.children[document.body.children.length-1].innerHTML");
    results.push({
      name: "openGrandLivre() affiche un message explicite si aucun détail n'est disponible",
      pass: /non disponible|réimportez/i.test(overlayHtml),
      detail: overlayHtml.slice(0, 400),
    });
  }

  // ── 4. saveActiveDossier() ne persiste JAMAIS le ledger en localStorage ──
  {
    runIn(ctx, `
      ACTIVE.id = 'd-gl3'; ACTIVE.name = 'Test'; ACTIVE.group = 'non-classes';
      ACTIVE.bal = { '707': 1000 }; ACTIVE.libs = {}; ACTIVE.months = {};
      ACTIVE.mps = { cr: [], bilan: [] };
      ACTIVE.exercices = { 'ex-1': { id: 'ex-1', label: '2024', bal: { '707': 1000 }, libs: {}, months: {}, ledger: { '707': [{ dt:'20240101', jr:'VE', pc:'P1', lb:'X', d:0, cr:1000 }] } } };
      ACTIVE.activeExerciceId = 'ex-1';
      saveActiveDossier();
    `);
    const savedRaw = runIn(ctx, "localStorage.getItem(STORE_KEY)");
    const saved = JSON.parse(savedRaw);
    const savedEx = saved['d-gl3'].exercices['ex-1'];
    results.push({
      name: "saveActiveDossier() exclut le champ ledger de l'exercice persisté",
      pass: !('ledger' in savedEx) && savedEx.bal['707'] === 1000,
      detail: savedEx,
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
