# AUDIT — FEC Analyse v5 → v6

Audit réalisé sur `FEC_Analyse_v5_code_complet.html` (5 855 lignes, script principal
lignes 1428-5815, ~4 386 lignes de JS, 119 déclarations `function` top-level).

Méthode : extraction du script (regex + `vm` Node, cf. `tests/harness.js`),
vérification programmatique (comptage d'accolades, croisement des tables,
recherche de tous les `getElementById`/`onXXX=` et de tous les `id=`),
puis exécution ciblée des fonctions métier dans le bac à sable Node.

Chaque constat ci-dessous est classé **CONFIRMÉ** (bug reproduit) ou **OK**
(vérifié conforme) ou **DÉCISION** (point ambigu, choix documenté).

---

## (a) Syntaxe et équilibre des délimiteurs

- `node --check` sur le script extrait : **OK**, aucune erreur de syntaxe.
- Comptage global `{`/`}` : 1181/1181 (équilibré) ; `(`/`)` : 2881/2881 (équilibré).
- Aucune apostrophe française (`'`) trouvée à l'intérieur d'une chaîne
  délimitée par apostrophes droites — le code utilise déjà `’` ou des
  guillemets doubles dans les libellés (ex. `'Report à nouveau créditeur'`
  utilise `à`/`é` etc. via échappement unicode). **OK**.

Conclusion : pas de bug de la classe « accolade déséquilibrée / apostrophe
française » dans l'état actuel du fichier fourni.

## (b) Cohérence HTML ↔ JS

- 48 noms de fonctions distincts référencés par des attributs `onXXX="..."`
  (dans le HTML statique **et** dans les templates JS générés dynamiquement) :
  les 48 résolvent vers une fonction top-level ou une exposition explicite
  `window.X = ...`. **OK** — aucun handler mort.
- 56 appels `getElementById('id')` littéraux recensés. 52 résolvent vers un
  `id="..."` statique ou créé dynamiquement (`el.id = '...'`). **4 ne
  résolvent nulle part** :
  - `#kCA`, `#kCAsub`, `#kRN`, `#kRNsub` — lignes 778-785 dans `buildCRTable()`.
    Code legacy (ancien bandeau KPI du CR) : les éléments n'existent dans
    aucune version du HTML fourni. **CONFIRMÉ — code mort**, sans impact
    fonctionnel car chaque accès est gardé par `if (el) ...`, mais à supprimer
    (cf. §(d)).
  - Faux positifs écartés (vérifiés créés dynamiquement) : `#np-overlay`,
    `#mp-picker`, `#dossier-dropdown`, etc.
- IIFE `Module Trésorerie` (lignes ~1779-3037 du script) : 17 fonctions
  `tmXxx` scopées localement, dont seules `renderTresorerie` et
  `tmSetProjection` sont exposées sur `window`. Vérifié qu'aucun `onXXX=`
  du reste du fichier ne référence les 15 autres — encapsulation
  intentionnelle et saine. **OK**.

## (c) Cohérence table ROUTING ↔ squelettes CR/Bilan

- Extraction programmatique de la table `ROUTING` (`autoAffectOrphans()`,
  script lignes 3428-3967) : **476 règles** (préfixe, table, groupId, subId).
- Extraction des groupes/sous-groupes déclarés par `defaultMPS_CR()` (16
  groupes / 25 sous-groupes) et `defaultMPS_Bilan()` (18 groupes / 38
  sous-groupes).
- Croisement des 63 couples `(gid, subId)` uniques utilisés par ROUTING
  contre les squelettes : **0 cible manquante**. **OK** — chaque règle de
  routage pointe vers un groupe/sous-groupe réellement défini.

## (d) Code mort

Confirmé mort (aucun appelant) :
- `defaultMPS_CR_Holdings()` — fonction complète, jamais appelée.
- `toggleCurrencyMenu(){}` — déjà un no-op explicite, aucun `onclick` ne le référence.
- `updateBackBtn(){}` — idem, aucun appelant.
- Références `#kCA/#kCAsub/#kRN/#kRNsub` dans `buildCRTable()` (cf. §(b)).
- Double définition de `libOf(num)` (lignes 320 et 1553, corps identique) —
  la seconde masque silencieusement la première sans jamais diverger
  aujourd'hui, mais c'est une duplication à risque (une future modification
  de l'une sans l'autre romprait la cohérence d'affichage).
- Variable `creancesFiscalesActif` (dans `buildBilanTables()`) : calculée
  mais jamais lue.

Confirmé **vivant** (à ne pas supprimer, contrairement à l'intuition) :
- `closeDDClick(e)` — passé sans parenthèses à `addEventListener('click',
  closeDDClick)` : bien vivant.

## (e) Sécurité — XSS via `innerHTML`

**CONFIRMÉ — faille XSS stockée, sévérité haute.** Aucune fonction
d'échappement HTML n'existe dans le fichier (recherche `escapeHtml|escape|
sanitize` : 0 résultat). Or de nombreux blocs assignent à `.innerHTML` des
chaînes construites par interpolation directe de données issues du FEC
importé (libellé de compte `ACTIVE.libs[num]`, via `libOf(num)` ou des
fermetures locales équivalentes) ou du nom de fichier importé :

| Ligne (script) | Fonction | Donnée injectée non échappée |
|---|---|---|
| 705, 721, 736 | `buildCRTable()` | `libOf(num)` (libellé compte FEC) |
| 1040, 1054 | `buildBilanTables()`/`buildBilanHalf()` | `libOf(num)` |
| 1620 | `chipHtml()` | `libOf(num)` dans l'attribut `title="..."` (breakout d'attribut possible) |
| 1733/1746 | `mpFilterPicker()` (recherche de compte) | `libOf(n)` |
| 3340 | diagnostic bilan | `lib(n)` (fermeture locale sur `ACTIVE.libs`) |
| 4347 | `runBilanDiagnostic()` (top orphelins) | `lib(n)` |
| 568, 2197 | bandeau info dossier / trésorerie | `ACTIVE.filename` (nom du fichier importé, contrôlable par qui fournit le FEC) |
| 1460, 1508 | création dossier | `name` (nom de dossier saisi par l'utilisateur) |

**Scénario d'exploitation** : un FEC contenant un `CompteLib` du type
`<img src=x onerror=alert(document.cookie)>` exécute du JavaScript dès
l'ouverture du CR, du Bilan, ou du picker de mapping — un cabinet qui
ouvre un FEC transmis par un tiers (client, ex-expert-comptable) est donc
vulnérable à une XSS stockée. Sévérité **critique** vu le contexte métier
(données comptables potentiellement sensibles, cabinets multi-clients).

`toast()` utilise `textContent` (pas `innerHTML`) : **OK**, non vulnérable.

→ Corrigé en Phase 2 (priorité 1, avant tout autre correctif).

## (f) Robustesse du parseur FEC (`parseFECFile`)

- Séparateur tabulation **ou** `|` : **OK** (`sep = lines[0].includes('\t')
  ? '\t' : '|'`).
- Colonnes dans un ordre différent : **OK**, résolution par nom d'en-tête
  normalisé (accents retirés, casse ignorée) via la fonction `col(...)`,
  indépendante de la position.
- Montants `1 234,56` : **OK**, `pn()` retire les espaces puis remplace la
  virgule décimale par un point.
- Lignes vides / malformées : **OK**, `filter(l=>l.trim())` + garde de
  longueur de colonnes (`c.length < max(...)+1 → skip`).
- **Encodage UTF-8/Latin-1 : CONFIRMÉ — bug.** `reader.readAsText(_npFile,
  'latin1')` (ligne 1495) force **toujours** un décodage Latin-1, quel que
  soit l'encodage réel du fichier. Un FEC exporté en UTF-8 (cas fréquent,
  notamment avec libellés accentués) sera mal décodé : chaque caractère
  accentué multi-octets UTF-8 devient une paire de caractères Latin-1
  incohérents (mojibake, ex. `é` → `Ã©`). Aucune détection de BOM, aucun
  essai UTF-8 avec repli Latin-1. → Corrigé en Phase 2.
- À-Nouveaux (AN/OUV/RAN…) : **OK** — la fonction `isAN()` détecte par
  code journal ET libellé d'écriture ; inclus classes 1-5, exclus classes
  6-7, conforme à l'invariant demandé.

## (g) Table de routage — comptes mixtes 444 / 4458

**CONFIRMÉ — les comptes 444 et 4458 « nus » ne sont jamais réellement
routés comme mixtes.** `COMPTES_MIXTES = new Set(['444','4458','441'])`
mais la table `ROUTING` ne contient **aucune règle de préfixe exact `444`
ni `4458`** (seuls des préfixes plus longs comme `4456`, `4457`, `44581-89`
existent). Le branchement spécial « mixte » dans `findRoute()` ne se
déclenche que si le préfixe *matché* (`pfx`) est strictement égal à
`'444'`, `'4458'` ou `'441'` — donc **seul `441` bénéficie réellement** de
la logique mixte (il a une entrée `['441','bilan','ba7','ba7_a']`).
Un compte exactement `444` ou `4458` retombe sur le *fallback générique*
de fin de fonction (classe 1-5 : ventilé par signe vers `ba7_b`/`bp7_b`,
un poste générique « autres créances/dettes diverses »), et non vers le
poste métier attendu (« Dettes IS » / « TVA à régulariser »).

Impact : le compte reste sur le bon **côté** du bilan (le fallback utilise
aussi le signe du solde), donc **l'équilibre Actif=Passif n'est pas rompu
par ce point précis**, mais le classement PCG est imprécis (mauvais poste
de destination). **DÉCISION** : ajouter deux règles explicites
`['444','bilan','ba7','ba7_a']` et `['4458','bilan','ba7','ba7_a']` dans
ROUTING pour activer réellement le branchement mixte déjà écrit (cf. PCG
2026, note ANC — le compte 444 « État, impôt sur les bénéfices » peut être
un acompte payé d'avance (actif) ou une dette d'IS restant à payer
(passif) selon le solde ; même logique pour 4458 « TVA à régulariser »).
→ Corrigé en Phase 2 : ajout de `['444','bilan','ba7','ba7_a']` et
`['4458','bilan','ba7','ba7_a']` dans ROUTING (l'entrée sert uniquement
d'ancre pour atteindre la branche `COMPTES_MIXTES` ; le gid/subId qu'elle
porte est ignoré par cette branche, qui recalcule la destination selon le
signe du solde — vérifié par `tests/test_pcg_routing.js`).

**Point documenté (décision, non modifié)** : le commentaire du code
juste au-dessus de la règle `441` (« Subventions et aides à recevoir →
TOUJOURS ACTIF ») est en tension avec le fait que `441` figure aussi dans
`COMPTES_MIXTES` (donc traité comme mixte selon signe, pas fixe-actif).
Faute de FEC de test faisant apparaître un `441` créditeur, et pour ne pas
introduire une régression non testée sur un point à la fois mineur et
ambigu, ce comportement existant (mixte) est **conservé tel quel** —
un compte 441 créditeur (cas rare en pratique) sera classé en passif
(`bp6/bp6_c`) plutôt qu'en actif fixe. À trancher avec l'expert-comptable
si des FEC réels présentent ce cas.

## (h) BUG MAJEUR CONFIRMÉ — `buildBilanTables()` corrompt le mapping à chaque rendu

**Sévérité : critique — rompt l'invariant Actif = Passif + Résultat net et
l'unicité stricte des comptes.**

`buildBilanTables()` est censée être une fonction de **rendu** (elle lit
`ACTIVE.mps` pour construire le HTML des tableaux Actif/Passif). Or son
bloc « CORRECTION 2 » (script lignes 828-853, cf. `sub.accounts =
dettesFiscalesPassif.filter(...)`) **réécrit en place** les tableaux
`accounts` des sous-groupes `bp6_b` et `bp6_c` à **chaque appel**, avec
une liste recalculée depuis zéro (`bal[n] < 0 && n.startsWith('445')`),
en écrasant tout ce que `autoAffectOrphans()` / l'utilisateur avait
correctement affecté.

Bug reproduit sur le FEC de référence embarqué (`DEFAULT_BAL`, dossier
Holdings) via `tests/harness.js` :
1. `autoAffectOrphans()` route correctement 138/138 comptes (toast :
   « 138 comptes affectés »).
2. `buildBilanTables()` est appelée en fin d'`autoAffectOrphans()` →
   les comptes `4421` (-6 741, IS), `44191` (-90 000), `44586` (+627,
   TVA factures non parvenues) et `44571009` (+330) **disparaissent
   purement et simplement** du mapping (ni CR, ni Bilan) car ils ne
   correspondent pas au filtre `startsWith('445') && bal<0` alors qu'ils
   avaient été correctement placés par `findRoute()`.
3. En prime, `bp6_b` et `bp6_c` se retrouvent avec **la liste identique
   de comptes en double** (le même calcul est réaffecté aux deux
   sous-groupes à cause d'un test `if (sub.id==='bp6_c' ||
   sub.label.includes('TVA'))` qui matche les deux sous-groupes à la
   fois) — violation directe de l'invariant d'unicité stricte (#6).
4. Conséquence chiffrée sur ce FEC : 4 comptes perdus, somme nette
   -95 784 € disparue du Bilan → écart Actif/Passif largement supérieur
   à la tolérance de 5 €.

Root cause : logique de « correction » ad hoc, écrite après-coup dans une
fonction de rendu au lieu du moteur d'affectation (`autoAffectOrphans` /
`findRoute`), qui fait doublon en pire avec la logique `COMPTES_MIXTES`
déjà correcte. Variable `creancesFiscalesActif` calculée dans le même
bloc et jamais utilisée (mort). Un second sous-bloc `if (g.id==='bp1' ||
...)` est un no-op vide (commentaire seul, aucun code).

→ Corrigé en Phase 2 : suppression complète du bloc « CORRECTION 2 » (le
routage 44x/441 mixte est déjà et doit rester la seule responsabilité de
`autoAffectOrphans()`/`findRoute()` ; une fonction de rendu ne doit jamais
muter `ACTIVE.mps`).

## (i) Contrôle d'équilibre Actif = Passif (tolérance 5 €)

Code de contrôle (`bilan-equilibre`, script lignes ~861-880) : tolérance
`ecart < 5` conforme à l'invariant demandé, message contextualisé selon la
cause probable de l'écart (résultat non injecté / comptes non classés /
mapping incomplet). **OK**, aucune correction nécessaire une fois le bug
(h) corrigé.

## (j) Idempotence de `autoAffectOrphans()`

Le code retourne explicitement sans `toast()` quand rien n'a changé
(`if (parts.length === 0) return;`, script ligne ~4096). **OK, conforme**
à l'exigence « deuxième passage sans toast » — vérifié par test dans
`tests/run_all.js` (Phase 3) une fois le bug (h) corrigé (sinon la
corruption à chaque appel change perpétuellement le résultat et casse
l'idempotence de facto).

## (k) Performance — gros FEC (500 000 lignes)

- `parseFECFile()` est un unique passage `for` sur `lines` (complexité
  O(n)), algorithmiquement correct pour 500k lignes.
- **Mais** l'intégralité du parsing s'exécute de façon **synchrone** dans
  le callback `reader.onload`, sur le thread principal, sans découpage ni
  indicateur de progression : pour un FEC de 500k lignes, le gel de l'UI
  pendant plusieurs secondes est attendu. **CONFIRMÉ — gap fonctionnel**
  (pas un bug de correction, mais un manque d'industrialisation demandé
  explicitement en Phase 4 : découpage par lots + barre de progression).
- `autoAffectOrphans()` boucle comptes-uniques × règles (≤ quelques
  milliers × 476), indépendant du nombre de lignes FEC : pas de risque de
  blocage même sur un très gros fichier.

## (l) Gestion du quota localStorage

`saveStore()` encapsule déjà `localStorage.setItem` dans un `try/catch`
et déclenche un `toast('Stockage insuffisant', true)` en cas d'échec —
**partiellement conforme**, mais le message est générique (pas de
diagnostic, pas d'action proposée à l'utilisateur — ex. exporter le
dossier avant de le supprimer). → Amélioré en Phase 4 (message
actionnable + bouton export de secours).

---

## (m) Vérification en navigateur réel (Chromium/Playwright) — Phase 5

Les phases 0-4 ont été validées par le harnais Node (`tests/harness.js`),
qui exécute le script hors DOM réel. Avant livraison, une vérification en
navigateur réel (Chromium headless, `chart.js` chargé localement pour
contourner l'absence de réseau externe dans l'environnement d'audit) a
été effectuée : chargement de la page, ouverture d'un nouveau dossier,
import d'un FEC contenant un libellé de compte `<img src=x
onerror=...>`, navigation CR/Bilan, export CSV, suppression totale des
données (RGPD).

**Résultat** : XSS confirmée neutralisée en conditions réelles (le
libellé s'affiche échappé, aucun JavaScript ne s'exécute), CR/Bilan se
rendent correctement, export CSV déclenche un vrai téléchargement,
suppression RGPD vide bien le localStorage — 0 erreur console, 0
exception JS.

**CONFIRMÉ — bug supplémentaire découvert par ce test (invisible aux
tests Node, qui ne simulent pas de clics réels)** : le bouton « Nouveau
dossier » de la barre latérale du home screen (`<div class="hs-new">`)
n'avait **aucun attribut `onclick`** — un clic dessus ne faisait
strictement rien. L'application restait utilisable via les liens « +
Nouveau projet » de chaque section, mais ce raccourci principal était
mort depuis la version fournie. Corrigé : `onclick="openNouveauProjet('non-classes')"`,
même action que les liens équivalents.

**Point non vérifiable dans cet environnement (réseau sortant restreint)** :
l'application charge Chart.js depuis un CDN externe
(`cdnjs.cloudflare.com`). Si ce CDN est inaccessible (pare-feu de cabinet
restrictif, poste sans connexion internet), les graphiques ne s'affichent
pas — le reste de l'application (import, mapping, CR/Bilan, exports,
qui ne dépendent pas de Chart.js) continue de fonctionner, vérifié
explicitement par ce même test. Documenté comme limite connue dans
`CHECKLIST_PROD.md`.

## Synthèse des correctifs à appliquer (Phase 2, par ordre de priorité)

1. **[Sécurité — critique]** Ajouter une fonction `escHtml()` et l'appliquer
   à tous les points d'injection recensés en §(e) (libellés de comptes,
   nom de fichier, nom de dossier).
2. **[Invariant comptable — critique]** Supprimer le bloc « CORRECTION 2 »
   corrompant le mapping dans `buildBilanTables()` (§(h)).
3. **[Robustesse parseur]** Détection d'encodage UTF-8 (BOM ou heuristique)
   avec repli Latin-1, au lieu du `'latin1'` forcé (§(f)).
4. **[Précision PCG]** Ajouter les règles ROUTING `444`/`4458` manquantes
   pour activer réellement la logique `COMPTES_MIXTES` déjà écrite (§(g)).
5. **[Code mort]** Suppression de `defaultMPS_CR_Holdings`,
   `toggleCurrencyMenu`, `updateBackBtn`, des références `#kCA*/#kRN*`
   mortes dans `buildCRTable`, de la double définition de `libOf`, et de
   `creancesFiscalesActif`.

Chaque correctif ci-dessus fait l'objet d'un commit séparé avec test de
non-régression associé dans `tests/`.

## (n) Ajustement post-livraison v6 — comptes mixtes clients/fournisseurs/109

Demande de l'expert-comptable après revue de v6, portant sur trois
règles PCG supplémentaires absentes de la table ROUTING d'origine :

1. **Comptes clients (411, 413, 416, 418)** : normalement à l'ACTIF
   (créances). Si le solde est créditeur (situation anormale — avance ou
   trop-perçu client hors le compte dédié 419), le compte doit basculer
   au PASSIF en « Autres dettes créditrices » plutôt que de rester à
   l'actif avec un solde négatif.
2. **Comptes fournisseurs (401, 403, 404)** : normalement au PASSIF
   (dettes). Si le solde est débiteur (avance versée ou avoir à recevoir
   hors le compte dédié 409), le compte doit basculer à l'ACTIF en
   « Autres créances » plutôt que de rester au passif avec un solde
   négatif.
3. **Compte 109 (Capital souscrit — non appelé)**, normalement débiteur
   par nature : doit être présenté sur une ligne dédiée à l'ACTIF
   (« Capital souscrit — non appelé »), et non noyé dans les capitaux
   propres au passif comme c'était le cas jusque-là (`bp1_a`).

**Implémentation** : généralisation du mécanisme `COMPTES_MIXTES` (qui ne
gérait jusqu'ici que 444/4458/441, tous vers la même paire de postes) en
`MIXED_ROUTES`, une table `{préfixe → {actif:{gid,subId}, passif:{gid,subId}}}`
permettant à chaque famille de comptes de basculer vers SA paire de
postes propre. Ajout d'un nouveau groupe `ba0` (« Capital souscrit — non
appelé ») dans `defaultMPS_Bilan()`, positionné après le sous-total
« Total Actif Immobilisé » pour ne pas fausser ce sous-total. `MPS_VERSION`
incrémenté à 6 (structure du mapping modifiée) — `migrateLocalStorage()`
purge et régénère automatiquement les mappings des dossiers existants.

**Périmètre volontairement limité** : les comptes d'avances dédiés (409
« avances versées fournisseurs », 419 « avances reçues clients ») restent
fixes (déjà correctement positionnés à l'opposé de leur famille) et ne
sont PAS rendus mixtes — ils représentent une position toujours unidirectionnelle
par construction PCG, contrairement aux comptes clients/fournisseurs
génériques qui peuvent légitimement changer de sens selon les
circonstances (avoir, trop-perçu). Les comptes fournisseurs 405 (effets
à payer immobilisations) et 408 (factures non parvenues) n'ont **pas**
été rendus mixtes non plus, faute de demande explicite — à confirmer si
souhaité.

**Décision non tranchée, à confirmer** : la demande mentionnait aussi
« les comptes de capitaux propres qui sont débiteurs » de façon générale.
Seul le compte 109 a été traité comme un cas à part avec sa propre ligne
actif dédiée, conformément à l'exemple donné et à la présentation PCG
standard. Les autres comptes de capitaux propres anormalement débiteurs
(ex. 106, 108, 119 « report à nouveau débiteur ») **restent** positionnés
au passif comme composantes négatives des capitaux propres (déjà le cas
pour 119 via son sous-poste dédié `bp1_f`), conformément à la
présentation PCG usuelle — ils ne sont pas remontés à l'actif. Si une
règle plus large est souhaitée, elle doit être précisée compte par
compte plutôt que généralisée silencieusement.

**Preuves** : `tests/test_pcg_routing.js` (15 nouveaux cas : clients
débiteurs/créditeurs × 4 préfixes, fournisseurs créditeurs/débiteurs ×
3 préfixes, compte 109) et `tests/test_bilan_balance.js` (invariant
Actif = Passif + Résultat net vérifié exact — écart nul, pas seulement
sous tolérance — sur un scénario combinant toutes ces reclassifications).
Vérifié aussi en navigateur réel (Chromium) : bilan équilibré affiché,
ligne « Capital souscrit » visible à l'actif, ligne « Autres dettes »
visible au passif, 0 erreur console.
