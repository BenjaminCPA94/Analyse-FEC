/* « Trouver les e-mails » : annuaire, site, fournisseurs pour tous les leads affichés en un clic (node test/oneclick.js). */
'use strict';
const assert = require('node:assert');
const { chromium } = require('playwright');

const json = b => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
const realFetch = globalThis.fetch, calls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  if (u.hostname === 'api.hunter.io') {
    if (u.pathname.endsWith('/account')) return json({ data: {} });
    calls.push('hunter:' + u.searchParams.get('last_name'));
    return json({ data: u.searchParams.get('last_name') === 'DUPONT' ? { email: 'marie@alpha.fr', score: 92 } : { email: null } });
  }
  if (u.hostname === 'api.lusha.com') { calls.push('lusha:' + u.searchParams.get('lastName')); return json({ contact: { data: { phoneNumbers: u.searchParams.get('lastName') === 'MARTIN' ? [{ number: '06 11 22 33 44' }] : [] } } }); }
  return realFetch(url, init);
};
const day = new Date().toISOString().slice(0, 10);
// Annonces sans dirigeant : il faut d'abord l'annuaire.
const rec = (siren, name, score) => ({ id: 'a' + siren, dateparution: day, numerodepartement: '75', familleavis: 'immatriculation', commercant: name, registre: [siren], ville: 'Paris', cp: '75011',
  listepersonnes: JSON.stringify({ personne: { typePersonne: 'pm', denomination: name, formeJuridique: 'SAS' } }), listeetablissements: JSON.stringify({ etablissement: { activite: score ? 'Conseil en informatique' : 'Commerce' } }) });
const RECORDS = [rec('111111111', 'ALPHA', true), rec('222222222', 'BETA', false), rec('333333333', 'GAMMA HOLDING', false)];
const ANN = { '111111111': [{ nom: 'DUPONT', prenoms: 'Marie' }], '222222222': [{ nom: 'MARTIN', prenoms: 'Paul' }], '333333333': [{ denomination: 'MERE SAS' }] };

(async () => {
  const server = require('../server');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1400, height: 900 } }), errors = [], dialogs = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.route('**/bodacc-datadila.opendatasoft.com/**', rt => rt.fulfill({ json: RECORDS }));
  await page.route('**/recherche-entreprises.api.gouv.fr/**', rt => { const q = new URL(rt.request().url()).searchParams.get('q'); rt.fulfill({ json: { results: [{ siren: q, dirigeants: ANN[q], date_creation: day, etat_administratif: 'A' }] } }); });
  await page.goto(base + '/');
  await page.fill('#target', 'informatique'); await page.press('#target', 'Tab');
  await page.click('#run'); await page.waitForSelector('tbody.lead');

  // Sans clé : le panneau des réglages s'ouvre sur les fournisseurs.
  await page.evaluate(() => { proxy = ''; });
  await page.click('#findEmails');
  assert.ok(await page.isVisible('#drawer')); assert.match(await page.textContent('#status'), /Hunter est gratuit/);
  await page.evaluate(() => { proxy = 'api/proxy'; });
  await page.fill('#key_hunter', 'hk'); await page.fill('#key_lusha', 'lk'); await page.click('#keysSave');
  await page.click('#drawerClose');

  // Un clic : dirigeants puis e-mails, du meilleur score au moins bon, sans rien déplier.
  await page.click('#findEmails');
  await page.waitForFunction(() => /e-mail\(s\) et .* téléphone\(s\) trouvé\(s\) sur 3/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
  assert.match(dialogs[0], /3 société\(s\)/);
  const status = await page.textContent('#status');
  assert.match(status, /^1 e-mail\(s\) et 1 téléphone\(s\) trouvé\(s\) sur 3 société\(s\)\. 1 sans dirigeant/);
  assert.strictEqual(calls[0], 'hunter:DUPONT', 'meilleur score en premier');
  assert.ok(!calls.some(c => /hunter:MARTIN/.test(c)) || calls.indexOf('hunter:MARTIN') > 0);
  assert.match(await page.textContent('tbody.lead[data-id="111111111"] td.c-dir'), /✉ marie@alpha\.fr/, 'e-mail visible dans le tableau');
  assert.match(await page.textContent('tbody.lead[data-id="222222222"] td.c-dir'), /☎ 06 11 22 33 44/);
  assert.ok(!(await page.isVisible('input[data-id="111111111"][data-k="email"]')), 'pas besoin de déplier');
  assert.strictEqual(await page.textContent('#findEmails'), 'Trouver les e-mails');

  // Filtre e-mail trouvé ou non.
  const shown = () => page.$$eval('tbody.lead', t => t.map(x => x.dataset.id).sort());
  await page.selectOption('#contactFilter', 'email'); assert.deepStrictEqual(await shown(), ['111111111']);
  await page.selectOption('#contactFilter', 'noemail'); assert.deepStrictEqual(await shown(), ['222222222', '333333333']);
  await page.selectOption('#contactFilter', 'phone'); assert.deepStrictEqual(await shown(), ['222222222']);
  await page.selectOption('#contactFilter', 'any'); assert.deepStrictEqual(await shown(), ['111111111', '222222222']);
  assert.match(await page.textContent('#stats'), /1 avec e-mail/);
  await page.selectOption('#contactFilter', '');

  // Deuxième clic : plus rien à chercher pour ALPHA ; les autres ne sont pas réinterrogés inutilement.
  const n = calls.length;
  await page.click('#findEmails');
  await page.waitForFunction(() => /trouvé\(s\) sur 2/.test(document.getElementById('status').textContent));
  assert.strictEqual(calls.length, n, 'fournisseurs déjà interrogés : aucun crédit dépensé');

  assert.deepStrictEqual(errors, []);
  await browser.close(); server.close();
  console.log('OK : recherche des e-mails en un clic');
})().catch(e => { console.error(e); process.exit(1); });
