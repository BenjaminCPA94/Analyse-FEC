# RB Partners CRM — V27 (serveur + Pennylane)

Le CRM V26 était un fichier HTML seul : ses données restaient dans le navigateur. Il appelait aussi un serveur (`/api/login`, `/api/state`, `/api/company`) qui n'avait jamais été livré, et les écrans Pennylane étaient simulés.

La V27 fournit ce serveur et branche Pennylane pour de vrai, en **lecture seule** :

| Écran du CRM | Donnée Pennylane | Origine |
|---|---|---|
| Contrôle honoraires, Facturation | Factures clients émises par le cabinet (HT, avoirs déduits, brouillons exclus, restant dû) | Pennylane **du cabinet** |
| Clôture & Bilan | Balance N et N-1 de l'exercice du client, puis contrôles automatiques (voir plus bas) | **Dossier client** |
| Juridique annuel / AGO | Résultat, chiffre d'affaires, total bilan, report à nouveau | **Dossier client** |
| Préparation mensuelle | Balance cumulée à fin de mois et comparatif N-1 | **Dossier client** |

Aucune écriture n'est envoyée dans Pennylane. Les clés API restent sur le serveur : le navigateur ne les voit jamais.

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

1. **Facturation du cabinet.** Dans la société RB Partners sur Pennylane, ouvre **Paramètres › Connectivité › Développeurs** et génère un jeton en lecture seule (factures clients et clients). Colle-le dans `PENNYLANE_CABINET_TOKEN`.
2. **Dossiers clients.** Deux options, qu'on peut combiner :
   - un jeton **API cabinet** dans `PENNYLANE_FIRM_TOKEN`, qui donne accès à tout le portefeuille ;
   - un jeton **par dossier**, collé dans le CRM (bouton « Jeton », réservé aux administrateurs). Pennylane le vérifie avant qu'il soit enregistré dans `data/`.
3. Redémarre le serveur. Dans **Automatisations cabinet › Pennylane**, procède dans cet ordre :
   - **Tester la connexion** ;
   - **Rapprocher les clients facturés** et **Rapprocher les dossiers du cabinet**. Le rapprochement se fait par SIREN, puis par raison sociale, et chaque ligne reste modifiable à la main ;
   - **Synchroniser les factures**. Les factures sans fiche CRM correspondante sont listées pour que tu puisses les rattacher.

> Les adresses de l'API v2 et de l'API cabinet sont réglables dans `.env`. Si **Tester la connexion** renvoie une erreur 404 sur l'API cabinet, vérifie l'adresse indiquée dans la documentation Pennylane de ton compte.

## Contrôles de clôture calculés sur la balance réelle

- balance déséquilibrée ;
- comptes d'attente (47) non soldés ;
- 401 débiteur ou 411 créditeur ;
- variations N/N-1 d'au moins 1 000 € et 30 % ;
- banque créditrice ;
- compte courant d'associé débiteur ;
- 120 ou 129 non affectés ;
- stock créditeur ;
- immobilisations sans amortissement ;
- aucune FNP (408) ;
- capital comptable différent de la fiche SIREN ;
- pièces manquantes de la collecte.

Le CRM ne propose **aucune OD inventée**. Le cut-off, les provisions et le résultat fiscal restent à réviser sur pièces.

## Mise en production

- Héberge le serveur derrière HTTPS (Caddy, Nginx, ou un PaaS avec disque persistant) et règle `COOKIE_SECURE=true`.
- Toutes les données sont dans `crm/data/` : `state.json`, les 30 dernières versions dans `history/`, `users.json` et les jetons par dossier. **Sauvegarde ce dossier**, et ne le commite jamais (il est dans `.gitignore`).
- Si deux personnes modifient les données en même temps, le serveur refuse l'enregistrement le plus ancien (erreur 409). Le CRM propose alors de recharger, sans rien perdre.

## Tests

```bash
npm i -g playwright   # une seule fois
node test/e2e.js
```

Le test démarre le serveur avec un faux Pennylane (`test/mock-pennylane.js`) et un vrai navigateur. Il vérifie la connexion, la synchronisation des factures, le rapprochement des clients, la clôture, le juridique, la revue mensuelle, les jetons, les conflits de version et la persistance après redémarrage.

## Structure

```
crm/
  server.js               serveur HTTP (comptes, base partagée, SIREN, pont Pennylane)
  src/crm_v26.html        CRM V26 d'origine, non modifié
  src/v27_pennylane.js    module V27, injecté au démarrage du serveur
  test/                   faux Pennylane + test de bout en bout
```
