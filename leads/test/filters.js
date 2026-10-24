/* Filtres de recherche : formes juridiques, capital, zone (node test/filters.js). */
'use strict';
const assert = require('node:assert');
const { chromium } = require('playwright');

const day = new Date().toISOString().slice(0, 10);
const rec = (siren, name, forme, capital, cp, ville, pp) => ({ id: 'a' + siren, dateparution: day, numerodepartement: cp.slice(0, 2), familleavis: 'immatriculation', commercant: name, registre: [siren], ville, cp,
  listepersonnes: JSON.stringify({ personne: pp ? { typePersonne: 'pp', nom: name, prenom: 'Jean' } : { typePersonne: 'pm', denomination: name, formeJuridique: forme, ...(capital != null ? { capital: { montantCapital: String(capital) } } : {}) } }) });
const RECORDS = [
  rec('100000001', 'PETITE SAS', 'Société par actions simplifiée', 1000, '75011', 'Paris'),
  rec('100000002', 'SOLO SASU', 'Société par actions simplifiée à associé unique', 5000, '75012', 'Paris'),
  rec('100000003', 'GROSSE SARL', 'Société à responsabilité limitée', 150000, '75011', 'Paris'),
  rec('100000004', 'UNI EURL', 'Entreprise unipersonnelle à responsabilité limitée', 10000, '93100', 'Montreuil'),
  rec('100000005', 'IMMO SCI', 'Société civile immobilière', 1000, '75011', 'Paris'),
  rec('100000006', 'DUPONT', '', null, '75011', 'Paris', true),
  rec('100000007', 'MYSTERE SAS', 'SAS', null, '75011', 'Paris'),
  rec('100000008', 'CABINET MEDICAL', "Société d'exercice libéral à responsabilité limitée", 2000, '75011', 'Paris'),
];

(async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { const u = new URL(url); if (u.hostname === 'bodacc-datadila.opendatasoft.com') return new Response(JSON.stringify(u.pathname.endsWith('/exports/json') && decodeURIComponent(u.search).includes('"immatriculation"') ? RECORDS : []), { headers: { 'content-type': 'application/json' } }); if (u.hostname === 'recherche-entreprises.api.gouv.fr') return new Response('{"results":[]}', { headers: { 'content-type': 'application/json' } }); return realFetch(url, init); };
  Object.assign(process.env, { CRON_SECRET: 's3', LEADS_DEPS: '75,93', LEADS_MIN_SCORE: '0', LEADS_CAPITAL_MAX: '10000', LEADS_FORMES: 'SAS,SASU,EURL' });
  const server = require('../server');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  /* Résumé hebdomadaire : mêmes filtres par variables d'environnement. */
  const html = await (await realFetch(base + '/api/digest?secret=s3&dry=1')).text();
  for (const n of ['PETITE SAS', 'SOLO SASU', 'UNI EURL', 'MYSTERE SAS']) assert.match(html, new RegExp(n));
  for (const n of ['GROSSE SARL', 'IMMO SCI', 'DUPONT', 'CABINET MEDICAL']) assert.doesNotMatch(html, new RegExp(n));

  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1400, height: 900 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/bodacc-datadila.opendatasoft.com/**', rt => rt.fulfill({ json: RECORDS }));
  // Anciens réglages : « sociétés uniquement » décoché et capital minimum → repris dans les nouveaux filtres.
  await page.goto(base + '/');
  await page.evaluate(() => localStorage.setItem('leadsEC:criteria', JSON.stringify({ deps: '75, 93', days: '14', onlyPM: false, noSCI: true, minCap: '500' })));
  await page.reload();
  const checked = () => page.$$eval('#formes input:checked', x => x.map(i => i.value));
  assert.deepStrictEqual(await checked(), ['SAS', 'SASU', 'SARL', 'EURL', 'SA', 'SNC', 'EI', 'Autre']);
  assert.strictEqual(await page.inputValue('#capMin'), '500');

  await page.click('#run'); await page.waitForSelector('tbody tr');
  const names = () => page.$$eval('tbody tr', t => t.map(r => r.cells[2].innerText.split('\n')[0].replace(/NOUVEAU|RELANCE/g, '')).sort());
  assert.deepStrictEqual(await names(), ['CABINET MEDICAL', 'DUPONT', 'GROSSE SARL', 'MYSTERE SAS', 'PETITE SAS', 'SOLO SASU', 'UNI EURL']);

  // Capital max 10 000 € : la grosse SARL disparaît ; capitaux inconnus gardés puis retirés.
  await page.fill('#capMin', ''); await page.fill('#capMax', '10000'); await page.press('#capMax', 'Tab');
  assert.ok(!(await names()).includes('GROSSE SARL'));
  assert.ok((await names()).includes('MYSTERE SAS'));
  await page.uncheck('#capUnknown');
  assert.ok(!(await names()).includes('MYSTERE SAS'));
  assert.ok((await names()).includes('DUPONT'), 'EI : capital sans objet, gardée');
  await page.check('#capUnknown');

  // Formes : SAS et SASU seulement.
  await page.click('#formesNone'); assert.strictEqual((await names()).length, 0);
  await page.check('#formes input[value=SAS]'); await page.check('#formes input[value=SASU]');
  assert.deepStrictEqual(await names(), ['MYSTERE SAS', 'PETITE SAS', 'SOLO SASU']);
  await page.check('#formes input[value=Autre]');
  assert.ok((await names()).includes('CABINET MEDICAL'), 'SELARL classée en « Autres »');

  // Zone : un début de code postal ou une ville.
  await page.click('#formesAll');
  await page.fill('#zones', '93'); await page.press('#zones', 'Tab');
  assert.deepStrictEqual(await names(), ['UNI EURL']);
  await page.fill('#zones', '75012, montreuil'); await page.press('#zones', 'Tab');
  assert.deepStrictEqual(await names(), ['SOLO SASU', 'UNI EURL']);

  // Réglages conservés.
  await page.reload();
  assert.strictEqual(await page.inputValue('#zones'), '75012, montreuil');
  assert.strictEqual(await page.inputValue('#capMax'), '10000');
  assert.strictEqual((await checked()).length, 9);
  // Plus de bonus pour les gros capitaux.
  await page.fill('#zones', ''); await page.press('#zones', 'Tab'); await page.fill('#capMax', ''); await page.press('#capMax', 'Tab');
  await page.click('#run'); await page.waitForSelector('tbody tr');
  assert.doesNotMatch(await page.getAttribute('tr:has(select[data-id="100000003"]) .score', 'title'), /capital/);

  assert.deepStrictEqual(errors, []);
  await browser.close(); server.close();
  console.log('OK : formes juridiques, capital min. et max., capitaux inconnus, zone, anciens réglages, résumé hebdomadaire');
})().catch(e => { console.error(e); process.exit(1); });
