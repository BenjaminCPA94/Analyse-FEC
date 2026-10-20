'use strict';
/**
 * Tests de src/cloud/migration.service.js — détection des données locales
 * et planification de la migration vers le cloud (SAAS_ARCHITECTURE.md
 * §6, demande §21). Logique pure, testée avec un faux localStorage (objet
 * Map en mémoire) : aucun navigateur, aucun réseau requis.
 */
const { LOCAL_STORE_KEYS, detectLocalData, planMigration } = require('../src/cloud/migration.service.js');

/** Fake localStorage minimal (Map en mémoire), suffisant pour ce module. */
function makeFakeStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, value); },
    removeItem(key) { map.delete(key); },
  };
}

function run() {
  const results = [];
  const push = (name, pass, detail) => results.push({ name, pass, detail });

  // ── LOCAL_STORE_KEYS — cohérence avec l'inventaire de SAAS_ARCHITECTURE.md §1.3 ─
  {
    const cles = LOCAL_STORE_KEYS.map((e) => e.key);
    const attendues = [
      'fec_analyse_v2', 'fec_analyse_previsionnels_v1', 'fec_analyse_tns_v1',
      'fec_analyse_remuneration_v1', 'fec_analyse_irpp_v1', 'fec_analyse_tns_caisses_v1',
      'fec_analyse_regles_remuneration_par_annee_v1', 'fec_analyse_regles_irpp_par_annee_v1',
    ];
    push('LOCAL_STORE_KEYS couvre les 8 clés localStorage inventoriées dans l’audit', attendues.every((k) => cles.includes(k)) && cles.length === attendues.length, cles);
  }

  // ── detectLocalData() ─────────────────────────────────────────────────
  {
    const storageVide = makeFakeStorage({});
    push('detectLocalData() sur un navigateur vierge renvoie []', detectLocalData(storageVide).length === 0, null);

    const storage = makeFakeStorage({
      fec_analyse_v2: JSON.stringify({ d1: { id: 'd1', name: 'STOIK' }, d2: { id: 'd2', name: 'ZINNOV' } }),
      fec_analyse_tns_v1: JSON.stringify({ t1: { id: 't1', name: 'Calcul 2025' } }),
      fec_analyse_previsionnels_v1: JSON.stringify({}), // présent mais vide -> ne doit pas remonter
    });
    const detection = detectLocalData(storage);
    push('detectLocalData() ignore les clés présentes mais vides', !detection.some((e) => e.kind === 'previsionnels'), detection);
    push('detectLocalData() détecte les Dossiers avec le bon count', detection.some((e) => e.kind === 'dossiers' && e.count === 2), detection);
    push('detectLocalData() détecte les simulations TNS', detection.some((e) => e.kind === 'tns' && e.count === 1), detection);

    const storageCorrompu = makeFakeStorage({ fec_analyse_v2: '{ceci n\'est pas du JSON' });
    push('detectLocalData() ignore silencieusement une clé au JSON corrompu (jamais d’exception)', detectLocalData(storageCorrompu).length === 0, null);
  }

  // ── planMigration() — détection de doublons, jamais de fusion silencieuse ─
  {
    const localData = [
      {
        key: 'fec_analyse_v2', label: 'Dossiers', kind: 'dossiers', count: 3,
        records: {
          d1: { id: 'd1', name: 'STOIK', siren: '123456789' },
          d2: { id: 'd2', name: 'ZINNOV FRANCE' },
          d3: { id: 'd3', name: 'Dossier Totalement Nouveau' },
        },
      },
    ];

    // Aucune donnée cloud existante -> tout est "à créer"
    const planVide = planMigration(localData, {});
    push('planMigration() sans données cloud existantes classe tout en "à créer"', planVide.toCreate.length === 3 && planVide.potentialDuplicates.length === 0, planVide);

    // Doublon détecté par SIREN (même si le nom diffère légèrement)
    const cloudAvecSiren = { dossiers: [{ id: 'cloud-1', name: 'STOIK FRANCE (ancien nom)', siren: '123456789' }] };
    const planSiren = planMigration(localData, cloudAvecSiren);
    push('planMigration() détecte un doublon par SIREN même si le nom diffère', planSiren.potentialDuplicates.some((d) => d.local.id === 'd1'), planSiren);
    push('planMigration() : les 2 autres dossiers locaux restent "à créer"', planSiren.toCreate.length === 2, planSiren.toCreate.map((c) => c.record.id));

    // Doublon détecté par nom normalisé (casse/espaces différents), sans SIREN
    const cloudAvecNom = { dossiers: [{ id: 'cloud-2', name: '  zinnov france  ' }] };
    const planNom = planMigration(localData, cloudAvecNom);
    push('planMigration() détecte un doublon par nom normalisé (casse/espaces ignorés)', planNom.potentialDuplicates.some((d) => d.local.id === 'd2'), planNom);

    // Aucune fusion silencieuse : un doublon reste dans potentialDuplicates, jamais absorbé sans trace
    push('planMigration() ne supprime jamais un enregistrement local détecté en doublon (toujours listé, jamais ignoré)', planSiren.potentialDuplicates.length + planSiren.toCreate.length === 3, planSiren);
  }

  return results;
}

module.exports = { run };
