/* Offres France Travail, suivi partagé de l'équipe, messages et relances (node test/team.js). */
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leads-'));
Object.assign(process.env, { LEADS_DATA_DIR: dataDir, LEADS_TEAM_PASSWORD: 'equipe-secrete', FT_CLIENT_ID: 'cid', FT_CLIENT_SECRET: 'csec', CRON_SECRET: 's3', LEADS_DEPS: '75', LEADS_MIN_SCORE: '40' });

const realFetch = globalThis.fetch;
const json = (status, body) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const offer = (id, nom, o = {}) => ({ id, intitule: o.intitule || 'Comptable H/F', dateCreation: day(1) + 'T08:00:00.000Z', typeContrat: o.contrat || 'CDI', typeContratLibelle: 'Contrat à durée indéterminée', dureeTravailLibelleConverti: o.duree || 'Temps plein',
  lieuTravail: { libelle: '75 - Paris 11e', codePostal: '75011' }, entreprise: nom ? { nom } : {}, secteurActiviteLibelle: o.secteur || 'Commerce de détail', trancheEffectifEtab: o.effectif || '6 à 9 salariés', contact: o.contact || null });
const OFFERS = [
  offer('1', 'BOULANGERIE DUPAIN', { duree: 'Temps partiel', contact: { nom: 'M. Dupain', courriel: 'recrutement@dupain.fr' } }),
  offer('2', 'BOULANGERIE DUPAIN', { intitule: 'Aide-comptable' }),
  offer('3', 'ADECCO PARIS', { secteur: 'Activités des agences de travail temporaire' }),
  offer('4', 'CABINET DURAND EXPERTISE COMPTABLE', { secteur: 'Activités comptables' }),
  offer('5', 'GRANDGROUPE SA', { effectif: '500 à 999 salariés' }),
  offer('6', ''),
];
const BODACC = [{ id: 'a1', dateparution: day(1), numerodepartement: '75', familleavis: 'immatriculation', commercant: 'ALPHA CONSEIL', registre: ['111111111'], ville: 'Paris', cp: '75011',
  listepersonnes: JSON.stringify({ personne: { typePersonne: 'pm', denomination: 'ALPHA CONSEIL', formeJuridique: 'SAS', administration: 'Président : Martin, Paul' } }) },
{ id: 'a2', dateparution: day(1), numerodepartement: '75', familleavis: 'immatriculation', commercant: 'BETA', registre: ['222222222'], ville: 'Paris', cp: '75011',
  listepersonnes: JSON.stringify({ personne: { typePersonne: 'pm', denomination: 'BETA', formeJuridique: 'SAS', administration: 'Président : Durand, Luc' } }) }];
let ftCalls = 0;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  if (u.hostname === 'entreprise.francetravail.fr') { assert.match(String(init.body), /client_id=cid/); return json(200, { access_token: 'tok', expires_in: 1499 }); }
  if (u.hostname === 'api.francetravail.io') { ftCalls++; assert.strictEqual(init.headers.Authorization, 'Bearer tok'); assert.strictEqual(u.searchParams.get('codeROME'), 'M1203,M1206'); return u.searchParams.get('range').startsWith('0-') ? json(206, { resultats: OFFERS }) : json(204); }
  if (u.hostname === 'bodacc-datadila.opendatasoft.com') return json(200, decodeURIComponent(u.search).includes('"immatriculation"') ? BODACC : []);
  if (u.hostname === 'recherche-entreprises.api.gouv.fr') return json(200, { results: [] });
  return realFetch(url, init);
};

(async () => {
  const server = require('../server');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  /* ---- API ---- */
  assert.strictEqual((await realFetch(base + '/api/follow')).status, 401);
  assert.strictEqual((await realFetch(base + '/api/follow', { headers: { 'x-leads-key': 'mauvais' } })).status, 401);
  assert.strictEqual((await realFetch(base + '/api/jobs?deps=75')).status, 401, 'offres protégées par le mot de passe d\'équipe');

  const browser = await chromium.launch(), errors = [];
  const open = async () => {
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    await page.addInitScript(() => localStorage.setItem('leadsEC:expandAll', 'true'));
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.route('**/bodacc-datadila.opendatasoft.com/**', rt => rt.fulfill({ json: rt.request().url().includes('/exports/json') ? BODACC : { total_count: 0, results: [] } }));
    await page.route('**/recherche-entreprises.api.gouv.fr/**', rt => { const q = new URL(rt.request().url()).searchParams.get('q'); rt.fulfill({ json: { results: q === 'BOULANGERIE DUPAIN' ? [{ siren: '555555555', nom_complet: 'BOULANGERIE DUPAIN', dirigeants: [{ nom: 'DUPAIN', prenoms: 'Jean' }], date_creation: '2015-01-01', etat_administratif: 'A' }] : [] } }); });
    await page.goto(base + '/');
    return page;
  };
  const login = async (page, user) => { await page.evaluate(() => openSettings()); await page.click('#teamBox summary'); await page.fill('#teamUser', user); await page.fill('#teamKey', 'equipe-secrete'); await page.click('#teamLogin'); await page.waitForFunction(u => document.getElementById('teamState').textContent.includes(u), user); };

  /* ---- Alice : suivi local repris dans le suivi partagé ---- */
  const alice = await open();
  await alice.evaluate(() => { localStorage.setItem('leadsEC:follow', JSON.stringify({ '222222222': { status: 'Pas intéressé', updated: '2026-01-01T00:00:00Z', lead: { id: '222222222', siren: '222222222', nom: 'BETA', ville: 'Paris' } } })); localStorage.setItem('leadsEC:clients', JSON.stringify(['999999999'])); });
  await alice.reload();
  await alice.evaluate(() => openSettings()); await alice.click('#teamBox summary'); await alice.fill('#teamUser', 'Alice'); await alice.fill('#teamKey', 'faux'); await alice.click('#teamLogin');
  await alice.waitForFunction(() => /incorrect/.test(document.getElementById('teamState').textContent));
  await alice.fill('#teamKey', 'equipe-secrete'); await alice.click('#teamLogin');
  await alice.waitForFunction(() => /Alice/.test(document.getElementById('teamState').textContent));
  let saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'follow.json'), 'utf8'));
  assert.strictEqual(saved['222222222'].status, 'Perdu', 'suivi local importé, ancien statut « Pas intéressé » converti');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).clients, ['999999999'], 'clients partagés');

  /* ---- Offres France Travail ---- */
  await alice.click('[data-tab=jobs]'); await alice.click('#run');
  await alice.waitForFunction(() => /offre\(s\) de comptable/.test(document.getElementById('status').textContent));
  const names = await alice.$$eval('tbody.lead tr.main', t => t.map(r => r.cells[1].innerText.split('\n')[0]));
  assert.ok(names.some(n => /BOULANGERIE DUPAIN/.test(n)));
  assert.ok(!names.some(n => /ADECCO|CABINET DURAND/.test(n)), 'intérim et cabinets comptables exclus');
  assert.strictEqual(names.length, 3, 'deux offres de la même entreprise regroupées');
  const dupain = 'tbody.lead[data-id="ft-boulangerie-dupain-75"]';
  assert.match(await alice.getAttribute(dupain + ' .score', 'title'), /moins de 20 salariés[\s\S]*temps partiel[\s\S]*2 offres/);
  assert.match(await alice.textContent(dupain), /recrutement@dupain\.fr/);
  const scores = Object.fromEntries(await alice.$$eval('tbody.lead tr.main', t => t.map(r => [r.cells[1].innerText.split('\n')[0].replace('NOUVEAU', ''), +r.cells[0].innerText])));
  assert.ok(scores['BOULANGERIE DUPAIN'] > scores['GRANDGROUPE SA'] && scores['GRANDGROUPE SA'] > scores['Entreprise non communiquée']);
  await alice.click('#enrich'); await alice.waitForFunction(() => /complété/.test(document.getElementById('status').textContent));
  assert.match(await alice.textContent(dupain), /555 555 555/, 'société retrouvée dans l\'annuaire par son nom');

  /* ---- Séquence, boîte d'envoi, pipeline ---- */
  await alice.evaluate(() => openSettings()); await alice.click('#msgBox summary');
  await alice.fill('#cab_cabinet', 'RB Partners'); await alice.fill('#cab_signataire', 'Benjamin H.'); await alice.fill('#cab_tel', '01 02 03 04 05'); await alice.fill('#cab_adresse', '10 rue de la Paix, 75002 Paris'); await alice.press('#cab_adresse', 'Tab');
  await alice.click(dupain + ' button.seq');
  await alice.waitForSelector('article.draft');
  assert.strictEqual(await alice.locator('article.draft').count(), 3, 'trois e-mails préparés');
  const e1 = 'article.draft:has-text("E-mail 1")';
  assert.strictEqual(await alice.inputValue(e1 + ' input[data-k="to"]'), 'recrutement@dupain.fr', 'adresse du contact de l\'offre');
  const body = await alice.inputValue(e1 + ' textarea');
  assert.match(body, /^Bonjour Jean Dupain,/); assert.match(body, /offre de poste comptable/); assert.match(body, /-- \nBenjamin H\.\nExpert-comptable – RB Partners\n01 02 03 04 05\n10 rue de la Paix/);
  assert.match(await alice.textContent(e1 + ' .dchecks'), /Adresse générique/, 'avertissement sans blocage');
  await alice.click(e1 + ' .d-sent');
  const fd = await alice.evaluate(() => JSON.parse(localStorage.getItem('leadsEC:follow'))['ft-boulangerie-dupain-75']);
  assert.strictEqual(fd.status, 'Contacté'); assert.strictEqual(fd.email, 'recrutement@dupain.fr');
  assert.strictEqual(fd.relance, new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10), 'relance 1 à J+4');
  // Courrier et LinkedIn restent dans la fenêtre de message.
  await alice.click('[data-tab=followed]');
  await alice.click('button.msg[data-id="ft-boulangerie-dupain-75"]');
  assert.match(await alice.inputValue('#m_body'), /^Madame, Monsieur,/);
  await alice.click('[data-canal=LinkedIn]'); assert.match(await alice.textContent('#m_count'), /\/ 300/);
  await alice.click('[data-m=close]');
  await alice.waitForFunction(() => !JSON.parse(localStorage.getItem('leadsEC:outbox') || '[]').length);
  saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'follow.json'), 'utf8'));
  assert.strictEqual(saved['ft-boulangerie-dupain-75'].by, 'Alice', 'auteur enregistré sur le serveur');

  /* ---- Bob voit le travail d'Alice et fait les relances ---- */
  const bob = await open(); await login(bob, 'Bob');
  await bob.click('[data-tab=followed]');
  assert.match(await bob.textContent('#results'), /par Alice/i);
  assert.strictEqual(await bob.textContent('#clientsCount'), '1 client');
  assert.strictEqual(await bob.evaluate(() => cabinet.cabinet), 'RB Partners', 'réglages du cabinet partagés');
  await bob.fill('input[data-id="ft-boulangerie-dupain-75"][data-k="relance"]', new Date().toISOString().slice(0, 10));
  await bob.dispatchEvent('input[data-id="ft-boulangerie-dupain-75"][data-k="relance"]', 'change');
  await bob.selectOption('#statusFilter', 'relance');
  assert.strictEqual(await bob.locator('tbody.lead').count(), 1);
  assert.match(await bob.textContent('#results'), /RELANCE/);
  assert.ok(await bob.isVisible('#todoBanner'));
  await bob.click('button.seq[data-id="ft-boulangerie-dupain-75"]');
  await bob.waitForSelector('article.draft');
  assert.match(await bob.textContent('article.draft'), /Relance 1/);
  await bob.click('article.draft .d-sent');
  let fb = await bob.evaluate(() => JSON.parse(localStorage.getItem('leadsEC:follow'))['ft-boulangerie-dupain-75']);
  assert.strictEqual(fb.status, 'Relance 1'); assert.strictEqual(fb.relance, new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10), 'relance 2 à J+10 après l\'e-mail 1');
  await bob.click('[data-tab=followed]'); await bob.selectOption('#statusFilter', '');
  await bob.click('button.seq[data-id="ft-boulangerie-dupain-75"]');
  await bob.waitForSelector('article.draft:has-text("Relance 2")');
  assert.match(await bob.textContent('article.draft:has-text("Relance 2") .dchecks'), /envoi anticipé/);
  await bob.click('article.draft:has-text("Relance 2") .d-sent');
  await bob.waitForFunction(() => !JSON.parse(localStorage.getItem('leadsEC:outbox') || '[]').length);
  saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'follow.json'), 'utf8'))['ft-boulangerie-dupain-75'];
  assert.deepStrictEqual(saved.contacts.map(x => x.canal + ':' + x.by), ['E-mail 1:Alice', 'Relance 1:Bob', 'Relance 2:Bob']);
  assert.strictEqual(saved.status, 'Relance 2'); assert.strictEqual(saved.relance, '', 'plus de relance après la deuxième');

  /* ---- Alice reçoit les changements de Bob ---- */
  await alice.evaluate(() => window.dispatchEvent(new Event('focus')));
  await alice.click('[data-tab=followed]');
  await alice.waitForFunction(() => /par Bob/i.test(document.querySelector('#results')?.textContent || ''));

  /* ---- Résumé hebdomadaire : déjà traité exclu, recrutements, relances ---- */
  const store = require('../lib/store').createStore();
  await store.set('333', { status: 'À traiter', relance: day(-2), lead: { nom: 'GAMMA', ville: 'Lyon' }, by: 'Alice' });
  await store.set('111111111', { status: 'Contacté', lead: { nom: 'ALPHA CONSEIL' } });
  const html = await (await realFetch(base + '/api/digest?secret=s3&dry=1')).text();
  assert.doesNotMatch(html, /ALPHA CONSEIL/, 'déjà contacté par l\'équipe : écarté');
  assert.match(html, /Entreprises qui recrutent un comptable/);
  assert.doesNotMatch(html, /BOULANGERIE DUPAIN/, 'déjà contactée');
  assert.doesNotMatch(html, /GRANDGROUPE SA/, 'grande entreprise : sous le score minimum');
  assert.doesNotMatch(html, /BETA/, 'marquée « Pas intéressé »');
  assert.match(html, /Relances de la semaine — 1[\s\S]*GAMMA[\s\S]*suivi par Alice/);
  assert.ok(ftCalls > 0);

  assert.deepStrictEqual(errors, []);
  await browser.close(); server.close(); fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('OK : offres France Travail, suivi partagé, messages, relances, résumé hebdomadaire');
})().catch(e => { console.error(e); process.exit(1); });
