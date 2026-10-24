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

## Résumé hebdomadaire par e-mail (automatique)

Chaque lundi vers 6 h (heure de Paris en hiver), l'outil mis en ligne sur Vercel envoie un e-mail avec les leads prioritaires de la semaine : nouvelles sociétés et sociétés en changement, complétées avec l'annuaire, sans tes clients ni les sociétés cessées.

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
| `LEADS_EMAIL_FROM` | `Leads <leads@cabinet.fr>` (facultatif, domaine vérifié chez Resend) |

3. Redéploie. Pour voir l'e-mail sans l'envoyer : `https://<adresse-vercel>/api/digest?secret=<CRON_SECRET>&dry=1`.

## Fournisseurs d'e-mails

Interrogés dans cet ordre, jusqu'à trouver l'e-mail ; seuls ceux dont la clé est renseignée sont utilisés.

| Fournisseur | Offre | Où trouver la clé |
|---|---|---|
| Google (site et téléphone, pas d'e-mail) | Places API : quota mensuel gratuit, puis payant | console.cloud.google.com › Google Maps Platform › Clés (activer « Places API (New) ») |
| Hunter | Gratuit : 50 crédits par mois | hunter.io › API keys |
| Apollo | Offre gratuite (compte ouvert avec un e-mail professionnel) | apollo.io › Settings › Integrations › API |
| Icypeas | Essai, puis environ 19 $ les 1 000 crédits | icypeas.com › tableau de bord › API |
| Dropcontact | Essai, puis abonnement ; seules les adresses trouvées sont débitées | dropcontact.com › tableau de bord › API |
| Lusha | API réservée aux offres payantes ; donne aussi des téléphones | lusha.com › tableau de bord › API |

Les clés restent dans le navigateur de chaque utilisateur. Le relais ne les conserve pas : il transmet la requête au fournisseur et renvoie la réponse, et refuse toute autre adresse.

Pour augmenter les chances de trouver l'adresse : compléter les leads avec l'annuaire (nom du dirigeant) et renseigner le site web de la société dans le suivi (Google le trouve automatiquement si sa clé est renseignée).

## Suivi

Le suivi (statut, contacts, notes) est rattaché au SIREN : une société déjà contactée reste suivie quand elle réapparaît dans une autre annonce. Il est conservé dans le navigateur ; « Sauvegarder mon suivi » télécharge un fichier (sans les clés API) que « Restaurer une sauvegarde » fusionne sur un autre poste.

## Test

`node test/e2e.js` et `node test/features.js` (Playwright) : relais, cascade de fournisseurs simulés, site web, suivi, export, résumé hebdomadaire, clients exclus, cache de l'annuaire, sauvegarde et lancement automatique.
