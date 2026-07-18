'use strict';
/**
 * Tests du rapport d'import FEC structuré (Phase 2 de l'audit demandé,
 * cf. AUDIT_CORRECTIONS.md). analyserQualiteImportFEC() est une passe de
 * lecture INDÉPENDANTE de parseFECFile() : elle ne modifie jamais les
 * données réellement importées, elle produit uniquement un diagnostic
 * (lignes valides/rejetées + raison, écart débit/crédit, doublons) affiché
 * à l'utilisateur dans l'onglet "Suivi des imports".
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function fec(rows, sep = '\t') {
  const header = ['JournalCode','JournalLib','EcritureNum','EcritureDate','CompteNum','CompteLib','CompAuxNum','CompAuxLib','PieceRef','PieceDate','EcritureLib','Debit','Credit','EcritureLet','DateLet','ValidDate','Montantdevise','Idevise'];
  return [header.join(sep), ...rows.map(r => r.join(sep))].join('\r\n');
}

function run(htmlPath) {
  const results = [];

  // ── 1. Cas nominal : FEC bien formé, aucune anomalie ────────────────────
  {
    const ctx = loadApp(htmlPath);
    const text = fec([
      ['VE','Ventes','1','20250115','707000','Ventes','','','F1','20250115','Vente A','','1000',,'','','',''],
      ['VE','Ventes','2','20250116','411000','Client','','','F1','20250116','Vente A','1000','',,'','','',''],
    ]);
    const r = getJSON(ctx, `analyserQualiteImportFEC(${JSON.stringify(text)})`);
    results.push({ name: 'FEC bien formé : toutes les lignes sont valides (0 rejet)', pass: r.lignesValides === 2 && r.lignesRejetees === 0, detail: r });
    results.push({ name: 'FEC équilibré : écart débit/crédit nul', pass: r.ecartDebitCredit === 0, detail: r.ecartDebitCredit });
    results.push({ name: 'FEC sans doublon : aucune ligne dupliquée signalée', pass: r.doublons.length === 0 });
    results.push({ name: 'Séparateur tabulation correctement détecté', pass: r.separateurDetecte === 'tabulation' });
  }

  // ── 2. Colonnes obligatoires absentes ────────────────────────────────────
  {
    const ctx = loadApp(htmlPath);
    const text = "JournalCode\tEcritureLib\r\nVE\tVente sans les bonnes colonnes";
    const r = getJSON(ctx, `analyserQualiteImportFEC(${JSON.stringify(text)})`);
    results.push({
      name: 'Colonnes CompteNum/Debit/Credit absentes de l\'en-tête : signalées et toutes les lignes rejetées',
      pass: r.colonnesManquantes.includes('CompteNum') && r.colonnesManquantes.includes('Debit') && r.colonnesManquantes.includes('Credit') && r.lignesRejetees === 1,
      detail: r,
    });
  }

  // ── 3. Lignes rejetées avec raison précise ──────────────────────────────
  {
    const ctx = loadApp(htmlPath);
    const text = fec([
      ['VE','Ventes','1','20250115','','Ventes','','','F1','20250115','Compte vide','','1000',,'','','',''], // compte vide
      ['VE','Ventes','2','20250116','411000','Client','','','F1','20250116','Montant invalide','ABC','',,'','','',''], // débit non numérique
      ['VE'], // ligne incomplète
      ['VE','Ventes','4','20250117','411000','Client','','','F1','20250117','OK','500','',,'','','',''], // valide
    ]);
    const r = getJSON(ctx, `analyserQualiteImportFEC(${JSON.stringify(text)})`);
    results.push({ name: 'Ligne à compte vide détectée et rejetée', pass: r.rejets.some(x => x.raison.includes('compte vide')), detail: r.rejets });
    results.push({ name: 'Ligne à montant non numérique détectée et rejetée', pass: r.rejets.some(x => x.raison.includes('montant')), detail: r.rejets });
    results.push({ name: 'Ligne incomplète (colonnes manquantes) détectée et rejetée', pass: r.rejets.some(x => x.raison.includes('incomplète')), detail: r.rejets });
    results.push({ name: 'Sur 4 lignes, 3 rejets + 1 valide', pass: r.lignesRejetees === 3 && r.lignesValides === 1, detail: r });
  }

  // ── 4. Écart débit/crédit ────────────────────────────────────────────────
  {
    const ctx = loadApp(htmlPath);
    const text = fec([
      ['VE','Ventes','1','20250115','707000','Ventes','','','F1','20250115','Vente','','1000',,'','','',''],
      ['VE','Ventes','2','20250116','411000','Client','','','F1','20250116','Vente','900','',,'','','',''], // 900 au lieu de 1000 : écart de 100
    ]);
    const r = getJSON(ctx, `analyserQualiteImportFEC(${JSON.stringify(text)})`);
    results.push({ name: 'Écart débit/crédit de 100 € correctement calculé (signe : débit - crédit)', pass: r.ecartDebitCredit === -100, detail: r.ecartDebitCredit });
  }

  // ── 5. Doublons stricts ──────────────────────────────────────────────────
  {
    const ctx = loadApp(htmlPath);
    const dup = ['VE','Ventes','1','20250115','411000','Client','','','F1','20250115','Vente dupliquée','500','',,'','','',''];
    const text = fec([dup, dup, ['VE','Ventes','2','20250116','707000','Ventes','','','F1','20250116','Autre','','500',,'','','','']]);
    const r = getJSON(ctx, `analyserQualiteImportFEC(${JSON.stringify(text)})`);
    results.push({ name: 'Ligne strictement dupliquée (2 occurrences) détectée', pass: r.doublons.length === 1 && r.doublons[0].occurrences === 2, detail: r.doublons });
  }

  // ── 6. Fichier vide/illisible ─────────────────────────────────────────────
  {
    const ctx = loadApp(htmlPath);
    const r = getJSON(ctx, `analyserQualiteImportFEC('')`);
    results.push({ name: 'Fichier vide : signalé sans planter', pass: r.colonnesManquantes.includes('fichier vide ou illisible'), detail: r });
  }

  // ── 7. Câblage : finishNpConfirm() -> store[id].rapportImportInitial -> ensureExercices() ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      document._elements.set('home-screen', document.createElement('div'));
      document._elements.set('dashboard-screen', document.createElement('div'));
      _npNewName = 'Test Rapport'; _npGroup = 'non-classes';
      _npFile = { name: 'test.txt', size: 1000 };
      const rapportFake = { totalLignes: 10, lignesValides: 8, lignesRejetees: 2, rejets: [{ligne:3,raison:'test'}], totalDebit: 100, totalCredit: 100, ecartDebitCredit: 0, doublons: [], separateurDetecte: 'tabulation', colonnesManquantes: [] };
      const parsedFake = { bal: {'411000': 500}, libs: {}, months: {}, nbLines: 8, periodStart: '202501', periodEnd: '202512', isRDCompany: false, revenueTypes: {}, rapportImport: rapportFake };
      finishNpConfirm(parsedFake);
    `);
    const storedReport = getJSON(ctx, `(() => { const store = JSON.parse(localStorage.getItem(STORE_KEY)); const id = Object.keys(store)[0]; return store[id].rapportImportInitial; })()`);
    results.push({ name: "finishNpConfirm() persiste le rapport d'import sur le dossier nouvellement créé (rapportImportInitial)", pass: storedReport && storedReport.lignesRejetees === 2, detail: storedReport });

    const exerciceReport = getJSON(ctx, `(() => { const store = JSON.parse(localStorage.getItem(STORE_KEY)); const id = Object.keys(store)[0]; const { exercices, activeExerciceId } = ensureExercices(store[id]); return exercices[activeExerciceId].rapportImport; })()`);
    results.push({ name: "ensureExercices() reprend rapportImportInitial dans le premier exercice synthétisé", pass: exerciceReport && exerciceReport.lignesRejetees === 2, detail: exerciceReport });
  }

  // ── 8. Câblage : addExerciceToActiveDossier() stocke le rapport sur le nouvel exercice ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      ACTIVE = { id: 'd1', name: 'Test', group: 'non-classes', exercices: {} };
      const rapportFake = { totalLignes: 5, lignesValides: 5, lignesRejetees: 0, rejets: [], totalDebit: 0, totalCredit: 0, ecartDebitCredit: 0, doublons: [], separateurDetecte: 'tabulation', colonnesManquantes: [] };
      addExerciceToActiveDossier({ bal:{}, libs:{}, months:{}, nbLines:5, periodStart:'202501', periodEnd:'202512', ledger:{}, rapportImport: rapportFake }, 'test2.txt');
    `);
    const exId = getJSON(ctx, `Object.keys(ACTIVE.exercices)[0]`);
    const stored = getJSON(ctx, `ACTIVE.exercices['${exId}'].rapportImport`);
    results.push({ name: "addExerciceToActiveDossier() attache le rapport d'import au nouvel exercice", pass: stored && stored.totalLignes === 5, detail: stored });
  }

  // ── 9. toastRapportImport() : silence si tout va bien, alerte sinon ─────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `function toast(msg){ __lastToast = msg; }`);
    runIn(ctx, `__lastToast = null; toastRapportImport({ lignesRejetees:0, ecartDebitCredit:0, doublons:[] });`);
    const silent = runIn(ctx, '__lastToast');
    results.push({ name: "toastRapportImport() reste silencieux si le rapport ne signale rien d'anormal", pass: silent === null });

    runIn(ctx, `__lastToast = null; toastRapportImport({ lignesRejetees:3, ecartDebitCredit:0, doublons:[] });`);
    const withIssue = runIn(ctx, '__lastToast');
    results.push({ name: "toastRapportImport() alerte si des lignes ont été rejetées", pass: /3 ligne/.test(withIssue || ''), detail: withIssue });
  }

  // ── 10. rapportImportResumeHtml() : échappement HTML des données issues du FEC ──
  {
    const ctx = loadApp(htmlPath);
    const html = getJSON(ctx, `rapportImportResumeHtml({
      lignesValides: 1, lignesRejetees: 1, ecartDebitCredit: 0,
      rejets: [{ligne:2, raison:'<script>alert(1)</script>'}],
      doublons: [{apercu:'<img src=x onerror=alert(1)>', occurrences:2}],
      colonnesManquantes: [],
    }, 'ex-test')`);
    results.push({
      name: "rapportImportResumeHtml() échappe le contenu brut du FEC dans le panneau de détail (pas d'injection HTML)",
      pass: !html.includes('<script>') && !html.includes('<img src=x'),
      detail: html,
    });
    results.push({ name: "rapportImportResumeHtml() affiche le lien d'export CSV quand des anomalies existent", pass: html.includes('exporterAnomaliesImport') });
  }

  // ── 11. exporterAnomaliesImport() : export CSV neutralisé (formule) ────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      let __lastDownload = null;
      function downloadTextFile(filename, content, mime){ __lastDownload = { filename, content, mime }; }
      ACTIVE = { id:'d1', name:'Test Export', exercices: { 'ex1': {
        rapportImport: { rejets: [{ligne:5, raison:'test'}], doublons: [{apercu:'=HYPERLINK("http://evil")', occurrences:2}] }
      }}};
      exporterAnomaliesImport('ex1');
    `);
    const dl = getJSON(ctx, '__lastDownload');
    results.push({ name: "exporterAnomaliesImport() déclenche un téléchargement CSV nommé sans planter", pass: !!dl && dl.filename.endsWith('.csv'), detail: dl && dl.filename });
    results.push({
      name: "exporterAnomaliesImport() neutralise une valeur de type formule (=HYPERLINK) via csvSafeValue",
      pass: dl && dl.content.includes("'=HYPERLINK") && !/[^']=HYPERLINK/.test(dl.content),
      detail: dl && dl.content,
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
