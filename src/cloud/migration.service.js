'use strict';
/**
 * migration.service.js — détection et planification de la migration des
 * données locales vers le cloud (SAAS_ARCHITECTURE.md §6, demande §21).
 *
 * Logique entièrement pure : injectée avec un objet localStorage-like
 * ({getItem(key)}), testable sans navigateur ni réseau. Ne supprime
 * JAMAIS de données locales — se contente de détecter puis de construire
 * un plan que l'appelant applique explicitement, après confirmation
 * utilisateur, et n'efface les données locales qu'après un succès de
 * migration confirmé (jamais avant, jamais automatiquement).
 *
 * LOCAL_STORE_KEYS reprend l'inventaire exhaustif des 8 clés localStorage
 * documenté dans SAAS_ARCHITECTURE.md §1.3 — toute nouvelle clé de
 * stockage ajoutée à l'application doit être ajoutée ici pour être prise
 * en compte par la migration (vérifié par tests/test_migration_service.js).
 */
const LOCAL_STORE_KEYS = [
  { key: 'fec_analyse_v2', label: 'Dossiers', kind: 'dossiers' },
  { key: 'fec_analyse_previsionnels_v1', label: 'Prévisionnels', kind: 'previsionnels' },
  { key: 'fec_analyse_tns_v1', label: 'Simulations TNS', kind: 'tns' },
  { key: 'fec_analyse_remuneration_v1', label: 'Simulations de rémunération', kind: 'remuneration' },
  { key: 'fec_analyse_irpp_v1', label: 'Déclarations IRPP', kind: 'irpp' },
  // Barèmes/paramétrages par année : surcharges applicatives plutôt que
  // des enregistrements utilisateur au sens propre — migrées à part,
  // jamais mélangées à la détection de doublons dossiers/simulations.
  { key: 'fec_analyse_tns_caisses_v1', label: 'Paramétrage des caisses TNS', kind: 'tns_caisses_overrides' },
  { key: 'fec_analyse_regles_remuneration_par_annee_v1', label: 'Barèmes Rémunération par année', kind: 'regles_remuneration' },
  { key: 'fec_analyse_regles_irpp_par_annee_v1', label: 'Barèmes IRPP par année', kind: 'regles_irpp' },
];

/** detectLocalData(storage) — inventaire des clés non vides, jamais de lecture destructive. */
function detectLocalData(storage) {
  const found = [];
  for (const entry of LOCAL_STORE_KEYS) {
    let raw;
    try { raw = storage.getItem(entry.key); } catch (e) { continue; }
    if (!raw) continue;
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { continue; }
    const count = parsed && typeof parsed === 'object' ? Object.keys(parsed).length : 0;
    if (count > 0) found.push({ key: entry.key, label: entry.label, kind: entry.kind, count, records: parsed });
  }
  return found;
}

function normalizeName(s) { return (s || '').toString().trim().toLowerCase(); }

/**
 * planMigration(localData, cloudRecordsByKind) — pour les stores
 * "enregistrements" (dossiers/previsionnels/tns/remuneration/irpp),
 * détecte les doublons potentiels par SIREN (si disponible, dossiers
 * uniquement) puis par nom normalisé, et classe chaque enregistrement
 * local en "à créer" ou "doublon potentiel à confirmer" — jamais fusionné
 * silencieusement (demande §21 : "demander confirmation en cas de
 * conflit").
 * @param {Array} localData - résultat de detectLocalData().
 * @param {Object<string, Array>} cloudRecordsByKind - { [kind]: [...] } déjà présents dans le cloud pour ce cabinet (vide si première migration).
 */
function planMigration(localData, cloudRecordsByKind) {
  cloudRecordsByKind = cloudRecordsByKind || {};
  const plan = { toCreate: [], potentialDuplicates: [] };
  for (const entry of localData) {
    const cloudRecords = cloudRecordsByKind[entry.kind] || [];
    const records = entry.records && typeof entry.records === 'object' && !Array.isArray(entry.records)
      ? Object.values(entry.records)
      : [];
    for (const record of records) {
      const match = cloudRecords.find((c) =>
        (record.siren && c.siren && record.siren === c.siren) ||
        (normalizeName(record.name) && normalizeName(record.name) === normalizeName(c.name))
      );
      if (match) {
        plan.potentialDuplicates.push({ kind: entry.kind, local: record, cloud: match });
      } else {
        plan.toCreate.push({ kind: entry.kind, record });
      }
    }
  }
  return plan;
}

module.exports = { LOCAL_STORE_KEYS, detectLocalData, planMigration };
