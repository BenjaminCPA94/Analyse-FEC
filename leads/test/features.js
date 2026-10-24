/* Tests des fonctions ajoutées après l'audit (node test/features.js). */
'use strict';
const assert = require('node:assert');
const { chromium } = require('playwright');

const realFetch = globalThis.fetch;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const rec = (siren, name, o = {}) => ({ id: 'ann-' + siren + (o.suffix || ''), dateparution: day(1), numerodepartement: '75', familleavis: 'immatriculation', commercant: name, registre: [siren], ville: 'Paris', cp: '75011', url_complete: 'https://www.bodacc.fr/' + siren,
  listepersonnes: JSON.stringify({ personne: { typePersonne: 'pm', denomination: name, formeJuridique: o.forme || 'SAS', capital: { montantCapital: o.capital || '5000' }, administration: o.admin || 'Président : Martin, Paul' } }),
  listeetablissements: JSON.stringify({ etablissement: { activite: o.activite || 'Conseil en informatique' } }), ...(o.extra || {}) });
let RECORDS = [rec('111111111', 'ALPHA CONSEIL'), rec('222222222', 'BETA RESTO', { activite: 'Restauration' }), rec('333333333', 'GAMMA HOLDING', { activite: 'Prise de participations', capital: '900000' }), rec('444444444', 'VIEILLE BOITE')];
const ANN = { '444444444': { siren: '444444444', date_creation: '2005-03-01', etat_administratif: 'A', dirigeants: [{ nom: 'DURAND', prenoms: 'Luc' }] }, '111111111': { siren: '111111111', date_creation: day(10), tranche_effectif_salarie: '01', dirigeants: [{ nom: 'MARTIN', prenoms: 'Paul' }] } };
const mail = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  if (u.hostname === 'bodacc-datadila.opendatasoft.com') return json(200, u.pathname.endsWith('/exports/json') ? (decodeURIComponent(u.search).includes('"immatriculation"') ? RECORDS : []) : { total_count: 0, results: [] });
  if (u.hostname === 'recherche-entreprises.api.gouv.fr') { const x = ANN[u.searchParams.get('q')]; return json(200, { results: x ? [x] : [] }); }
  if (u.hostname === 'api.resend.com') { mail.push(JSON.parse(init.body)); return json(200, { id: 'm1' }); }
  if (u.hostname === 'places.googleapis.com') {
    assert.strictEqual(init.headers['x-goog-api-key'], 'gk');
    return json(200, { places: [{ displayName: { text: 'Alpha Conseil' }, websiteUri: 'https://www.alpha-conseil.fr/', nationalPhoneNumber: '01 40 00 00 00' }] });
  }
  if (u.hostname === 'api.hunter.io') return json(200, { data: u.searchParams.get('domain') === 'alpha-conseil.fr' ? { email: 'paul@alpha-conseil.fr', score: 95 } : { email: null } });
  return realFetch(url, init);
};

(async () => {
  /* ---- Résumé hebdomadaire ---- */
  Object.assign(process.env, { CRON_SECRET: 's3', LEADS_DEPS: '75', LEADS_TARGET: 'informatique', LEADS_CLIENTS: '222 222 222', LEADS_EMAIL_TO: 'moi@cabinet.fr', RESEND_API_KEY: 're_x', LEADS_MIN_SCORE: '55' });
  const server = require('../server');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.strictEqual((await realFetch(base + '/api/digest')).status, 401, 'secret obligatoire');
  const preview = await (await realFetch(base + '/api/digest?secret=s3&dry=1')).text();
  assert.match(preview, /ALPHA CONSEIL/);
  assert.doesNotMatch(preview, /BETA RESTO/, 'client exclu');
  assert.doesNotMatch(preview, /VIEILLE BOITE/, 'nouvel établissement d\'une société ancienne : sous le score minimum');
  assert.doesNotMatch(preview, /GAMMA HOLDING/, 'holding sous le score minimum');
  assert.strictEqual(mail.length, 0, 'aperçu : pas d\'envoi');
  const sent = await (await realFetch(base + '/api/digest', { headers: { Authorization: 'Bearer s3' } })).json();
  assert.strictEqual(sent.sent, true);
  assert.deepStrictEqual(mail[0].to, ['moi@cabinet.fr']);
  assert.match(mail[0].subject, /^1 lead\(s\)/);

  /* ---- Page ---- */
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1400, height: 900 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  const mock = async pg => {
    await pg.route('**/bodacc-datadila.opendatasoft.com/**', rt => rt.fulfill({ json: rt.request().url().includes('/exports/json') ? RECORDS : { total_count: 0, results: [] } }));
    await pg.route('**/recherche-entreprises.api.gouv.fr/**', rt => { const x = ANN[new URL(rt.request().url()).searchParams.get('q')]; rt.fulfill({ json: { results: x ? [x] : [] } }); });
  };
  await mock(page);
  // Suivi d'une ancienne version, rattaché à l'annonce : doit passer sur le SIREN.
  await page.goto(base + '/');
  await page.evaluate(() => localStorage.setItem('leadsEC:follow', JSON.stringify({ 'ann-111111111': { status: 'Contacté', note: 'appelé', lead: { id: 'ann-111111111', siren: '111111111', nom: 'ALPHA CONSEIL', ville: 'Paris' } } })));
  await page.reload();
  assert.deepStrictEqual(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('leadsEC:follow')))), ['111111111']);

  await page.click('#run'); await page.waitForSelector('tbody tr');
  const rows = () => page.$$eval('tbody tr', t => t.map(r => r.cells[2].innerText.split('\n')[0]));
  assert.strictEqual((await rows()).length, 4);
  assert.match((await rows())[0], /NOUVEAU/);
  assert.strictEqual(await page.$eval('select.st[data-id="111111111"]', s => s.value), 'Contacté', 'suivi retrouvé par SIREN');
  assert.match(await page.getAttribute('tr:has(select[data-id="333333333"]) .score', 'title'), /structure patrimoniale/);

  // Mes clients exclus.
  await page.fill('#clients', '222 222 222'); await page.press('#clients', 'Tab');
  assert.strictEqual(await page.textContent('#clientsCount'), '1 client');
  assert.ok(!(await rows()).some(r => /BETA/.test(r)));

  // Annuaire : société ancienne → nouvel établissement, score baissé ; cache réutilisé ensuite.
  await page.click('#enrich'); await page.waitForFunction(() => /complété/.test(document.getElementById('status').textContent));
  assert.match(await page.textContent('tr:has(select[data-id="444444444"])'), /Nouvel établissement/);
  assert.match(await page.getAttribute('tr:has(select[data-id="444444444"]) .score', 'title'), /société déjà existante/);
  let annCalls = 0; page.on('request', r => { if (r.url().includes('recherche-entreprises')) annCalls++; });
  await page.click('#run'); await page.waitForFunction(() => !document.getElementById('run').disabled);
  assert.match(await page.textContent('tr:has(select[data-id="444444444"])'), /Nouvel établissement/, 'complément repris du cache');
  assert.strictEqual(annCalls, 0);

  // Google : site et téléphone, puis Hunter avec le domaine trouvé.
  await page.click('#contactBox summary'); await page.fill('#key_google', 'gk'); await page.fill('#key_hunter', 'hk'); await page.click('#keysSave');
  await page.click('button.hf[data-id="111111111"]'); await page.waitForFunction(() => /trouvé pour ALPHA/.test(document.getElementById('status').textContent));
  assert.strictEqual(await page.inputValue('input[data-id="111111111"][data-k="site"]'), 'https://www.alpha-conseil.fr/');
  assert.strictEqual(await page.inputValue('input[data-id="111111111"][data-k="phone"]'), '01 40 00 00 00');
  assert.strictEqual(await page.inputValue('input[data-id="111111111"][data-k="email"]'), 'paul@alpha-conseil.fr');

  // Sauvegarde puis restauration dans un navigateur vierge.
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
  const file = await dl.path(), saved = JSON.parse(require('node:fs').readFileSync(file, 'utf8'));
  assert.ok(!JSON.stringify(saved).includes('gk'), 'pas de clé API dans la sauvegarde');
  const page2 = await (await browser.newContext()).newPage(); page2.on('pageerror', e => errors.push(e.message)); await mock(page2);
  await page2.goto(base + '/');
  await page2.setInputFiles('#restoreFile', file);
  await page2.waitForFunction(() => /restaurée/.test(document.getElementById('status').textContent));
  await page2.click('[data-tab=followed]');
  assert.strictEqual(await page2.inputValue('input[data-id="111111111"][data-k="email"]'), 'paul@alpha-conseil.fr');
  assert.strictEqual(await page2.textContent('#clientsCount'), '1 client');

  // Lancement automatique à l'ouverture.
  await page2.click('[data-tab=new]'); await page2.check('#auto');
  await page2.reload(); await page2.waitForFunction(() => /complété|Rien/.test(document.getElementById('status').textContent));
  assert.ok((await page2.$$('tbody tr')).length >= 3);

  assert.deepStrictEqual(errors, []);
  await browser.close(); server.close();
  console.log('OK : résumé hebdomadaire, SIREN, nouveaux, clients, annuaire en cache, Google, sauvegarde, lancement automatique');
})().catch(e => { console.error(e); process.exit(1); });
