# RB Partners CRM — V27 (serveur + Pennylane)

Le CRM V26 était un fichier HTML seul : ses données restaient dans le navigateur. Il appelait aussi un serveur (`/api/login`, `/api/state`, `/api/company`) qui n'avait jamais été livré, et les écrans Pennylane étaient simulés.

La V27 fournit ce serveur. Le CRM **pilote** le cabinet ; la production comptable (saisie des factures, rapprochement bancaire, lettrage) relève d'un outil de production séparé.

| Écran | Ce qui est automatique |
|---|---|
| Clôture & Bilan | Les dossiers de chaque exercice sont générés à partir des missions (« comptes annuels », « juridique »). Les échéances sont calculées : liasse, AGO dans les 6 mois, dépôt au greffe. Les retards remontent dans le tableau de bord et dans « À traiter aujourd'hui ». Le juridique se débloque quand le bilan est validé. Un travail terminé sans facture Pennylane correspondante est signalé. |
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

## Mise en service du suivi Clôture & Bilan

Ouvre l'exercice passé (par exemple 2024) et clique sur **Reprise d'historique** : les dossiers déjà traités avant le CRM sont marqués terminés. Les alertes portent ensuite sur les exercices N-1 et N.

## Mise en production

- Héberge le serveur derrière HTTPS (Caddy, Nginx, ou un PaaS avec disque persistant) et règle `COOKIE_SECURE=true`.
- Toutes les données sont dans `crm/data/` : `state.json`, les 30 dernières versions dans `history/` et `users.json`. **Sauvegarde ce dossier**, et ne le commite jamais (il est dans `.gitignore`).
- Si deux personnes modifient les données en même temps, le serveur refuse l'enregistrement le plus ancien (erreur 409). Le CRM propose alors de recharger, sans rien perdre.

## Tests

```bash
npm i -g playwright   # une seule fois
node test/e2e.js
```

Le test démarre le serveur avec un faux Pennylane (`test/mock-pennylane.js`) et un vrai navigateur. Il vérifie la connexion, la synchronisation automatique, le rapprochement des clients et des dossiers, le suivi Clôture & Bilan (échéances, retards, facturation, reprise d'historique), les conflits de version et la persistance après redémarrage.

## Structure

```
crm/
  server.js               serveur HTTP (comptes, base partagée, SIREN, pont Pennylane)
  src/crm_v26.html        CRM V26 d'origine, non modifié
  src/v27_pennylane.js    module Pennylane (factures, dossiers, synchro automatique)
  src/v27_suivi.js        suivi Clôture & Bilan par exercice
  test/                   faux Pennylane + test de bout en bout
```
