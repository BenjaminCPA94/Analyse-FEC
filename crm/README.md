# RB Partners CRM — V27 (serveur + Pennylane)

Le CRM V26 était un fichier HTML seul : ses données restaient dans le navigateur. Il appelait aussi un serveur (`/api/login`, `/api/state`, `/api/company`) qui n'avait jamais été livré, et les écrans Pennylane étaient simulés.

La V27 fournit ce serveur. Le CRM **pilote** le cabinet ; la production comptable (saisie des factures, rapprochement bancaire, lettrage) relève d'un outil de production séparé.

| Écran | Ce qui est automatique |
|---|---|
| Prospects | La recherche par SIREN interroge l'annuaire officiel des entreprises (gratuit). Le capital social vient de Pappers si `PAPPERS_API_KEY` est configurée. Les missions et honoraires proposés sont saisis sur le prospect et enregistrés au fil de la saisie. À la validation, ils sont repris sur la fiche client et le client passe en onboarding. |
| Onboarding | Liste des dossiers : un clic déroule les 14 étapes (LDM, lettre de reprise, Pennylane, prélèvement, impots.gouv, LAB…), dont certaines se cochent seules. La **lettre de reprise** au confrère précédent est pré-remplie, avec aperçu, Word et impression ; l'étape se coche quand elle est envoyée. C'est toi qui valides l'onboarding : le dossier passe alors dans « Onboarding validé » et le client devient actif. |
| Fiscalité | « Tableau principal » des régimes par client (TVA et date, DEB/DES, taxe sur les salaires, acomptes d'IS, CFE, CVAE, TVS, IFU, CRL, taxe foncière), puis un onglet par mois et un onglet « Annuelle ». Les déclarations de chaque mois sont calculées à partir des régimes : il n'y a rien à recréer d'une année sur l'autre. L'export Excel s'importe tel quel. |
| Travaux exceptionnels | Tableau « Autres travaux » par exercice (client, associé, réalisé et revu par, date, description, typologie, deadline, honoraires prévus, temps estimé, statut). Un travail terminé passe automatiquement en « Lancer facturation : Oui » puis dans Facturation ; la facture Pennylane correspondante est reconnue toute seule. L'export Excel s'importe tel quel. |
| Facturation | « À facturer » est rempli automatiquement : bilans et AGO terminés, travaux exceptionnels terminés, écarts d'honoraires courants. Une ligne disparaît dès que la facture est trouvée dans Pennylane ou marquée facturée. Factures émises : montants, encaissements et retards. |
| Tableau de bord cabinet | Calculé en temps réel, sans aucun chiffre de démonstration : clients, onboarding, prospects, honoraires, facturé, à facturer, encaissements, avancement des bilans, des AGO et de la fiscalité du mois, liste des retards. |
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

## Autre hébergement (serveur classique)

- Héberge le serveur derrière HTTPS (Caddy, Nginx, ou un PaaS avec disque persistant) et règle `COOKIE_SECURE=true`.
- Toutes les données sont dans `crm/data/` : `state.json`, les 30 dernières versions dans `history/` et `users.json`. **Sauvegarde ce dossier**, et ne le commite jamais (il est dans `.gitignore`).
- Si deux personnes modifient les données en même temps, le serveur refuse l'enregistrement le plus ancien (erreur 409). Le CRM propose alors de recharger, sans rien perdre.

## Tests

```bash
npm i -g playwright   # une seule fois
npm test   # fichiers, puis Upstash simulé, puis point d'entrée Vercel
```

Le test démarre le serveur avec un faux Pennylane (`test/mock-pennylane.js`) et un vrai navigateur. Il vérifie la connexion, la synchronisation automatique, le rapprochement des clients et des dossiers, les tableaux Bilan et AGO (import Excel avec des fichiers fictifs, échéances, retards, facturation, saisie directe, export), les conflits de version et la persistance après redémarrage.

## Structure

```
crm/
  lib/app.js              cœur du serveur (comptes, base partagée, SIREN, pont Pennylane)
  server.js               serveur local + commandes add-user / list-users
  api/index.js, vercel.json   déploiement Vercel
  src/crm_v26.html        CRM V26 d'origine, non modifié
  src/v27_pennylane.js    module Pennylane (factures, dossiers, synchro automatique)
  src/v27_boards.js       tableaux Bilan Fr et AGO (modèle des suivis Excel)
  src/v27_portfolio.js    Portefeuille, Onboarding, prospects reliés, navigation
  src/v27_fiscal.js       Fiscalité : régimes et échéances mensuelles
  src/v27_reprise.js      lettre de reprise (aperçu, Word, impression)
  src/v27_cabinet.js      Travaux exceptionnels, Facturation, Tableau de bord
  src/v27_team.js         équipe, temps, rentabilité, charge, fiche client, recherche
  src/v27_style.js        style épuré, défilement conservé
  test/                   faux Pennylane + test de bout en bout
```
