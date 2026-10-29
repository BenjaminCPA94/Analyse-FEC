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

  /* ================= Séquences, boîte d'envoi, pipeline ================= */
  const iso = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const SEQ_RECORDS = [
    { ...rec('5', 'NOVA CONSEIL', 'Président : MARTIN, Paul'), registre: ['555555551'], listeetablissements: JSON.stringify({ etablissement: { activite: 'Conseil en systèmes et logiciels informatiques' } }) },
    { ...rec('6', 'SANS DIRIGEANT SAS', ''), registre: ['555555552'] },
    { ...rec('7', 'STOP SARL', 'Gérant : NOIR, Jean'), registre: ['555555553'] },
  ];
  const p2 = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  p2.on('pageerror', e => errors.push(e.message)); p2.on('dialog', d => d.accept());
  await p2.route('**/bodacc-datadila.opendatasoft.com/**', rt => rt.fulfill({ json: SEQ_RECORDS }));
  await p2.goto(base + '/');
  // Anciens statuts et anciennes relances, plus des e-mails déjà trouvés.
  await p2.evaluate(old => localStorage.setItem('leadsEC:follow', JSON.stringify(old)), {
    M1: { status: 'Rendez-vous', relance: '2026-01-05', lead: { id: 'M1', nom: 'ANCIEN RDV' } },
    M2: { status: 'Gagné', lead: { id: 'M2', nom: 'ANCIEN GAGNE' } },
    M3: { status: 'Pas intéressé', relance: '2026-01-05', lead: { id: 'M3', nom: 'ANCIEN REFUS' } },
    M4: { status: 'Contacté', email: 'anne.leroy@migre.fr', relance: iso(-3), contacts: [{ canal: 'E-mail', date: iso(-20) }, { canal: 'Relance', date: iso(-6) }],
      lead: { id: 'M4', nom: 'MIGRE SARL', ville: 'Paris', date: iso(-25), signal: 'Création de société', famille: 'immatriculation', isPM: true, dirigeants: 'Gérant : Leroy, Anne', activite: 'Boulangerie' } },
    '555555551': { email: 'paul.martin@nova-conseil.fr', lead: { id: '555555551', nom: 'NOVA CONSEIL' } },
    '555555552': { email: 'direction@sans-dirigeant.fr', lead: { id: '555555552', nom: 'SANS DIRIGEANT SAS' } },
    '555555553': { status: 'Ne plus contacter', email: 'jean.noir@stop.fr', lead: { id: '555555553', nom: 'STOP SARL' } },
  });
  await p2.reload();

  // Migration des anciens statuts.
  const mig = await p2.evaluate(() => JSON.parse(localStorage.getItem('leadsEC:follow')));
  assert.strictEqual(mig.M1.status, 'RDV pris'); assert.strictEqual(mig.M1.relance, '', 'relance annulée pour un RDV');
  assert.strictEqual(mig.M2.status, 'Lettre de mission signée');
  assert.strictEqual(mig.M3.status, 'Perdu'); assert.strictEqual(mig.M3.relance, '');
  assert.strictEqual(mig.M4.status, 'Relance 1', 'relance déjà envoyée reprise'); assert.deepStrictEqual(mig.M4.seq, { e1: iso(-20), r1: iso(-6) });

  // Bandeau « À faire aujourd'hui » : une relance en retard.
  assert.ok(await p2.isVisible('#todoBanner'));
  assert.match(await p2.textContent('#todoText'), /1 relance due, dont 1 en retard/);

  // Réglages prospection.
  await p2.evaluate(() => openSettings()); await p2.click('#msgBox summary');
  await p2.fill('#cab_cabinet', 'RB Partners'); await p2.fill('#cab_signataire', 'Benjamin Haziza'); await p2.fill('#cab_tel', '01 02 03 04 05');
  await p2.fill('#cab_adresse', '10 rue de la Paix, 75002 Paris'); await p2.fill('#cab_rdv', 'https://rdv.rb-partners.fr'); await p2.press('#cab_rdv', 'Tab');
  await p2.evaluate(() => openSettings(false));

  // Modèles par défaut : les 15 e-mails, remplis, passent les contrôles et respectent les longueurs.
  const tplCheck = await p2.evaluate(() => {
    const out = [];
    const cases = [['creation', { signal: 'Création de société', famille: 'immatriculation' }], ['transfert', { signal: 'Transfert de siège', sig: 'transfert', famille: 'modification' }],
      ['dirigeant', { signal: 'Nouveau dirigeant', sig: 'dirigeant', famille: 'modification' }], ['capital', { signal: 'Modification du capital', sig: 'capital', famille: 'modification' }], ['autre', { signal: 'Rachat de fonds de commerce', sig: 'vente', famille: 'vente' }]];
    for (const [type, ev] of cases) for (const step of ['e1', 'r1', 'r2']) {
      const l = { id: 'T' + type, nom: 'ATELIER DES QUAIS', ville: 'Boulogne-Billancourt', date: '2026-10-20', activite: 'Conseil en organisation et gestion des entreprises', dirigeants: 'Président : Martin, Paul', isPM: true, ...ev };
      const d = makeDraft(l, {}, step); d.to = 'paul.martin@atelier.fr';
      const c = checkDraft(d);
      out.push({ type: seqType(l), want: type, step, words: c.words, errors: c.errors.filter(e => !/^Envoyez d'abord/.test(e)), links: (d.body.match(/https?:\/\//g) || []).length });
    }
    return out;
  });
  for (const t of tplCheck) {
    assert.strictEqual(t.type, t.want, 'type d\'événement');
    assert.deepStrictEqual(t.errors, [], `${t.want} ${t.step} : ${t.errors.join(' / ')}`);
    assert.ok(t.words <= ({ e1: 75, r1: 75, r2: 40 })[t.step], `${t.want} ${t.step} : ${t.words} mots`);
    assert.ok(t.links <= 1);
  }

  // Préparation en lot sur deux leads sélectionnés.
  await p2.click('#run'); await p2.waitForSelector('tbody.lead');
  await p2.check('input.sel[data-id="555555551"]'); await p2.check('input.sel[data-id="555555552"]');
  assert.strictEqual(await p2.textContent('#prepSel'), 'Préparer la séquence (2)');
  await p2.click('#prepSel');
  await p2.waitForSelector('article.draft');
  assert.strictEqual(await p2.evaluate(() => drafts.filter(d => d.status === 'draft').length), 6, '3 e-mails par lead');
  assert.strictEqual(await p2.textContent('#outboxCount'), '6');
  const nova = 'article.draft:has-text("NOVA CONSEIL"):has-text("E-mail 1")', sans = 'article.draft:has-text("SANS DIRIGEANT SAS"):has-text("E-mail 1")';
  const novaBody = await p2.inputValue(nova + ' textarea');
  assert.match(novaBody, /^Bonjour Paul Martin,\n\nJ'ai pris connaissance de l'immatriculation de NOVA CONSEIL à Paris, publiée le \d{1,2} \w+ 2026\. Félicitations pour le lancement de votre activité \(conseil en systèmes et logiciels informatiques\)\./);
  assert.match(novaBody, /Prendre rendez-vous : https:\/\/rdv\.rb-partners\.fr/);
  assert.match(novaBody, /\n-- \nBenjamin Haziza\nExpert-comptable – RB Partners\n01 02 03 04 05\n10 rue de la Paix, 75002 Paris\n\nPour ne plus recevoir de message de notre part, répondez simplement « STOP » à cet e-mail\.$/);
  assert.match(await p2.textContent(nova + ' .dchecks'), /Contrôles validés/);
  assert.ok(await p2.isEnabled(nova + ' .d-send'));

  // Blocage : variable non remplie (dirigeant inconnu), puis correction à la main.
  assert.match(await p2.textContent(sans + ' .dchecks'), /Variable non remplie : \{prenom\}, \{nom\}/);
  assert.match(await p2.textContent(sans + ' .dchecks'), /Adresse générique/);
  assert.ok(await p2.isDisabled(sans + ' .d-send')); assert.ok(await p2.isDisabled(sans + ' .d-sent'));
  await p2.fill(sans + ' textarea', (await p2.inputValue(sans + ' textarea')).replace('Bonjour {prenom} {nom},', 'Madame, Monsieur,'));
  assert.ok(await p2.isEnabled(sans + ' .d-send'), 'débloqué après correction');
  // Blocage : deux liens ; signature retirée.
  const saved1 = await p2.inputValue(nova + ' textarea');
  await p2.fill(nova + ' textarea', saved1.replace('Bien cordialement,', 'Voir aussi https://exemple.fr\n\nBien cordialement,'));
  assert.match(await p2.textContent(nova + ' .dchecks'), /2 liens : un seul lien est autorisé/);
  await p2.fill(nova + ' textarea', saved1.split('\n-- \n')[0]);
  assert.match(await p2.textContent(nova + ' .dchecks'), /Signature manquante[\s\S]*Ligne de désinscription manquante/);
  await p2.fill(nova + ' textarea', saved1);
  assert.ok(await p2.isEnabled(nova + ' .d-send'));

  // Blocage : lead « Ne plus contacter ».
  const stop = await p2.evaluate(() => { const l = leads.find(x => x.id === '555555553'); const d = makeDraft(l, follow[l.id], 'e1'); return checkDraft(d).errors; });
  assert.ok(stop.some(e => /« Ne plus contacter » : envoi bloqué/.test(e)));
  assert.deepStrictEqual(await p2.evaluate(() => prepareSequence(['555555553'])), { made: 0, skipped: ['STOP SARL (Ne plus contacter)'] });

  // « Envoyer » ouvre la messagerie avec destinataire, objet et corps.
  const href = await p2.evaluate(() => mailtoHref(drafts.find(x => x.lead === 'NOVA CONSEIL' && x.step === 'e1')));
  const mu = new URL(href);
  assert.strictEqual(mu.protocol + mu.pathname, 'mailto:paul.martin@nova-conseil.fr');
  assert.strictEqual(mu.searchParams.get('subject'), 'NOVA CONSEIL : félicitations pour votre immatriculation');
  assert.match(mu.searchParams.get('body'), /^Bonjour Paul Martin,[\s\S]*« STOP » à cet e-mail\.$/);

  // Confirmation d'envoi → étape « Contacté », relance 1 à J+4, relances programmées.
  await p2.click(nova + ' .d-sent');
  let fn = await p2.evaluate(() => JSON.parse(localStorage.getItem('leadsEC:follow'))['555555551']);
  assert.strictEqual(fn.status, 'Contacté'); assert.strictEqual(fn.seq.e1, iso(0)); assert.strictEqual(fn.relance, iso(4), 'relance 1 à J+4');
  await p2.selectOption('#obFilter', 'scheduled');
  assert.match(await p2.textContent('#results'), /NOVA CONSEIL[\s\S]*Relance 1[\s\S]*prévue le/);
  assert.match(await p2.textContent('article.draft:has-text("NOVA CONSEIL"):has-text("Relance 1") .dchecks'), /envoi anticipé/);
  await p2.selectOption('#obFilter', 'sent');
  assert.match(await p2.textContent('#results'), /NOVA CONSEIL[\s\S]*envoyé le/);

  // Délai réglable : relance 1 à J+3 pour le lead suivant.
  await p2.evaluate(() => openSettings()); await p2.fill('#seq_d1', '3'); await p2.press('#seq_d1', 'Tab'); await p2.evaluate(() => openSettings(false));
  await p2.selectOption('#obFilter', 'ready'); await p2.click(sans + ' .d-sent');
  assert.strictEqual(await p2.evaluate(() => JSON.parse(localStorage.getItem('leadsEC:follow'))['555555552'].relance), iso(3));

  // « RDV pris » annule les relances prévues.
  await p2.click('[data-tab=followed]');
  await p2.selectOption('select.st[data-id="555555551"]', 'RDV pris');
  fn = await p2.evaluate(() => JSON.parse(localStorage.getItem('leadsEC:follow'))['555555551']);
  assert.strictEqual(fn.relance, '');
  assert.strictEqual(await p2.evaluate(() => drafts.filter(d => d.leadId === '555555551' && d.status === 'draft').length), 0, 'brouillons annulés');

  // Filtre par étape.
  await p2.selectOption('#statusFilter', 'st:Lettre de mission signée');
  assert.deepStrictEqual(await p2.$$eval('tbody.lead', t => t.map(x => x.dataset.id)), ['M2']);
  await p2.selectOption('#statusFilter', '');

  // Bandeau → boîte d'envoi : la relance 2 en retard est préparée.
  await p2.click('#todoOpen');
  await p2.waitForSelector('article.draft:has-text("MIGRE SARL")');
  assert.match(await p2.textContent('article.draft:has-text("MIGRE SARL")'), /Relance 2[\s\S]*en retard/);
  assert.strictEqual(await p2.inputValue('#obFilter'), 'due');
  await p2.click('article.draft:has-text("MIGRE SARL") .d-sent');
  const m4 = await p2.evaluate(() => JSON.parse(localStorage.getItem('leadsEC:follow')).M4);
  assert.strictEqual(m4.status, 'Relance 2'); assert.strictEqual(m4.relance, '');
  assert.ok(!(await p2.isVisible('#todoBanner')), 'plus rien à faire');

  // Export CSV : étape et dates d'envoi.
  await p2.click('[data-tab=followed]');
  const [dl2] = await Promise.all([p2.waitForEvent('download'), p2.click('#csv')]);
  const csv2 = require('node:fs').readFileSync(await dl2.path(), 'utf8');
  assert.match(csv2.split('\r\n')[0], /;Étape;E-mail 1 envoyé;Relance 1 envoyée;Relance 2 envoyée;Prochaine relance;/);
  const novaLine = csv2.split('\r\n').find(x => x.includes('NOVA CONSEIL'));
  assert.match(novaLine, new RegExp(';RDV pris;' + iso(0).split('-').reverse().join('/') + ';;;;'));

  // Sauvegarde complète puis import dans un navigateur vierge.
  await p2.evaluate(() => openSettings()); await p2.click('#backupBox summary');
  const [bk] = await Promise.all([p2.waitForEvent('download'), p2.click('#backup')]);
  const bkFile = await bk.path(), bkData = JSON.parse(require('node:fs').readFileSync(bkFile, 'utf8'));
  assert.ok(bkData.drafts.length === 5 && bkData.seqCfg.d1 === 3 && bkData.cabinet.cabinet === 'RB Partners');
  const p3 = await (await browser.newContext()).newPage(); p3.on('pageerror', e => errors.push(e.message));
  await p3.goto(base + '/'); await p3.setInputFiles('#restoreFile', bkFile);
  await p3.waitForFunction(() => /restaurée/.test(document.getElementById('status').textContent));
  assert.deepStrictEqual(await p3.evaluate(() => [follow['555555551'].status, follow.M4.status, drafts.length, seqCfg.d1, cabinet.signataire]), ['RDV pris', 'Relance 2', bkData.drafts.length, 3, 'Benjamin Haziza']);

  // Rétablir les modèles par défaut.
  await p2.evaluate(() => { $('msgBox').open = true; });
  await p2.fill('#seq_e1_s', 'Objet modifié'); await p2.press('#seq_e1_s', 'Tab');
  assert.strictEqual(await p2.evaluate(() => JSON.parse(localStorage.getItem('leadsEC:seqTemplates')).creation.e1.subject), 'Objet modifié');
  await p2.click('#tplReset');
  assert.strictEqual(await p2.inputValue('#seq_e1_s'), '{societe} : félicitations pour votre immatriculation');

  assert.deepStrictEqual(errors, []);
  await browser.close(); server.close();
  console.log('OK : relais, cascade de fournisseurs, site web, suivi, export, séquences, boîte d\'envoi, pipeline et migration');
})().catch(e => { console.error(e); process.exit(1); });
