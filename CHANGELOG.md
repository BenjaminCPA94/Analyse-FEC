# CHANGELOG — FEC Analyse

Toutes les entrées se réfèrent à l'audit complet dans `AUDIT.md` (constats,
correctifs, preuves). Version livrée : **v6** (`FEC_Analyse_v6.html`),
partant de la base v5 (`FEC_Analyse_v5_code_complet.html`, import initial).

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
