-- ═══════════════════════════════════════════════════════════════════════
-- 0007 — Stockage privé des fichiers FEC (Supabase Storage)
-- ═══════════════════════════════════════════════════════════════════════
-- Implémente la demande §13 : les FEC ne sont jamais accessibles via une
-- URL publique permanente. Bucket créé PRIVÉ (public = false) — tout
-- accès passe soit par les politiques ci-dessous (téléversement/lecture
-- directe authentifiée), soit par une URL signée temporaire générée côté
-- client via supabase.storage.from('fec-files').createSignedUrl(path, expiresIn)
-- après vérification applicative (cf. src/cloud/cloud.repository.js).
--
-- Convention de chemin dans le bucket :
--   {organization_id}/{dossier_id}/{exercise_id}/{fec_file_id}-{nom_original}
-- Ce découpage en dossiers permet à storage.foldername(name) (fonction
-- Supabase native) d'extraire organization_id et dossier_id directement
-- depuis le chemin, sans jointure supplémentaire dans la politique — donc
-- une vérification rapide ET correcte à chaque accès (cf. demande §13,
-- étapes 1 à 6 : authentification, cabinet, dossier, accès, permission).

insert into storage.buckets (id, name, public)
values ('fec-files', 'fec-files', false)
on conflict (id) do nothing;

create policy "fec_files_select_by_dossier_access"
on storage.objects for select
using (
  bucket_id = 'fec-files'
  and is_active_member_of((storage.foldername(name))[1]::uuid)
  and has_dossier_access((storage.foldername(name))[2]::uuid, 'read')
);

create policy "fec_files_insert_by_dossier_write_access"
on storage.objects for insert
with check (
  bucket_id = 'fec-files'
  and is_active_member_of((storage.foldername(name))[1]::uuid)
  and has_dossier_access((storage.foldername(name))[2]::uuid, 'write')
);

create policy "fec_files_delete_by_dossier_manage_access"
on storage.objects for delete
using (
  bucket_id = 'fec-files'
  and has_dossier_access((storage.foldername(name))[2]::uuid, 'manage')
);

-- Pas de politique UPDATE : un fichier FEC déjà téléversé n'est jamais
-- modifié en place (un nouvel import crée un nouvel objet + une nouvelle
-- ligne fec_files) — cohérent avec la traçabilité attendue (§12 : "import
-- d'un nouveau FEC" est un événement d'audit à part entière, jamais une
-- modification silencieuse d'un fichier existant).
