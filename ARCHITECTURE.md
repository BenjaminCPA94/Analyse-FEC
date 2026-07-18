# ARCHITECTURE — FEC Analyse

Ce document décrit l'architecture **réelle et actuelle** de l'application
(pas une architecture cible aspirationnelle — celle-ci est esquissée en fin
de document, §Trajectoire). Il est mis à jour au fil des chantiers de
fiabilisation ; voir `AUDIT_CORRECTIONS.md` pour le détail des correctifs
et `CHANGELOG.md` pour l'historique fonctionnel complet.

## 1. Organisation du code

L'application est un **unique fichier HTML** (`FEC_Analyse_v6.html`,
~12 700 lignes) contenant HTML, CSS et JavaScript dans un seul
`<script>` inline. Ce choix n'est pas accidentel : `tests/harness.js`
(`extractMainScript()`) extrait et exécute ce script dans un bac à sable
Node (`vm`) pour tester les fonctions métier sans navigateur — il exige
exactement un `<script>` inline sans attribut `src`. Toute tentative de
scinder le fichier en modules externes doit d'abord adapter le harnais de
test, sous peine de rendre tout le code invisible aux 519 tests
automatiques existants (cf. `AUDIT_CORRECTIONS.md`, leçon retenue lors du
chantier SaaS Phase 2).

Le fichier est organisé en sections thématiques séparées par des
commentaires bannière (`// ═══...`), dans cet ordre approximatif :
constantes de stockage → état global (`ACTIVE`, etc.) → helpers de
formatage/sécurité (`escHtml`, `csvSafeValue`, `fmtV`...) → moteur FEC
(parsing, mapping, agrégation) → rendu CR/SIG/Bilan/Trésorerie/Grand
livre → module Prévisionnel → module TNS → module Rémunération dirigeant
→ module IRPP → écrans (dossiers, paramètres, import) → point d'entrée
(`DOMContentLoaded`).

Aucun outil de build, aucune dépendance npm pour l'application elle-même
(`package.json` n'existe qu'à la racine pour les scripts auxiliaires, ex.
`scripts/pennylane-sync/`). Une seule dépendance externe : Chart.js, chargé
depuis un CDN (`<script src="https://cdnjs.cloudflare.com/...">`) — non
encore hébergé localement (cf. `AUDIT_CORRECTIONS.md` §"Chart.js local").
Tous les appels à l'API Chart.js sont protégés par un garde
`if (typeof Chart === 'undefined') return;` : l'absence du CDN (usage hors
ligne, réseau bloqué) dégrade gracieusement (pas de graphique) au lieu de
faire planter l'application.

## 2. Stockage

**100% local, aucune donnée envoyée à un serveur.** Persistance exclusive
via `localStorage`, sous 8 clés listées de façon centralisée dans
`ALL_STORAGE_KEYS` (cf. `AUDIT_CORRECTIONS.md` §1) :

| Clé | Contenu |
|---|---|
| `fec_analyse_v2` | Dossiers (bal, mapping, exercices) |
| `fec_analyse_previsionnels_v1` | Prévisionnels |
| `fec_analyse_tns_caisses_v1` | Paramétrage des caisses TNS |
| `fec_analyse_tns_v1` | Simulations TNS |
| `fec_analyse_regles_remuneration_par_annee_v1` | Barèmes rémunération par année |
| `fec_analyse_remuneration_v1` | Simulations rémunération |
| `fec_analyse_regles_irpp_par_annee_v1` | Barèmes IRPP par année |
| `fec_analyse_irpp_v1` | Déclarations IRPP |

**Ce qui n'est jamais persisté** : le détail écriture-par-écriture (grand
livre, `ACTIVE.ledger`) — conservé en mémoire uniquement pendant la
session, pour éviter de dépasser le quota localStorage (~5-10 Mo) sur un
FEC volumineux. Conséquence assumée et documentée dans l'UI : rouvrir un
dossier après rechargement de page ne permet plus de consulter le détail
d'un compte au grand livre tant que le FEC n'est pas réimporté.

**IndexedDB** : non utilisé à ce jour. `deleteAllIndexedDbData()` existe
déjà (no-op sûr) en préparation de la migration Phase 5 du chantier de
fiabilisation, pour garantir qu'une suppression complète des données reste
complète après cette migration.

### Sauvegarde et restauration

- **Sauvegarde individuelle** : bouton "Sauvegarder en JSON" par dossier
  (`exportDossierJSON()`) — télécharge un fichier JSON contenant le
  dossier complet (bal, mapping, exercices), horodaté.
- **Restauration** : "Importer (JSON)" (`importDossierJSON()`) — recrée un
  nouvel identifiant de dossier (jamais d'écrasement d'un dossier
  existant), force la régénération du mapping (`mps_version: 0`) plutôt
  que de faire confiance à un mapping importé.
- **Suppression complète** : cf. `AUDIT_CORRECTIONS.md` §1 —
  `deleteAllLocalData()` + `deleteAllIndexedDbData()`, avec vérification
  post-suppression.
- **Sauvegarde de secours (audit)** : avant toute intervention de
  fiabilisation, une copie intégrale du fichier est conservée dans
  `backups/` et dans l'historique git.

## 3. Flux d'import FEC

1. L'utilisateur dépose ou sélectionne un fichier FEC/Grand Livre
   (`.txt`/`.csv`).
2. `decodeFecBuffer()` détecte l'encodage réel (BOM UTF-8 → UTF-8 ;
   sinon tentative UTF-8 stricte ; repli sur Windows-1252, encodage
   historique le plus courant des exports FEC français) — plutôt que de
   forcer un encodage unique.
3. `parseFECFile(text)` résout les colonnes obligatoires par **nom
   d'en-tête** (indépendant de l'ordre), accepte tabulation ou `|` comme
   séparateur, tolère montants à virgule décimale. Nettoie les caractères
   HTML dangereux des numéros de compte (cf. `tests/test_xss.js`).
   Construit `bal` (solde agrégé par compte), `libs` (libellés), `months`
   (agrégats mensuels CA/charges/trésorerie) et `ledger` (détail par
   compte, mémoire uniquement).
4. Un mapping PCG initial est généré automatiquement
   (`defaultMPS_CR`/`defaultMPS_Bilan`) puis les comptes non couverts sont
   affectés automatiquement (`autoAffectOrphans()`, table `ROUTING`, 476
   règles par préfixe de compte).
5. Le dossier est enregistré (`store[id] = {...}`) et ouvert.

**Limite actuelle documentée** (Phase 2 du chantier de fiabilisation, non
encore construite) : pas de rapport d'import structuré (comptage
lignes valides/rejetées, écart débit/crédit, doublons, export des
anomalies) — le parseur rejette silencieusement les lignes malformées au
lieu de les recenser dans un écran dédié.

## 4. Moteur de mapping

Un dossier a un mapping (`ACTIVE.mps = { cr: [...], bilan: [...] }`),
partagé entre tous ses exercices (limite documentée pour les comptes
mixtes — cf. `AUDIT_CORRECTIONS.md` §"Prochaines étapes"). Chaque groupe a
un `id`, un `label` (renommable via `mpRename()` — **les libellés de
mapping sont une entrée utilisateur libre, traitée comme telle du point de
vue sécurité, cf. §5**), un `type` (`normal`/`subtotal`/`total`), des
`accounts` et/ou `subs` (sous-catégories). `renderMapping()` affiche
l'écran d'édition ; `toggleGroup()` gère le dépliage dans les tableaux de
résultats.

Un dossier de type **Consolidé** (agrégation simple de plusieurs dossiers
Reporting du même groupe — cf. CHANGELOG.md) a son propre mapping
indépendant, généré sur son `bal` agrégé, jamais partagé avec ses membres.
Sa vue "Contributif en colonnes" réutilise ce même mapping pour afficher
la contribution de chaque société, sans dupliquer la logique de
présentation.

## 5. Moteurs de calcul

Chaque module (CR/SIG, Bilan, Trésorerie, Prévisionnel, TNS, Rémunération
dirigeant, IRPP) est un ensemble de fonctions pures ou quasi-pures opérant
sur l'état global du module (`ACTIVE`, `PREV_ACTIVE`, `TNS_ACTIVE`,
`REMU_ACTIVE`, `IRPP_ACTIVE`) et des catalogues de barèmes versionnés par
année (`PASS_PAR_ANNEE`, caisses TNS, règles rémunération/IRPP), résolus
via `anneeResolue()` — **actuellement un repli silencieux vers l'année
disponible la plus proche, sans distinction "exact"/"repli" ni statut de
validation, cf. `AUDIT_CORRECTIONS.md` §"Barèmes"**, à corriger avant de
considérer cette partie comme fiable pour un usage professionnel réel.

Les résultats TNS/Rémunération/IRPP ne portent pas encore la mention de
simulation à valider par un professionnel demandée — à ajouter avec le
correctif barèmes.

## 6. Règles de sécurité

- **Échappement HTML** : toute donnée d'origine utilisateur ou FEC
  (libellés de compte, noms de dossier/poste, noms de fichier) doit passer
  par `escHtml()` avant toute injection dans `innerHTML`. Préférer
  `textContent`/`createElement()` quand le contenu n'a pas besoin de
  structure HTML. Cf. `AUDIT_CORRECTIONS.md` §2 pour l'historique des
  vecteurs XSS trouvés et corrigés, et `tests/test_xss.js` pour la
  non-régression.
- **Export CSV** : toute cellule passe par `csvEscapeCell()` (qui
  applique `csvSafeValue()` en premier) avant d'être écrite dans un
  fichier CSV — protection contre l'injection de formule (OWASP "CSV
  Injection"). Cf. `tests/test_csv_injection.js`.
- **Identifiants HTML** : chaque id doit être unique dans le document
  (`tests/test_html_ids.js` échoue sinon). Cf. `AUDIT_CORRECTIONS.md` §4
  pour un exemple concret des bugs fonctionnels que provoque une
  violation de cette règle (pas seulement un problème de validité HTML).
- **Fonctions globales** : chaque fonction top-level ne doit être déclarée
  qu'une fois (`tests/test_duplicate_functions.js` échoue sinon) — une
  redéclaration écrase silencieusement la précédente en JavaScript, sans
  erreur visible.
- **Aucune donnée fabriquée** : les barèmes fiscaux/sociaux ne sont jamais
  extrapolés silencieusement (principe déjà appliqué à `PASS_PAR_ANNEE`
  et aux caisses TNS ; à renforcer avec le statut `draft`/`validated`, cf.
  `AUDIT_CORRECTIONS.md`).
- **CSP** : non encore mise en place (dépend de l'hébergement local de
  Chart.js et de la réduction des `onclick=` inline — cf.
  `AUDIT_CORRECTIONS.md`, Phase 1 restante).

## 7. Tests

`tests/run_all.js` exécute séquentiellement ~26 suites de tests (une par
fichier `tests/test_*.js`), affiche un décompte par suite puis un total.
Chaque suite exporte `run(htmlPath)` (synchrone ou retournant une
`Promise`) et est exécutée dans un bac à sable Node isolé
(`tests/harness.js`) — jamais dans un vrai navigateur pour les tests
unitaires. Les vérifications de parcours UI complet (rendu réel,
interactions clavier/souris, captures d'écran) sont faites ponctuellement
en Playwright headless, hors de la suite `run_all.js` (pas encore
industrialisées en Phase 7).

État actuel : 519 tests, 0 échec (cf. `AUDIT_CORRECTIONS.md` pour le
détail par correctif).

## 8. Trajectoire (non commencée à ce stade)

Les phases suivantes du chantier de fiabilisation demandé restent à
faire, dans cet ordre de priorité (cf. `AUDIT_CORRECTIONS.md` pour le
détail) : validation FEC structurée (Phase 2), comptes mixtes par signe
(Phase 3), renommage du module Consolidé (Phase 4, en attente de
confirmation), migration IndexedDB + Web Worker (Phase 5), découpage
modulaire progressif en ES modules (Phase 6, architecture cible esquissée
dans la demande initiale), tests automatisés étendus (Phase 7),
améliorations fonctionnelles par module (Phase 8), accessibilité
(Phase 9). Aucune de ces phases ne doit être entamée par une réécriture
totale immédiate — règle impérative de la demande initiale.
