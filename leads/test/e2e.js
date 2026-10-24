/* Test de bout en bout : page servie par server.js, relais, fournisseurs simulés (node test/e2e.js). */
'use strict';
const assert = require('node:assert');
const { chromium } = require('playwright');

const calls = [];
const realFetch = globalThis.fetch;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let dropPolls = 0;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url), h = init.headers || {};
  calls.push({ host: u.hostname, path: u.pathname, search: u.search, headers: h, body: init.body });
  const last = u.searchParams.get('last_name') || u.searchParams.get('lastName') || (init.body && (JSON.parse(init.body).lastname || JSON.parse(init.body).data?.[0]?.last_name));
  if (u.hostname === 'api.hunter.io') {
    if (u.searchParams.get('api_key') !== 'hk') return json(401, { errors: [{ details: 'bad key' }] });
    if (u.pathname.endsWith('/account')) return json(200, { data: { requests: { credits: { used: 2, available: 50 } } } });
    return json(200, { data: last === 'DUPONT' ? { email: 'marie@alpha.fr', score: 91, domain: 'alpha.fr' } : { email: null } });
  }
  if (u.hostname === 'api.apollo.io') {
    assert.strictEqual(h['x-api-key'], 'ak');
    return json(200, { person: last === 'MARTIN' ? { email: 'email_not_unlocked@domain.com', email_status: 'verified' } : last === 'RUSSO' ? { email: 'marco@napoli.fr', email_status: 'verified', organization: { primary_domain: 'napoli.fr' } } : {} });
  }
  if (u.hostname === 'app.icypeas.com') return json(200, { success: true, item: { status: 'NOT_FOUND', results: { emails: [] } } });
  if (u.hostname === 'api.dropcontact.com') {
    if (init.method === 'POST') return json(200, { request_id: 'r-' + last, success: true });
    if (++dropPolls % 2) return json(200, { success: false, reason: 'Request not ready yet' });
    return json(200, { success: true, data: [u.pathname.endsWith('r-MARTIN') ? { email: [{ email: 'paul.martin@devstudio.fr', qualification: 'nominative@pro' }], phone: '01 23 45 67 89' } : {}] });
  }
  if (u.hostname === 'api.lusha.com') return json(200, { contact: { data: { emailAddresses: [], phoneNumbers: [{ number: '+33 6 11 22 33 44' }] } } });
  return realFetch(url, init);
};

const day = new Date().toISOString().slice(0, 10);
const rec = (id, name, admin) => ({ id, dateparution: day, numerodepartement: '75', familleavis: 'immatriculation', commercant: name, registre: ['91234567' + id.slice(1)], ville: 'Paris', cp: '75011',
  listepersonnes: JSON.stringify({ personne: { typePersonne: 'pm', denomination: name, formeJuridique: 'SAS', administration: admin } }) });
const RECORDS = [rec('A1', 'ALPHA', 'Président : DUPONT, Marie'), rec('A2', 'DEV STUDIO', 'Président : MARTIN, Paul'), rec('A3', 'NAPOLI', 'Président : RUSSO, Marco'), rec('A4', 'ZETA', 'Gérant : DURAND, Luc')];

(async () => {
  // Le relais seul : adresse non autorisée refusée.
  const server = require('../server');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let r = await realFetch(base + '/api/proxy?url=' + encodeURIComponent('https://evil.example.com/x'));
  assert.strictEqual(r.status, 403);
  r = await realFetch(base + '/api/proxy?url=' + encodeURIComponent('http://api.hunter.io/v2/account'));
  assert.strictEqual(r.status, 403, 'http refusé');

  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1400, height: 900 } }), errors = [];
  await page.addInitScript(() => localStorage.setItem('leadsEC:expandAll', 'true'));
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const bodacc = [];
  await page.route('**/bodacc-datadila.opendatasoft.com/**', rt => { const u = rt.request().url(); bodacc.push(decodeURIComponent(u)); rt.fulfill({ json: u.includes('/exports/json') ? RECORDS : { total_count: RECORDS.length, results: RECORDS } }); });
  await page.goto(base + '/');
  await page.click('#run'); await page.waitForSelector('tbody.lead');
  assert.match(bodacc[0], /exports\/json\?where=.*limit=-1/, 'export complet, sans pagination');
  assert.strictEqual(bodacc.length, 1);

  await page.evaluate(() => openSettings()); await page.click('#contactBox summary');
  await page.fill('#key_hunter', 'hk'); await page.fill('#key_apollo', 'ak'); await page.fill('#key_icypeas', 'ik'); await page.fill('#key_dropcontact', 'dk'); await page.fill('#key_lusha', 'lk');
  await page.click('#keysSave'); await page.waitForFunction(() => /crédit/.test(document.getElementById('status').textContent));
  assert.match(await page.textContent('#status'), /48 crédit\(s\) restant\(s\) sur 50/);
  assert.match(await page.textContent('#proxyHint'), /relayés/);

  // Un lead : Hunter trouve, les suivants ne sont pas appelés.
  const before = calls.length;
  await page.click('button.hf[data-id="912345671"]'); await page.waitForFunction(() => /trouvé pour ALPHA/.test(document.getElementById('status').textContent));
  assert.strictEqual(await page.inputValue('input[data-id="912345671"][data-k=email]'), 'marie@alpha.fr');
  assert.deepStrictEqual(calls.slice(before).map(c => c.host), ['api.hunter.io']);

  // Recherche groupée : DEV STUDIO (Apollo masqué → Icypeas rien → Dropcontact trouve, téléphone compris),
  // NAPOLI (Apollo trouve), ZETA (personne : téléphone Lusha seulement).
  await page.click('#findAll');
  await page.waitForFunction(() => /e-mail\(s\) trouvé\(s\) sur/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
  assert.match(await page.textContent('#status'), /2 e-mail\(s\) trouvé\(s\) sur 3/);
  assert.strictEqual(await page.inputValue('input[data-id="912345672"][data-k=email]'), 'paul.martin@devstudio.fr');
  assert.strictEqual(await page.inputValue('input[data-id="912345672"][data-k=phone]'), '01 23 45 67 89');
  assert.strictEqual(await page.inputValue('input[data-id="912345673"][data-k=email]'), 'marco@napoli.fr');
  assert.strictEqual(await page.inputValue('input[data-id="912345674"][data-k=phone]'), '+33 6 11 22 33 44');
  assert.match(await page.textContent('tbody.lead[data-id="912345674"]'), /ajoute le site web/);

  // Site web ajouté : les fournisseurs sont réinterrogés avec le domaine.
  await page.fill('input[data-id="912345674"][data-k=site]', 'https://www.zeta-conseil.fr/contact'); await page.press('input[data-id="912345674"][data-k=site]', 'Tab');
  const b2 = calls.length;
  await page.click('button.hf[data-id="912345674"]'); await page.waitForFunction(() => /Pas d'e-mail pour Luc/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
  const hunterCall = calls.slice(b2).find(c => c.host === 'api.hunter.io');
  assert.match(hunterCall.search, /domain=zeta-conseil\.fr/);

  // Clés transmises par le relais, et suivi conservé après rechargement.
  assert.ok(calls.some(c => c.host === 'api.dropcontact.com' && c.headers['x-access-token'] === 'dk'));
  assert.ok(calls.some(c => c.host === 'app.icypeas.com' && c.headers.authorization === 'ik'));
  assert.ok(calls.some(c => c.host === 'api.lusha.com' && c.headers.api_key === 'lk'));
  await page.reload(); await page.click('[data-tab=followed]');
  assert.strictEqual(await page.locator('tbody.lead').count(), 4);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
  const csv = require('node:fs').readFileSync(await dl.path(), 'utf8');
  assert.match(csv, /paul\.martin@devstudio\.fr;Dropcontact/);

  assert.deepStrictEqual(errors, []);
  await browser.close(); server.close();
  console.log('OK : relais, cascade de fournisseurs, site web, suivi et export');
})().catch(e => { console.error(e); process.exit(1); });
