# AUDIT_CORRECTIONS — Chantier de fiabilisation FEC Analyse

Ce fichier documente l'audit et les corrections appliquées dans le cadre du
chantier de fiabilisation/sécurisation demandé (9 phases). Il complète
`AUDIT.md` (audit initial v5→v6) et `CHANGELOG.md` (historique fonctionnel).

**Méthode** : extraction du script principal (`tests/harness.js`, `vm` Node),
grep/analyse statique systématique, reproduction de chaque anomalie dans un
bac à sable Node avant correction, vérification en navigateur headless
(Playwright) pour les correctifs à surface UI, exécution de la suite de
tests complète (`node tests/run_all.js`) après chaque correctif.

**État au moment de la rédaction** : 640 tests automatiques, tous verts.
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

## Phase 4 — Renommage du module "Consolidé" + bannière permanente

### 9. 🟡 Renommage "Consolidé" → "Agrégation multi-sociétés" — ✅ Corrigé

**Contexte** : le module avait été livré et nommé "Consolidé" avec l'accord
explicite de l'utilisateur lors d'une session précédente (cf. CHANGELOG.md).
La Phase 4 de la demande d'audit prévoyait ce renommage pour éviter toute
confusion avec une véritable consolidation comptable réglementaire
(éliminations intragroupe, retraitements, intérêts minoritaires — que ce
module ne réalise jamais, il se contente d'additionner les comptes de
plusieurs dossiers Reporting existants). Le renommage a été **différé**
dans la passe précédente le temps d'obtenir confirmation explicite ;
confirmé par l'utilisateur, il est maintenant appliqué.

**Correction appliquée** :
- Tous les libellés **visibles** ("Consolidé" comme titre de type de
  projet, tag sur la carte de dossier, sous-titres, boutons "Créer le
  consolidé"/"Ajouter au consolidé", toasts, messages de blocage) sont
  renommés en "Agrégation multi-sociétés" (ou "Agrégation" en version
  courte pour les tags compacts).
- **Volontairement inchangés** : le type de stockage interne
  (`type: 'consolide'`), les noms de fonctions
  (`computeConsolidatedData`, `addConsolideMember`,
  `npConfirmConsolide`...) et les classes CSS (`dc-consolide-tag`,
  `consolide-view-toggle`...). Ce sont des identifiants internes jamais
  affichés à l'utilisateur ; les renommer aurait forcé une migration des
  dossiers déjà enregistrés dans le localStorage des utilisateurs actuels
  sans aucun bénéfice visible, pour un risque de régression pur.
- Nouvelle fonction `renderAgregationAlertBanner()` : bannière
  d'avertissement **permanente et non masquable**, injectée dans le
  bandeau supérieur du module (`#agregation-alert-banner`, en dehors de
  chaque écran `.module-screen` — donc visible sur les 4 onglets Analyses/
  Affectation/Suivi des imports/Paramètres sans devoir dupliquer le code
  dans chacun), rappelant qu'il s'agit d'une addition simple sans
  élimination des flux intragroupe ni retraitement de consolidation
  réglementaire, et que le résultat ne se substitue pas à une
  consolidation légale. Appelée depuis `renderDashboard()`, elle
  apparaît/disparaît automatiquement selon `ACTIVE.type`.

**Fichiers modifiés** : `FEC_Analyse_v6.html`.
**Tests** : `tests/test_agregation_rename.js` (8 tests : absence de
libellé visible résiduel, sélecteur de type, étape de sélection des
membres, tag de carte, message de blocage "Ajouter un exercice",
affichage/disparition de la bannière selon le type de dossier,
non-régression du type de stockage interne) + vérification manuelle en
navigateur headless (Playwright) confirmant la bannière visible sur les 4
onglets d'un dossier d'agrégation ouvert et absente sur un dossier
Reporting classique.

---

## Phase 2 — Fiabilisation de l'import FEC

### 10. 🟠 Absence de rapport d'import structuré — ✅ Corrigé

**Anomalie initiale** : `parseFECFile()` importe silencieusement ce qu'il
parvient à lire (colonnes obligatoires présentes, montants numériques) et
ignore le reste sans aucune trace visible pour l'utilisateur — un
FEC partiellement corrompu, tronqué, ou ré-exporté deux fois par erreur
produisait un dossier apparemment normal, sans qu'aucun signal n'alerte
l'expert-comptable sur un éventuel écart avec le fichier source.

**Correction appliquée** :
- Nouvelle fonction `analyserQualiteImportFEC(text)` : passe de lecture
  **indépendante** de `parseFECFile()` (le parseur existant n'est ni
  modifié ni contourné — il reste seul décisionnaire des données
  réellement importées). Elle recompte les lignes valides/rejetées avec
  la raison précise de chaque rejet (colonnes obligatoires absentes,
  numéro de compte vide, montant débit/crédit non numérique), calcule
  l'écart débit/crédit global (une FEC équilibrée doit avoir un écart nul
  ou négligeable), et détecte les lignes strictement dupliquées (signal
  fréquent d'un double export/import accidentel).
- Le rapport est calculé à l'import (`npConfirm()`) et attaché à
  l'exercice correspondant (`ACTIVE.exercices[exId].rapportImport`,
  persisté par `saveActiveDossier()` comme le reste de l'exercice) — pour
  le tout premier exercice d'un dossier, transite par
  `store[id].rapportImportInitial` puis `ensureExercices()`.
- Une notification s'affiche immédiatement après l'import
  (`toastRapportImport()`) **uniquement si une anomalie est détectée**
  (aucun bruit ajouté sur un import propre).
- L'onglet "Suivi des imports" affiche désormais, sous chaque exercice,
  un résumé du rapport (`rapportImportResumeHtml()`) avec un détail
  dépliable (lignes rejetées, lignes dupliquées) et un export CSV dédié
  des anomalies (`exporterAnomaliesImport()`, réutilisant
  `csvFromRows()`/`csvSafeValue()` — même protection anti-injection de
  formule que tous les autres exports de l'application).
- Ce rapport est strictement informatif : il **ne bloque jamais**
  l'import, conformément au principe déjà appliqué au reste de l'audit —
  seules les caisses TNS incomplètes (§8) bloquent un résultat, car elles
  produisent un chiffre mathématiquement faux ; ici, le parseur importe
  toujours ce qu'il peut lire, le rapport signale simplement ce qu'il n'a
  pas pu utiliser.

**Fichiers modifiés** : `FEC_Analyse_v6.html`.
**Tests** : `tests/test_rapport_import_fec.js` (21 tests : cas nominal
sans anomalie, colonnes obligatoires absentes, 3 raisons de rejet
distinctes, écart débit/crédit, doublons stricts, fichier vide,
câblage `finishNpConfirm()`/`ensureExercices()`/
`addExerciceToActiveDossier()`, comportement silencieux/alerte de
`toastRapportImport()`, échappement HTML du contenu brut du FEC dans le
panneau de détail, neutralisation d'une valeur de type formule dans
l'export CSV des anomalies) + vérification manuelle en navigateur
headless (Playwright) avec un FEC construit avec 1 ligne rejetée, 1
doublon strict et un écart débit/crédit volontaires : les trois sont
correctement détectés, affichés et exportables.

---

## Phase 3 — Comptes mixtes du mapping comptable

### 11. 🟠 Compte mixte non réévalué entre exercices d'un même dossier — ✅ Corrigé

**Anomalie initiale** (déjà documentée dans un commentaire de
`addExerciceToActiveDossier()`) : un compte "mixte" (classes 4
principalement — clients/fournisseurs, TVA, comptes courants associés,
organismes sociaux… cf. `MIXED_ROUTES`, dont l'affectation actif/passif
dépend du signe réel du solde et non d'une nature fixe) n'est réévalué
par `autoAffectOrphans()` qu'au moment de son **premier** classement,
puisque le mapping (`ACTIVE.mps`) est partagé entre tous les exercices
d'un même dossier et qu'un compte déjà classé n'est plus considéré comme
"orphelin". Si son solde change de signe sur un exercice ultérieur (ex.
un compte client devenu créditeur suite à une avance reçue), il reste
affiché du mauvais côté du bilan pour ce nouvel exercice, sans qu'aucun
signal n'alerte l'utilisateur.

**Décision explicite (règle impérative n°8 de la demande)** : cette
incohérence n'est **jamais** corrigée automatiquement et silencieusement
— un déplacement invisible pourrait annuler un classement que
l'utilisateur avait choisi intentionnellement pour une raison précise, ou
modifier le bilan sans que l'expert-comptable ne le voie. La correction
reste un geste explicite, déclenché par un clic, après une alerte claire.

**Correction appliquée** :
- La table `MIXED_ROUTES` (comptes mixtes déjà validée avec
  l'expert-comptable, cf. AUDIT.md §(o)) est hissée du périmètre local de
  `autoAffectOrphans()` au niveau module, pour être réutilisable sans
  duplication.
- Nouvelle fonction `detecterComptesMixtesIncoherents()` : pour chaque
  compte mixte déjà classé, compare son emplacement actuel (actif/passif)
  à celui que donnerait la règle déjà validée (signe du solde) pour
  l'exercice **actuellement affiché**. Purement en lecture : ne modifie
  jamais `ACTIVE.mps` (comme `buildBilanTables()`, dont c'est la règle
  documentée).
- Nouveau bandeau (`renderComptesMixtesAlerte()`, `#comptes-mixtes-alerte`
  sur la page Bilan) listant chaque compte incohérent (numéro, libellé,
  sens actuel, sens attendu) avec un lien "Réaffecter" par compte
  (`reaffecterCompteMixte()`) et un bouton "Tout réaffecter selon le
  solde de cet exercice" (`reaffecterTousComptesMixtes()`) — actions
  explicites, jamais déclenchées automatiquement.
- Rafraîchi à chaque rendu du Bilan (appelé depuis `buildBilanTables()`),
  donc à jour après chaque changement d'exercice, import, ou modification
  du mapping.

**Fichiers modifiés** : `FEC_Analyse_v6.html`.
**Tests** : `tests/test_comptes_mixtes_multi_exercice.js` (12 tests :
détection d'une incohérence, absence de faux positif quand le classement
est déjà correct, comptes hors `MIXED_ROUTES` jamais signalés,
réaffectation d'un seul compte, réaffectation groupée, échappement HTML
du bandeau, et un scénario bout en bout reproduisant exactement la
LIMITE CONNUE documentée — ajout d'un 2ᵉ exercice avec un solde inversé,
détection de l'incohérence, correction explicite) + vérification manuelle
en navigateur headless (Playwright) : import d'un exercice, ajout d'un
2ᵉ exercice à solde inversé, bandeau affiché avec le bon compte, clic sur
"Tout réaffecter" qui corrige et efface le bandeau.

---

## Phase 5 — Stockage et performance sur FEC volumineux

### 12. 🟠 Parsing FEC bloquant le thread principal — ✅ Corrigé (Web Worker)

**Anomalie initiale** (déjà quantifiée dans AUDIT.md §(k)) : le parsing
d'un FEC volumineux (~2 s de traitement synchrone pour 500 000 lignes)
gelait entièrement l'interface pendant ce temps — seul un délai de 30 ms
avant de lancer le parsing garantissait l'affichage du message "Analyse
en cours…", mais le parsing lui-même restait bloquant.

**Correction appliquée** :
- `getFecParserWorker()` construit à la volée un Web Worker dont le code
  source est le `.toString()` de `parseFECFile()` et
  `analyserQualiteImportFEC()` — ces deux fonctions sont pures (aucun
  accès au DOM ni à `ACTIVE`/`localStorage`), donc le Worker exécute
  **exactement** le même corps de fonction que le thread principal :
  aucune duplication de code, donc aucun risque de divergence entre les
  deux implémentations dans le temps.
- `parseFECEnArrierePlan(text)` : point d'entrée unique utilisé par
  `npConfirm()`, qui déporte le parsing dans ce Worker et repose sur une
  `Promise`. Repli automatique et transparent sur le parsing synchrone
  historique si `Worker`/`Blob` sont indisponibles (ancien navigateur,
  contexte restreint, bac à sable de test) — même résultat dans les deux
  cas, vérifié par test.
- Le fichier reste un **fichier HTML unique** (aucun fichier `.js` externe
  requis pour le Worker, construit via `Blob`/`URL.createObjectURL` à
  partir du code déjà présent dans le script principal) — n'entre pas en
  conflit avec la contrainte du harnais de tests (`tests/harness.js`, qui
  exige exactement 1 `<script>` inline).

**Fichiers modifiés** : `FEC_Analyse_v6.html`.
**Tests** : `tests/test_fec_worker_parsing.js` (5 tests : repli propre
quand `Worker` est indisponible, résultat identique au parsing direct,
attachement du rapport d'import, FEC invalide résolu à `null` sans rejet,
sérialisabilité des fonctions) + vérification manuelle en navigateur
headless (Playwright) : import réel d'un FEC de 50 000 puis 120 000
lignes via un `Worker` réellement instancié dans Chromium (confirmé,
`typeof w.postMessage === 'function'`), import réussi (soldes exacts),
et un compteur `setInterval` sur le thread principal démontrant que
celui-ci **reste réactif pendant tout le parsing** (progression continue
du compteur, alors qu'un test identique avant ce correctif l'aurait
montré figé pendant la durée du parsing).

### 13. 🟡 Absence de sauvegarde de secours au-delà du quota localStorage — ✅ Corrigé (IndexedDB en miroir)

**Anomalie initiale** : `loadStore()`/`saveStore()` reposent
exclusivement sur `localStorage` (quota généralement ~5-10 Mo selon le
navigateur). En cas de dépassement de quota, `saveStore()` affichait déjà
un message actionnable (pas d'échec silencieux) mais les données de la
sauvegarde en cours étaient réellement perdues faute d'alternative. Une
vraie migration vers IndexedDB (asynchrone par nature) aurait nécessité
de convertir les 34 emplacements du code qui appellent
`loadStore()`/`saveStore()` de façon strictement synchrone — un chantier
de l'ampleur de la Phase 6, à ne jamais mélanger avec un correctif ciblé
(règle impérative n°6 de la demande : "pas de réécriture totale
immédiate").

**Décision (choix arbitré avec l'utilisateur)** : plutôt qu'une
conversion complète en async/await, `loadStore()`/`saveStore()`
**conservent leur signature synchrone inchangée** — aucun des 34 appels
existants n'a été modifié, risque de régression minimal. IndexedDB
(quota nettement supérieur, souvent plusieurs centaines de Mo) sert de
**miroir asynchrone best-effort** à chaque sauvegarde.

**Correction appliquée** :
- `ouvrirIndexedDBSecours()` / `idbBackupPutStore()` /
  `idbBackupGetStore()` : couche IndexedDB minimale (base
  `fec_analyse_idb_v1`), dégradation propre si `indexedDB` est
  indisponible (jamais d'exception).
- `saveStore(data)` réplique désormais `data` vers IndexedDB en tâche de
  fond (fire-and-forget, ne bloque jamais la sauvegarde principale, ne
  modifie ni sa signature ni sa valeur de retour) — y compris quand
  l'écriture localStorage elle-même échoue par dépassement de quota : les
  données ne sont alors plus nécessairement perdues si la réplication
  IndexedDB réussit. Le message d'erreur de quota mentionne désormais
  cette sauvegarde de secours.
- `restaurerDepuisIndexedDB()` : action **explicite** (jamais
  automatique), exposée par un nouveau bouton dans l'écran
  Confidentialité (`openPrivacyModal()`), pour récupérer la dernière
  sauvegarde de secours si le localStorage a été vidé, corrompu, ou en
  cas d'échec de sauvegarde par quota dépassé.
- `deleteAllIndexedDbData()` (Phase 1, déjà générique par
  `indexedDB.databases()`) supprime cette nouvelle base sans
  modification nécessaire — aucun dossier fantôme ne subsiste après
  "Supprimer toutes les données".

**Limite assumée** : IndexedDB reste un **miroir**, pas la source de
vérité principale — `loadStore()` continue de lire depuis localStorage.
Une bascule complète (IndexedDB comme stockage principal, levant
réellement le plafond de capacité pour la lecture aussi) resterait un
chantier distinct nécessitant la conversion async/await des 34 usages,
volontairement non entrepris ici.

**Fichiers modifiés** : `FEC_Analyse_v6.html`.
**Tests** : `tests/test_indexeddb_backup.js` (9 tests : dégradation
propre sans `indexedDB`, `saveStore()` reste synchrone et inchangé dans
son comportement, message de quota mentionnant la sauvegarde de secours,
`restaurerDepuisIndexedDB()` sans sauvegarde disponible et avec
restauration effective, non-régression de `deleteAllIndexedDbData()`) +
vérification manuelle en navigateur headless (Playwright) : réplication
réelle vers IndexedDB après `saveStore()`, suppression simulée du
localStorage, restauration réussie via le bouton de Confidentialité.

---

## Phase 7 — Extension des tests automatiques

### 14. 🟡 Moteur d'agrégation par période et formatage monétaire jamais testés — ✅ Corrigé

**Constat** : `getPeriodData()` (agrégation mensuelle/trimestrielle/
semestrielle/annuelle utilisée par le tableau de bord ET le module
Trésorerie pour les graphiques de flux et la position de trésorerie
cumulée) et les fonctions de formatage monétaire `fmtV()`/`fmtK()`/`pct()`
(bascule €/K€/M€, utilisée partout où un montant est affiché) n'avaient
aucun test dédié malgré leur rôle central dans tous les chiffres présentés
à l'utilisateur.

**Correction appliquée** :
- 10 nouveaux tests sur `getPeriodData()` : agrégation correcte pour
  chacune des 4 périodicités, calcul de la position de trésorerie
  cumulée (`treso`), troncature `RANGE_N` aux N dernières périodes,
  non-crash sur un dossier sans aucun mois.
- 9 nouveaux tests sur `fmtV()`/`fmtK()`/`pct()` couvrant les 3 devises
  (€/K€/M€), les montants négatifs, et la protection division par zéro.

**Bug réel détecté par cette nouvelle couverture** (🟡 mineure, corrigée
au passage) : en mode M€, `fmtV()` et `fmtK()` utilisaient `.toFixed()`
sans remplacer le point décimal par une virgule, produisant par exemple
"2.50 M€" au lieu de "2,50 M€" — incohérent avec le reste de
l'application, qui utilise systématiquement la convention décimale
française (virgule). Corrigé par un simple `.replace('.', ',')`, vérifié
en navigateur headless.

**Fichiers modifiés** : `FEC_Analyse_v6.html` (2 lignes, `fmtV()`/`fmtK()`).
**Tests** : `tests/test_period_data_tresorerie.js` (19 tests, dont celui
qui a révélé la régression décimale M€) + vérification manuelle en
navigateur headless.

---

## Phase 8 — Améliorations fonctionnelles des modules

### 15. 🟡 Prévisionnel — amortissement sans prorata temporis mensuel — ✅ Corrigé

**Constat** : `calculerPlanAmortissement()` appliquait une dotation
annuelle pleine dès l'exercice d'acquisition, quel que soit le mois réel
d'acquisition — limitation explicitement documentée dans le code et
affichée à l'utilisateur ("Amortissement linéaire calculé
automatiquement (dotation pleine dès l'exercice d'acquisition)"). Le
champ `inv.mois` existait pourtant déjà dans le modèle de données et
dans l'écran de saisie (utilisé pour le placement exact des flux de
trésorerie dans `calculerTresorerieMensuelle()`), mais n'était jamais
exploité par le calcul d'amortissement comptable lui-même.

**Correction appliquée** :
- `calculerPlanAmortissement()` applique désormais le **prorata temporis
  mensuel standard** : la dotation de l'exercice d'acquisition est
  proportionnelle au nombre de mois restants dans l'exercice à compter du
  mois d'acquisition inclus, et la durée d'amortissement se prolonge
  naturellement d'un exercice partiel supplémentaire en fin de plan —
  comme en comptabilité réelle.
- **Non-régression garantie** : `inv.mois === 1` (janvier, valeur par
  défaut à la création d'un investissement, cf. `pvAddInvestissement()`)
  donne un prorata de 12/12, strictement identique à l'ancien calcul —
  aucun dossier Prévisionnel existant n'est affecté tant que l'utilisateur
  n'a pas explicitement changé le mois d'acquisition d'un investissement.
  Un `inv.mois` absent (dossiers créés avant l'introduction de ce champ)
  est traité comme janvier, même garantie.
- Le parc d'immobilisations existant (`dotationAnnuelleParcExistant`/
  `vncParcExistantOuverture`, sans date d'acquisition connue) n'est pas
  concerné et continue d'être amorti à un rythme annuel constant.
- Texte d'aide de l'écran mis à jour en conséquence.

**Fichiers modifiés** : `FEC_Analyse_v6.html`.
**Tests** : `tests/test_previsionnel_prorata_temporis.js` (10 tests :
non-régression mois=1 et mois absent, prorata 6/12 pour une acquisition
en juillet avec prolongation du plan sur un exercice supplémentaire,
prorata minimal 1/12 pour une acquisition en décembre, conservation de
la valeur totale amortie dans les deux cas, non-affectation du parc
existant) + vérification manuelle en navigateur headless.

---

## Phase 9 — Accessibilité et qualité de l'interface

### 16. 🟠 Accessibilité clavier/lecteur d'écran quasi absente — 🟡 Partiellement corrigé (périmètre volontairement restreint)

**Constat** : audit statique du fichier entier — **aucun** attribut
`aria-*` ni `role` nulle part avant cette passe, 99 `<div onclick>` et
16 `<span onclick>` utilisés comme boutons (jamais focusables au
clavier, jamais annoncés comme interactifs par un lecteur d'écran), et
aucune fenêtre modale/menu ne pouvait être fermé au clavier (seul un
clic en dehors fonctionnait). Une mise en conformité WCAG AA exhaustive
représenterait un chantier touchant la quasi-totalité des écrans — d'une
ampleur comparable ou supérieure à la Phase 6, à ne pas entreprendre en
une seule passe (règle impérative n°6) ni au risque de modifier
l'apparence actuelle (règle n°3).

**Correction appliquée dans ce périmètre volontairement restreint**
(purement additive : aucun attribut ni changement ne modifie l'apparence
visuelle existante) :
- `fermerAvecEchap()` : la touche **Échap** ferme désormais la fenêtre
  modale ou le menu actuellement ouvert (Grand livre, "Nouveau projet",
  Confidentialité, menu déroulant de sélection de dossier, panneau
  Paramètres accessible depuis l'icône ⚙ d'une carte) — sans modifier
  aucun comportement au clic déjà existant.
- Icône **Paramètres** (`GEAR_BTN`, réutilisée sur chaque carte de
  dossier créée, + les 7 cartes de démonstration statiques du même
  motif, incohérentes avant ce correctif) : `aria-label="Paramètres du
  dossier"` + `aria-hidden="true"` sur l'icône SVG décorative.
- Sélecteur de dossier (`module-dossier-tag`, présent sur tous les
  écrans d'un dossier ouvert) : `role="button"`, `tabindex="0"`,
  `aria-haspopup="true"`, `aria-label`, et gestion clavier
  (Entrée/Espace déclenche le menu comme un clic) — sans changer la
  balise HTML (donc sans aucun risque sur le style CSS existant).

**Limite assumée** : ce correctif ne couvre que les contrôles les plus
universellement présents (au moins un par écran). Les autres éléments
cliquables non sémantiques (99 `<div onclick>`/16 `<span onclick>`
restants, propres à des écrans spécifiques) ne sont pas couverts par
cette passe — à traiter dans un chantier d'accessibilité dédié
ultérieur, écran par écran.

**Fichiers modifiés** : `FEC_Analyse_v6.html`.
**Tests** : `tests/test_accessibilite.js` (12 tests : `fermerAvecEchap()`
pour chacune des 5 fenêtres/menus, ordre de priorité quand plusieurs
sont ouverts simultanément, ignorance des touches autres qu'Échap,
cohérence des 8 occurrences de l'aria-label Paramètres, présence des
attributs d'accessibilité du sélecteur de dossier) + vérification
manuelle en navigateur headless (Playwright) : fermeture au clavier
effective des 3 principales fenêtres testées, ouverture du menu
déroulant via focus + Entrée, non-régression du clic souris.

---

## Phase 6 — Modularisation interne progressive (un seul fichier)

### 17. 🟡 Premier module extrait : `ComptesMixtesEngine`

**Décision arbitrée avec l'utilisateur** avant de commencer : deux
approches étaient possibles pour la Phase 6 (découpage en fichiers `.js`
réels + étape de build, ou modularisation interne dans un seul fichier).
L'application est ouverte directement en local (`file://`, sans
serveur) — or de vrais modules ES répartis sur plusieurs fichiers ne se
chargent pas via `file://` dans la plupart des navigateurs (restriction
CORS). L'utilisateur a confirmé l'approche **modularisation interne, un
seul fichier**, sans étape de build.

**Correction appliquée** :
- La table `MIXED_ROUTES` déjà hissée au niveau module (cf. §11) et les 5
  fonctions de détection/correction des comptes mixtes
  (`detecterComptesMixtesIncoherents`, `appliquerReaffectationCompteMixte`,
  `reaffecterCompteMixte`, `reaffecterTousComptesMixtes`,
  `renderComptesMixtesAlerte`) sont regroupées dans un nouvel espace de
  noms `ComptesMixtesEngine`, selon le motif IIFE déjà établi par
  `PrevisionnelEngine`/`TnsEngine`/`RemunerationEngine`/`IrppEngine` :
  état et logique interne encapsulés dans la fermeture, API publique
  restreinte (`detecterIncoherences`, `reaffecterCompte`,
  `reaffecterTous`, `renderAlerte` — `appliquerReaffectation` reste
  privée, jamais exposée).
- Tous les points d'appel mis à jour vers la forme `ComptesMixtesEngine.
  xxx(...)`, y compris les attributs `onclick="..."` générés
  dynamiquement dans le bandeau du Bilan (une `const` de premier niveau
  reste accessible depuis du HTML injecté via `innerHTML`, comme
  n'importe quelle fonction globale).
- **Comportement strictement identique avant/après** : aucun changement
  fonctionnel, uniquement une réorganisation interne. Vérifié par la
  suite de tests existante (renommée en conséquence, toujours 12 tests,
  tous verts) et par une nouvelle vérification manuelle en navigateur
  headless reproduisant exactement le scénario déjà validé en Phase 3.
- Convention documentée dans `ARCHITECTURE.md` §1 pour les extractions
  futures (candidats identifiés, pas encore traités dans cette passe :
  rapport d'import FEC — entangled avec la construction du Web Worker
  via `.toString()`, à traiter avec précaution —, sauvegarde de secours
  IndexedDB, utilitaires de formatage/export).

**Fichiers modifiés** : `FEC_Analyse_v6.html`,
`tests/test_comptes_mixtes_multi_exercice.js` (renommage des appels,
aucun nouveau test — la couverture existante suffit à garantir la
non-régression d'une réorganisation interne).
**Tests** : suite existante (12 tests) toujours verte après renommage +
vérification manuelle en navigateur headless.

**Portée volontairement limitée** : ce correctif extrait UN module,
conformément à la règle impérative n°4 ("étapes courtes et
vérifiables") et n°6 ("pas de réécriture totale immédiate"). La Phase 6
reste un chantier progressif, multi-passes, à poursuivre séparément.

### 18. 🟡 Deuxième module extrait : `IndexedDbBackupEngine`

**Correction appliquée** : les 4 fonctions de la sauvegarde de secours
IndexedDB (Phase 5, cf. §13) — `ouvrirIndexedDBSecours`,
`idbBackupPutStore`, `idbBackupGetStore`, `restaurerDepuisIndexedDB` —
sont regroupées dans un nouvel espace de noms `IndexedDbBackupEngine`,
même motif IIFE que `ComptesMixtesEngine` (§17) : `ouvrir()` (l'ancienne
`ouvrirIndexedDBSecours()`) reste **privée**, jamais exposée ; l'API
publique expose `put()`, `get()`, `restaurer()`. Tous les points d'appel
mis à jour (`saveStore()` → `IndexedDbBackupEngine.put(data)`, bouton
Confidentialité → `onclick="IndexedDbBackupEngine.restaurer()"`).

**Effet de bord découvert et documenté (positif — preuve que
l'encapsulation fonctionne)** : la technique de test utilisée jusqu'ici
pour simuler un échec/succès IndexedDB (réaffecter une fonction globale,
ex. `idbBackupGetStore = async () => {...}`) ne fonctionne plus après
l'extraction : `restaurer()` référence en interne la fonction privée
`get` de la fermeture, pas la propriété publique `IndexedDbBackupEngine.get`
— réaffecter cette dernière depuis l'extérieur n'a donc plus d'effet sur
le comportement interne du module. C'est le comportement RECHERCHÉ d'une
vraie encapsulation (empêche un "monkey-patch" accidentel de casser la
cohérence interne), mais cela a nécessité de réécrire le test
correspondant : au lieu de doubler `get()`, le test simule désormais un
`indexedDB` minimal en mémoire (avec la bonne référence d'objet `tx`
partagée entre `transaction()` et `put()` — piège classique repéré et
corrigé pendant l'écriture du test) pour exercer le flux réel
`put()` → `get()` → `restaurer()` de bout en bout dans le bac à sable Node.

**Comportement strictement identique avant/après** en navigateur réel
(vérifié en Playwright avec une vraie base IndexedDB : réplication après
`saveStore()`, suppression simulée du localStorage, restauration
réussie via le bouton de Confidentialité).

**Fichiers modifiés** : `FEC_Analyse_v6.html`,
`tests/test_indexeddb_backup.js` (1 nouveau test net : le flux complet
`put()`/`get()` via IndexedDB simulé, en plus du renommage des appels).
**Tests** : 10 tests (640 au total), tous verts + vérification manuelle
en navigateur headless.

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
| `tests/test_agregation_rename.js` | 8 | Renommage "Consolidé" → "Agrégation multi-sociétés" + bannière |
| `tests/test_rapport_import_fec.js` | 21 | Rapport d'import FEC structuré (Phase 2) |
| `tests/test_comptes_mixtes_multi_exercice.js` | 12 | Comptes mixtes multi-exercices (Phase 3) |
| `tests/test_fec_worker_parsing.js` | 5 | Parsing FEC déporté (Web Worker, Phase 5) |
| `tests/test_indexeddb_backup.js` | 10 | Sauvegarde de secours IndexedDB (Phase 5, `IndexedDbBackupEngine`) |
| `tests/test_period_data_tresorerie.js` | 19 | Agrégation par période + formatage monétaire (Phase 7) |
| `tests/test_previsionnel_prorata_temporis.js` | 10 | Amortissement au prorata temporis mensuel (Phase 8) |
| `tests/test_accessibilite.js` | 12 | Fermeture au clavier + aria-labels (Phase 9) |

Total suite complète (`node tests/run_all.js`) : **640 tests, 0 échec**.

---

## Prochaines étapes recommandées (par ordre de priorité)

1. ~~**Barèmes non validés** (§7) et **caisses TNS incomplètes** (§8)~~ —
   ✅ traité (cf. §7-8 ci-dessus).
2. ~~**Phase 4 — Renommage "Consolidé" → "Agrégation multi-sociétés"** +
   bannière permanente~~ — ✅ traité, confirmé par l'utilisateur (cf. §9
   ci-dessus).
3. ~~**Phase 2 — Validation FEC**~~ — ✅ traité : rapport d'import
   structuré ajouté sans modifier le parseur existant (cf. §10 ci-dessus).
4. ~~**Phase 3 — Comptes mixtes**~~ — ✅ traité : détection de
   l'incohérence + correction explicite (jamais automatique/silencieuse),
   sans inventer de nouvelle règle de convention de signe (cf. §11
   ci-dessus).
5. ~~**Phase 5 — Web Worker de parsing + sauvegarde de secours
   IndexedDB**~~ — ✅ traité (cf. §12-13 ci-dessus). IndexedDB reste un
   miroir best-effort (pas la source de vérité principale) : une
   bascule complète nécessiterait de convertir les 34 usages
   synchrones de `loadStore()`/`saveStore()`, décision arbitrée avec
   l'utilisateur pour ne pas mélanger ce correctif ciblé avec la
   Phase 6.
6. **Chart.js local** : dépendance CDN actuelle déjà neutralisée par des
   gardes défensifs (§6 + correctif préexistant) — reste à héberger
   réellement le fichier en local pour un fonctionnement 100% hors ligne
   garanti (actuellement : dégradation gracieuse, pas d'hébergement local).
7. **Phases 7-9** (tests étendus, améliorations de modules,
   accessibilité) — priorisées avant la Phase 6 (refactorisation
   modulaire/TypeScript), décision arbitrée avec l'utilisateur : la
   Phase 6 nécessite d'adapter le harnais de tests (contraint aujourd'hui
   à un seul `<script>` inline) et représente le chantier le plus
   invasif de toute la demande — reportée en dernier.

## Limites de cette passe

- Aucune régression fonctionnelle constatée (519/519 tests verts, vérifié
  après chaque correctif individuel, jamais en fin de lot).
- Les correctifs §7 et §8 sont **confirmés et dimensionnés** mais non
  implémentés : ne pas les considérer comme résolus.
- Aucune modification de l'apparence visuelle en dehors de ce qui était
  strictement nécessaire à la correction (aucun changement de couleur, de
  disposition ou de parcours n'a été fait "en passant").
