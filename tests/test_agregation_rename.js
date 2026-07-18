'use strict';
/**
 * Tests du renommage "Consolidé" → "Agrégation multi-sociétés" (Phase 4 de
 * l'audit, cf. AUDIT_CORRECTIONS.md) et de la bannière permanente associée.
 *
 * Renommage volontairement limité aux libellés VISIBLES (titres, boutons,
 * bulles d'aide, toasts, sous-titres de cartes) : les identifiants internes
 * (type de stockage 'consolide', noms de fonctions, classes CSS) sont
 * inchangés pour ne jamais casser les dossiers déjà créés (rétrocompatibilité
 * du localStorage existant).
 */
const fs = require('fs');
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function run(htmlPath) {
  const results = [];
  const rawHtml = fs.readFileSync(htmlPath, 'utf-8');

  // ── 1. Aucun libellé visible "Consolidé" ne subsiste dans le code ───────
  {
    // Ces 3 motifs correspondent exactement aux libellés JS (chaînes/template
    // literals) qui portaient le texte visible "Consolidé" avant renommage.
    // Les mentions entre guillemets doubles dans des commentaires de code
    // (ex. `"Consolidé"` en référence historique) sont volontairement
    // exclues : elles ne sont jamais affichées à l'utilisateur.
    const forbiddenPatterns = [/>Consolidé</, /'Consolidé'/, /`Consolidé/];
    const stillPresent = forbiddenPatterns.filter(re => re.test(rawHtml));
    results.push({
      name: 'Aucun des anciens motifs de libellé visible "Consolidé" ne subsiste (titres/toasts/tags)',
      pass: stillPresent.length === 0,
      detail: stillPresent.map(String),
    });
  }

  // ── 2. Sélecteur de type dans "Nouveau projet" ──────────────────────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `showNpStep(1);`);
    const html = runIn(ctx, 'document.body.children[document.body.children.length-1].innerHTML');
    results.push({
      name: 'showNpStep(1) affiche "Agrégation multi-sociétés" comme intitulé du type de projet (plus "Consolidé")',
      pass: html.includes('Agrégation multi-sociétés') && !html.includes('>Consolidé<'),
      detail: html.slice(0, 50),
    });
  }

  // ── 3. Étape de sélection des membres ───────────────────────────────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `_npType='consolide'; _npGroup='g1'; _npNewName='Groupe Test';`);
    runIn(ctx, `showNpStep('members');`);
    const html = runIn(ctx, 'document.body.children[document.body.children.length-1].innerHTML');
    results.push({
      name: 'showNpStep("members") affiche "Créer l\'agrégation" (plus "Créer le consolidé")',
      pass: html.includes("Créer l'agrégation") && !html.includes('Créer le consolidé'),
      detail: html.slice(0, 300),
    });
  }

  // ── 4. Carte de dossier (addDossierCard) et duplication ────────────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      document._elements.set('sec-non-classes', document.createElement('div'));
      const sec = document._elements.get('sec-non-classes');
      sec.querySelector = (sel) => sel === '.dossier-grid' ? (sec._grid || (sec._grid = (() => { const g = document.createElement('div'); g.className='dossier-grid'; g.insertBefore = (n,r)=>{g.children.push(n);g.childNodes.push(n);}; g.querySelector=()=>document.createElement('div'); return g; })())) : null;
      addDossierCard('Groupe Test', 'non-classes', 'agg-1', undefined, {consolide:true});
    `);
    const cardHtml = runIn(ctx, `document._elements.get('sec-non-classes').querySelector('.dossier-grid').children[0].innerHTML`);
    results.push({
      name: 'addDossierCard({consolide:true}) affiche le tag "Agrégation" sur la carte (plus "Consolidé")',
      pass: cardHtml.includes('Agrégation') && !cardHtml.includes('>Consolidé<'),
      detail: cardHtml,
    });
  }

  // ── 5. Toast de blocage "Ajouter un exercice" sur une agrégation ────────
  {
    const ctx = loadApp(htmlPath);
    let lastToast = null;
    runIn(ctx, `function toast(msg){ __lastToast = msg; }`);
    runIn(ctx, `ACTIVE = {id:'x', type:'consolide'};`);
    runIn(ctx, `openAjouterExercice();`);
    lastToast = runIn(ctx, '__lastToast');
    results.push({
      name: "openAjouterExercice() sur une agrégation affiche un message avec \"agrégation multi-sociétés\" (plus \"dossier Consolidé\")",
      pass: /agrégation multi-sociétés/i.test(lastToast || '') && !/dossier Consolidé/.test(lastToast || ''),
      detail: lastToast,
    });
  }

  // ── 6. renderAgregationAlertBanner() — bannière permanente ──────────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `document._elements.set('agregation-alert-banner', document.createElement('div'));`);

    runIn(ctx, `ACTIVE = {type:'consolide'}; renderAgregationAlertBanner();`);
    const bannerOn = runIn(ctx, `document._elements.get('agregation-alert-banner').innerHTML`);
    results.push({
      name: 'renderAgregationAlertBanner() affiche un avertissement permanent pour un dossier de type "consolide"',
      pass: bannerOn.includes('Agrégation multi-sociétés') && bannerOn.includes('consolidation légale'),
      detail: bannerOn,
    });

    runIn(ctx, `ACTIVE = {type:'reporting'}; renderAgregationAlertBanner();`);
    const bannerOff = runIn(ctx, `document._elements.get('agregation-alert-banner').innerHTML`);
    results.push({
      name: 'renderAgregationAlertBanner() reste vide pour un dossier Reporting classique (pas de bannière parasite)',
      pass: bannerOff === '',
      detail: bannerOff,
    });
  }

  // ── 7. Non-régression : type de stockage interne 'consolide' inchangé ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `_npMembers=['m1']; _npGroup='g1'; _npNewName='Groupe Test';`);
    runIn(ctx, `
      const store = {}; store['m1']={id:'m1',name:'Filiale',group:'g1',type:'reporting',bal:{},libs:{},months:{},periodStart:'202501',periodEnd:'202512'};
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
      document._elements.set('sec-non-classes', document.createElement('div'));
      const sec = document._elements.get('sec-non-classes');
      sec.querySelector = (sel) => sel === '.dossier-grid' ? (sec._grid || (sec._grid = (() => { const g = document.createElement('div'); g.insertBefore=(n,r)=>{g.children.push(n);g.childNodes.push(n);}; g.querySelector=()=>document.createElement('div'); return g; })())) : null;
      npConfirmConsolide();
    `);
    const allTypes = getJSON(ctx, `Object.values(JSON.parse(localStorage.getItem(STORE_KEY))).map(d=>d.type)`);
    results.push({
      name: "npConfirmConsolide() persiste toujours type:'consolide' en stockage (identifiant interne inchangé, rétrocompatibilité)",
      pass: allTypes.includes('consolide'),
      detail: allTypes,
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
