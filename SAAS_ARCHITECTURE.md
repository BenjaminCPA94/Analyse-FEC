# SAAS_ARCHITECTURE — Transformation en plateforme multi-tenant

Ce document est le point d'entrée du chantier « SaaS multi-cabinets ». Il
contient l'audit de l'existant, l'architecture cible, la stratégie de
migration et l'ordre de travail. Toute session future travaillant sur ce
chantier doit lire ce fichier en premier.

**Portée de ce document** : audit + décisions d'architecture + Phases 1 et 2
(stabilisation + couche d'abstraction du stockage), qui sont réalisables
entièrement à l'intérieur de ce dépôt, sans dépendance externe. Les phases
3+ (base de données réelle, authentification, hébergement) nécessitent une
décision et des identifiants qui n'appartiennent qu'à vous — détaillé en
fin de document, section « Ce qui bloque au-delà de la Phase 2 ».

---

## 1. Architecture actuelle

### 1.1 Stack

- **Un seul fichier livrable** : `FEC_Analyse_v6.html`, 14 501 lignes, 665 Ko,
  HTML + CSS + un unique bloc `<script>` (~12 700 lignes de JS). Aucune
  dépendance de build : pas de `package.json`, pas de bundler, pas de
  transpileur. Le fichier s'ouvre directement dans un navigateur (`file://`
  ou hébergement statique trivial).
- **Une dépendance externe unique** : Chart.js via CDN (`<script src=...>`),
  pour les graphiques. Tout le reste est vanilla JS. Un correctif récent
  (`mkChart()`) empêche déjà une indisponibilité de ce CDN de casser le
  reste de l'application — c'est un signe précurseur du principe « aucune
  dépendance externe ne doit devenir un point de défaillance ».
- **Persistance** : `localStorage` exclusivement. Pas d'IndexedDB, pas de
  `fetch` vers un backend, pas de service worker.
- **Tests** : `tests/harness.js` extrait le script du HTML et l'exécute
  dans un bac à sable Node (`vm`) avec des stubs DOM/localStorage/Chart.js.
  `tests/run_all.js` orchestre 17 suites, 326 tests, tous verts. C'est la
  seule protection anti-régression existante (pas de CI configurée dans le
  dépôt — les tests tournent en local/à la demande).
- **Documentation d'ingénierie déjà présente** : `AUDIT.md` (audit v5→v6),
  `CHECKLIST_PROD.md`, `CHANGELOG.md` (historique détaillé, à jour).

### 1.2 Modules fonctionnels (5 tuiles d'accueil)

| Module | Rôle | Moteur pur associé |
|---|---|---|
| **Dossiers** | Import FEC, mapping comptable, CR/SIG/Bilan/Trésorerie, multi-exercices, grand livre | pas de moteur isolé — logique intégrée à `ACTIVE` |
| **Prévisionnel** | Prévisionnel multi-exercices (Bilan/CR/invest./financement/trésorerie) | `PrevisionnelEngine` |
| **TNS** | Cotisations sociales indépendants (réel, micro, 16 caisses paramétrables, multi-années) | `TnsEngine` |
| **Rémunération dirigeant** | Comparaison rémunération/dividendes/formes juridiques, recommandation, multi-années | `RemunerationEngine` |
| **IRPP** | Calcul IR du foyer + recherche de case déclarative, multi-années | `IrppEngine` |

Chaque module suit un pattern homogène qui **facilite** la migration :
`creerXVierge()` → `saveX()/loadXStore()` → écran liste → écran éditeur →
`renderX()`. Les moteurs (`PrevisionnelEngine`, `TnsEngine`,
`RemunerationEngine`, `IrppEngine`) sont déjà des fonctions **pures**
(mêmes entrées → mêmes sorties, aucun accès DOM/localStorage à
l'intérieur) — c'est exactement la séparation métier/stockage dont une
architecture cloud a besoin, déjà en place pour 4 modules sur 5.

### 1.3 Inventaire exhaustif des clés `localStorage`

| Clé | Constante | Contenu |
|---|---|---|
| `fec_analyse_v2` | `STORE_KEY` | Map `{dossierId → dossier}` : nom, groupe, `bal` (balance agrégée par compte), `libs` (libellés), `months` (répartition mensuelle), `mps` (mapping CR/Bilan), `exercices` (multi-exercices), `activeExerciceId` |
| `fec_analyse_previsionnels_v1` | `PREV_STORE_KEY` | Prévisionnels (hypothèses + résultats calculés) |
| `fec_analyse_tns_v1` | `TNS_STORE_KEY` | Simulations TNS (régime, revenu, barème par simulation) |
| `fec_analyse_tns_caisses_v1` | `TNS_CAISSES_STORE_KEY` | Surcharges des 16 caisses professionnelles, **par année** (`{annee: {caisseId: caisse}}`) |
| `fec_analyse_remuneration_v1` | `REMU_STORE_KEY` | Simulations de rémunération dirigeant |
| `fec_analyse_regles_remuneration_par_annee_v1` | `REGLES_REMUNERATION_STORE_KEY` | Barèmes IS/IR/PFU/social par année (au-delà de 2025, seule année vérifiée) |
| `fec_analyse_irpp_v1` | `IRPP_STORE_KEY` | Déclarations IRPP |
| `fec_analyse_regles_irpp_par_annee_v1` | `REGLES_IR_STORE_KEY` | Paramètres IRPP (dons/PER/niches...) par année |

**Donnée volontairement non persistée** : `ACTIVE.exercices[x].ledger`
(détail écriture par écriture, le « grand livre »). `saveActiveDossier()`
l'exclut explicitement avant sérialisation (commentaire en ligne
2044-2048) : un FEC réel peut compter des centaines de milliers de lignes,
ce qui dépasserait le quota `localStorage` (~5-10 Mo). Le détail est
recalculé à la demande en ré-analysant le fichier FEC d'origine (fonction
`parseFECFile`, ré-invoquée à l'ouverture du grand livre). **C'est la bonne
décision architecturale, déjà prise** — elle doit être conservée telle
quelle dans la version cloud (cf. §3.6).

### 1.4 Fonctions de stockage (pattern répété × 6 modules)

Chaque module a son triplet `loadXStore()` / `saveXStore(data)` /
`saveX(record)` (+ `deleteXById(id)`, `listX()`), tous synchrones,
try/catch autour de `JSON.parse`/`localStorage.setItem`, gestion explicite
de `QuotaExceededError`. C'est un point positif majeur : **le point
d'extension pour une couche cloud existe déjà, il est juste dupliqué 6
fois** au lieu d'être factorisé.

### 1.5 Import et parsing FEC

- `parseFECFile(text)` (~129 lignes) : parseur synchrone, détection
  d'encodage UTF-8/Latin-1, tolérant aux FEC mal formés (démontré par
  `test_e2e_polluted.js`). Retourne `{bal, libs, months, rawLines, ledger,
  nbLines, nbAN, ...}`.
- **Bloquant** : aucun Web Worker, aucun découpage en lots. Sur un FEC de
  plusieurs centaines de milliers de lignes, l'UI gèle pendant le parsing
  (risque déjà identifié par l'utilisateur en §23 de sa demande).
- Entrées utilisateur : 4 `<input type="file">` distincts (upload initial,
  upload dossier vide, glisser-déposer), tous routés vers les mêmes
  fonctions de parsing.

### 1.6 Sécurité côté client (déjà en place)

- `escHtml()` utilisée 72 fois, `test_xss.js` dédié — les libellés FEC, noms
  de fichier, noms de dossier passent par cette fonction avant insertion
  DOM. 78 assignations `innerHTML` au total, la quasi-totalité construites
  via des template strings passant par `escHtml()` sur les données
  utilisateur — **pas un audit formel exhaustif ligne par ligne**, mais un
  pattern cohérent et déjà testé.
- Aucun `eval()`, aucune clé API, aucun secret dans le code (cohérent avec
  l'absence totale de backend aujourd'hui).

### 1.7 Variables globales notables (état applicatif, non persistant en tant que tel)

`ACTIVE` (dossier ouvert), `CURRENCY`, `PERIOD`, `RANGE_N`, `CH` (instances
Chart.js), `_compareExIdCR`/`_compareExIdBilan`, et un état actif par
module (`REMU_ACTIVE`, `TNS_ACTIVE`, `IRPP_ACTIVE`, `TNS_CAISSE_DRAFT`,
etc.). Toutes ces variables représentent la « fenêtre de travail
courante » — elles n'ont pas vocation à être synchronisées telles quelles ;
seul ce qui est explicitement sauvegardé (`saveActiveDossier()`,
`saveX()`) doit devenir la source de vérité cloud.

---

## 2. Problèmes identifiés (par rapport à l'objectif SaaS multi-tenant)

1. **Aucune notion d'utilisateur, de cabinet, ni d'authentification.**
   Tout ce qui existe est local à un navigateur sur un poste.
2. **`localStorage` est aujourd'hui la seule source de vérité** — objectif
   explicite de l'utilisateur : ça ne doit plus être le cas à terme.
3. **Pas de séparation stockage/métier** : chaque écran appelle directement
   `localStorage.getItem/setItem`. Migrer vers un backend « en place »
   obligerait à toucher des dizaines de points d'appel dispersés — **sauf
   si on introduit d'abord une couche d'abstraction (Phase 2)**.
4. **Zéro tooling de build.** Un vrai backend + une vraie synchronisation
   nécessitent au minimum : un `package.json`, un client HTTP/SDK
   (Supabase JS, ou fetch), potentiellement un bundler pour ne pas grossir
   indéfiniment le fichier HTML. C'est un changement de nature du projet,
   pas une simple fonctionnalité en plus.
5. **Parsing FEC bloquant** — deviendra plus visible à mesure que les
   dossiers grossissent en usage cabinet multi-clients.
6. **Pas de tests de sécurité/autorisation** (normal : il n'y a rien à
   autoriser aujourd'hui) — à construire en même temps que le multi-tenant,
   pas après.
7. **`localStorage` a un quota par origine (~5-10 Mo)** — déjà contourné
   intelligemment pour le `ledger`, mais un cabinet avec des dizaines de
   dossiers × plusieurs exercices × mappings pourrait s'en approcher même
   sans le détail écriture par écriture. Argument de plus pour le cloud.
8. **Pas de CI.** Les 326 tests ne s'exécutent que si quelqu'un pense à
   lancer `node tests/run_all.js`.

Aucun de ces points n'est un défaut de conception du code métier lui-même
— les moteurs de calcul (`PrevisionnelEngine`, `TnsEngine`,
`RemunerationEngine`, `IrppEngine`) sont déjà propres, purs et testés. Le
travail à faire est **structurel autour** de ce noyau, pas une réécriture
du noyau.

---

## 3. Architecture cible recommandée

### 3.1 Backend : Supabase (PostgreSQL + Auth + Storage + RLS)

Recommandation motivée, comparée aux alternatives réalistes :

| Critère | Supabase | AWS (RDS+Cognito+S3, à la carte) | Firebase |
|---|---|---|---|
| PostgreSQL natif (types stricts, `numeric` pour les montants) | ✅ | ✅ (RDS) | ❌ (NoSQL, mal adapté aux montants/relations comptables) |
| Row Level Security native, au niveau base | ✅ (cœur du produit) | possible mais manuel | ❌ |
| Auth intégrée (email/password, magic link, futur MFA) | ✅ | à assembler (Cognito) | ✅ mais écosystème NoSQL |
| Storage privé + politiques d'accès + URLs signées | ✅ | ✅ (S3 + IAM, plus de configuration) | ✅ |
| Hébergement UE | ✅ (région `eu-west-*` sélectionnable) | ✅ | région EU dispo mais écosystème US par défaut |
| Coût de démarrage / maintenance pour une équipe d'1 personne | faible (un seul projet à gérer) | élevé (plusieurs services à assembler et sécuriser séparément) | faible mais mauvais fit données relationnelles |
| Migrations SQL versionnées | ✅ (CLI native) | via Terraform/manuel | N/A |

**PostgreSQL + RLS est le bon choix technique indépendamment du
fournisseur** (l'utilisateur le suggère lui-même à raison) : la RLS
applique l'isolation multi-tenant **dans la base**, pas seulement dans le
code applicatif — c'est la seule façon de respecter la règle §6 de la
demande (« ne jamais considérer qu'un simple masquage dans l'interface
constitue une sécurité suffisante »). Supabase est la manière la plus
rapide et la plus sûre d'obtenir Postgres + Auth + Storage + RLS déjà
intégrés, sans réinventer l'authentification ou la gestion de sessions
soi-même (risque de sécurité si fait maison).

**Ce que je ne ferai jamais, conformément à la demande** : désactiver la
RLS pour contourner un problème de développement, exposer la clé
`service_role` (clé admin) dans le navigateur, ou faire confiance à un
`organization_id`/`dossier_id` envoyé par le client sans le revérifier
côté politique RLS.

### 3.2 Modèle de données (schéma minimal viable, extensible)

```
organizations            -- cabinets
  id, name, created_at

profiles                 -- 1:1 avec auth.users (Supabase Auth)
  id (= auth.users.id), email, first_name, last_name,
  created_at, last_sign_in_at

organization_members     -- appartenance + rôle
  id, organization_id, user_id, role  (admin | manager | collaborator | read_only)
  status (active | suspended | invited), invited_by, created_at

dossiers                 -- ex-"ACTIVE" par dossier
  id, organization_id, name, group_label, siren,
  is_rd_company, revenue_types (jsonb),
  created_at, updated_at, created_by, updated_by,
  deleted_at (soft delete)

dossier_permissions
  id, organization_id, dossier_id, user_id,
  permission_level (none | read | write | manage),
  created_at, created_by

exercises                -- ex ACTIVE.exercices[x]
  id, dossier_id, organization_id, label,
  period_start, period_end, filename,
  imported_at, created_by

fec_files                -- métadonnées + pointeur Storage (jamais le contenu en clair en base)
  id, exercise_id, organization_id, storage_path,
  original_filename, size_bytes, sha256, encoding_detected,
  uploaded_by, uploaded_at

account_balances         -- ex exercise.bal (une ligne par compte, pas par écriture)
  id, exercise_id, organization_id, account_number, label,
  debit numeric(14,2), credit numeric(14,2), balance numeric(14,2)

mappings                 -- ex ACTIVE.mps.cr / .bilan
  id, dossier_id, organization_id, kind ('cr'|'bilan'), structure (jsonb),
  version, updated_at, updated_by

previsionnels / tns_simulations / remuneration_simulations / irpp_declarations
  id, dossier_id, organization_id, payload (jsonb structuré selon le moteur pur existant),
  created_at, updated_at, created_by, updated_by

audit_logs
  id, organization_id, user_id, action, entity_type, entity_id,
  metadata (jsonb), created_at

entity_versions           -- historique ciblé (mappings, permissions, suppressions...)
  id, organization_id, entity_type, entity_id, diff (jsonb),
  created_by, created_at
```

Points clés :
- **`organization_id` sur chaque table métier**, y compris les tables
  filles (`exercises`, `mappings`...) en dénormalisé — plus rapide et plus
  sûr à écrire en politique RLS qu'une jointure remontant systématiquement
  à `dossiers`.
- **Montants en `numeric(14,2)`**, jamais en `float`/`double precision` —
  conforme à l'exigence §20 et à la nature comptable des données (déjà le
  cas côté JS : les moteurs actuels utilisent des `Number` JS classiques,
  ce qui est un flottant IEEE-754 ; à la frontière DB il faut arrondir/typer
  strictement pour éviter toute dérive cumulative).
- **`fec_files` ne stocke jamais le contenu du FEC en base** — uniquement
  un pointeur vers Supabase Storage (bucket privé) + métadonnées. Cf. §3.6.
- **Pas de table `journal_entries` (écriture par écriture) dans le MVP** —
  décision argumentée en §3.6, cohérente avec le choix déjà fait côté
  `localStorage` aujourd'hui.

### 3.3 Politiques RLS (principe, pas encore implémenté dans ce commit)

Chaque table métier : `organization_id = (select organization_id from
organization_members where user_id = auth.uid() and status = 'active')`
**et**, pour les tables liées à un dossier, une politique additionnelle
vérifiant `dossier_permissions.permission_level != 'none'` pour l'utilisateur
courant sur ce `dossier_id` précis. Deux niveaux de policy empilés
(organisation, puis dossier) — jamais un seul niveau, pour respecter
strictement §8 de la demande (accès par dossier, pas seulement par
cabinet).

### 3.4 Couche d'abstraction du stockage (le cœur de la Phase 2, implémentée dans ce commit)

**Contrainte technique découverte pendant l'audit, qui change l'implémentation
prévue initialement** : `tests/harness.js` (`extractMainScript`) exige
« exactement 1 `<script>` inline sans `src` » et n'exécute jamais de
fichier externe — c'est la seule protection anti-régression du projet. Par
ailleurs, le fichier est aujourd'hui ouvert directement via `file://` sans
serveur. Extraire dès maintenant le stockage vers de vrais fichiers
`src/storage/*.js` chargés en `<script src=...>` **casserait silencieusement
les 326 tests existants** (le code déplacé deviendrait invisible pour le
bac à sable Node) sans apporter de bénéfice tant qu'aucun backend réel
n'existe pour justifier l'ajout d'une étape de build.

**Décision retenue pour ce commit** : implémenter le pattern Repository
**à l'intérieur du même `<script>` inline**, en remplaçant les 6 triplets
dupliqués `loadXStore/saveXStore/saveX/deleteXById/listX` par un seul
générateur `createLocalStorageRepository(storeKey)` renvoyant une interface
commune (`{get, list, save, remove}`), plus un adapter explicite pour le cas
particulier des « barèmes par année » (surcharge par sous-clé). Chaque
module appelle désormais son repository plutôt que `localStorage`
directement — la substitution par un `CloudRepository` (Phase 7+) ne
touchera alors qu'un seul point de construction par module, jamais les
écrans. La vraie séparation en fichiers `src/` (et l'étape de build qui
va avec) est reportée à la Phase 3, au moment où un serveur devient de
toute façon nécessaire pour parler à Supabase — décision à reconfirmer à
ce moment-là plutôt qu'imposée maintenant.

### 3.5 Cache local : IndexedDB en Phase 11+, pas maintenant

L'utilisateur demande explicitement de ne pas considérer IndexedDB comme
obligatoire dès le départ (§22 : « si cela est pertinent »). Introduire
IndexedDB avant même qu'un backend existe n'apporterait aucun bénéfice
(il n'y a rien à mettre en cache localement en attendant une
synchronisation qui n'existe pas encore) et ajouterait de la complexité
prématurée. **Recommandation : reporter IndexedDB à la Phase 11**, une
fois le backend et la synchronisation en place — l'interface
`Repository` conçue en Phase 2 est justement conçue pour ne pas avoir à
retoucher les écrans à ce moment-là.

### 3.6 Décision argumentée — gros FEC et granularité de stockage

Trois options considérées :
1. **Stocker chaque écriture en base** (`journal_entries`, une ligne par
   écriture FEC) : le plus « complet », mais un FEC de 500 000 lignes
   représente 500 000 lignes DB par exercice, par dossier, pour un cabinet
   qui peut avoir des dizaines de dossiers. Coût de stockage et de
   requêtage élevé, pour un bénéfice quasi nul : le produit n'a besoin de
   l'écriture individuelle que dans le grand livre, un écran de
   consultation, jamais dans les calculs (CR/SIG/Bilan/Trésorerie/
   prévisionnel/TNS/Rémunération/IRPP travaillent tous sur la balance
   agrégée `bal`, jamais sur `rawLines`).
2. **Ne stocker que la balance agrégée**, et perdre le grand livre côté
   cloud (il faudrait re-télécharger et re-parser le fichier FEC original
   à chaque fois) : perte de fonctionnalité par rapport à l'existant.
3. **(Retenue) Fichier FEC original privé dans Supabase Storage +
   balance agrégée en base** : identique au choix déjà fait aujourd'hui en
   local (`ledger` non persisté, ré-analysé à la demande), sauf que la
   source à re-parser devient le fichier stocké dans le cloud (accessible
   uniquement via URL signée temporaire, jamais publique) plutôt qu'un
   fichier local disparu à la fermeture de l'onglet. Le grand livre reste
   consultable depuis n'importe quel poste autorisé (exigence §35.8) sans
   dupliquer des centaines de milliers de lignes en base.

C'est l'option 3 qui est retenue dans le modèle de données ci-dessus
(`fec_files` + `account_balances`), et qui préserve exactement le
compromis performance/complétude déjà validé par le code actuel.

### 3.7 Parsing FEC — Web Worker (Phase 11)

Le parseur actuel (`parseFECFile`) est une fonction pure prenant une
`string` et retournant un objet — **elle peut être déplacée dans un Web
Worker sans aucune réécriture de sa logique interne**, seulement de son
point d'appel (poster le texte du fichier au worker, recevoir le résultat
par message, avec des événements de progression insérés dans la boucle de
parsing existante). Reporté en Phase 11 (optimisation), après que le
backend et l'auth soient stables — ce n'est pas un prérequis des phases
1-10.

---

## 4. Fichiers à créer

```
SAAS_ARCHITECTURE.md              -- ce document (créé)
tests/test_storage_repository.js  -- Phase 2 (créé dans ce commit)

-- Écrits mais non applicables tant qu'aucun projet Supabase n'existe (§9) :
supabase/
  config.toml
  migrations/
    0001_organizations_and_auth.sql
    0002_dossiers_and_permissions.sql
    0003_exercises_and_fec_files.sql
    0004_module_data.sql          -- previsionnels/tns/remuneration/irpp
    0005_audit_and_versioning.sql
    0006_rls_policies.sql

-- Créés seulement à partir de la Phase 3, une fois un serveur nécessaire
-- (cf. §3.4 — pas de split prématuré en fichiers src/) :
package.json, .env.example, src/storage/*.js, src/auth/, src/organizations/, src/audit/
```

## 5. Fichiers à modifier (au fil des phases, jamais en une fois)

- `FEC_Analyse_v6.html` : les 6 triplets `loadXStore/saveXStore/saveX/
  deleteXById/listX` remplacés par un repository généré via
  `createLocalStorageRepository()` (Phase 2, non-fonctionnel — même
  comportement, mêmes clés `localStorage`, juste une indirection). Les
  écrans, moteurs de calcul, et le parseur FEC **ne sont pas touchés**.
- `tests/run_all.js` : nouvelles sections ajoutées, jamais de section
  existante supprimée.
- `CHANGELOG.md` : une entrée par phase livrée, comme pour toutes les
  fonctionnalités précédentes de ce dépôt.

## 6. Stratégie de migration des données locales → cloud

Implémentée en Phase 9, seulement après que Phases 3-8 soient stables :

1. À la première connexion authentifiée depuis un navigateur qui possède
   des données dans `localStorage` (détection via les 8 clés inventoriées
   en §1.3) : bandeau nom informatif, jamais bloquant.
2. Aperçu des dossiers/simulations détectés **avant** tout envoi réseau.
3. Détection de doublons (par nom + SIREN si disponible) → demande de
   confirmation explicite en cas de conflit, jamais de fusion silencieuse.
4. Upload progressif avec état visible (§30 : « Enregistrement... » /
   « Enregistré » / erreur avec retry).
5. **Les données locales ne sont jamais supprimées automatiquement** —
   seulement proposées à la suppression après confirmation explicite que
   la migration a réussi (vérification : relecture depuis le cloud after
   écriture, pas seulement absence d'erreur réseau).

## 7. Risques

| Risque | Sévérité | Mitigation |
|---|---|---|
| RLS mal configurée → fuite inter-cabinets | **Critique** | Tests d'isolation dédiés obligatoires avant toute mise en production (§24 point 1), revue manuelle de chaque policy, jamais de RLS désactivée pour débugger |
| Regression sur les 326 tests existants pendant l'extraction du storage | Élevé | Phase 2 strictement non-fonctionnelle (mêmes clés, même format JSON), suite complète relancée après chaque commit |
| Volume FEC → dégradation performance base | Moyen | Option 3 du §3.6 (balance agrégée + fichier privé), jamais de table `journal_entries` par défaut |
| Perte de données locales pendant la migration | Élevé | Jamais de suppression avant confirmation explicite post-succès (§6) |
| Coût Supabase à l'échelle (nombreux cabinets, gros FEC en Storage) | Moyen | À chiffrer une fois le volume réel connu ; commencer sur le plan gratuit/Pro le temps du développement |
| Complexité ajoutée par un mauvais découpage de fichiers | Moyen | Respecter la limite « ne pas créer des dizaines de petits fichiers sans intérêt » (§28) — un fichier par responsabilité claire, pas plus |
| Session de développement actuelle sans accès réseau externe | **Bloquant pour les phases 3+** | Voir section suivante |

## 8. Ordre de travail retenu (aligné sur les 12 phases demandées)

| Phase | Contenu | Réalisable dans ce commit ? |
|---|---|---|
| 1 | Audit + stabilisation | ✅ Ce document + suite de tests déjà à 326/326 |
| 2 | Couche de stockage abstraite | ✅ Implémentée immédiatement après ce rapport |
| 3 | Base de données + modèle multi-tenant | ⚠️ Schéma conçu (§3.2), migrations SQL peuvent être écrites, **mais ne peuvent pas être appliquées** sans un projet Supabase réel |
| 4 | Authentification | ⚠️ Nécessite le projet Supabase de la Phase 3 |
| 5-12 | Cabinets/utilisateurs, rôles, sync, migration, audit, perf, tests sécurité | ⚠️ Dépendent toutes d'un backend existant |

---

## 9. Ce qui bloque au-delà de la Phase 2 — décision qui vous appartient

Ce point est exactement le type de décision « irréversible ou véritablement
structurante » que vos propres instructions (§32) me demandent de vous
signaler plutôt que de trancher seul :

- **Je n'ai pas accès à internet** dans cet environnement d'exécution
  (vérifié : tous les domaines externes testés — y compris des services
  d'infrastructure — retournent une erreur `403` de la politique réseau du
  bac à sable). Je ne peux donc **ni créer un projet Supabase, ni y
  connecter quoi que ce soit, ni exécuter la moindre migration SQL contre
  une base réelle** depuis cette session.
- Pour passer aux Phases 3+, il faut que **vous** (ou un environnement
  avec accès réseau) :
  1. Créiez un projet Supabase (région UE — `eu-west-1`/`eu-central-1`),
  2. Me communiquiez (ou configuriez directement) l'URL du projet et la
     clé publique (`anon key`) — **jamais la clé `service_role`** dans le
     dépôt ou dans le navigateur,
  3. Choisissiez où héberger la version web de l'application (Vercel,
     Netlify, ou autre — un simple fichier statique ne suffit plus dès
     qu'il y a un SDK Supabase à charger et des variables d'environnement
     à injecter au build).
- Les migrations SQL (§3.2) peuvent être **écrites et versionnées dans ce
  dépôt dès maintenant** (Phase 3 « design ») pour que tout soit prêt à
  être appliqué dès qu'un projet existe — c'est un travail que je peux
  faire sans accès réseau, et je le ferai à la suite si vous le souhaitez.

---

## 10. Implémenté dans ce commit (Phase 1 + Phase 2)

Voir `CHANGELOG.md` pour le détail précis. Résumé :
- Ce document (`SAAS_ARCHITECTURE.md`).
- `createLocalStorageRepository(storeKey)` : générateur de repository
  générique (`{get, list, save, remove, subscribeStatus}`), inline dans le
  `<script>` existant (cf. §3.4 pour la justification de ne pas encore
  extraire de fichiers séparés).
- Les 6 triplets de stockage dupliqués (Dossiers excepté — cf. `CHANGELOG.md`
  pour le détail des modules couverts) réécrits pour déléguer à ce
  repository, **sans aucun changement de comportement** (mêmes clés
  localStorage, mêmes formats JSON, mêmes garde-fous QuotaExceededError).
- État de sauvegarde visible et unifié (`repository.save()` expose un
  statut enregistrement/enregistré/erreur, prêt à être branché sur l'UI
  « Enregistrement... » de la Phase 8 sans nouvelle refonte).
- `tests/test_storage_repository.js`.
- Suite complète re-vérifiée verte après extraction (326 tests avant,
  détail après dans `CHANGELOG.md`).
