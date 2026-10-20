# CHECKLIST_PROD — FEC Analyse v6

Liste de contrôle avant mise sur le marché. Statut au moment de la
livraison v6 ; à revalider à chaque évolution majeure du fichier.

## ⚠️ Avertissement légal (à conserver visible dans l'application et toute documentation commerciale)

> **FEC Analyse est un outil d'aide à l'analyse financière. Il ne remplace
> en aucun cas le jugement professionnel d'un expert-comptable ou d'un
> commissaire aux comptes.** Les affectations automatiques de comptes, les
> Soldes Intermédiaires de Gestion et les indicateurs de trésorerie
> produits sont fondés sur des règles génériques du Plan Comptable
> Général et peuvent nécessiter un ajustement manuel selon les
> particularités de chaque dossier (comptes auxiliaires non standards,
> conventions internes du cabinet, retraitements spécifiques). L'éditeur
> ne saurait être tenu responsable d'une décision prise sur la seule base
> des résultats de cet outil sans validation par un professionnel
> qualifié.

## Navigateurs

| Navigateur | Statut | Méthode de vérification |
|---|---|---|
| Chromium (headless, via Playwright) | ✅ Testé | Import FEC avec charge XSS, navigation CR/Bilan, export CSV, suppression RGPD — 0 erreur console, 0 exception. Voir AUDIT.md §(m). |
| Google Chrome / Microsoft Edge (desktop, interactif) | ⚠️ Non testé dans cet environnement (pas d'accès à un navigateur graphique interactif) | À valider manuellement avant mise en production — le moteur (Chromium) est identique à celui testé, risque faible. |
| Mozilla Firefox | ⚠️ Non testé | À valider manuellement — vérifier en particulier `URL.createObjectURL`/téléchargement CSV, `TextDecoder('windows-1252')`, et le rendu `@media print`. |
| Safari (macOS/iOS) | ⚠️ Non testé | À valider manuellement — Safari a des divergences connues sur `Intl.NumberFormat`, le comportement de téléchargement de Blob, et `@media print`. Priorité de test si la clientèle utilise Mac. |

**Recommandation** : avant toute mise sur le marché, exécuter manuellement
le parcours suivant sur Chrome, Firefox et Safari desktop : import d'un
FEC réel → vérification de l'équilibre du bilan → export CSV du CR et du
Bilan → impression/PDF → suppression des données.

## Limites connues

- **Dépendance à un CDN externe pour les graphiques.** Chart.js est chargé
  depuis `cdnjs.cloudflare.com`. Si ce CDN est inaccessible (pare-feu de
  cabinet restrictif, poste sans connexion internet, proxy d'entreprise
  bloquant les CDN), **les graphiques ne s'affichent pas** (reproduit et
  confirmé pendant l'audit). Le reste de l'application (import, mapping,
  tableaux CR/Bilan, exports CSV/JSON, suppression RGPD) ne dépend pas de
  Chart.js et continue de fonctionner normalement. Recommandation pour un
  déploiement en environnement réseau restreint : héberger `chart.umd.js`
  en local et changer la balise `<script src=...>` en conséquence (le
  fichier reste alors 100% autonome sans aucune requête sortante).
- **Le parsing d'un FEC reste un traitement synchrone en un seul passage**
  (pas de découpage par lots avec barre de progression en pourcentage).
  Sur un FEC de 500 000 lignes (~28 Mo), le traitement mesure ~2,3 s
  (benchmarké via `tests/harness.js` sur Node — l'ordre de grandeur en
  navigateur réel doit être resté comparable, JS étant single-threadé
  dans les deux cas). L'interface affiche désormais un état "Analyse en
  cours… (X Mo)" avant de lancer ce traitement pour éviter l'impression
  d'un gel instantané, mais le navigateur reste non interactif pendant
  ces ~2 s sur les fichiers les plus volumineux.
- **Comptes 441 créditeurs** : traités comme mixtes (côté actif/passif
  selon le signe du solde) malgré un commentaire de code contradictoire
  ("toujours actif"). Voir AUDIT.md §(g) — ambiguïté documentée, non
  tranchée faute de cas de test réel ; à confirmer avec un expert-comptable
  si des FEC réels présentent des comptes 441 créditeurs.
- **Pas de tests unitaires exhaustifs sur les 476 règles ROUTING** : la
  suite couvre une table de vérité représentative (23 cas, cf.
  `tests/test_pcg_routing.js`) plutôt que chaque règle individuellement.
  La cohérence structurelle de la table complète (chaque règle pointe
  vers un groupe/sous-groupe existant) est en revanche vérifiée à 100%
  (cf. AUDIT.md §(c)).
- **Modules Thème/Logo/Modèle** (onglets des paramètres de dossier) sont
  des espaces réservés non fonctionnels ("à configurer") — pré-existants
  dans la version fournie, non traités dans cet audit car hors du
  périmètre comptable/sécurité prioritaire.

## Taille maximale de FEC validée

- **500 000 lignes / ~28,5 Mo** (fichier synthétique), traitement complet
  sans erreur en ~2,3 s (Node). C'est la taille maximale effectivement
  testée dans le cadre de cet audit.
- Au-delà (plusieurs millions de lignes), le comportement n'a pas été
  vérifié : risque de dépassement de la limite de taille de
  `localStorage` (généralement 5-10 Mo par origine selon le navigateur)
  puisque la balance ET les libellés du FEC entier sont sérialisés en
  JSON à chaque sauvegarde (`saveStore()`). `saveStore()` détecte
  désormais `QuotaExceededError` et affiche un message actionnable au
  lieu d'échouer silencieusement, mais ne réduit pas la taille des
  données — pour des FEC très volumineux, recommander l'export JSON
  régulier (bouton "Sauvegarder en JSON") plutôt qu'une dépendance
  exclusive au localStorage.

## Sécurité

- ✅ XSS stockée (libellés de comptes, nom de fichier, nom de dossier)
  corrigée et vérifiée en navigateur réel (AUDIT.md §(e), §(m)).
- ✅ Numéros de compte assainis à la source dans le parseur (défense en
  profondeur).
- ✅ Aucune donnée n'est envoyée sur le réseau pour l'analyse elle-même
  (localStorage uniquement) — seule la bibliothèque Chart.js est chargée
  depuis un CDN au démarrage (code, pas de données utilisateur).
- ⚠️ Pas de Content-Security-Policy (CSP) définie dans le fichier HTML.
  Recommandation avant diffusion large : ajouter une balise
  `<meta http-equiv="Content-Security-Policy" ...>` restrictive si le
  fichier est servi via un serveur web (moins pertinent en usage
  fichier local `file://`).

## Confidentialité / RGPD

- ✅ Bandeau "Confidentialité" explicite (aucune donnée envoyée en
  réseau) accessible depuis le home screen.
- ✅ Suppression totale des données locales en un clic, testée en
  navigateur réel (purge confirmée de `localStorage`).
- ✅ Export/import JSON portable pour sauvegarder un dossier hors du
  navigateur avant suppression.

## Suite de tests

- `node tests/run_all.js` : 71 tests, code retour non nul en cas
  d'échec. Couvre : syntaxe, E2E propre/pollué, table de vérité PCG,
  robustesse du parseur, détection d'encodage, SIG, non-régression de
  la corruption du Bilan, idempotence, XSS, exports.
- Aucune vérification automatisée du rendu visuel (CSS, mise en page,
  impression) — validation manuelle requise avant mise en production
  (cf. section Navigateurs ci-dessus).

## Avant chaque mise à jour du mapping PCG (ROUTING)

1. Relancer `node tests/run_all.js` — doit rester intégralement vert.
2. Si la structure du mapping change (nouveaux champs sur les groupes ou
   sous-groupes), incrémenter `MPS_VERSION` et vérifier que
   `migrateLocalStorage()` gère correctement la transition (purge des
   mappings obsolètes sans perte des données comptables).
3. Documenter toute règle PCG ambiguë dans `AUDIT.md` plutôt que de la
   trancher silencieusement dans le code.
