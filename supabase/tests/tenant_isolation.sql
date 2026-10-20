-- ═══════════════════════════════════════════════════════════════════════
-- tenant_isolation.sql — Tests de sécurité RLS, à exécuter une fois un
-- projet Supabase réel connecté (cf. SETUP_SUPABASE.md).
-- ═══════════════════════════════════════════════════════════════════════
-- ÉTAT DE CE FICHIER : écrit et relu attentivement pendant la Phase 3,
-- mais JAMAIS EXÉCUTÉ — cet environnement de développement n'a pas accès
-- à une base PostgreSQL réelle (cf. SAAS_ARCHITECTURE.md §9). Les
-- assertions ci-dessous sont l'implémentation directe des tests
-- "absolument indispensables" listés dans la demande initiale (§24) :
--   1. Un utilisateur du cabinet A ne peut jamais lire une donnée du cabinet B.
--   2. Un collaborateur sans accès au dossier X ne peut jamais consulter X.
--
-- Comment l'exécuter (une fois un projet Supabase connecté) :
--   psql "$DATABASE_URL" -f supabase/tests/tenant_isolation.sql
-- ou via l'interface SQL du tableau de bord Supabase (Dashboard → SQL
-- Editor), en collant le contenu du fichier.
--
-- Tout est enveloppé dans une transaction annulée à la fin (ROLLBACK) :
-- ce script ne laisse JAMAIS de données de test dans une base réelle,
-- qu'il réussisse ou échoue.
--
-- Principe technique : auth.uid() lit request.jwt.claims (défini par
-- Supabase à partir du token JWT réel d'une requête HTTP authentifiée).
-- En SQL direct, on simule un utilisateur précis avec :
--   select set_config('request.jwt.claims', json_build_object('sub', '<uuid>')::text, true);
--   set local role authenticated;
-- C'est le mécanisme standard documenté par Supabase pour tester des
-- politiques RLS sans passer par une vraie requête HTTP.

begin;

-- ── Fixtures : deux cabinets, deux utilisateurs, un dossier chacun ──────
do $$
declare
  org_a uuid;
  org_b uuid;
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  dossier_a uuid;
  dossier_b uuid;
  visible_count int;
begin
  -- Création des fixtures avec les privilèges du rôle d'exécution (postgres/service_role) —
  -- cette partie contourne volontairement la RLS, c'est le rôle normal d'un contexte
  -- d'administration pour PRÉPARER un scénario de test, jamais pour le vérifier.
  insert into organizations (id, name) values (gen_random_uuid(), 'Cabinet A — Test isolation') returning id into org_a;
  insert into organizations (id, name) values (gen_random_uuid(), 'Cabinet B — Test isolation') returning id into org_b;

  insert into organization_members (organization_id, user_id, email, role, status)
  values (org_a, user_a, 'user-a@test.invalid', 'admin', 'active');
  insert into organization_members (organization_id, user_id, email, role, status)
  values (org_b, user_b, 'user-b@test.invalid', 'admin', 'active');

  insert into dossiers (id, organization_id, name) values (gen_random_uuid(), org_a, 'Dossier confidentiel A') returning id into dossier_a;
  insert into dossiers (id, organization_id, name) values (gen_random_uuid(), org_b, 'Dossier confidentiel B') returning id into dossier_b;

  insert into mappings (dossier_id, organization_id, kind, structure)
  values (dossier_a, org_a, 'cr', '{"secret": "donnee-cabinet-A"}'::jsonb);
  insert into mappings (dossier_id, organization_id, kind, structure)
  values (dossier_b, org_b, 'cr', '{"secret": "donnee-cabinet-B"}'::jsonb);

  -- ── TEST 1 : l'utilisateur A ne voit QUE le cabinet A (jamais le cabinet B) ──
  perform set_config('request.jwt.claims', json_build_object('sub', user_a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into visible_count from organizations where id = org_b;
  if visible_count > 0 then
    raise exception 'FAIL (TEST 1) : l''utilisateur du cabinet A peut voir le cabinet B — FUITE MULTI-TENANT CRITIQUE';
  end if;

  select count(*) into visible_count from organizations where id = org_a;
  if visible_count != 1 then
    raise exception 'FAIL (TEST 1bis) : l''utilisateur du cabinet A ne voit pas son propre cabinet (faux positif à corriger)';
  end if;

  -- ── TEST 2 : l'utilisateur A ne voit JAMAIS le dossier du cabinet B ──────
  select count(*) into visible_count from dossiers where id = dossier_b;
  if visible_count > 0 then
    raise exception 'FAIL (TEST 2) : l''utilisateur du cabinet A peut voir le dossier du cabinet B — FUITE MULTI-TENANT CRITIQUE';
  end if;

  -- ── TEST 3 : l'utilisateur A ne voit JAMAIS le mapping (données métier) du cabinet B ──
  select count(*) into visible_count from mappings where dossier_id = dossier_b;
  if visible_count > 0 then
    raise exception 'FAIL (TEST 3) : l''utilisateur du cabinet A peut lire le mapping du cabinet B — FUITE MULTI-TENANT CRITIQUE (donnée métier)';
  end if;

  -- ── TEST 4 : l'utilisateur A ne peut pas écrire dans le dossier du cabinet B ──
  begin
    insert into mappings (dossier_id, organization_id, kind, structure)
    values (dossier_b, org_b, 'bilan', '{"tentative": "ecriture-malveillante"}'::jsonb);
    raise exception 'FAIL (TEST 4) : l''utilisateur du cabinet A a pu ÉCRIRE dans le dossier du cabinet B — FUITE MULTI-TENANT CRITIQUE (écriture)';
  exception
    when insufficient_privilege then null; -- attendu : la RLS bloque l'insertion
  end;

  -- ── TEST 5 : collaborateur SANS accès explicite à un dossier de SON PROPRE cabinet ──
  -- (un dossier n'est pas automatiquement visible par tous les membres d'un
  -- cabinet — seuls les admins ont un accès implicite, cf. has_dossier_access())
  declare
    org_c uuid;
    user_c_admin uuid := gen_random_uuid();
    user_c_collab uuid := gen_random_uuid();
    dossier_c uuid;
  begin
    reset role; -- repasse en contexte admin pour préparer la fixture suivante
    insert into organizations (id, name) values (gen_random_uuid(), 'Cabinet C — Test permissions dossier') returning id into org_c;
    insert into organization_members (organization_id, user_id, email, role, status)
    values (org_c, user_c_admin, 'admin-c@test.invalid', 'admin', 'active');
    insert into organization_members (organization_id, user_id, email, role, status)
    values (org_c, user_c_collab, 'collab-c@test.invalid', 'collaborator', 'active');
    insert into dossiers (id, organization_id, name) values (gen_random_uuid(), org_c, 'Dossier sans accès collaborateur') returning id into dossier_c;
    -- Volontairement : aucune ligne dossier_permissions créée pour user_c_collab.

    perform set_config('request.jwt.claims', json_build_object('sub', user_c_collab::text, 'role', 'authenticated')::text, true);
    set local role authenticated;

    select count(*) into visible_count from dossiers where id = dossier_c;
    if visible_count > 0 then
      raise exception 'FAIL (TEST 5) : un collaborateur sans accès explicite voit un dossier de son propre cabinet — la permission par dossier n''est pas respectée (§8 de la demande)';
    end if;
  end;

  raise notice '✓ TOUS LES TESTS D''ISOLATION MULTI-TENANT SONT PASSÉS';
end $$;

rollback; -- annule systématiquement les fixtures de test, succès ou échec
