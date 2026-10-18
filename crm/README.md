# RB Partners CRM — V27 (serveur + Pennylane)

Le CRM V26 était un fichier HTML seul : ses données restaient dans le navigateur. Il appelait aussi un serveur (`/api/login`, `/api/state`, `/api/company`) qui n'avait jamais été livré, et les écrans Pennylane étaient simulés.

La V27 fournit ce serveur. Le CRM **pilote** le cabinet ; la production comptable (saisie des factures, rapprochement bancaire, lettrage) relève d'un outil de production séparé.

| Écran | Ce qui est automatique |
|---|---|
| Prospects | La recherche par SIREN interroge l'annuaire officiel des entreprises (gratuit). Le capital social vient de Pappers si `PAPPERS_API_KEY` est configurée. Les missions et honoraires proposés sont saisis sur le prospect et enregistrés au fil de la saisie. À la validation, ils sont repris sur la fiche client et le client passe en onboarding. |
| Matrice création | Modèle du tableau Monday « Matrice création » (import Excel possible). « Nouvelle création » prépare un mail avec un lien sécurisé vers un formulaire (sans compte) où le client renseigne la société, les actionnaires, les dirigeants et dépose ses justificatifs (3 Mo max par fichier). Les réponses arrivent automatiquement dans le tableau ; « Créer la fiche client » les reverse dans le portefeuille (onboarding) et crée le travail exceptionnel « Création de société », qui passe en « À facturer » quand la société est créée. |
| Onboarding | Liste des dossiers : un clic déroule les 16 étapes. Prérequis bloquants (lettre de mission signée, fiche de facturation Pennylane, honoraires **et** budget de temps, paramétrage vérifié, LAB) : sans eux, seul un associé ou un administrateur peut valider, avec une justification conservée. Lettre de mission : préparée, envoyée, signée. Pennylane : fiche de facturation, dossier de production et abonnement suivis séparément. Lettre de reprise : préparée, envoi confirmé (date, auteur), réponse reçue, pièces récupérées ; l'étape n'est terminée qu'à la récupération des pièces. |
| Fiscalité | « Tableau principal » des régimes par client (TVA et date, DEB/DES, taxe sur les salaires, acomptes d'IS, CFE, CVAE, TVS, IFU, CRL, taxe foncière), puis un onglet par mois et un onglet « Annuelle ». Les déclarations de chaque mois sont calculées à partir des régimes : il n'y a rien à recréer d'une année sur l'autre. L'export Excel s'importe tel quel. Statuts : une déclaration n'est terminée qu'une fois **déposée** (ou accusé de réception), un paiement (IS, CFE, CVAE, taxe foncière) qu'une fois **payé**. Les anciens statuts « Validé », « Envoyée », « Fait » sont regroupés dans « À vérifier », jamais comptés comme déposés. |
| Travaux exceptionnels | Tableau « Autres travaux » par exercice (client, associé, réalisé et revu par, date, description, typologie, deadline, honoraires prévus, temps estimé, statut). Un travail terminé passe automatiquement en « Lancer facturation : Oui » puis dans Facturation ; la facture Pennylane correspondante est reconnue toute seule. L'export Excel s'importe tel quel. |
| Facturation | « Prestations à facturer » : bilans, AGO et travaux exceptionnels terminés, tous exercices, avec le reste à facturer. « Déclarer une facture » (facture, acompte, solde, avoir ; une ou plusieurs missions, montant HT affecté à chacune) : information déclarée en attente de Pennylane. Les factures Pennylane ne sont jamais rattachées sur un montant voisin : les correspondances possibles vont dans « Rapprochements à valider » ; seul un numéro identique rapproche automatiquement (sans rien supprimer). Les écarts d'honoraires courants sont listés à part, à vérifier. Pas de suivi des encaissements. |
| Tableau de bord cabinet | Calculé en temps réel, sans aucun chiffre de démonstration : clients, onboarding, prospects, honoraires, facturé (HT), à facturer, avancement des bilans, des AGO et de la fiscalité du mois, liste des retards. |
| Saisie des temps, Rentabilité, Charge équipe | L'équipe est déduite des personnes saisies dans les tableaux (rôle, coût horaire, capacité et compte CRM modifiables dans Charge équipe). Les temps saisis par client et par mission alimentent la rentabilité (honoraires facturés ou budget, coût du temps, marge, budget d'heures) et la charge de chacun : dossiers, bilans, AGO, déclarations du mois, onboardings, travaux exceptionnels, heures du mois. |
| Fiche client | Une page unique par client : synthèse (identité, équipe, régimes, missions, honoraires), onboarding, échéances fiscales, bilan et AGO, travaux exceptionnels, factures, temps et historique des actions. |
| Portefeuille clients | Une ligne par client, sur le modèle de l'export Excel : personnes, SIREN, statut, groupe, clôture, régimes, missions, LDM, honoraires, budget, état du bilan et de l'AGO. Ces données sont saisies une seule fois et alimentent la fiscalité (échéances recalculées), les tableaux Bilan et AGO et le contrôle des honoraires. |
| Clôture & Bilan, Juridique annuel / AGO | Deux tableaux par exercice qui reprennent les suivis Excel du cabinet (« Bilan Fr », « AGO ») : mêmes colonnes et mêmes statuts colorés, dossiers groupés par avancement, cases modifiables directement. Les fichiers Excel s'importent tels quels et le tableau s'exporte en CSV. Automatiquement : échéances calculées (liasse, AGO, dépôt au greffe), retards remontés dans le tableau de bord, colonne « Bilan » reprise dans l'AGO, « Lancer facturation » positionné quand un dossier est terminé, acomptes d'IS proposés, facture vérifiée dans Pennylane. |
| Contrôle honoraires, Facturation | Les factures clients du cabinet sont lues dans Pennylane (HT, avoirs déduits, brouillons exclus, restant dû). Elles sont rapprochées des fiches par SIREN puis par raison sociale, à chaque ouverture du CRM (toutes les 6 h au plus). |
| Fiche client | Lien direct vers le dossier Pennylane, rattaché automatiquement. |

Pennylane est lu, jamais modifié. Les clés API restent sur le serveur.

## Installation

Il faut Node.js 18 ou plus récent. Aucune autre dépendance n'est nécessaire.

```bash
cd crm
cp .env.example .env          # puis renseigner les jetons Pennylane
node server.js add-user benjamin --admin   # demande un mot de passe (12 caractères min.)
node server.js add-user collaborateur      # autres comptes
node server.js                 # http://localhost:8080
```

Au premier lancement, la base est vide. Pour reprendre les données du CRM V26, ouvre l'ancien fichier HTML et clique sur **Sauvegarder** pour exporter un JSON. Dans la V27, va dans **Automatisations cabinet**, puis **Restaurer un export**.

## Brancher Pennylane

1. **Factures du cabinet.** Dans la société qui émet tes honoraires sur Pennylane, ouvre **Paramètres › Connectivité › Développeurs** et génère un jeton en lecture seule (factures clients et clients). Colle-le dans `PENNYLANE_CABINET_TOKEN`.
2. **Liste des dossiers (optionnel).** Ajoute un jeton API cabinet dans `PENNYLANE_FIRM_TOKEN` : il sert aux liens directs vers chaque dossier.
3. Redémarre le serveur. Ensuite, tout est automatique. **Automatisations cabinet › Pennylane** permet de tester la connexion, de forcer une synchronisation et de corriger un rattachement.

> Si **Tester la connexion** renvoie une erreur 404 sur l'API cabinet, vérifie son adresse dans la documentation Pennylane de ton compte : elle est réglable dans `.env`.

## Mise en service des tableaux Bilan et AGO

Commence par **Portefeuille clients › Importer un Excel** (l'export du portefeuille, avec ses étapes d'onboarding). Ensuite, dans **Clôture & Bilan**, clique sur **Importer un Excel** et choisis l'export du tableau Bilan (par exemple `Bilan_Fr_2025.xlsx`). Fais de même dans **Juridique annuel / AGO** avec l'export AGO.

L'exercice est lu dans le titre du fichier. Les clients sont rapprochés par SIREN, puis par nom ; ceux qui manquent sont créés. Tu peux réimporter un fichier à jour à tout moment : ses valeurs remplacent celles de l'exercice.

## Mettre le CRM en ligne avec Vercel

Le CRM tourne sur Vercel avec une base **Upstash Redis**, que Vercel installe en quelques clics. Il n'y a rien à installer sur ton ordinateur.

> Le plan gratuit de Vercel (Hobby) est réservé à un usage personnel et non commercial. Pour le cabinet, il faut le plan **Pro** (environ 20 $ par mois et par membre). Upstash est gratuit à ce volume.

1. **Mets le code sur la branche principale.** Fusionne la branche du CRM dans `main` sur GitHub. Vercel publie `main`.
2. **Crée le projet.** Sur [vercel.com](https://vercel.com), choisis **Continue with GitHub**, puis **Add New… › Project**. Importe le dépôt `Analyse-FEC` (autorise Vercel à y accéder si on te le demande).
3. **Règle l'import.** Ne clique pas encore sur Deploy :
   - **Root Directory** : clique sur *Edit* et choisis `crm` ;
   - **Framework Preset** : `Other` ;
   - **Environment Variables** : ajoute
     - `ADMIN_USERNAME` : ton identifiant, par exemple `benjamin` ;
     - `ADMIN_PASSWORD` : un mot de passe d'au moins 12 caractères ;
     - `PENNYLANE_CABINET_TOKEN` : le jeton Pennylane de la société qui facture tes honoraires ;
     - `PENNYLANE_FIRM_TOKEN` (optionnel) : le jeton de l'API cabinet.
4. Clique sur **Deploy**. La page affichera « configuration incomplète » : c'est normal, la base n'existe pas encore.
5. **Crée la base.** Dans le projet, onglet **Storage › Create Database**, choisis **Upstash for Redis**, plan gratuit, région **Frankfurt (eu-central-1)** pour garder les données en Europe. Valide **Connect to project**. Vercel ajoute lui-même `KV_REST_API_URL` et `KV_REST_API_TOKEN`.
6. Onglet **Deployments** : sur le dernier déploiement, ouvre le menu **⋯ › Redeploy**.
7. **Ouvre l'adresse** `https://<projet>.vercel.app` et connecte-toi avec `ADMIN_USERNAME` et `ADMIN_PASSWORD`. Le compte administrateur est créé à cette première connexion.
8. **Sécurise le compte :**
   - supprime la variable `ADMIN_PASSWORD` dans **Settings › Environment Variables** (elle ne sert plus) ;
   - dans le CRM, va dans **Automatisations cabinet › Comptes d'accès** pour changer ton mot de passe et créer les comptes des collaborateurs ;
   - toujours dans Automatisations cabinet, clique sur **Tester la connexion** Pennylane.
9. **Pour reprendre tes données V26** : ouvre l'ancien fichier, exporte-les avec **Sauvegarder**, puis dans le CRM en ligne, va dans **Automatisations cabinet** et clique sur **Restaurer un export**.
10. (Optionnel) Pour une adresse à ton nom, comme `crm.rbpartners.fr`, ajoute ton domaine dans **Settings › Domains**.

Chaque modification poussée sur `main` est publiée automatiquement par Vercel.

Bon à savoir :
- Les fonctions s'exécutent à Paris (`cdg1`, réglé dans `vercel.json`).
- Vercel limite une requête à 4,5 Mo. La base entière est enregistrée en une fois, ce qui laisse de la marge pour plusieurs centaines de dossiers. Au-delà, il faudra passer à une vraie base de données.
- Upstash conserve les 30 dernières versions des données (`rb:history`).
- Variables facultatives (lot 1) :
  - `CRON_SECRET` : secret de la sauvegarde quotidienne (tâche planifiée `/api/cron/backup`, 2 h 30 UTC, déclarée dans `vercel.json`). Sans cette variable, la sauvegarde automatique est refusée ; l'export manuel reste disponible.
  - `CREATION_LINK_DAYS` (60 par défaut) : durée de validité d'un lien de formulaire de création.
  - `CREATION_RETENTION_DAYS` (0 = conservés) : délai d'effacement des justificatifs après clôture ou révocation du dossier.
  - `MAX_STATE_KB` (3500 par défaut) : taille maximale acceptée pour l'ensemble des données.

## Rôles et droits (appliqués par le serveur)

| Rôle | Peut |
|---|---|
| Collaborateur | Consulter et mettre à jour les dossiers, saisir et supprimer ses propres temps. Ne peut pas supprimer, importer en masse, modifier honoraires, budgets et missions, voir les coûts horaires, ni valider un onboarding par exception. |
| Manager | En plus : imports, honoraires, budgets et missions. |
| Associé | En plus : suppressions, paramètres du cabinet et de l'équipe, coûts et rentabilité, validations exceptionnelles, journal serveur. |
| Administrateur | Tout, dont les comptes, les rôles, la révocation des sessions, les sauvegardes et la restauration. |

Les anciens comptes « utilisateur » deviennent **collaborateur** : l'administrateur ajuste les rôles dans **Automatisations cabinet › Comptes d'accès**. Toute opération sensible est inscrite dans le journal serveur avec l'auteur réel de la session.

## Autre hébergement (serveur classique)

- Héberge le serveur derrière HTTPS (Caddy, Nginx, ou un PaaS avec disque persistant) et règle `COOKIE_SECURE=true`.
- Toutes les données sont dans `crm/data/` : `state.json`, les 30 dernières versions dans `history/` et `users.json`. **Sauvegarde ce dossier**, et ne le commite jamais (il est dans `.gitignore`).
- Si deux personnes enregistrent en même temps, le serveur n'accepte qu'une écriture par version (contrôle atomique). Le CRM fusionne alors élément par élément ; si le même champ a été modifié des deux côtés, il garde la version du serveur, affiche l'écart et permet de reprendre sa valeur. La version locale complète reste en brouillon sur le poste.

## Tests

```bash
npm i -g playwright   # une seule fois
npm test   # parcours complets (fichiers, Redis), acceptation lot 1 (fichiers, Redis réel, Redis sans scripts Lua), point d'entrée Vercel
```

Si `redis-server` est installé, les tests « Redis » l'utilisent réellement (le script Lua d'enregistrement atomique est exécuté) ; sinon ils utilisent un faux Upstash, qui vérifie le repli sur verrou. `test/lot1.js` couvre les tests d'acceptation du lot 1 (voir `docs/LOT1.md`).

Le test démarre le serveur avec un faux Pennylane (`test/mock-pennylane.js`) et un vrai navigateur. Il vérifie la connexion, la synchronisation automatique, le rapprochement des clients et des dossiers, les tableaux Bilan et AGO (import Excel avec des fichiers fictifs, échéances, retards, facturation, saisie directe, export), les conflits de version et la persistance après redémarrage.

## Structure

```
crm/
  lib/app.js              cœur du serveur (comptes, base partagée, SIREN, pont Pennylane, sauvegardes)
  lib/guard.js            contrôles serveur : intégrité, droits par rôle, journal des modifications
  server.js               serveur local + commandes add-user / list-users
  api/index.js, vercel.json   déploiement Vercel
  src/crm_v26.html        CRM V26 d'origine, non modifié
  src/v27_pennylane.js    module Pennylane (factures, dossiers, synchro automatique)
  src/v27_boards.js       tableaux Bilan Fr et AGO (modèle des suivis Excel)
  src/v27_portfolio.js    Portefeuille, Onboarding, prospects reliés, navigation
  src/v27_fiscal.js       Fiscalité : régimes et échéances mensuelles
  src/v27_reprise.js      lettre de reprise (aperçu, Word, impression)
  src/v27_cabinet.js      Travaux exceptionnels, Tableau de bord
  src/v27_billing.js      Facturation : affectations, rapprochements à valider, acomptes/soldes/avoirs
  src/v27_team.js         équipe, temps, rentabilité, charge, fiche client, recherche
  src/creation_fields.js  questions du formulaire de création (partagées CRM / formulaire)
  src/v27_creation.js     Matrice création (liens, réponses, fiche client)
  src/creation_form.html  formulaire public envoyé au client (/creation/<lien>)
  src/v27_sync.js         enregistrement : fusion en cas de conflit, brouillon, comptes et rôles, journal, sauvegardes
  src/v27_style.js        style épuré, défilement conservé
  test/                   faux Pennylane + test de bout en bout
```
