/* « Tester toutes les clés » : diagnostic par fournisseur (node test/keys.js). */
'use strict';
const assert = require('node:assert');
const { chromium } = require('playwright');

const json = (status, b) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const realFetch = globalThis.fetch, hits = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url); hits.push(u.hostname + u.pathname);
  if (u.hostname === 'api.hunter.io') return u.searchParams.get('api_key') === 'hk' ? json(200, { data: { requests: { credits: { used: 5, available: 50 } } } }) : json(401, { errors: [{ details: 'No user found' }] });
  if (u.hostname === 'api.scrapegraphai.com') return json(404, { detail: 'Not Found' });
  if (u.hostname === 'v2-api.scrapegraphai.com') { assert.strictEqual(init.headers['sgai-apikey'], 'sgk'); return json(200, { remaining_credits: 495 }); }
  if (u.hostname === 'api.apollo.io') return json(401, { error: 'Invalid access credentials.' });
  if (u.hostname === 'google.serper.dev') return json(200, { organic: [] });
  return realFetch(url, init);
};

(async () => {
  const server = require('../server');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1400, height: 900 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/');
  await page.evaluate(() => openSettings()); await page.click('#contactBox summary');
  await page.fill('#key_hunter', 'hk'); await page.fill('#key_scrapegraph', 'sgk'); await page.fill('#key_apollo', 'mauvaise'); await page.fill('#key_serper', 'sk'); await page.fill('#key_lusha', 'lk');
  await page.click('#keysTest');
  await page.waitForFunction(() => /Test des clés/.test(document.getElementById('status').textContent));
  const report = await page.textContent('#keysReport');
  assert.match(report, /Hunter : 45 crédit\(s\) restant\(s\) sur 50/);
  assert.match(report, /ScrapeGraphAI \(lecture du site par IA\) : 495 crédit\(s\) restant\(s\)/, 'bascule sur la v2');
  assert.match(report, /Apollo : clé refusée/);
  assert.match(report, /Serper \(réseaux sociaux et site\) : clé valide \(1 recherche utilisée\)/);
  assert.match(report, /Lusha : pas de test sans dépense de crédit/);
  assert.match(await page.textContent('#status'), /3 sur 5 confirmée\(s\)/);
  assert.ok(!hits.some(h => /lusha/.test(h)), 'Lusha non appelé');

  // Fichier ouvert directement : un appel refusé par le navigateur est signalé comme tel.
  await page.evaluate(() => { proxy = ''; });
  await page.route('https://api.hunter.io/**', rt => rt.abort());
  await page.fill('#key_scrapegraph', ''); await page.fill('#key_apollo', ''); await page.fill('#key_serper', ''); await page.fill('#key_lusha', '');
  await page.click('#keysTest');
  await page.waitForFunction(() => /Test des clés : 0 sur 1/.test(document.getElementById('status').textContent));
  assert.match(await page.textContent('#keysReport'), /Fichier ouvert directement[\s\S]*Hunter : appel bloqué par le navigateur \(normal en fichier ouvert directement/);

  assert.deepStrictEqual(errors, []);
  await browser.close(); server.close();
  console.log('OK : test des clés des fournisseurs');
})().catch(e => { console.error(e); process.exit(1); });
