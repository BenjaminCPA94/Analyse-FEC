/* Test de bout en bout : serveur + faux Pennylane + navigateur Chromium.
 *   node test/e2e.js            (Playwright requis : npm i -g playwright) */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const mock = require('./mock-pennylane');

let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

const ROOT = path.join(__dirname, '..');
const PASSWORD = 'motdepasse-test-123';
const shots = process.env.SHOTS_DIR || '';

function run(args, env) {
  return spawn(process.execPath, [path.join(ROOT, 'server.js'), ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
}
function waitFor(proc, text) {
  return new Promise((resolve, reject) => {
    let out = '';
    const on = d => { out += d; if (out.includes(text)) resolve(out); };
    proc.stdout.on('data', on); proc.stderr.on('data', d => { out += d; process.stderr.write(d); });
    proc.on('exit', code => reject(new Error('serveur arrêté (' + code + ') : ' + out)));
  });
}

(async () => {
  const m = await mock.start();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbcrm-'));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const env = {
    DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1', RB_PASSWORD: PASSWORD,
    PENNYLANE_API_BASE: `http://127.0.0.1:${m.port}/v2`, PENNYLANE_FIRM_API_BASE: `http://127.0.0.1:${m.port}/firm`,
    PENNYLANE_CABINET_TOKEN: mock.CABINET, PENNYLANE_FIRM_TOKEN: mock.FIRM,
  };
  await new Promise((res, rej) => run(['add-user', 'benjamin', '--admin'], env).on('exit', c => c ? rej(new Error('add-user')) : res()));
  let srv = run([], env);
  await waitFor(srv, 'RB Partners CRM V27');
  const base = `http://127.0.0.1:${port}`;

  // --- API ---
  let r = await fetch(base + '/api/state');
  assert.equal(r.status, 401, 'state sans session');
  r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'benjamin', password: 'faux' }) });
  assert.equal(r.status, 401, 'mauvais mot de passe');
  r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' }, body: '{}' });
  assert.equal(r.status, 403, 'origine étrangère refusée');
  console.log('✓ API : authentification et protections');

  // --- Navigateur ---
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) errors.push(msg.text()); });
  page.on('dialog', d => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  await page.goto(base);
  await page.fill('#login_user', 'benjamin');
  await page.fill('#login_password', PASSWORD);
  await page.click('#login25 button');
  await page.waitForFunction(() => typeof shared25 !== 'undefined' && shared25.ready);
  assert.equal(await page.title(), 'RB Partners CRM V27');

  // Données de démonstration chargées dans la base partagée.
  await page.evaluate(() => { state = load(); init25(); save(); render(); });
  await page.waitForFunction(() => shared25.revision >= 1 && !shared25.busy);
  console.log('✓ Connexion navigateur et enregistrement partagé (révision 1)');

  await page.evaluate(() => routePage('rules'));
  await page.waitForFunction(() => pl27.status && document.body.innerText.includes('Rattachement des dossiers'));
  await page.evaluate(() => testPennylane27());
  await page.waitForFunction(() => !pl27.busy && pl27.test);
  assert.ok(await page.evaluate(() => pl27.test.cabinet.ok && pl27.test.firm.ok), 'test connexion');
  console.log('✓ Test de connexion Pennylane (cabinet + API cabinet)');

  // Factures
  await page.evaluate(() => syncInvoices27());
  await page.waitForFunction(() => !pl27.busy && state.pennylaneSync?.unmatched);
  const fees = await page.evaluate(() => ({
    c1: state.pennylaneInvoices.filter(i => i.client === 'C1').length,
    c2: state.pennylaneInvoices.filter(i => i.client === 'C2').map(i => i.status).sort(),
    inv1: invoicedToDate(cfind('C1'), 2026, 12), inv2: invoicedToDate(cfind('C2'), 2026, 12),
    unmatched: state.pennylaneSync.unmatched.map(u => u.name),
    billing: state.invoices.filter(i => i.source === 'pennylane').length,
    unpaid: state.invoices.find(i => i.id === 'PL_3').paid,
    match: cfind('C2').pl27.customerMatch,
    filter: true,
  }));
  assert.equal(fees.c1, 3, 'factures C1 (2024 exclue)');
  assert.deepEqual(fees.c2, ['Annulée', 'Avoir', 'Finalisée'], 'brouillon exclu');
  assert.equal(fees.inv1, 640); assert.equal(fees.inv2, 800, 'avoir déduit, annulée exclue');
  assert.deepEqual(fees.unmatched, ['INCONNU SARL']);
  assert.equal(fees.billing, 5); assert.equal(fees.unpaid, 0); assert.equal(fees.match, 'Nom');
  assert.ok(m.calls.some(c => c.path === '/v2/customer_invoices' && c.query.filter && c.query.cursor), 'filtre + curseur envoyés');
  console.log('✓ Synchronisation factures : rapprochement SIREN/nom, avoirs, annulées, brouillons, non rattachées');

  // Dossiers du cabinet
  await page.evaluate(() => loadCompanies27());
  await page.waitForFunction(() => !pl27.busy && pl27.companies);
  assert.deepEqual(await page.evaluate(() => [cfind('C2').pl27.companyId, cfind('C3').pl27.companyId]), [501, 502]);
  console.log('✓ Rapprochement des dossiers du cabinet (pagination page/total_pages)');

  // Clôture
  await page.evaluate(() => { routePage('closing'); state.closingView.year = 2026; openClosingDossierV19('C2'); syncClosing27(); });
  await page.waitForFunction(() => !pl27.busy && closingAnalysisCurrent()?.real27);
  const a = await page.evaluate(() => { const a = closingAnalysisCurrent(); return { t: a.turnoverN, t1: a.turnoverN1, r: a.resultN, st: a.balanceStatus, titles: a.anomalies.map(x => x.cycle + ' ' + x.title) }; });
  assert.equal(a.t, 29800); assert.equal(a.t1, 20000); assert.equal(a.r, 17800); assert.equal(a.st, 'Équilibrée');
  for (const k of ['I12 Compte courant', 'I12 Compte d’attente 47100000', 'I13 Trésorerie créditrice', 'I1 Résultat antérieur', 'I8 Aucune facture non parvenue']) assert.ok(a.titles.some(t => t.startsWith(k)), 'anomalie ' + k + ' dans ' + a.titles.join(' | '));
  assert.ok(m.calls.some(c => c.path === '/firm/companies/501/trial_balance' && c.query.period_start === '2026-01-01' && c.query.period_end === '2026-12-31'));
  assert.ok(await page.evaluate(() => document.body.innerText.includes('Source : Pennylane — balance du 01/01/2026 au 31/12/2026')));
  if (shots) await page.screenshot({ path: path.join(shots, 'cloture.png'), fullPage: false });
  console.log('✓ Clôture : balance N/N-1 via API cabinet, chiffres et contrôles réels');

  // Jeton propre au dossier
  const tokenRes = await page.evaluate(async () => { await api27('/api/pennylane/dossier-token', { method: 'PUT', body: JSON.stringify({ client: 'C1', token: 'dossier-token' }) }); await refreshStatus27(); return Object.keys(pl27.status.dossierTokens); });
  assert.deepEqual(tokenRes, ['C1']);
  const bad = await page.evaluate(async () => { try { await api27('/api/pennylane/dossier-token', { method: 'PUT', body: JSON.stringify({ client: 'C4', token: 'faux' }) }); return 'accepté'; } catch (e) { return e.message; } });
  assert.match(bad, /refusé/);
  assert.ok(!JSON.stringify(await page.evaluate(() => pl27.status)).includes('dossier-token'), 'jeton jamais renvoyé au navigateur');

  // Revue mensuelle via le jeton du dossier
  await page.evaluate(() => { state.selectedClient = 'C1'; state.reviewPeriod25 = '2026-09'; routePage('review25'); importReview27(); });
  await page.waitForFunction(() => !pl27.busy && init25().reviews['C1|2026-09']);
  const rv = await page.evaluate(() => { const r = init25().reviews['C1|2026-09']; return { n: r.rows.length, prev: !!r.previous }; });
  assert.ok(rv.n > 5 && rv.prev);
  assert.ok(m.calls.some(c => c.path === '/v2/trial_balance' && c.token === 'dossier-token' && c.query.period_end === '2026-09-30'));
  console.log('✓ Jeton par dossier (vérifié, stocké côté serveur) + revue mensuelle importée');

  // Juridique
  await page.evaluate(() => syncLegal27('C2', 2026));
  await page.waitForFunction(() => !pl27.busy && cfind('C2').pennylaneSync?.status === 'Synchronisé');
  assert.equal(await page.evaluate(() => cfind('C2').legalInputs.result), 17800);
  await page.evaluate(() => { closeModal(); importAccountsLegal27('C2', 2026); });
  assert.equal(await page.evaluate(() => legalStateV18('C2', 2026).result), 17800);
  console.log('✓ Juridique annuel : résultat repris de Pennylane');

  // Rendu des écrans
  for (const p of ['fees', 'billing', 'closing', 'legal', 'rules', 'cabinetdash', 'review25', 'clients']) {
    await page.evaluate(p => routePage(p), p);
    await page.waitForTimeout(150);
    if (shots && ['fees', 'rules'].includes(p)) await page.screenshot({ path: path.join(shots, p + '.png'), fullPage: false });
  }
  assert.ok(await page.evaluate(() => { routePage('fees'); return !document.body.innerText.includes('Maquette : données Pennylane simulées'); }));
  await page.waitForFunction(() => !shared25.busy && !shared25.pending);
  const rev = await page.evaluate(() => shared25.revision);

  // Conflit de version
  const cookie = (await page.context().cookies())[0];
  r = await fetch(base + '/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: `rb_sid=${cookie.value}` }, body: JSON.stringify({ revision: 0, state: {} }) });
  assert.equal(r.status, 409, 'conflit détecté');
  assert.deepEqual(errors, [], 'erreurs navigateur');
  console.log('✓ Écrans sans erreur JavaScript, conflit de version détecté');
  await browser.close();

  // Persistance après redémarrage
  srv.kill(); await new Promise(r => srv.on('exit', r));
  srv = run([], env); await waitFor(srv, 'RB Partners CRM V27');
  r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'benjamin', password: PASSWORD }) });
  const sid = r.headers.get('set-cookie').split(';')[0];
  const st = await (await fetch(base + '/api/state', { headers: { Cookie: sid } })).json();
  assert.equal(st.revision, rev); assert.equal(st.state.pennylaneInvoices.length, 6);
  assert.ok(fs.readdirSync(path.join(dataDir, 'history')).length >= 1, 'historique des versions');
  console.log(`✓ Données conservées après redémarrage (révision ${rev}, historique présent)`);

  srv.kill(); m.server.close(); fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('\nTous les tests sont passés.');
})().catch(e => { console.error('\n✗ ÉCHEC :', e.message); process.exit(1); });
