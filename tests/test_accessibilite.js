'use strict';
/**
 * Phase 9 de l'audit demandé (accessibilité et qualité de l'interface).
 * L'audit du code (aucun attribut aria-* ou role dans tout le fichier
 * avant cette passe) a montré une surface bien trop large pour un correctif
 * exhaustif en une seule passe (99 <div onclick>, 16 <span onclick>,
 * cf. AUDIT_CORRECTIONS.md) sans risquer une réécriture massive contraire
 * à la règle impérative n°6 ("pas de réécriture totale immédiate") et à
 * la règle n°3 ("conserve le design"). Ce correctif se limite donc à un
 * périmètre volontairement restreint, purement additif (aucun attribut
 * ni changement ne modifie l'apparence visuelle) :
 *  - fermeture au clavier (Échap) des fenêtres modales/menus déjà
 *    existants, sans toucher à leur comportement au clic ;
 *  - accessibilité clavier + lecteur d'écran du sélecteur de dossier
 *    (menu déroulant) et de l'icône Paramètres (gear), les deux
 *    contrôles les plus universellement présents dans l'interface.
 */
const fs = require('fs');
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

function run(htmlPath) {
  const results = [];
  const rawHtml = fs.readFileSync(htmlPath, 'utf-8');

  // ── 1. fermerAvecEchap() — ferme chaque type de fenêtre/menu ────────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `document._elements.set('gl-overlay', document.createElement('div'));`);
    runIn(ctx, `fermerAvecEchap({ key: 'Escape' });`);
    const stillThere = runIn(ctx, `!!document._elements.get('gl-overlay')`);
    // Note : le bac à sable ne modélise pas document.getElementById() comme un vrai DOM
    // (les éléments enregistrés via _elements.set() restent accessibles même après remove()) ;
    // on vérifie donc que remove() a bien été appelée sur l'élément, pas sa disparition du registre.
    const removeWasCalled = getJSON(ctx, `(() => {
      const el = document._elements.get('gl-overlay');
      let called = false;
      el.remove = () => { called = true; };
      fermerAvecEchap({ key: 'Escape' });
      return called;
    })()`);
    results.push({ name: "fermerAvecEchap() appelle remove() sur #gl-overlay (Grand livre) quand il est ouvert", pass: removeWasCalled });
  }

  // ── 2. fermerAvecEchap() — ferme le modal "Nouveau projet" (np-overlay) ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `showNpStep(1);`); // crée réellement #np-overlay via document.body.appendChild
    const before = runIn(ctx, `document.body.children.some(c => c.id === 'np-overlay')`);
    results.push({ name: 'showNpStep(1) crée bien #np-overlay (précondition du test)', pass: before });
    runIn(ctx, `
      // getElementById du bac à sable ne connaît que les éléments enregistrés via _elements.set() ;
      // on enregistre donc explicitement l'overlay réellement créé pour que fermerAvecEchap() (qui
      // utilise document.getElementById()) puisse le trouver, comme dans un vrai navigateur.
      const ov = document.body.children.find(c => c.id === 'np-overlay');
      document._elements.set('np-overlay', ov);
    `);
    runIn(ctx, `fermerAvecEchap({ key: 'Escape' });`);
    const closeNpModalCalled = getJSON(ctx, `(() => {
      document._elements.set('np-overlay', document.createElement('div'));
      let called = false;
      const original = closeNpModal;
      closeNpModal = () => { called = true; };
      fermerAvecEchap({ key: 'Escape' });
      closeNpModal = original;
      return called;
    })()`);
    results.push({ name: "fermerAvecEchap() appelle closeNpModal() quand #np-overlay est présent", pass: closeNpModalCalled });
  }

  // ── 3. fermerAvecEchap() — ferme Confidentialité (privacy-overlay) ──────
  {
    const ctx = loadApp(htmlPath);
    const called = getJSON(ctx, `(() => {
      document._elements.set('privacy-overlay', document.createElement('div'));
      let called = false;
      const original = closePrivacyModal;
      closePrivacyModal = () => { called = true; };
      fermerAvecEchap({ key: 'Escape' });
      closePrivacyModal = original;
      return called;
    })()`);
    results.push({ name: "fermerAvecEchap() appelle closePrivacyModal() quand #privacy-overlay est présent", pass: called });
  }

  // ── 4. fermerAvecEchap() — ferme le menu déroulant de dossier ───────────
  {
    const ctx = loadApp(htmlPath);
    const called = getJSON(ctx, `(() => {
      document._elements.set('dossier-dropdown', document.createElement('div'));
      let called = false;
      const original = closeDossierDropdown;
      closeDossierDropdown = () => { called = true; };
      fermerAvecEchap({ key: 'Escape' });
      closeDossierDropdown = original;
      return called;
    })()`);
    results.push({ name: "fermerAvecEchap() appelle closeDossierDropdown() quand #dossier-dropdown est présent", pass: called });
  }

  // ── 5. fermerAvecEchap() — ferme le panneau Paramètres (params-overlay) si visible ──
  {
    const ctx = loadApp(htmlPath);
    const called = getJSON(ctx, `(() => {
      const el = document.createElement('div');
      el.style.display = 'flex';
      document._elements.set('params-overlay', el);
      let called = false;
      const original = closeParamsPage;
      closeParamsPage = () => { called = true; };
      fermerAvecEchap({ key: 'Escape' });
      closeParamsPage = original;
      return called;
    })()`);
    results.push({ name: "fermerAvecEchap() appelle closeParamsPage() quand #params-overlay est visible (display !== 'none')", pass: called });

    const notCalledWhenHidden = getJSON(ctx, `(() => {
      const el = document.createElement('div');
      el.style.display = 'none';
      document._elements.set('params-overlay', el);
      let called = false;
      const original = closeParamsPage;
      closeParamsPage = () => { called = true; };
      fermerAvecEchap({ key: 'Escape' });
      closeParamsPage = original;
      return called;
    })()`);
    results.push({ name: "fermerAvecEchap() n'appelle PAS closeParamsPage() quand #params-overlay est déjà masqué (display:none)", pass: !notCalledWhenHidden });
  }

  // ── 6. fermerAvecEchap() — ignore toute touche autre qu'Échap ───────────
  {
    const ctx = loadApp(htmlPath);
    const called = getJSON(ctx, `(() => {
      document._elements.set('privacy-overlay', document.createElement('div'));
      let called = false;
      const original = closePrivacyModal;
      closePrivacyModal = () => { called = true; };
      fermerAvecEchap({ key: 'Enter' });
      closePrivacyModal = original;
      return called;
    })()`);
    results.push({ name: "fermerAvecEchap() ne fait rien pour une touche autre qu'Échap (ex. Entrée)", pass: !called });
  }

  // ── 7. fermerAvecEchap() — priorité : Grand livre avant les autres (superposition la plus probable) ──
  {
    const ctx = loadApp(htmlPath);
    const result = getJSON(ctx, `(() => {
      let glClosed = false, privacyClosed = false;
      const glEl = document.createElement('div');
      glEl.remove = () => { glClosed = true; };
      document._elements.set('gl-overlay', glEl);
      document._elements.set('privacy-overlay', document.createElement('div'));
      const original = closePrivacyModal;
      closePrivacyModal = () => { privacyClosed = true; };
      fermerAvecEchap({ key: 'Escape' });
      closePrivacyModal = original;
      return { glClosed, privacyClosed };
    })()`);
    results.push({
      name: "fermerAvecEchap() ne ferme que la fenêtre la plus prioritaire (Grand livre) quand plusieurs sont présentes, pas toutes en même temps",
      pass: result.glClosed && !result.privacyClosed,
      detail: result,
    });
  }

  // ── 8. Contrôles accessibles au clavier/lecteur d'écran ──────────────────
  {
    results.push({
      name: 'Le bouton "Paramètres du dossier" (GEAR_BTN, réutilisé sur chaque carte de dossier créée) porte un aria-label et masque son icône décorative (aria-hidden)',
      pass: /const GEAR_BTN=`<button class="card-gear"[^`]*aria-label="Paramètres du dossier"[^`]*aria-hidden="true"/.test(rawHtml),
    });
    const nbAriaLabelGear = (rawHtml.match(/aria-label="Paramètres du dossier"/g) || []).length;
    results.push({
      name: 'Les 7 cartes de dossier statiques (démonstration) ET la constante GEAR_BTN portent toutes le même aria-label (cohérence, 8 occurrences)',
      pass: nbAriaLabelGear === 8,
      detail: nbAriaLabelGear,
    });
    results.push({
      name: 'Le sélecteur de dossier (module-dossier-tag) est focusable au clavier (role="button", tabindex="0") et déclenche le menu via Entrée/Espace',
      pass: /id="module-dossier-tag" role="button" tabindex="0" aria-haspopup="true" aria-label="Changer de dossier"/.test(rawHtml)
        && /onkeydown="if\(event\.key==='Enter'\|\|event\.key===' '\)\{event\.preventDefault\(\);toggleDossierDropdown\(\);\}"/.test(rawHtml),
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
