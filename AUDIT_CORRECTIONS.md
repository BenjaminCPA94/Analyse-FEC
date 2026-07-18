# AUDIT_CORRECTIONS — Chantier de fiabilisation FEC Analyse

Ce fichier documente l'audit et les corrections appliquées dans le cadre du
chantier de fiabilisation/sécurisation demandé (9 phases). Il complète
`AUDIT.md` (audit initial v5→v6) et `CHANGELOG.md` (historique fonctionnel).

**Méthode** : extraction du script principal (`tests/harness.js`, `vm` Node),
grep/analyse statique systématique, reproduction de chaque anomalie dans un
bac à sable Node avant correction, vérification en navigateur headless
(Playwright) pour les correctifs à surface UI, exécution de la suite de
tests complète (`node tests/run_all.js`) après chaque correctif.

**État au moment de la rédaction** : 519 tests automatiques, tous verts.
Sauvegarde intégrale du fichier avant toute intervention conservée dans
`backups/FEC_Analyse_v6.backup-20260718-185631-before-audit.html` (et dans
l'historique git, commit `9ab943e`).

---

## Légende

- **Criticité** : 🔴 Critique (perte/exposition de données, faille de
  sécurité, fonctionnalité silencieusement cassée) · 🟠 Majeure · 🟡 Mineure
- **Statut** : ✅ Corrigé (testé) · 🔍 Confirmé, non corrigé (prochaine étape) · ⏳ Non audité à ce stade

---

## Phase 1 — Corrections critiques

### 1. 🔴 Suppression complète des données — ✅ Corrigé

**Anomalie initiale** : `deleteAllLocalData()` ne supprimait que la clé
`fec_analyse_v2` (les dossiers). Les 7 autres clés localStorage de
l'application (prévisionnels, TNS, rémunération, IRPP et leurs
barèmes/règles par année) n'étaient jamais effacées, malgré un message de
confirmation ("Supprimer irréversiblement TOUS les dossiers et mappings...")
et un message de succès ("Toutes les données locales ont été supprimées")
qui laissaient croire à une suppression totale. Risque RGPD/confidentialité
réel pour un cabinet convaincu d'avoir tout effacé.

**Correction appliquée** :
- Constante centralisée `ALL_STORAGE_KEYS` regroupant les 8 clés connues
  (`STORE_KEY`, `PREV_STORE_KEY`, `TNS_CAISSES_STORE_KEY`, `TNS_STORE_KEY`,
  `REGLES_REMUNERATION_STORE_KEY`, `REMU_STORE_KEY`, `REGLES_IR_STORE_KEY`,
  `IRPP_STORE_KEY`) — toute future clé de stockage devra y être ajoutée.
- `deleteAllLocalData()` supprime les 8 clés puis **vérifie** qu'aucune ne
  subsiste ; renvoie `false` et affiche un message explicite listant la/les
  clé(s) restante(s) en cas d'échec partiel (jamais un faux succès).
- `deleteAllIndexedDbData()` ajoutée : supprime toute base IndexedDB
  existante (no-op sûr aujourd'hui, aucun module n'utilise encore
  IndexedDB — préparé pour la migration Phase 5).
- `confirmDeleteAllData()` devenue asynchrone, appelle les deux fonctions,
  respecte toujours l'annulation de l'utilisateur.

**Fichiers modifiés** : `FEC_Analyse_v6.html`.
**Tests** : `tests/test_delete_all_data.js` (9 tests).
**Commit** : `3bf2e73`.

### 2. 🔴 Sécurisation XSS (innerHTML) — ✅ Corrigé (vecteurs confirmés)

**Anomalie initiale** : audit de tous les usages d'`innerHTML` (90
occurrences, aucun `insertAdjacentHTML` dans le fichier) croisés avec les
sources de données utilisateur/FEC. Deux vecteurs de **XSS stockée**
confirmés et reproduits :
1. `mpRename()` permet de renommer librement un poste ou une sous-catégorie
   de mapping (`g.label`/`sub.label`) via un simple `<input>`, sans aucune
   sanitisation à la saisie. Ce label est persisté dans `ACTIVE.mps` et
   ré-affiché à **chaque** ouverture du Compte de résultat légal, de la
   SIG, du Bilan (vues Total, N/N-1 et Contributif en colonnes) et de
   l'écran de Mapping lui-même — 12 points d'injection interpolaient
   `g.label`/`sub.label`/`target.label` bruts dans du `innerHTML`.
2. `toggleDossierDropdown()` relit `item.name` depuis le `textContent`
   (donc **décodé**) d'une carte `.dc-name`, puis le réinjecte dans un
   template `innerHTML` sans ré-échapper : un nom de dossier littéralement
   `<img src=x onerror=...>` redevenait exécutable à ce second point
   d'injection, même si l'affichage initial de la carte était sûr.

Tous les autres usages audités (`${p.lib}` du Top produits Trésorerie,
`${x.label}` des KPI, tooltips Chart.js, etc.) se sont révélés déjà
échappés à la source ou alimentés par des constantes internes non
modifiables par l'utilisateur — **aucune autre régression trouvée**.

**Correction appliquée** : les 12 points d'injection identifiés passent
désormais par `escHtml()` (fonction déjà existante et utilisée ailleurs
dans l'application, équivalente à l'`escapeHtml()` demandé).

**Fichiers modifiés** : `FEC_Analyse_v6.html`.
**Tests** : `tests/test_xss.js` étendu (+3 tests, 6 au total) + vérification
manuelle en navigateur headless avec le payload exact demandé
(`<img src=x onerror=alert('XSS')>`) : aucune alerte ne se déclenche, le
payload s'affiche comme texte littéral.
**Commit** : `cbb2521`.

**Note** : `parseFECFile()` nettoyait déjà les numéros de compte (test
préexistant `tests/test_xss.js`) — non concerné par ce correctif, déjà
sûr.

### 3. 🔴 Injection de formule CSV — ✅ Corrigé

**Anomalie initiale** : `csvEscapeCell()` gérait l'échappement CSV standard
(guillemets, point-virgule, retours ligne) mais pas l'injection de formule
Excel/LibreOffice/Google Sheets (cellule commençant par `=`, `+`, `-`, `@`).
Les 11 fonctions d'export CSV existantes (SIG, Compte de résultat, Bilan,
Prévisionnel ×4, TNS, Rémunération ×2, IRPP) partagent toutes le même point
de passage (`csvFromRows()` → `csvEscapeCell()`).

**Correction appliquée** : `csvSafeValue(value)` ajoutée exactement selon
la spécification demandée (préfixe `'` sur toute valeur commençant par
`=`, `+`, `-`, `@`, tabulation ou retour chariot), branchée dans
`csvEscapeCell()` — un seul correctif protège les 11 exports.

**Fichiers modifiés** : `FEC_Analyse_v6.html`.
**Tests** : `tests/test_csv_injection.js` (11 tests), payloads exacts
vérifiés : `=HYPERLINK(...)`, `+1+1`, `-2+3`, `@SUM(...)`.
**Commit** : `f876e00`.

### 4. 🔴 Identifiants HTML dupliqués — ✅ Corrigé

**Anomalie initiale** : 7 ids dupliqués confirmés (`params-overlay`,
`params-dossier-title`, `params-name-input`, `ptab-parametres`,
`ptab-mapping`, `ppanel-parametres`, `ppanel-mapping`), répartis en trois
blocs de marquage :
- la modale "Paramètres" accessible depuis l'icône ⚙ d'une carte sur
  l'écran d'accueil (réellement utilisée) ;
- l'onglet "Paramètres" du dossier ouvert, `#module-params` (réellement
  utilisé) ;
- un troisième bloc entièrement mort en fin de document (`showParamsTabH()`
  + ids suffixés `-2`), dont le propre id `params-overlay` était
  systématiquement masqué par le premier bloc — jamais affichable.

Conséquence **concrète, pas seulement une question de validité HTML** :
`document.getElementById()` résout toujours le premier élément du document.
Changer de sous-onglet "Mapping"/"Paramètres" depuis l'onglet Paramètres
d'un dossier ouvert ne changeait donc **rien** à l'écran (le mauvais
panneau, invisible, était basculé), et les boutons "Enregistrer" /
"Dupliquer le projet" / "Supprimer le projet" de cet écran ne faisaient
**strictement rien** — ils opéraient sur `_currentParamsCard`, jamais
renseignée dans ce contexte.

**Correction appliquée** :
- L'onglet du dossier ouvert reçoit son propre jeu d'ids uniques (suffixe
  `-module`) et ses propres fonctions opérant sur `ACTIVE`
  (`saveParamsNameModule`/`duplicateDossierModule`/
  `deleteFromParamsModule`/`showParamsTabModule`) au lieu de partager
  celles conçues pour la carte de l'écran d'accueil.
- Le troisième bloc (mort, inatteignable) et `showParamsTabH()` (qui ne
  servait qu'à lui) sont supprimés.
- `openDossierParams()` et `renderDashboard()` mis à jour pour cibler les
  bons ids.

**Fichiers modifiés** : `FEC_Analyse_v6.html`.
**Tests** : `tests/test_html_ids.js` (10 tests, dont un test statique qui
échoue si un id HTML est dupliqué n'importe où dans le document) +
vérification manuelle en navigateur headless des deux écrans réels
(changement d'onglet, renommage, synchronisation carte/sidebar) sans
régression sur la modale ⚙ existante.
**Commit** : `238ce2d`.

### 5. 🔴 Fonctions JavaScript dupliquées — ✅ Corrigé

**Anomalie initiale** : analyse statique de l'ensemble des déclarations
`function` top-level (361 déclarations) — une seule collision trouvée :
`showAffecPanel()`, déclarée deux fois. La première déclaration (complète)
déclenchait le rafraîchissement du panneau "Comptes non affectés"
(`setTimeout(renderOrphanPanel,0)`) au changement d'onglet SIG/Bilan dans
l'écran d'affectation ; la seconde (plus courte, définie plus loin dans le
fichier) écrasait silencieusement la première et n'avait pas cet effet —
ce rafraîchissement ne se produisait donc plus jamais en pratique.

**Correction appliquée** : suppression de la redéclaration incomplète,
conservation de la version complète.

**Fichiers modifiés** : `FEC_Analyse_v6.html`.
**Tests** : `tests/test_duplicate_functions.js` (3 tests, dont une analyse
statique qui échoue si une fonction globale est déclarée plusieurs fois) +
vérification manuelle en navigateur headless.
**Commit** : `a87f3d8`.

### 6. 🟠 Plantage silencieux du module Trésorerie hors ligne — ✅ Corrigé (trouvaille annexe)

**Anomalie initiale** (découverte pendant le diagnostic console, non listée
dans la demande initiale mais directement liée à Chart.js/robustesse) :
3 fonctions du module Trésorerie (`tmRenderTresoChart`,
`tmRenderFluxChart`, `tmBuildProjectionChart`) appelaient `new Chart(...)`
sans le garde-fou déjà en place ailleurs (`mkChart()`) pour le cas où
Chart.js (CDN) est indisponible hors ligne — l'onglet Trésorerie plantait
silencieusement (`ReferenceError: Chart is not defined`) dès son ouverture
sans réseau, alors que l'application revendique un fonctionnement 100%
local.

**Correction appliquée** : ajout du même garde `if (typeof Chart ===
'undefined') return;` dans les 3 fonctions.

**Fichiers modifiés** : `FEC_Analyse_v6.html`.
**Tests** : vérifié par le diagnostic console headless (0 `pageerror`
restante après correction, contre 2 avant).
**Commit** : `3bf2e73`.

### 7. 🔴 Gestion fiable des années de barème — ✅ Corrigé

**Anomalie initiale** : `anneeResolue(catalogue, anneeDemandee)`, utilisée
par `PASS_PAR_ANNEE`, les caisses TNS, les règles de rémunération et les
règles IRPP, résolvait **silencieusement** une année manquante vers
l'année connue la plus proche en dessous — sans distinction entre "année
exacte trouvée" et "repli utilisé", sans statut de validation, sans
mention "barème non validé" dans les résultats. Un petit indicateur "ℹ
repli" existait déjà de façon informative (pas totalement silencieux)
mais rien n'empêchait un résultat de s'afficher comme s'il était fiable,
et une année créée par duplication n'était jamais distinguée d'un barème
réellement vérifié.

**Correction appliquée** :
- `creerMetaBareme(source)` : construit `{ statut: 'draft', creeLe,
  source, auteur }` — toujours "draft" à la création, jamais "validated"
  par défaut. Ne fabrique ni date (`Date.now()` réel) ni auteur (champ
  vide — l'application n'a pas de notion d'identité utilisateur à ce jour).
- `baremeEstValide(meta)` / `combinerMetaBareme(metaPropre, metaHeritee)` /
  `baremeAvertissementHtml(meta, ctx)` : logique centralisée partagée par
  les 3 modules. Un barème historique (2023-2025, fourni par
  l'application) est considéré validé implicitement (`meta === null`).
- `chargerCaissesEffectives()`, `chargerReglesRemunerationEffectives()`,
  `chargerReglesIrppEffectives()` renvoient désormais aussi `meta` — la
  dernière combine son propre statut avec celui, hérité, du barème
  Rémunération dont l'IRPP emprunte les tranches (le moins favorable des
  deux l'emporte : valider l'un ne masque jamais que l'autre reste
  non vérifié).
- `tnsDupliquerAnneeCaisses()`, `rmDupliquerAnnee()`, `irDupliquerAnnee()`
  marquent désormais systématiquement `statut: 'draft'` le barème créé.
  `tnsValiderAnneeCaisses()`, `rmValiderAnneeCourante()`,
  `irValiderAnneeCourante()` (actions manuelles explicites, un bouton
  dédié) le font passer à `'validated'`.
- Bandeau d'avertissement visible (pas une simple ligne discrète) dans les
  3 écrans de résultats tant que le barème utilisé n'est pas validé, ou
  qu'un repli d'année a eu lieu.
- Mention obligatoire "simulation à valider par un professionnel"
  (`MENTION_SIMULATION_PRO`) ajoutée, inconditionnellement, aux résultats
  TNS/Rémunération/IRPP.

**Limite assumée** : "bloquer le calcul par défaut" a été interprété comme
"ne jamais présenter un résultat non validé comme s'il était fiable" (via
le bandeau permanent + la mention obligatoire), plutôt que d'empêcher
techniquement tout affichage de chiffre — un blocage total aurait rendu
l'application inutilisable entre deux publications de barèmes officiels,
ce qui n'est pas l'objectif. Le blocage strict (aucun chiffre affiché)
est en revanche appliqué pour les caisses TNS incomplètes (§8), où
aucune estimation, même approximative, n'est mathématiquement valable.

**Fichiers modifiés** : `FEC_Analyse_v6.html`.
**Tests** : `tests/test_baremes_non_valides.js` (partie 1-4, 18 tests) +
vérification manuelle en navigateur headless des 3 modules (duplication →
bandeau → validation → disparition du bandeau, sans régression).

### 8. 🔴 Blocage des caisses TNS incomplètes — ✅ Corrigé

**Anomalie initiale** : `calculerCotisationsCaisse()` lisait
`safe(classe.montant)` — la fonction utilitaire `safe()` convertit toute
valeur `undefined`/`null`/`NaN` en `0`, rendant **indistinguable** un taux
réellement nul (0 %, un cas légitime) d'un paramètre jamais renseigné.
Aucun contrôle de complétude n'était effectué avant de lancer un calcul :
une caisse partiellement paramétrée (11 des 16 caisses du catalogue,
livrées avec des valeurs à 0 faute d'accès réseau pour vérifier les
barèmes réels, marquées `aParametrer: true`) produisait un résultat
chiffré plausible — ex. "0 € de cotisations" pour un médecin CARMF — au
lieu d'un blocage explicite.

**Correction appliquée** :
- Les valeurs placeholder de `tnsCaisseClassesVide()`/
  `tnsCaisseTranchesVide()` (montants/taux des 11 caisses non vérifiées)
  utilisent désormais `null`, plus jamais `0`.
- `validerCompletudeCaisse(caisse)` : parcourt tous les paramètres
  obligatoires (montants par classe, taux par tranche, CSG,
  formation professionnelle selon le mode `classes`/`tranches`) et
  renvoie `{ complete, manquants: [...] }` — la liste précise, jamais un
  simple booléen.
- `renderTns()` appelle cette validation **avant** tout calcul : si
  incomplet, `TnsEngine.calculerCotisationsCaisse()` n'est même pas
  appelée, et l'écran affiche un panneau "⛔ Calcul bloqué" listant
  exactement les paramètres manquants, sans aucun chiffre de résultat.
- Un taux/montant à `0` explicitement saisi par l'utilisateur reste
  parfaitement accepté (n'est jamais confondu avec `null`).

**Fichiers modifiés** : `FEC_Analyse_v6.html`.
**Tests** : `tests/test_baremes_non_valides.js` (partie 5-6, 6 tests,
dont la vérification qu'aucun "Total cotisations" ne s'affiche pour une
caisse incomplète et qu'une caisse complète continue de fonctionner
normalement) + vérification manuelle en navigateur headless.

---

## Suites de tests

| Fichier | Tests | Sujet |
|---|---|---|
| `tests/test_delete_all_data.js` | 9 | Suppression complète des données |
| `tests/test_xss.js` | 6 | XSS (dont mapping + dropdown, cette passe) |
| `tests/test_csv_injection.js` | 11 | Injection de formule CSV |
| `tests/test_html_ids.js` | 10 | Unicité des ids HTML |
| `tests/test_duplicate_functions.js` | 3 | Unicité des fonctions globales |
| `tests/test_baremes_non_valides.js` | 24 | Statut des barèmes + caisses TNS incomplètes |

Total suite complète (`node tests/run_all.js`) : **543 tests, 0 échec**.

---

## Prochaines étapes recommandées (par ordre de priorité)

1. **Barèmes non validés** (§7) et **caisses TNS incomplètes** (§8) —
   items critiques restants de la Phase 1, dimensionnés ci-dessus.
2. **Phase 2 — Validation FEC** : le parseur actuel (`parseFECFile()`)
   vérifie les colonnes obligatoires et gère les montants
   français/internationaux, mais n'a pas de rapport d'import structuré
   (comptage lignes valides/rejetées, écart débit/crédit, doublons,
   export des anomalies) — à construire comme un nouveau module, sans
   toucher au parseur existant qui fonctionne.
3. **Phase 3 — Comptes mixtes** : le mapping est aujourd'hui partagé entre
   exercices sans règle de présentation conditionnelle par signe pour les
   comptes réellement mixtes (TVA, comptes courants...) — limite déjà
   documentée dans `addExerciceToActiveDossier()` (cf. commentaire
   existant dans le code). Nécessite un audit de la convention de signe
   réelle avant toute règle automatique, comme demandé.
4. **Phase 4 — Renommage "Consolidé" → "Agrégation multi-sociétés"** +
   bannière permanente : changement volontairement **différé** tant que
   l'utilisateur n'a pas confirmé le renommage (fonctionnalité livrée ce
   mois-ci sous le nom "Consolidé" avec l'accord explicite de
   l'utilisateur — cf. CHANGELOG.md ; un renommage silencieux romprait la
   cohérence avec les échanges précédents. Le principe de l'alerte
   permanente ne pose en revanche aucune ambiguïté et peut être ajouté
   sans discussion).
5. **Chart.js local** : dépendance CDN actuelle déjà neutralisée par des
   gardes défensifs (§6 + correctif préexistant) — reste à héberger
   réellement le fichier en local pour un fonctionnement 100% hors ligne
   garanti (actuellement : dégradation gracieuse, pas d'hébergement local).
6. **Phases 5-9** (IndexedDB, Web Worker, refactorisation modulaire,
   TypeScript, améliorations de modules, accessibilité) : chantiers
   d'ampleur, chacun comparable ou supérieur en taille à l'ensemble de la
   Phase 1 — à traiter comme des chantiers dédiés séparés, jamais en une
   seule réécriture totale (cf. règle impérative n°6 de la demande).

## Limites de cette passe

- Aucune régression fonctionnelle constatée (519/519 tests verts, vérifié
  après chaque correctif individuel, jamais en fin de lot).
- Les correctifs §7 et §8 sont **confirmés et dimensionnés** mais non
  implémentés : ne pas les considérer comme résolus.
- Aucune modification de l'apparence visuelle en dehors de ce qui était
  strictement nécessaire à la correction (aucun changement de couleur, de
  disposition ou de parcours n'a été fait "en passant").
