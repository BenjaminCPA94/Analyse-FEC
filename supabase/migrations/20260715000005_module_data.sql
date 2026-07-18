-- ═══════════════════════════════════════════════════════════════════════
-- 0005 — Données des modules métier (Prévisionnel, TNS, Rémunération, IRPP)
-- ═══════════════════════════════════════════════════════════════════════
-- Choix architectural : payload jsonb plutôt qu'un schéma colonne par
-- colonne. Ces 4 modules ont déjà des moteurs de calcul purs et testés
-- (PrevisionnelEngine/TnsEngine/RemunerationEngine/IrppEngine) produisant
-- des structures JSON riches et stables (cf. tests/test_*_engine.js) —
-- les répliquer en colonnes SQL dupliquerait la connaissance du format
-- à deux endroits (JS + SQL) sans bénéfice : ces données ne sont jamais
-- interrogées par filtre SQL fin (contrairement à account_balances), elles
-- sont toujours lues/écrites en bloc par le moteur JS correspondant.
--
-- dossier_id est nullable sur les 3 modules "simulation" (Prévisionnel
-- feuille vierge, TNS, Rémunération, IRPP) car ces outils fonctionnent
-- aussi de façon autonome, hors dossier client (cf. l'app actuelle :
-- créerPrevisionnelVierge() / le module TNS/Rémunération/IRPP n'exigent
-- pas de dossier). Politique RLS (0008) : accessible à tout membre actif
-- du cabinet quand dossier_id est null, sinon soumis à has_dossier_access.

create table forecasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dossier_id uuid references dossiers(id) on delete set null,
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);
create trigger trg_forecasts_updated_at before update on forecasts for each row execute function set_updated_at();
create index idx_forecasts_org on forecasts(organization_id);
create index idx_forecasts_dossier on forecasts(dossier_id);

create table tns_simulations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dossier_id uuid references dossiers(id) on delete set null,
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);
create trigger trg_tns_simulations_updated_at before update on tns_simulations for each row execute function set_updated_at();
create index idx_tns_simulations_org on tns_simulations(organization_id);
create index idx_tns_simulations_dossier on tns_simulations(dossier_id);

create table remuneration_simulations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dossier_id uuid references dossiers(id) on delete set null,
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);
create trigger trg_remuneration_simulations_updated_at before update on remuneration_simulations for each row execute function set_updated_at();
create index idx_remuneration_simulations_org on remuneration_simulations(organization_id);
create index idx_remuneration_simulations_dossier on remuneration_simulations(dossier_id);

create table irpp_declarations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dossier_id uuid references dossiers(id) on delete set null,
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);
create trigger trg_irpp_declarations_updated_at before update on irpp_declarations for each row execute function set_updated_at();
create index idx_irpp_declarations_org on irpp_declarations(organization_id);
create index idx_irpp_declarations_dossier on irpp_declarations(dossier_id);

-- Commentaires collaboratifs sur un dossier (mentionnés en §9 "commentaires").
create table comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dossier_id uuid not null references dossiers(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index idx_comments_dossier on comments(dossier_id, created_at desc);
