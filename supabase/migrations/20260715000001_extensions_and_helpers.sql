-- ═══════════════════════════════════════════════════════════════════════
-- 0001 — Extensions et fonctions utilitaires génériques
-- ═══════════════════════════════════════════════════════════════════════
-- Réutilisées par toutes les migrations suivantes. Rien de spécifique au
-- métier ici — uniquement de l'outillage (gen_random_uuid, trigger
-- updated_at générique).

create extension if not exists pgcrypto;

-- set_updated_at() — trigger générique réutilisé par toutes les tables
-- métier possédant une colonne updated_at (cf. AUDIT §20 : chaque table
-- métier a au minimum id/organization_id/created_at/updated_at/created_by/
-- updated_by).
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function set_updated_at() is
  'Trigger générique BEFORE UPDATE : renseigne updated_at automatiquement. Ne jamais faire confiance à une valeur updated_at envoyée par le client.';
