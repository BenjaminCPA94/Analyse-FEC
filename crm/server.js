#!/usr/bin/env node
/*
 * RB Partners CRM — serveur local V27 (Node >= 18, aucune dépendance).
 * Sur Vercel, c'est api/index.js qui sert le même cœur (lib/app.js).
 *
 *   node server.js                              démarre le serveur
 *   node server.js add-user <nom> [--admin]     crée ou réinitialise un compte
 *   node server.js list-users
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

loadEnv(path.join(__dirname, '.env'));
const { createApp, createStore, newUser, buildIndex } = require('./lib/app');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function ask(question, hidden) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = s => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, a => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a); });
  });
}

async function cli(args, store) {
  if (args[0] === 'add-user') {
    const username = args[1];
    if (!username) throw new Error('Usage : node server.js add-user <nom> [--admin]');
    const password = process.env.RB_PASSWORD || await ask('Mot de passe (12 caractères minimum) : ', true);
    const user = newUser(username, password, args.includes('--admin') ? 'admin' : 'user');
    await store.setUsers((await store.getUsers()).filter(u => u.username.toLowerCase() !== username.toLowerCase()).concat(user));
    console.log(`Compte « ${username} » enregistré (${user.role}) — stockage : ${store.kind}.`);
    return true;
  }
  if (args[0] === 'list-users') {
    for (const u of await store.getUsers()) console.log(`${u.username}\t${u.role}\t${u.createdAt || ''}`);
    return true;
  }
  return false;
}

async function main() {
  const store = createStore();
  if (await cli(process.argv.slice(2), store)) return;
  buildIndex(); // vérifie les sources avant d'ouvrir le port
  const app = createApp({ store });
  const port = Number(process.env.PORT || 8080), host = process.env.HOST || '0.0.0.0';
  if (!(await store.getUsers()).length && !process.env.ADMIN_USERNAME) console.warn('Aucun compte : crée-en un avec « node server.js add-user <nom> --admin ».');
  http.createServer((req, res) => app.handle(req, res)).listen(port, host, () => {
    console.log(`RB Partners CRM V27 sur http://localhost:${port} — stockage : ${store.kind}`);
    console.log(`Pennylane — cabinet : ${app.cfg.pennylane.cabinetToken ? 'configuré' : 'non configuré'} · API cabinet : ${app.cfg.pennylane.firmToken ? 'configurée' : 'non configurée'}`);
  });
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
