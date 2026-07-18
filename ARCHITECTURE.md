# ARCHITECTURE — FEC Analyse

Ce document décrit l'architecture **réelle et actuelle** de l'application
(pas une architecture cible aspirationnelle — celle-ci est esquissée en fin
de document, §Trajectoire). Il est mis à jour au fil des chantiers de
fiabilisation ; voir `AUDIT_CORRECTIONS.md` pour le détail des correctifs
et `CHANGELOG.md` pour l'historique fonctionnel complet.

## 1. Organisation du code

L'application est un **unique fichier HTML** (`FEC_Analyse_v6.html`,
~13 400 lignes) contenant HTML, CSS et JavaScript dans un seul
`<script>` inline, **ouvert directement en local (`file://`), sans
serveur ni build**. Ce n'est pas un détail secondaire : de vrais modules
ES (`<script type="module" src="...">`) répartis sur plusieurs fichiers
**ne se chargent pas via `file://`** dans la plupart des navigateurs
(restriction CORS sur les imports de modules) — les scinder casserait
l'usage "ouvrir le fichier et ça marche" (partage d'un seul fichier entre
postes, aucune installation). C'est un choix délibéré, confirmé avec
l'utilisateur lors du chantier de modularisation (Phase 6, cf. §8).

`tests/harness.js` (`extractMainScript()`) extrait et exécute ce script
dans un bac à sable Node (`vm`) pour tester les fonctions métier sans
navigateur — il exige exactement un `<script>` inline sans attribut
`src`. Toute tentative de scinder le fichier en fichiers `.js` externes
casserait donc à la fois la distribution (`file://`) et le harnais de
699 tests existants ; c'est pourquoi la modularisation en cours se fait
**à l'intérieur du fichier unique**.

**Convention de modularisation interne** (Phase 6, en cours,
progressive) : les parties du code correspondant à un domaine métier
cohérent sont regroupées en **espaces de noms IIFE** exposant une API
publique restreinte (état/fonctions internes encapsulés dans la
fermeture, jamais accessibles depuis l'extérieur) — le même motif que
`PrevisionnelEngine`/`TnsEngine`/`RemunerationEngine`/`IrppEngine`
(présents avant ce chantier) étend désormais à `ComptesMixtesEngine`
(détection/correction des comptes mixtes, cf. `AUDIT_CORRECTIONS.md`
§11). Convention pour toute extraction future :
```js
const NomDuModule = (function () {
  function fonctionPrivee() { /* jamais exposée */ }
  function fonctionPublique() { /* ... */ }
  return { fonctionPublique }; // API publique explicite
})();
```
Les appels depuis le reste du code (y compris depuis des attributs
`onclick="..."` générés dynamiquement) utilisent la forme
`NomDuModule.fonctionPublique(...)` — `NomDuModule` étant une `const` de
premier niveau, elle est bien accessible globalement comme n'importe
quelle fonction, y compris depuis du HTML généré par `innerHTML`. Un
module partage volontiers des constantes de données avec d'autres
parties du code (ex. `MIXED_ROUTES`, utilisée à la fois par
`ComptesMixtesEngine` et par `autoAffectOrphans()`) — l'objectif de cette
modularisation est d'encapsuler la LOGIQUE et l'état internes de chaque
domaine, pas d'éliminer tout couplage avec l'état global partagé (`ACTIVE`,
`escHtml`, `toast`...), ce qui nécessiterait une réécriture complète hors
de propos ici (règle impérative n°6 de la demande : pas de réécriture
totale immédiate).

Le fichier reste par ailleurs organisé en sections thématiques séparées
par des commentaires bannière (`// ═══...`), dans cet ordre approximatif :
constantes de stockage → état global (`ACTIVE`, etc.) → helpers de
formatage/sécurité (`escHtml`, `csvSafeValue`, `fmtV`...) → moteur FEC
(parsing, rapport d'import, mapping, agrégation) → rendu
CR/SIG/Bilan/Trésorerie/Grand livre → module Prévisionnel → module TNS →
module Rémunération dirigeant → module IRPP → écrans (dossiers,
paramètres, import) → point d'entrée (`DOMContentLoaded`).

Aucun outil de build, aucune dépendance npm pour l'application elle-même
(`package.json` n'existe qu'à la racine pour les scripts auxiliaires, ex.
`scripts/pennylane-sync/`). Une seule dépendance externe : Chart.js, chargé
depuis un CDN (`<script src="https://cdnjs.cloudflare.com/...">`) — non
encore hébergé localement (cf. `AUDIT_CORRECTIONS.md` §"Chart.js local").
Tous les appels à l'API Chart.js sont protégés par un garde
`if (typeof Chart === 'undefined') return;` : l'absence du CDN (usage hors
ligne, réseau bloqué) dégrade gracieusement (pas de graphique) au lieu de
faire planter l'application. Le parsing FEC lui-même est déporté dans un
Web Worker construit dynamiquement (cf. §3) — seul cas où un "second
thread" existe, toujours au sein du même fichier (Worker construit via
`Blob`/`URL.createObjectURL`, jamais un fichier `.js` séparé).

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

**IndexedDB** : sert de **miroir de secours asynchrone** (Phase 5, cf.
`AUDIT_CORRECTIONS.md` §13) pour la clé `fec_analyse_v2` (dossiers) — PAS
la source de vérité principale. `loadStore()`/`saveStore()` restent
strictement synchrones (34 emplacements du code en dépendent) ;
`saveStore()` réplique chaque sauvegarde vers IndexedDB
(`idbBackupPutStore()`) en tâche de fond, y compris quand localStorage
lui-même échoue par dépassement de quota. Une restauration explicite
(`restaurerDepuisIndexedDB()`, bouton dans l'écran Confidentialité) reste
possible si localStorage est vidé/corrompu. `deleteAllIndexedDbData()`
(générique, `indexedDB.databases()`) supprime cette base sans
modification lors d'une suppression totale des données. Faire
d'IndexedDB la source de vérité principale (au lieu d'un miroir)
nécessiterait de convertir les 34 usages synchrones en async/await —
chantier distinct, volontairement non entrepris (cf. §8).

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

En parallèle du parsing (étape 3), `analyserQualiteImportFEC(text)`
produit un **rapport d'import structuré** (Phase 2, cf.
`AUDIT_CORRECTIONS.md` §10) : lecture indépendante du même texte
(n'affecte jamais les données réellement importées) comptant lignes
valides/rejetées avec raison précise, écart débit/crédit global, lignes
strictement dupliquées. Attaché à l'exercice (`ex.rapportImport`),
affiché dans l'onglet "Suivi des imports" avec export CSV dédié des
anomalies ; ne bloque jamais l'import (purement informatif).

Le parsing lui-même (`parseFECFile` + `analyserQualiteImportFEC`)
s'exécute dans un **Web Worker** construit dynamiquement
(`getFecParserWorker()`/`parseFECEnArrierePlan()`, Phase 5, cf.
`AUDIT_CORRECTIONS.md` §12) à partir du `.toString()` des fonctions
elles-mêmes (aucune duplication de code entre thread principal et
Worker), pour ne jamais geler l'interface sur un FEC volumineux — avec
repli synchrone transparent si `Worker`/`Blob` sont indisponibles.

## 4. Moteur de mapping

Un dossier a un mapping (`ACTIVE.mps = { cr: [...], bilan: [...] }`),
partagé entre tous ses exercices. Chaque groupe a un `id`, un `label`
(renommable via `mpRename()` — **les libellés de mapping sont une entrée
utilisateur libre, traitée comme telle du point de vue sécurité, cf.
§6**), un `type` (`normal`/`subtotal`/`total`), des `accounts` et/ou
`subs` (sous-catégories). `renderMapping()` affiche l'écran d'édition ;
`toggleGroup()` gère le dépliage dans les tableaux de résultats.

**Comptes mixtes** (classes 4 principalement — clients/fournisseurs,
TVA, comptes courants associés — dont le sens actif/passif dépend du
signe réel du solde, table `MIXED_ROUTES`) : `autoAffectOrphans()` les
classe correctement à leur PREMIER classement, mais ne les réévalue
jamais automatiquement si leur solde change de signe sur un exercice
ultérieur du même dossier (mapping partagé) — limitation assumée,
volontairement non corrigée par un déplacement automatique et silencieux
(règle impérative n°8 : ne jamais réécrire un classement sans geste
explicite). `ComptesMixtesEngine` (Phase 3 puis modularisé en Phase 6,
cf. `AUDIT_CORRECTIONS.md` §11) détecte cette incohérence
(`detecterIncoherences()`) et affiche un bandeau sur la page Bilan avec
correction en un clic (`reaffecterCompte()`/`reaffecterTous()`), jamais
automatique.

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
via `anneeResolue()`.

**Statut des barèmes** (Phase 1, cf. `AUDIT_CORRECTIONS.md` §7-8) : tout
barème créé par duplication est marqué `draft` (`creerMetaBareme()`) et
affiche un bandeau d'avertissement non ignorable
(`baremeAvertissementHtml()`) précisant année demandée/utilisée, source
et date, tant qu'il n'est pas explicitement validé (bouton "Valider" par
écran) ; l'IRPP hérite du statut non validé de la Rémunération
sous-jacente (`combinerMetaBareme()`). Les caisses TNS non paramétrées
(11 sur 16, valeurs `null` plutôt que `0` implicite) **bloquent
totalement** l'affichage d'un résultat chiffré
(`validerCompletudeCaisse()`) — seul cas de blocage strict, les autres
barèmes non validés affichent un avertissement mais ne bloquent pas
(sinon l'application serait inutilisable entre deux publications
officielles). Tous les résultats TNS/Rémunération/IRPP portent la
mention `MENTION_SIMULATION_PRO` (simulation à valider par un
professionnel).

**Limite assumée et non corrigée intentionnellement** : les barèmes
URSSAF réels (cotisations TNS) utilisent des formules progressives
lissées, approximées ici par un système de tranches simples — insuffisant
pour une déclaration officielle, avertissement déjà affiché à
l'utilisateur dans l'écran de calcul (`TnsEngine`). Implémenter les
formules réelles reviendrait à inventer/valider une règle fiscale sans
autorité pour le faire — hors de portée de cet audit (règle impérative
n°8).

**Prévisionnel — amortissement** (Phase 8, cf. `AUDIT_CORRECTIONS.md`
§15) : `calculerPlanAmortissement()` applique un prorata temporis
mensuel (dotation de l'exercice d'acquisition proportionnelle au mois
réel d'acquisition, `inv.mois`) au lieu d'une dotation pleine
systématique — non-régression garantie pour les investissements saisis
avec le mois par défaut (janvier).

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
  extrapolés silencieusement — statut `draft`/`validated` explicite,
  bandeau d'avertissement, mention de simulation obligatoire (cf. §5).
- **Accessibilité** (Phase 9, périmètre restreint, cf.
  `AUDIT_CORRECTIONS.md` §16) : fermeture au clavier (Échap) des fenêtres
  modales/menus ; `aria-label`/`role`/`tabindex` sur les contrôles les
  plus universellement présents (icône Paramètres, sélecteur de
  dossier). Ne couvre pas l'ensemble des éléments cliquables non
  sémantiques de l'application (99 `<div onclick>`/16 `<span onclick>`
  recensés, hors périmètre de cette passe).
- **CSP** : non encore mise en place (dépend de l'hébergement local de
  Chart.js et de la réduction des `onclick=` inline — cf. §8).

## 7. Tests

`tests/run_all.js` exécute séquentiellement ~35 suites de tests (une par
fichier `tests/test_*.js`), affiche un décompte par suite puis un total.
Chaque suite exporte `run(htmlPath)` (synchrone ou retournant une
`Promise`) et est exécutée dans un bac à sable Node isolé
(`tests/harness.js`) — jamais dans un vrai navigateur pour les tests
unitaires. Les vérifications de parcours UI complet (rendu réel,
interactions clavier/souris, captures d'écran) sont faites ponctuellement
en Playwright headless, hors de la suite `run_all.js` (pas encore
industrialisées — resterait à faire si la Phase 7 est reprise plus en
profondeur).

État actuel : 639 tests, 0 échec (cf. `AUDIT_CORRECTIONS.md` pour le
détail par correctif).

## 8. Trajectoire

Sur les 9 phases du chantier de fiabilisation demandé, les Phases 1
(correctifs critiques), 2 (rapport d'import), 3 (comptes mixtes), 4
(renommage Agrégation multi-sociétés), 5 (Web Worker + sauvegarde de
secours IndexedDB), 7 (extension ciblée des tests), 8 (prorata temporis
Prévisionnel) et 9 (accessibilité, périmètre restreint) sont traitées —
cf. `AUDIT_CORRECTIONS.md` pour le détail complet de chaque correctif.

**Phase 6 (modularisation interne)** est **en cours, progressive** (un
module à la fois, jamais une réécriture totale) : `ComptesMixtesEngine`
est le premier module extrait selon la convention décrite en §1. Reste à
faire, dans le même esprit incrémental, à traiter comme des chantiers
distincts ultérieurs :
- Poursuivre l'extraction module par module (candidats identifiés :
  rapport d'import FEC — entangled avec la construction du Web Worker
  via `.toString()`, à traiter avec précaution — sauvegarde de secours
  IndexedDB, utilitaires de formatage/export).
- **Hors périmètre de cette Phase 6** (décisions déjà arbitrées avec
  l'utilisateur, cf. `AUDIT_CORRECTIONS.md`) : découpage en fichiers
  `.js` réellement séparés — incompatible avec l'usage `file://` sans
  build (cf. §1) — et migration complète du stockage vers IndexedDB
  comme source de vérité principale (async/await sur 34 emplacements,
  chantier distinct de la modularisation).

**Autres points non traités, restant hors de portée de cet audit** :
hébergement local de Chart.js (dégradation gracieuse déjà en place, cf.
§1) ; couverture d'accessibilité au-delà du périmètre restreint de la
Phase 9 (§6) ; formules URSSAF réelles pour les cotisations TNS
(volontairement non implémentées, règle impérative n°8 — cf. §5).

Comme pour toutes les phases précédentes, la suite de la Phase 6 doit se
poursuivre par étapes courtes et vérifiables (règle impérative n°4),
jamais par une réécriture totale immédiate (règle impérative n°6).
