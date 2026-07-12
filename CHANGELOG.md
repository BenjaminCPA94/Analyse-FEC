# CHANGELOG — FEC Analyse

Toutes les entrées se réfèrent à l'audit complet dans `AUDIT.md` (constats,
correctifs, preuves). Version livrée : **v6** (`FEC_Analyse_v6.html`),
partant de la base v5 (`FEC_Analyse_v5_code_complet.html`, import initial).

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
