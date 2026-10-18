/* Tests d'acceptation du lot 2 (cohérence) : identité client et imports (aperçu, erreurs, rapprochements ambigus,
 * cellules vides, application en une fois, rapport, retour arrière), historique des paramètres, enregistrement par élément.
 *   node test/lot2.js        STORE=redis node test/lot2.js */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const bridge = require('./redis-bridge');
const upstash = require('./mock-upstash');

let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }
const ROOT = path.join(__dirname, '..'), FIX = path.join(__dirname, 'fixtures');
const PASSWORD = 'motdepasse-test-123';
const REDIS = process.env.STORE === 'redis';
const SIREN_A = '732829320', SIREN_B = '552100554';

function run(args, env) { return spawn(process.execPath, [path.join(ROOT, 'server.js'), ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); }
function waitFor(proc, text) {
  return new Promise((resolve, reject) => {
    let out = '';
    proc.stdout.on('data', d => { out += d; if (out.includes(text)) resolve(out); });
    proc.stderr.on('data', d => { out += d; });
    proc.on('exit', code => reject(new Error('serveur arrêté (' + code + ') : ' + out)));
  });
}

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbcrm-lot2-'));
  const port = 20000 + Math.floor(Math.random() * 1000);
  const env = { DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1' };
  let kv = null;
  if (REDIS) {
    kv = bridge.available() && !process.env.MOCK_UPSTASH ? await bridge.start() : await upstash.start();
    Object.assign(env, { KV_REST_API_URL: kv.url, KV_REST_API_TOKEN: kv.token, ADMIN_USERNAME: 'admin1', ADMIN_PASSWORD: PASSWORD });
    console.log(kv.real ? 'Stockage : Redis réel' : 'Stockage : faux Upstash');
  } else {
    await new Promise((res, rej) => run(['add-user', 'admin1', '--admin'], { ...env, RB_PASSWORD: PASSWORD }).on('exit', c => (c ? rej(new Error('add-user')) : res())));
    console.log('Stockage : fichiers');
  }
  const srv = run([], env);
  await waitFor(srv, 'RB Partners CRM V27');
  const B = `http://127.0.0.1:${port}`;
  const login = async u => { const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASSWORD }) }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; };
  const api = async (cookie, method, url, body) => { const r = await fetch(B + url, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  const admin = await login('admin1');
  await api(admin, 'POST', '/api/users', { username: 'collab1', password: PASSWORD, role: 'collaborateur' });
  await api(admin, 'POST', '/api/users', { username: 'assoc1', password: PASSWORD, role: 'associe' });

  const browser = await chromium.launch();
  const open = async user => {
    const ctx = await browser.newContext(), page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(B); await page.fill('#login_user', user); await page.fill('#login_password', PASSWORD); await page.click('#login25 button');
    await page.waitForFunction(() => typeof shared25 !== 'undefined' && shared25.ready);
    return { page, errs };
  };
  const A = await open('admin1'), page = A.page;
  const settle = p => p.waitForFunction(() => !shared25.busy && !shared25.pending && !shared25.error, null, { timeout: 15000 }).catch(async e => { throw new Error('enregistrement bloqué : ' + await p.evaluate(() => JSON.stringify({ e: shared25.error, c: shared25.conflict, p: Boolean(shared25.pending), b: shared25.busy }))); });
  await page.evaluate(() => { state = load(); Object.assign(state, { clients: [], prospects: [], invoices: [], time: [], onboarding: [], fiscal: [], closing: [], legal: [] }); init25(); save(); render(); });
  await settle(page);
  await page.evaluate(([sb]) => {
    const mk = (name, extra) => { const c = newClient26({ name, siren: '', legalForm: '', contact: '', email: '' }); c.status = 'Actif'; Object.assign(c, extra); state.clients.push(c); return c; };
    mk('IDENT DUPONT', { siren: sb }); mk('IDENT MARTIN', {}); mk('IDENT VIDE', { typologie27: 'EC FR-', people27: { associe: 'Ancien Associé' } });
    save();
  }, [SIREN_B]);
  await settle(page);

  /* ---------- 7 & 8. Import : aperçu, identité, erreurs, rapprochements ambigus ---------- */
  await page.evaluate(() => routePage('clients'));
  const before = await page.evaluate(() => JSON.stringify(state.clients));
  await page.setInputFiles('input[type=file][accept=".xlsx"]', path.join(FIX, 'identity_test.xlsx'));
  await page.waitForSelector('text=Aperçu de l’import');
  const pv = await page.evaluate(() => { const s = imp27.pending.summary; return { created: s.created.map(c => c.name + '|' + c.siren).sort(), amb: s.ambiguous.map(a => a.row), err: s.errors.map(e => e.msg).join(' / '), repl: s.replaced.map(r => r.c.name + ':' + r.k), kept: imp27.pending.result.kept, unchanged: JSON.stringify(state.clients) }; });
  assert.equal(pv.unchanged, before, 'rien n’est modifié avant validation de l’aperçu');
  assert.deepEqual(pv.created, ['IDENT BADSIREN|123456781', `IDENT DUPONT|${SIREN_A}`], 'même nom mais SIREN différent : nouvelle fiche, pas de fusion');
  assert.deepEqual(pv.amb, ['SARL IDENT MARTIN'], 'nom proche sans SIREN : rapprochement à trancher');
  assert.ok(/123456781 invalide/.test(pv.err), 'SIREN invalide expliqué : ' + pv.err);
  assert.ok(pv.repl.includes('IDENT VIDE:people27.associe') && !pv.repl.some(x => x.includes('typologie')), 'valeur remplacée listée, cellule vide sans effet');
  const martin = await page.evaluate(() => state.clients.find(c => c.name === 'IDENT MARTIN').id);
  await page.selectOption('select[data-amb]', 'C:' + martin);
  await page.click('button:has-text("Recalculer avec mes choix")');
  await page.waitForFunction(() => imp27.pending && !imp27.pending.summary.ambiguous.length);
  assert.ok(await page.evaluate(() => imp27.pending.summary.modified.some(m => m.c.name === 'IDENT MARTIN')), 'ligne rattachée après choix');
  await page.click('button:has-text("Appliquer l’import")');
  await page.waitForFunction(() => !imp27.pending && state.imports27?.[0]?.undoable);
  await settle(page);
  const ap = await page.evaluate(() => {
    const by = n => state.clients.filter(c => c.name === n);
    return { dup: by('IDENT DUPONT').map(c => c.siren).sort(), st: by('IDENT BADSIREN')[0]?.status, vide: [by('IDENT VIDE')[0].typologie27, people27(by('IDENT VIDE')[0], 'associe')], martin: people27(by('IDENT MARTIN')[0], 'associe'), sarl: by('SARL IDENT MARTIN').length, rep: state.imports27?.[0] };
  });
  assert.deepEqual(ap.dup, [SIREN_A, SIREN_B].sort(), 'deux sociétés de SIREN différents restent distinctes');
  assert.equal(ap.st, 'À qualifier', 'client créé par import : à qualifier, jamais actif par défaut');
  assert.deepEqual(ap.vide, ['EC FR-', 'Nouvel Associé'], 'cellule vide n’efface pas, valeur renseignée remplace');
  assert.ok(ap.martin === 'Alice Test' && ap.sarl === 0, 'rattachement choisi appliqué, pas de doublon');
  assert.ok(ap.rep && ap.rep.created === 2 && ap.rep.undoable, 'rapport d’import enregistré ' + JSON.stringify(ap.rep));
  const srvState = (await api(admin, 'GET', '/api/state')).body.state;
  assert.equal(srvState.clients.filter(c => c.name === 'IDENT DUPONT').length, 2, 'import enregistré sur le serveur');
  assert.ok((await api(admin, 'GET', '/api/audit?limit=20')).body.items.some(e => e.action === 'import appliqué' && e.user === 'admin1'), 'import journalisé');
  // Retour arrière contrôlé : un client modifié depuis l'import est conservé.
  await page.evaluate(() => { state.clients.find(c => c.name === 'IDENT MARTIN').group27 = 'Modifié après import'; save(); });
  await settle(page);
  await page.evaluate(() => { window.confirm = () => true; });
  await page.evaluate(id => undoImport27(id), ap.rep.id);
  await page.waitForSelector('text=Import annulé');
  await settle(page);
  const un = await page.evaluate(() => ({ dup: state.clients.filter(c => c.name === 'IDENT DUPONT').length, bad: state.clients.some(c => c.name === 'IDENT BADSIREN'), vide: people27(state.clients.find(c => c.name === 'IDENT VIDE'), 'associe'), martin: state.clients.find(c => c.name === 'IDENT MARTIN').group27, rec: state.imports27[0] }));
  assert.deepEqual([un.dup, un.bad, un.vide, un.martin], [1, false, 'Ancien Associé', 'Modifié après import'], 'import annulé, sauf l’élément modifié depuis ' + JSON.stringify(un));
  assert.ok(un.rec.undoneAt && un.rec.undoConflicts === 1, 'annulation tracée avec le nombre d’éléments conservés');
  await page.click('.modal button:has-text("Fermer")');
  // Annuler l'aperçu : aucune modification.
  const before2 = await page.evaluate(() => JSON.stringify(state.clients));
  await page.setInputFiles('input[type=file][accept=".xlsx"]', path.join(FIX, 'identity_test.xlsx'));
  await page.waitForSelector('text=Aperçu de l’import');
  await page.click('.modal button:has-text("Annuler")');
  assert.equal(await page.evaluate(() => JSON.stringify(state.clients)), before2, 'aperçu annulé : aucune modification');
  // Droits : import réservé (le serveur refuse aussi le stockage du retour arrière à un collaborateur).
  const collab = await login('collab1');
  assert.equal((await api(collab, 'POST', '/api/imports', { meta: { id: 'IMP_test1' }, changes: [] })).status, 403, 'import refusé au collaborateur (serveur)');
  console.log('✓ Imports : aperçu sans modification, SIREN contrôlés, homonymes de SIREN différents distincts, rapprochements ambigus tranchés, cellules vides, application en une fois, rapport, retour arrière contrôlé');

  /* ---------- 9. Historique des paramètres ---------- */
  const hist = await page.evaluate(() => {
    const c = state.clients.find(x => x.name === 'IDENT VIDE');
    c.missions.tax = true; c.vatRegime = 'Mensuelle'; save();
    row27('fiscm', c.id, 2026, true)['TVA-05'] = 'Déposée'; row27('fiscm', c.id, 2026, true)['TVA-01'] = 'Déposée'; save();
    const y25 = obligations27(c, 2025).filter(o => o.type === 'TVA').length;
    c.vatRegime = 'Trimestrielle'; save();
    const i = c.hist27.vatRegime.length - 1; histFrom27(c.id, 'vatRegime', i, '2026-04-01');
    const ob = obligations27(c, 2026).filter(o => o.type === 'TVA');
    openClient(c.id);
    return { y25, y25b: obligations27(c, 2025).filter(o => o.type === 'TVA').length, normal: ob.filter(o => !o.kept).map(o => o.key), kept: ob.filter(o => o.kept).map(o => o.key), y27: obligations27(c, 2027).filter(o => o.type === 'TVA').map(o => o.key), panel: document.body.innerText.includes('Historique des paramètres') && document.body.innerText.includes('Régime de TVA'), entries: c.hist27.vatRegime.map(e => e.from + '=' + e.v) };
  });
  assert.equal(hist.y25, 12); assert.equal(hist.y25b, 12, 'exercice précédent non réécrit');
  assert.deepEqual(hist.normal, ['TVA-01', 'TVA-02', 'TVA-03', 'TVA-04', 'TVA-07', 'TVA-10'], 'mensuel jusqu’en mars, trimestriel à partir d’avril');
  assert.deepEqual(hist.kept, ['TVA-05'], 'déclaration déjà déposée sous l’ancien régime conservée');
  assert.deepEqual(hist.y27, ['TVA-01', 'TVA-04', 'TVA-07', 'TVA-10']);
  assert.ok(hist.panel && hist.entries[0].startsWith('0000-01-01=Mensuelle') && hist.entries[1] === '2026-04-01=Trimestrielle', 'historique visible et éditable ' + JSON.stringify(hist.entries));
  await settle(page);
  const saved = (await api(admin, 'GET', '/api/state')).body.state.clients.find(c => c.name === 'IDENT VIDE').hist27.vatRegime;
  assert.equal(saved[1].from, '2026-04-01', 'historique enregistré sur le serveur');
  console.log('✓ Historique : changement de régime daté, exercices et mois antérieurs inchangés, obligation déjà traitée conservée');

  /* ---------- Enregistrement par élément ---------- */
  const st = (await api(admin, 'GET', '/api/state')).body;
  const ids = st.state.clients.map(c => c.id);
  let r = await api(admin, 'PATCH', '/api/state', { baseRevision: st.revision, ops: [{ path: ['clients', '#' + ids[0]], value: { ...st.state.clients[0], group27: 'G1' } }] });
  assert.ok(r.status === 200 && r.body.rebased === false, 'modification d’un élément');
  r = await api(admin, 'PATCH', '/api/state', { baseRevision: st.revision, ops: [{ path: ['clients', '#' + ids[1]], value: { ...st.state.clients[1], group27: 'G2' } }] });
  assert.ok(r.status === 200 && r.body.rebased === true, 'version de départ dépassée mais autre élément : appliqué sur la version la plus récente');
  r = await api(admin, 'PATCH', '/api/state', { baseRevision: st.revision, ops: [{ path: ['clients', '#' + ids[0]], value: { ...st.state.clients[0], group27: 'G3' } }] });
  assert.ok(r.status === 409 && r.body.conflicts?.[0]?.join('/') === 'clients/#' + ids[0], 'même élément modifié entre-temps : conflit');
  const now = (await api(admin, 'GET', '/api/state')).body.state.clients;
  assert.deepEqual([now.find(c => c.id === ids[0]).group27, now.find(c => c.id === ids[1]).group27], ['G1', 'G2'], 'aucune modification écrasée');
  r = await api(collab, 'PATCH', '/api/state', { baseRevision: (await api(admin, 'GET', '/api/state')).body.revision, ops: [{ path: ['clients', '#' + ids[0]], value: null }] });
  assert.equal(r.status, 403, 'droits appliqués aussi aux modifications par élément');
  r = await api(admin, 'PATCH', '/api/state', { baseRevision: 1, ops: [{ path: ['__proto__', 'x'], value: 1 }] });
  assert.equal(r.status, 400, 'chemin dangereux refusé');
  // Deux personnes sur des clients différents : aucune ne voit de conflit, chacune reçoit les modifications de l'autre.
  const S = await open('assoc1');
  await page.evaluate(async () => { const r = await fetch('/api/state'); const x = await r.json(); state = x.state; shared25.revision = x.revision; shared25.base = JSON.stringify(x.state); });
  await page.evaluate(n => { state.clients.find(c => c.name === n).group27 = 'Par A'; save(); }, 'IDENT VIDE');
  await settle(page);
  await S.page.evaluate(n => { state.clients.find(c => c.name === n).group27 = 'Par S'; save(); }, 'IDENT MARTIN');
  await settle(S.page);
  const both = await S.page.evaluate(() => ({ a: state.clients.find(c => c.name === 'IDENT VIDE').group27, s: state.clients.find(c => c.name === 'IDENT MARTIN').group27, ops: shared25.lastOps, modal: document.body.innerText.includes('Enregistrement simultané') }));
  assert.deepEqual(both, { a: 'Par A', s: 'Par S', ops: 1, modal: false }, 'enregistrement par élément sans conflit, modifications du collègue récupérées ' + JSON.stringify(both));
  const fin = (await api(admin, 'GET', '/api/state')).body.state.clients;
  assert.deepEqual([fin.find(c => c.name === 'IDENT VIDE').group27, fin.find(c => c.name === 'IDENT MARTIN').group27], ['Par A', 'Par S']);
  console.log('✓ Enregistrement par élément : seul l’élément modifié est envoyé, version d’un collègue conservée, conflit seulement sur le même élément, droits appliqués');

  assert.deepEqual([...A.errs, ...S.errs], [], 'erreurs JavaScript');
  await browser.close(); srv.kill(); if (kv?.stop) kv.stop(); else kv?.server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('\nLot 2 : tous les tests d’acceptation sont passés.');
})().catch(e => { console.error('\n✗ ÉCHEC :', e.message); process.exit(1); });
