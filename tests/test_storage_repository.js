'use strict';
/**
 * Tests de la couche de stockage abstraite (createLocalStorageRepository).
 * Cf. SAAS_ARCHITECTURE.md §3.4/§10 et FEC_Analyse_v6.html, section
 * "COUCHE DE STOCKAGE — REPOSITORY GÉNÉRIQUE". Vérifie :
 *  - le contrat générique get/list/save/remove sur un store isolé de test ;
 *  - que les 4 modules déjà migrés (Prévisionnel, TNS, Rémunération, IRPP)
 *    exposent bien un XRepository construit par ce générateur ;
 *  - la non-régression stricte de comportement des anciennes fonctions
 *    (loadXStore/saveXStore/saveX/deleteXById/listX), désormais de simples
 *    délégations, sur les 8 clés localStorage inventoriées dans l'audit.
 */
const { loadApp, getJSON } = require('./harness.js');

function run(htmlPath) {
  const ctx = loadApp(htmlPath);
  const results = [];
  const push = (name, pass, detail) => results.push({ name, pass, detail });

  // ── 1. Contrat générique sur un store isolé (ne touche à aucune clé applicative) ─
  {
    getJSON(ctx, `(() => { localStorage.removeItem('__test_repo_v1__'); return true; })()`);
    getJSON(ctx, `(() => {
      globalThis.__testRepo = createLocalStorageRepository({
        storeKey: '__test_repo_v1__', logPrefix: '[Test]',
        corruptWarnSuffix: 'illisible :', corruptToastMessage: 'Test illisible',
        saveErrorPrefix: 'Échec test', saveErrorLogLabel: 'saveTest',
      });
      return true;
    })()`);

    const listeVide = getJSON(ctx, `__testRepo.list()`);
    push('list() sur un store vide renvoie []', Array.isArray(listeVide) && listeVide.length === 0, listeVide);

    const getInconnu = getJSON(ctx, `__testRepo.get('inexistant')`);
    push('get() sur un id inconnu renvoie null', getInconnu === null, getInconnu);

    getJSON(ctx, `(() => { __testRepo.save({ id: 'a', label: 'Alpha' }); return true; })()`);
    const apresSave = getJSON(ctx, `__testRepo.get('a')`);
    push('save() puis get() retrouve le même enregistrement', apresSave && apresSave.label === 'Alpha', apresSave);
    push('save() horodate updatedAt automatiquement', apresSave && Number.isFinite(apresSave.updatedAt), apresSave && apresSave.updatedAt);

    getJSON(ctx, `(() => { __testRepo.save({ id: 'b', label: 'Beta' }); return true; })()`);
    const listeDeux = getJSON(ctx, `__testRepo.list()`);
    push('list() renvoie les 2 enregistrements après 2 save()', listeDeux.length === 2, listeDeux);
    // Deux save() consécutifs peuvent partager le même Date.now() (résolution milliseconde) : on force
    // des updatedAt distincts directement dans le store pour vérifier le tri sans dépendre du timing réel.
    getJSON(ctx, `(() => { const s = __testRepo.loadAll(); s.a.updatedAt = 1000; s.b.updatedAt = 2000; __testRepo.saveAll(s); return true; })()`);
    const listeTriee = getJSON(ctx, `__testRepo.list()`);
    push('list() trie par updatedAt décroissant (le plus récent en premier)', listeTriee.map(r => r.id).join(',') === 'b,a', listeTriee.map(r => r.id));

    getJSON(ctx, `(() => { __testRepo.remove('a'); return true; })()`);
    const apresRemove = getJSON(ctx, `__testRepo.get('a')`);
    const listeApresRemove = getJSON(ctx, `__testRepo.list()`);
    push('remove() supprime bien l’enregistrement (get -> null)', apresRemove === null, apresRemove);
    push('remove() ne touche pas les autres enregistrements', listeApresRemove.length === 1 && listeApresRemove[0].id === 'b', listeApresRemove);

    // JSON corrompu -> lecture défensive (pas d'exception, liste vide, toast déclenché)
    getJSON(ctx, `(() => { localStorage.setItem('__test_repo_v1__', '{ceci n\\'est pas du JSON'); return true; })()`);
    const toasts = [];
    ctx.__toasts = toasts;
    getJSON(ctx, `(() => { toast = (msg, isErr) => __toasts.push({ msg, isErr }); return true; })()`);
    const listeCorrompue = getJSON(ctx, `__testRepo.list()`);
    push('JSON corrompu -> list() renvoie [] sans exception', Array.isArray(listeCorrompue) && listeCorrompue.length === 0, listeCorrompue);
    push('JSON corrompu -> un toast d’erreur est déclenché avec le message configuré', toasts.some(t => t.isErr && t.msg === 'Test illisible'), toasts);

    getJSON(ctx, `(() => { localStorage.removeItem('__test_repo_v1__'); return true; })()`);
  }

  // ── 2. Les 4 modules migrés exposent bien un XRepository généré par createLocalStorageRepository ─
  {
    const reposPresents = getJSON(ctx, `({
      previsionnel: typeof PrevisionnelRepository !== 'undefined' && typeof PrevisionnelRepository.save === 'function',
      tns: typeof TnsRepository !== 'undefined' && typeof TnsRepository.save === 'function',
      remuneration: typeof RemuRepository !== 'undefined' && typeof RemuRepository.save === 'function',
      irpp: typeof IrppRepository !== 'undefined' && typeof IrppRepository.save === 'function',
    })`);
    push('PrevisionnelRepository exposé avec l’interface repository', reposPresents.previsionnel, reposPresents);
    push('TnsRepository exposé avec l’interface repository', reposPresents.tns, reposPresents);
    push('RemuRepository exposé avec l’interface repository', reposPresents.remuneration, reposPresents);
    push('IrppRepository exposé avec l’interface repository', reposPresents.irpp, reposPresents);
  }

  // ── 3. Non-régression : les anciennes fonctions par module fonctionnent à l'identique ─
  const modules = [
    { nom: 'Prévisionnel', storeKey: 'PREV_STORE_KEY', save: 'savePrevisionnel', del: 'deletePrevisionnelById', list: 'listPrevisionnels', prefix: 'prev' },
    { nom: 'TNS', storeKey: 'TNS_STORE_KEY', save: 'saveTns', del: 'deleteTnsById', list: 'listTns', prefix: 'tns' },
    { nom: 'Rémunération', storeKey: 'REMU_STORE_KEY', save: 'saveRemu', del: 'deleteRemuById', list: 'listRemu', prefix: 'remu' },
    { nom: 'IRPP', storeKey: 'IRPP_STORE_KEY', save: 'saveIrpp', del: 'deleteIrppById', list: 'listIrpp', prefix: 'irpp' },
  ];
  for (const m of modules) {
    getJSON(ctx, `(() => { localStorage.removeItem(${m.storeKey}); return true; })()`);
    const idTest = `${m.prefix}-test-repo-1`;
    getJSON(ctx, `(() => { ${m.save}({ id: '${idTest}', name: 'Test ${m.nom}' }); return true; })()`);
    const listeApresSave = getJSON(ctx, `${m.list}()`);
    push(`${m.nom} : ${m.save}() puis ${m.list}() retrouve l’enregistrement`, listeApresSave.some(r => r.id === idTest), listeApresSave.map(r => r.id));

    const clePersistee = getJSON(ctx, `localStorage.getItem(${m.storeKey})`);
    const parsedClePersistee = JSON.parse(clePersistee || '{}');
    push(`${m.nom} : la clé localStorage ${m.storeKey} contient bien l’enregistrement au format {id: record}`, !!parsedClePersistee[idTest], Object.keys(parsedClePersistee));

    getJSON(ctx, `(() => { ${m.del}('${idTest}'); return true; })()`);
    const listeApresDelete = getJSON(ctx, `${m.list}()`);
    push(`${m.nom} : ${m.del}() supprime bien l’enregistrement`, !listeApresDelete.some(r => r.id === idTest), listeApresDelete.map(r => r.id));

    getJSON(ctx, `(() => { localStorage.removeItem(${m.storeKey}); return true; })()`);
  }

  return results;
}

module.exports = { run };
