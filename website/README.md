# Site RB Partners

Site vitrine statique du cabinet d'expertise comptable RB Partners (Rachel Illouz & Benjamin Haziza).

## Aperçu en local

Aucune installation requise : ouvrez `index.html` dans un navigateur, ou lancez un petit serveur local :

```bash
cd website
python3 -m http.server 8000
```

Puis rendez-vous sur `http://localhost:8000`.

## Structure

```
website/
├── index.html        # Contenu et structure de la page
├── css/styles.css     # Styles (palette bleu marine & or)
├── js/main.js          # Menu mobile, animations au scroll, formulaire de contact
└── assets/favicon.svg # Favicon / monogramme RB
```

## À personnaliser avant mise en ligne

- **Coordonnées** : téléphone, email et adresse (actuellement des valeurs à remplacer) dans `index.html`.
- **Nom de domaine / email** : `contact@rb-partners.fr` est un espace réservé.
- **Formulaire de contact** : le formulaire ne fait actuellement qu'une validation côté client (aucun envoi réel). Pour recevoir les messages, connectez-le à un service (Formspree, Netlify Forms, backend maison, etc.) en modifiant `js/main.js` et l'attribut `action`/`method` du `<form>`.
- **Photos de l'équipe** : les avatars sont actuellement des initiales (RI / BH). Vous pouvez les remplacer par de vraies photos dans `.team-card__avatar`.
- **Textes légaux** : ajoutez une page de mentions légales / politique de confidentialité si nécessaire (obligatoire en France pour un site professionnel).

## Déploiement

Le site est 100% statique (HTML/CSS/JS, sans dépendance ni build). Il peut être déployé tel quel sur GitHub Pages, Netlify, Vercel ou tout hébergement statique.
