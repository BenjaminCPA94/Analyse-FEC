'use strict';
/**
 * Tests de src/cloud/supabase.client.js et src/cloud/cloud.repository.js.
 * Aucun réseau, aucun paquet npm réel requis : le client Supabase est
 * entièrement simulé (fake) pour vérifier la LOGIQUE de ces modules
 * (construction des requêtes, gestion des erreurs, formes des retours) —
 * pas une preuve que l'intégration avec un vrai projet Supabase
 * fonctionnera (impossible à vérifier sans accès réseau, cf.
 * SAAS_ARCHITECTURE.md §9). Ces tests garantissent en revanche que le
 * contrat interne de ces modules est correct et non régressif.
 */
const { createSupabaseClient } = require('../src/cloud/supabase.client.js');
const { createCloudRepository } = require('../src/cloud/cloud.repository.js');

/** Fake client Supabase-like minimal : suffit pour valider la logique de cloud.repository.js. */
function makeFakeSupabaseClient(initialRows) {
  const tables = { records: [...initialRows] };
  function from(table) {
    let filters = [];
    let orderBy = null;
    let single = false;
    let maybeSingleFlag = false;
    let op = null;
    let payload = null;
    const builder = {
      select() { return builder; },
      eq(col, val) { filters.push([col, val]); return builder; },
      order(col, opts) { orderBy = { col, asc: !!(opts && opts.ascending) }; return builder; },
      maybeSingle() { maybeSingleFlag = true; return exec(); },
      single() { single = true; return exec(); },
      upsert(p) { op = 'upsert'; payload = p; return builder; },
      delete() { op = 'delete'; return builder; },
      then(resolve) { return exec().then(resolve); }, // pour permettre `await builder` directement si besoin
    };
    async function exec() {
      let rows = tables[table] || [];
      if (op === 'upsert') {
        const idx = rows.findIndex((r) => r.id === payload.id);
        const record = { ...payload, updated_at: payload.updated_at || Date.now() };
        if (idx >= 0) rows[idx] = record; else rows.push(record);
        tables[table] = rows;
        return single || maybeSingleFlag ? { data: record, error: null } : { data: [record], error: null };
      }
      if (op === 'delete') {
        const before = rows.length;
        rows = rows.filter((r) => !filters.every(([c, v]) => r[c] === v));
        tables[table] = rows;
        return { data: null, error: null, count: before - rows.length };
      }
      let filtered = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
      if (orderBy) filtered = [...filtered].sort((a, b) => orderBy.asc ? a[orderBy.col] - b[orderBy.col] : b[orderBy.col] - a[orderBy.col]);
      if (maybeSingleFlag) return { data: filtered[0] || null, error: null };
      if (single) return { data: filtered[0] || null, error: filtered[0] ? null : { message: 'not found' } };
      return { data: filtered, error: null };
    }
    return builder;
  }
  return { from, __tables: tables };
}

async function run() {
  const results = [];
  const push = (name, pass, detail) => results.push({ name, pass, detail });

  // ── supabase.client.js ──────────────────────────────────────────────
  {
    const nonConfigure = createSupabaseClient({});
    push('createSupabaseClient() sans config -> isConfigured() = false', nonConfigure.isConfigured() === false, null);
    let threw = false;
    try { nonConfigure.getClient(); } catch (e) { threw = /non configuré/.test(e.message); }
    push('getClient() sans config lève une erreur explicite (jamais un faux client silencieux)', threw, null);

    const fakeFactory = (url, key) => ({ url, key, marker: 'fake-client' });
    const configured = createSupabaseClient({ url: 'https://x.supabase.co', anonKey: 'anon-key', clientFactory: fakeFactory });
    push('createSupabaseClient() avec config complète -> isConfigured() = true', configured.isConfigured() === true, null);
    const client1 = configured.getClient();
    const client2 = configured.getClient();
    push('getClient() renvoie le même client mis en cache (pas de recréation à chaque appel)', client1 === client2, null);
    push('getClient() transmet bien url/anonKey au clientFactory injecté', client1.url === 'https://x.supabase.co' && client1.key === 'anon-key', client1);
  }

  // ── cloud.repository.js — contrat get/list/save/remove ──────────────
  {
    let threwNoOrg = false;
    try { createCloudRepository({ client: {}, table: 'dossiers' }); } catch (e) { threwNoOrg = true; }
    push('createCloudRepository() sans organizationId lève une erreur explicite', threwNoOrg, null);

    const client = makeFakeSupabaseClient([
      { id: 'd1', name: 'STOIK', organization_id: 'org-a', updated_at: 100 },
      { id: 'd2', name: 'ZINNOV', organization_id: 'org-a', updated_at: 200 },
      { id: 'd3', name: 'AUTRE CABINET', organization_id: 'org-b', updated_at: 300 },
    ]);
    const repo = createCloudRepository({ client, table: 'records', organizationId: 'org-a' });

    const liste = await repo.list();
    push('list() ne renvoie que les enregistrements du cabinet demandé (isolation dès la construction de requête)', liste.length === 2 && liste.every((r) => r.organization_id === 'org-a'), liste);
    push('list() trie par updated_at décroissant', liste[0].id === 'd2', liste.map((r) => r.id));

    const un = await repo.get('d1');
    push('get() retrouve un enregistrement existant du bon cabinet', un && un.name === 'STOIK', un);

    const introuvable = await repo.get('d3'); // appartient à org-b, jamais renvoyé pour org-a
    push('get() ne renvoie jamais un enregistrement d’un autre cabinet, même par id exact', introuvable === null, introuvable);

    const nouveau = await repo.save({ id: 'd4', name: 'LIFEAZ' });
    push('save() ajoute organization_id automatiquement à l’enregistrement envoyé', nouveau.organization_id === 'org-a', nouveau);

    await repo.remove('d1');
    const apresRemove = await repo.get('d1');
    push('remove() supprime bien l’enregistrement', apresRemove === null, apresRemove);

    let saveSansId = false;
    try { await repo.save({ name: 'Sans id' }); } catch (e) { saveSansId = true; }
    push('save() sans id lève une erreur explicite plutôt que d’écrire un enregistrement invalide', saveSansId, null);
  }

  return results;
}

module.exports = { run };
