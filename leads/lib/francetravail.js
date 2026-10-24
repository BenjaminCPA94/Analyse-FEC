/*
 * Offres d'emploi France Travail (API « Offres d'emploi v2 », gratuite) : postes de comptable
 * publiés par des entreprises de la zone. Identifiants d'application sur francetravail.io :
 * FT_CLIENT_ID et FT_CLIENT_SECRET (Vercel › Settings › Environment Variables).
 */
'use strict';
const TOKEN_URL = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
const ROME = 'M1203,M1206'; // Comptabilité ; management de service comptable
let token = null;

const configured = (env = process.env) => Boolean(env.FT_CLIENT_ID && env.FT_CLIENT_SECRET);

async function getToken(env = process.env) {
  if (token && token.until > Date.now() + 30e3) return token.value;
  const r = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.FT_CLIENT_ID, client_secret: env.FT_CLIENT_SECRET, scope: 'api_offresdemploiv2 o2dsoffre' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('France Travail : identifiants refusés (' + (j.error_description || j.error || r.status) + ')');
  token = { value: j.access_token, until: Date.now() + Number(j.expires_in || 1400) * 1000 };
  return token.value;
}

/* publieeDepuis n'accepte que 1, 3, 7, 14 ou 31 jours. */
const sinceDays = d => [1, 3, 7, 14, 31].find(x => x >= d) || 31;

/* Offres brutes, allégées des champs inutiles ; 450 au plus par département. */
async function searchOffers({ deps, days }, env = process.env) {
  const t = await getToken(env), out = [];
  for (const dep of deps.slice(0, 20)) {
    for (let start = 0; start < 450; start += 150) {
      const u = new URL(SEARCH_URL);
      Object.entries({ codeROME: ROME, departement: dep, publieeDepuis: sinceDays(days), range: `${start}-${start + 149}`, sort: 1 }).forEach(([k, v]) => u.searchParams.set(k, v));
      const r = await fetch(u, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      if (r.status === 204) break;
      if (r.status === 429) { await new Promise(x => setTimeout(x, 1200)); start -= 150; continue; }
      if (!r.ok) throw new Error('France Travail : erreur ' + r.status);
      const res = (await r.json()).resultats || [];
      for (const o of res) out.push({
        id: o.id, intitule: o.intitule, dateCreation: o.dateCreation, description: String(o.description || '').slice(0, 600),
        typeContrat: o.typeContrat, typeContratLibelle: o.typeContratLibelle, dureeTravailLibelle: o.dureeTravailLibelle, dureeTravailLibelleConverti: o.dureeTravailLibelleConverti,
        lieuTravail: o.lieuTravail, entreprise: { nom: o.entreprise?.nom, description: String(o.entreprise?.description || '').slice(0, 300), url: o.entreprise?.url },
        secteurActiviteLibelle: o.secteurActiviteLibelle, trancheEffectifEtab: o.trancheEffectifEtab, contact: o.contact ? { nom: o.contact.nom, courriel: o.contact.courriel, telephone: o.contact.telephone } : null,
        origineOffre: { urlOrigine: o.origineOffre?.urlOrigine }, nombrePostes: o.nombrePostes,
      });
      if (res.length < 150) break;
    }
  }
  return out;
}

module.exports = { configured, searchOffers, sinceDays };
