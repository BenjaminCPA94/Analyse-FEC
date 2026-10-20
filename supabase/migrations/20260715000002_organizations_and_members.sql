-- ═══════════════════════════════════════════════════════════════════════
-- 0002 — Cabinets, profils, appartenance et rôles
-- ═══════════════════════════════════════════════════════════════════════
-- Racine du modèle multi-tenant (SAAS_ARCHITECTURE.md §3.2) : toute donnée
-- métier porte un organization_id qui remonte ici. Les politiques RLS
-- (0008_rls_policies.sql) s'appuient sur les fonctions is_active_member_of/
-- is_admin_of/member_role_in définies en fin de ce fichier.

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_organizations_updated_at
  before update on organizations
  for each row execute function set_updated_at();

-- profiles — 1:1 avec auth.users (Supabase Auth). Jamais alimenté
-- directement par le client : peuplé par le trigger handle_new_user()
-- ci-dessous à chaque inscription.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id, new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

comment on function handle_new_user() is
  'Crée automatiquement un profil public à chaque inscription Supabase Auth. security definer nécessaire car auth.users est un schéma protégé.';

-- Rôles : extensible (ajouter une valeur à l'enum ne casse rien
-- d'existant). Cf. demande §7 : administrateur / manager / collaborateur
-- / lecture seule, avec possibilité d'en ajouter d'autres plus tard.
create type organization_role as enum ('admin', 'manager', 'collaborator', 'read_only');
create type membership_status as enum ('invited', 'active', 'suspended');

-- organization_members — appartenance + rôle. Sert aussi de registre
-- d'invitations : une ligne status='invited' (user_id encore null, email
-- renseigné) devient status='active' (user_id renseigné) à l'acceptation.
-- invitation_token est un secret opaque envoyé par email (jamais affiché
-- ni loggé en clair côté serveur), utilisé par l'edge function
-- invite-collaborator et par la page d'acceptation d'invitation.
create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role organization_role not null default 'collaborator',
  status membership_status not null default 'invited',
  invitation_token uuid default gen_random_uuid(),
  invitation_expires_at timestamptz,
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);
create trigger trg_organization_members_updated_at
  before update on organization_members
  for each row execute function set_updated_at();
create index idx_organization_members_org on organization_members(organization_id);
create index idx_organization_members_user on organization_members(user_id);
create index idx_organization_members_token on organization_members(invitation_token) where status = 'invited';

-- ── Fonctions d'autorisation réutilisées par toutes les politiques RLS ──
-- security definer + search_path fixé : nécessaire pour interroger
-- organization_members sans provoquer de récursion RLS infinie (la
-- fonction s'exécute avec les privilèges de son propriétaire, en
-- contournant la RLS sur cette table précise — comportement standard et
-- documenté de Supabase pour ce cas exact). C'est la SEULE dérogation à
-- la RLS dans tout ce schéma, et elle ne fait jamais que RENDRE UN
-- BOOLÉEN/RÔLE dérivé de auth.uid() — jamais de données métier brutes.
create or replace function is_active_member_of(target_org uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where organization_id = target_org
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function is_admin_of(target_org uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where organization_id = target_org
      and user_id = auth.uid()
      and status = 'active'
      and role = 'admin'
  );
$$;

create or replace function member_role_in(target_org uuid)
returns organization_role
language sql security definer stable set search_path = public
as $$
  select role from organization_members
  where organization_id = target_org and user_id = auth.uid() and status = 'active'
  limit 1;
$$;

comment on function is_active_member_of(uuid) is
  'Utilisée par toutes les politiques RLS pour vérifier l''appartenance active à un cabinet. security definer volontaire (cf. commentaire ci-dessus) pour éviter la récursion RLS sur organization_members.';

-- create_organization() — seul point d'entrée pour créer un cabinet :
-- crée l'organisation ET la rend admin de son créateur, atomiquement.
-- Aucune politique RLS INSERT n'existe sur organizations : la création
-- directe par le client est impossible, uniquement via cette fonction.
create or replace function create_organization(org_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  new_org_id uuid;
begin
  if org_name is null or length(trim(org_name)) = 0 then
    raise exception 'Le nom du cabinet ne peut pas être vide';
  end if;
  insert into organizations (name) values (trim(org_name)) returning id into new_org_id;
  insert into organization_members (organization_id, user_id, email, role, status)
  values (new_org_id, auth.uid(), (select email from auth.users where id = auth.uid()), 'admin', 'active');
  return new_org_id;
end;
$$;

comment on function create_organization(text) is
  'Point d''entrée unique pour créer un cabinet : crée organizations + la première appartenance admin en une transaction. Aucun insert direct sur organizations n''est autorisé par la RLS.';
