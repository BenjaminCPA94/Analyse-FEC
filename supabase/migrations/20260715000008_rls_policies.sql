-- ═══════════════════════════════════════════════════════════════════════
-- 0008 — Row Level Security : activation + politiques, TOUTES les tables
-- ═══════════════════════════════════════════════════════════════════════
-- Règle absolue (demande §6/§25/§34) : l'isolation entre cabinets et entre
-- dossiers est appliquée ICI, au niveau de la base de données — jamais
-- seulement dans le code applicatif ou l'interface. Cette migration
-- active RLS sur CHAQUE table métier et n'accorde JAMAIS un accès par
-- défaut : sans politique correspondante, un SELECT/INSERT/UPDATE/DELETE
-- est refusé. Ne jamais exécuter `alter table ... disable row level
-- security` en production, y compris temporairement pour déboguer.
--
-- Toutes les fonctions d'autorisation utilisées ci-dessous
-- (is_active_member_of, is_admin_of, member_role_in, has_dossier_access,
-- dossier_permission_level_for) sont définies dans 0002/0003 et testées
-- statiquement par tests/test_supabase_schema.js (couverture RLS,
-- présence d'organization_id, intégrité des références).

-- ── organizations ─────────────────────────────────────────────────────
alter table organizations enable row level security;

create policy "organizations_select_members"
on organizations for select
using (is_active_member_of(id));

create policy "organizations_update_admins"
on organizations for update
using (is_admin_of(id));
-- Pas de politique INSERT (création exclusive via create_organization()).
-- Pas de politique DELETE (suppression d'un cabinet hors périmètre MVP).

-- ── profiles ───────────────────────────────────────────────────────────
alter table profiles enable row level security;

create policy "profiles_select_self"
on profiles for select
using (id = auth.uid());

create policy "profiles_select_org_colleagues"
on profiles for select
using (
  exists (
    select 1 from organization_members om1
    join organization_members om2 on om1.organization_id = om2.organization_id
    where om1.user_id = auth.uid() and om1.status = 'active'
      and om2.user_id = profiles.id and om2.status = 'active'
  )
);

create policy "profiles_update_self"
on profiles for update
using (id = auth.uid());
-- Pas de politique INSERT (profiles peuplé exclusivement par handle_new_user()).

-- ── organization_members ─────────────────────────────────────────────
alter table organization_members enable row level security;

create policy "organization_members_select_self"
on organization_members for select
using (user_id = auth.uid());

create policy "organization_members_select_admins"
on organization_members for select
using (is_admin_of(organization_id));

create policy "organization_members_insert_admins"
on organization_members for insert
with check (is_admin_of(organization_id));

create policy "organization_members_update_admins"
on organization_members for update
using (is_admin_of(organization_id));

-- Politique additionnelle (permissive, combinée en OR avec la précédente) :
-- un invité peut accepter SA PROPRE invitation (passer 'invited' -> 'active'
-- et renseigner user_id) sans être admin. Le with check empêche cette
-- politique de servir à autre chose qu'une auto-acceptation légitime.
create policy "organization_members_accept_own_invitation"
on organization_members for update
using (
  status = 'invited'
  and email = (select email from auth.users where id = auth.uid())
)
with check (user_id = auth.uid() and status = 'active');

create policy "organization_members_delete_admins"
on organization_members for delete
using (is_admin_of(organization_id));

-- ── dossiers ───────────────────────────────────────────────────────────
alter table dossiers enable row level security;

create policy "dossiers_select_with_access"
on dossiers for select
using (is_active_member_of(organization_id) and has_dossier_access(id, 'read'));

create policy "dossiers_insert_managers_and_admins"
on dossiers for insert
with check (is_active_member_of(organization_id) and member_role_in(organization_id) in ('admin', 'manager'));

create policy "dossiers_update_with_write_access"
on dossiers for update
using (has_dossier_access(id, 'write'));

create policy "dossiers_delete_with_manage_access"
on dossiers for delete
using (has_dossier_access(id, 'manage'));

-- ── dossier_permissions ──────────────────────────────────────────────
alter table dossier_permissions enable row level security;

create policy "dossier_permissions_select_self_or_admin"
on dossier_permissions for select
using (user_id = auth.uid() or is_admin_of(organization_id));

create policy "dossier_permissions_insert_by_managers"
on dossier_permissions for insert
with check (has_dossier_access(dossier_id, 'manage'));

create policy "dossier_permissions_update_by_managers"
on dossier_permissions for update
using (has_dossier_access(dossier_id, 'manage'));

create policy "dossier_permissions_delete_by_managers"
on dossier_permissions for delete
using (has_dossier_access(dossier_id, 'manage'));

-- ── exercises ─────────────────────────────────────────────────────────
alter table exercises enable row level security;

create policy "exercises_select" on exercises for select
using (is_active_member_of(organization_id) and has_dossier_access(dossier_id, 'read'));
create policy "exercises_insert" on exercises for insert
with check (is_active_member_of(organization_id) and has_dossier_access(dossier_id, 'write'));
create policy "exercises_update" on exercises for update
using (has_dossier_access(dossier_id, 'write'));
create policy "exercises_delete" on exercises for delete
using (has_dossier_access(dossier_id, 'manage'));

-- ── fec_files ─────────────────────────────────────────────────────────
-- Métadonnées uniquement (le contenu réel du fichier est dans Supabase
-- Storage, cf. 0007, avec ses propres politiques sur storage.objects).
alter table fec_files enable row level security;

create policy "fec_files_select" on fec_files for select
using (is_active_member_of(organization_id) and has_dossier_access(dossier_id, 'read'));
create policy "fec_files_insert" on fec_files for insert
with check (is_active_member_of(organization_id) and has_dossier_access(dossier_id, 'write'));
create policy "fec_files_delete" on fec_files for delete
using (has_dossier_access(dossier_id, 'manage'));
-- Pas de politique UPDATE (cf. commentaire 0007 : un FEC importé n'est jamais modifié en place).

-- ── account_balances ──────────────────────────────────────────────────
alter table account_balances enable row level security;

create policy "account_balances_select" on account_balances for select
using (is_active_member_of(organization_id) and has_dossier_access(dossier_id, 'read'));
create policy "account_balances_insert" on account_balances for insert
with check (is_active_member_of(organization_id) and has_dossier_access(dossier_id, 'write'));
create policy "account_balances_update" on account_balances for update
using (has_dossier_access(dossier_id, 'write'));
create policy "account_balances_delete" on account_balances for delete
using (has_dossier_access(dossier_id, 'manage'));

-- ── mappings ──────────────────────────────────────────────────────────
alter table mappings enable row level security;

create policy "mappings_select" on mappings for select
using (is_active_member_of(organization_id) and has_dossier_access(dossier_id, 'read'));
create policy "mappings_insert" on mappings for insert
with check (is_active_member_of(organization_id) and has_dossier_access(dossier_id, 'write'));
create policy "mappings_update" on mappings for update
using (has_dossier_access(dossier_id, 'write'));
create policy "mappings_delete" on mappings for delete
using (has_dossier_access(dossier_id, 'manage'));

-- ── forecasts / tns_simulations / remuneration_simulations / irpp_declarations ─
-- Même politique répétée 4× (dossier_id nullable : accessible à tout
-- membre actif du cabinet quand la simulation n'est pas rattachée à un
-- dossier client, sinon soumise à has_dossier_access — cf. commentaire
-- 0005). Répétition assumée : ce sont 4 tables distinctes, chacune avec
-- sa propre politique nommée pour rester lisible et modifiable
-- indépendamment plus tard (ex. si TNS devient un jour un module
-- premium avec des règles d'accès différentes).

alter table forecasts enable row level security;
create policy "forecasts_select" on forecasts for select
using (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'read')));
create policy "forecasts_insert" on forecasts for insert
with check (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'write')));
create policy "forecasts_update" on forecasts for update
using (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'write')));
create policy "forecasts_delete" on forecasts for delete
using (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'manage')));

alter table tns_simulations enable row level security;
create policy "tns_simulations_select" on tns_simulations for select
using (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'read')));
create policy "tns_simulations_insert" on tns_simulations for insert
with check (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'write')));
create policy "tns_simulations_update" on tns_simulations for update
using (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'write')));
create policy "tns_simulations_delete" on tns_simulations for delete
using (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'manage')));

alter table remuneration_simulations enable row level security;
create policy "remuneration_simulations_select" on remuneration_simulations for select
using (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'read')));
create policy "remuneration_simulations_insert" on remuneration_simulations for insert
with check (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'write')));
create policy "remuneration_simulations_update" on remuneration_simulations for update
using (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'write')));
create policy "remuneration_simulations_delete" on remuneration_simulations for delete
using (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'manage')));

alter table irpp_declarations enable row level security;
create policy "irpp_declarations_select" on irpp_declarations for select
using (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'read')));
create policy "irpp_declarations_insert" on irpp_declarations for insert
with check (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'write')));
create policy "irpp_declarations_update" on irpp_declarations for update
using (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'write')));
create policy "irpp_declarations_delete" on irpp_declarations for delete
using (is_active_member_of(organization_id) and (dossier_id is null or has_dossier_access(dossier_id, 'manage')));

-- ── comments ──────────────────────────────────────────────────────────
alter table comments enable row level security;

create policy "comments_select" on comments for select
using (has_dossier_access(dossier_id, 'read'));
create policy "comments_insert" on comments for insert
with check (has_dossier_access(dossier_id, 'write'));
create policy "comments_delete" on comments for delete
using (has_dossier_access(dossier_id, 'manage') or created_by = auth.uid());

-- ── audit_logs ────────────────────────────────────────────────────────
alter table audit_logs enable row level security;

create policy "audit_logs_select_admins"
on audit_logs for select
using (is_admin_of(organization_id));
-- Pas de politique INSERT client : peuplé exclusivement via log_audit_event() (security definer, 0006).

-- ── entity_versions ───────────────────────────────────────────────────
alter table entity_versions enable row level security;

create policy "entity_versions_select_admins"
on entity_versions for select
using (is_admin_of(organization_id));
-- Pas de politique INSERT client : peuplé exclusivement via les triggers log_entity_version() (0006).
