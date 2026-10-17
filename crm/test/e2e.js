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

  // Synchronisation automatique à l'ouverture, sans clic.
  await page.waitForFunction(() => state.pennylaneSync?.auto && state.pennylaneCompaniesSync && !pl27.busy);
  console.log('✓ Synchronisation Pennylane lancée automatiquement à la connexion');

  // Données de démonstration chargées dans la base partagée.
  await page.evaluate(() => { state = load(); init25(); save(); render(); });
  await page.waitForFunction(() => !shared25.busy && !shared25.pending);
  console.log('✓ Connexion navigateur et enregistrement partagé');

  await page.evaluate(() => routePage('rules'));
  await page.waitForFunction(() => document.body.innerText.includes('Rattachement des dossiers'));
  await page.evaluate(() => testPennylane27());
  await page.waitForFunction(() => !pl27.busy && pl27.test);
  assert.ok(await page.evaluate(() => pl27.test.cabinet.ok && pl27.test.firm.ok), 'test connexion');
  console.log('✓ Test de connexion Pennylane (cabinet + dossiers)');

  // Factures
  await page.evaluate(() => syncInvoices27());
  await page.waitForFunction(() => !pl27.busy && state.pennylaneSync?.unmatched && !state.pennylaneSync.auto);
  const fees = await page.evaluate(() => ({
    c1: state.pennylaneInvoices.filter(i => i.client === 'C1').length,
    c2: state.pennylaneInvoices.filter(i => i.client === 'C2').map(i => i.status).sort(),
    inv1: invoicedToDate(cfind('C1'), 2026, 12), inv2: invoicedToDate(cfind('C2'), 2026, 12),
    unmatched: state.pennylaneSync.unmatched.map(u => u.name),
    billing: state.invoices.filter(i => i.source === 'pennylane').length,
    unpaid: state.invoices.find(i => i.id === 'PL_3').paid,
    match: cfind('C2').pl27.customerMatch,
  }));
  assert.equal(fees.c1, 4, 'factures C1 depuis N-2');
  assert.deepEqual(fees.c2, ['Annulée', 'Avoir', 'Finalisée'], 'brouillon exclu');
  assert.equal(fees.inv1, 640); assert.equal(fees.inv2, 800, 'avoir déduit, annulée exclue');
  assert.deepEqual(fees.unmatched, ['INCONNU SARL']);
  assert.equal(fees.billing, 6); assert.equal(fees.unpaid, 0); assert.equal(fees.match, 'Nom');
  assert.ok(m.calls.some(c => c.path === '/v2/customer_invoices' && c.query.filter && c.query.cursor), 'filtre + curseur envoyés');
  console.log('✓ Synchronisation factures : rapprochement SIREN/nom, avoirs, annulées, brouillons, non rattachées');

  await page.evaluate(() => loadCompanies27());
  await page.waitForFunction(() => !pl27.busy && cfind('C2').pl27?.companyId);
  assert.deepEqual(await page.evaluate(() => [cfind('C2').pl27.companyId, cfind('C3').pl27.companyId, cfind('C2').links.pennylane]), [501, 502, 'https://app.pennylane.com/companies/501']);
  console.log('✓ Dossiers Pennylane rattachés, lien direct vers le dossier');

  // Suivi Clôture & Bilan
  const sv = await page.evaluate(() => {
    routePage('closing'); setSuiviFilter27('year', 2025);
    const rows = exercises27(2025), r2 = rows.find(r => r.c.id === 'C2');
    return { n: rows.length, bilan: r2.bilan, uB: r2.uB?.level, liasse: r2.liasse, ago: r2.ago, jurReady: r2.jurReady,
      future: exercise27(cfind('C2'), new Date().getFullYear()).bilan, june: iso(liasseDue27(new Date(2026, 5, 30))),
      c1Billed: exercise27(cfind('C1'), 2025)?.invB.length, html: document.body.innerText.includes('Dossiers — exercice 2025') };
  });
  assert.ok(sv.n >= 2 && sv.html);
  assert.equal(sv.bilan, 'À lancer'); assert.equal(sv.uB, 'retard');
  assert.equal(sv.liasse, '2026-05-20', 'liasse 31/12 : 2e jour ouvré après le 1er mai + 15 j');
  assert.equal(sv.ago, '2026-06-30'); assert.equal(sv.june, '2026-10-15'); assert.equal(sv.jurReady, false);
  assert.equal(sv.future, 'Exercice en cours');
  const after = await page.evaluate(() => {
    setBilan27('C2', 2025, 'Liasse déposée');
    const r = exercise27(cfind('C2'), 2025);
    const tasks = state.closing.filter(t => t.client === 'C2' && t.year === 2025).every(t => t.status === 'Terminée');
    setJur27('C2', 2025, 4);
    const r2 = exercise27(cfind('C2'), 2025), ex = deriveExceptionsV18().filter(x => x.client === 'C2' && x.id.includes('SUIVI'));
    return { done: r.bilanDone, ready: r.jurReady, tasks, notBilled: r2.notBilledB, legal: legalStateV18('C2', 2025).signed, jurDue: r2.jurDue,
      ex: ex.map(x => x.area + ':' + x.title), alerts: deriveAlerts().filter(a => a.client === 'C2' && a.action === 'closing').length, log: r2.log[0].status };
  });
  assert.ok(after.done && after.ready && after.tasks && after.legal);
  assert.equal(after.notBilled, true, 'bilan terminé sans facture bilan');
  assert.equal(after.jurDue, '2026-07-31');
  assert.ok(after.ex.some(x => x.startsWith('Facturation:Bilan 2025 terminé non facturé')), after.ex.join(' | '));
  assert.ok(after.ex.some(x => x.startsWith('Juridique:Dépôt des comptes en retard')), after.ex.join(' | '));
  assert.ok(after.alerts >= 2); assert.equal(after.log, 'AGO signée');
  const hist = await page.evaluate(() => { window.confirm = () => true; closeYear27(2024); return exercises27(2024).every(r => r.bilanDone && r.jurDone) && !suiviAlerts27().some(a => a.r.y === 2024); });
  assert.ok(hist, 'reprise d’historique 2024');
  await page.evaluate(() => { setSuiviFilter27('year', 2025); });
  if (shots) await page.screenshot({ path: path.join(shots, 'suivi.png'), fullPage: false });
  console.log('✓ Suivi des exercices : échéances, retards, déblocage du juridique, contrôle de facturation, alertes');

  // Rendu des écrans
  for (const p of ['fees', 'billing', 'closing', 'legal', 'rules', 'cabinetdash', 'inbox', 'control', 'clients']) {
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
  assert.equal(st.revision, rev); assert.equal(st.state.pennylaneInvoices.length, 7); assert.equal(st.state.suivi27['C2|2025'].bilan, 'Liasse déposée');
  assert.ok(fs.readdirSync(path.join(dataDir, 'history')).length >= 1, 'historique des versions');
  console.log(`✓ Données conservées après redémarrage (révision ${rev}, historique présent)`);

  srv.kill(); m.server.close(); fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('\nTous les tests sont passés.');
})().catch(e => { console.error('\n✗ ÉCHEC :', e.message); process.exit(1); });
