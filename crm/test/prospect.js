/* Test de la fiche « Nouveau prospect » : saisie, recherche par nom (réponse simulée), préremplissage,
 * enregistrement, liste, suite des étapes, reprise sur la fiche client à la validation, relance dans Mon travail.
 *   node test/prospect.js */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }
const ROOT = path.join(__dirname, '..');
const PASSWORD = 'motdepasse-test-123';

function run(args, env) { return spawn(process.execPath, [path.join(ROOT, 'server.js'), ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); }
function waitFor(proc, text) {
  return new Promise((resolve, reject) => {
    let out = '';
    proc.stdout.on('data', d => { out += d; if (out.includes(text)) resolve(out); });
    proc.stderr.on('data', d => { out += d; });
    proc.on('exit', code => reject(new Error('serveur arrêté (' + code + ') : ' + out)));
  });
}
// Réponse de l'Annuaire des entreprises simulée : aucun appel réseau réel pendant le test.
const HIT = { siren: '732829320', nom_raison_sociale: 'BOULANGERIE DU TEST', nature_juridique: '5710', activite_principale: '10.71C', date_creation: '2019-04-02', etat_administratif: 'A',
  siege: { numero_voie: '12', type_voie: 'RUE', libelle_voie: 'DE LA PAIX', code_postal: '75002', libelle_commune: 'PARIS', adresse: '12 RUE DE LA PAIX 75002 PARIS' },
  dirigeants: [{ type_dirigeant: 'personne physique', nom: 'Martin', prenoms: 'Julie Anne', qualite: 'Président de SAS' }] };

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbcrm-prospect-'));
  const port = 22000 + Math.floor(Math.random() * 1000);
  const env = { DATA_DIR: dataDir, PORT: String(port), HOST: '127.0.0.1' };
  await new Promise((res, rej) => run(['add-user', 'admin1', '--admin'], { ...env, RB_PASSWORD: PASSWORD }).on('exit', c => (c ? rej(new Error('add-user')) : res())));
  const srv = run([], env);
  await waitFor(srv, 'RB Partners CRM V27');
  const B = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch(), page = await (await browser.newContext()).newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  let searched = '';
  await page.route('**/api/company?**', route => { const u = new URL(route.request().url()); searched = u.searchParams.get('q') || u.searchParams.get('siren'); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [HIT] }) }); });
  await page.goto(B); await page.fill('#login_user', 'admin1'); await page.fill('#login_password', PASSWORD); await page.click('#login25 button');
  await page.waitForFunction(() => typeof shared25 !== 'undefined' && shared25.ready);
  const settle = () => page.waitForFunction(() => !shared25.busy && !shared25.pending && !shared25.error, null, { timeout: 15000 });
  await page.evaluate(() => { Object.assign(state, { clients: [], prospects: [], team27: [{ id: 'TM_R', name: 'Ruben HAZIZA', initials: 'RH', role: 'Associé', cost: 100, capacity: 140, active: true, user: 'admin1' }, { id: 'TM_B', name: 'Benjamin HAZIZA', initials: 'BH', role: 'Associé', cost: 100, capacity: 140, active: true }] }); init25(); save(); nav('prospects'); });
  await settle();

  // Ouverture de la fiche et champs attendus.
  await page.click('button:has-text("Nouveau prospect")');
  const labels = await page.evaluate(() => [...document.querySelectorAll('.pf27 label')].map(l => l.textContent.replace('*', '').trim()));
  for (const l of ['Prénom', 'Nom', 'Téléphone', 'Adresse mail', 'Le dirigeant est une personne morale (société)', 'Civilité du dirigeant', 'Commentaire projet', 'Température', 'Date de relance', 'Note de relance / suivi', 'Structure envisagée', 'Nom de la structure', 'SIREN', 'Forme juridique', 'Titre du dirigeant', 'Capital social (€)', 'Clôture de l’exercice (JJ/MM)', 'Date de création', 'Secteur d’activité', 'Budget annuel HT (€)', 'N°', 'Rue', 'Code postal', 'Ville', 'Identique à l’adresse de la société', 'Assigné à'])
    assert.ok(labels.includes(l), 'champ présent : ' + l);
  assert.equal(await page.inputValue('#pf27_owner'), 'Ruben HAZIZA', 'assigné par défaut à la personne connectée');
  assert.equal(await page.isVisible('#pf27_homeBox'), false, 'adresse personnelle masquée si identique');

  // Température, budget obligatoire, recherche par nom puis préremplissage.
  await page.click('.pf27ddBtn'); await page.click('.pf27opt:has-text("Chaud")');
  assert.equal(await page.textContent('#pf27_tempLbl'), 'Chaud');
  await page.fill('#pf27_phone', '06 11 22 33 44'); await page.fill('#pf27_email', 'julie@test.fr');
  await page.fill('#pf27_relance', '2020-01-10'); await page.fill('#pf27_followup', 'Rappeler après son RDV banque');
  await page.click('.modalFooter button:has-text("Enregistrer")');
  assert.equal(await page.evaluate(() => state.prospects.length), 0, 'refus sans nom');
  await page.fill('#pf27_company', 'boulangerie test');
  await page.waitForSelector('.pf27hit');
  assert.equal(searched, 'boulangerie test', 'recherche par nom envoyée au serveur');
  await page.click('.pf27hit');
  const pre = await page.evaluate(() => Object.fromEntries(['company', 'siren', 'legalForm', 'created', 'addr_num', 'addr_street', 'addr_zip', 'addr_city', 'first', 'last', 'title', 'sector'].map(k => [k, document.getElementById('pf27_' + k).value])));
  assert.deepEqual(pre, { company: 'BOULANGERIE DU TEST', siren: '732829320', legalForm: 'SAS', created: '2019-04-02', addr_num: '12', addr_street: 'rue DE LA PAIX', addr_zip: '75002', addr_city: 'PARIS', first: 'Julie', last: 'MARTIN', title: 'Président de SAS', sector: '10.71C' }, 'préremplissage depuis l’annuaire');
  await page.click('.modalFooter button:has-text("Enregistrer")');
  assert.equal(await page.evaluate(() => state.prospects.length), 0, 'refus sans budget');
  await page.fill('#pf27_budget', '4800'); await page.fill('#pf27_capital', '10000'); await page.fill('#pf27_closing', '30/06');
  await page.selectOption('#pf27_civ', 'Mme'); await page.selectOption('#pf27_owner', 'Benjamin HAZIZA');
  await page.click('.pf27switch:has-text("Identique")'); await page.fill('#pf27_home_city', 'Vincennes');
  await page.click('.modalFooter button:has-text("Enregistrer")');
  await settle();
  const p = await page.evaluate(() => state.prospects[0]);
  assert.deepEqual([p.name, p.contact, p.phone, p.value, p.owner, p.temp27, p.relance27, p.stage, p.siren], ['BOULANGERIE DU TEST', 'Mme Julie MARTIN', '06 11 22 33 44', 4800, 'Benjamin HAZIZA', 'Chaud', '2020-01-10', 'Nouveau', '732829320'], 'prospect enregistré');

  // Liste : température, relance en retard ; suite des étapes inchangée.
  const list = await page.evaluate(() => { const h = [...document.querySelectorAll('thead th')].map(t => t.textContent), r = document.querySelector('tbody tr'); return { h, temp: r.children[1].textContent, rel: r.children[6].className }; });
  assert.ok(list.h.includes('Température') && list.h.includes('Relance') && list.h.includes('Budget HT'), 'colonnes ajoutées ' + list.h);
  assert.deepEqual([list.temp, list.rel], ['Chaud', 'bad'], 'température et relance dépassée visibles');
  await page.evaluate(id => openProspect(id), p.id);
  assert.equal(await page.inputValue('#p_owner'), 'Benjamin HAZIZA', 'responsable conservé dans la suite');
  assert.ok(await page.isVisible('.pf27head button:has-text("Modifier la fiche")'));
  await page.click('button:has-text("Planifier le RDV")');
  await settle();
  assert.deepEqual(await page.evaluate(id => [pfind(id).stage, pfind(id).owner], p.id), ['RDV à planifier', 'Benjamin HAZIZA'], 'étapes du pipeline inchangées');
  // Modification de la fiche.
  await page.click('.pf27head button:has-text("Modifier la fiche")');
  assert.equal(await page.inputValue('#pf27_budget'), '4800');
  await page.fill('#pf27_budget', '5400'); await page.click('.modalFooter button:has-text("Enregistrer")');
  await settle();
  assert.equal(await page.evaluate(id => pfind(id).value, p.id), 5400, 'fiche modifiée');

  // Mon travail : relance du prospect.
  const task = await page.evaluate(() => tasks27().find(x => x.src === 'prospect'));
  assert.ok(task && task.target === '2020-01-10' && task.owner === 'Benjamin HAZIZA', 'relance dans Mon travail');

  // Validation : reprise sur la fiche client.
  await page.evaluate(id => { closeModal(); validateProspect(id); }, p.id);
  await settle();
  const c = await page.evaluate(id => { const c = state.clients.find(x => x.prospectId === id); return { name: c.name, siren: c.siren, closing: c.closing, legalForm: c.legalForm, contact: c.contact, capital: c.identity26.capital, address: c.identity26.address, home: c.identity26.leaderHome, status: c.status, fees: c.annualFees }; }, p.id);
  assert.deepEqual(c, { name: 'BOULANGERIE DU TEST', siren: '732829320', closing: '06-30', legalForm: 'SAS', contact: { name: 'Mme Julie MARTIN', email: 'julie@test.fr', phone: '06 11 22 33 44' }, capital: '10000', address: '12 rue DE LA PAIX, 75002 PARIS', home: 'Vincennes', status: 'Onboarding', fees: 5400 }, 'fiche client reprise du prospect');
  assert.equal(await page.evaluate(() => tasks27().some(x => x.src === 'prospect')), false, 'plus de relance après validation');

  // Suppression : prospect validé (fiche client et données des autres onglets) et prospect simple.
  const ids = await page.evaluate(pid => {
    const c = state.clients.find(x => x.prospectId === pid), y = new Date().getFullYear();
    const keep = newClient26({ name: 'CLIENT À GARDER', siren: '552100554', legalForm: 'SAS', contact: '', email: '' }); keep.status = 'Actif'; state.clients.push(keep); regenerateAll(state, keep.id);
    for (const cid of [c.id, keep.id]) {
      row27('bilan', cid, y, true).etat = '2. En cours'; row27('ago', cid, y, true).statut = 'En cours';
      exc27().items.push({ id: 'EX_' + cid, client: cid, name: 'Travail ' + cid, statut: 'En cours', fees: 500 });
      state.time.unshift({ id: 'T_' + cid, date: '2026-01-05', user: 'Ruben HAZIZA', client: cid, mission: 'Bilan', hours: 2 });
      state.invoices.push({ id: 'I_' + cid, client: cid, label: 'Facture test', amount: 1000, date: '2026-01-10' });
      setTaskMeta27('B|' + cid + '|' + y, 'next', 'Relancer');
    }
    state.prospects.push({ id: 'P_TEST2', name: 'PROSPECT TEST', stage: 'Nouveau', owner: 'Ruben HAZIZA', value: 0, relance27: '2020-01-01' });
    persist25(); return { cid: c.id, keep: keep.id };
  }, p.id);
  await settle();
  const count = cid => page.evaluate(id => JSON.stringify(state).split(id).length - 1, cid);
  assert.ok(await count(ids.cid) > 8, 'données rattachées au client avant suppression');
  await page.evaluate(() => nav('prospects'));
  assert.equal(await page.locator('button.pf27del').count(), 2, 'bouton Supprimer sur chaque prospect');
  let dialog = '';
  page.once('dialog', d => { dialog = d.message(); d.dismiss(); });
  await page.click(`tr:has-text("BOULANGERIE DU TEST") button.pf27del`);
  assert.ok(/fiche client « BOULANGERIE DU TEST » sera aussi supprimée/.test(dialog), 'confirmation détaillée : ' + dialog);
  assert.ok(await page.evaluate(id => Boolean(pfind(id)), p.id), 'rien supprimé si on annule');
  page.once('dialog', d => d.accept());
  await page.click(`tr:has-text("BOULANGERIE DU TEST") button.pf27del`);
  await settle();
  page.once('dialog', d => d.accept());
  await page.evaluate(() => openProspect('P_TEST2'));
  await page.click('.modalFooter button:has-text("Supprimer le prospect")');
  await settle();
  const left = await page.evaluate(([pid, cid, keep]) => ({ prospects: state.prospects.length, client: state.clients.some(c => c.id === cid), refs: JSON.stringify(state).split(cid).length - 1, pref: JSON.stringify(state).split(pid).length - 1, keep: JSON.stringify(state).split(keep).length - 1, relance: tasks27().some(x => x.src === 'prospect') }), [p.id, ids.cid, ids.keep]);
  assert.deepEqual([left.prospects, left.client, left.refs, left.pref, left.relance], [0, false, 0, 0, false], 'prospects, client et données rattachées supprimés partout ' + JSON.stringify(left));
  assert.ok(left.keep > 8, 'les autres clients gardent toutes leurs données');
  const server = await page.evaluate(async () => (await (await fetch('/api/state')).json()).state);
  assert.ok(!JSON.stringify(server).includes(ids.cid) && JSON.stringify(server).includes(ids.keep) && server.prospects.length === 0, 'suppression enregistrée sur le serveur');
  for (const pg of ['onboarding', 'clients', 'fiscal', 'closing', 'legal', 'exceptional', 'billing', 'work', 'time']) await page.evaluate(x => routePage(x), pg);

  // Dossiers ajoutés directement en onboarding : visibles dans Prospects et proposés à la matrice création.
  const direct = await page.evaluate(() => {
    const a = newClient26({ name: 'ONBOARDING DIRECT', siren: '', legalForm: 'SAS', contact: 'Paul Test', email: 'p@test.fr' });
    const b = newClient26({ name: 'ONBOARDING AVEC SIREN', siren: '732829320', legalForm: 'SAS', contact: '', email: '' });
    state.clients.push(a, b); regenerateAll(state, a.id); regenerateAll(state, b.id); persist25(); nav('prospects');
    const rows = [...document.querySelectorAll('tr.pf27direct')].map(r => r.children[0].textContent);
    setProspectFilter('Nouveau'); const hidden = document.querySelectorAll('tr.pf27direct').length; setProspectFilter('Tous');
    return { a: a.id, b: b.id, rows, hidden };
  });
  await settle();
  assert.deepEqual([direct.rows.length, direct.hidden], [2, 0], 'dossiers d’onboarding visibles dans Prospects (Validé) ' + JSON.stringify(direct.rows));
  assert.ok(direct.rows[0].includes('Ajouté directement en onboarding'));
  await page.evaluate(() => routePage('creation'));
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.pf27cand .kpiLine b')].map(b => b.textContent)), ['ONBOARDING DIRECT'], 'seul le dossier sans SIREN est proposé à la matrice');
  await page.click('.pf27cand button:has-text("Ajouter à la matrice")');
  await settle();
  const cr = await page.evaluate(cid => { const it = creation27().items.find(x => x.client === cid); return it && [it.name, it.contactEmail, cfind(cid).creation27 === it.id, document.querySelectorAll('.pf27cand').length]; }, direct.a);
  assert.deepEqual(cr, ['ONBOARDING DIRECT', 'p@test.fr', true, 0], 'dossier ajouté à la matrice et relié au client');
  await page.evaluate(() => nav('prospects'));
  page.once('dialog', d => d.accept());
  await page.click('tr.pf27direct:has-text("ONBOARDING DIRECT") button.pf27del');
  await settle();
  const gone = await page.evaluate(([a, b]) => [Boolean(cfind(a)), creation27().items.some(x => x.client === a), JSON.stringify(state).includes(a), Boolean(cfind(b))], [direct.a, direct.b]);
  assert.deepEqual(gone, [false, false, false, true], 'dossier direct supprimé partout, y compris dans la matrice ; l’autre reste');

  // Onboarding : deux portes d'entrée et changement de statut de plusieurs étapes d'un coup.
  const ob = await page.evaluate(() => { const c = newClient26({ name: 'ONB MULTI', siren: '552100554', legalForm: 'SARL', contact: '', email: '' }); state.clients.push(c); regenerateAll(state, c.id); boards27().onbOpen = { [c.id]: true }; persist25(); routePage('onboarding'); return { id: c.id, btns: [...document.querySelectorAll('.titleRow .v25actions button')].map(b => b.textContent) }; });
  await settle();
  assert.ok(ob.btns.includes('+ Nouveau prospect') && ob.btns.includes('+ Nouvelle création') && !ob.btns.some(t => /Client par SIREN/.test(t)), 'entrées : prospect ou création ' + ob.btns);
  const boxes = page.locator('.onbSteps27 tbody .onbChk27 input');
  for (const n of [8, 9, 10]) await boxes.nth(n).check();
  assert.equal(await page.textContent('.onbBulk27 b'), '3 étape(s) sélectionnée(s)');
  await page.selectOption('.onbBulk27 select', 'Fait'); await page.click('.onbBulk27 button:has-text("Appliquer")');
  await settle();
  const after = await page.evaluate(cid => { const c = cfind(cid); return [ONB_ORDER27.map(i => onbStep27(c, i)).filter(s => s === 'Fait').length, document.querySelectorAll('.onbBulk27').length]; }, ob.id);
  assert.deepEqual(after, [3, 0], 'trois étapes passées en Fait d’un coup, sélection remise à zéro');
  await page.locator('.onbSteps27 thead .onbChk27 input').check();
  assert.equal(await page.textContent('.onbBulk27 b'), '16 étape(s) sélectionnée(s)', 'tout sélectionner');
  await page.click('.onbBulk27 button:has-text("Annuler")');
  assert.equal(await page.locator('.onbBulk27').count(), 0);

  // Facturation : « Lancer facturation = Oui » suffit ; missions réalisées non facturées suivies quel que soit le choix.
  const ctl = await page.evaluate(() => {
    const y = 2025, mk = n => { const c = newClient26({ name: n, siren: '', legalForm: 'SAS', contact: '', email: '' }); c.status = 'Actif'; state.clients.push(c); return c; };
    const a = mk('CTL BILAN FINI'), b = mk('CTL AGO OUI EN COURS'), d = mk('CTL DECIDE NON');
    Object.assign(row27('bilan', a.id, y, true), { afaire: 'Oui', etat: '9. Terminé' }); row27('bilan', a.id, y).lancerFact = '';
    Object.assign(row27('ago', b.id, y, true), { juridique: 'Oui', statut: '1. A faire', lancerFact: 'Oui' });
    Object.assign(row27('bilan', d.id, y, true), { afaire: 'Oui', etat: '9. Terminé', lancerFact: 'Non' });
    exc27().items.push({ id: 'EX_CTL', client: d.id, name: 'Conseil ponctuel', statut: 'Terminé', fees: 300, date: y + '-03-01' });
    persist25(); billingKey27().ctlF = 'Tous'; routePage('billing');
    const rows = [...document.querySelectorAll('.billCtl27 tbody tr')].filter(r => r.children[0].textContent.startsWith('CTL')).map(r => [r.children[0].textContent, r.children[1].textContent, r.querySelector('select').value, r.children[5].textContent]);
    const panels = [...document.querySelectorAll('.panelHead h3')].map(h => h.textContent.split(' ·')[0]);
    return { rows, toBill: toBill27().filter(x => x.c.name.startsWith('CTL')).map(x => x.label), panels };
  });
  await settle();
  assert.deepEqual(ctl.toBill, ['Juridique annuel 2025'], 'AGO avec « Lancer facturation = Oui » à facturer, même non terminé');
  assert.deepEqual(ctl.rows, [['CTL BILAN FINI', 'Bilan 2025', '', 'Décision à prendre'], ['CTL DECIDE NON', 'Conseil ponctuel', '', 'Décision à prendre'], ['CTL DECIDE NON', 'Bilan 2025', 'Non', 'Non facturable']], 'missions réalisées non facturées, quel que soit le choix ' + JSON.stringify(ctl.rows));
  assert.ok(ctl.panels.indexOf('Missions réalisées') < ctl.panels.indexOf('Prestations à facturer') && ctl.panels.indexOf('Prestations à facturer') < ctl.panels.indexOf('Factures émises'), 'ordre des tableaux ' + ctl.panels);
  await page.selectOption('.billCtl27 tr:has-text("CTL BILAN FINI") select', 'Oui');
  await settle();
  const ctl2 = await page.evaluate(() => ({ row: [...document.querySelectorAll('.billCtl27 tbody tr')].find(r => r.children[0].textContent === 'CTL BILAN FINI')?.children[5].textContent, toBill: toBill27().filter(x => x.c.name.startsWith('CTL')).map(x => x.label).sort() }));
  assert.deepEqual(ctl2, { row: 'À facturer', toBill: ['Bilan 2025', 'Juridique annuel 2025'] }, '« Oui » : la mission passe dans Prestations à facturer et reste suivie jusqu’à la facture ' + JSON.stringify(ctl2));

  // Mon travail : planning (groupes, automatisations avec les autres onglets, import Monday).
  await page.evaluate(() => { workPrefs27().mode = ''; workPrefs27().pwho = ''; workPrefs27().pq = ''; routePage('work'); });
  const groups = await page.evaluate(() => [...document.querySelectorAll('.pl27gh b')].map(b => b.textContent));
  assert.deepEqual(groups, ['I. Onboarding', 'II. Travaux annuels (Bilan + AGO)', 'III. Travaux courants (à échéance répétitive)', 'IV. Travaux exceptionnels', 'Fait'], 'groupes du planning');
  // Travail exceptionnel : créé et tenu à jour, facturation.
  await page.click('button:has-text("+ Nouvelle tâche travaux exceptionnels")');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.pl27form .pl27h')].map(h => h.textContent)), ['1. Quoi ?', '2. Pour qui ?', '3. Quand ?', '4. Facturation', '5. Suivi'], 'formulaire en cinq questions');
  await page.click('.pl27form .modalFooter button:has-text("Ajouter la tâche")');
  assert.equal(await page.evaluate(() => myTasks27().items.length), 0, 'tâche vide refusée');
  await page.fill('#plf_title', 'Changement de gérant'); await page.fill('#plf_client', 'CLIENT À GARDER'); await page.click('.pl27form .modalFooter button:has-text("Ajouter la tâche")');
  await settle();
  let t = await page.evaluate(() => { const t = myTasks27().items.find(x => x.title === 'Changement de gérant'); return { id: t.id, exc: exc27().items.find(w => w.id === t.exc)?.name, manager: t.manager }; });
  assert.equal(t.exc, 'Changement de gérant', 'tâche exceptionnelle → travail exceptionnel créé');
  await page.click('.pl27row:has-text("Changement de gérant")');
  await page.click('.pl27seg label:has-text("Oui")'); await page.fill('#plf_fees', '200'); await page.fill('#plf_time', '1.5'); await page.selectOption('#plf_status', 'Fait');
  await page.click('.pl27form .modalFooter button:has-text("Enregistrer")');
  await settle();
  const ex = await page.evaluate(id => { const t = plTask27(id), w = exc27().items.find(x => x.id === t.exc), tm = state.time.find(x => x.id === t.timeId); return { w: [w.fees, w.statut, w.lancerFact], toBill: toBill27().some(x => x.key === 'X|' + w.id && x.amount === 200), time: tm && [tm.hours, tm.mission, tm.exc === w.id], done: document.querySelectorAll('[data-k="pl_exc"] .pl27row').length }; }, t.id);
  assert.deepEqual(ex, { w: [200, 'Terminé', 'Oui'], toBill: true, time: [1.5, 'Travail exceptionnel', true], done: 0 }, 'honoraires, statut, facturation et temps reliés ' + JSON.stringify(ex));
  // Travail annuel : relié au Bilan de l'exercice.
  await page.click('button:has-text("+ Nouvelle tâche travaux annuels")');
  assert.ok(await page.isVisible('#plf_mission'), 'mission et exercice proposés pour un travail annuel');
  await page.fill('#plf_title', 'Bilan 2025 à finaliser'); await page.fill('#plf_client', 'CLIENT À GARDER'); await page.fill('#plf_year', '2025'); await page.click('.pl27form .modalFooter button:has-text("Ajouter la tâche")');
  await settle();
  const an = await page.evaluate(() => { const t = myTasks27().items.find(x => x.title === 'Bilan 2025 à finaliser'), cid = t.client; plSet27(t.id, 'bill', 'Oui'); plSet27(t.id, 'status', 'Fait'); const r = row27('bilan', cid, 2025); return [t.mission, t.year, r.lancerFact, r.etat, toBill27().some(x => x.key === 'B|' + cid + '|2025')]; });
  assert.deepEqual(an, ['Bilan', 2025, 'Oui', '9. Bilan télédéclaré', true], 'tâche annuelle : Bilan terminé et à facturer ' + JSON.stringify(an));
  // Récurrence : prochaine occurrence créée.
  await page.click('button:has-text("+ Nouvelle tâche travaux courants")');
  assert.equal(await page.inputValue('#plf_recurrence'), 'Mensuelle', 'travail courant : récurrence mensuelle par défaut');
  await page.fill('#plf_title', 'Saisie mensuelle'); await page.fill('#plf_end', '2026-01-31'); await page.click('.pl27form .modalFooter button:has-text("Ajouter la tâche")');
  await settle();
  const rec = await page.evaluate(() => { const t = myTasks27().items.find(x => x.title === 'Saisie mensuelle'); plSet27(t.id, 'status', 'Fait'); return myTasks27().items.filter(x => x.title === 'Saisie mensuelle').map(x => [x.status, x.end, x.recurrence]); });
  assert.deepEqual(rec, [['Fait', '2026-01-31', 'Mensuelle'], ['A faire', '2026-02-28', 'Mensuelle']], 'tâche récurrente recréée ' + JSON.stringify(rec));
  // Import d'un planning Monday : groupes, statuts, clients, doublons.
  page.once('dialog', d => d.accept());
  await page.setInputFiles('input[type=file][accept=".xlsx"]', path.join(ROOT, 'test', 'fixtures', 'planning_test.xlsx'));
  await page.waitForFunction(() => myTasks27().items.some(x => x.imported));
  await settle();
  const imp = await page.evaluate(() => myTasks27().items.filter(x => x.imported).map(x => [x.title, x.section, x.status, cfind(x.client)?.name || x.clientLabel || '', x.bill, x.fees]));
  assert.deepEqual(imp, [['CLIENT À GARDER - Finaliser l’onboarding', 'onb', 'A faire', 'CLIENT À GARDER', 'À définir', ''], ['CLIENT À GARDER - AGO 2025', 'annual', 'En cours', 'CLIENT À GARDER', 'Oui', 453], ['Dossier inconnu - Conseil', 'exc', 'A faire', 'SOCIETE INCONNUE', 'À définir', 200], ['Ancienne tâche', 'exc', 'Fait', '', 'Non', '']], 'import Monday ' + JSON.stringify(imp));
  assert.equal(await page.evaluate(() => row27('ago', state.clients.find(c => c.name === 'CLIENT À GARDER').id, 2025).lancerFact), 'Oui', 'import : AGO à facturer reporté dans le tableau');
  let again = '';
  page.once('dialog', d => { again = d.message(); d.accept(); });
  await page.setInputFiles('input[type=file][accept=".xlsx"]', path.join(ROOT, 'test', 'fixtures', 'planning_test.xlsx'));
  await page.waitForTimeout(500);
  assert.ok(/déjà dans le planning/.test(again), 'réimport : pas de doublon');
  const srvT = await page.evaluate(async () => (await (await fetch('/api/state')).json()).state.myTasks27?.items?.length);
  assert.ok(srvT >= 8, 'tâches enregistrées sur le serveur');
  await page.evaluate(() => { workPrefs27().mode = 'auto'; render(); });
  assert.ok(await page.isVisible('button:has-text("Ma liste de tâches")'), 'échéances automatiques toujours accessibles');

  assert.deepEqual(errs, [], 'erreurs JavaScript');
  await browser.close(); srv.kill(); fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('✓ Fiche prospect : saisie, recherche par nom, préremplissage, liste, étapes, modification, relance, reprise sur le client, suppression en cascade, dossiers ajoutés directement en onboarding, statut de plusieurs étapes d’un coup, contrôle facturation, Mon travail (planning relié aux autres onglets, import Monday)');
})().catch(e => { console.error('\n✗ ÉCHEC :', e.message); process.exit(1); });
