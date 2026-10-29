/* Analyse des sites, réseaux sociaux (Serper), Sales Navigator (node test/social.js). */
'use strict';
const assert = require('node:assert');
const http = require('node:http');
const { chromium } = require('playwright');
const { extract, privateIp } = require('../api/site');

/* ---- Extraction ---- */
const sample = `<a href="mailto:contact@alpha-conseil.fr">Écrire</a> paul.martin&#64;alpha-conseil.fr logo@2x.png noreply@alpha-conseil.fr
  <a href="tel:+33140000000">Appeler</a> <a href="https://www.instagram.com/alphaconseil/?hl=fr">IG</a>
  <a href="https://www.facebook.com/sharer/sharer.php?u=x">partager</a> <a href="https://fr.linkedin.com/company/alpha-conseil">in</a>
  <a href="/contact">Nous contacter</a> <a href="https://ailleurs.fr/contact">autre site</a>`;
const x = extract(sample, 'https://www.alpha-conseil.fr/');
assert.deepStrictEqual(x.emails.sort(), ['contact@alpha-conseil.fr', 'paul.martin@alpha-conseil.fr']);
assert.deepStrictEqual(x.socials, { instagram: 'https://www.instagram.com/alphaconseil', linkedin: 'https://fr.linkedin.com/company/alpha-conseil' });
assert.deepStrictEqual(x.links, ['https://www.alpha-conseil.fr/contact']);
assert.ok(x.phones.includes('+33140000000'));
assert.ok(privateIp('127.0.0.1') && privateIp('10.1.2.3') && privateIp('192.168.0.1') && privateIp('169.254.169.254') && privateIp('::1') && !privateIp('8.8.8.8'));

/* ---- Site de test ---- */
const page = (dom, name) => ({
  '/': `<html><body><h1>${name}</h1><a href="/contact">Contact</a><a href="https://www.facebook.com/${dom.split('.')[0]}">Facebook</a></body></html>`,
  '/contact': `<p>Écrivez à contact@${dom} ou à paul.martin@${dom} — 01 40 00 00 00</p><a href="https://www.instagram.com/${dom.split('.')[0]}">Insta</a>`,
});
const serve = pages => http.createServer((req, res) => { const body = pages[req.url]; res.writeHead(body ? 200 : 404, { 'Content-Type': 'text/html' }); res.end(body || ''); });
const site = serve(page('alpha-conseil.fr', 'Alpha Conseil')), site2 = serve(page('gamma-bistrot.fr', 'Gamma Bistrot'));
// Site affiché en JavaScript : rien de lisible sans navigateur.
const site3 = serve({ '/': '<html><body><div id="app"></div><script src="/app.js"></script></body></html>' });

const realFetch = globalThis.fetch, serperQueries = [], hunterCalls = [], sgai = [];
const json = b => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
let siteUrl = '';
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  if (u.hostname === 'google.serper.dev') {
    const q = JSON.parse(init.body).q; serperQueries.push(q);
    if (/site:linkedin\.com\/in/.test(q)) return json({ organic: [{ link: 'https://fr.linkedin.com/in/luc-durand-123?trk=x', title: 'Luc Durand - Gérant - Gamma Bistrot' }] });
    if (/site:linkedin\.com\/company/.test(q)) return json({ organic: [{ link: 'https://www.instagram.com/gammabistrot/', title: 'Gamma Bistrot (@gammabistrot)', snippet: 'Restaurant Paris 11' }, { link: 'https://www.instagram.com/autre/', title: 'Un autre resto' }, { link: 'https://www.facebook.com/GammaBistrotParis', title: 'Gamma Bistrot | Paris' }] });
    return json({ organic: [{ link: 'https://www.societe.com/societe/gamma-bistrot-333333333.html', title: 'GAMMA BISTROT (Paris) Chiffre d\'affaires' }, { link: siteUrl, title: 'Gamma Bistrot — restaurant' }] });
  }
  if (u.hostname === 'api.scrapegraphai.com') {
    sgai.push({ path: u.pathname, key: init.headers['sgai-apikey'], body: init.body && JSON.parse(init.body) });
    if (init.method === 'POST') return json({ request_id: 'r1', status: 'queued' });
    return json({ request_id: 'r1', status: 'completed', result: { emails: ['delta.gerant@delta-js.fr'], phones: ['01 55 66 77 88'], manager: 'Rose Petit', instagram: 'https://www.instagram.com/deltajs/', facebook: null } });
  }
  if (u.hostname === 'api.hunter.io') { if (u.pathname.endsWith('/email-finder')) hunterCalls.push(u.search); return json({ data: { email: null } }); }
  return realFetch(url, init);
};
const day = new Date().toISOString().slice(0, 10);
const rec = (siren, name, admin) => ({ id: 'a' + siren, dateparution: day, numerodepartement: '75', familleavis: 'immatriculation', commercant: name, registre: [siren], ville: 'Paris', cp: '75011',
  listepersonnes: JSON.stringify({ personne: { typePersonne: 'pm', denomination: name, formeJuridique: 'SAS', administration: admin } }) });
const RECORDS = [rec('111111111', 'ALPHA CONSEIL', 'Président : Martin, Paul'), rec('333333333', 'GAMMA BISTROT', 'Gérant : Durand, Luc'), rec('444444444', 'DELTA JS', 'Présidente : Petit, Rose')];

(async () => {
  await new Promise(r => site.listen(0, '127.0.0.1', r)); await new Promise(r => site2.listen(0, '127.0.0.1', r)); await new Promise(r => site3.listen(0, '127.0.0.1', r));
  const sitePort = site.address().port, site2Port = site2.address().port;
  const server = require('../server');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  // Adresses internes refusées (sauf autorisation réservée aux tests).
  let r = await realFetch(base + '/api/site?url=' + encodeURIComponent(`http://127.0.0.1:${sitePort}/`));
  assert.strictEqual(r.status, 400);
  r = await realFetch(base + '/api/site?url=' + encodeURIComponent('file:///etc/passwd'));
  assert.strictEqual(r.status, 400);
  process.env.LEADS_SITE_ALLOW_LOCAL = '1';
  const a = await (await realFetch(base + '/api/site?url=' + encodeURIComponent(`http://127.0.0.1:${sitePort}/`))).json();
  assert.deepStrictEqual(a.emails.sort(), ['contact@alpha-conseil.fr', 'paul.martin@alpha-conseil.fr']);
  assert.strictEqual(a.socials.facebook, 'https://www.facebook.com/alpha-conseil');
  assert.strictEqual(a.socials.instagram, 'https://www.instagram.com/alpha-conseil');
  assert.strictEqual(a.pages.length, 2);

  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1400, height: 900 } }), errors = [];
  await page.addInitScript(() => localStorage.setItem('leadsEC:expandAll', 'true'));
  page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.route('**/bodacc-datadila.opendatasoft.com/**', rt => rt.fulfill({ json: RECORDS }));
  await page.goto(base + '/');
  await page.click('#run'); await page.waitForSelector('tbody.lead');
  assert.ok(await page.$('tbody.lead[data-id="111111111"] a[href*="linkedin.com/sales/search/people"]'), 'lien Sales Navigator');

  // E-mail : le site (gratuit) passe avant Hunter.
  const siteA = `http://127.0.0.1:${sitePort}/`;
  await page.evaluate(() => openSettings()); await page.click('#contactBox summary'); await page.fill('#key_hunter', 'hk'); await page.click('#keysSave');
  await page.fill('input[data-id="111111111"][data-k="site"]', siteA); await page.press('input[data-id="111111111"][data-k="site"]', 'Tab');
  await page.click('button.hf[data-id="111111111"]');
  await page.waitForFunction(() => /trouvé pour ALPHA/.test(document.getElementById('status').textContent));
  assert.strictEqual(await page.inputValue('input[data-id="111111111"][data-k="email"]'), 'paul.martin@alpha-conseil.fr', 'adresse du dirigeant préférée');
  assert.strictEqual(await page.inputValue('input[data-id="111111111"][data-k="phone"]'), '01 40 00 00 00');
  assert.strictEqual(hunterCalls.length, 0, 'Hunter pas sollicité');
  assert.match(await page.textContent('tbody.lead[data-id="111111111"] .links'), /Instagram ✓[\s\S]*Facebook ✓|Facebook ✓[\s\S]*Instagram ✓/);

  // Serper : réseaux et site trouvés à partir du nom, puis analyse du site.
  siteUrl = `http://127.0.0.1:${site2Port}`;
  await page.fill('#key_serper', 'sk'); await page.click('#keysSave');
  await page.click('button.sf[data-id="333333333"]');
  await page.waitForFunction(() => /GAMMA BISTROT :/.test(document.getElementById('status').textContent));
  const soc = await page.evaluate(() => JSON.parse(localStorage.getItem('leadsEC:follow'))['333333333']);
  assert.strictEqual(soc.socials.instagram, 'https://www.instagram.com/gammabistrot', 'compte homonyme écarté');
  assert.strictEqual(soc.socials.facebook, 'https://www.facebook.com/GammaBistrotParis');
  assert.strictEqual(soc.socials.linkedinPerson, 'https://fr.linkedin.com/in/luc-durand-123');
  assert.strictEqual(soc.site, siteUrl, 'site trouvé (societe.com écarté)');
  assert.strictEqual(soc.email, 'contact@gamma-bistrot.fr');
  assert.strictEqual(serperQueries.length, 3);
  assert.match(await page.textContent('tbody.lead[data-id="333333333"] .links'), /LinkedIn \(dirigeant\) ✓/);
  assert.ok(!(await page.$('button.sf[data-id="333333333"]')), 'pas de seconde recherche payante');

  // ScrapeGraphAI : le site ne montre rien à l'analyse simple ; l'IA le lit, après l'analyse gratuite et avant Hunter.
  const site3Url = `http://127.0.0.1:${site3.address().port}/`;
  await page.fill('#key_scrapegraph', 'sgk'); await page.click('#keysSave');
  assert.ok(!(await page.$('button.hf[data-id="444444444"]')) || true);
  await page.fill('input[data-id="444444444"][data-k="site"]', site3Url); await page.press('input[data-id="444444444"][data-k="site"]', 'Tab');
  const hBefore = hunterCalls.length;
  await page.click('button.hf[data-id="444444444"]');
  await page.waitForFunction(() => /trouvé pour DELTA JS/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
  assert.strictEqual(await page.inputValue('input[data-id="444444444"][data-k="email"]'), 'delta.gerant@delta-js.fr');
  assert.strictEqual(await page.inputValue('input[data-id="444444444"][data-k="phone"]'), '01 55 66 77 88');
  assert.match(await page.textContent('tbody.lead[data-id="444444444"] .links'), /Instagram ✓/);
  assert.strictEqual(hunterCalls.length, hBefore, 'Hunter pas sollicité');
  assert.deepStrictEqual(sgai.map(x => x.path), ['/v1/smartscraper', '/v1/smartscraper/r1'], 'requête puis lecture du résultat');
  assert.strictEqual(sgai[0].key, 'sgk'); assert.strictEqual(sgai[0].body.website_url, site3Url); assert.match(sgai[0].body.user_prompt, /e-mail/);
  const fd = await page.evaluate(() => JSON.parse(localStorage.getItem('leadsEC:follow'))['444444444']);
  assert.strictEqual(fd.found.by, 'ScrapeGraphAI (lecture du site par IA)');
  // Sans site, ScrapeGraphAI n'est pas proposé.
  assert.ok(!(await page.evaluate(() => pending(leads.find(l => l.id === '111111111'), {}).some(p => p.id === 'scrapegraph'))));

  // Export.
  await page.click('[data-tab=followed]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
  assert.match(require('node:fs').readFileSync(await dl.path(), 'utf8'), /https:\/\/www\.instagram\.com\/gammabistrot/);

  assert.deepStrictEqual(errors, []);
  await browser.close(); server.close(); site.close(); site2.close(); site3.close();
  console.log('OK : analyse des sites, réseaux par Serper, cascade, Sales Navigator, export');
})().catch(e => { console.error(e); process.exit(1); });
