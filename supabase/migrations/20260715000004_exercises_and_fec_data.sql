-- ═══════════════════════════════════════════════════════════════════════
-- 0004 — Exercices, fichiers FEC, balances agrégées, mappings
-- ═══════════════════════════════════════════════════════════════════════
-- Décision architecturale (SAAS_ARCHITECTURE.md §3.6, reprise ici) :
-- le détail écriture par écriture n'est JAMAIS stocké en base, comme
-- aujourd'hui côté localStorage (ACTIVE.exercices[x].ledger, exclu
-- explicitement par saveActiveDossier() avant sérialisation). Seule la
-- balance agrégée par compte (account_balances) est persistée ; le
-- fichier FEC original reste accessible en privé (fec_files + Supabase
-- Storage, cf. 0007_storage.sql) pour reconstruire le grand livre à la
-- demande, exactement comme parseFECFile() le fait déjà aujourd'hui.
--
-- organization_id ET dossier_id sont dénormalisés sur fec_files et
-- account_balances (au lieu d'une jointure systématique via exercises)
-- pour des politiques RLS simples et rapides — principe déjà annoncé en
-- SAAS_ARCHITECTURE.md §3.2.

create table exercises (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references dossiers(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  label text not null,
  period_start text, -- format AAAAMM, cohérent avec le FEC (cf. parseFECFile() dans FEC_Analyse_v6.html)
  period_end text,
  filename text,
  nb_lines int,
  imported_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index idx_exercises_dossier on exercises(dossier_id);
create index idx_exercises_org on exercises(organization_id);

create table fec_files (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references exercises(id) on delete cascade,
  dossier_id uuid not null references dossiers(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  storage_path text not null, -- chemin dans le bucket privé 'fec-files' : {organization_id}/{dossier_id}/{exercise_id}/{fichier} — jamais une URL publique
  original_filename text not null,
  size_bytes bigint,
  sha256 text,
  encoding_detected text, -- 'utf-8' | 'latin1', cf. détection existante dans parseFECFile()
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);
create index idx_fec_files_exercise on fec_files(exercise_id);
create index idx_fec_files_dossier on fec_files(dossier_id);
create index idx_fec_files_org on fec_files(organization_id);

-- Une ligne par compte et par exercice — jamais par écriture.
create table account_balances (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references exercises(id) on delete cascade,
  dossier_id uuid not null references dossiers(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  account_number text not null,
  label text,
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  balance numeric(14,2) not null default 0,
  months jsonb not null default '{}'::jsonb, -- répartition mensuelle, cf. ACTIVE.months
  unique (exercise_id, account_number)
);
create index idx_account_balances_exercise on account_balances(exercise_id);
create index idx_account_balances_dossier on account_balances(dossier_id);
create index idx_account_balances_org on account_balances(organization_id);

-- Mapping CR/Bilan, cf. ACTIVE.mps.cr / ACTIVE.mps.bilan. version
-- incrémentée à chaque écriture — combinée à entity_versions (0006) pour
-- l'historique complet et le bouton "Restaurer cette version" (§11).
create table mappings (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references dossiers(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('cr', 'bilan')),
  structure jsonb not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (dossier_id, kind)
);
create trigger trg_mappings_updated_at
  before update on mappings
  for each row execute function set_updated_at();
create index idx_mappings_dossier on mappings(dossier_id);
