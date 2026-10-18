# Livraison — lots 1 à 5

Branche : `claude/confident-knuth-ly7txl`. **La production (`main`, Vercel) n'a pas été modifiée.** Détail des lots 1 et 2 : `LOT1.md`, `LOT2.md`.

## Lot 3 — Utilisation (`src/v27_work.js`)

**Constats vérifiés**
- Le menu suivait l'ordre de la maquette d'origine. La page d'accueil était un tableau de bord général, sans liste de tâches.
- Les filtres et onglets étaient enregistrés dans les données partagées : la vue choisie par l'un s'imposait aux autres.
- `me27()` attribuait le premier collaborateur de la liste quand le compte n'était relié à personne.
- La fiche client n'avait ni langue, ni contact opérationnel, ni signataire, ni destinataire de facturation, ni dates de mission.

**Changements**
- **Menu** : Pilotage (tableau de bord) · Clients (prospects, créations, onboarding, portefeuille) · Production (fiscalité, bilans, juridique, travaux) · Honoraires (facturation, contrôle, revue) · Mon travail (tâches, temps) · Organisation (charge, qualité, rentabilité) · Paramètres (comptes, imports, connexions, calendrier fiscal, sauvegardes, journal).
- **Mon travail** (page d'accueil) :
  - **Origine des tâches** : elles sont déduites des données existantes, sans double saisie : bilans, AGO, déclarations fiscales des 4 prochains mois ou des 4 derniers, onboarding, travaux exceptionnels, créations, prestations à facturer, pièces attendues.
  - **Colonnes** : client, action, type, période, date cible interne, échéance officielle, priorité expliquée (« échéance dépassée de 12 j »), responsable et relecteur, blocage, prochaine action, bouton pour ouvrir le dossier.
  - **Vues** : Aujourd'hui, Cette semaine, En retard, En attente du client, À revoir, Bloqué, Sans prochaine action, Tout.
  - **Portée** : vue personnelle par défaut ; vue équipe ou d'un collaborateur pour les managers, associés et administrateurs ; filtre par type.
  - **Suivi d'une tâche** (« Suivre ») : responsable, relecteur, blocage, prochaine action, date de relance, note. Partagé par toute l'équipe et daté.
- **Préférences personnelles** :
  - filtres, vues, onglets, année affichée, page ouverte ;
  - gardées sur le poste de chaque utilisateur, jamais envoyées au serveur ;
  - une fusion ne les écrase pas.
- **Fiche client**, nouveaux onglets :
  - **Identité et équipe** : langue, groupe, contact opérationnel, signataire, destinataire de facturation, calendrier de reporting, profil du dossier, immatriculation étrangère ; associé, manager, collaborateurs, relecteur ; dates de début et de fin de chaque mission.
  - **Documents** : liens, pièces demandées et reçues, justificatifs de création.
- **Tableaux** : en-têtes et colonne client fixes au défilement, défilement vertical et horizontal conservés après une modification.

## Lot 4 — Processus (`src/v27_process.js`)

**Constats vérifiés**
- Les échéances étaient calculées au jour fixe, sans report des week-ends et jours fériés, et sans date cible interne.
- Rien n'indiquait que les règles fiscales devaient être vérifiées. Les dates de mission n'étaient pas prises en compte.
- Le premier exercice atypique n'était pas géré.
- Les étapes d'onboarding étaient identiques pour tous les dossiers.
- Il n'existait pas de processus de sortie, ni de relance consolidée validée par un humain.

**Changements**
- **Calendrier fiscal** :
  - l'échéance officielle est reportée au premier jour ouvré, en tenant compte des week-ends et jours fériés français, y compris Pâques, l'Ascension et la Pentecôte ;
  - une date cible interne est fixée N jours avant (paramétrable, 3 par défaut) ;
  - les règles de la campagne 2026 sont listées avec leurs sources officielles ;
  - tant qu'un associé ne les a pas validées, la page Fiscalité indique « calendrier à valider » et les dates sont marquées non certifiées.
- **Missions** : avant le début ou après la fin de la mission fiscale (ou la date de sortie), aucune échéance n'est générée.
- **Premier exercice atypique** : la date de clôture saisie s'applique à l'année de cette clôture.
- **Parcours d'entrée** : acceptation du dossier (lettre de mission signée, LAB) → mise en place → prêt à activer, affiché sur chaque dossier d'onboarding. Le profil du dossier adapte les étapes (création : pas de lettre de reprise).
- **Sortie d'un client** (onglet « Parcours et sortie ») :
  - on saisit la date de fin, le motif et le confrère successeur ;
  - une liste de contrôle couvre les dernières obligations (calculées), les travaux et la facturation restants (calculés), la transmission des éléments, le retrait des accès et l'archivage ;
  - chaque point est daté avec son auteur ;
  - la clôture fait passer le dossier en inactif.
- **Relance consolidée** : depuis « En attente du client », un brouillon par client dans sa langue reprend les pièces et éléments attendus. Rien n'est envoyé par le CRM : on copie le texte ou on ouvre sa messagerie, puis on confirme l'envoi. La prochaine relance est alors datée à J+7.

## Lot 5 — Pilotage (`src/v27_pilot.js`)

**Constats vérifiés**
- `team27()` enregistrait de nouveaux collaborateurs pendant l'affichage.
- Le coût horaire n'était pas historisé. La saisie des temps présélectionnait le premier collaborateur et se faisait par nom.
- La rentabilité changeait de méthode dès la première synchronisation Pennylane, et un dossier sans temps saisi apparaissait à 100 % de marge.
- La charge ne distinguait ni consommé, ni prévisionnel, ni revue, ni absences.

**Changements**
- **Équipe** : les noms trouvés dans les tableaux sont proposés sans être enregistrés ; ils le sont à la première modification. Le compte CRM est relié explicitement à un membre, avec des identifiants stables.
- **Coût horaire** : historisé avec sa date d'effet. Le coût d'une heure est celui en vigueur à sa date.
- **Saisie des temps** :
  - collaborateur à choisir, jamais présélectionné ;
  - un collaborateur ne saisit que ses propres temps ;
  - chaque temps porte l'identifiant du membre ;
  - contrôles de date et de durée ;
  - saisie tardive autorisée et signalée.
- **Rentabilité** :
  - méthode choisie et affichée : budget contractuel, ou facturé dans Pennylane (hors travaux exceptionnels) ;
  - période affichée ;
  - « marge sur coût du temps » ;
  - signalements « pas de temps saisi », « temps incomplets ? » et « coût estimé » ;
  - un dossier sans temps n'entre pas dans la marge ;
  - les travaux exceptionnels sont comptés à part.
- **Charge** (prévisionnel du mois) :
  - capacité moins absences ;
  - production prévue (budget d'heures des dossiers et travaux restants) et revue prévue, séparées ;
  - déjà consommé, reste à faire ;
  - estimations manquantes signalées.
- **Revue des honoraires** : sur 12 mois, honoraires, heures, taux horaire réalisé, marge et proposition argumentée, avec export Excel.
- **Qualité du portefeuille** :
  - SIREN manquant ou invalide, client « à qualifier », aucun manager ;
  - lettre de mission non signée, régimes non définis ;
  - missions sans honoraires, honoraires sans budget de temps ;
  - travail hors forfait sans accord tarifaire.
- **Pennylane** : dernière synchronisation réussie, périmètre et dernière erreur dans Paramètres (les données précédentes sont conservées en cas d'échec).

## Tests réellement exécutés

`npm test` : 10 exécutions, toutes réussies.
- `e2e` : fichiers, puis Redis réel.
- `lot1` : fichiers, Redis réel, faux Upstash sans scripts.
- `lot2` : fichiers, puis Redis réel.
- `lot345` : fichiers, puis Redis réel.
- Point d'entrée Vercel.

| Critère d'acceptation | Où il est testé | Résultat |
|---|---|---|
| 1. Pas d'écrasement silencieux entre deux utilisateurs | lot1, lot2 | OK |
| 2. Droits non contournables par l'API | lot1, lot2 | OK |
| 3. Déclaration validée reste à déposer | lot1 | OK |
| 4. Deux factures de même montant distinctes | e2e | OK |
| 5. Rapprochement approximatif à valider | e2e, lot1 | OK |
| 6. Travail ancien non facturé visible | e2e | OK |
| 7. SIREN différents non fusionnés | lot2 | OK |
| 8. Aperçu d'import et erreurs expliquées | lot2 | OK |
| 9. Changement de régime sans réécriture du passé | e2e, lot2 | OK |
| 10. Erreur réseau du formulaire sans blocage | lot1 | OK |
| 11. Lien expiré ou révoqué inaccessible | lot1 | OK |
| 12. Mail préparé non marqué envoyé | e2e | OK |
| 13. Compte sans collaborateur non attribué | lot345 | OK |
| 14. Filtres d'un utilisateur sans effet sur les autres | lot345 | OK |
| 15. Restauration données et documents vérifiée | lot1 | OK |
| 16. Parcours existants fonctionnels | e2e | OK |

**Non testé** :
- Upstash réel : seul un vrai Redis local a été utilisé.
- Planification Vercel de la sauvegarde quotidienne : seule la route a été testée.
- Exactitude des règles fiscales 2026 : elles n'ont pas été vérifiées en ligne, d'où le statut « à valider ».

## Tableau Corrigé / Partiel / À faire

| # | Point | État | Reste à faire |
|---|---|---|---|
| 1 | Statuts et automatismes trompeurs | **Corrigé** | — |
| 2 | Facturation | **Corrigé** | Affecter une facture Pennylane à plusieurs missions en un seul écran (aujourd'hui mission par mission) : **Partiel** |
| 3 | Données et accès | **Corrigé** | Droits limités à un portefeuille de clients par collaborateur ; CSP stricte (impose de réécrire les écrans d'origine) : **À faire** |
| 4 | Sauvegarde et accès simultanés | **Corrigé** | — |
| 5 | Formulaire et justificatifs | **Corrigé** | Stockage documentaire hors Redis (Vercel Blob ou S3, compte requis) : **À faire** |
| 6 | Imports et identité client | **Corrigé** | — |
| 7 | Navigation | **Corrigé** | — |
| 8 | Mon travail | **Corrigé** | Filtres enregistrés nommés (aujourd'hui : derniers filtres mémorisés) : **Partiel** |
| 9 | Fiche client et ergonomie | **Partiel** | Fait : onglets, en-têtes fixes, défilement. Reste : vue courte avec colonnes avancées à la demande, navigation au clavier, actions groupées sur les tableaux, panneau latéral |
| 10 | Processus | **Corrigé** | Dépendances fines entre étapes au-delà des prérequis bloquants : **Partiel** |
| 11 | Moteur fiscal et exercices | **Partiel** | Fait : jours ouvrés, date cible, règles sourcées à valider, historique, dates de mission, premier exercice. Reste : DES, état récapitulatif TVA et EMEBI en obligations séparées ; seuils CFE/CVAE calculés ; règles d'approbation des comptes selon les statuts |
| 12 | Temps, rentabilité, charge | **Corrigé** | Utiliser l'historique des honoraires dans la rentabilité par période : **Partiel** |
| 13 | Fonctions utiles | **Partiel** | Fait : pièces manquantes, relance consolidée, qualité, hors forfait, revue des honoraires, dossiers sans prochaine action. Reste : modèles de missions et checklists |
| 14 | Intégrations et maintenance | **Partiel** | Fait : état Pennylane, erreurs, journal, modules documentés. Reste : synchronisation partielle ou complète, réduire les remplacements de fonctions globales, écritures encore faites à l'affichage par l'écran d'origine |

## Installation et migration

1. **Sauvegarde** : Paramètres › Sauvegardes serveur › « Télécharger une sauvegarde ». Garder aussi l'export « Sauvegarder ».
2. **Mise en production** : fusionner la branche `claude/confident-knuth-ly7txl` dans `main` (pull request GitHub). Vercel redéploie.
3. **Variables Vercel** (Settings › Environment Variables) :
   - existantes : `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash), `PENNYLANE_CABINET_TOKEN`, `PENNYLANE_FIRM_TOKEN` (optionnel), `PAPPERS_API_KEY` (optionnel), `SESSION_SECRET` (optionnel) ;
   - nouvelles, toutes facultatives : `CRON_SECRET` (sauvegarde quotidienne), `CREATION_LINK_DAYS` (60), `CREATION_RETENTION_DAYS` (0 = conservés), `MAX_STATE_KB` (3500).
4. **Aperçus Vercel** : ne pas brancher la base Upstash de production sur l'environnement « Preview ».
5. **Après la mise en ligne** :
   - **Comptes** : rôles à définir (les anciens « utilisateur » deviennent collaborateur) et chaque compte à relier à son collaborateur (Charge équipe › Compte CRM).
   - **Calendrier fiscal** : à valider par un associé.
   - **Statuts à vérifier** : statuts fiscaux « à vérifier » ; rapprochements Pennylane (bouton de confirmation groupée pour les cas sans ambiguïté) ; clients « à qualifier ».

**Données** : aucune migration destructive. Les nouveaux champs s'ajoutent au fil de l'utilisation, et l'ancien format reste lisible.

## Retour arrière

- **Code** : dans Vercel › Deployments, « Promote to Production » sur le déploiement précédent, ou `git revert` des commits sur `main`.
- **Données** :
  - restaurer la sauvegarde téléchargée à l'étape 1 (Paramètres › Restaurer un fichier) ;
  - ou revenir à une version de l'historique ;
  - un import se défait par « Annuler l'import ».

## Services nécessaires

- Vercel (plan Pro pour un usage professionnel) et Upstash Redis : déjà en place.
- Pennylane : jetons API, lecture seule.
- Facultatif :
  - Pappers (capital social) ;
  - un stockage documentaire privé si le volume de justificatifs grandit.

Aucun nouveau service payant n'a été ajouté.

## Présentation pour l'équipe

- **En arrivant** : « Mon travail » montre ce que vous avez à faire, pour quel client, avant quelle date et ce qui bloque. Commencez par « En retard » puis « Aujourd'hui ».
- **Suivre une tâche** : « Suivre » sert à noter le blocage, la prochaine action, le relecteur ou une date de relance. Toute l'équipe le voit.
- **Ouvrir** : « Ouvrir » mène au tableau ou au dossier concerné.
- **Clients qui doivent quelque chose** : la vue « En attente du client » prépare un brouillon de relance par client. Vous l'envoyez vous-même, puis vous confirmez.
- **Fiscalité** :
  - une déclaration n'est terminée qu'en « Déposée » ou « Accusé de réception », un paiement qu'en « Payée » ;
  - « Validée – à déposer » reste à faire ;
  - les dates tiennent compte des week-ends et des jours fériés.
- **Facturation** :
  - « Déclarer une facture » (facture, acompte, solde ou avoir), pour une ou plusieurs missions ;
  - les correspondances avec Pennylane se valident dans « Rapprochements à valider ».
- **Imports Excel** : vérifiez l'aperçu (clients créés, valeurs remplacées, rapprochements à trancher) avant d'appliquer. Un import se défait dans Paramètres › Imports.
- **Fiche client** : les contacts, la langue, le signataire et les dates de mission se renseignent dans l'onglet « Identité et équipe ». Une sortie de client se déroule dans « Parcours et sortie ».
- **Temps** : saisissez vos temps chaque jour (Mon travail › Saisie des temps). La rentabilité et la charge en dépendent.
