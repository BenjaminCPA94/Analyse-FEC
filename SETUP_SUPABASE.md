# SETUP_SUPABASE — Créer et connecter votre espace cloud (guide pas à pas)

Ce guide s'adresse à une personne qui n'a jamais utilisé Supabase ni fait
de développement. Suivez les étapes dans l'ordre. Ça prend environ 10
minutes.

**Aucune de ces étapes ne modifie ni ne supprime quoi que ce soit dans
votre logiciel actuel.** Tant que vous ne m'avez pas communiqué les
informations demandées à l'étape 6, rien ne change : vos données restent
exactement là où elles sont aujourd'hui (dans votre navigateur).

---

## 1. Créer votre compte Supabase

1. Ouvrez un navigateur et allez sur **https://supabase.com**.
2. Cliquez sur **« Start your project »** (en haut à droite).
3. Le plus simple : connectez-vous avec votre compte GitHub si vous en
   avez un. Sinon, cliquez sur « Sign up » et créez un compte avec votre
   email professionnel + un mot de passe.
4. Confirmez votre adresse email si Supabase vous le demande (un email de
   confirmation arrive en quelques secondes).

Vous êtes maintenant sur le tableau de bord Supabase (« Dashboard »),
vide pour l'instant.

## 2. Créer une organisation (si demandé)

Supabase peut vous demander de créer une « Organization » avant de créer
un projet — c'est un simple regroupement, pas encore votre cabinet dans
notre logiciel (les deux notions sont différentes, ne vous en souciez
pas). Donnez-lui le nom de votre cabinet, plan **« Free »** pour commencer
(gratuit, largement suffisant pour démarrer et tester).

## 3. Créer le projet

1. Cliquez sur **« New Project »**.
2. **Name** : donnez un nom au projet, par exemple `analyse-fec-prod`
   (peu importe, ce n'est qu'un nom technique interne).
3. **Database Password** : Supabase en génère un automatiquement pour
   vous — cliquez sur **« Generate a password »**, puis **copiez-le
   immédiatement dans un gestionnaire de mots de passe** (Supabase ne vous
   le remontrera plus jamais après). Ce mot de passe sert uniquement à un
   accès technique avancé à la base ; il n'est pas nécessaire au
   fonctionnement normal du logiciel, mais gardez-le précieusement.
4. **Region** (région d'hébergement) — **c'est le choix le plus
   important de cette page** :

   > Choisissez **`eu-west-3` (Paris)** si elle est disponible, sinon
   > **`eu-central-1` (Frankfurt)** ou **`eu-west-1` (Ireland)`**.
   >
   > **Pourquoi** : vos données sont des données financières de vos
   > clients — les héberger dans l'Union européenne est la bonne pratique
   > pour la conformité RGPD et cohérent avec la philosophie de
   > confidentialité déjà affichée dans le logiciel. Une fois choisie, la
   > région **ne peut plus être changée** sans recréer un projet — prenez
   > les 10 secondes nécessaires pour bien vérifier avant de cliquer sur
   > « Create ».

5. **Pricing Plan** : laissez **« Free »** pour commencer. Vous pourrez
   passer sur un plan payant plus tard, sans rien perdre, quand l'usage
   réel le justifiera (le plan gratuit suffit largement pour développer et
   tester).
6. Cliquez sur **« Create new project »**. Patientez 1 à 2 minutes le
   temps que Supabase prépare votre base de données.

## 4. Où trouver l'URL du projet

Une fois le projet créé et affiché :

1. Dans le menu de gauche, cliquez sur l'icône **⚙️ « Project Settings »**
   (tout en bas du menu).
2. Cliquez sur **« API »**.
3. Vous voyez un champ appelé **« Project URL »**, qui ressemble à :
   `https://abcdefghijklmnop.supabase.co`

   **C'est cette adresse qu'il faudra me communiquer.**

## 5. Où trouver la clé publique à communiquer

Sur cette même page (**Project Settings → API**) :

1. Cherchez la section **« Project API keys »**.
2. Vous voyez **deux** clés différentes, sous forme de longues chaînes de
   caractères :
   - **`anon` `public`** — c'est **celle-ci** que vous devez me
     communiquer. Elle est conçue pour être publique : elle ne donne
     accès à rien tant que les règles de sécurité (déjà préparées dans le
     logiciel) ne l'autorisent pas explicitement, dossier par dossier,
     utilisateur par utilisateur.
   - **`service_role`** — voir l'avertissement ci-dessous.

## 6. ⚠️ La clé que vous ne devez JAMAIS me communiquer, ni coller nulle part

La clé **`service_role`** (parfois appelée « service key » ou « clé
secrète ») donne un accès **total et illimité** à toutes les données de
tous les cabinets, en contournant toutes les règles de sécurité.

**Ne la communiquez jamais** :
- pas dans un message de chat (même à moi),
- pas dans un email,
- pas dans un fichier que vous partagez,
- pas dans le code du logiciel.

Cette clé n'a besoin d'être configurée qu'à **un seul endroit** plus tard
(les fonctions serveur d'invitation de collaborateurs, cf.
`supabase/functions/invite-collaborator/`), directement dans l'espace
sécurisé **Supabase → Project Settings → Edge Functions → Secrets** — un
espace fait pour ça, jamais visible ni transmis ailleurs. Je vous
guiderai précisément pour cette étape séparée, plus tard, une fois le
reste connecté et fonctionnel.

**Si vous pensez avoir accidentellement communiqué ou exposé cette clé
quelque part** : allez dans Project Settings → API et cliquez sur
« Generate new service_role key » pour l'invalider et en générer une
nouvelle immédiatement.

## 7. Ce qu'il faut me communiquer

Une fois les étapes 1 à 5 terminées, communiquez-moi uniquement ces deux
informations :

1. **Project URL** (étape 4) — ex. `https://abcdefghijklmnop.supabase.co`
2. **Clé `anon` `public`** (étape 5) — la longue chaîne de caractères

Vous pouvez me les coller directement dans notre conversation : ce ne
sont **pas** des secrets sensibles au même titre que le mot de passe de
la base ou la clé `service_role`.

## 8. Ce que je ferai ensuite (vous n'avez rien à faire de plus)

Une fois ces deux informations en main, je pourrai :

1. Appliquer les migrations SQL déjà préparées dans ce dépôt
   (`supabase/migrations/`) à votre projet — création de toutes les
   tables, des règles de sécurité (Row Level Security), des fonctions
   d'autorisation.
2. Connecter le logiciel à votre projet pour la sauvegarde en ligne.
3. Vous guider pour créer votre premier compte utilisateur et votre
   cabinet dans l'application.
4. Vérifier avec vous, avant toute utilisation réelle, que l'isolation
   entre cabinets fonctionne bien (test explicite : un cabinet ne peut
   jamais voir les données d'un autre).

Pendant toute cette phase, **vos données locales actuelles ne sont pas
touchées** — la bascule vers le cloud sera une étape explicite et
volontaire, avec votre confirmation à chaque instant, jamais automatique
ni silencieuse (cf. `SAAS_ARCHITECTURE.md`, section « Stratégie de
migration »).

## 9. Questions fréquentes

**Est-ce que ça va me coûter de l'argent ?**
Le plan gratuit Supabase (« Free ») suffit largement pour démarrer et
tester avec un ou deux cabinets. Il inclut une base de données, de
l'authentification et du stockage de fichiers gratuits jusqu'à des seuils
raisonnables. On regardera ensemble, une fois l'usage réel connu, s'il
faut passer sur un plan payant (généralement autour de 25 $/mois pour un
usage professionnel établi).

**Est-ce que je dois savoir coder pour la suite ?**
Non. Les étapes 1 à 7 ci-dessus sont les seules qui vous demandent une
action. Tout le reste (migrations, code, configuration) est fait par moi.

**Puis-je changer d'avis et supprimer le projet plus tard ?**
Oui, à tout moment, depuis Project Settings → General → « Delete Project »
côté Supabase. Vos données locales dans le navigateur ne sont jamais
affectées par cette suppression.
