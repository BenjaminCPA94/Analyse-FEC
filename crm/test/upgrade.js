/* Test de mise à jour : données créées par la version en production (branche main), puis reprises par cette version.
 * Vérifie : comptes conservés (admin reste admin, ancien « user » devient collaborateur), données intactes,
 * sauvegarde « avant mise à jour » prise avant toute écriture et restaurable, ouverture sans erreur JavaScript.
 *   node test/upgrade.js   STORE=redis node test/upgrade.js   (OLD_REF=<commit> pour choisir la version de départ) */
'use strict';
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const bridge = require('./redis-bridge');
const upstash = require('./mock-upstash');

let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'))); }
const ROOT = path.join(__dirname, '..');
const PASSWORD = 'motdepasse-test-123';
// Version en production avant la mise à jour V27 (déployée le 18/10/2026).
const REF = process.env.OLD_REF || 'c412d3e';

function run(dir, args, env) { return spawn(process.execPath, [path.join(dir, 'server.js'), ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); }
function waitFor(proc, text) {
  return new Promise((resolve, reject) => {
    let out = '';
    proc.stdout.on('data', d => { out += d; if (out.includes(text)) resolve(out); });
    proc.stderr.on('data', d => { out += d; });
    proc.on('exit', code => reject(new Error('serveur arrêté (' + code + ') : ' + out)));
  });
}
const stop = p => new Promise(r => { p.once('exit', r); p.kill(); });

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rbcrm-upgrade-')), oldDir = path.join(tmp, 'old'), dataDir = path.join(tmp, 'data');
  fs.mkdirSync(oldDir); fs.mkdirSync(dataDir);
  execSync(`git archive ${REF} crm | tar -x -C ${oldDir}`, { cwd: path.join(ROOT, '..') });
  const OLD = path.join(oldDir, 'crm'), port = 23000 + Math.floor(Math.random() * 1000), B = `http://127.0.0.1:${port}`;
  const env = { DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1' };
  const login = async u => { const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASSWORD }) }); assert.equal(r.status, 200, 'connexion ' + u); return { cookie: r.headers.get('set-cookie').split(';')[0], body: await r.json() }; };
  const api = async (cookie, method, url, body) => { const r = await fetch(B + url, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  const browser = await chromium.launch();

  // 1. Version en production : comptes et données saisies dans l'interface.
  let kv = null;
  if (process.env.STORE === 'redis') {
    kv = bridge.available() ? await bridge.start() : await upstash.start();
    Object.assign(env, { KV_REST_API_URL: kv.url, KV_REST_API_TOKEN: kv.token, ADMIN_USERNAME: 'admin1', ADMIN_PASSWORD: PASSWORD });
    console.log(kv.real ? 'Stockage : Redis réel' : 'Stockage : faux Upstash');
  } else await new Promise((res, rej) => run(OLD, ['add-user', 'admin1', '--admin'], { ...env, RB_PASSWORD: PASSWORD }).on('exit', c => (c ? rej(new Error('add-user')) : res())));
  let srv = run(OLD, [], env); await waitFor(srv, 'RB Partners');
  const a0 = await login('admin1');
  assert.equal((await api(a0.cookie, 'POST', '/api/users', { username: 'collegue', password: PASSWORD, role: 'user' })).status, 200);
  let page = await (await browser.newContext()).newPage();
  await page.goto(B); await page.fill('#login_user', 'admin1'); await page.fill('#login_password', PASSWORD); await page.click('#login25 button');
  await page.waitForFunction(() => typeof shared25 !== 'undefined' && shared25.ready);
  await page.evaluate(() => {
    const c = newClient26({ name: 'CLIENT HISTORIQUE', siren: '732829320', legalForm: 'SAS', contact: 'M. Test', email: 't@test.fr' });
    Object.assign(c, { status: 'Actif', annualFees: 3600 }); state.clients.push(c);
    state.prospects.push({ id: 'P_OLD', name: 'PROSPECT HISTORIQUE', stage: 'RDV réalisé', owner: 'BH', value: 2400, contact: '', email: '', next: 'Préparer proposition', notes: 'note conservée' });
    init25(); persist25();
  });
  await page.waitForFunction(() => !shared25.busy && !shared25.pending, null, { timeout: 15000 });
  const before = (await api(a0.cookie, 'GET', '/api/state')).body;
  assert.ok(before.revision > 0 && before.state.clients.some(c => c.name === 'CLIENT HISTORIQUE'), 'données créées par la version en production');
  await page.context().close(); await stop(srv);

  // 2. Cette version sur les mêmes données.
  srv = run(ROOT, [], env); await waitFor(srv, 'RB Partners CRM V27');
  const a1 = await login('admin1'), c1 = await login('collegue');
  assert.deepEqual([a1.body.role, c1.body.role], ['admin', 'collaborateur'], 'rôles repris : admin conservé, ancien « user » en collaborateur');
  const st = (await api(a1.cookie, 'GET', '/api/state')).body;
  assert.equal(st.revision, before.revision, 'lecture sans écriture');
  assert.deepEqual(st.state.clients.map(c => [c.id, c.name, c.annualFees]), before.state.clients.map(c => [c.id, c.name, c.annualFees]), 'clients intacts');
  const list = (await api(a1.cookie, 'GET', '/api/backups')).body.items, pre = list.find(b => b.date === 'avant-v27');
  assert.ok(pre && pre.revision === before.revision && pre.clients === before.state.clients.length, 'sauvegarde avant mise à jour prise sur les données d’origine ' + JSON.stringify(list));
  assert.equal((await api(c1.cookie, 'GET', '/api/backups')).status, 403, 'sauvegardes réservées à l’administrateur');

  // Ouverture dans le navigateur, puis enregistrement : la sauvegarde d'avant reste celle d'origine.
  page = await (await browser.newContext()).newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(B); await page.fill('#login_user', 'admin1'); await page.fill('#login_password', PASSWORD); await page.click('#login25 button');
  await page.waitForFunction(() => typeof shared25 !== 'undefined' && shared25.ready);
  for (const p of ['cabinetdash', 'prospects', 'creation', 'onboarding', 'clients', 'fiscal', 'closing', 'legal', 'exceptional', 'billing', 'fees', 'feereview', 'work', 'time', 'capacity', 'quality', 'profit', 'rules']) await page.evaluate(x => routePage(x), p);
  await page.evaluate(() => { const p = state.prospects.find(x => x.id === 'P_OLD'); p.next = 'Envoyer la proposition'; save(); });
  await page.waitForFunction(() => !shared25.busy && !shared25.pending && !shared25.error, null, { timeout: 15000 });
  const after = (await api(a1.cookie, 'GET', '/api/state')).body;
  assert.ok(after.revision > before.revision, 'enregistrement accepté après mise à jour');
  const pAfter = after.state.prospects.find(x => x.id === 'P_OLD');
  assert.deepEqual([pAfter.name, pAfter.notes, pAfter.next], ['PROSPECT HISTORIQUE', 'note conservée', 'Envoyer la proposition'], 'prospect conservé et modifiable');
  assert.equal((await api(a1.cookie, 'GET', '/api/backups')).body.items.find(b => b.date === 'avant-v27').revision, before.revision, 'sauvegarde d’origine inchangée');
  assert.deepEqual(errs, [], 'erreurs JavaScript à l’ouverture des pages');

  // Retour arrière possible : aperçu de restauration de la sauvegarde d'avant.
  const prev = await api(a1.cookie, 'POST', '/api/restore', { date: 'avant-v27' });
  assert.equal(prev.status, 200); assert.equal(prev.body.preview.backup.clients, before.state.clients.length, 'restauration de la sauvegarde d’avant possible');

  await browser.close(); await stop(srv); if (kv?.stop) kv.stop(); else kv?.server.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`✓ Mise à jour depuis ${REF} : comptes et rôles repris, données intactes, sauvegarde d’avant prise et restaurable, pages sans erreur`);
})().catch(e => { console.error('\n✗ ÉCHEC :', e.message); process.exit(1); });
