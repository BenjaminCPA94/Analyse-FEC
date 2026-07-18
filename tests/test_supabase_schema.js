'use strict';
/**
 * Analyse STATIQUE des migrations SQL (supabase/migrations/*.sql).
 *
 * Ce n'est PAS un test d'intégration contre une vraie base PostgreSQL —
 * cet environnement de développement n'a pas accès à un projet Supabase
 * réel (cf. SAAS_ARCHITECTURE.md §9). C'est un garde-fou automatisable
 * dès maintenant : il relit le texte des migrations et vérifie des
 * invariants structurels qui, s'ils étaient violés, représenteraient une
 * régression de sécurité multi-tenant sérieuse :
 *  - chaque table métier (hors une courte liste explicite) porte bien une
 *    colonne organization_id ;
 *  - CHAQUE table créée a "enable row level security" ;
 *  - CHAQUE table avec RLS activée a au moins une politique ;
 *  - aucune ligne "disable row level security" n'existe nulle part
 *    (garde-fou permanent contre l'erreur "je désactive la RLS pour
 *    déboguer et j'oublie de la réactiver") ;
 *  - toutes les références (foreign keys) pointent vers une table connue
 *    (créée dans les migrations, ou un objet Supabase natif comme
 *    auth.users/storage.objects).
 *
 * Ce fichier doit être relu et étendu manuellement à chaque nouvelle
 * migration — ce n'est pas un substitut à une vraie revue de politique
 * RLS ni à des tests d'intégration une fois un projet Supabase connecté
 * (cf. SETUP_SUPABASE.md et le plan de tests documenté dans
 * SAAS_ARCHITECTURE.md).
 */
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

// Tables volontairement exemptées de la règle "doit porter organization_id" :
// - organizations : c'est la table racine, son id EST l'identifiant du cabinet.
// - profiles : liée 1:1 à auth.users, portée par des politiques dédiées
//   (visibilité de soi-même + collègues de cabinet), pas par organization_id.
const TABLES_SANS_ORGANIZATION_ID = new Set(['organizations', 'profiles']);

// Objets/schemas Supabase natifs, jamais créés par nos migrations mais
// légitimement référencés en foreign key.
const TABLES_EXTERNES_CONNUES = new Set(['auth.users', 'storage.objects', 'storage.buckets']);

function lireMigrations() {
  const fichiers = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  return fichiers.map((f) => ({ fichier: f, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8') }));
}

function run() {
  const results = [];
  const push = (name, pass, detail) => results.push({ name, pass, detail });

  let migrations;
  try {
    migrations = lireMigrations();
  } catch (e) {
    push('Le dossier supabase/migrations/ existe et contient des fichiers .sql lisibles', false, e.message);
    return results;
  }
  push(`supabase/migrations/ contient des fichiers .sql (${migrations.length} trouvé(s))`, migrations.length > 0, migrations.map((m) => m.fichier));

  const sqlComplet = migrations.map((m) => m.sql).join('\n');

  // ── Extraction des tables créées (nom + corps du CREATE TABLE) ────────
  const tableRegex = /create table\s+([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\);/gi;
  const tables = [];
  let m;
  while ((m = tableRegex.exec(sqlComplet)) !== null) {
    tables.push({ nom: m[1], corps: m[2] });
  }
  push('Au moins 15 tables métier créées dans les migrations', tables.length >= 15, tables.map((t) => t.nom));

  const nomsTables = new Set(tables.map((t) => t.nom));
  const tablesAttendues = [
    'organizations', 'profiles', 'organization_members', 'dossiers', 'dossier_permissions',
    'exercises', 'fec_files', 'account_balances', 'mappings', 'forecasts', 'tns_simulations',
    'remuneration_simulations', 'irpp_declarations', 'comments', 'audit_logs', 'entity_versions',
  ];
  for (const t of tablesAttendues) {
    push(`La table "${t}" est bien créée`, nomsTables.has(t), [...nomsTables]);
  }

  // ── organization_id sur chaque table métier (sauf exemptions explicites) ─
  for (const table of tables) {
    if (TABLES_SANS_ORGANIZATION_ID.has(table.nom)) continue;
    const aOrganizationId = /organization_id\s+uuid/i.test(table.corps);
    push(`Table "${table.nom}" porte une colonne organization_id`, aOrganizationId, table.corps.slice(0, 200));
  }

  // ── RLS activée sur chaque table créée ─────────────────────────────────
  const rlsEnableRegex = /alter table\s+([a-z_][a-z0-9_]*)\s+enable row level security/gi;
  const tablesAvecRls = new Set();
  while ((m = rlsEnableRegex.exec(sqlComplet)) !== null) tablesAvecRls.add(m[1]);

  for (const table of tables) {
    push(`RLS activée sur "${table.nom}" (enable row level security)`, tablesAvecRls.has(table.nom), [...tablesAvecRls]);
  }

  // ── Aucune désactivation de RLS nulle part (garde-fou permanent) ──────
  const disableRlsMatches = sqlComplet.match(/disable row level security/gi) || [];
  push('Aucune occurrence de "disable row level security" dans les migrations', disableRlsMatches.length === 0, disableRlsMatches.length);

  // ── Au moins une politique par table RLS-activée ──────────────────────
  const policyRegex = /create policy\s+"[^"]+"\s*\n?\s*on\s+([a-z_.][a-z0-9_.]*)/gi;
  const tablesAvecPolicy = new Set();
  while ((m = policyRegex.exec(sqlComplet)) !== null) tablesAvecPolicy.add(m[1].replace(/^public\./, ''));
  const nbPolicies = (sqlComplet.match(/create policy/gi) || []).length;
  push(`Au moins 40 politiques RLS définies au total (${nbPolicies} trouvées)`, nbPolicies >= 40, nbPolicies);

  for (const table of tables) {
    if (!tablesAvecRls.has(table.nom)) continue; // déjà signalé ci-dessus si absent
    push(`Au moins une politique RLS existe pour "${table.nom}"`, tablesAvecPolicy.has(table.nom), [...tablesAvecPolicy]);
  }

  // storage.objects (bucket FEC) a ses propres politiques, hors boucle "tables" (ce n'est pas une table applicative créée par nous)
  push('Des politiques RLS existent sur storage.objects (bucket FEC privé)', tablesAvecPolicy.has('storage.objects'), [...tablesAvecPolicy]);

  // ── Intégrité des références (foreign keys) ────────────────────────────
  const fkRegex = /references\s+([a-z_][a-z0-9_.]*)\s*\(/gi;
  const referencesInconnues = [];
  while ((m = fkRegex.exec(sqlComplet)) !== null) {
    const cible = m[1];
    if (nomsTables.has(cible) || TABLES_EXTERNES_CONNUES.has(cible)) continue;
    referencesInconnues.push(cible);
  }
  push('Toutes les références (foreign keys) pointent vers une table connue (créée ici ou objet Supabase natif)', referencesInconnues.length === 0, referencesInconnues);

  // ── Fonctions d'autorisation critiques bien définies ───────────────────
  const fonctionsAttendues = [
    'is_active_member_of', 'is_admin_of', 'member_role_in',
    'has_dossier_access', 'dossier_permission_level_for',
    'create_organization', 'log_audit_event', 'log_entity_version', 'handle_new_user',
  ];
  for (const fn of fonctionsAttendues) {
    const defini = new RegExp(`create (or replace )?function\\s+${fn}\\s*\\(`, 'i').test(sqlComplet);
    push(`Fonction d'autorisation "${fn}()" est bien définie`, defini, null);
  }

  // ── Les fonctions d'autorisation sont security definer (sinon récursion RLS) ─
  const secDefRegex = /create (or replace )?function\s+(is_active_member_of|is_admin_of|member_role_in|has_dossier_access|dossier_permission_level_for)\s*\([\s\S]{0,400}?security definer/gi;
  const nbSecDef = (sqlComplet.match(secDefRegex) || []).length;
  push('Les 5 fonctions d\'autorisation critiques sont bien "security definer" (évite la récursion RLS)', nbSecDef === 5, nbSecDef);

  // ── Aucun insert/service_role key en clair dans les migrations (secret leak) ─
  const motifsSecretsInterdits = [/service_role/i, /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]/i];
  const secretsTrouves = motifsSecretsInterdits.filter((re) => re.test(sqlComplet));
  push('Aucune clé service_role ni secret en clair dans les migrations SQL (elles ne doivent jamais y figurer)', secretsTrouves.length === 0, secretsTrouves.map((r) => r.toString()));

  return results;
}

module.exports = { run };
