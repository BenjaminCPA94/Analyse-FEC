# CHANGELOG — FEC Analyse

Toutes les entrées se réfèrent à l'audit complet dans `AUDIT.md` (constats,
correctifs, preuves). Version livrée : **v6** (`FEC_Analyse_v6.html`),
partant de la base v5 (`FEC_Analyse_v5_code_complet.html`, import initial).

## v6 — Phase 5 (2/2) : sauvegarde de secours IndexedDB

En cas de dépassement de quota localStorage (~5-10 Mo selon le
navigateur), les données de la sauvegarde en cours étaient réellement
perdues, malgré un message d'erreur déjà actionnable.

- `loadStore()`/`saveStore()` **conservent leur signature synchrone
  inchangée** (34 usages dans le code, aucun modifié) — décision
  arbitrée pour ne pas mélanger ce correctif avec la Phase 6
  (refactorisation).
- `saveStore()` réplique désormais chaque sauvegarde vers IndexedDB en
  tâche de fond (miroir best-effort, quota nettement supérieur) — y
  compris quand localStorage lui-même échoue par dépassement de quota.
- Nouveau bouton **« Restaurer depuis la sauvegarde de secours »** dans
  l'écran Confidentialité : action explicite, jamais automatique.
- `deleteAllIndexedDbData()` (déjà générique) supprime cette nouvelle
  base sans modification — aucun dossier fantôme après suppression totale.

9 nouveaux tests (598 au total, tous verts), vérification manuelle en
navigateur headless : réplication réelle vers IndexedDB, suppression
simulée du localStorage, restauration réussie.

## v6 — Phase 5 (1/2) : parsing FEC déporté dans un Web Worker

Le parsing d'un FEC volumineux (~2 s de traitement synchrone pour
500 000 lignes, cf. AUDIT.md §(k)) gelait entièrement l'interface pendant
ce temps.

- `getFecParserWorker()` construit à la volée un Web Worker dont le code
  est le `.toString()` de `parseFECFile()`/`analyserQualiteImportFEC()` —
  aucune duplication de code, le Worker exécute exactement le même corps
  de fonction que le thread principal.
- `parseFECEnArrierePlan()` : point d'entrée unique utilisé par
  `npConfirm()`, avec repli automatique et transparent sur le parsing
  synchrone historique si `Worker`/`Blob` sont indisponibles.
- Toujours un fichier HTML unique : le Worker est construit via
  `Blob`/`URL.createObjectURL`, aucun fichier `.js` externe.

5 nouveaux tests (589 au total, tous verts), vérification manuelle en
navigateur headless avec un FEC de 120 000 lignes : import réussi, thread
principal resté réactif pendant tout le parsing (mesuré via un compteur
`setInterval` qui continue de progresser).

**Reste à traiter pour clore la Phase 5** : migration du stockage vers
IndexedDB (lever le plafond localStorage ~5-10 Mo, permettre à terme la
persistance du Grand Livre détaillé) — chantier distinct, `loadStore()`/
`saveStore()` étant utilisées de façon synchrone dans 34 emplacements du
code ; à traiter prudemment, pas en une seule réécriture (cf.
AUDIT_CORRECTIONS.md §12).

## v6 — Phase 3 : comptes mixtes non réévalués entre exercices d'un même dossier

Un compte "mixte" (clients/fournisseurs, TVA, comptes courants associés,
organismes sociaux — dont le classement actif/passif dépend du signe réel
du solde, cf. `MIXED_ROUTES`) n'était réévalué qu'au moment de son
**premier** classement. Le mapping étant partagé entre tous les exercices
d'un dossier, un compte qui change de signe sur un exercice ultérieur
(ex. un client devenu créditeur) restait affiché du mauvais côté du bilan
sans aucun signal — limite déjà documentée dans le code
(`addExerciceToActiveDossier()`).

- Nouvelle fonction `detecterComptesMixtesIncoherents()` : détection en
  lecture seule (ne modifie jamais le mapping), comparant le classement
  actuel de chaque compte mixte à ce que donnerait la règle déjà validée
  avec l'expert-comptable pour l'exercice affiché.
- Nouveau bandeau sur la page Bilan listant les comptes incohérents, avec
  réaffectation en un clic — **jamais automatique ni silencieuse** :
  conformément à la règle de prudence de cet audit, aucune règle
  comptable incertaine n'est inventée, et aucun classement existant n'est
  modifié sans un geste explicite de l'utilisateur.

12 nouveaux tests (584 au total, tous verts), vérification manuelle en
navigateur headless (Playwright) reproduisant le scénario exact (ajout
d'un 2ᵉ exercice à solde inversé, bandeau affiché, correction en un clic).

## v6 — Phase 2 : rapport d'import FEC structuré

Jusqu'ici, `parseFECFile()` importait silencieusement ce qu'il parvenait à
lire et ignorait le reste sans aucune trace visible — un FEC tronqué,
partiellement corrompu, ou ré-exporté deux fois par erreur produisait un
dossier d'apparence normale, sans aucun signal.

- Nouvelle fonction `analyserQualiteImportFEC()` : passe de lecture
  **indépendante** du parseur existant (qui n'est ni modifié ni contourné)
  produisant un diagnostic structuré à chaque import — lignes valides/
  rejetées avec la raison précise de chaque rejet, écart débit/crédit
  global, lignes strictement dupliquées.
- Notification immédiate après import uniquement si une anomalie est
  détectée (aucun bruit sur un import propre).
- L'onglet **« Suivi des imports »** affiche désormais, sous chaque
  exercice, un résumé du rapport avec un détail dépliable et un export CSV
  dédié des anomalies (même protection anti-injection de formule que les
  autres exports).
- Ce rapport est strictement informatif : il ne bloque jamais l'import,
  seul le parseur décide de ce qui est effectivement importé.

21 nouveaux tests (572 au total, tous verts), vérification manuelle en
navigateur headless (Playwright) avec un FEC construit avec anomalies
volontaires (ligne rejetée, doublon, écart débit/crédit).

## v6 — Chantier de fiabilisation et sécurisation : Phase 1 (correctifs critiques)

Audit complet demandé (sécurité, fiabilité, maintenabilité) mené en 9
phases. Détail exhaustif dans `AUDIT_CORRECTIONS.md` (anomalie, criticité,
correction, tests pour chaque point) et vue d'ensemble de l'architecture
actuelle dans `ARCHITECTURE.md`. Sauvegarde intégrale du fichier avant
intervention conservée dans `backups/` et dans l'historique git.

5 correctifs critiques appliqués et testés dans cette première passe :

1. **Suppression complète des données** : `deleteAllLocalData()` n'effaçait
   que les dossiers, laissant intacts prévisionnels/TNS/rémunération/IRPP
   malgré un message annonçant une suppression totale. Centralise les 8
   clés de stockage dans `ALL_STORAGE_KEYS`, vérifie après coup qu'il ne
   reste rien, prépare le nettoyage IndexedDB pour la future migration.
2. **XSS stockée** via renommage d'un poste de mapping (12 points
   d'injection non échappés dans le Compte de résultat, la SIG, le Bilan
   et l'écran de Mapping) et via le menu déroulant de sélection de
   dossier — tous corrigés avec `escHtml()`.
3. **Injection de formule CSV** : `csvSafeValue()` neutralise toute
   cellule commençant par `=`, `+`, `-`, `@` avant les 11 exports CSV de
   l'application.
4. **7 identifiants HTML dupliqués**, dont la conséquence concrète (pas
   seulement une question de validité HTML) était que le changement
   d'onglet Mapping/Paramètres et les boutons Enregistrer/Dupliquer/
   Supprimer ne fonctionnaient plus du tout depuis l'onglet Paramètres
   d'un dossier ouvert. Chaque écran a maintenant son propre jeu d'ids.
5. **Fonction dupliquée** `showAffecPanel()` : la redéclaration incomplète
   empêchait le rafraîchissement du panneau "Comptes non affectés" au
   changement d'onglet — supprimée, la version complète est conservée.

Trouvaille annexe corrigée au passage : 3 graphiques du module Trésorerie
plantaient silencieusement hors ligne (même garde Chart.js indisponible
que le reste de l'application, jusqu'ici oublié à ces 3 endroits).

6. **Barèmes fiscaux/sociaux non validés par année** : `anneeResolue()`
   basculait silencieusement vers l'année disponible la plus proche, sans
   aucune distinction entre une correspondance exacte et un repli, ni
   statut de validation. Un barème créé par duplication (TNS caisses,
   Rémunération dirigeant, IRPP) est maintenant marqué `draft` dès sa
   création (`creerMetaBareme()`), affiche un bandeau d'avertissement non
   ignorable (`baremeAvertissementHtml()`, précisant l'année demandée,
   l'année réellement utilisée, la source et la date) tant qu'il n'a pas
   été explicitement validé (bouton « ✓ Valider »), et l'IRPP hérite du
   statut non validé de la Rémunération sous-jacente dont il emprunte les
   tranches (`combinerMetaBareme()`). Tous les résultats TNS, Rémunération
   et IRPP portent désormais la mention obligatoire de simulation à
   valider par un professionnel.
7. **Caisses TNS incomplètes** : un paramètre non renseigné (`0` implicite)
   se comportait comme un taux réellement nul, produisant un résultat
   chiffré plausible mais faux. Les 11 caisses non vérifiées utilisent
   maintenant `null` pour tout champ non renseigné ; `renderTns()`
   détecte l'incomplétude via `validerCompletudeCaisse()` et bloque
   totalement l'affichage d'un résultat chiffré (aucune approximation)
   tant que la caisse n'est pas entièrement paramétrée.

Les phases 2, 3, 5 à 9 de la demande (validation FEC structurée, comptes
mixtes par signe, IndexedDB, Web Worker, refactorisation modulaire, tests
étendus, améliorations de modules, accessibilité) restent à traiter.

71 nouveaux tests (543 au total, tous verts), vérifications manuelles en
navigateur headless (Playwright) pour chaque correctif à surface UI.

## v6 — Phase 4 : renommage "Consolidé" → "Agrégation multi-sociétés" + bannière permanente

Confirmation obtenue de l'utilisateur pour le renommage prévu par la
Phase 4 de l'audit (précédemment différé, cf. entrée ci-dessus) : le
module livré sous le nom "Consolidé" devient **"Agrégation
multi-sociétés"** dans tous les libellés visibles (type de projet, tag de
carte, boutons, toasts, messages de blocage), afin d'éviter toute
confusion avec une véritable consolidation comptable réglementaire
(éliminations intragroupe, retraitements, intérêts minoritaires — que ce
module ne réalise jamais).

- Renommage limité aux libellés **visibles** ; le type de stockage
  interne (`type: 'consolide'`), les noms de fonctions et les classes CSS
  sont inchangés — aucun impact sur les dossiers déjà enregistrés.
- Nouvelle bannière d'avertissement **permanente et non masquable**,
  visible sur les 4 onglets d'un dossier d'agrégation ouvert (Analyses,
  Affectation des comptes, Suivi des imports, Paramètres), rappelant
  qu'il s'agit d'une addition simple des dossiers membres, sans
  élimination des flux intragroupe ni retraitement de consolidation, et
  que le résultat ne se substitue pas à une consolidation légale.

8 nouveaux tests (551 au total, tous verts), vérification manuelle en
navigateur headless (Playwright) confirmant la bannière sur les 4 onglets
et son absence sur un dossier Reporting classique.

## v6 — Consolidé : vue « Contributif en colonnes » (détail par société) sur Bilan/CR/SIG

Sur un dossier Consolidé, le Compte de résultat (présentation légale), la
SIG et le Bilan proposaient jusqu'ici uniquement le total agrégé des
sociétés membres. Une bascule **« Vue » (Total / Contributif en
colonnes)** apparaît maintenant en haut de ces 3 pages — uniquement pour
un dossier Consolidé, aucun effet sur un dossier Reporting classique.

- **Mode "Contributif en colonnes"** : chaque poste, sous-poste et compte
  s'affiche avec une colonne par dossier membre (nom du dossier en
  en-tête) + une colonne « Total » identique à la somme déjà affichée en
  mode "Total". Le dépliage par clic (chevron) fonctionne à l'identique
  jusqu'au niveau compte, avec le détail par société pour chaque compte
  individuel — comme demandé, jusqu'au niveau le plus fin.
- **Aucune donnée fabriquée** : les colonnes par société lisent
  directement le `bal` propre de chaque dossier membre (déjà conservé par
  `computeConsolidatedData()` pour l'agrégation, désormais aussi exposé
  via `ACTIVE.consolideMembers`) — la liste des comptes affichés pour
  chaque poste est prise sur la colonne Total (qui contient toujours
  l'union des comptes de tous les membres) pour ne jamais en omettre un
  qui existerait chez un membre mais s'annulerait dans la somme.
- Le clic sur un compte individuel ouvre toujours le Grand livre
  (`openGrandLivre()`) — comportement inchangé, y compris le message
  explicite déjà existant quand le détail écriture par écriture n'est pas
  disponible (le ledger n'est jamais persisté, cf. limite déjà documentée).
- Le résultat net calculé (compte 12x absent du FEC) est recalculé
  indépendamment par colonne au Bilan : un dossier membre peut avoir son
  12x déjà affecté quand un autre ne l'a pas encore.
- L'indicateur d'équilibre Actif/Passif et le graphique de structure du
  bilan restent basés sur la colonne Total, à l'identique du mode "Total"
  existant — aucun changement de leur comportement.
- Bascule volontairement absente de la Trésorerie pour l'instant (hors
  périmètre de cette demande — CR/SIG/Bilan uniquement).

**Tests** : 11 nouveaux tests Node (`tests/test_consolide_contributif.js`)
vérifiant la délégation `buildCRTable()`/`buildLegalCRTable()`/
`buildBilanTables()` → leurs variantes `*Contributif()`, les montants par
société et Total, la non-régression du mode "Total" par défaut, et
qu'un dossier Reporting ignore totalement `_consolideView` — 483 tests au
total, suite intégralement verte. Vérification manuelle en navigateur
headless (Playwright) du parcours complet sur les 3 pages (bascule,
en-têtes, détail par compte déplié, retour au mode Total).

## v6 — Dossier « Consolidé » : agrégation simple de plusieurs dossiers Reporting existants

Remodelage du flux « + Nouveau projet » demandé : au lieu d'un unique
format « Reporting », l'étape 1 propose désormais un choix explicite entre
**Reporting** (flux individuel existant, inchangé) et **Consolidé** (nouveau).
Deux décisions structurantes ont été actées avec l'utilisateur avant
implémentation (via question de clarification) :

- **Profondeur de consolidation : agrégation simple.** Un dossier Consolidé
  additionne, compte par compte (et mois par mois), les soldes de l'exercice
  actif de chaque dossier membre, puis réutilise **intégralement et sans
  modification** le moteur de rendu existant (CR, SIG, Bilan, Trésorerie).
  Volontairement, **aucune élimination des comptes réciproques** (comptes
  courants d'associés, créances/dettes intragroupe, achats/ventes
  intragroupe) et **aucun intérêt minoritaire** — ce n'est pas une
  consolidation comptable réelle, et le mot « Consolidé » est utilisé au
  sens du rapprochement de groupe demandé, pas au sens réglementaire.
- **Rattachement : on choisit parmi les dossiers Reporting déjà existants
  du même groupe.** Jamais de création de reporting « à l'intérieur » d'un
  Consolidé — un Consolidé référence uniquement des `memberIds` vers des
  dossiers Reporting déjà présents dans le même groupe (Non classés /
  Groupe DERKX / Expand CPA), éditable après coup depuis ses Paramètres.

**Modèle de données** : un dossier Consolidé est stocké comme n'importe
quel dossier (`fec_analyse_v2`), avec `type:'consolide'` et
`memberIds:[...]`. Il ne persiste **jamais** de `bal`/`exercices` figés :
`computeConsolidatedData(memberIds)` recalcule l'agrégation à **chaque
ouverture** à partir de l'exercice actif courant de chaque membre — modifier
un dossier membre (ou changer son exercice actif) se répercute donc
automatiquement à la prochaine ouverture du Consolidé, sans étape de
synchronisation manuelle. Seuls le nom, les membres et le mapping (`mps` —
personnalisable comme pour tout dossier, régénéré automatiquement à la
première ouverture via `defaultMPS_CR`/`defaultMPS_Bilan`) sont persistés.

**Interface** :
- Étape 1 du flux « Nouveau projet » : deux cartes de type de projet
  (Reporting / Consolidé) remplacent l'unique carte « Format ».
- Choisir Consolidé mène à un écran de sélection : liste à cocher des
  dossiers Reporting déjà existants dans le même groupe (jamais de dossiers
  Consolidé imbriqués). Le dossier est créé et ouvert automatiquement dès
  la confirmation, comme pour un Reporting classique.
- La tuile d'un dossier Consolidé porte un badge « Consolidé » et une icône
  dédiée (calques), sur le même fond foncé que les autres dossiers réels
  (`active-card`) — visible directement dans la section de son groupe,
  sans avoir besoin de créer un groupe dédié.
- Depuis les Paramètres du dossier Consolidé ouvert : section « Dossiers
  inclus dans ce consolidé » listant les membres actuels (avec alerte si un
  membre a été supprimé entre-temps), et un sélecteur pour en ajouter
  d'autres dossiers Reporting du même groupe. Ajouter/retirer un membre
  recalcule immédiatement l'agrégation affichée.
- « + Ajouter un exercice » est désormais explicitement désactivé (message
  clair) sur un dossier Consolidé — un Consolidé n'a pas de FEC propre à
  importer, ses « exercices » sont entièrement dérivés de ses membres.

**Tests** : 17 nouveaux tests Node (`tests/test_consolide.js`, harnais
existant) couvrant `computeConsolidatedData()` (somme par compte, fusion des
mois, libellés, période globale, dossiers membres introuvables, exclusion
d'un Consolidé listé par erreur comme membre d'un autre Consolidé),
`openDossier()` sur un dossier consolidé (bal agrégé, type, mapping généré,
exercice synthétique unique) et `saveActiveDossier()` (jamais de `bal` figé
persisté, ré-agrégation après modification d'un membre) — 472 tests au
total, suite intégralement verte. Vérification manuelle en navigateur
headless (Playwright) du parcours complet : création d'un Consolidé à 3
membres depuis l'écran d'accueil, ouverture automatique, CR affichant
correctement la somme des comptes des 3 dossiers, gestion des membres
depuis les Paramètres (ajout/retrait avec recalcul immédiat).

## v6 — Chantier SaaS multi-tenant : Phase 3 complète hors ligne (modèle multi-tenant, RLS, invitations, préparation client)

Tout ce qui pouvait être préparé sans accès réseau pour les Phases 3 et
suivantes, comme demandé explicitement. **Rien de ceci n'est appliqué à
un projet réel** (aucun projet Supabase n'existe encore) — c'est un
travail de conception et d'écriture, relu attentivement, prêt à être
déployé dès que les informations du projet seront communiquées (cf.
`SETUP_SUPABASE.md`).

- **8 migrations SQL** (`supabase/migrations/`), dans l'ordre
  d'application : extensions/fonctions utilitaires ; cabinets/profils/
  appartenances (`organizations`, `profiles` liée 1:1 à `auth.users` via
  trigger, `organization_members` avec rôles admin/manager/collaborator/
  read_only) ; dossiers et permissions par dossier
  (`dossiers`, `dossier_permissions`, niveaux none/read/write/manage,
  un admin de cabinet a un accès `manage` implicite à tous les dossiers
  de son cabinet) ; exercices et données FEC (`exercises`, `fec_files`,
  `account_balances` — **jamais l'écriture individuelle en base**, cf.
  décision déjà documentée en `SAAS_ARCHITECTURE.md` §3.6, `mappings`) ;
  données des 4 modules métier (`forecasts`, `tns_simulations`,
  `remuneration_simulations`, `irpp_declarations`, `comments` — payload
  `jsonb` réutilisant tel quel le format déjà produit par les moteurs
  purs existants, jamais de duplication du schéma en SQL) ; audit et
  versioning (`audit_logs`, `entity_versions`, triggers ciblés sur
  `mappings`/`dossier_permissions`, jamais de client autorisé à écrire
  directement dans ces deux tables) ; stockage privé des FEC (bucket
  Supabase Storage `fec-files`, `public = false`, politiques basées sur
  `storage.foldername()`) ; toutes les politiques RLS (58 au total).
- **Isolation multi-tenant appliquée dans la base, jamais seulement côté
  interface** : deux niveaux de policy empilés sur chaque table liée à un
  dossier (appartenance au cabinet + permission sur le dossier précis).
  Fonctions d'autorisation `security definer` (seule dérogation
  volontaire à la RLS, documentée, nécessaire pour éviter une récursion
  RLS sur `organization_members` — motif standard Supabase).
- **Edge Function `invite-collaborator`** (Deno/TypeScript) : vérifie
  côté serveur que l'appelant est admin du cabinet concerné avant toute
  action (jamais de confiance dans un rôle envoyé par le client), utilise
  la clé `service_role` exclusivement côté serveur pour créer
  l'appartenance et déclencher l'email d'invitation Supabase Auth,
  journalise l'action dans `audit_logs`.
- **`src/cloud/`** (nouveau) : code de préparation client, à dépendances
  injectées pour rester testable sans réseau ni paquet npm réel —
  `supabase.client.js` (ne fabrique jamais un faux client silencieusement
  fonctionnel), `cloud.repository.js` (même contrat get/list/save/remove
  que `createLocalStorageRepository`, asynchrone — différence assumée et
  documentée plutôt que masquée), `migration.service.js` (détection des
  8 clés localStorage inventoriées + planification de migration avec
  détection de doublons par SIREN/nom, jamais de fusion silencieuse).
- **`supabase/tests/tenant_isolation.sql`** : script de tests de sécurité
  concrets — un utilisateur du cabinet A ne peut jamais lire ni écrire une
  donnée du cabinet B, un collaborateur sans accès explicite à un dossier
  de son propre cabinet ne peut pas le consulter. Transaction annulée
  systématiquement (`ROLLBACK`). Prêt à exécuter dès qu'un projet existe.
- **`SETUP_SUPABASE.md`** (nouveau) : guide non-développeur pas à pas —
  création de compte, création du projet, choix de la région (UE),
  où trouver l'URL et la clé publique à communiquer, quelle clé ne
  jamais communiquer (`service_role`) et pourquoi, ce qui se passe
  ensuite.
- **`.env.example`** (nouveau) : scaffold de configuration, uniquement
  les valeurs publiques (URL + clé `anon`), avertissement explicite sur
  `service_role`. `.gitignore` étendu (`node_modules/`, fichiers locaux
  Supabase CLI).
- **103 nouveaux tests exécutables dès maintenant, sans base réelle** :
  `tests/test_supabase_schema.js` (79 contrôles — analyse statique des
  migrations : chaque table métier porte `organization_id`, chaque table
  a RLS activée, chaque table RLS a au moins une politique, aucune
  occurrence de "disable row level security" nulle part, intégrité des
  clés étrangères, fonctions d'autorisation bien `security definer`,
  aucun secret en clair) ; `tests/test_cloud_repository.js` (13 tests,
  client Supabase simulé — isolation par cabinet dès la construction de
  requête, gestion d'erreurs) ; `tests/test_migration_service.js`
  (11 tests — détection/planification de migration). `tests/run_all.js`
  passe en orchestration asynchrone pour accueillir ces nouvelles suites
  sans changer le comportement des suites synchrones existantes.
  **455 tests au total, tous verts.**
- **Ce qui reste bloqué sans action de votre part** (inchangé depuis
  l'audit initial) : appliquer réellement ces migrations, déployer
  l'Edge Function, exécuter `tenant_isolation.sql` contre une vraie base,
  et câbler `CloudRepository` dans `FEC_Analyse_v6.html` nécessitent un
  projet Supabase réel — cet environnement de développement n'a pas
  d'accès réseau externe. Cf. `SETUP_SUPABASE.md` pour la marche à suivre.

## v6 — Chantier SaaS multi-tenant : audit complet + Phase 1 (stabilisation) + Phase 2 (couche de stockage abstraite)

- **`SAAS_ARCHITECTURE.md`** (nouveau) : audit exhaustif de l'existant
  (stack, 5 modules, 8 clés `localStorage` inventoriées, fonctions de
  stockage, parseur FEC, sécurité XSS déjà en place), architecture cible
  (Supabase — PostgreSQL + Auth + Storage + RLS, justifiée par comparaison
  avec les alternatives), modèle de données multi-tenant complet
  (organizations/dossier_permissions/exercises/fec_files/audit_logs...),
  décision argumentée sur la granularité de stockage des gros FEC (fichier
  privé + balance agrégée, jamais l'écriture individuelle en base — cohérent
  avec le choix déjà fait aujourd'hui côté `localStorage`, où le grand livre
  n'est jamais persisté), stratégie de migration des données locales
  (jamais de suppression avant confirmation explicite du succès), et ordre
  de travail sur 12 phases. Point de transparence : cet environnement de
  développement n'a pas d'accès réseau externe — aucun projet Supabase ne
  peut être créé ni connecté depuis cette session ; les phases 3 et
  suivantes nécessitent un projet et des identifiants côté utilisateur.
- **Phase 2 implémentée** : `createLocalStorageRepository(config)`,
  générateur générique d'interface CRUD (`get/list/save/remove`) qui
  remplace les 4 quintets dupliqués `loadXStore/saveXStore/saveX/
  deleteXById/listX` des modules Prévisionnel, TNS, Rémunération et IRPP
  (le module Dossiers, de forme différente, n'est pas concerné). **Aucun
  changement de comportement** : mêmes clés `localStorage`, mêmes formats
  JSON, mêmes messages d'erreur/toast, même gestion de
  `QuotaExceededError` quand elle existait déjà — vérifié par relecture
  après un rechargement complet de page en navigateur headless. Décision
  documentée de ne **pas** extraire ce code vers de vrais fichiers
  `src/storage/*.js` dès maintenant : `tests/harness.js` n'exécute que le
  `<script>` inline unique du fichier HTML, et l'application est encore
  ouverte directement en `file://` sans serveur — un split prématuré
  aurait cassé silencieusement les 326 tests existants sans aucun
  bénéfice tant qu'aucun backend ne justifie une étape de build.
- 26 nouveaux tests (`tests/test_storage_repository.js`) : contrat
  générique (get/list/save/remove, tri, JSON corrompu géré sans
  exception), présence du repository sur les 4 modules migrés, et
  non-régression stricte des anciennes fonctions sur les 4 clés
  `localStorage` concernées — 352 tests au total, tous verts. Vérifié en
  navigateur headless (Playwright) : création/liste dans les 4 modules,
  persistance après rechargement complet de la page.

## v6 — Rémunération dirigeant : recommandation explicite de la meilleure forme juridique

- **Objectif utilisateur** : disposer d'un outil qui indique directement
  quelle est la meilleure option de rémunération selon la forme juridique
  (IR ou IS), plutôt que de devoir interpréter soi-même un tableau
  comparatif. L'onglet « Comparateur de statuts » affichait déjà les 5
  formes (SASU/SAS-IS, EURL/SARL-IS, EURL-IR, EI-IR, EI-IS) côte à côte
  mais sans verdict — il indique désormais explicitement la meilleure
  option.
- **Bandeau « 🏆 Recommandation »** en tête de l'onglet Comparateur :
  forme juridique la plus avantageuse, revenu net personnel final
  (annuel et mensuel), écart en € et en % avec la meilleure alternative.
- **Classement complet** des 5 formes par revenu net personnel final
  décroissant (`rmClasserScenarios`), avec médailles 🥇🥈🥉 et écart par
  rapport à la 1ʳᵉ place pour chaque forme. Le tableau détaillé existant
  reprend ce même ordre et met en évidence la colonne gagnante. L'export
  CSV suit désormais le même classement.
- Le bandeau d'avertissement existant est conservé et renforcé : le
  classement ne porte que sur le revenu net financier — il ne remplace
  pas l'analyse des différences de responsabilité, de formalisme, de
  coûts de structure ni de protection sociale au-delà du score indicatif.
- **Correctif de robustesse découvert en testant cette fonctionnalité** :
  `mkChart()` levait une exception non interceptée quand Chart.js (chargé
  via CDN) est indisponible (hors-ligne, bloqué par un pare-feu/proxy
  d'entreprise, ad-blocker) — cette exception remontait et interrompait
  `renderRemu()` avant l'affichage des onglets Comparateur et Simulation
  inversée (jamais rendus dans ce cas, silencieusement). Corrigé par un
  simple retour anticipé si `Chart` n'est pas défini, cohérent avec la
  promesse de l'application (« vos données restent 100% locales ») —
  un usage hors-ligne ne doit pas casser des fonctionnalités sans rapport
  avec les graphiques.
- 5 nouveaux tests (`rmClasserScenarios` : tri décroissant, gestion des
  égalités, valeurs manquantes traitées comme 0 sans NaN) — 326 tests au
  total, tous verts. Vérifié en navigateur headless (Playwright) :
  bandeau de recommandation, classement, non-régression des onglets
  Résultats/Simulation inversée (dont le rendu était justement empêché
  par le bug Chart.js ci-dessus avant correction).

## v6 — Barèmes multi-années (TNS, Rémunération dirigeant, IRPP) + tentative de sourcing externe

- **Tentative d'automatisation par source externe** : avant de construire
  cette fonctionnalité, vérification de l'accès réseau à plusieurs sources
  faisant autorité (urssaf.fr, service-public.fr, legifrance.gouv.fr,
  cnbf.fr, carmf.fr, data.gouv.fr, simulateur-ir-ifi.impots.gouv.fr) :
  toutes bloquées (`403`, politique du bac à sable de l'environnement
  d'exécution). L'automatisation de la récupération des barèmes n'est donc
  pas possible depuis cet environnement — seule une saisie manuelle (par
  l'utilisateur, ou par collage de données dans la conversation) permet de
  compléter des barèmes réels.
- **Sélecteur d'année** sur les trois modules à barèmes fiscaux/sociaux
  (TNS, Rémunération dirigeant, IRPP) : chaque simulation/déclaration
  porte désormais une année demandée, avec resynchronisation automatique
  des barèmes appliqués (`anneeResolue`, mécanisme unique partagé par les
  trois modules) — année exacte si des données lui sont propres, sinon
  repli transparent sur l'année connue la plus proche (jamais
  d'extrapolation silencieuse : un bandeau « ℹ repli {année} » informe
  explicitement l'utilisateur quand un repli a lieu).
- **`PASS_PAR_ANNEE`** (nouveau, partagé) : Plafond Annuel de la Sécurité
  Sociale pour 2023 (43 992 €), 2024 (46 368 €) et 2025 (47 100 €) — valeurs
  publiques et stables (arrêtés annuels, Journal Officiel). Les tranches
  déjà exprimées en multiples du PASS (`jusquPASS`) s'ajustent
  automatiquement à l'année choisie pour le régime réel TNS et les caisses
  en mode tranches (AVA/ORGANIC/CIPAV/MSA) — un changement d'année produit
  déjà un résultat correctement différent pour ces seuils, même sans
  saisie supplémentaire.
- **« Dupliquer vers une nouvelle année »** sur les trois modules : copie
  l'intégralité des barèmes effectifs de l'année source vers une nouvelle
  année (surcharge complète en `localStorage`, jamais fusionnée champ à
  champ), immédiatement modifiable sans plus aucun repli. Pour TNS, disponible
  depuis l'écran « Paramétrage des caisses » (copie les 16 caisses en une
  fois). Pour Rémunération dirigeant et IRPP, un bouton ⎘ à côté du champ
  Année sur l'écran de simulation/déclaration.
- **Barème IR jamais dupliqué entre les trois modules** : IRPP réutilise
  toujours en direct `chargerReglesRemunerationEffectives()` pour son
  barème/décote/quotient/PFU/abattement dividendes, quelle que soit
  l'année demandée — une surcharge IRPP ne porte jamais sur le barème
  lui-même, seulement sur les paramètres propres à l'IRPP (dons, PER,
  plafond niches fiscales, emploi à domicile, frais de garde...). Vérifié
  par test : le barème résolu pour une même année est strictement
  identique entre les deux modules.
- **Migration rétrocompatible** des surcharges de caisses TNS déjà
  enregistrées avant cette version (format à plat `{ [caisseId]: caisse }`)
  vers le nouveau format par année — aucune perte de paramétrage déjà
  saisi par un utilisateur.
- **Une seule année réellement vérifiée par module** (2025, déjà livrée) :
  cette livraison construit l'architecture multi-années et permet de la
  peupler, mais ne fabrique aucune donnée pour d'autres années sans les
  avoir reçues (mêmes principes de transparence que les 11 caisses « à
  paramétrer » de la livraison précédente). Créer une année réelle
  supplémentaire (2024, 2026...) nécessite de dupliquer puis de corriger
  les valeurs — manuellement pour l'instant, ou avec mon aide si des
  chiffres sources sont fournis dans la conversation.
- 20 nouveaux tests (résolveur `anneeResolue` couvert indirectement par
  les 3 modules, `PASS_PAR_ANNEE`, duplication/isolation/repli pour
  chaque module, non-duplication du barème IR entre Rémunération et
  IRPP, migration de l'ancien format de surcharges TNS) — 321 tests au
  total, tous verts. Vérifié en navigateur headless (Playwright) :
  changement d'année avec resynchronisation du PASS, duplication vers une
  nouvelle année, bandeau de repli, non-régression de la navigation
  croisée des 5 modules.

## v6 — TNS : caisses professionnelles paramétrables (16 régimes, classes/tranches éditables)

- **Nouveau régime « Caisse professionnelle »** dans le module TNS, en
  plus des 3 régimes existants (réel commerçant/artisan, réel libéral,
  micro-entrepreneur — inchangés). Un sélecteur « Activité » propose 16
  caisses : AVA-Artisan, ORGANIC-Commerçant, CARCDSF-Chirurgien-dentiste,
  CARCDSF-Sage-femme, CARMF-Médecin, CARPIMKO-Auxiliaire médical,
  CARPV-Vétérinaire, CAVEC-Expert-comptable, CAVP-Pharmacien,
  CAVP-Biologiste, CIPAV-Libéral, CNBF-Avocat, CRN-Notaire,
  CAVAMAC-Agent d'assurance, CAVOM-Officier ministériel, MSA.
- **Deux modes de calcul unifiés** (`TnsEngine.calculerCotisationsCaisse`) :
  tranches en % du revenu par rapport au PASS (comme les régimes déjà
  existants) pour AVA/ORGANIC/CIPAV/MSA, et cotisation forfaitaire par
  classe pour les caisses à système de classes (CNBF, CRN, professions
  libérales réglementées) — l'utilisateur choisit une classe par poste de
  cotisation, chaque classe portant un montant annuel fixe. La CSG est
  désormais scindée en « CSG déductible » et « CSG/CRDS non déductible »
  (au lieu d'un poste unique fusionné), plus fidèle à la déclaration
  réelle et au résultat affiché par le simulateur cible.
- **Écran « Paramétrage des caisses »** (nouveau, accessible depuis un
  bouton ⚙ du régime Caisse) : sélection de la caisse à éditer, liste des
  postes de cotisation à gauche, éditeur à droite (tranches PASS/taux, ou
  classes/montants avec ajout/suppression et choix de la classe par
  défaut), CSG déductible/non déductible éditable, bouton « ↺ Défaut »
  (réinitialise sans enregistrer) et « ✓ Enregistrer » (persiste dans
  `localStorage`, clé `fec_analyse_tns_caisses_v1`, en surcharge du
  catalogue par défaut — jamais muté directement, toujours réinitialisable).
- **Transparence sur la fiabilité des données** : cet environnement de
  développement n'a pas d'accès réseau externe (politique du bac à
  sable), il n'a donc pas été possible de vérifier les barèmes réels de
  CARCDSF/CARMF/CARPIMKO/CARPV/CAVEC/CAVP/CNBF/CRN/CAVAMAC/CAVOM/MSA
  auprès d'une source officielle. Ces 11 caisses sont livrées avec leur
  structure complète (postes, classes, libellés — dont les 8 classes
  réelles de la retraite de base CNBF telles que communiquées par
  l'utilisateur) mais des montants/taux à 0, marquées `aParametrer: true`
  et signalées par une alerte à l'écran, à compléter via l'écran de
  paramétrage avant tout usage réel. AVA-Artisan, ORGANIC-Commerçant et
  CIPAV-Libéral réutilisent en revanche les barèmes réels déjà vérifiés
  du régime SSI/libéral existant (mêmes objets, aucune valeur dupliquée
  divergente).
- 24 nouveaux tests (`tests/test_tns_caisses.js`) — structure du
  catalogue, non-duplication des barèmes réels, parité mode tranches vs
  moteur historique, choix de classe, CSG scindée, ACRE, caisses « à
  paramétrer » sans exception, cycle complet de persistance des
  surcharges (enregistrement → lecture → réinitialisation) — 291 tests
  au total, tous verts. Vérifié en navigateur headless (Playwright) :
  sélection d'une caisse, ouverture du paramétrage, édition et
  enregistrement d'une classe, persistance après réouverture,
  réinitialisation aux valeurs par défaut, non-régression des 3 régimes
  historiques.

## v6 — IRPP : mode simplifié / complet (à l'image du simulateur officiel des impôts)

- **Bascule « Simplifié / Complet »** sur l'écran de déclaration IRPP
  (même mécanique que le module Rémunération dirigeant), inspirée des
  deux modes du simulateur officiel
  (simulateur-ir-ifi.impots.gouv.fr). *Remarque de transparence :
  l'environnement d'exécution de cette session bloque tout accès réseau
  externe (politique du bac à sable) ; le mode simplifié n'a donc pas pu
  être copié depuis la page officielle en direct, il a été reconstruit à
  partir de sa structure connue (situation du foyer → salaires/pensions
  uniquement → réductions/crédits courants → résultat) — à vérifier par
  l'utilisateur au besoin.
- **Nombre de parts fiscales calculé automatiquement** en mode simplifié
  (`IrppEngine.calculerNbParts`) à partir de la situation familiale et du
  nombre d'enfants à charge, selon la règle générale du quotient familial
  (art. 194 CGI) : 1 part (ou 2 pour un couple) + 0,5 part pour chacun des
  deux premiers enfants, puis 1 part entière à partir du 3ᵉ. Le mode
  complet reste éditable manuellement (cas particuliers non modélisés :
  parent isolé, invalidité, ancien combattant...).
- **Mode simplifié** : se limite aux salaires/pensions (masque BIC/BNC,
  revenus fonciers, capitaux mobiliers/plus-values) et aux réductions/
  crédits les plus courants (dons, PER, emploi à domicile, garde
  d'enfants — masque PME, Pinel, pension alimentaire versée), avec des
  messages explicites renvoyant vers le mode complet pour les intégrer.
  **Mode complet** : tous les champs déjà livrés précédemment, inchangés.
- 9 nouveaux tests (`calculerNbParts` sur 9 combinaisons situation
  familiale/nombre d'enfants) — 267 tests au total, tous verts. Vérifié
  en navigateur headless (Playwright) : bascule des deux modes,
  recalcul des parts à la saisie du nombre d'enfants, masquage/
  affichage correct des champs selon le mode.

## v6 — Module « IRPP » (calcul de l'impôt sur le revenu + recherche de case déclarative)

- **Nouvelle tuile d'accueil « IRPP »**, même architecture que les
  modules Prévisionnel/TNS/Rémunération (stockage indépendant
  `fec_analyse_irpp_v1`, liste + écran de déclaration, sauvegarde
  automatique, suppression).
- **Recherche de case en langage courant (`IRPP_CASES` /
  `rechercherCasesIrpp`)** — fonctionnalité demandée explicitement :
  catalogue de 18 cases fréquentes de la déclaration de revenus
  (2042/2042 C/2044), chacune avec son formulaire, sa catégorie, un
  descriptif et une liste de mots-clés. Un moteur de recherche par score
  (correspondance exacte de mot-clé, sous-chaîne, mot à mot) permet de
  taper une situation en langage courant (« dons », « j'ai fait des
  dons », « nounou », « PER »...) et d'obtenir la ou les cases
  correspondantes triées par pertinence, avec leur explication. Onglet
  « Recherche de case », actif par défaut à l'ouverture d'une
  déclaration, avec des suggestions cliquables (dons, PER, garde
  d'enfant, emploi à domicile, loyer, dividendes, pension alimentaire,
  plus-value) quand le champ est vide. Chaque champ de saisie de
  l'onglet Revenus / Déductions-réductions-crédits affiche également un
  badge avec sa case officielle (ex. « case 1AJ », « case 7UD »), pour
  relier directement la saisie du foyer à la déclaration réelle.
- **Barème IR jamais dupliqué** : `REGLES_IR_2025` référence directement
  `REGLES_REMUNERATION_2025.ir.{bareme,decote,plafondParDemiPart,
  abattementFraisPro}` (même objet, vérifié par test) — un seul barème
  IR existe dans toute l'application. Les paramètres propres à ce module
  (dons, PER, emploi à domicile, frais de garde, micro-foncier,
  plafonnement des niches fiscales) sont additionnels, versionnés avec
  leur source légale (article du CGI) et leur date de vérification.
- **Moteur (`IrppEngine.calculerDeclaration`)** : revenu net global
  imposable (salaires/pensions avec abattement borné de 10 %, foncier
  micro ou réel, BIC/BNC), RCM au choix PFU (30 %, par défaut) ou option
  barème progressif (irrévocable, abattement de 40 % sur les seuls
  dividendes, prélèvements sociaux toujours dus), déductions du revenu
  global (pensions alimentaires versées, PER plafonné à 10 % du revenu
  professionnel avec un plancher, alerte explicite si le plafond est
  dépassé), IR avec quotient familial plafonné et décote (réutilise
  `RemunerationEngine.calculerIRAvecPlafonnement`, aucune logique de
  barème dupliquée), réductions d'impôt (dons à deux taux avec report de
  l'excédent du taux renforcé vers le taux normal, PME, Pinel — non
  remboursables, plafonnées à l'impôt brut, plafonnement global des
  niches fiscales de 10 000 €/an hors dons, alertes explicites en cas de
  dépassement ou de perte), crédits d'impôt (emploi à domicile, frais de
  garde — remboursables, peuvent générer une restitution si leur montant
  dépasse l'impôt dû après réductions), taux marginal et taux moyen
  d'imposition.
- **Écran** : onglets Recherche de case / Revenus / Déductions-réductions-
  crédits / Résultats (tableau détaillé du calcul, taux marginal/moyen,
  impôt mensualisé, export CSV). Avertissement explicite renvoyant vers
  le simulateur officiel des impôts pour toute déclaration réelle.
- **Périmètre non couvert dans cette livraison** (annoncé, pas simulé en
  silence) : catalogue de cases volontairement limité aux ~18 situations
  les plus fréquentes (pas d'exhaustivité avec les ~400 cases réelles de
  la 2042/2042 C) ; pas de calcul des prélèvements sociaux sur revenus
  fonciers/professionnels (uniquement IR) ; pas de gestion des revenus
  exceptionnels/différés (quotient de l'article 163-0 A CGI) ni du
  report des déficits fonciers/dons sur plusieurs années ; pas
  d'abattement pour durée de détention sur les plus-values mobilières
  (option barème) ; pas de rattachement d'enfants majeurs ni de
  gestion fine des pensions de réversion ; pas d'articulation avec le
  prélèvement à la source (acompte/régularisation) — le module calcule
  l'impôt dû sur les revenus, pas le solde après PAS déjà versé.
- 44 nouveaux tests (`tests/test_irpp_engine.js`), couvrant les
  abattements bornés, PFU vs option barème, déductions et leur
  plafonnement (PER), réductions à deux taux avec report (dons),
  plafonnement global des niches fiscales, non-remboursabilité des
  réductions, remboursabilité des crédits (restitution), micro-foncier
  vs réel, taux marginal par tranche, non-duplication du barème IR, et
  la recherche de case pour l'exemple explicitement demandé
  (« dons » → 7UD/7UF) — intégrés à `run_all.js`, 258 tests au total,
  tous verts. Vérifié en navigateur headless (Playwright) : les 4
  onglets, recherche en direct, badges de case, cycle de vie complet
  (création/saisie/sauvegarde/liste), et non-régression intégrale de
  tous les modules existants (Dossiers, Prévisionnel, TNS,
  Rémunération dirigeant).

## v6 — Module « Rémunération dirigeant » (optimisation rémunération/dividendes)

- **Nouvelle tuile d'accueil « Rémunération dirigeant »**, même architecture
  que les modules Prévisionnel/TNS (stockage indépendant
  `fec_analyse_remuneration_v1`, liste + écran de simulation, sauvegarde
  automatique, suppression).
- **Barèmes versionnés et séparés du moteur** (`REGLES_REMUNERATION_2025`) :
  IS (taux réduit/normal, seuil), IR (barème par tranches, décote,
  quotient familial plafonné), PFU, abattement dividendes, cotisations
  "assimilé salarié" (SASU/SAS) et TNS réel (réutilise le barème du
  module TNS — jamais dupliqué). Chaque bloc porte sa source et sa date
  de vérification ; un snapshot des règles est conservé par simulation
  (`reglesSnapshot`) pour qu'un calcul déjà réalisé reste reproductible
  même après une mise à jour ultérieure du barème par défaut. **Barème
  indicatif 2025** — avertissement explicite affiché à l'écran.
- **Moteur (`RemunerationEngine`)** : IS par tranches, IR (foyer complet,
  quotient familial, décote), comparaison PFU vs barème pour les
  dividendes (choix automatique du plus favorable), cotisations
  "assimilé salarié" (SASU/SAS) et TNS (EURL/SARL/EI gérant majoritaire,
  y compris la fraction de dividendes excédant le seuil de 10 %
  capital+primes+CCA soumise aux cotisations sociales), et l'IR direct
  pour les structures à l'IR (EURL/EI). 5 orchestrateurs par forme
  juridique (SASU/SAS, EURL/SARL/EI-IS, EURL/EI-IR), un registre
  d'architecture extensible pour ajouter SELAS/SELARL plus tard.
- **Optimiseur** : balayage grossier puis recherche locale fine (pas de
  boucle exhaustive coûteuse), scénarios 100% rémunération / 100%
  dividendes / mix optimisé / coût société fixe, simulation inversée
  (net mensuel cible → rémunération brute nécessaire, dichotomie),
  comparateur de statuts juridiques à résultat économique identique.
  **Non-régression notable corrigée pendant le développement** : les
  scénarios dont le coût réel (brut + charges patronales) dépasse ce que
  la société peut financer sont désormais explicitement écartés des
  candidats de l'optimiseur (`filtrerFaisables`) — sans ce garde-fou,
  l'algorithme pouvait recommander une rémunération séduisante sur le
  seul plan personnel mais impayable par la société.
- **Écran** : mode simplifié/expert, onglets Société / Dirigeant &
  foyer / Hypothèses / Résultats (tableau comparatif, 2 graphiques,
  recommandation textuelle prudente, gains 1/3/5 ans) / Comparateur de
  statuts / Simulation inversée. Score de protection sociale indicatif
  (jamais présenté comme un droit exact). Export CSV par tableau ;
  export « PDF » via impression navigateur (comme le reste de
  l'application, pas de service PDF dédié — aucun backend disponible).
- **Périmètre non couvert dans cette livraison** (annoncé, pas simulé en
  silence) : SELAS/SELARL (barèmes non implémentés, architecture prête à
  les recevoir), pondération multicritère complète en interface,
  projection pluriannuelle à 4 sous-stratégies, analyse de sensibilité
  automatisée, écran d'administration dédié à l'édition des barèmes
  (les barèmes restent modifiables en éditant `REGLES_REMUNERATION_2025`
  ou le `reglesSnapshot` d'une simulation, mais sans interface graphique
  dédiée).
- 48 nouveaux tests (`tests/test_remuneration_engine.js`), couvrant les
  15 cas du cahier des charges (SASU dividendes seuls / 60k rémunération
  / arbitrage, EURL-IS gérant majoritaire, seuil des 10 % sur
  dividendes, EURL/EI-IR, foyer avec autres revenus, IS taux
  réduit/normal, résultat insuffisant/déficitaire, trésorerie
  insuffisante, coût société fixe, revenu net cible, changement d'année
  fiscale) + 2 tests de non-régression dédiés au correctif de
  faisabilité — intégrés à `run_all.js`, 214 tests au total, tous
  verts. Vérifié en navigateur headless (Playwright) : les 6 onglets,
  bascule simplifié/expert, export CSV, cycle de vie complet, et
  non-régression intégrale de tous les modules existants.

## v6 — Restructuration en page d'accueil « menu des modules » + Prévisionnel + TNS

- **Nouvelle page d'accueil** : le logiciel démarre désormais sur un menu
  de 3 tuiles (Dossiers / Prévisionnel / TNS) plutôt que directement sur
  la liste des dossiers. La tuile « Dossiers » ouvre l'écran existant à
  l'identique — aucune régression sur l'import FEC, le dashboard, ou les
  onglets Compte de résultat/SIG/Bilan/Trésorerie.
- **Module Prévisionnel** : moteur de calcul (`PrevisionnelEngine`,
  fonctions pures) et écran de saisie/résultats, utilisés à l'identique
  par les deux points d'entrée : le bouton « Lancer un prévisionnel » du
  dashboard d'un dossier (amorce le compte de résultat et le bilan
  d'ouverture depuis les données réelles) et la tuile « Prévisionnel » de
  l'accueil (feuille vierge, aucune dépendance à un dossier). Isolation
  stricte : le prévisionnel ne lit le dossier qu'une fois à sa création,
  n'écrit jamais dans les exercices réels, et vit dans son propre
  stockage (`fec_analyse_previsionnels_v1`), sauvegardé et listé comme
  les dossiers. Sur l'horizon choisi (3 ans par défaut, 1 à 10) : compte
  de résultat, bilan (équilibre actif=passif garanti par construction —
  la trésorerie de clôture est la variable résiduelle du plan de
  financement), plan d'investissement/amortissements, plan de
  financement (emprunts à annuités constantes/capital constant/in fine),
  plan de trésorerie mensuel (cohérence exacte avec les tableaux annuels,
  testée), indicateurs (seuil de rentabilité, BFR, CAF, marges). Toutes
  les hypothèses sont éditables, aucune valeur codée en dur. Export CSV
  par tableau.
- **Module TNS** : calcul des cotisations sociales des travailleurs non
  salariés (`TnsEngine`), 3 régimes (réel commerçant/artisan SSI, réel
  profession libérale CIPAV/URSSAF PL, micro-entrepreneur), options ACRE
  et versement fiscal libératoire. Barèmes (taux, tranches exprimées en
  multiples du PASS) isolés des calculs et entièrement éditables dans
  l'écran — **indicatifs, année de référence 2025**, à vérifier avant tout
  usage réel (formules progressives officielles simplifiées en paliers,
  cf. avertissement affiché à l'utilisateur). Stockage indépendant
  (`fec_analyse_tns_v1`), export CSV.
- 49 nouveaux tests (`tests/test_previsionnel_engine.js`,
  `tests/test_tns.js`), intégrés à `run_all.js` — 166 tests au total,
  tous verts. Vérifié en navigateur headless (Playwright) : navigation
  complète entre les 3 modules (un seul écran visible à la fois à chaque
  étape), amorçage depuis un dossier réel, CRUD investissements/
  emprunts/apports, sauvegarde/suppression, exports CSV, et
  non-régression intégrale des onglets existants.

## v6 — Nouvel onglet « Compte de résultat » (présentation légale PCG)

- **L'ancien onglet « Compte de résultat » devient « SIG »** (Soldes
  Intermédiaires de Gestion) : c'est en réalité ce qu'il a toujours
  affiché (marge commerciale, VA, EBE, résultat d'exploitation…), le
  libellé était trompeur. Renommé dans la barre latérale, l'en-tête de
  page et l'onglet « Affectation des comptes » — aucun identifiant
  technique modifié (pas de risque de régression sur les données déjà
  enregistrées).
- **Nouvel onglet « Compte de résultat »** : reconstitue le Compte de
  Résultat légal du PCG (modèle « en liste », art. 512-2 et s.), avec
  la même présentation que l'export Pennylane (Postes / Chiffre
  d'affaires / Charges d'exploitation / Résultat d'exploitation /
  Résultat financier / Résultat exceptionnel / Résultat de l'exercice,
  numérotés en chiffres romains I à X). 100% automatique : chaque
  compte 6x/7x du FEC est routé vers son poste légal par préfixe de
  compte (table `LEGAL_CR_ROUTING`), sans dépendre du mapping éditable
  de la SIG.
- **Comparaison N/N-1 automatique** : dès qu'un second exercice est
  présent dans le dossier, la page affiche Postes / Exercice courant /
  Exercice précédent / Var. € / Var. %, comme sur le PDF Pennylane —
  sans réglage manuel.
- **Postes dépliables** : cliquer sur un poste révèle les comptes du
  FEC qui le composent ; cliquer sur un compte ouvre son grand livre
  (même mécanisme que la SIG et le Bilan).
- Export CSV dédié (`exportLegalCRToCSV()`).
- Suite de tests existante (117 tests) toujours intégralement verte —
  aucune régression sur la SIG, le Bilan ou les exports.

## v6 — Comparaison N/N-1 : alignement, postes dépliables, grand livre

- **Correctif d'alignement** : les colonnes (Poste/N/N-1/Variation) du
  Compte de résultat et du Bilan en mode comparaison étaient décalées
  par rapport à l'en-tête (deux systèmes de mise en page différents
  entre lignes et en-tête). En-tête et lignes utilisent désormais la
  même grille CSS, alignement garanti par construction.
- **Postes à nouveau dépliables en comparaison** : cliquer sur un poste
  (CR ou Bilan) affiche le détail par compte, avec la valeur de
  l'exercice courant et de l'exercice de comparaison côte à côte —
  même mécanisme que la vue mono-exercice.
- **Nouveau : grand livre par compte.** Cliquer sur n'importe quel
  compte (vue normale ou comparaison) ouvre le détail écriture par
  écriture (date, journal, pièce, libellé, débit, crédit, solde
  cumulé). Ce détail n'est conservé qu'en mémoire pendant la session
  (jamais écrit sur le disque, pour éviter de saturer le stockage
  local sur de gros FEC) — un message invite à réimporter le FEC si le
  détail n'est plus disponible après un rechargement de page.
- 5 nouveaux tests (`tests/test_grand_livre.js`) + vérification
  Playwright/Chromium du parcours complet. Suite complète : 117 tests,
  tous verts.
- Voir AUDIT.md §(q) pour le détail complet.

## v6 — Multi-exercices : import de plusieurs FEC + comparaison N/N-1

- **Nouvel onglet « Suivi des imports »** : liste, pour le dossier
  ouvert, chaque exercice importé (période, nom de fichier, date
  d'import), à l'image de l'écran équivalent de Pennylane.
- **Bouton « + Ajouter un exercice »** : importe un second (ou nième)
  FEC dans le dossier déjà ouvert (ex : 2024 puis 2025), au lieu de
  créer un nouveau dossier séparé. Le mapping (affectation des comptes)
  est **partagé** entre tous les exercices d'un même dossier — un
  compte classé une fois reste classé pour les exercices suivants ; les
  comptes nouveaux à un exercice sont classés automatiquement.
- **Comparaison N/N-1** sur le Compte de résultat et le Bilan : un
  sélecteur « Comparer avec » ajoute une colonne exercice précédent +
  une colonne Variation €, sans toucher aux tableaux mono-exercice
  existants (fonctions de rendu séparées, tests inchangés).
- **Migration automatique** des dossiers mono-exercice déjà enregistrés
  (aucune perte de données, aucune action requise de l'utilisateur).
- Correctif de mise en page découvert en test navigateur réel : les
  colonnes du Bilan en mode comparaison étaient rognées par
  `overflow:hidden` de la carte — passage en pleine largeur (Actif/
  Passif empilés) uniquement quand la comparaison est active.
- 11 nouveaux tests (`tests/test_multi_exercices.js`) + vérification
  Playwright/Chromium du parcours complet (import, ajout d'exercice,
  suivi des imports, comparaison CR et Bilan). Suite complète : 112
  tests, tous verts.
- Voir AUDIT.md §(p) pour le détail complet, les choix d'architecture
  et les limites assumées.

## v6 — Généralisation de la règle de classement par signe (classe 4)

- **Tous les comptes de tiers (classe 4)** sont désormais classés selon
  le signe réel de leur solde (débiteur → actif, créditeur → passif),
  au lieu d'une affectation par nature fixe qui laissait apparaître des
  montants négatifs (rouges) sous des postes où on ne s'y attendait pas.
  Concerné : TVA (4456/4455/4457/4458), IS et autres taxes (441/442/444/
  446-449), personnel (421-428), organismes sociaux (431/437/438),
  groupe et associés (451/455-458), débiteurs/créditeurs divers
  (462/464/465/467/468), comptes d'attente (471/478/4781).
- **Correction d'une erreur du correctif précédent** : le compte 4458
  (TVA à régulariser) était mixte mais pointait à tort vers le poste
  passif "Dettes IS" (bp6_c) au lieu du poste "TVA collectée" (bp6_b).
- **Exceptions volontairement conservées fixes** (comptes PCG dédiés à
  un seul sens par construction, pas des comptes de tiers génériques) :
  différences d'évaluation/conversion (474-477), charges/produits
  constatés d'avance (486/487), avances fournisseurs/clients (409/419),
  dépréciations de tiers (491/495/496 — même famille que les
  amortissements, qui restent en diminution fixe de l'actif).
- 12 nouveaux tests de non-régression + reproduction exacte du cas
  signalé (comptes 431/444/44566/44567/44587/4452/44551/44586/44571009
  etc.) : 0 montant mal classé, 0 anomalie. Suite complète : 101 tests.
- Voir AUDIT.md §(o) pour le détail complet et les exceptions
  documentées.

## v6 — Ajustements PCG post-livraison (comptes mixtes clients/fournisseurs/109)

- **Comptes clients (411, 413, 416, 418)** : normalement à l'actif ; si le
  solde est créditeur (anormal, hors 419 dédié), reclassés au passif en
  « Autres dettes créditrices ».
- **Comptes fournisseurs (401, 403, 404)** : normalement au passif ; si le
  solde est débiteur (anormal, hors 409 dédié), reclassés à l'actif en
  « Autres créances ».
- **Compte 109 (Capital souscrit — non appelé)** : nouvelle ligne dédiée à
  l'actif (groupe `ba0`), au lieu d'être noyé dans les capitaux propres au
  passif.
- Généralisation du mécanisme de comptes mixtes (`COMPTES_MIXTES` →
  `MIXED_ROUTES`) pour permettre à chaque famille de comptes de basculer
  vers sa propre paire de postes actif/passif.
- `MPS_VERSION` incrémenté à 6 (nouveau groupe `ba0`) — migration
  automatique des dossiers existants via `migrateLocalStorage()`.
- 15 nouveaux tests PCG + 1 test d'invariant bilan dédié
  (`tests/test_pcg_routing.js`, `tests/test_bilan_balance.js`).
- Voir AUDIT.md §(n) pour le détail et les points de périmètre
  volontairement non traités (405, 408, autres comptes de capitaux
  propres débiteurs hors 109).

## v6 — Audit, fiabilisation, industrialisation

### Sécurité

- **[Critique] Correction d'une XSS stockée.** Aucune fonction d'échappement
  HTML n'existait : les libellés de comptes issus du FEC importé, le nom du
  fichier et le nom de dossier étaient injectés tels quels dans `innerHTML`
  (CR, Bilan, picker de mapping, diagnostics, module Trésorerie). Un FEC
  contenant un libellé de compte du type `<img onerror=...>` exécutait du
  JavaScript à l'ouverture. Ajout de `escHtml()` et application systématique
  à tous les points d'injection recensés. Sanitize aussi le numéro de compte
  à la source dans `parseFECFile()` (défense en profondeur).

### Invariants comptables

- **[Critique] `buildBilanTables()` corrompait le mapping à chaque rendu.**
  Un bloc de code legacy (« CORRECTION 2 ») recalculait et écrasait les
  comptes des sous-groupes `bp6_b`/`bp6_c` à chaque affichage du Bilan,
  faisant disparaître des comptes déjà correctement affectés par
  `autoAffectOrphans()` (jusqu'à plusieurs dizaines de milliers d'euros
  perdus du Bilan sur le FEC de référence) et créant des doublons entre les
  deux sous-groupes. Supprimé : le routage des comptes 44x mixtes reste
  l'unique responsabilité du moteur d'affectation.
- **[PCG] Comptes `444`/`4458` "nus" jamais réellement routés en mixte.**
  `COMPTES_MIXTES` les listait, mais aucune règle `ROUTING` n'avait ces
  préfixes exacts pour déclencher la logique. Ajout des deux règles
  d'ancrage manquantes.
- **[Parseur] Encodage forcé en Latin-1.** `readAsText(file,'latin1')`
  décodait systématiquement en Latin-1 quel que soit l'encodage réel du
  fichier — un FEC en UTF-8 (fréquent, notamment avec libellés accentués)
  ressortait en mojibake. Ajout de `decodeFecBuffer()` : détection du BOM
  UTF-8, tentative UTF-8 stricte, repli Windows-1252/Latin-1.

### Code mort supprimé

`defaultMPS_CR_Holdings()`, `toggleCurrencyMenu()`, `updateBackBtn()`,
références `#kCA/#kCAsub/#kRN/#kRNsub` dans `buildCRTable()` (éléments
inexistants dans le HTML), redéfinitions dupliquées de `libOf()`/`balOf()`/
`plV()`, variable `creancesFiscalesActif` inutilisée.

### Industrialisation

- Messages d'erreur actionnables pour `localStorage` (quota dépassé,
  stockage corrompu) au lieu d'un message générique.
- Constante nommée `BALANCE_TOLERANCE_EUR` (remplace le seuil de 5€ codé en
  dur à 4 endroits).
- Export CSV du Compte de Résultat et du Bilan (détail compte par compte,
  encodage UTF-8 avec BOM, échappement RFC 4180).
- Sauvegarde/restauration complète d'un dossier au format JSON (portable
  hors du navigateur), import depuis le home screen.
- Bouton Imprimer/PDF avec feuille de style `@media print` dédiée.
- Bandeau confidentialité (RGPD) rappelant que les données restent 100%
  locales, avec suppression totale des données en un clic.
- Sur un FEC volumineux (500 000 lignes, ~2,3 s de traitement mesuré) :
  retour visuel immédiat ("Analyse en cours… (X Mo)") avant le calcul
  synchrone, et gestion d'erreur explicite si le parsing échoue au lieu
  d'un bouton bloqué silencieusement.
- JSDoc ajoutée sur les fonctions cœur qui en étaient dépourvues
  (`parseFECFile`, `defaultMPS_Bilan`, `loadStore`, `saveActiveDossier`,
  `renderDashboard`, `hasSubs`, `fixAllDuplicates`, exports CSV).

### Tests

Nouvelle suite `tests/run_all.js` (71 tests, code retour non nul en cas
d'échec) : syntaxe, E2E mapping propre/pollué, table de vérité PCG (23 cas),
robustesse du parseur (séparateurs, colonnes permutées, montants, AN,
lignes malformées), détection d'encodage, SIG sur mini-FEC (7 sous-totaux
vérifiés à l'euro près), non-régression de la corruption du Bilan,
idempotence de `autoAffectOrphans()`, XSS, exports.

## v5 (état initial fourni)

Version de base auditée : `FEC_Analyse_v5_code_complet.html` — moteur
d'affectation PCG 2026 (~476 règles), génération CR/Bilan/KPI/Trésorerie,
persistance localStorage, `MPS_VERSION = 5`.
