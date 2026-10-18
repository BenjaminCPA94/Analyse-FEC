# Lot 1 — Fiabilité et protection

Branche : `claude/confident-knuth-ly7txl`. **La production (`main`, Vercel) n'a pas été modifiée.**

## Constats vérifiés dans le code avant correction

| Hypothèse | Vérifié dans | Constat |
|---|---|---|
| « Validé » / « Envoyée » comptés comme déposés | `v27_fiscal.js`, `FISC_DONE27` | Confirmé |
| `customerId` Pennylane = fiche + abonnement faits | `v27_portfolio.js`, `onbAuto27` (étape 3) | Confirmé |
| Honoraires renseignés = étape « honoraires + temps » faite | `onbAuto27` (étape 5) | Confirmé |
| « Tableaux CRM renseignés » cochés automatiquement | `onbAuto27` (étape 6) | Confirmé |
| Validation d'onboarding sans contrôle des droits | `validateOnb27` | Confirmé (simple confirmation) |
| Mail `mailto` marqué « envoyé » | `crSend27` (`sentAt`) | Confirmé |
| Réponse client écrasant les corrections du cabinet | `pullCreation27` | Partiellement : écrasait si le client modifiait le champ |
| Lettre de reprise « envoyée » = étape terminée | `sentReprise27` | Confirmé |
| Rapprochement « au montant le plus proche » | `excInvoices27` | Confirmé |
| Rapprochement par catégorie + fenêtre de 15 mois | `plInvoice27` | Confirmé |
| Effacement d'une saisie manuelle (±1 €, ±45 j) | `dedupManual27` | Confirmé |
| Factures reconstituées depuis un ancien statut, TVA 20 % | `backfillBilled27`, `invHT27` (÷ 1,2) | Confirmé |
| À facturer limité à N-1 et N | `toBill27` | Confirmé |
| Tout compte peut lire/remplacer l'état complet | `PUT /api/state` | Confirmé (seule la structure était vérifiée) |
| Verrou Redis pouvant expirer avant l'écriture | `RedisStore.saveShared` | Confirmé (verrou 10 s, contrôle puis écriture séparés) |
| File de sauvegarde du formulaire bloquée par une erreur | `creation_form.html` (`queue.then`) | Confirmé |
| Fichiers acceptés sur le type déclaré | `/api/public/creation/file` | Confirmé |
| Liste de fichiers modifiée sans protection concurrente | idem | Confirmé |
| Erreurs 500 renvoyant le message interne | `handle()` | Confirmé |

## Changements réalisés

**Statuts et automatismes (`v27_fiscal.js`, `v27_portfolio.js`, `v27_reprise.js`, `v27_creation.js`)**
- Fiscalité :
  - les déclarations ont les statuts à faire, en préparation, en attente client, en revue, validée – à déposer, déposée, accusé de réception ;
  - les paiements (IS, CFE, CVAE, taxe foncière) ont les statuts montant validé – à payer, puis payée ;
  - une obligation n'est terminée que déposée (ou payée pour un paiement) ;
  - les anciens statuts ambigus vont dans un groupe « À vérifier », sans conversion.
- Onboarding :
  - 2 étapes ajoutées (dossier de production et abonnement Pennylane), numérotation de stockage inchangée ;
  - lettre de mission : préparée, envoyée ou signée ;
  - les honoraires sans budget de temps laissent l'étape « en cours » ;
  - l'étape « Vérifier le paramétrage du dossier » n'est jamais cochée automatiquement (indique ce qui manque) ;
  - prérequis bloquants identifiés ; la validation par exception est réservée à un associé ou un administrateur, avec justification, et contrôlée aussi par le serveur.
- Lettre de reprise : préparée, envoi confirmé (date, auteur), réponse reçue, pièces récupérées (liste). L'étape n'est terminée qu'à la récupération des pièces.
- Création :
  - « Mail préparé » est distinct de « Envoi confirmé » ;
  - statut « Contrôlé » par le cabinet ;
  - une modification du client après contrôle ou correction du cabinet va dans « Modifications à arbitrer », jamais écrasée en silence ;
  - le lien est clôturé automatiquement quand la société est créée ou le dossier abandonné.

**Facturation (`v27_billing.js`, nouveau ; section retirée de `v27_cabinet.js`)**
- Affectations explicites (facture → mission → montant HT). Une facture peut couvrir plusieurs missions ; une mission peut avoir plusieurs factures (acompte, solde, avoir).
- Reste à facturer et état « partiellement facturé ».
- Aucun rapprochement automatique sur un montant ou une fenêtre de dates : « Rapprochements à valider » (confirmer, écarter, annuler).
- Confirmation groupée uniquement pour les cas sans ambiguïté, avec aperçu.
- Numéro de facture identique : rapprochement automatique tracé ; la saisie CRM est marquée « rapprochée », jamais effacée.
- Ancien statut « facturé » sans référence : « Facturé (déclaré) », sans facture reconstituée.
- HT inconnu affiché comme tel, sans taux supposé.
- Tous les exercices sont parcourus.
- « Écarts d'honoraires à vérifier » sont séparés des « Prestations à facturer ».
- Option « Inclus au forfait » pour les travaux exceptionnels.

**Serveur (`lib/app.js`, `lib/guard.js` nouveau)**
- Rôles administrateur / associé / manager / collaborateur, appliqués par le serveur.
- Collaborateur :
  - pas de suppression (sauf ses propres temps) ;
  - pas d'import en masse ;
  - honoraires, budgets et missions non modifiables ;
  - paramètres du cabinet et de l'équipe non modifiables ;
  - coûts horaires retirés à la lecture et réinjectés à l'écriture ;
  - pas de validation exceptionnelle.
- Intégrité : identifiants valides et uniques, références aux clients, dates, montants et durées. Seules les nouvelles anomalies sont refusées, pour que les données historiques restent enregistrables.
- Auteur et date de création posés par le serveur.
- Journal serveur : connexions, refus, enregistrements avec détail par entité et valeurs avant/après utiles, comptes, liens, sauvegardes, restaurations.
- Révocation des sessions.
- Erreurs internes non détaillées au navigateur.
- Taille maximale des données contrôlée.
- Enregistrement Redis atomique par script Lua (contrôle de version et écriture en une seule opération). En cas d'échec du script, repli sur un verrou à jeton libéré seulement par son détenteur. Les comptes et formulaires sont protégés par ce même verrou.
- Sauvegardes :
  - export complet (données, comptes, liens, réponses, justificatifs sur option) ;
  - restauration avec aperçu, l'état courant restant dans l'historique ;
  - sauvegarde quotidienne planifiée (14 jours).
- Formulaire public :
  - expiration (60 jours par défaut), révocation, réactivation, prolongation, clôture ;
  - limite de fréquence par lien ;
  - type réel des fichiers vérifié (PDF, JPEG, PNG, HEIC, WEBP) ;
  - limites par fichier (3 Mo), par dossier (30 fichiers, 25 Mo) ;
  - champs et pièces obligatoires vérifiés par le serveur à l'envoi final ;
  - versions concurrentes refusées (deux onglets) ;
  - conservation paramétrable.

**Navigateur (`v27_sync.js`, nouveau ; `creation_form.html`)**
- Conflit : fusion élément par élément et champ par champ.
- Si le même champ a été modifié des deux côtés, la version du serveur est gardée, l'écart est affiché et ta valeur peut être reprise d'un clic.
- Brouillon local conservé jusqu'au traitement des écarts.
- Écrans :
  - comptes avec rôles ;
  - journal serveur ;
  - sauvegardes et restauration ;
  - rentabilité masquée sans accès aux coûts.
- Formulaire public :
  - une erreur ne bloque plus les envois suivants ;
  - nouvel essai automatique ;
  - « Enregistré » seulement après confirmation du serveur ;
  - réponses gardées sur l'appareil ;
  - lien expiré, révoqué ou clôturé expliqué.

## Migration et précautions

Aucune migration destructive : toutes les données existantes restent lisibles.

À l'arrivée en production :
1. **Rôles** : les comptes « utilisateur » deviennent « collaborateur » (le plus restreint). Les passer en manager ou associé dans Comptes d'accès.
2. **Fiscalité** : les cellules « Validé », « Envoyée » ou « Fait » apparaissent dans « À vérifier ». Les passer en « Déposée » ou « Payée » une fois vérifiées.
3. **Onboarding** : la progression baisse pour certains dossiers (nouvelles étapes, règles plus strictes). C'est voulu.
4. **Facturation** : les factures Pennylane qui étaient rattachées automatiquement arrivent dans « Rapprochements à valider ». Le bouton « Confirmer les … sans ambiguïté » traite les cas simples en une fois. Les saisies CRM existantes restent « Déclarée · en attente Pennylane ».
5. **Sauvegarde avant mise en production** : Automatisations cabinet › Sauvegardes serveur › « Télécharger une sauvegarde », et garder aussi l'export « Sauvegarder » habituel.
6. **Vercel** (facultatif) : ajouter `CRON_SECRET` (longue chaîne aléatoire) pour activer la sauvegarde quotidienne. Les autres variables sont listées dans le README.

## Retour arrière

- Code : revenir au commit précédant le lot (`git revert` du ou des commits du lot sur `main`, ou redéployer le déploiement précédent dans Vercel › Deployments › « Promote to Production »).
- Données :
  - le format reste compatible avec la version précédente (champs ajoutés seulement) ;
  - au besoin, restaurer la sauvegarde téléchargée avant la mise en production (Automatisations cabinet › Restaurer un fichier) ou une version de l'historique.
- Formulaires : les nouveaux liens portent une date d'expiration ignorée par l'ancienne version ; aucune action n'est nécessaire.

## Tests réellement exécutés

`npm test` (6 exécutions, toutes réussies) :
- parcours complets `test/e2e.js` : stockage fichiers, puis Redis réel ;
- acceptation `test/lot1.js` : stockage fichiers, Redis réel (redis-server 7, script Lua exécuté), puis faux Upstash sans EVAL (repli sur verrou) ;
- point d'entrée Vercel.

Couvert : critères d'acceptation 1, 2, 3, 4, 5, 6, 10, 11, 12, 15 et 16, injection de code par noms piégés sur tous les écrans, écriture atomique (8 enregistrements simultanés → 1 accepté).

Non testé :
- **Upstash réel** : le script Lua a été exécuté sur un vrai Redis, pas sur Upstash. En cas de refus du script par Upstash, le serveur bascule automatiquement sur le verrou, chemin testé avec le faux Upstash.
- **Tâche planifiée Vercel** : seule la route a été testée, pas la planification elle-même.

## Limites et points restant à valider

- L'enregistrement envoie encore l'état complet. Le serveur contrôle désormais ce qui change, mais le passage à des modifications par entité reste à faire (lot 2).
- Les justificatifs restent en base64 dans Redis. Un stockage documentaire privé (Vercel Blob, S3…) nécessite un compte et des accès non disponibles ici. L'intégration n'a pas été inventée.
- Une sauvegarde « avec justificatifs » peut dépasser la limite de 4,5 Mo des réponses Vercel. Dans ce cas, utiliser l'export sans justificatifs (les pièces restent téléchargeables une à une).
- La politique CSP garde `unsafe-inline` : la version d'origine utilise des gestionnaires d'événements dans le HTML. Les retirer suppose de réécrire ces écrans (lot 3).
- Les droits portent sur les types d'action, pas sur des portefeuilles de clients par collaborateur.

## État de tous les points demandés

| # | Point | État |
|---|---|---|
| 1 | Statuts et automatismes trompeurs (fiscalité, onboarding, création, reprise) | **Corrigé** |
| 2 | Facturation fiable (affectations, rapprochements à valider, acomptes/avoirs, tous exercices, forfait) | **Corrigé** ; rapprochement d'une facture Pennylane sur plusieurs missions en une fois : **Partiel** (affectation mission par mission) |
| 3 | Données et accès (rôles serveur, intégrité, journal, sessions, CSRF, erreurs, injection) | **Corrigé** ; droits par portefeuille de clients et CSP stricte : **À faire** |
| 4 | Sauvegarde et accès simultanés (atomicité, fusion, brouillon, sauvegardes, restauration) | **Corrigé** ; écriture par entité et séparation des préférences : **Partiel** (préférences protégées lors des fusions) |
| 5 | Formulaire et justificatifs | **Corrigé** ; stockage documentaire hors Redis : **À faire** (accès requis) |
| 6 | Imports et identité client (aperçu, SIREN, cellules vides…) | À faire — lot 2 |
| 7 | Navigation | À faire — lot 3 |
| 8 | Mon travail | À faire — lot 3 |
| 9 | Fiche client et ergonomie | À faire — lot 3 |
| 10 | Processus (parcours, dépendances, sortie de client) | Partiel (onboarding) — lot 4 |
| 11 | Moteur fiscal et exercices (règles versionnées, historisation) | Partiel (statuts) — lot 4 |
| 12 | Temps, rentabilité, charge (`me27`, identifiants stables…) | À faire — lot 5 |
| 13 | Fonctions utiles (pièces manquantes, relances…) | À faire — lots 3 à 5 |
| 14 | Intégrations et maintenance (Pennylane, séparation du code) | Partiel (journal, erreurs) — lots 2 à 5 |
