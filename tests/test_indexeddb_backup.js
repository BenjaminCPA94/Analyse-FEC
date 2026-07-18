'use strict';
/**
 * Tests de la sauvegarde de secours IndexedDB (Phase 5, volet 2 de
 * l'audit demandé — lever une partie du plafond de capacité du
 * localStorage). loadStore()/saveStore() restent strictement
 * SYNCHRONES (34 usages dans le code, cf. AUDIT_CORRECTIONS.md §12) :
 * IndexedDB sert uniquement de miroir asynchrone best-effort, jamais de
 * source de vérité principale dans cette passe.
 *
 * Le bac à sable Node (tests/harness.js) ne définit pas `indexedDB` :
 * ces tests vérifient donc que toute la couche se dégrade proprement
 * (jamais d'exception, jamais de blocage) dans cet environnement, en
 * plus du comportement fonctionnel de IndexedDbBackupEngine.restaurer() via des
 * doublures (IndexedDbBackupEngine.get/put réaffectées sur l'objet exposé —
 * `ouvrir()` reste privé, encapsulé dans la fermeture du module, jamais
 * testé directement : seule l'API publique put()/get()/restaurer() l'est).
 */
const path = require('path');
const { loadApp, runIn, getJSON } = require('./harness.js');

async function run(htmlPath) {
  const results = [];

  // ── 1. IndexedDbBackupEngine.get() : dégradation propre sans indexedDB (exerce ouvrir() en interne) ──
  {
    const ctx = loadApp(htmlPath);
    const db = await runIn(ctx, 'IndexedDbBackupEngine.get()');
    results.push({ name: "IndexedDbBackupEngine.get() résout à null (sans planter) quand indexedDB n'est pas défini (bac à sable Node)", pass: db === null });
  }

  // ── 2. IndexedDbBackupEngine.put() / IndexedDbBackupEngine.get() : jamais d'exception ──
  {
    const ctx = loadApp(htmlPath);
    const putResult = await runIn(ctx, `IndexedDbBackupEngine.put({ d1: { id: 'd1', name: 'Test' } })`);
    results.push({ name: "IndexedDbBackupEngine.put() renvoie false (sans exception) quand IndexedDB est indisponible", pass: putResult === false });
    const getResult = await runIn(ctx, `IndexedDbBackupEngine.get()`);
    results.push({ name: "IndexedDbBackupEngine.get() renvoie null (sans exception) quand IndexedDB est indisponible", pass: getResult === null });
  }

  // ── 3. saveStore() reste strictement synchrone et fonctionne à l'identique ──
  {
    const ctx = loadApp(htmlPath);
    const ok = runIn(ctx, `saveStore({ d1: { id: 'd1', name: 'Test' } })`);
    results.push({ name: "saveStore() renvoie toujours true de façon synchrone (le miroir IndexedDB ne bloque ni ne modifie la valeur de retour)", pass: ok === true });
    const stored = getJSON(ctx, `JSON.parse(localStorage.getItem(STORE_KEY))`);
    results.push({ name: 'saveStore() a bien persisté les données dans localStorage comme avant (comportement inchangé)', pass: stored.d1 && stored.d1.name === 'Test', detail: stored });
  }

  // ── 4. saveStore() : le message d'erreur quota mentionne la sauvegarde de secours ──
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      __lastToast = null; __lastToastIsErr = null;
      function toast(msg, isErr){ __lastToast = msg; __lastToastIsErr = isErr; }
      localStorage._quotaBytes = 1; // force QuotaExceededError sur le prochain setItem
    `);
    runIn(ctx, `saveStore({ d1: { id: 'd1', name: 'x'.repeat(1000) } })`);
    const toastMsg = runIn(ctx, '__lastToast');
    results.push({
      name: 'saveStore() en cas de quota localStorage dépassé mentionne la sauvegarde de secours IndexedDB (donnée pas nécessairement perdue)',
      pass: /secours|IndexedDB/i.test(toastMsg || ''),
      detail: toastMsg,
    });
  }

  // ── 5. IndexedDbBackupEngine.restaurer() : aucune sauvegarde trouvée ────────────
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      __lastToast = null;
      function toast(msg){ __lastToast = msg; }
      IndexedDbBackupEngine.get = async () => null;
    `);
    await runIn(ctx, `IndexedDbBackupEngine.restaurer()`);
    const toastMsg = runIn(ctx, '__lastToast');
    results.push({ name: "IndexedDbBackupEngine.restaurer() affiche un message clair quand aucune sauvegarde de secours n'existe", pass: /aucune sauvegarde/i.test(toastMsg || ''), detail: toastMsg });
  }

  // ── 6. Flux complet put() → get() → restaurer() avec un faux IndexedDB en mémoire ──
  // `ouvrir()` (privé, encapsulé dans la fermeture du module) ne peut plus être
  // stubbé par simple réaffectation d'une propriété publique (bonne nouvelle :
  // c'est la preuve que l'encapsulation du module fonctionne). On exerce donc
  // le vrai flux via un IndexedDB minimal simulé en mémoire, plutôt que de
  // doubler get()/put() — comportement réel déjà vérifié en navigateur
  // headless (cf. AUDIT_CORRECTIONS.md §13), ce test couvre en plus la
  // séquence complète dans le bac à sable Node.
  {
    const ctx = loadApp(htmlPath);
    runIn(ctx, `
      __lastToast = null;
      function toast(msg){ __lastToast = msg; }
      globalThis.indexedDB = (() => {
        const bases = new Map();
        return {
          open(name) {
            const req = { onupgradeneeded: null, onsuccess: null, onerror: null, result: null };
            setTimeout(() => {
              let isNew = false;
              if (!bases.has(name)) { bases.set(name, new Map()); isNew = true; }
              const stores = bases.get(name);
              const db = {
                createObjectStore(storeName) { stores.set(storeName, new Map()); },
                transaction(storeName) {
                  const data = stores.get(storeName);
                  // IMPORTANT : txObj est le MEME objet que celui renvoye par
                  // transaction() -- l'appelant fait tx.oncomplete = ... sur
                  // cette reference, qui doit etre la meme que celle lue par
                  // put() ci-dessous (piege classique : deux objets distincts
                  // ne se voient jamais l'un l'autre).
                  const txObj = {
                    oncomplete: null, onerror: null,
                    objectStore() {
                      return {
                        put(value, key) { data.set(key, value); setTimeout(() => txObj.oncomplete && txObj.oncomplete(), 0); },
                        get(key) {
                          const req2 = { onsuccess: null, onerror: null, result: undefined };
                          setTimeout(() => { req2.result = data.get(key); req2.onsuccess && req2.onsuccess(); }, 0);
                          return req2;
                        },
                      };
                    },
                  };
                  return txObj;
                },
              };
              req.result = db;
              if (isNew) req.onupgradeneeded && req.onupgradeneeded();
              req.onsuccess && req.onsuccess();
            }, 0);
            return req;
          },
        };
      })();
      localStorage.setItem(STORE_KEY, JSON.stringify({}));
    `);
    await runIn(ctx, `IndexedDbBackupEngine.put({ 'd1': { id: 'd1', name: 'Dossier restauré depuis IndexedDB' } })`);
    const getResult = await runIn(ctx, `IndexedDbBackupEngine.get()`);
    results.push({
      name: 'put() puis get() : la sauvegarde répliquée est bien relue depuis le faux IndexedDB (flux complet)',
      pass: getResult && getResult.d1 && getResult.d1.name === 'Dossier restauré depuis IndexedDB',
      detail: getResult,
    });
    await runIn(ctx, `IndexedDbBackupEngine.restaurer()`);
    const stored = getJSON(ctx, `JSON.parse(localStorage.getItem(STORE_KEY))`);
    results.push({
      name: 'IndexedDbBackupEngine.restaurer() écrit bien la sauvegarde de secours dans localStorage quand elle existe (confirm() accepté)',
      pass: stored.d1 && stored.d1.name === 'Dossier restauré depuis IndexedDB',
      detail: stored,
    });
  }

  // ── 7. Non-régression : deleteAllIndexedDbData() reste un no-op sûr ─────
  {
    const ctx = loadApp(htmlPath);
    const ok = await runIn(ctx, 'deleteAllIndexedDbData()');
    results.push({ name: "deleteAllIndexedDbData() (Phase 1) continue de fonctionner sans exception avec la nouvelle base IndexedDB de secours (nettoyage générique par indexedDB.databases(), aucun couplage par nom nécessaire)", pass: ok === true });
  }

  return results;
}

if (require.main === module) {
  const htmlPath = process.argv[2] || path.join(__dirname, '..', 'FEC_Analyse_v6.html');
  run(htmlPath).then(results => {
    let failed = 0;
    for (const r of results) {
      console.log(`${r.pass ? 'PASS' : 'FAIL'} — ${r.name}${r.pass ? '' : ' :: ' + JSON.stringify(r.detail)}`);
      if (!r.pass) failed++;
    }
    process.exit(failed ? 1 : 0);
  });
}

module.exports = { run };
