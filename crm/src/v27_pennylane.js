/* RB Partners V27 — connexion Pennylane (via le serveur, clés API jamais exposées au navigateur).
 * Le CRM pilote ; il ne produit pas la comptabilité. Il lit dans Pennylane, sans jamais y écrire :
 *  - les factures clients du cabinet → contrôle des honoraires, facturation, suivi des bilans facturés ;
 *  - la liste des dossiers du cabinet → lien direct vers chaque dossier Pennylane.
 * Les synchronisations se lancent seules à l'ouverture du CRM (toutes les 6 h au plus). */
const pl27={status:null,statusLoading:false,busy:'',customers:null,companies:null,test:null,autoDone:false};
const AUTO_SYNC_HOURS27=6;

async function api27(url,opt={}){
 if(!shared25.active)throw Error('Pennylane nécessite le serveur : lance « node server.js » puis ouvre l’adresse du CRM dans le navigateur.');
 const r=await fetch(url,{...opt,headers:opt.body?{'Content-Type':'application/json'}:{}});
 let x={};try{x=await r.json();}catch(e){}
 if(!r.ok)throw Error(x.error||('Erreur serveur '+r.status));
 return x;
}
async function busy27(label,fn,silent=false){
 if(pl27.busy){if(!silent)toast('Une synchronisation est déjà en cours : '+pl27.busy);return;}
 pl27.busy=label;if(!silent)toast(label+'…');
 try{return await fn();}
 catch(e){if(silent){state.pennylaneSync={...(state.pennylaneSync||{}),error:e.message};}else alert(label+' impossible.\n\n'+e.message);}
 finally{pl27.busy='';render();}
}
async function refreshStatus27(){
 pl27.statusLoading=true;
 try{pl27.status=await api27('/api/pennylane/status');}catch(e){pl27.status={error:e.message};}
 finally{pl27.statusLoading=false;}
}
function link27(c){if(!c.pl27)c.pl27={customerId:null,companyId:null};return c.pl27;}
function norm27(s){return String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\b(SASU|SAS|SARL|EURL|SCI|SA|SNC|SELARL|SELAS|HOLDING)\b/g,'').replace(/[^A-Z0-9]/g,'');}
function matchByIdentity27(list,c){return list.find(k=>k.siren&&k.siren===c.siren)||list.find(k=>norm27(k.name)&&norm27(k.name)===norm27(c.name));}

/* ---------- Factures du cabinet ---------- */
function category27(label){
 const t=String(label||'');
 if(/bilan|cl[oô]ture|comptes annuels|liasse/i.test(t))return 'Bilan / clôture';
 if(/juridique|\bAGO?\b|assembl|approbation/i.test(t))return 'Juridique annuel';
 if(/social|paie|bulletin|salari/i.test(t))return 'Social / autres';
 if(/exceptionnel|conseil|cr[ée]ation|cession|transformation|transfert/i.test(t))return 'Travaux exceptionnels';
 return 'Compta courante';
}
function autoMatchCustomers27(customers){
 let n=0;const ids=new Set(customers.map(k=>String(k.id)));
 for(const c of state.clients){
  const l=link27(c);if(l.customerId&&ids.has(String(l.customerId)))continue;
  const m=matchByIdentity27(customers,c);
  if(m){l.customerId=m.id;l.customerMatch=m.siren&&m.siren===c.siren?'SIREN':'Nom';n++;}
 }
 return n;
}
async function syncInvoices27(silent=false){
 const year=new Date().getFullYear(),from=(year-2)+'-01-01';
 await busy27('Synchronisation des factures Pennylane',async()=>{
  const x=await api27('/api/pennylane/invoices?from='+from);
  pl27.customers=x.customers;
  const matched=autoMatchCustomers27(x.customers);
  const byCustomer=new Map(state.clients.filter(c=>c.pl27?.customerId).map(c=>[String(c.pl27.customerId),c]));
  const mapped=[],unmatched={};
  for(const i of x.items){
   if(i.draft)continue;
   const c=byCustomer.get(String(i.customerId));
   if(!c){const k=String(i.customerId||'?'),u=unmatched[k]||(unmatched[k]={customerId:i.customerId,name:i.customerName||x.customers.find(z=>String(z.id)===k)?.name||'Client Pennylane '+k,count:0,amountHT:0});u.count++;u.amountHT+=i.amountHT;continue;}
   mapped.push({id:'PL_'+i.plId,client:c.id,date:i.date,deadline:i.deadline||i.date,category:category27(i.label),amount:i.amountHT,amountTTC:i.amountTTC,remaining:i.remainingTTC,status:i.status==='cancelled'?'Annulée':i.creditNote?'Avoir':'Finalisée',plStatus:i.status,number:i.number,label:i.label,source:'pennylane'});
  }
  state.pennylaneInvoices=mapped;
  state.invoices=state.invoices.filter(i=>i.source!=='pennylane').concat(mapped.filter(i=>i.status!=='Annulée').map(i=>({id:i.id,client:i.client,label:(i.number?i.number+' · ':'')+(i.label||'Facture Pennylane'),date:i.date,due:i.deadline,amount:i.amountTTC,paid:Math.round((i.amountTTC-i.remaining)*100)/100,source:'pennylane'})));
  const un=Object.values(unmatched).sort((a,b)=>b.amountHT-a.amountHT);
  state.pennylaneSync={lastSync:x.fetchedAt,status:`Pennylane synchronisé · ${mapped.length} facture(s) rattachée(s)`+(un.length?` · ${un.reduce((a,u)=>a+u.count,0)} non rattachée(s)`:''),from,unmatched:un,total:x.items.length,auto:silent};
  log25(silent?'Synchronisation automatique des factures Pennylane':'Synchronisation factures Pennylane','',`${mapped.length} rattachées, ${matched} nouveau(x) rapprochement(s) client`);
  save();
  if(!silent)toast(`${mapped.length} facture(s) importée(s) depuis le ${datefr(from)}`+(un.length?` — ${un.length} client(s) Pennylane à rattacher (Automatisations cabinet)`:''));
 },silent);
}

/* ---------- Dossiers du cabinet ---------- */
function applyCompanies27(){
 let n=0;
 for(const c of state.clients){
  const l=link27(c);
  if(!l.companyId){const m=matchByIdentity27(pl27.companies,c);if(m){l.companyId=m.id;n++;}}
  if(l.companyId)c.links={...(c.links||{}),pennylane:'https://app.pennylane.com/companies/'+encodeURIComponent(l.companyId)};
 }
 return n;
}
async function loadCompanies27(silent=false){
 await busy27('Chargement des dossiers du cabinet',async()=>{
  pl27.companies=(await api27('/api/pennylane/companies')).items;
  const n=applyCompanies27();
  state.pennylaneCompaniesSync=new Date().toISOString();
  save();if(!silent)toast(pl27.companies.length+' dossier(s) Pennylane · '+n+' rapprochement(s) automatique(s)');
 },silent);
}
async function loadCustomers27(){await busy27('Chargement des clients Pennylane',async()=>{pl27.customers=(await api27('/api/pennylane/customers')).items;const n=autoMatchCustomers27(pl27.customers);save();toast(pl27.customers.length+' client(s) Pennylane · '+n+' rapprochement(s) automatique(s)');});}
async function testPennylane27(){await busy27('Test de connexion Pennylane',async()=>{pl27.test=await api27('/api/pennylane/test',{method:'POST',body:'{}'});await refreshStatus27();});}

/* Synchronisation automatique à l'ouverture. */
async function autoSync27(){
 if(pl27.autoDone)return;pl27.autoDone=true;
 const old=t=>!t||Date.now()-new Date(t).getTime()>AUTO_SYNC_HOURS27*3600e3;
 if(pl27.status?.cabinet&&old(state.pennylaneSync?.lastSync))await syncInvoices27(true);
 if(pl27.status?.firm&&old(state.pennylaneCompaniesSync))await loadCompanies27(true);
}

function setLink27(cid,key,val){
 const c=cfind(cid);if(!c)return;const l=link27(c);
 l[key]=val?String(val).trim():null;
 if(key==='customerId')l.customerMatch=val?'Manuel':'';
 if(key==='companyId')c.links={...(c.links||{}),pennylane:val?'https://app.pennylane.com/companies/'+encodeURIComponent(val):'https://app.pennylane.com/'};
 log25('Rattachement Pennylane modifié',cid,key+' = '+(val||'aucun'));persist25();
}
function options27(list,current,placeholder){
 const cur=current==null?'':String(current);
 return `<option value="">${placeholder}</option>`+list.map(k=>`<option value="${esc(k.id)}" ${String(k.id)===cur?'selected':''}>${esc(k.name)}${k.siren?' · '+esc(k.siren):''}</option>`).join('')+(cur&&!list.some(k=>String(k.id)===cur)?`<option value="${esc(cur)}" selected>ID ${esc(cur)}</option>`:'');
}
function pennylanePanel27(){
 if(!shared25.active)return `<div class="panel panelBody"><h2>Pennylane</h2><p>La connexion Pennylane passe par le serveur du cabinet (les clés API ne quittent jamais le serveur). Démarre <code>node server.js</code> puis ouvre le CRM à son adresse.</p></div>`;
 const s=pl27.status||{},t=pl27.test,sync=state.pennylaneSync||{};
 const line=(k,ok,txt)=>`<div class="kpiLine"><b>${k}</b><span><span class="badge ${ok?'green':'orange'}">${ok?'Configuré':'À configurer'}</span> ${esc(txt||'')}</span></div>`;
 const rows=state.clients.map(c=>{const l=link27(c);return `<tr><td><b>${esc(c.name)}</b><div class="sub">${esc(c.siren||'SIREN à compléter')}</div></td>
  <td>${pl27.customers?`<select class="statusSelect" onchange="setLink27('${c.id}','customerId',this.value)">${options27(pl27.customers,l.customerId,'— non rattaché —')}</select>`:`<input class="mini" style="width:110px" placeholder="ID client" value="${esc(l.customerId||'')}" onchange="setLink27('${c.id}','customerId',this.value)">`}<div class="sub">${esc(l.customerMatch?'Rapprochement : '+l.customerMatch:'')}</div></td>
  <td>${pl27.companies?`<select class="statusSelect" onchange="setLink27('${c.id}','companyId',this.value)">${options27(pl27.companies,l.companyId,'— non rattaché —')}</select>`:`<input class="mini" style="width:110px" placeholder="ID dossier" value="${esc(l.companyId||'')}" onchange="setLink27('${c.id}','companyId',this.value)">`}</td>
  <td>${l.companyId?`<a class="btn small light" href="https://app.pennylane.com/companies/${encodeURIComponent(l.companyId)}" target="_blank" rel="noopener">Ouvrir</a>`:'—'}</td></tr>`;}).join('');
 return `<div class="panel panelBody"><h2>Pennylane</h2><p class="sub">Lecture seule, synchronisée automatiquement à l’ouverture du CRM (toutes les ${AUTO_SYNC_HOURS27} h au plus). Les factures viennent du Pennylane <b>du cabinet</b> (« PENNYLANE_CABINET_TOKEN ») ; la liste des dossiers vient de l’API cabinet (« PENNYLANE_FIRM_TOKEN »). La saisie, le rapprochement bancaire et le lettrage relèvent de l’outil de production, pas du CRM.</p>
 ${s.error?`<p class="bad">${esc(s.error)}</p>`:''}${sync.error?`<p class="bad">Dernière synchro automatique en échec : ${esc(sync.error)}</p>`:''}
 ${line('Facturation du cabinet',s.cabinet,t?.cabinet?(t.cabinet.ok?'Connexion OK'+(t.cabinet.company?' · '+t.cabinet.company:''):t.cabinet.error):'')}
 ${line('Dossiers du cabinet',s.firm,t?.firm?(t.firm.ok?'Connexion OK':t.firm.error):'Optionnel : sert aux liens directs vers chaque dossier')}
 <div class="kpiLine"><b>Dernière synchro des factures</b><span>${sync.lastSync?new Date(sync.lastSync).toLocaleString('fr-FR')+(sync.auto?' (automatique)':'')+' · '+esc(sync.status||''):'Jamais'}</span></div>
 <div class="v25actions" style="margin-top:12px"><button class="btn" onclick="testPennylane27()">Tester la connexion</button><button class="btn green" onclick="syncInvoices27()" ${s.cabinet?'':'disabled'}>↻ Synchroniser maintenant</button><button class="btn secondary" onclick="loadCustomers27()" ${s.cabinet?'':'disabled'}>Rapprocher les clients facturés</button><button class="btn secondary" onclick="loadCompanies27()" ${s.firm?'':'disabled'}>Rapprocher les dossiers du cabinet</button></div></div>
 ${sync.unmatched?.length?`<div class="panel"><div class="panelHead"><h2>Factures Pennylane non rattachées</h2><span class="sub">Rattache le client Pennylane à une fiche CRM ci-dessous ; la prochaine synchro le prendra en compte.</span></div><table><thead><tr><th>Client Pennylane</th><th>ID</th><th>Factures</th><th>Montant HT</th></tr></thead><tbody>${sync.unmatched.slice(0,40).map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.customerId)}</td><td>${u.count}</td><td>${euro(u.amountHT)}</td></tr>`).join('')}</tbody></table></div>`:''}
 <div class="panel"><div class="panelHead"><h2>Rattachement des dossiers</h2><span class="sub">Rapprochement automatique par SIREN puis par raison sociale ; modifiable à la main.</span></div><table><thead><tr><th>Client CRM</th><th>Client facturé (Pennylane cabinet)</th><th>Dossier comptable Pennylane</th><th>Lien</th></tr></thead><tbody>${rows||'<tr><td colspan="4">Aucun client dans le portefeuille.</td></tr>'}</tbody></table></div>`;
}

/* ---------- Branchement sur la maquette ---------- */
// Factures : synchro réelle. Juridique : les chiffres se saisissent (ou viendront de l'outil de production).
syncPennylaneDemo=function(cid){return cid?toast('Les chiffres des comptes se saisissent dans le formulaire ; ils viendront de l’outil de production.'):syncInvoices27();};

const previousSettings27=settings25;
settings25=function(){
 let h=previousSettings27();
 const s=pl27.status||{};
 h=h.replace('<span>Non connecté — aucune synchronisation réelle</span>',`<span>${shared25.active?(s.cabinet||s.firm?'Connecté en lecture seule'+(state.pennylaneSync?.lastSync?' · dernière synchro '+new Date(state.pennylaneSync.lastSync).toLocaleString('fr-FR'):''):'Serveur prêt — clés API à renseigner (voir ci-dessous)'):'Disponible uniquement via le serveur'}</span>`);
 if(shared25.active)h=h.replace('<span>Non connecté — saisie manuelle du SIREN</span>','<span>Annuaire des entreprises (API publique) actif via le serveur · Pappers non utilisé</span>');
 const i=h.indexOf('<div class="panel panelBody"><h2>Sauvegardes');
 return i<0?h+pennylanePanel27():h.slice(0,i)+pennylanePanel27()+h.slice(i);
};
function fixTexts27(){
 const root=document.getElementById('root');if(!root)return;
 const s=pl27.status||{},on=shared25.active&&(s.cabinet||s.firm);
 for(const el of root.querySelectorAll('.note,.info,.syncBox .sub')){
  const t=el.textContent;
  if(t.startsWith('Module historique V24'))el.textContent='Module historique : certaines analyses restent indicatives. '+(on?'Pennylane est connecté en lecture seule (factures du cabinet) ; les autres services externes ne le sont pas.':'Pennylane n’est pas encore configuré (Automatisations cabinet).');
  else if(t.startsWith('Maquette : données Pennylane simulées'))el.textContent=state.pennylaneSync?.lastSync?'Données réelles Pennylane depuis le '+datefr(state.pennylaneSync.from||''):'Aucune synchronisation réelle effectuée';
  else if(t.startsWith('Connexion réelle :'))el.innerHTML='<b>Connexion Pennylane :</b> les factures clients du cabinet (montants HT, avoirs déduits, brouillons exclus) sont rapprochées des fiches CRM par identifiant client Pennylane, SIREN puis raison sociale, automatiquement à l’ouverture du CRM. Les factures non rattachées sont listées dans Automatisations cabinet.';
 }
}
const previousRender27=render;
render=function(){
 previousRender27();
 fixTexts27();
 if(shared25.active&&shared25.ready&&!pl27.status&&!pl27.statusLoading)refreshStatus27().then(()=>{render();autoSync27();});
};
document.title='RB Partners CRM V27';
