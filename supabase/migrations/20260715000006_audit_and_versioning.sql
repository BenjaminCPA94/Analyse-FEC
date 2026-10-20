-- ═══════════════════════════════════════════════════════════════════════
-- 0006 — Journal d'audit et versioning ciblé
-- ═══════════════════════════════════════════════════════════════════════
-- Deux mécanismes distincts, volontairement séparés (cf. demande §11/§12) :
--  - audit_logs : "qui a fait quoi, quand" — actions applicatives
--    (connexion, invitation, changement de rôle, import FEC, suppression,
--    export...), jamais l'ancienne/nouvelle valeur d'un champ.
--  - entity_versions : "quelle était l'ancienne valeur, quelle est la
--    nouvelle" — réservé aux entités où la demande le justifie
--    explicitement (mappings, dossier_permissions) pour ne pas générer un
--    volume excessif (§11 : "ne pas nécessairement versionner chaque
--    mouvement insignifiant").
--
-- Aucune des deux tables n'a de politique RLS INSERT pour les clients :
-- elles se peuplent exclusivement via des fonctions security definer
-- (log_audit_event) ou des triggers (log_entity_version), jamais par
-- écriture directe du navigateur — un utilisateur compromis ne doit
-- jamais pouvoir falsifier ou effacer sa propre trace d'audit.

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_logs_org_date on audit_logs(organization_id, created_at desc);

create or replace function log_audit_event(
  p_organization_id uuid, p_action text, p_entity_type text default null,
  p_entity_id uuid default null, p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_active_member_of(p_organization_id) then
    raise exception 'Accès refusé : utilisateur non membre actif du cabinet %', p_organization_id;
  end if;
  insert into audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
  values (p_organization_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
end;
$$;

comment on function log_audit_event(uuid, text, text, uuid, jsonb) is
  'Point d''entrée unique pour journaliser une action côté client. Vérifie l''appartenance active au cabinet avant d''écrire, pour empêcher un utilisateur de polluer le journal d''audit d''un cabinet auquel il n''appartient pas.';

create table entity_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  diff jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index idx_entity_versions_entity on entity_versions(entity_type, entity_id, created_at desc);

-- Fonction de trigger générique : capture {before, after} sur UPDATE/DELETE.
-- TG_ARGV[0] porte le nom logique de l'entité ('mapping', 'dossier_permission'...).
create or replace function log_entity_version()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into entity_versions (organization_id, entity_type, entity_id, diff, created_by)
  values (
    coalesce(new.organization_id, old.organization_id),
    TG_ARGV[0],
    coalesce(new.id, old.id),
    jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)),
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

-- Versioning ciblé (§11) : mappings et dossier_permissions en priorité.
-- Extensible plus tard (ex. dossiers) sans migration destructive — il
-- suffit d'ajouter un nouveau trigger appelant la même fonction.
create trigger trg_version_mappings
  after update or delete on mappings
  for each row execute function log_entity_version('mapping');

create trigger trg_version_dossier_permissions
  after update or delete on dossier_permissions
  for each row execute function log_entity_version('dossier_permission');
