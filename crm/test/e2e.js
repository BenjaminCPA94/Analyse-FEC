/* Test de bout en bout : serveur + faux Pennylane + navigateur Chromium.
 *   node test/e2e.js            (Playwright requis : npm i -g playwright) */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const mock = require('./mock-pennylane');
const upstash = require('./mock-upstash');
const REDIS = process.env.STORE === 'redis';

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
  let kv = null;
  if (REDIS) {
    // Mode Vercel : base Upstash, premier administrateur créé depuis les variables d'environnement.
    kv = await upstash.start();
    Object.assign(env, { KV_REST_API_URL: kv.url, KV_REST_API_TOKEN: kv.token, ADMIN_USERNAME: 'benjamin', ADMIN_PASSWORD: PASSWORD });
    console.log('Stockage : Upstash Redis (simulé), compte initial via ADMIN_USERNAME / ADMIN_PASSWORD');
  } else {
    await new Promise((res, rej) => run(['add-user', 'benjamin', '--admin'], env).on('exit', c => c ? rej(new Error('add-user')) : res()));
    console.log('Stockage : fichiers');
  }
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

  // Comptes gérés depuis le CRM
  const json = (c, method, body) => ({ method, headers: { 'Content-Type': 'application/json', ...(c ? { Cookie: c } : {}) }, body: body && JSON.stringify(body) });
  const login = async (u, p) => { const x = await fetch(base + '/api/login', json(null, 'POST', { username: u, password: p })); return x.ok ? x.headers.get('set-cookie').split(';')[0] : x.status; };
  const adminC = await login('benjamin', PASSWORD);
  assert.equal(typeof adminC, 'string', 'connexion administrateur');
  assert.equal((await fetch(base + '/api/users', json(adminC, 'POST', { username: 'collab', password: 'court', role: 'user' }))).status, 400, 'mot de passe trop court refusé');
  assert.equal((await fetch(base + '/api/users', json(adminC, 'POST', { username: 'collab', password: 'collab-password-1', role: 'user' }))).status, 200);
  const collabC = await login('collab', 'collab-password-1');
  assert.equal((await fetch(base + '/api/users', { headers: { Cookie: collabC } })).status, 403, 'utilisateur sans droits admin');
  assert.equal((await fetch(base + '/api/password', json(collabC, 'POST', { current: 'collab-password-1', password: 'nouveau-mot-de-passe' }))).status, 200);
  assert.equal((await fetch(base + '/api/session', { headers: { Cookie: collabC } })).status, 401, 'ancienne session invalidée après changement de mot de passe');
  assert.equal(typeof await login('collab', 'nouveau-mot-de-passe'), 'string');
  await fetch(base + '/api/users/delete', json(adminC, 'POST', { username: 'collab' }));
  assert.equal(await login('collab', 'nouveau-mot-de-passe'), 401, 'compte supprimé');
  assert.equal((await fetch(base + '/api/session', { headers: { Cookie: 'rb_sid=faux.jeton' } })).status, 401, 'cookie falsifié refusé');
  console.log('✓ Comptes : création, droits, changement de mot de passe, suppression, cookie signé');

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

  // Tableaux Bilan et AGO (modèle des suivis Excel)
  const FIX = path.join(__dirname, 'fixtures');
  const before = await page.evaluate(() => {
    routePage('closing'); setBoardFilter27('year', 2025);
    const x = ctx27('bilan', cfind('C2'), 2025);
    return { etat: val27(x, 'etat'), ech: val27(x, 'echeance'), u: urgency27(x)?.level, june: iso(liasseDue27(new Date(2026, 5, 30))), html: document.body.innerText.includes('Bilan Fr 2025') };
  });
  assert.ok(before.html);
  assert.equal(before.etat, '1. A faire'); assert.equal(before.ech, '2026-05-20', 'liasse 31/12 : 2e jour ouvré après le 1er mai + 15 j');
  assert.equal(before.u, 'retard'); assert.equal(before.june, '2026-10-15');
  await page.evaluate(() => { window.confirm = () => true; });
  await page.setInputFiles('input[type=file][accept=".xlsx"]', path.join(FIX, 'bilan_test.xlsx'));
  await page.waitForFunction(() => state.clients.some(c => c.name === 'NOUVEAU CLIENT'));
  const bi = await page.evaluate(() => {
    const c2 = cfind('C2'), n = state.clients.find(c => c.name === 'NOUVEAU CLIENT'), x2 = ctx27('bilan', c2, 2025), xn = ctx27('bilan', n, 2025);
    setCell27({ value: '9. Bilan télédéclaré', style: {} }, 'bilan', n.id, 2025, 'etat');
    const xn2 = ctx27('bilan', n, 2025);
    return { etat2: val27(x2, 'etat'), people: people27(c2, 'associe'), fees: fees27(c2).accounting, budget: val27(x2, 'budget'), clients: state.clients.length,
      nClose: n.closing, nEch: val27(xn, 'echeance'), nSiren: n.siren, nGroup: n.group27, nLancer: val27(xn2, 'lancerFact'), nLiasse: val27(xn2, 'liasse'),
      c1Inv: ctx27('bilan', cfind('C1'), 2025).invB?.number, group: group27(x2), ac: val27(x2, 'ac1') };
  });
  assert.equal(bi.etat2, '9. Bilan télédéclaré', 'client existant rapproché par SIREN');
  assert.equal(bi.people, 'Alice Test', 'noms dédoublonnés'); assert.equal(bi.fees, 10800); assert.equal(bi.budget, 15000);
  assert.equal(bi.nClose, '06-30'); assert.equal(bi.nEch, '2026-01-15'); assert.equal(bi.nSiren, '123456789'); assert.equal(bi.nGroup, 'Groupe Test');
  assert.equal(bi.nLancer, 'Oui', 'bilan terminé → facturation à lancer'); assert.equal(bi.nLiasse, 'Télédéclaré');
  assert.equal(bi.c1Inv, 'F-3', 'facture bilan Pennylane reconnue'); assert.equal(bi.group, 'Terminés'); assert.equal(bi.ac, 2000);
  if (shots) await page.screenshot({ path: path.join(shots, 'bilan.png'), fullPage: false });
  console.log('✓ Tableau Bilan : import Excel (rapprochement SIREN, création), échéances, automatismes, facture Pennylane');

  await page.evaluate(() => routePage('legal'));
  await page.setInputFiles('input[type=file][accept=".xlsx"]', path.join(FIX, 'ago_test.xlsx'));
  await page.waitForFunction(() => state.clients.some(c => c.name === 'AUTRE SAS'));
  const ag = await page.evaluate(() => {
    const c2 = cfind('C2'), au = state.clients.find(c => c.name === 'AUTRE SAS'), sci = state.clients.find(c => c.name === 'SCI SANS AGO');
    const x2 = ctx27('ago', c2, 2025), xa = ctx27('ago', au, 2025);
    const ex = deriveExceptionsV18().filter(e => e.id.includes('BOARD')).map(e => e.area + ':' + cfind(e.client).name + ':' + e.title);
    return { statut: val27(x2, 'statut'), bilan: val27(x2, 'bilanAuto'), g2: group27(x2), ga: group27(xa), gs: group27(ctx27('ago', sci, 2025)), au: au.status, sci: sci.status,
      ua: urgency27(xa)?.label + ':' + urgency27(xa)?.level, honor: fees27(c2).legalAnnual, ex, alerts: deriveAlerts().filter(a => a.action === 'legal').length,
      html: document.body.innerText.includes('AGO 2025') };
  });
  assert.ok(ag.html);
  assert.equal(ag.statut, '7. Validé par le greffe'); assert.equal(ag.bilan, '9. Bilan télédéclaré', 'AGO reprend l’état du bilan');
  assert.deepEqual([ag.g2, ag.ga, ag.gs], ['Terminés', 'À faire', 'Non concernés']);
  assert.deepEqual([ag.au, ag.sci], ['Onboarding', 'Inactif']); assert.equal(ag.ua, 'AGO:retard'); assert.equal(ag.honor, 450);
  assert.ok(ag.ex.some(x => x === 'Juridique:AUTRE SAS:AGO en retard — exercice 2025'), ag.ex.join(' | '));
  assert.ok(ag.ex.some(x => x === 'Facturation:STOIK France:Bilan 2025 terminé non facturé'), ag.ex.join(' | '));
  assert.ok(ag.ex.some(x => x === 'Facturation:STOIK France:Juridique 2025 terminé non facturé'), ag.ex.join(' | '));
  assert.ok(ag.alerts >= 1);
  await page.selectOption(`tr:has(a:text-is("AUTRE SAS")) select[onchange*="'statut'"]`, '2. A revoir par Manager');
  await page.waitForFunction(() => val27(ctx27('ago', state.clients.find(c => c.name === 'AUTRE SAS'), 2025), 'statut') === '2. A revoir par Manager');
  await page.fill(`tr:has(a:text-is("AUTRE SAS")) input[onchange*="'honoAgo'"]`, '520');
  await page.press(`tr:has(a:text-is("AUTRE SAS")) input[onchange*="'honoAgo'"]`, 'Tab');
  assert.equal(await page.evaluate(() => fees27(state.clients.find(c => c.name === 'AUTRE SAS')).legalAnnual), 520, 'saisie directe dans une case');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => exportBoard27('ago'))]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  assert.ok(csv.includes('"STOIK France";"Terminés"') && csv.includes('Statut AGO'), 'export CSV');
  await page.evaluate(() => openAgo27('C2', 2025));
  assert.equal(await page.evaluate(() => state.legalView.mode), 'detail', 'pack AGO ouvert');
  await page.evaluate(() => backLegalPortfolioV20());
  assert.ok(await page.evaluate(() => document.body.innerText.includes('AGO 2025')));
  if (shots) await page.screenshot({ path: path.join(shots, 'ago.png'), fullPage: false });
  console.log('✓ Tableau AGO : import Excel, lien avec le bilan, retards, contrôle de facturation, export, pack AGO');

  // Navigation simplifiée
  const nav = await page.evaluate(() => [...document.querySelectorAll('.nav a')].map(a => a.dataset.page));
  for (const gone of ['dashboard', 'inbox', 'control', 'notifications']) assert.ok(!nav.includes(gone), 'onglet retiré : ' + gone);
  assert.ok(nav.indexOf('onboarding') < nav.indexOf('clients') && nav.indexOf('prospects') < nav.indexOf('onboarding'), 'Prospects → Onboarding → Portefeuille');
  assert.equal(await page.evaluate(() => { routePage('control'); return state.page; }), 'cabinetdash');
  console.log('✓ Navigation : onglets inutiles retirés, Onboarding avant Portefeuille');

  // Portefeuille clients (import Excel avec étapes d'onboarding) et données reliées
  await page.evaluate(() => routePage('clients'));
  await page.setInputFiles('input[type=file][accept=".xlsx"]', path.join(FIX, 'portfolio_test.xlsx'));
  await page.waitForFunction(() => state.clients.some(c => c.name === 'ONBOARD TEST'));
  const pf = await page.evaluate(() => {
    const c = state.clients.find(x => x.name === 'ONBOARD TEST'), y = new Date().getFullYear();
    const tva = () => obligations27(c, y).filter(o => o.type === 'TVA').length;
    const before = tva();
    setCell27({ value: 'Trimestrielle', style: {} }, 'portfolio', c.id, 0, 'tva');
    const after = tva();
    return { st: c.status, siren: c.siren, mgr: people27(c, 'manager'), m: ['tax', 'annualAccounts', 'legal', 'einvoice'].map(k => c.missions[k]), f: [fees27(c).accounting, fees27(c).annualAccounts, fees27(c).legalAnnual],
      step: onbStep27(c, 2), prog: onbProgress27(c).label, before, after, is: c.missions.tax ? 4 : 0,
      bilan: val27(ctx27('bilan', c, 2026), 'afaire'), ago: val27(ctx27('ago', c, 2026), 'juridique'), closing: c.closing, html: document.body.innerText.includes('Portefeuille clients') };
  });
  assert.ok(pf.html); assert.equal(pf.st, 'Onboarding'); assert.equal(pf.siren, '222333444', 'SIRET ramené au SIREN'); assert.equal(pf.mgr, 'Bruno Test');
  assert.deepEqual(pf.m, [true, true, true, true]); assert.deepEqual(pf.f, [2400, 800, 453]);
  assert.equal(pf.step, 'Bloqué'); assert.equal(pf.prog, '11/14');
  assert.deepEqual([pf.before, pf.after, pf.is], [12, 4, 4], 'échéances fiscales recalculées depuis le portefeuille');
  assert.deepEqual([pf.bilan, pf.ago, pf.closing], ['Oui', 'Oui', '12-31'], 'missions reprises dans Bilan et AGO');
  const fin = await page.evaluate(() => { const c = state.clients.find(x => x.name === 'PRESQUE FINI'); routePage('onboarding'); const b = onbProgress27(c).label; setCell27({ value: 'Fait', style: {} }, 'onb', c.id, 0, 's13'); return [b, c.status, group27(ctx27('onb', c, 0))]; });
  assert.deepEqual(fin, ['13/14', 'Onboarding', 'Prêts à valider'], 'toutes les étapes faites : pas de bascule automatique');
  await page.click('.onb27:has-text("PRESQUE FINI") button:has-text("Valider l’onboarding")');
  const val = await page.evaluate(() => { const c = state.clients.find(x => x.name === 'PRESQUE FINI'); return [c.status, Boolean(c.onbValidated27), document.body.innerText.includes('Onboarding validé')]; });
  assert.deepEqual(val, ['Actif', true, true], 'validation manuelle → section Onboarding validé');
  // Onboarding : un clic sur le dossier déroule ses étapes, qui restent ouvertes après modification.
  await page.evaluate(() => routePage('onboarding'));
  await page.click('.onbHead27:has-text("ONBOARD TEST")');
  await page.selectOption('.onbSteps27 tr:nth-child(4) select', 'Fait');
  assert.equal(await page.evaluate(() => onbStep27(state.clients.find(x => x.name === 'ONBOARD TEST'), 3)), 'Fait');
  assert.equal(await page.locator('.onbBody27').count(), 1, 'dossier toujours déroulé');
  if (shots) await page.screenshot({ path: path.join(shots, 'onboarding.png'), fullPage: false });
  // Portefeuille : une modification ne ramène plus le tableau tout à gauche.
  await page.evaluate(() => routePage('clients'));
  await page.evaluate(() => { document.querySelector('.board27').scrollLeft = 700; });
  await page.locator('.board27 select[onchange*="m_payroll"]').first().selectOption('Oui');
  assert.equal(await page.evaluate(() => document.querySelector('.board27').scrollLeft), 700, 'défilement horizontal conservé');
  console.log('✓ Portefeuille et Onboarding : import Excel, 14 étapes, fiscalité et tableaux reliés, passage automatique en actif');

  // Lettre de reprise
  const oid = await page.evaluate(() => { const c = state.clients.find(x => x.name === 'ONBOARD TEST'); cabinet26().name = 'RB PARTNERS'; cabinet26().expert = 'Expert Test'; repriseDialog27(c.id); return c.id; });
  await page.fill('#rp_firm', 'CABINET PRÉCÉDENT'); await page.fill('#rp_confrere', 'Jean Dupont'); await page.fill('#rp_firmAddress', '5 avenue Foch, 75116 Paris');
  await page.click('.modal button:has-text("Aperçu")');
  assert.ok(await page.locator('.letter27').innerText().then(t => t.includes('CABINET PRÉCÉDENT') && t.includes('article 163') && t.includes('ONBOARD TEST')), 'aperçu de la lettre');
  const [wdl] = await Promise.all([page.waitForEvent('download'), page.click('.modal button:has-text("Télécharger Word")')]);
  const docx = fs.readFileSync(await wdl.path());
  assert.ok(docx.slice(0, 2).toString() === 'PK' && docx.includes(Buffer.from('word/document.xml')) && docx.includes(Buffer.from('CABINET PR')), 'fichier Word généré');
  await page.click('.modal button:has-text("Marquer comme envoyée")');
  assert.equal(await page.evaluate(id => onbStep27(cfind(id), 1), oid), 'Fait', 'étape lettre de reprise cochée');
  console.log('✓ Lettre de reprise : pré-remplie, aperçu, Word, étape d’onboarding cochée ; validation manuelle de l’onboarding');

  // Fiscalité : tableau principal des régimes et échéances mensuelles automatiques
  await page.evaluate(() => routePage('fiscal'));
  await page.setInputFiles('input[type=file][accept=".xlsx"]', path.join(FIX, 'fiscal_test.xlsx'));
  await page.waitForFunction(() => state.clients.some(c => c.name === 'FISC TRIMESTRIEL'));
  const fi = await page.evaluate(() => {
    const m = state.clients.find(x => x.name === 'FISC MENSUEL'), t = state.clients.find(x => x.name === 'FISC TRIMESTRIEL'), keys = c => obligations27(c, 2026).map(o => o.key);
    const r = { mStatus: m.status, tStatus: t.status, mVat: m.vatRegime, mKeys: keys(m).filter(k => !k.startsWith('TVA-')), mTva: keys(m).filter(k => k.startsWith('TVA-')).length,
      tKeys: keys(t).filter(k => !k.startsWith('DEB-')), tDeb: obligations27(t, 2026).find(o => o.key === 'DEB-03').due, st: row27('fiscm', m.id, 2026)['TVA-01'], tf: obligations27(m, 2026).find(o => o.key === 'TF').def,
      tax: m.missions.tax, html: document.body.innerText.includes('Tableau principal') };
    setCell27({ value: 'Annuelle', style: {} }, 'fisc', m.id, 0, 'tva');
    r.after = keys(m).filter(k => k.startsWith('TVA') || k === 'CA12');
    setFiscView27('3'); r.march = COLS27.fiscm.map(c => c.label).filter(l => /TVA|IS|DES/.test(l)); r.marchRows = document.querySelectorAll('.board27 tbody tr').length;
    return r;
  });
  assert.ok(fi.html && fi.tax);
  assert.deepEqual([fi.mStatus, fi.tStatus, fi.mVat], ['Actif', 'Compromis', 'Mensuelle'], 'clients importés actifs / compromis');
  assert.equal(fi.mTva, 12); assert.deepEqual(fi.mKeys, ['IS-T1', 'IS-T2', 'IS-T3', 'IS-T4', 'CFE-AC', 'CFE', 'TVS', 'TF']);
  assert.deepEqual(fi.tKeys, ['TVA-01', 'TVA-04', 'TVA-07', 'TVA-10', 'TS-01', 'TS-04', 'TS-07', 'TS-10', 'IFU', 'CRL']);
  assert.equal(fi.tDeb, '2026-03-08'); assert.equal(fi.st, 'Déclarée', 'statut importé et harmonisé'); assert.equal(fi.tf, 'Payée');
  assert.deepEqual(fi.after, ['CA12', 'TVA-S1', 'TVA-S2'], 'passage en TVA annuelle → CA12 et acomptes');
  assert.ok(fi.march.includes('DES/DEB 03') && fi.marchRows >= 1, 'vue mensuelle calculée');
  if (shots) await page.screenshot({ path: path.join(shots, 'fiscalite.png'), fullPage: false });
  console.log('✓ Fiscalité : import Excel, tableau principal des régimes, échéances mensuelles et annuelles automatiques');

  // Travaux exceptionnels, Facturation et Tableau de bord
  await page.evaluate(() => routePage('exceptional'));
  assert.ok(!(await page.evaluate(() => document.body.innerText.includes('BR IMMOBILIER Transfert de siège'))), 'plus de maquette figée');
  await page.setInputFiles('input[type=file][accept=".xlsx"]', path.join(FIX, 'autres_test.xlsx'));
  await page.waitForFunction(() => exc27().items.length >= 3);
  const ex = await page.evaluate(() => {
    const it = exc27().items, sto = cfind('C2'), nv = state.clients.find(c => c.name === 'CLIENT EXC NOUVEAU'), inv = excInvoices27();
    const bill = toBill27().filter(x => x.src === 'Travail exceptionnel').map(x => x.label);
    const tr = it.find(w => w.name === 'Transfert de siège');
    setExc27({ value: 'Terminé', style: {}, tagName: 'SELECT' }, tr.id, 'statut');
    const bill2 = toBill27().filter(x => x.src === 'Travail exceptionnel').map(x => x.label).sort();
    return { n: it.length, stoik: it.filter(w => w.client === sto.id).length, nv: Boolean(nv && nv.status === 'Actif'), billed: excBilling27(it.find(w => w.name === 'STOIK - Evaluation'), inv.x).label, bill, bill2, lancer: tr.lancerFact, html: document.body.innerText.includes('Autres travaux Fr 2025') };
  });
  assert.ok(ex.html); assert.equal(ex.n, 3); assert.equal(ex.stoik, 2, 'travaux rattachés au client existant'); assert.ok(ex.nv, 'client absent créé');
  assert.equal(ex.billed, 'Facturé'); assert.deepEqual(ex.bill, ['Création holding']);
  assert.deepEqual(ex.bill2, ['Création holding', 'Transfert de siège'], 'travail terminé → à facturer'); assert.equal(ex.lancer, 'Oui');
  await page.evaluate(() => routePage('billing'));
  const bl = await page.evaluate(() => ({ html: document.body.innerText.includes('À facturer') && document.body.innerText.includes('Factures émises'), n: toBill27().length }));
  assert.ok(bl.html && bl.n >= 2);
  await page.evaluate(() => { const x = toBill27().find(x => x.label === 'Création holding'); window.prompt = () => 'F-99'; markBilled27(x.key, x.exc); });
  assert.ok(await page.evaluate(() => !toBill27().some(x => x.label === 'Création holding') && exc27().items.find(w => w.name === 'Création holding').factRef === 'F-99'), 'marqué facturé');
  await page.evaluate(() => routePage('cabinetdash'));
  const db = await page.evaluate(() => ({ t: document.body.innerText, demo: (state.pennylaneInvoices || []).every(i => i.source === 'pennylane') }));
  assert.ok(db.t.includes('Calculé en temps réel') && db.t.includes('Production') && db.t.includes('À traiter en priorité') && db.demo, 'tableau de bord réel');
  assert.ok(!(await page.evaluate(() => [...document.querySelectorAll('.nav a')].some(a => a.dataset.page === 'docs'))), 'Boîte documents retirée');
  if (shots) await page.screenshot({ path: path.join(shots, 'dashboard.png'), fullPage: false });
  console.log('✓ Travaux exceptionnels (import, facturation automatique), Facturation, Tableau de bord en temps réel, Boîte documents retirée');

  // Équipe réelle, temps, rentabilité, charge, fiche client, recherche, prototypes retirés
  const navNow = await page.evaluate(() => [...document.querySelectorAll('.nav a')].map(a => a.dataset.page));
  for (const gone of ['skills', 'paperasse', 'users', 'docs']) assert.ok(!navNow.includes(gone), 'prototype retiré : ' + gone);
  assert.ok(!(await page.evaluate(() => [...document.querySelectorAll('.top button')].some(b => /IA/.test(b.textContent)))), 'bouton IA retiré');
  const tm = await page.evaluate(() => team27().map(m => m.name + ':' + m.role));
  assert.ok(tm.includes('Alice Test:Associé') && tm.includes('Bruno Test:Manager') && tm.includes('Chloé Test:Collaborateur') && !tm.some(x => x.startsWith('YB:')), 'équipe déduite des tableaux');
  await page.evaluate(() => routePage('time'));
  await page.selectOption('#t27_who', 'Chloé Test'); await page.fill('#t27_client', 'STOIK France'); await page.selectOption('#t27_mission', 'Bilan'); await page.fill('#t27_hours', '3');
  await page.click('button:has-text("Ajouter")');
  const tt = await page.evaluate(() => { const t = state.time[0]; const m = team27().find(x => x.name === 'Chloé Test'); setMember27(m.id, 'cost', 60); routePage('profit'); const r = profitRows27(new Date().getFullYear()).find(r => r.c.id === 'C2'); routePage('capacity'); const w = workload27(m); return { t: [t.user, cfind(t.client).name, t.mission, t.hours], cost: r.cost, hours: r.hours, wh: w.hours, cap: document.body.innerText.includes('Équipe du cabinet') }; });
  assert.deepEqual(tt.t, ['Chloé Test', 'STOIK France', 'Bilan', 3]); assert.equal(await page.evaluate(() => costOf27('Chloé Test') * 3), 180, '3 h × 60 €'); assert.ok(tt.cost >= 180 && tt.hours >= 3, 'temps repris dans la rentabilité'); assert.equal(tt.wh, 3); assert.ok(tt.cap);
  await page.fill('#globalSearch', 'stoik');
  assert.equal(await page.evaluate(() => state.page), 'capacity', 'la saisie ne change plus de page');
  await page.click('#search27 a:has-text("STOIK France")');
  const cp = await page.evaluate(() => { const out = []; for (const t of ['synthese', 'onb', 'fisc', 'bilan', 'exc', 'fact', 'temps', 'hist']) { clientTab27(t); out.push(document.getElementById('root').innerText.length > 100); } clientTab27('temps'); return { page: state.page, ok: out.every(Boolean), temps: document.body.innerText.includes('TVA') || document.body.innerText.includes('Bilan') }; });
  assert.deepEqual(cp, { page: 'client', ok: true, temps: true }, 'fiche client complète');
  console.log('✓ Équipe réelle, saisie des temps, rentabilité, charge équipe, fiche client, recherche ; prototypes IA retirés');

  // Prospect → client : missions et honoraires reportés automatiquement
  await page.evaluate(() => { const id = uid('P'); state.prospects.push({ id, name: 'PROSPECT TEST', siren: '555666777', contact: 'Louis', email: 'l@x.fr', owner: 'YB', value: 0, stage: 'Négociation', source: '', appointment: '', next: '', notes: '' }); save(); routePage('prospects'); openProspect(id); window._pid = id; });
  await page.fill('#p27_f_accounting', '24000'); await page.press('#p27_f_accounting', 'Tab');
  await page.fill('#p27_f_annualAccounts', '3000'); await page.press('#p27_f_annualAccounts', 'Tab');
  await page.check('#p27_m_annualAccounts'); await page.check('#p27_m_accounting');
  assert.equal(await page.inputValue('#p_value'), '27000', 'valeur estimée calculée');
  await page.evaluate(() => validateProspect(window._pid));
  const pr = await page.evaluate(() => { const c = state.clients.find(x => x.prospectId === window._pid); return { page: state.page, v: pfind(window._pid).value, fees: [fees27(c).accounting, fees27(c).annualAccounts], total: c.annualFees, st: c.status, bilan: c.missions.annualAccounts, onb: onbStep27(c, 4) }; });
  assert.deepEqual(pr, { page: 'onboarding', v: 27000, fees: [24000, 3000], total: 27000, st: 'Onboarding', bilan: true, onb: 'Fait' });
  // Client issu d'un prospect passé actif sans le bouton (ancienne version) : visible dans « Onboarding validé ».
  const legacy = await page.evaluate(() => { const c = state.clients.find(x => x.prospectId === window._pid); c.status = 'Actif'; delete c.onbValidated27; routePage('onboarding'); return [onbDone27(c), [...document.querySelectorAll('.onb27')].some(e => e.textContent.includes('PROSPECT TEST') && e.textContent.includes('Validé'))]; });
  assert.deepEqual(legacy, [true, true], 'ancien dossier actif listé dans Onboarding validé');
  console.log('✓ Prospect validé : missions et honoraires repris sur la fiche, arrivée en onboarding');

  // Rendu des écrans
  for (const p of ['fees', 'billing', 'closing', 'legal', 'rules', 'cabinetdash', 'fiscal', 'prospects', 'onboarding', 'clients', 'client', 'exceptional', 'time', 'profit', 'capacity', 'users']) {
    await page.evaluate(p => routePage(p), p);
    await page.waitForTimeout(150);
    if (shots && ['fees', 'rules'].includes(p)) await page.screenshot({ path: path.join(shots, p + '.png'), fullPage: false });
  }
  assert.ok(await page.evaluate(() => { routePage('fees'); return !document.body.innerText.includes('Maquette : données Pennylane simulées'); }));
  await page.waitForFunction(() => !shared25.busy && !shared25.pending);
  const rev = await page.evaluate(() => shared25.revision);

  // Conflit de version
  const cookie = (await page.context().cookies())[0];
  r = await fetch(base + '/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: `rb_sid=${cookie.value}` }, body: JSON.stringify({ revision: 0, state: { clients: [], prospects: [], invoices: [], time: [], onboarding: [], fiscal: [], closing: [], legal: [] } }) });
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
  assert.equal(st.revision, rev); assert.equal(st.state.pennylaneInvoices.length, 7); assert.equal(Object.values(st.state.boards27.bilan).filter(r => r.etat === '9. Bilan télédéclaré').length, 2);
  assert.ok(REDIS ? kv.run(['LLEN', 'rb:history']) >= 1 : fs.readdirSync(path.join(dataDir, 'history')).length >= 1, 'historique des versions');
  console.log(`✓ Données conservées après redémarrage (révision ${rev}, historique présent)`);

  srv.kill(); m.server.close(); kv?.server.close(); fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('\nTous les tests sont passés.');
})().catch(e => { console.error('\n✗ ÉCHEC :', e.message); process.exit(1); });
