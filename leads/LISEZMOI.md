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

## Fournisseurs d'e-mails

Interrogés dans cet ordre, jusqu'à trouver l'e-mail ; seuls ceux dont la clé est renseignée sont utilisés.

| Fournisseur | Offre | Où trouver la clé |
|---|---|---|
| Hunter | Gratuit : 50 crédits par mois | hunter.io › API keys |
| Apollo | Offre gratuite (compte ouvert avec un e-mail professionnel) | apollo.io › Settings › Integrations › API |
| Icypeas | Essai, puis environ 19 $ les 1 000 crédits | icypeas.com › tableau de bord › API |
| Dropcontact | Essai, puis abonnement ; seules les adresses trouvées sont débitées | dropcontact.com › tableau de bord › API |
| Lusha | API réservée aux offres payantes ; donne aussi des téléphones | lusha.com › tableau de bord › API |

Les clés restent dans le navigateur de chaque utilisateur. Le relais ne les conserve pas : il transmet la requête au fournisseur et renvoie la réponse, et refuse toute autre adresse.

Pour augmenter les chances de trouver l'adresse : compléter les leads avec l'annuaire (nom du dirigeant) et coller le site web de la société dans le suivi.

## Test

`node test/e2e.js` (Playwright) : relais, cascade de fournisseurs simulés, site web, suivi et export.
