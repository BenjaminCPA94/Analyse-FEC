#!/usr/bin/env node
'use strict';
/**
 * fetch-fec.js — Télécharge un FEC depuis Pennylane et l'enregistre en
 * local, prêt à être importé dans FEC Analyse.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SÉCURITÉ : la clé API Pennylane n'est JAMAIS écrite dans ce fichier ni
 * dans le dépôt Git. Elle est lue depuis la variable d'environnement
 * PENNYLANE_API_KEY (ou un fichier .env local, non versionné — voir
 * scripts/pennylane-sync/.env.example). Ce script tourne UNIQUEMENT sur
 * le poste du cabinet ; il n'est jamais exécuté par FEC Analyse lui-même
 * (qui reste 100% local, sans dépendance réseau pour l'analyse).
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Usage :
 *   PENNYLANE_API_KEY=xxxxx node fetch-fec.js --start 2025-01-01 --end 2025-12-31 [--out ./fec.txt]
 *
 * Ou avec un fichier .env (voir .env.example) :
 *   node fetch-fec.js --start 2025-01-01 --end 2025-12-31
 *
 * Étapes :
 *   1. POST /exports/fecs (crée une demande d'export FEC, asynchrone)
 *   2. GET /exports/fecs/{id} en boucle jusqu'à ce que le statut soit prêt
 *   3. Téléchargement du fichier FEC à l'URL fournie par Pennylane
 *
 * Référence API : https://pennylane.readme.io/reference/exportfec
 * (Les noms exacts des champs de réponse peuvent évoluer côté Pennylane —
 * ce script tente plusieurs noms probables et affiche la réponse brute en
 * cas d'échec pour faciliter l'ajustement.)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://app.pennylane.com/api/external/v2';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const READY_STATUSES = ['ready', 'done', 'completed', 'succeeded'];
const FAILED_STATUSES = ['failed', 'error', 'cancelled'];

/** Charge .env (KEY=VALUE par ligne) si présent, sans dépendance externe. */
function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

function parseArgs(argv) {
  const args = { out: null, start: null, end: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--start') args.start = argv[++i];
    else if (a === '--end') args.end = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--help' || a === '-h') { printUsage(); process.exit(0); }
  }
  return args;
}

function printUsage() {
  console.log(`Usage :
  PENNYLANE_API_KEY=xxxxx node fetch-fec.js --start 2025-01-01 --end 2025-12-31 [--out ./fec.txt]

Options :
  --start YYYY-MM-DD   Début de la période à exporter (obligatoire)
  --end   YYYY-MM-DD   Fin de la période à exporter (obligatoire)
  --out   chemin       Fichier de sortie (défaut : ./FEC_<start>_<end>.txt)`);
}

function apiRequest(method, urlPath, apiKey, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath.startsWith('http') ? urlPath : API_BASE + urlPath);
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(url, {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(data ? JSON.parse(data) : {}); }
          catch (e) { reject(new Error(`Réponse JSON invalide (HTTP ${res.statusCode}) : ${data.slice(0, 300)}`)); }
        } else {
          reject(new Error(`Pennylane API a répondu HTTP ${res.statusCode} : ${data.slice(0, 500)}`));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Téléchargement du FEC échoué (HTTP ${res.statusCode})`));
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}

function findDownloadUrl(statusResp) {
  return statusResp.download_url || statusResp.file_url || statusResp.url
    || (statusResp.file && statusResp.file.url)
    || (statusResp.export && statusResp.export.url)
    || (statusResp.data && (statusResp.data.download_url || statusResp.data.url))
    || null;
}

async function main() {
  const args = parseArgs(process.argv);

  loadDotEnv();
  const apiKey = process.env.PENNYLANE_API_KEY;
  if (!apiKey) {
    console.error("Erreur : variable d'environnement PENNYLANE_API_KEY manquante.");
    console.error("Créez scripts/pennylane-sync/.env à partir de .env.example, ou passez la clé en variable d'environnement.");
    process.exit(1);
  }

  if (!args.start || !args.end) {
    printUsage();
    process.exit(1);
  }

  const outPath = args.out || path.join(process.cwd(), `FEC_${args.start}_${args.end}.txt`);

  console.log(`→ Création de l'export FEC Pennylane (${args.start} → ${args.end})...`);
  const created = await apiRequest('POST', '/exports/fecs', apiKey, {
    export_type: 'fec',
    period_start: args.start,
    period_end: args.end,
  });

  const exportId = created.id;
  if (!exportId) {
    throw new Error("Réponse inattendue de Pennylane (pas d'id d'export) : " + JSON.stringify(created));
  }
  console.log(`→ Export créé (id=${exportId}), en attente de génération...`);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let statusResp;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error("Délai dépassé en attendant que l'export FEC soit prêt (> 5 min). Réessayez plus tard.");
    }
    statusResp = await apiRequest('GET', `/exports/fecs/${exportId}`, apiKey);
    const status = statusResp.status;
    console.log(`  statut : ${status || '(inconnu)'}`);
    if (READY_STATUSES.includes(status)) break;
    if (FAILED_STATUSES.includes(status)) {
      throw new Error("L'export FEC a échoué côté Pennylane : " + JSON.stringify(statusResp));
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  const downloadUrl = findDownloadUrl(statusResp);
  if (!downloadUrl) {
    console.error("Impossible de trouver l'URL de téléchargement dans la réponse Pennylane :");
    console.error(JSON.stringify(statusResp, null, 2));
    console.error('Vérifiez la doc à jour : https://pennylane.readme.io/reference/getfecexport');
    console.error('et ajustez findDownloadUrl() dans ce script si le nom du champ a changé.');
    process.exit(1);
  }

  console.log('→ Téléchargement du fichier FEC...');
  await downloadFile(downloadUrl, outPath);
  console.log(`✓ FEC enregistré : ${outPath}`);
  console.log('  Importez-le dans FEC Analyse via "Nouveau dossier" → sélectionnez ce fichier.');
}

main().catch(err => {
  console.error('Erreur :', err.message);
  process.exit(1);
});
