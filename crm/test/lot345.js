/* Tests d'acceptation des lots 3 (navigation, Mon travail, fiche client, préférences), 4 (processus, calendrier fiscal,
 * sortie client, relances) et 5 (identité, temps, rentabilité, charge, revue des honoraires, qualité).
 *   node test/lot345.js        STORE=redis node test/lot345.js */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const bridge = require('./redis-bridge');
const upstash = require('./mock-upstash');

let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }
const ROOT = path.join(__dirname, '..');
const PASSWORD = 'motdepasse-test-123';
const REDIS = process.env.STORE === 'redis';

function run(args, env) { return spawn(process.execPath, [path.join(ROOT, 'server.js'), ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); }
function waitFor(proc, text) {
  return new Promise((resolve, reject) => {
    let out = '';
    proc.stdout.on('data', d => { out += d; if (out.includes(text)) resolve(out); });
    proc.stderr.on('data', d => { out += d; });
    proc.on('exit', code => reject(new Error('serveur arrêté (' + code + ') : ' + out)));
  });
}

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbcrm-lot345-'));
  const port = 21000 + Math.floor(Math.random() * 1000);
  const env = { DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1' };
  let kv = null;
  if (REDIS) {
    kv = bridge.available() && !process.env.MOCK_UPSTASH ? await bridge.start() : await upstash.start();
    Object.assign(env, { KV_REST_API_URL: kv.url, KV_REST_API_TOKEN: kv.token, ADMIN_USERNAME: 'admin1', ADMIN_PASSWORD: PASSWORD });
    console.log(kv.real ? 'Stockage : Redis réel' : 'Stockage : faux Upstash');
  } else {
    await new Promise((res, rej) => run(['add-user', 'admin1', '--admin'], { ...env, RB_PASSWORD: PASSWORD }).on('exit', c => (c ? rej(new Error('add-user')) : res())));
    console.log('Stockage : fichiers');
  }
  const srv = run([], env);
  await waitFor(srv, 'RB Partners CRM V27');
  const B = `http://127.0.0.1:${port}`;
  const login = async u => { const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASSWORD }) }); return r.headers.get('set-cookie').split(';')[0]; };
  const api = async (cookie, method, url, body) => { const r = await fetch(B + url, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  const admin = await login('admin1');
  for (const [u, role] of [['collab1', 'collaborateur'], ['nolink', 'manager']]) await api(admin, 'POST', '/api/users', { username: u, password: PASSWORD, role });

  const browser = await chromium.launch();
  const open = async user => {
    const ctx = await browser.newContext(), page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(user + ': ' + e.message));
    await page.goto(B); await page.fill('#login_user', user); await page.fill('#login_password', PASSWORD); await page.click('#login25 button');
    await page.waitForFunction(() => typeof shared25 !== 'undefined' && shared25.ready);
    return { page, errs };
  };
  const settle = p => p.waitForFunction(() => !shared25.busy && !shared25.pending && !shared25.error, null, { timeout: 15000 }).catch(async () => { throw new Error('enregistrement bloqué : ' + await p.evaluate(() => shared25.error)); });
  const A = await open('admin1'), page = A.page;
  const y = new Date().getFullYear(), today = new Date().toISOString().slice(0, 10);
  // Jeu de données : équipe reliée aux comptes, dossiers attribués.
  await page.evaluate(([yy]) => {
    state = load(); Object.assign(state, { clients: [], prospects: [], invoices: [], time: [], onboarding: [], fiscal: [], closing: [], legal: [], team27: [], exc27: { items: [], year: yy } });
    state.team27 = [{ id: 'TM_A', name: 'Alice Test', initials: 'AT', role: 'Associé', cost: 100, capacity: 140, active: true, user: 'admin1' }, { id: 'TM_C', name: 'Chloé Test', initials: 'CT', role: 'Collaborateur', cost: 50, capacity: 140, active: true, user: 'collab1' }];
    const mk = (name, extra) => { const c = newClient26({ name, siren: '', legalForm: 'SAS', contact: '', email: '' }); Object.assign(c, { status: 'Actif', people27: { associe: 'Alice Test', manager: 'Alice Test', collab: 'Chloé Test' } }, extra); state.clients.push(c); return c; };
    const late = mk('TRAVAIL RETARD', { closing: '12-31' }); late.missions.annualAccounts = true; boards27().year = yy - 1;
    const r = row27('bilan', late.id, yy - 1, true); r.afaire = 'Oui'; r.etat = '2. En cours';
    const f = mk('FISC MENSUEL TEST', { vatRegime: 'Mensuelle', vatDeadline: 24 }); f.missions.tax = true;
    exc27().items.push({ id: 'EXW1', client: late.id, name: 'Transfert de siège', statut: 'En cours', deadline: '2020-01-15', realise: 'Alice Test', fees: 800, date: yy + '-01-10', time: 6 });
    exc27().items.push({ id: 'EXW2', client: f.id, name: 'Conseil sans tarif', statut: 'En cours', realise: 'Chloé Test', fees: '', date: yy + '-02-01' });
    init25(); save(); render();
  }, [y]);
  await settle(page);

  /* ---------- Lot 3 : navigation et Mon travail ---------- */
  const nav = await page.evaluate(() => [...document.querySelectorAll('.nav .navsec')].map(e => e.textContent));
  assert.deepEqual(nav, ['Pilotage', 'Clients', 'Production', 'Honoraires', 'Mon travail', 'Organisation', 'Paramètres'], 'menu dans l’ordre choisi');
  await page.evaluate(() => { workPrefs27().mode = 'auto'; workPrefs27().view = 'all'; workPrefs27().who = null; routePage('work'); });
  const work = await page.evaluate(() => { const l = tasks27().filter(x => mine27(x, me27())); return { me: me27(), n: l.length, src: [...new Set(l.map(x => x.src))].sort(), first: document.querySelector('.board27 tbody tr td:nth-child(2)')?.textContent, html: /échéance officielle/i.test(document.body.innerText) }; });
  assert.equal(work.me, 'Alice Test', 'compte relié explicitement à un collaborateur');
  assert.ok(work.n >= 3 && work.src.includes('bilan') && work.src.includes('exc') && work.src.includes('fiscal') && work.html, 'tâches déduites des tableaux ' + JSON.stringify(work));
  assert.ok(/Transfert de siège|Bilan/.test(work.first), 'tâche la plus en retard en tête');
  // Suivi d'une tâche : blocage et prochaine action, partagés.
  const key = await page.evaluate(() => tasks27().find(x => x.src === 'exc').key);
  await page.evaluate(k => taskPanel27(k), key);
  await page.fill('#tm_blocker', 'Attente du PV signé par le client'); await page.fill('#tm_next', 'Relancer le client'); await page.fill('#tm_reviewer', 'Chloé Test');
  await page.click('.modal button:has-text("Enregistrer")');
  await settle(page);
  const blk = await page.evaluate(k => { workPrefs27().view = 'blocked'; render(); return [tasks27().filter(x => taskBucket27(x).blocked).map(x => x.key).includes(k), document.body.innerText.includes('Attente du PV signé')]; }, key);
  assert.deepEqual(blk, [true, true], 'tâche bloquée visible dans la vue Bloqué');
  assert.equal((await api(admin, 'GET', '/api/state')).body.state.tasks27[key].blocker, 'Attente du PV signé par le client', 'suivi de tâche partagé');
  // 14. Préférences personnelles : non envoyées au serveur, sans effet sur les autres.
  await page.evaluate(() => { workPrefs27().view = 'late'; boards27().q = 'FILTRE-A'; save(); });
  await settle(page);
  const shared = (await api(admin, 'GET', '/api/state')).body.state;
  assert.ok(shared.work27?.view !== 'late' && shared.boards27?.q !== 'FILTRE-A', 'filtres personnels non partagés');
  // 13. Compte sans collaborateur associé : rien ne lui est attribué.
  const N = await open('nolink');
  const nl = await N.page.evaluate(() => { workPrefs27().mode = 'auto'; routePage('work'); return { me: me27(), mine: tasks27().filter(x => mine27(x, me27())).length, banner: document.body.innerText.includes('relié à aucun collaborateur'), q: boards27().q || '', view: workPrefs27().view }; });
  assert.deepEqual([nl.me, nl.banner, nl.q], ['', true, ''], 'compte sans collaborateur : aucune attribution, message explicite, filtres de l’autre utilisateur absents');
  const tsel = await N.page.evaluate(() => { routePage('time'); return document.getElementById('t27_who').value; });
  assert.equal(tsel, '', 'saisie des temps : aucun collaborateur présélectionné');
  // Fiche client : identité et contacts, documents.
  await page.evaluate(() => { const c = state.clients.find(x => x.name === 'FISC MENSUEL TEST'); openClient(c.id); clientTab27('ident'); window._identOk = /identité et contacts/i.test(document.body.innerText) && /missions et dates/i.test(document.body.innerText); setProfile27(c.id, 'language', 'Anglais'); setProfile27(c.id, 'opEmail', 'ops@example.com'); clientTab27('docs'); window._docsOk = /pièces demandées au client/i.test(document.body.innerText); });
  assert.ok(await page.evaluate(() => window._identOk && window._docsOk), 'onglets Identité et équipe, Documents affichés');
  await settle(page);
  const prof = (await api(admin, 'GET', '/api/state')).body.state.clients.find(c => c.name === 'FISC MENSUEL TEST').profile27;
  assert.deepEqual([prof.language, prof.opEmail], ['Anglais', 'ops@example.com'], 'fiche client : contacts et langue enregistrés');
  console.log('✓ Lot 3 : menu, Mon travail (tâches déduites, priorité, suivi partagé, vues), préférences personnelles, compte non relié, fiche client');

  /* ---------- Lot 4 : processus ---------- */
  const fisc = await page.evaluate(yy => {
    const c = state.clients.find(x => x.name === 'FISC MENSUEL TEST'), ob = obligations27(c, yy);
    const sunday = ob.find(o => new Date(o.dueRule + 'T12:00:00Z').getUTCDay() === 0);
    return { shifted: sunday ? [sunday.dueRule, sunday.due, new Date(sunday.due + 'T12:00:00Z').getUTCDay()] : null, target: ob[0].target === minusDays27(ob[0].due, 3), certified: ob[0].certified };
  }, y);
  assert.ok(!fisc.shifted || (fisc.shifted[2] >= 1 && fisc.shifted[2] <= 5 && fisc.shifted[1] > fisc.shifted[0]), 'échéance tombant un dimanche reportée au jour ouvré ' + JSON.stringify(fisc));
  assert.equal(await page.evaluate(() => businessDay27('2026-05-01')), '2026-05-04', '1er mai (férié) un vendredi → lundi 4 mai');
  assert.equal(await page.evaluate(() => businessDay27('2026-05-14')), '2026-05-15', 'Ascension 2026 (14 mai) → 15 mai');
  assert.ok(fisc.target && !fisc.certified, 'date cible interne distincte ; calendrier non certifié avant validation');
  await page.evaluate(() => routePage('fiscal'));
  assert.ok(await page.evaluate(() => document.body.innerText.includes('à valider')), 'calendrier signalé « à valider »');
  await page.evaluate(() => validateRules27());
  assert.ok(await page.evaluate(() => { routePage('fiscal'); const c = state.clients.find(x => x.name === 'FISC MENSUEL TEST'); return obligations27(c, new Date().getFullYear())[0].certified && document.body.innerText.includes('validé par admin1'); }), 'calendrier validé par un associé');
  const mis = await page.evaluate(yy => { const c = state.clients.find(x => x.name === 'FISC MENSUEL TEST'); setMissionDate27(c.id, 'tax', 'to', yy + '-06-30'); const n = obligations27(c, yy).filter(o => o.type === 'TVA').map(o => o.m); c.firstClose27 = yy + '-09-30'; return { max: Math.max(...n), close: iso(closeOf27(c, yy)), next: iso(closeOf27(c, yy + 1)) }; }, y);
  assert.deepEqual(mis, { max: 6, close: y + '-09-30', next: (y + 1) + '-12-31' }, 'fin de mission : plus d’échéances après ; premier exercice atypique');
  const onb = await page.evaluate(() => { const c = newClient26({ name: 'CREA PROFIL', siren: '', legalForm: 'SAS', contact: '', email: '' }); state.clients.push(c); c.profile27 = { kind: 'Création' }; boards27().q = ''; routePage('onboarding'); return [onbStep27(c, 1), onbPhase27(c), /acceptation du dossier/i.test(document.body.innerText)]; });
  assert.deepEqual(onb, ['NA', 'Acceptation du dossier', true], 'étapes adaptées au profil, phase du parcours affichée');
  // Sortie d'un client.
  const cid = await page.evaluate(() => { const c = state.clients.find(x => x.name === 'TRAVAIL RETARD'); openClient(c.id); clientTab27('process'); return c.id; });
  await page.fill('#ex_end', y + '-03-31'); await page.click('button:has-text("Démarrer la sortie")');
  await page.waitForSelector('text=Fin de mission le');
  assert.ok(await page.evaluate(() => document.querySelector('button:disabled')?.textContent.includes('Clôturer')), 'clôture impossible tant que la liste n’est pas faite');
  await page.evaluate(id => ['obligations', 'billing', 'transfer', 'access', 'archive'].forEach(k => exitStep27(id, k, true)), cid);
  await page.click('button:has-text("Clôturer le dossier")');
  await settle(page);
  const ex = (await api(admin, 'GET', '/api/state')).body.state.clients.find(c => c.id === cid);
  assert.ok(ex.status === 'Inactif' && ex.exit27.closedAt && ex.exit27.steps.archive.by === 'admin1', 'sortie tracée, dossier inactif');
  // Relance consolidée : brouillon, validation humaine, date de relance.
  const rel = await page.evaluate(() => { const c = state.clients.find(x => x.name === 'FISC MENSUEL TEST'); init25().requests.push({ id: 'REQ1', client: c.id, label: 'Relevés bancaires', period: '2026-09', due: '2026-10-01', received: false, cancelled: false }); reminderDraft27(c.id); const txt = document.getElementById('rel_text').value; reminderSent27(c.id); return { en: txt.startsWith('Hello'), has: txt.includes('Relevés bancaires'), relance: taskMeta27('Q|REQ1').relance }; });
  assert.ok(rel.en && rel.has && rel.relance > today, 'relance consolidée dans la langue du client, envoi confirmé, prochaine relance datée');
  console.log('✓ Lot 4 : jours ouvrés et fériés, date cible interne, calendrier à valider, dates de mission, premier exercice, profils d’onboarding, sortie client, relances');

  /* ---------- Lot 5 : identité, temps, rentabilité, charge ---------- */
  const team = await page.evaluate(() => { const n = (state.team27 || []).length; state.clients[0].people27.collab = 'Nouveau Venu'; render(); return { stored: (state.team27 || []).length === n, listed: team27().some(m => m.name === 'Nouveau Venu' && m.virtual) }; });
  assert.deepEqual(team, { stored: true, listed: true }, 'un affichage n’enregistre plus de collaborateur');
  const cost = await page.evaluate(() => { setMember27('TM_A', 'cost', 130); const m = team27().find(x => x.id === 'TM_A'); return [costAt27(m, '2020-01-01'), costAt27(m, new Date().toISOString().slice(0, 10))]; });
  assert.deepEqual(cost, [100, 130], 'coût horaire historisé');
  await page.evaluate(() => routePage('time'));
  await page.selectOption('#t27_who', ''); await page.fill('#t27_client', 'FISC MENSUEL TEST'); await page.fill('#t27_hours', '2');
  await page.click('button:has-text("Ajouter")');
  assert.equal(await page.evaluate(() => state.time.length), 0, 'temps refusé sans collaborateur choisi');
  await page.selectOption('#t27_who', 'Alice Test'); await page.click('button:has-text("Ajouter")');
  const tm = await page.evaluate(() => state.time[0]);
  assert.deepEqual([tm.user, tm.memberId, tm.hours], ['Alice Test', 'TM_A', 2], 'temps rattaché à un identifiant stable');
  const pr = await page.evaluate(() => { const rows = profitRows27(new Date().getFullYear(), 'budget'); const nt = rows.find(r => r.c.name === 'CREA PROFIL') || { noTime: true, margin: null }; state.profitMethod27 = 'budget'; routePage('profit'); return { nt: [nt.noTime, nt.margin], txt: document.body.innerText.includes('Méthode : budget contractuel'), billedDisabled: document.querySelector('option[value="billed"]').disabled }; });
  assert.deepEqual(pr, { nt: [true, null], txt: true, billedDisabled: true }, 'rentabilité : méthode affichée, dossier sans temps non présenté comme rentable');
  const cap = await page.evaluate(() => { const m = team27().find(x => x.id === 'TM_A'), ym = new Date().toISOString().slice(0, 7); const a = forecast27(m, ym).cap; setAbsence27('TM_A', ym, 2); routePage('capacity'); return [a, forecast27(team27().find(x => x.id === 'TM_A'), ym).cap, document.body.innerText.includes('Prévisionnel')]; });
  assert.deepEqual(cap, [140, 126, true], 'charge : absences déduites de la capacité');
  const q = await page.evaluate(() => { routePage('quality'); const t = document.body.innerText; routePage('feereview'); return [t.includes('hors forfait sans accord tarifaire'), document.body.innerText.includes('Revue des honoraires')]; });
  assert.deepEqual(q, [true, true], 'qualité du portefeuille et revue des honoraires');
  // Collaborateur : ne saisit que ses propres temps.
  const C = await open('collab1');
  const ct = await C.page.evaluate(() => { routePage('time'); const s = document.getElementById('t27_who'); return [s.disabled, s.value]; });
  assert.deepEqual(ct, [true, 'Chloé Test'], 'collaborateur : saisie limitée à ses propres temps');
  console.log('✓ Lot 5 : équipe sans écriture à l’affichage, coûts historisés, temps à identifiant stable, rentabilité explicite, charge prévisionnelle, qualité, revue des honoraires');

  assert.deepEqual([...A.errs, ...N.errs, ...C.errs], [], 'erreurs JavaScript');
  await browser.close(); srv.kill(); if (kv?.stop) kv.stop(); else kv?.server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('\nLots 3, 4 et 5 : tous les tests d’acceptation sont passés.');
})().catch(e => { console.error('\n✗ ÉCHEC :', e.message); process.exit(1); });
