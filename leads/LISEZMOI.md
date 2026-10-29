# Leads expert-comptable

Outil de détection de prospects : nouvelles sociétés et sociétés en changement (BODACC), complétées par l'annuaire officiel des entreprises, avec recherche de l'e-mail et du téléphone du dirigeant.

## Trois façons de l'utiliser

| Façon | Recherche de leads | Recherche d'e-mails |
|---|---|---|
| Ouvrir `Leads_Expert_Comptable.html` dans le navigateur | Oui | Seulement avec les fournisseurs qui acceptent les appels directs depuis une page web |
| Le mettre en ligne sur Vercel (recommandé) | Oui | Oui, avec tous les fournisseurs (les appels passent par le relais `api/proxy.js`) |
| Serveur local : `node server.js` puis http://localhost:3000 (Node.js 18 ou plus) | Oui | Oui |

### Mise en ligne sur Vercel

1. Sur [vercel.com](https://vercel.com) : **Add New… › Project**, importer le dépôt `Analyse-FEC`.
2. **Root Directory** : choisir le dossier `leads`. Aucun autre réglage.
3. **Deploy**. L'outil est disponible à l'adresse donnée par Vercel.

Le plan gratuit de Vercel (Hobby) est réservé à un usage non commercial : pour le cabinet, utiliser le plan Pro (celui du CRM si le compte existe déjà).

## Suivi partagé de l'équipe

Sur la version en ligne, le suivi (statuts, contacts, notes, relances), la liste des clients et les modèles de messages sont communs à toute l'équipe ; chaque fiche indique qui l'a modifiée en dernier.

1. Dans Vercel › onglet **Storage**, connecte **Upstash for Redis** au projet (gratuit à ce volume). Vercel ajoute seul `KV_REST_API_URL` et `KV_REST_API_TOKEN`.
2. Ajoute la variable `LEADS_TEAM_PASSWORD` (le mot de passe commun de l'équipe), puis redéploie.
3. Dans l'outil, ouvre **Équipe : suivi partagé**, saisis ton prénom et le mot de passe. Le suivi déjà présent sur ton poste est envoyé au serveur à la première connexion.

En local (`node server.js`), le suivi partagé est enregistré dans `leads/data/`.

## Sociétés qui recrutent un comptable (France Travail)

L'onglet **Recrutent un comptable** liste les entreprises de ta zone qui publient une offre de comptable ou d'aide-comptable sur France Travail : une TPE qui recrute peut préférer externaliser. Cabinets comptables, intérim et cabinets de recrutement sont écartés. Le score favorise les entreprises de moins de 20 salariés, le temps partiel et les contrats courts.

1. Crée un compte sur [francetravail.io](https://francetravail.io), puis une application avec l'API **Offres d'emploi v2** (gratuite).
2. Ajoute dans Vercel `FT_CLIENT_ID` et `FT_CLIENT_SECRET` (identifiant et clé secrète de l'application), puis redéploie.

« Compléter avec l'annuaire » retrouve la société (SIREN, dirigeants) à partir de son nom. Quand l'offre donne un contact (nom, e-mail, téléphone), il est affiché et repris dans le message.

## Messages et relances

Le bouton **Message** de chaque lead prépare un e-mail, un courrier à imprimer, une invitation LinkedIn (300 caractères au plus) ou une relance, adaptés à l'événement (création, rachat, transfert, nouveau dirigeant, recrutement…). Les informations du cabinet et les modèles se règlent dans **Mes messages et relances**.

« Marquer comme envoyé » passe le lead en « Contacté » et programme une relance à 15 jours (deux relances au plus). Les relances dues apparaissent avec le badge RELANCE et le filtre « Relances à faire » ; l'e-mail du lundi les liste aussi. Chaque e-mail se termine par une mention d'origine et la possibilité de répondre « STOP ».

## Site de la société et réseaux sociaux

L'outil ne collecte rien sur LinkedIn, Instagram ou Facebook : ces plateformes l'interdisent et bloquent les comptes. Il s'appuie sur ce que la société publie elle-même et sur des recherches Google.

- **Analyse du site** (version en ligne, gratuite) : page d'accueil et pages « contact », « mentions légales », « à propos ». Les e-mails (celui du dirigeant en priorité), téléphones et liens Instagram, Facebook, LinkedIn et TikTok publiés sont repris. Elle passe avant les fournisseurs payants dans « Trouver l'e-mail ». Sur Vercel, elle est réservée à l'équipe (`LEADS_TEAM_PASSWORD`) ; les adresses internes sont refusées.
- **Serper** ([serper.dev](https://serper.dev), recherches Google ; crédits offerts à l'inscription puis environ 1 $ les 1 000) : « Site et réseaux » trouve le site et les pages sociales d'une société à partir de son nom et de sa ville, et le profil LinkedIn du dirigeant. Trois recherches au plus par société, une seule fois ; seuls les résultats qui citent la société sont gardés.
- **Sales Navigator** : lien direct vers la recherche du dirigeant sur chaque lead (abonnement LinkedIn).

Les pages trouvées apparaissent en gras dans la colonne Liens (« Instagram ✓ ») et dans l'export CSV ; le message LinkedIn se prépare avec le bouton « Message ».

## Résumé hebdomadaire par e-mail (automatique)

Chaque lundi vers 6 h (heure de Paris en hiver), l'outil mis en ligne sur Vercel envoie un e-mail avec les leads prioritaires de la semaine : nouvelles sociétés, sociétés en changement et (si France Travail est configuré) entreprises qui recrutent un comptable, complétées avec l'annuaire. Tes clients, les sociétés cessées et celles déjà traitées par l'équipe sont écartés ; les relances de la semaine sont listées en tête.

1. Crée un compte gratuit sur [resend.com](https://resend.com) et une clé API. Sans domaine vérifié, Resend n'envoie qu'à l'adresse du compte ; pour un autre destinataire, vérifie le domaine du cabinet.
2. Dans Vercel › Settings › Environment Variables, ajoute :

| Variable | Exemple |
|---|---|
| `RESEND_API_KEY` | `re_…` |
| `LEADS_EMAIL_TO` | `benjamin@cabinet.fr` |
| `CRON_SECRET` | une longue phrase au hasard |
| `LEADS_DEPS` | `75,92,93,94` |
| `LEADS_TARGET` | `conseil,restaurant,informatique` (facultatif) |
| `LEADS_EXCLUDE` | `holding` (facultatif) |
| `LEADS_CLIENTS` | SIREN de tes clients, séparés par des virgules (facultatif) |
| `LEADS_MIN_SCORE` | `60` (facultatif) |
| `LEADS_FORMES` | `SAS,SASU,EURL` (facultatif ; défaut : SAS, SASU, SARL, EURL, SA, SNC, Autre ; ajouter `SCI`, `EI`) |
| `LEADS_CAPITAL_MIN` / `LEADS_CAPITAL_MAX` | `0` / `10000` (facultatif, en euros) |
| `LEADS_ZONES` | `75011,75012,Montreuil` (facultatif : débuts de codes postaux ou villes) |
| `LEADS_EMAIL_FROM` | `Leads <leads@cabinet.fr>` (facultatif, domaine vérifié chez Resend) |

3. Redéploie. Pour voir l'e-mail sans l'envoyer : `https://<adresse-vercel>/api/digest?secret=<CRON_SECRET>&dry=1`.

## Fournisseurs d'e-mails

Interrogés dans cet ordre, jusqu'à trouver l'e-mail ; seuls ceux dont la clé est renseignée sont utilisés.

| Fournisseur | Offre | Où trouver la clé |
|---|---|---|
| ScrapeGraphAI (une IA lit le site de la société, y compris les sites en JavaScript ; seulement si le site est connu) | Crédits offerts à l'inscription, puis environ 20 $ les 10 000 crédits (5 à 10 crédits par site) | scrapegraphai.com › Dashboard › API Key |
| Serper (site et réseaux sociaux, pas d'e-mail direct) | Crédits offerts à l'inscription, puis environ 1 $ les 1 000 recherches | serper.dev › API Key |
| Google (site et téléphone, pas d'e-mail) | Places API : quota mensuel gratuit, puis payant | console.cloud.google.com › Google Maps Platform › Clés (activer « Places API (New) ») |
| Hunter | Gratuit : 50 crédits par mois | hunter.io › API keys |
| Apollo | Offre gratuite (compte ouvert avec un e-mail professionnel) | apollo.io › Settings › Integrations › API |
| Icypeas | Essai, puis environ 19 $ les 1 000 crédits | icypeas.com › tableau de bord › API |
| Dropcontact | Essai, puis abonnement ; seules les adresses trouvées sont débitées | dropcontact.com › tableau de bord › API |
| Lusha | API réservée aux offres payantes ; donne aussi des téléphones | lusha.com › tableau de bord › API |

Les clés restent dans le navigateur de chaque utilisateur. Le relais ne les conserve pas : il transmet la requête au fournisseur et renvoie la réponse, et refuse toute autre adresse.

**« Trouver les e-mails »** (barre d'outils) fait tout en un clic pour les leads affichés, du meilleur score au moins bon (50 au plus) : annuaire pour le nom du dirigeant, site de la société et réseaux, puis fournisseurs. Les e-mails et téléphones trouvés s'affichent dans la colonne « Dirigeant et contact ». Un second clic arrête la recherche ; un fournisseur déjà interrogé n'est pas relancé.

Pour augmenter les chances de trouver l'adresse : compléter les leads avec l'annuaire (nom du dirigeant) et renseigner le site web de la société dans le suivi (Google le trouve automatiquement si sa clé est renseignée).

## Suivi

Le suivi (statut, contacts, notes) est rattaché au SIREN : une société déjà contactée reste suivie quand elle réapparaît dans une autre annonce. Il est conservé dans le navigateur ; « Sauvegarder mon suivi » télécharge un fichier (sans les clés API) que « Restaurer une sauvegarde » fusionne sur un autre poste.

## Test

`node test/e2e.js`, `node test/features.js`, `node test/team.js`, `node test/social.js`, `node test/filters.js` et `node test/oneclick.js` (Playwright) : relais, cascade de fournisseurs simulés, site web, suivi, export, résumé hebdomadaire, clients exclus, cache de l'annuaire, sauvegarde, lancement automatique, offres France Travail, suivi partagé, messages, relances, analyse des sites, réseaux sociaux et filtres (formes, capital, zone).
