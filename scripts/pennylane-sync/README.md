# Synchronisation Pennylane → FEC Analyse

Ce dossier contient un petit script **indépendant** de `FEC_Analyse_v6.html`
qui automatise le téléchargement du FEC depuis Pennylane. Il **ne fait
pas partie de l'application** et ne doit jamais y être intégré tel quel :
voir la section « Pourquoi un script séparé » ci-dessous.

## Installation

Aucune dépendance à installer (Node.js seul, natif). Il faut juste :

1. Node.js ≥ 18 installé sur le poste.
2. Une clé API Pennylane (Company API token ou Firm API token) avec le
   scope `exports:fec`. Dans Pennylane : **Paramètres → API → Créer un
   jeton**.
3. Copier `.env.example` en `.env` (dans ce même dossier) et y coller
   votre clé :
   ```
   PENNYLANE_API_KEY=votre_cle_ici
   ```
   Ce fichier `.env` est exclu de Git (voir `.gitignore`) — **ne le
   partagez jamais et ne le commitez jamais**.

## Utilisation

```bash
node fetch-fec.js --start 2025-01-01 --end 2025-12-31
```

Options :
- `--start YYYY-MM-DD` : début de la période à exporter (obligatoire)
- `--end YYYY-MM-DD` : fin de la période à exporter (obligatoire)
- `--out chemin/fichier.txt` : nom du fichier de sortie (par défaut
  `FEC_<start>_<end>.txt` dans le dossier courant)

Le script :
1. Demande à Pennylane de générer un export FEC pour la période donnée.
2. Attend (interroge l'API toutes les 3 secondes, jusqu'à 5 minutes) que
   l'export soit prêt.
3. Télécharge le fichier FEC en local.

Une fois le fichier téléchargé, importez-le dans FEC Analyse comme un
FEC classique : bouton **« Nouveau dossier »** → sélectionnez le
fichier téléchargé.

## Pourquoi un script séparé (et pas une intégration directe dans l'app) ?

`FEC_Analyse_v6.html` est volontairement un fichier unique qui tourne
100% dans le navigateur, sans aucune donnée envoyée sur le réseau —
c'est l'argument de confidentialité mis en avant dans l'application
elle-même. Intégrer directement l'appel à l'API Pennylane dans ce
fichier poserait deux problèmes :

1. **Sécurité** : la clé API devrait être stockée ou saisie dans le
   HTML, où n'importe qui ayant accès au fichier (ou aux outils
   développeur du navigateur) pourrait l'extraire et accéder au dossier
   Pennylane du cabinet/client.
2. **Faisabilité technique** : les navigateurs bloquent par défaut les
   appels directs vers des API tierces qui n'autorisent pas
   explicitement l'origine appelante (politique CORS) — un simple
   fichier `file://` n'a aucune chance de passer.

Un script Node.js exécuté localement, avec la clé dans un `.env` non
versionné, résout les deux problèmes : la clé ne quitte jamais le poste
du cabinet, et le script (contrairement à un navigateur) n'est pas
soumis aux restrictions CORS.

## Limites connues

- Les noms exacts des champs de la réponse Pennylane (URL de
  téléchargement notamment) sont déduits de la documentation publique
  et peuvent évoluer. Si le script échoue à l'étape de téléchargement,
  il affiche la réponse brute de l'API — copiez-la pour ajuster la
  fonction `findDownloadUrl()` dans `fetch-fec.js`.
- L'export Pennylane ne verrouille pas la comptabilité : des écritures
  peuvent continuer à être saisies après l'export. Le FEC téléchargé est
  un instantané à l'instant de l'export, pas un flux temps réel.
- Pas de gestion multi-dossiers/multi-comptes dans ce script : une
  exécution = un export pour une période donnée. Adaptez si besoin pour
  boucler sur plusieurs cabinets/dossiers.
