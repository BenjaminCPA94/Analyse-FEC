'use strict';
/**
 * cloud.repository.js — implémentation du même contrat que
 * createLocalStorageRepository() (cf. FEC_Analyse_v6.html, section
 * "COUCHE DE STOCKAGE — REPOSITORY GÉNÉRIQUE"), adossée à une table
 * Supabase au lieu de localStorage.
 *
 * DIFFÉRENCE IMPORTANTE, assumée et documentée plutôt que masquée :
 * createLocalStorageRepository est SYNCHRONE (localStorage l'est), ce
 * repository est ASYNCHRONE (réseau). Le jour de l'intégration réelle
 * (Phase 7), chaque point d'appel actuel (`repository.save(record)` sans
 * attente) devra être adapté pour gérer une promesse — ce n'est PAS un
 * remplacement transparent au sens strict, contrairement à ce qui était
 * espéré en Phase 2. C'est le prix normal du passage au réseau ; le
 * signaler ici évite une fausse promesse de compatibilité totale.
 *
 * `client` est injecté (interface Supabase-like :
 * .from(table).select()/.insert()/.upsert()/.delete()/.eq()/.order()/
 * .maybeSingle()/.single()), ce qui permet de tester ce module avec un
 * faux client sans réseau ni paquet npm réel — cf.
 * tests/test_cloud_repository.js.
 *
 * @param {object} config
 * @param {object} config.client - client Supabase-like (réel ou fake de test).
 * @param {string} config.table - nom de la table Postgres.
 * @param {string} config.organizationId - cabinet courant ; jamais une valeur implicite côté serveur, toujours explicite ici. La RLS (supabase/migrations/0008_rls_policies.sql) revalide de toute façon côté base — ce n'est donc jamais le SEUL rempart, seulement une première ligne de cohérence côté client.
 */
function createCloudRepository(config) {
  config = config || {};
  const { client, table, organizationId } = config;
  if (!client) throw new Error('createCloudRepository: "client" est obligatoire');
  if (!table) throw new Error('createCloudRepository: "table" est obligatoire');
  if (!organizationId) throw new Error('createCloudRepository: "organizationId" est obligatoire');

  async function get(id) {
    const { data, error } = await client
      .from(table).select('*').eq('id', id).eq('organization_id', organizationId).maybeSingle();
    if (error) throw new Error(`[CloudRepository:${table}] get(${id}) a échoué : ${error.message}`);
    return data || null;
  }

  async function list() {
    const { data, error } = await client
      .from(table).select('*').eq('organization_id', organizationId).order('updated_at', { ascending: false });
    if (error) throw new Error(`[CloudRepository:${table}] list() a échoué : ${error.message}`);
    return data || [];
  }

  async function save(record) {
    if (!record || !record.id) throw new Error(`[CloudRepository:${table}] save() nécessite un enregistrement avec un id`);
    const payload = { ...record, organization_id: organizationId };
    const { data, error } = await client.from(table).upsert(payload).select().single();
    if (error) throw new Error(`[CloudRepository:${table}] save(${record.id}) a échoué : ${error.message}`);
    return data;
  }

  async function remove(id) {
    const { error } = await client
      .from(table).delete().eq('id', id).eq('organization_id', organizationId);
    if (error) throw new Error(`[CloudRepository:${table}] remove(${id}) a échoué : ${error.message}`);
    return true;
  }

  return { get, list, save, remove };
}

module.exports = { createCloudRepository };
