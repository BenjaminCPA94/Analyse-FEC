# Lot 2 — Cohérence des données

Branche : `claude/confident-knuth-ly7txl`. **La production (`main`, Vercel) n'a pas été modifiée.**

## Constats vérifiés dans le code avant correction

| Constat | Où | Effet |
|---|---|---|
| Rapprochement par nom « normalisé » qui retire les formes juridiques et le mot HOLDING | `norm27` utilisé par les 5 imports | « HOLDING DUPONT » et « DUPONT SAS » pouvaient être fusionnés |
| Rapprochement par nom même si les deux SIREN renseignés diffèrent | idem | Deux sociétés distinctes fusionnées |
| SIREN non contrôlé (longueur seulement, pas de clé) | idem | SIREN erronés acceptés en silence |
| Clients créés par un import passés « Actif » | Bilan, Fiscalité, Autres travaux ; Portefeuille par défaut | Faux clients actifs dans le tableau de bord |
| Import Portefeuille : statut forcé « Actif » pour tout client d'un groupe non reconnu, y compris un client existant | `importPortfolio27` | Statut existant écrasé |
| Imports appliqués directement après une simple confirmation, sans aperçu ni rapport | les 5 imports | Pas de contrôle avant écriture, pas de retour arrière |
| Changement de régime fiscal : toutes les échéances de l'année (et des années passées) recalculées avec le nouveau régime | `obligations27` | Obligations déjà traitées qui disparaissent, passé réécrit |
| Enregistrement de toute la base à chaque modification | `flush25` | Envois volumineux, conflits fréquents |

## Changements réalisés

**Identité client** (`v27_boards.js`, utilisée par tous les imports)
- **SIREN** : normalisé (un SIRET est ramené à son SIREN) et contrôlé par sa clé (algorithme de Luhn). Un SIREN invalide est signalé, jamais ignoré en silence.
- **Rapprochement** :
  - par SIREN valide ;
  - sinon par nom strict (casse, accents et ponctuation ignorés, forme juridique conservée), et seulement s'il n'y a qu'un seul candidat sans SIREN contradictoire ;
  - deux SIREN différents ne sont jamais rapprochés par le nom : une nouvelle fiche est créée et l'information affichée ;
  - nom seulement voisin (forme juridique retirée) ou plusieurs candidats : la ligne est mise de côté jusqu'à décision (rattacher à tel client, créer, ignorer).
- **Statut** : un client créé par import est « À qualifier », jamais actif par défaut. Il apparaît dans un groupe dédié et n'est pas compté dans les clients actifs. L'import Portefeuille ne change un statut que si le fichier l'indique.
- **Sans SIREN** : les sociétés en formation et les entités étrangères restent possibles (le SIREN est facultatif et seulement contrôlé s'il est présent).

**Imports avec aperçu** (`v27_imports.js`, nouveau ; route serveur `/api/imports`)
- Chaque import s'exécute d'abord sur une copie des données : rien ne change tant que l'aperçu n'est pas validé.
- **Contenu de l'aperçu** :
  - clients créés et modifiés ;
  - lignes de tableau modifiées ;
  - valeurs remplacées (avant / après) et champs complétés ;
  - cellules vides ignorées ;
  - lignes mises de côté ;
  - erreurs (SIREN, dates, montants, colonnes manquantes) ;
  - rapprochements ambigus, à trancher puis « Recalculer ».
- **Cellules vides** : elles n'effacent jamais une valeur existante, sauf case cochée explicitement.
- **Application** : tout en une fois, sans application partielle. Si un collègue a enregistré pendant l'aperçu, ses modifications sont conservées.
- **Rapport** : chaque import est inscrit dans *Automatisations cabinet › Imports* et dans le journal serveur.
- **Retour arrière contrôlé** : « Annuler l'import » remet en l'état les éléments que personne n'a modifiés depuis, et liste les autres. Les données de retour arrière des 10 derniers imports sont conservées sur le serveur, compressées.
- **Droits** : l'import est réservé aux managers, associés et administrateurs (contrôle dans le navigateur et sur le serveur).

**Historique des paramètres** (`v27_history.js`, nouveau)
- **Champs historisés** : régime de TVA et jour d'échéance, régime fiscal, tous les régimes fiscaux du tableau principal, clôture, missions, honoraires, budget de temps, statut.
- **Date d'effet** : le 1er du mois pour un régime fiscal, le jour même pour le reste. Elle est modifiable dans la fiche client, panneau « Historique des paramètres ».
- La première saisie d'une valeur jusque-là non renseignée (« À confirmer ») vaut aussi pour le passé.
- **Échéances fiscales** :
  - calculées mois par mois avec le régime en vigueur ;
  - une modification d'aujourd'hui ne réécrit ni les mois passés ni les exercices précédents ;
  - une obligation déjà traitée sous l'ancien régime reste affichée (« ancien régime »).
- **Clôture** : celle en vigueur au 1er janvier de l'année de clôture.

**Enregistrement par élément** (`lib/app.js` : `PATCH /api/state` ; `v27_sync.js`)
- Le navigateur n'envoie plus que les éléments modifiés : un client, une facture, une ligne de tableau…
- Si un collègue a enregistré entre-temps, le serveur applique les modifications sur sa version, à condition qu'il n'ait pas touché aux mêmes éléments. Le navigateur récupère ensuite ses modifications sans rien afficher.
- Conflit seulement sur un même élément : la fusion et l'affichage des écarts du lot 1 prennent le relais.
- Mêmes contrôles qu'avant : structure, intégrité, droits, auteur réel, journal, écriture atomique.
- Les préférences d'affichage (page ouverte, client sélectionné…) ne sont plus envoyées.
- L'ancien mode (envoi complet) reste accepté par le serveur : il est utilisé pour la toute première sauvegarde d'une base vide.

## Migration et précautions

Aucune migration de données : les nouveaux champs (`hist27`, `imports27`, `importReview27`) s'ajoutent au fil de l'utilisation.

À savoir après la mise en production :
- **Imports** : un aperçu s'affiche désormais avant l'application. Les noms seulement voisins (avec ou sans forme juridique) ne sont plus fusionnés automatiquement : il faut les trancher une fois dans l'aperçu.
- **Clients créés par import** : ils apparaissent « À qualifier » dans le portefeuille ; passez-les au bon statut.
- **Historique** : il démarre à la mise en production. Les régimes en place à ce moment valent pour tout le passé.
- **Avant la mise en production** : télécharger une sauvegarde (Automatisations cabinet › Sauvegardes serveur).

## Retour arrière

- **Code** : `git revert` des commits du lot, ou remise en production du déploiement précédent dans Vercel.
- **Compatibilité des données** : la version précédente ignore les nouveaux champs, et un import appliqué reste annulable tant que ce lot est en place.

## Tests réellement exécutés

`npm test` : 8 exécutions, toutes réussies.
- `e2e` : fichiers, puis Redis réel.
- `lot1` : fichiers, Redis réel, faux Upstash.
- `lot2` : fichiers, puis Redis réel.
- Point d'entrée Vercel.

`test/lot2.js` vérifie notamment :
- **Critère 7** : deux sociétés de SIREN différents ne sont pas fusionnées.
- **Critère 8** :
  - l'aperçu ne modifie rien ;
  - le SIREN invalide est expliqué ;
  - le rapprochement ambigu est tranché puis recalculé ;
  - le client créé est « À qualifier » ;
  - les cellules vides sont sans effet ;
  - l'application se fait en une fois ;
  - un rapport et une entrée de journal sont créés ;
  - le retour arrière conserve l'élément modifié depuis ;
  - annuler l'aperçu ne change rien ;
  - le serveur refuse l'import à un collaborateur.
- **Critère 9** :
  - l'exercice précédent est inchangé ;
  - c'est mensuel jusqu'en mars et trimestriel à partir d'avril ;
  - la déclaration déjà déposée sous l'ancien régime est conservée ;
  - l'historique est visible et enregistré.
- **Enregistrement par élément** :
  - un seul élément est envoyé ;
  - une version de départ dépassée mais un autre élément modifié est appliqué ;
  - un même élément modifié entre-temps donne un conflit ;
  - les droits sont appliqués ;
  - un chemin dangereux est refusé ;
  - deux personnes sur deux clients : aucun conflit, chacune reçoit les modifications de l'autre.

## Limites et points restant à valider

- **Logique de rapprochement** : elle est la même pour les imports Monday ; seul le fichier Portefeuille a été testé avec des cas d'identité dédiés. Les autres imports reposent sur la même fonction.
- **Identifiants étrangers** : il n'y a pas encore de champ dédié aux entités étrangères (numéro d'immatriculation étranger). Le rapprochement se fait alors par nom strict.
- **Valeurs par défaut écrites à l'affichage** : l'affichage d'origine ajoute encore des valeurs par défaut aux fiches (« À enrichir », plan de facturation…). Elles sont neutralisées pour le retour arrière, mais à supprimer au lot 5 (« un rendu ne doit pas modifier les données »).
- **Historique pour la rentabilité** : les honoraires et le budget sont historisés, mais la rentabilité ne les utilise pas encore par période (lot 5).

## État de tous les points demandés (après le lot 2)

| # | Point | État |
|---|---|---|
| 1 | Statuts et automatismes trompeurs | **Corrigé** (lot 1) |
| 2 | Facturation | **Corrigé** (lot 1) ; une facture Pennylane sur plusieurs missions en une fois : **Partiel** |
| 3 | Données et accès | **Corrigé** ; droits par portefeuille et CSP stricte : **À faire** |
| 4 | Sauvegarde et accès simultanés | **Corrigé** ; enregistrement par élément fait (lot 2) ; préférences hors du serveur : **Partiel** (plus envoyées, encore présentes dans les anciennes données) |
| 5 | Formulaire et justificatifs | **Corrigé** ; stockage documentaire hors Redis : **À faire** (accès requis) |
| 6 | Imports et identité client | **Corrigé** ; identifiant étranger dédié : **À faire** |
| 7 | Navigation | À faire — lot 3 |
| 8 | Mon travail | À faire — lot 3 |
| 9 | Fiche client et ergonomie | Partiel (historique des paramètres) — lot 3 |
| 10 | Processus | Partiel (onboarding) — lot 4 |
| 11 | Moteur fiscal et exercices | Partiel : historique avec dates d'effet et obligations conservées faits ; règles versionnées, jours non ouvrés, premier exercice : lot 4 |
| 12 | Temps, rentabilité, charge | À faire — lot 5 |
| 13 | Fonctions utiles | À faire — lots 3 à 5 |
| 14 | Intégrations et maintenance | Partiel — lots 3 à 5 |
