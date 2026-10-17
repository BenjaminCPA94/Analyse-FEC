/* Faux Pennylane pour les tests : reproduit les formats de l'API v2 (pagination par curseur)
 * et un repli page/per_page pour l'API cabinet. */
'use strict';
const http = require('node:http');

const CABINET = 'cabinet-token', FIRM = 'firm-token', DOSSIER = 'dossier-token';
const customers = [
  { id: 11, name: 'AE CONSULTING', reg_no: '943 740 639' },
  { id: 12, name: 'Stoik France SAS', reg_no: null },
  { id: 99, name: 'INCONNU SARL', reg_no: '111111111' },
];
const inv = (id, customer, date, ht, extra = {}) => ({ id, invoice_number: 'F-' + id, label: 'Honoraires comptables', date, deadline: date, currency_amount: String(ht * 1.2), currency_amount_before_tax: String(ht), remaining_amount_with_tax: '0.0', status: 'paid', draft: false, customer: { id: customer, url: '' }, ...extra });
const invoices = [
  inv(1, 11, '2026-01-05', 120), inv(2, 11, '2026-02-05', 120),
  inv(3, 11, '2026-04-12', 400, { label: 'Bilan 2025', remaining_amount_with_tax: '480.0', status: 'upcoming' }),
  inv(4, 12, '2026-03-05', 900), inv(5, 12, '2026-03-20', -100, { label: 'Avoir', credit_note: true }),
  inv(6, 12, '2026-05-05', 900, { status: 'cancelled' }), inv(7, 12, '2026-06-05', 900, { draft: true, status: 'draft' }),
  inv(8, 99, '2026-02-01', 300), inv(9, 11, '2024-12-01', 120),
];
const tb = (year) => [
  { number: '101000', formatted_number: '10100000', label: 'Capital', debits: '0', credits: '1000' },
  { number: '120000', formatted_number: '12000000', label: 'Résultat N-1', debits: '0', credits: year === 2026 ? '5000' : '0' },
  { number: '411000', formatted_number: '41100000', label: 'Clients', debits: '30000', credits: '6000' },
  { number: '455000', formatted_number: '45500000', label: 'Compte courant associé', debits: '2500', credits: '0' },
  { number: '471000', formatted_number: '47100000', label: 'Attente', debits: '300', credits: '0' },
  { number: '512000', formatted_number: '51200000', label: 'Banque', debits: '10000', credits: year === 2026 ? '13000' : '1000' },
  { number: '606000', formatted_number: '60600000', label: 'Achats', debits: year === 2026 ? '12000' : '8000', credits: '0' },
  { number: '706000', formatted_number: '70600000', label: 'Prestations', debits: '0', credits: year === 2026 ? '29800' : '20000' },
].map(r => ({ ...r, debits: String(Number(r.debits)), credits: String(Number(r.credits)) }));
function balanced(year) {
  const rows = tb(year);
  const d = rows.reduce((a, r) => a + Number(r.debits), 0), c = rows.reduce((a, r) => a + Number(r.credits), 0);
  rows.push({ number: '164000', formatted_number: '16400000', label: 'Emprunt', debits: d > c ? '0' : String(c - d), credits: d > c ? String(d - c) : '0' });
  return rows;
}

function cursorPage(res, list, cursor, size = 2) {
  const start = Number(cursor || 0), items = list.slice(start, start + size), more = start + size < list.length;
  json(res, 200, { items, has_more: more, next_cursor: more ? String(start + size) : null });
}
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }

function start(port = 0) {
  const calls = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x'), token = (req.headers.authorization || '').replace('Bearer ', ''), q = url.searchParams;
    calls.push({ path: url.pathname, query: Object.fromEntries(q), token });
    const p = url.pathname;
    if (p.startsWith('/v2/')) {
      if (![CABINET, DOSSIER].includes(token)) return json(res, 401, { error: 'unauthorized' });
      if (p === '/v2/me') return json(res, 200, { user: { email: 'b@rb.fr' }, company: { name: token === CABINET ? 'RB PARTNERS' : 'DOSSIER' } });
      if (p === '/v2/customers') return cursorPage(res, customers, q.get('cursor'));
      if (p === '/v2/customer_invoices') {
        const f = JSON.parse(q.get('filter') || '[]').find(x => x.field === 'date');
        return cursorPage(res, invoices.filter(i => !f || i.date >= f.value), q.get('cursor'), 3);
      }
      if (p === '/v2/trial_balance') return cursorPage(res, balanced(Number(q.get('period_end').slice(0, 4))), q.get('cursor'), 4);
    }
    if (p.startsWith('/firm/')) {
      if (token !== FIRM) return json(res, 401, { error: 'unauthorized' });
      if (p === '/firm/companies') {
        const all = [{ id: 501, name: 'STOIK FRANCE', reg_no: '901234567' }, { id: 502, name: 'BR IMMOBILIER', reg_no: '' }, { id: 503, name: 'AUTRE' }];
        const page = Number(q.get('page') || 1);
        return json(res, 200, { items: all.slice((page - 1) * 2, page * 2), current_page: page, total_pages: 2 });
      }
      const m = p.match(/^\/firm\/companies\/(\d+)\/trial_balance$/);
      if (m) return cursorPage(res, balanced(Number(q.get('period_end').slice(0, 4))), q.get('cursor'), 5);
    }
    json(res, 404, { error: 'not found' });
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r({ server, calls, port: server.address().port })));
}
module.exports = { start, CABINET, FIRM, DOSSIER };
if (require.main === module) start(Number(process.argv[2] || 9090)).then(m => console.log('Mock Pennylane sur', m.port));
