-- ═══════════════════════════════════════════════════════════════════════
-- 0003 — Dossiers clients et permissions par dossier
-- ═══════════════════════════════════════════════════════════════════════
-- Implémente la demande §8 (permissions précises par dossier, jamais
-- juste par cabinet) et §27 (corbeille avant suppression définitive).

create table dossiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  group_label text,
  siren text,
  is_rd_company boolean not null default false,
  revenue_types jsonb not null default '{}'::jsonb,
  deleted_at timestamptz, -- corbeille : non nul = "supprimé logiquement", purge définitive hors périmètre SQL (job planifié)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);
create trigger trg_dossiers_updated_at
  before update on dossiers
  for each row execute function set_updated_at();
create index idx_dossiers_org on dossiers(organization_id) where deleted_at is null;

-- Niveaux de permission par dossier, du plus faible au plus fort.
-- 'none' existe explicitement (plutôt que l'absence de ligne) pour
-- pouvoir retirer un accès précédemment accordé sans supprimer
-- l'historique de la ligne (traçabilité).
create type dossier_permission_level as enum ('none', 'read', 'write', 'manage');

create table dossier_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dossier_id uuid not null references dossiers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_level dossier_permission_level not null default 'read',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (dossier_id, user_id)
);
create index idx_dossier_permissions_dossier on dossier_permissions(dossier_id);
create index idx_dossier_permissions_user on dossier_permissions(user_id);

-- ── Résolution d'accès à un dossier ──────────────────────────────────────
-- Règle métier (§7) : un administrateur de cabinet a de facto un accès
-- complet ('manage') à tous les dossiers de son cabinet, sans qu'il soit
-- nécessaire de créer une ligne dossier_permissions pour lui. Pour tout
-- autre rôle, l'accès dépend strictement de dossier_permissions.
create or replace function dossier_permission_level_for(target_dossier uuid)
returns dossier_permission_level
language sql security definer stable set search_path = public
as $$
  select case
    when exists (
      select 1 from dossiers d
      where d.id = target_dossier and is_admin_of(d.organization_id)
    ) then 'manage'::dossier_permission_level
    else coalesce(
      (select dp.permission_level from dossier_permissions dp
       where dp.dossier_id = target_dossier and dp.user_id = auth.uid()),
      'none'::dossier_permission_level
    )
  end;
$$;

create or replace function has_dossier_access(target_dossier uuid, min_level dossier_permission_level default 'read')
returns boolean
language sql security definer stable set search_path = public
as $$
  select case min_level
    when 'read'   then dossier_permission_level_for(target_dossier) in ('read', 'write', 'manage')
    when 'write'  then dossier_permission_level_for(target_dossier) in ('write', 'manage')
    when 'manage' then dossier_permission_level_for(target_dossier) = 'manage'
    else false
  end;
$$;

comment on function has_dossier_access(uuid, dossier_permission_level) is
  'Fonction d''autorisation centrale réutilisée par toutes les politiques RLS des tables liées à un dossier (exercises, fec_files, mappings, forecasts, simulations, comments...). Un utilisateur sans accès à un dossier ne doit JAMAIS pouvoir le voir, le rechercher, ni accéder à son contenu — cf. demande §8.';
