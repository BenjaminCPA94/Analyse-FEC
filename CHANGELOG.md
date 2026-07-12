# CHANGELOG — FEC Analyse

Toutes les entrées se réfèrent à l'audit complet dans `AUDIT.md` (constats,
correctifs, preuves). Version livrée : **v6** (`FEC_Analyse_v6.html`),
partant de la base v5 (`FEC_Analyse_v5_code_complet.html`, import initial).

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
