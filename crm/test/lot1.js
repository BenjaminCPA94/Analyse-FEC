/* Tests d'acceptation du lot 1 (fiabilité et protection) : accès simultanés, droits côté serveur, intégrité,
 * statuts fiscaux, formulaire public (erreurs réseau, liens expirés ou révoqués, fichiers), sauvegarde et restauration.
 *   node test/lot1.js            (fichiers)      STORE=redis node test/lot1.js   (Redis réel si installé) */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const bridge = require('./redis-bridge');
const upstash = require('./mock-upstash');
const guard = require('../lib/guard');
const { sniff, creationMissing } = require('../lib/app');

let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }
const ROOT = path.join(__dirname, '..');
const PASSWORD = 'motdepasse-test-123';
const REDIS = process.env.STORE === 'redis';

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
  /* ---------- Règles pures (sans serveur) ---------- */
  assert.equal(sniff(Buffer.from('%PDF-1.7 test pdf')), 'application/pdf');
  assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/jpeg');
  assert.equal(sniff(Buffer.from('<html><script>alert(1)</script></html>')), null, 'HTML déguisé refusé');
  assert.equal(sniff(Buffer.from('MZ\x90\x00 executable windows')), null, 'exécutable refusé');
  assert.ok(creationMissing({}, []).length >= 5 && creationMissing({}, []).some(l => /Pièce d’identité/.test(l)), 'champs et pièces obligatoires connus du serveur');
  const base = { clients: [{ id: 'C1', name: 'A', missions: {} }], prospects: [], invoices: [], time: [], onboarding: [], fiscal: [], closing: [], legal: [], collaborators: [] };
  const dup = JSON.parse(JSON.stringify(base)); dup.clients.push({ id: 'C1', name: 'B', missions: {} });
  assert.ok(guard.newViolations(base, dup).some(v => /double/.test(v)), 'identifiant en double détecté');
  const orphan = JSON.parse(JSON.stringify(base)); orphan.invoices.push({ id: 'I1', client: 'C404', source: 'manual', date: '2026-01-01', ht: 10 });
  assert.ok(guard.newViolations(base, orphan).some(v => /client inexistant/.test(v)), 'référence à un client inexistant détectée');
  const legacyBad = JSON.parse(JSON.stringify(dup));
  assert.deepEqual(guard.newViolations(dup, legacyBad), [], 'anomalie déjà présente : non bloquante (données historiques)');
  console.log('✓ Règles serveur : type réel des fichiers, champs obligatoires, intégrité (doublons, références)');

  /* ---------- Serveur ---------- */
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbcrm-lot1-'));
  const port = 19000 + Math.floor(Math.random() * 1000);
  const env = { DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1', CRON_SECRET: 'cron-secret-test', CREATION_LINK_DAYS: '30' };
  let kv = null;
  if (REDIS) {
    kv = bridge.available() && !process.env.MOCK_UPSTASH ? await bridge.start() : await upstash.start();
    Object.assign(env, { KV_REST_API_URL: kv.url, KV_REST_API_TOKEN: kv.token, ADMIN_USERNAME: 'admin1', ADMIN_PASSWORD: PASSWORD });
    console.log(kv.real ? 'Stockage : Redis réel' : 'Stockage : faux Upstash (sans EVAL, repli sur verrou)');
  } else {
    await new Promise((res, rej) => run(['add-user', 'admin1', '--admin'], { ...env, RB_PASSWORD: PASSWORD }).on('exit', c => (c ? rej(new Error('add-user')) : res())));
    console.log('Stockage : fichiers');
  }
  const srv = run([], env);
  await waitFor(srv, 'RB Partners CRM V27');
  const B = `http://127.0.0.1:${port}`;
  const login = async (u, p = PASSWORD) => { const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) }); assert.equal(r.status, 200, 'connexion ' + u); return r.headers.get('set-cookie').split(';')[0]; };
  const api = async (cookie, method, url, body) => { const r = await fetch(B + url, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  const admin = await login('admin1');
  for (const [u, role] of [['assoc1', 'associe'], ['collab1', 'collaborateur'], ['collab2', 'collaborateur']]) assert.equal((await api(admin, 'POST', '/api/users', { username: u, password: PASSWORD, role })).status, 200);
  const collab = await login('collab1'), assoc = await login('assoc1');

  // État initial (enregistré par l'administrateur).
  const init = { ...base, clients: [{ id: 'C1', name: 'ALPHA', missions: { tax: true }, feesBreakdown: { accounting: 1200 }, annualFees: 1200, status: 'Actif' }, { id: 'C2', name: 'BETA', missions: {}, status: 'Actif' }], team27: [{ id: 'TM1', name: 'Alice', role: 'Associé', cost: 120, capacity: 140 }], cabinet26: { name: 'RB' }, time: [] };
  let r = await api(admin, 'PUT', '/api/state', { revision: 0, state: init });
  assert.equal(r.status, 200);
  let rev = r.body.revision;

  /* ---------- 2. Droits appliqués par le serveur ---------- */
  const st = (await api(collab, 'GET', '/api/state')).body;
  assert.equal(st.state.team27[0].cost, null, 'coût horaire masqué au collaborateur');
  const tryAs = async (cookie, mutate) => { const cur = (await api(admin, 'GET', '/api/state')).body; const s = JSON.parse(JSON.stringify(init)); mutate(s); return api(cookie, 'PUT', '/api/state', { revision: cur.revision, state: s }); };
  assert.equal((await tryAs(collab, s => { s.clients = s.clients.filter(c => c.id !== 'C2'); })).status, 403, 'suppression de client refusée');
  assert.equal((await tryAs(collab, s => { s.team27[0].cost = 10; })).status, 200);
  assert.equal((await api(admin, 'GET', '/api/state')).body.state.team27[0].cost, 120, 'coût envoyé par un collaborateur ignoré (valeur serveur conservée)');
  assert.equal((await tryAs(collab, s => { s.clients[0].feesBreakdown.accounting = 99; })).status, 403, 'modification d’honoraires refusée');
  assert.equal((await tryAs(collab, s => { s.cabinet26.name = 'X'; })).status, 403, 'paramètres du cabinet refusés');
  assert.equal((await tryAs(collab, s => { s.clients[1].status = 'Actif'; s.clients[1].onbValidated27 = { forced: true, reason: 'x' }; })).status, 403, 'validation exceptionnelle refusée');
  assert.equal((await tryAs(collab, s => { for (let i = 0; i < 8; i++) s.clients.push({ id: 'N' + i, name: 'N' + i, missions: {} }); })).status, 403, 'import en masse refusé');
  for (const [m, u, b] of [['GET', '/api/users'], ['POST', '/api/users', { username: 'x1', password: PASSWORD }], ['POST', '/api/users/role', { username: 'collab1', role: 'admin' }], ['GET', '/api/backup'], ['GET', '/api/audit'], ['POST', '/api/restore', { backup: {} }]]) assert.equal((await api(collab, m, u, b)).status, 403, `${m} ${u} refusé au collaborateur`);
  // Ce qui est permis : modifier un dossier, ajouter une saisie de temps (le coût masqué n'est pas perdu).
  r = await tryAs(collab, s => { s.team27[0].cost = null; s.clients[1].siren = '123456789'; s.time.push({ id: 'T1', date: '2026-01-02', hours: 2, client: 'C2', user: 'X', createdBy: 'quelquun' }); });
  assert.equal(r.status, 200, 'modification autorisée'); rev = r.body.revision;
  assert.equal((await api(assoc, 'GET', '/api/state')).body.state.team27[0].cost, 120, 'coût visible pour un associé');
  let full = (await api(admin, 'GET', '/api/state')).body.state;
  assert.equal(full.team27[0].cost, 120, 'coût conservé malgré le masquage');
  assert.equal(full.time[0].createdBy, 'collab1', 'auteur posé par le serveur, pas par le navigateur');
  r = await api(collab, 'PUT', '/api/state', { revision: rev, state: { ...full, team27: full.team27.map(m => ({ ...m, cost: null })), time: [] } });
  assert.equal(r.status, 200, 'un collaborateur peut supprimer sa propre saisie de temps'); rev = r.body.revision;
  r = await api(assoc, 'PUT', '/api/state', { revision: rev, state: { ...full, time: [], clients: full.clients.filter(c => c.id !== 'C2') } });
  assert.equal(r.status, 200, 'un associé peut supprimer un client'); rev = r.body.revision;
  const dupState = (await api(admin, 'GET', '/api/state')).body.state; dupState.clients.push({ ...dupState.clients[0] });
  r = await api(admin, 'PUT', '/api/state', { revision: rev, state: dupState });
  assert.equal(r.status, 422, 'doublon d’identifiant refusé même pour un administrateur');
  const journal = (await api(admin, 'GET', '/api/audit?limit=50')).body.items;
  assert.ok(journal.some(e => e.action === 'enregistrement refusé (droits)' && e.user === 'collab1'), 'refus journalisé');
  assert.ok(journal.some(e => e.action === 'enregistrement' && e.user === 'assoc1' && e.changes.some(c => c.op === 'suppression' && c.name === 'BETA')), 'suppression journalisée avec l’auteur réel');
  assert.equal((await api(admin, 'POST', '/api/users/role', { username: 'collab1', role: 'manager' })).status, 200);
  assert.equal((await api(collab, 'GET', '/api/session')).body.role, 'manager', 'rôle modifié par l’administrateur');
  assert.equal((await api(admin, 'POST', '/api/users/revoke', { username: 'collab1' })).status, 200);
  assert.equal((await api(collab, 'GET', '/api/session')).status, 401, 'session révoquée');
  console.log('✓ Droits côté serveur : collaborateur bloqué même en appelant l’API, coûts masqués, auteur réel, journal, rôles, révocation');

  /* ---------- 1. Enregistrements simultanés ---------- */
  const cur = (await api(admin, 'GET', '/api/state')).body;
  const race = await Promise.all(Array.from({ length: 8 }, (_, i) => api(i % 2 ? admin : assoc, 'PUT', '/api/state', { revision: cur.revision, state: { ...cur.state, note: i } })));
  assert.equal(race.filter(x => x.status === 200).length, 1, 'une seule écriture acceptée pour une même révision');
  assert.equal(race.filter(x => x.status === 409).length, 7, 'les autres sont refusées (conflit), aucune n’écrase');
  console.log('✓ Écriture atomique : 8 enregistrements simultanés sur la même version → 1 accepté, 7 conflits');

  const browser = await chromium.launch();
  const open = async (user) => {
    const ctx = await browser.newContext(), page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(B); await page.fill('#login_user', user); await page.fill('#login_password', PASSWORD); await page.click('#login25 button');
    await page.waitForFunction(() => typeof shared25 !== 'undefined' && shared25.ready);
    return { ctx, page, errs };
  };
  const A = await open('admin1'), S = await open('assoc1');
  // Deux personnes modifient des clients différents, puis le même champ du même client.
  await A.page.evaluate(() => { cfind('C1').siren = '111111111'; save(); });
  await A.page.waitForFunction(() => !shared25.busy && !shared25.pending);
  await S.page.evaluate(() => { state.clients.push({ id: 'C9', name: 'GAMMA', missions: {}, status: 'Actif' }); cfind('C1').group27 = 'Groupe S'; save(); });
  await S.page.waitForFunction(() => !shared25.busy && !shared25.pending && !shared25.error);
  let srvState = (await api(admin, 'GET', '/api/state')).body.state;
  assert.deepEqual([srvState.clients.find(c => c.id === 'C1').siren, srvState.clients.find(c => c.id === 'C1').group27, Boolean(srvState.clients.find(c => c.id === 'C9'))], ['111111111', 'Groupe S', true], 'modifications des deux personnes conservées (fusion)');
  await A.page.evaluate(() => { cfind('C1').name = 'ALPHA (A)'; save(); });
  await A.page.waitForFunction(() => !shared25.busy && !shared25.pending);
  await S.page.evaluate(() => { cfind('C1').name = 'ALPHA (S)'; save(); });
  await S.page.waitForFunction(() => !shared25.busy && !shared25.pending && sync27.conflicts.length > 0);
  const conflict = await S.page.evaluate(() => ({ list: sync27.conflicts.map(c => c.path.join('/')), name: cfind('C1').name, modal: document.body.innerText.includes('Enregistrement simultané'), draft: Boolean(draftGet27()) }));
  assert.ok(conflict.list.includes('clients/#C1/name') && conflict.name === 'ALPHA (A)' && conflict.modal && conflict.draft, 'même champ modifié des deux côtés : version serveur gardée, écart affiché, brouillon conservé ' + JSON.stringify(conflict));
  await S.page.click('button:has-text("Reprendre ma valeur")');
  await S.page.waitForFunction(() => !shared25.busy && !shared25.pending);
  srvState = (await api(admin, 'GET', '/api/state')).body.state;
  assert.equal(srvState.clients.find(c => c.id === 'C1').name, 'ALPHA (S)', 'valeur reprise volontairement');
  console.log('✓ Accès simultanés : fusion élément par élément, conflit affiché avec reprise maîtrisée, brouillon local');

  /* ---------- 3. Statuts fiscaux ---------- */
  const fisc = await A.page.evaluate(() => {
    const tva = { type: 'TVA' }, is = { type: 'IS' };
    return [fiscDone27(tva, 'Validé'), fiscCheck27(tva, 'Validé'), fiscDone27(tva, 'Envoyée'), fiscDone27(tva, 'Validée – à déposer'), fiscDone27(tva, 'Déposée'), fiscDone27(tva, 'Accusé de réception'), fiscDone27(is, 'Déposée'), fiscDone27(is, 'Payée'), fiscCheck27(is, 'Déclarée'), fiscDone27(tva, 'N.A')];
  });
  assert.deepEqual(fisc, [false, true, false, false, true, true, false, true, true, true], 'validée ≠ déposée ; paiement ≠ dépôt ; anciens statuts à vérifier');
  console.log('✓ Fiscalité : « Validé » ou « Envoyée » restent à déposer (liste à vérifier), dépôt et paiement distincts');

  /* ---------- Formulaire public : erreurs réseau, liens, fichiers, contrôle ---------- */
  await A.page.evaluate(() => { creation27().items.push({ id: 'CRX', name: 'Société Test', fields: { denomination: 'Société Test' }, files: [] }); save(); });
  const token = await A.page.evaluate(async () => { await crLink27(crFind27('CRX')); await new Promise(r => setTimeout(r, 300)); return crFind27('CRX').token; });
  const chk = await fetch(`${B}/api/public/creation?t=${token}`); if (chk.status !== 200) throw new Error('formulaire public indisponible : ' + chk.status + ' ' + (await chk.text()) + ' jeton ' + token);
  const pubCtx = await browser.newContext(), pub = await pubCtx.newPage();
  await pub.goto(B + '/creation/' + token); await pub.waitForSelector('#f_capital');
  let failNext = true;
  await pub.route('**/api/public/creation?t=*', route => { if (route.request().method() === 'POST' && failNext) { failNext = false; return route.abort('failed'); } return route.continue(); });
  await pub.fill('#f_capital', '1 000 €');
  await pub.waitForFunction(() => /Non enregistré/.test(document.getElementById('saved').textContent), null, { timeout: 8000 });
  await pub.fill('#f_seat', '1 rue du Test');
  await pub.waitForFunction(() => /Enregistré à/.test(document.getElementById('saved').textContent), null, { timeout: 8000 });
  let sub = (await api(admin, 'POST', '/api/creation/list', { tokens: [token] })).body.items[0];
  assert.deepEqual([sub.fields.capital, sub.fields.seat], ['1 000 €', '1 rue du Test'], 'après une erreur réseau, les sauvegardes suivantes passent (rien de perdu)');
  // Envoi final refusé par le serveur s'il manque des éléments obligatoires.
  r = await fetch(`${B}/api/public/creation?t=${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { capital: '1' }, final: true, rev: sub.rev }) });
  assert.equal(r.status, 422, 'soumission finale incomplète refusée par le serveur');
  r = await fetch(`${B}/api/public/creation?t=${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { capital: 'vieux' }, rev: 0 }) });
  assert.equal(r.status, 409, 'version périmée (autre onglet) refusée');
  r = await fetch(`${B}/api/public/creation/file?t=${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'docIdDir', name: 'cni.pdf', type: 'application/pdf', data: Buffer.from('<script>alert(1)</script> pas un pdf').toString('base64') }) });
  assert.equal(r.status, 415, 'fichier déguisé en PDF refusé (type réel vérifié)');
  r = await fetch(`${B}/api/public/creation/file?t=${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'docIdDir', name: 'cni.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4 vraie piece').toString('base64') }) });
  assert.equal(r.status, 200, 'vrai PDF accepté');
  // Contrôle cabinet puis modification du client : arbitrage, pas d'écrasement silencieux.
  await A.page.evaluate(async () => { await pullCreation27(true); crStage27('CRX', 'Contrôlé'); crFind27('CRX').fields.capital = '1 000 € (corrigé cabinet)'; save(); });
  sub = (await api(admin, 'POST', '/api/creation/list', { tokens: [token] })).body.items[0];
  r = await fetch(`${B}/api/public/creation?t=${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { ...sub.fields, capital: '2 000 €' }, rev: sub.rev }) });
  assert.equal(r.status, 200);
  const arb = await A.page.evaluate(async () => { cr27.pulling = false; await pullCreation27(true); const it = crFind27('CRX'); return [it.fields.capital, it.clientChanges?.capital?.value]; });
  assert.deepEqual(arb, ['1 000 € (corrigé cabinet)', '2 000 €'], 'modification du client après contrôle : à arbitrer, correction du cabinet conservée');
  // Révocation, expiration.
  assert.equal((await api(admin, 'POST', '/api/creation/state', { token, action: 'revoke' })).status, 200);
  assert.equal((await fetch(`${B}/api/public/creation?t=${token}`)).status, 410, 'lien révoqué : plus d’accès');
  await pub.goto(B + '/creation/' + token); await pub.waitForSelector('.center:has-text("désactivé")');
  assert.equal((await api(admin, 'POST', '/api/creation/state', { token, action: 'reopen' })).status, 200);
  assert.equal((await fetch(`${B}/api/public/creation?t=${token}`)).status, 200, 'lien réactivé');
  assert.equal((await api(admin, 'POST', '/api/creation/state', { token, action: 'close' })).status, 200);
  assert.equal((await fetch(`${B}/api/public/creation?t=${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: {} }) })).status, 410, 'dossier clôturé : plus modifiable');
  if (REDIS && kv) {
    const raw = JSON.parse(await kv.run(['GET', 'rb:kv:cr:link:' + token]));
    raw.expiresAt = '2020-01-01T00:00:00.000Z'; delete raw.closedAt;
    await kv.run(['SET', 'rb:kv:cr:link:' + token, JSON.stringify(raw)]);
  } else {
    const f = path.join(dataDir, 'kv', encodeURIComponent('cr:link:' + token) + '.json'), raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    raw.expiresAt = '2020-01-01T00:00:00.000Z'; delete raw.closedAt; fs.writeFileSync(f, JSON.stringify(raw));
  }
  r = await fetch(`${B}/api/public/creation?t=${token}`);
  assert.ok(r.status === 410 && /expiré/.test((await r.json()).error), 'lien expiré : plus d’accès');
  console.log('✓ Formulaire : erreur réseau sans blocage, envoi final contrôlé, onglets, type réel des fichiers, arbitrage après contrôle, liens révoqués/clôturés/expirés');

  /* ---------- 15. Sauvegarde et restauration (données + justificatifs) ---------- */
  await api(admin, 'POST', '/api/creation/state', { token, action: 'reopen' });
  const backup = (await api(admin, 'GET', '/api/backup?files=1')).body;
  assert.ok(backup.format === 'RB27-backup' && backup.creation.files.some(f => f.data) && backup.users.length >= 4, 'sauvegarde complète téléchargée');
  const fileId = backup.creation.files[0].id;
  const before = (await api(admin, 'GET', '/api/state')).body;
  r = await api(admin, 'PUT', '/api/state', { revision: before.revision, state: { ...before.state, clients: before.state.clients.filter(c => c.id !== 'C9') } });
  assert.equal(r.status, 200);
  await fetch(`${B}/api/public/creation/file/delete?t=${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: fileId }) });
  assert.equal((await fetch(`${B}/api/creation/file?t=${token}&id=${fileId}`, { headers: { Cookie: admin } })).status, 404, 'justificatif supprimé avant restauration');
  const prev = (await api(admin, 'POST', '/api/restore', { backup })).body.preview;
  assert.ok(prev.backup.clients === prev.current.clients + 1 && prev.filesWithData >= 1, 'aperçu avant restauration');
  r = await api(admin, 'POST', '/api/restore', { backup, apply: true });
  assert.equal(r.status, 200);
  const after = (await api(admin, 'GET', '/api/state')).body;
  assert.ok(after.state.clients.some(c => c.id === 'C9') && after.revision === r.body.revision, 'données restaurées');
  const fr = await fetch(`${B}/api/creation/file?t=${token}&id=${fileId}`, { headers: { Cookie: admin } });
  assert.ok(fr.status === 200 && (await fr.text()) === '%PDF-1.4 vraie piece', 'justificatif restauré à l’identique');
  // Sauvegarde quotidienne (tâche planifiée) protégée par secret.
  assert.equal((await fetch(B + '/api/cron/backup')).status, 401, 'tâche planifiée protégée');
  r = await fetch(B + '/api/cron/backup', { headers: { Authorization: 'Bearer cron-secret-test' } });
  assert.equal(r.status, 200);
  const list = (await api(admin, 'GET', '/api/backups')).body.items;
  assert.ok(list.length === 1 && list[0].clients === after.state.clients.length, 'sauvegarde quotidienne enregistrée');
  assert.equal((await api(admin, 'POST', '/api/restore', { date: list[0].date })).status, 200, 'restauration depuis une sauvegarde quotidienne (aperçu)');
  console.log('✓ Sauvegardes : export complet, aperçu, restauration des données et des justificatifs vérifiée, sauvegarde quotidienne protégée');

  /* ---------- Rapprochements groupés : seulement sans ambiguïté, avec aperçu ---------- */
  const grp = await A.page.evaluate(() => {
    exc27().items.push({ id: 'EXA', client: 'C1', name: 'Mission A', statut: 'Terminé', lancerFact: 'Oui', fees: 500, date: '2026-01-10' }, { id: 'EXB', client: 'C1', name: 'Mission B', statut: 'Terminé', lancerFact: 'Oui', fees: 700, date: '2026-01-10' });
    state.pennylaneInvoices = [{ id: 'PLA', source: 'pennylane', client: 'C1', category: 'Travaux exceptionnels', status: 'Finalisée', number: 'FA-1', date: '2026-02-01', amount: 500 }, { id: 'PLB', source: 'pennylane', client: 'C1', category: 'Travaux exceptionnels', status: 'Finalisée', number: 'FA-2', date: '2026-02-01', amount: 650 }];
    allocCache27 = null;
    const all = suggestions27().filter(x => x.kind === 'pl').length, exact = exactSuggestions27().map(x => x.inv.number + '>' + x.key);
    window.confirm = () => true; confirmExact27();
    return { all, exact, a: billState27('X|EXA').label, b: billState27('X|EXB').label };
  });
  assert.deepEqual(grp, { all: 4, exact: [], a: 'À facturer', b: 'À facturer' }, 'deux factures candidates pour chaque mission : aucune confirmation groupée ' + JSON.stringify(grp));
  const grp2 = await A.page.evaluate(() => { state.pennylaneInvoices = state.pennylaneInvoices.filter(i => i.id === 'PLA'); exc27().items = exc27().items.filter(w => w.id !== 'EXB'); allocCache27 = null; const exact = exactSuggestions27().length; confirmExact27(); return [exact, billState27('X|EXA').label, billingKey27().links.PLA?.[0]?.method]; });
  assert.deepEqual(grp2, [1, 'Facturé', 'validé (groupé)'], 'proposition unique et montant identique : confirmation groupée tracée');
  console.log('✓ Rapprochements groupés : uniquement les cas sans ambiguïté, avec aperçu et trace');

  /* ---------- Injection de code par des données importées ---------- */
  const xss = await A.page.evaluate(async () => {
    const evil = ['<img src=x onerror="window.__xss=1">', "x');window.__xss=2;//", 'x"><svg onload="window.__xss=3">', '${window.__xss=4}'];
    evil.forEach((n, i) => { const c = newClient26({ name: n, siren: '', legalForm: 'SAS', contact: n, email: '' }); c.id = 'XSS' + i; c.status = i % 2 ? 'Onboarding' : 'Actif'; Object.assign(c.missions, { tax: true, annualAccounts: true, legal: true }); c.people27 = { manager: n, collab: n }; c.group27 = n; state.clients.push(c); exc27().items.push({ id: 'XW' + i, client: 'XSS' + i, name: n, statut: 'Terminé', fees: 10, date: '2025-01-01', desc: n }); creation27().items.push({ id: 'XC' + i, name: n, fields: { denomination: n, capital: n }, files: [] }); state.prospects.push({ id: 'XP' + i, name: n, contact: n, stage: 'Nouveau', value: 0 }); });
    save();
    const fails = [];
    for (const p of ['cabinetdash', 'clients', 'onboarding', 'fiscal', 'closing', 'legal', 'exceptional', 'billing', 'creation', 'prospects', 'time', 'capacity', 'fees']) { try { routePage(p); } catch (e) { fails.push(p + ': ' + e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' | ')); } await new Promise(r => setTimeout(r, 60)); }
    if (fails.length) return fails;
    for (let i = 0; i < evil.length; i++) { openClient('XSS' + i); await new Promise(r => setTimeout(r, 40)); crOpen27('XC' + i); await new Promise(r => setTimeout(r, 40)); closeModal(); }
    const g = document.getElementById('globalSearch'); if (g) { g.value = 'img'; g.dispatchEvent(new Event('input')); }
    await new Promise(r => setTimeout(r, 200));
    return window.__xss || 0;
  });
  assert.equal(xss, 0, 'aucun code exécuté depuis un nom de client, de travail, de dossier ou de prospect');
  console.log('✓ Injection : noms piégés (HTML, attributs, guillemets) affichés sur tous les écrans sans exécution');

  assert.deepEqual([...A.errs, ...S.errs], [], 'erreurs JavaScript');
  await browser.close(); srv.kill(); if (kv?.stop) kv.stop(); else kv?.server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('\nLot 1 : tous les tests d’acceptation sont passés.');
})().catch(e => { console.error('\n✗ ÉCHEC :', e.message); process.exit(1); });
