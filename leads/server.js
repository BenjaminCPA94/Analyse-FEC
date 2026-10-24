/* Serveur local : node server.js puis ouvrir http://localhost:3000 (sert l'outil et le relais). */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const proxy = require('./api/proxy');
const digest = require('./api/digest');
const follow = require('./api/follow');
const jobs = require('./api/jobs');
const site = require('./api/site');

const PAGE = path.join(__dirname, 'Leads_Expert_Comptable.html');
const PORT = Number(process.env.PORT || 3000);

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://local');
  if (pathname === '/api/proxy') return proxy(req, res);
  if (pathname === '/api/digest') return digest(req, res);
  if (pathname === '/api/follow') return follow(req, res);
  if (pathname === '/api/jobs') return jobs(req, res);
  if (pathname === '/api/site') return site(req, res);
  if (pathname === '/' || pathname === '/Leads_Expert_Comptable.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(PAGE).pipe(res);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Introuvable');
});
if (require.main === module) server.listen(PORT, '127.0.0.1', () => console.log(`Leads expert-comptable : http://localhost:${PORT}`));
module.exports = server;
