/* Point d'entrée Vercel : toutes les adresses sont redirigées ici (voir vercel.json). */
'use strict';
const { createApp } = require('../lib/app');

let app;
module.exports = (req, res) => {
  try { app = app || createApp(); }
  catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('RB Partners CRM — configuration incomplète : ' + e.message);
  }
  return app.handle(req, res);
};
