// ═══════════════════════════════════════════════════════════════════════
// invite-collaborator — Edge Function (Deno, exécutée côté serveur uniquement)
// ═══════════════════════════════════════════════════════════════════════
// Implémente le parcours d'invitation décrit en demande §15/§17 :
//   1. L'administrateur appelle cette fonction avec { organizationId, email, role }.
//   2. La fonction vérifie que l'appelant est bien authentifié ET admin
//      de CE cabinet précis (jamais de confiance dans un rôle envoyé par
//      le client — cf. demande §34 : "ne jamais faire confiance à un
//      organization_id/user_id envoyé par le frontend sans validation
//      serveur", et §35 : "ne jamais utiliser un simple champ role dans
//      le navigateur comme contrôle de sécurité").
//   3. Elle crée/complète la ligne organization_members (status='invited').
//   4. Elle déclenche l'email d'invitation Supabase Auth (admin.inviteUserByEmail).
//   5. Elle journalise l'action (audit_logs).
//
// Pourquoi une Edge Function et pas un appel direct depuis le navigateur :
// l'envoi d'un email d'invitation Supabase Auth nécessite la clé
// `service_role` (droits d'administration complets sur le projet). Cette
// clé ne doit JAMAIS être exposée au navigateur (§25/§35) — elle ne peut
// donc vivre que dans un environnement serveur, ici une Edge Function.
// SUPABASE_SERVICE_ROLE_KEY est lue depuis les secrets de la fonction
// (jamais commitée dans ce dépôt) : cf. SETUP_SUPABASE.md pour son
// déploiement.
//
// État de ce fichier : écrit et relu attentivement, mais NON EXÉCUTÉ ni
// déployé — cet environnement de développement n'a pas accès à un runtime
// Deno ni à un projet Supabase réel pour le tester en conditions réelles.
// À vérifier en environnement de développement Supabase local
// (`supabase functions serve`) avant toute mise en production.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_ROLES = ['admin', 'manager', 'collaborator', 'read_only'] as const;
type OrganizationRole = (typeof ALLOWED_ROLES)[number];

interface InviteRequestBody {
  organizationId: string;
  email: string;
  role: OrganizationRole;
  /** Dossiers auxquels donner immédiatement accès (optionnel, cf. §15 étape 4). */
  dossierIds?: string[];
  dossierPermissionLevel?: 'read' | 'write' | 'manage';
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Méthode non autorisée' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Authentification requise' }, 401);
  }

  let body: InviteRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Corps de requête JSON invalide' }, 400);
  }

  const { organizationId, email, role, dossierIds, dossierPermissionLevel } = body;
  if (!organizationId || !email || !role) {
    return jsonResponse({ error: 'organizationId, email et role sont obligatoires' }, 400);
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return jsonResponse({ error: `Rôle invalide : ${role}` }, 400);
  }

  // Client "utilisateur" : n'utilise que le JWT de l'appelant, soumis à la
  // RLS normale — sert UNIQUEMENT à vérifier qui appelle et avec quels droits.
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Session invalide ou expirée' }, 401);
  }
  const callerId = userData.user.id;

  // Vérification d'autorisation côté serveur, jamais déléguée au client :
  // l'appelant doit être admin ACTIF de CE cabinet précis.
  const { data: isAdmin, error: adminCheckError } = await userClient.rpc('is_admin_of', {
    target_org: organizationId,
  });
  if (adminCheckError || !isAdmin) {
    return jsonResponse({ error: 'Accès refusé : vous devez être administrateur de ce cabinet' }, 403);
  }

  // À partir d'ici uniquement : client "admin", avec la clé service_role,
  // pour les opérations que la RLS interdit légitimement à un utilisateur
  // normal (écrire l'appartenance d'un tiers, déclencher un email
  // d'invitation Supabase Auth). Cette clé ne quitte jamais ce processus
  // serveur.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(); // 7 jours

  const { data: membership, error: membershipError } = await adminClient
    .from('organization_members')
    .upsert(
      {
        organization_id: organizationId,
        email,
        role,
        status: 'invited',
        invited_by: callerId,
        invitation_expires_at: invitationExpiresAt,
      },
      { onConflict: 'organization_id,email' },
    )
    .select()
    .single();

  if (membershipError) {
    return jsonResponse({ error: `Échec de création de l'invitation : ${membershipError.message}` }, 500);
  }

  // Attribution immédiate de dossiers (§15 étape 4 / §18) — appliquée dès
  // maintenant même si l'utilisateur n'a pas encore accepté : la ligne
  // dossier_permissions référence l'email via une étape ultérieure de
  // résolution côté application une fois le compte créé, ou directement
  // user_id si l'invité a déjà un compte auth.users existant.
  if (dossierIds?.length) {
    const { data: existingAuthUser } = await adminClient.auth.admin.listUsers();
    const matchingUser = existingAuthUser?.users?.find((u) => u.email === email);
    if (matchingUser) {
      const rows = dossierIds.map((dossierId) => ({
        organization_id: organizationId,
        dossier_id: dossierId,
        user_id: matchingUser.id,
        permission_level: dossierPermissionLevel ?? 'read',
        created_by: callerId,
      }));
      await adminClient.from('dossier_permissions').upsert(rows, { onConflict: 'dossier_id,user_id' });
    }
    // Si l'utilisateur n'a pas encore de compte, l'attribution de dossiers
    // devra être rejouée à l'acceptation de l'invitation (trigger ou appel
    // applicatif dédié — non implémenté dans cette première version,
    // volontairement signalé plutôt que fait à moitié en silence).
  }

  // Déclenche l'email d'invitation Supabase Auth (crée le compte auth.users
  // en état "invité" si besoin, ou renvoie l'email si le compte existe déjà
  // sans mot de passe défini).
  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { organization_id: organizationId, invited_role: role },
  });
  if (inviteError) {
    return jsonResponse(
      { error: `Membre créé mais l'email d'invitation a échoué : ${inviteError.message}`, membership },
      207, // succès partiel : la ligne organization_members existe, l'email n'est pas parti
    );
  }

  await adminClient.from('audit_logs').insert({
    organization_id: organizationId,
    user_id: callerId,
    action: 'invite_user',
    entity_type: 'organization_member',
    entity_id: membership.id,
    metadata: { invited_email: email, role },
  });

  return jsonResponse({ success: true, membership });
});
