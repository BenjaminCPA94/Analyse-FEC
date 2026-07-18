'use strict';
/**
 * supabase.client.js — usine légère autour du client Supabase.
 *
 * `clientFactory` est injecté (le vrai `createClient` de
 * @supabase/supabase-js) plutôt qu'importé en dur ici, pour deux raisons :
 *  1. Testable sans le paquet réel ni accès réseau (fake injecté dans les
 *     tests, cf. tests/test_cloud_repository.js).
 *  2. Le mécanisme de chargement du SDK (npm+bundler, ou import ESM
 *     depuis un CDN directement dans le HTML) est une décision reportée à
 *     l'intégration réelle avec le projet Supabase — cf.
 *     SAAS_ARCHITECTURE.md §3.4/§9 — pas figée dans ce module.
 *
 * Ne fabrique jamais un faux client qui prétend fonctionner : si la
 * configuration est absente/incomplète, isConfigured() renvoie false et
 * getClient() lève une erreur explicite plutôt que de retourner un objet
 * qui échouerait silencieusement à la première requête. C'est la garantie
 * demandée : « ne pas créer un faux backend ou système simulé ».
 *
 * @param {object} config
 * @param {string} [config.url] - URL du projet Supabase (https://xxxx.supabase.co).
 * @param {string} [config.anonKey] - clé publique "anon" (jamais la clé service_role).
 * @param {(url: string, anonKey: string) => object} [config.clientFactory] - le vrai createClient(), injecté.
 */
function createSupabaseClient(config) {
  config = config || {};
  const { url, anonKey, clientFactory } = config;
  let cachedClient = null;

  function isConfigured() {
    return !!(url && anonKey && typeof clientFactory === 'function');
  }

  function getClient() {
    if (!isConfigured()) {
      throw new Error(
        'Client Supabase non configuré : url/anonKey/clientFactory manquants. ' +
        'Cf. SETUP_SUPABASE.md pour renseigner les informations du projet avant toute synchronisation cloud.'
      );
    }
    if (!cachedClient) cachedClient = clientFactory(url, anonKey);
    return cachedClient;
  }

  return { isConfigured, getClient };
}

module.exports = { createSupabaseClient };
