/* RB Partners V27 — connexion Pennylane réelle (via le serveur, clés API jamais exposées au navigateur).
 * Remplace les simulations de la maquette :
 *  - Contrôle honoraires / Facturation : factures clients du Pennylane du cabinet ;
 *  - Clôture & Bilan, Juridique annuel, Préparation mensuelle : balance du dossier client.
 * Aucune écriture n'est envoyée dans Pennylane : lecture seule. */
const pl27={status:null,statusLoading:false,busy:'',customers:null,companies:null,test:null};

async function api27(url,opt={}){
 if(!shared25.active)throw Error('Pennylane nécessite le serveur : lance « node server.js » puis ouvre l’adresse du CRM dans le navigateur.');
 const r=await fetch(url,{...opt,headers:opt.body?{'Content-Type':'application/json'}:{}});
 let x={};try{x=await r.json();}catch(e){}
 if(!r.ok)throw Error(x.error||('Erreur serveur '+r.status));
 return x;
}
async function busy27(label,fn){
 if(pl27.busy)return toast('Une synchronisation est déjà en cours : '+pl27.busy);
 pl27.busy=label;toast(label+'…');
 try{return await fn();}
 catch(e){alert(label+' impossible.\n\n'+e.message);}
 finally{pl27.busy='';render();}
}
async function refreshStatus27(){
 pl27.statusLoading=true;
 try{pl27.status=await api27('/api/pennylane/status');}catch(e){pl27.status={error:e.message};}
 finally{pl27.statusLoading=false;}
}
function link27(c){if(!c.pl27)c.pl27={customerId:null,companyId:null};return c.pl27;}
function norm27(s){return String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\b(SASU|SAS|SARL|EURL|SCI|SA|SNC|SELARL|HOLDING)\b/g,'').replace(/[^A-Z0-9]/g,'');}
function iso27(d){return d.toISOString().slice(0,10);}
function dossierAccess27(c){return Boolean(pl27.status?.dossierTokens?.[c.id]||(pl27.status?.firm&&link27(c).companyId));}

/* Exercice comptable du client se terminant l'année `year` (clôture « MM-JJ »). */
function fiscalRange27(c,year){
 const [m,d]=String(c.closing||'12-31').split('-').map(Number);
 const lastDay=(y)=>Math.min(d||31,new Date(Date.UTC(y,m||12,0)).getUTCDate());
 const end=new Date(Date.UTC(year,(m||12)-1,lastDay(year)));
 const start=new Date(Date.UTC(year-1,(m||12)-1,lastDay(year-1)));start.setUTCDate(start.getUTCDate()+1);
 return {start:iso27(start),end:iso27(end)};
}
async function trialBalance27(c,start,end){
 const l=link27(c);
 return api27(`/api/pennylane/trial-balance?client=${encodeURIComponent(c.id)}&companyId=${encodeURIComponent(l.companyId||'')}&start=${start}&end=${end}`);
}

/* ---------- Factures du cabinet → contrôle des honoraires ---------- */
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
  const m=customers.find(k=>k.siren&&k.siren===c.siren)||customers.find(k=>norm27(k.name)&&norm27(k.name)===norm27(c.name));
  if(m){l.customerId=m.id;l.customerMatch=m.siren&&m.siren===c.siren?'SIREN':'Nom';n++;}
 }
 return n;
}
async function syncInvoices27(){
 const year=new Date().getFullYear(),from=(year-1)+'-01-01';
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
  state.pennylaneSync={lastSync:x.fetchedAt,status:`Pennylane synchronisé · ${mapped.length} facture(s) rattachée(s)`+(un.length?` · ${un.reduce((a,u)=>a+u.count,0)} non rattachée(s)`:''),from,unmatched:un,total:x.items.length};
  log25('Synchronisation factures Pennylane','',`${mapped.length} rattachées, ${matched} nouveau(x) rapprochement(s) client`);
  save();
  toast(`${mapped.length} facture(s) importée(s) depuis le ${datefr(from)}`+(un.length?` — ${un.length} client(s) Pennylane à rattacher (Automatisations cabinet)`:''));
 });
}

/* ---------- Balance du dossier → analyse de clôture ---------- */
const CYCLE_RULES27=[[/^1[0-3]/,'I1'],[/^1[45]/,'I2'],[/^1[6-8]/,'I3'],[/^(2[0-5]|28[0-2]|29[01])/,'I4'],[/^(2[67]|29[67])/,'I6'],[/^3/,'I7'],[/^40/,'I8'],[/^6(7|87)/,'I14'],[/^6/,'I8bis'],[/^41/,'I9'],[/^7(7|87)/,'I14'],[/^7/,'I9bis'],[/^445/,'I10'],[/^44/,'I10bis'],[/^4[23]/,'I11'],[/^4[5-9]/,'I12'],[/^5/,'I13']];
function cycleOf27(account){const a=String(account||'');const r=CYCLE_RULES27.find(([re])=>re.test(a));return r?r[1]:'I12';}
function figures27(rows){
 let d=0,c=0,turnover=0,result=0,assets=0;
 for(const r of rows){
  const a=r.account,b=r.debit-r.credit;d+=r.debit;c+=r.credit;
  if(a.startsWith('70'))turnover-=b;
  if(a[0]==='6'||a[0]==='7')result-=b;
  if(/^(28|29|39|49|59)/.test(a))assets+=b;
  else if(a[0]==='2'||a[0]==='3')assets+=b;
  else if((a[0]==='4'||a[0]==='5')&&b>0)assets+=b;
 }
 return {debit:d/100,credit:c/100,diff:(d-c)/100,turnover:turnover/100,result:result/100,assets:assets/100};
}
function extraChecks27(rows,c){
 const out=[],bal=r=>r.debit-r.credit,sum=re=>rows.filter(r=>re.test(r.account)).reduce((a,r)=>a+bal(r),0);
 for(const r of rows){
  const b=bal(r);
  if(/^(512|514|53)/.test(r.account)&&b<0)out.push({level:'À revoir',label:'Trésorerie créditrice '+r.account,detail:(r.label||'')+' — découvert à reclasser en 519 ou erreur de rapprochement.',amount:b/100,source:'Balance Pennylane : '+r.account});
  if(/^455/.test(r.account)&&b>0)out.push({level:'Bloquant',label:'Compte courant d’associé débiteur '+r.account,detail:(r.label||'')+' — à régulariser (risque d’abus de biens sociaux / avance interdite selon la forme sociale).',amount:b/100,source:'Balance Pennylane : '+r.account});
  if(/^(120|129)/.test(r.account)&&b!==0)out.push({level:'À revoir',label:'Résultat antérieur non affecté '+r.account,detail:'Le compte de résultat N-1 devrait être soldé par l’affectation votée en AGO.',amount:b/100,source:'Balance Pennylane : '+r.account});
  if(/^3/.test(r.account)&&!/^39/.test(r.account)&&b<0)out.push({level:'À revoir',label:'Stock créditeur '+r.account,detail:r.label||'',amount:b/100,source:'Balance Pennylane : '+r.account});
 }
 const immo=sum(/^2[0-3]/),amort=sum(/^28/),dot=sum(/^681/);
 if(immo>50000&&amort===0&&dot===0)out.push({level:'À revoir',label:'Immobilisations sans amortissement',detail:'Immobilisations brutes comptabilisées sans compte 28 ni dotation 681.',amount:immo/100,source:'Balance Pennylane : classes 2 et 6811'});
 const purchases=sum(/^6[0-2]/);
 if(purchases>0&&!rows.some(r=>/^408/.test(r.account)&&bal(r)!==0))out.push({level:'À revoir',label:'Aucune facture non parvenue (408)',detail:'Achats et charges externes présents mais aucun 408 : cut-off fournisseurs à vérifier.',amount:null,source:'Balance Pennylane : 60-62 / 408'});
 const capital=Number(String(c.identity26?.capital||'').replace(/[^\d.,]/g,'').replace(',','.'));
 const cap=-sum(/^101/)/100;
 if(capital&&Math.abs(capital-cap)>0.5)out.push({level:'À revoir',label:'Capital comptable ≠ capital de la fiche',detail:`Compte 101 : ${euro(cap)} / fiche client : ${euro(capital)}.`,amount:cap-capital,source:'Balance Pennylane : 101 / fiche SIREN'});
 return out;
}
function closingAnalysis27(c,year,tbN,tbN1){
 const reqs=init25().requests.filter(q=>q.client===c.id&&requestMissing25(q));
 const base=analyze25(tbN.rows,tbN1?.rows?.length?tbN1.rows:null,[]);
 const alerts=base.alerts.concat(extraChecks27(tbN.rows,c));
 const fN=figures27(tbN.rows),fN1=tbN1?.rows?.length?figures27(tbN1.rows):null;
 const anomalies=alerts.map((a,i)=>({id:'PA'+(i+1),cycle:a.label==='Balance déséquilibrée'?'I1':cycleOf27((a.label.match(/\d{3,}/)||[''])[0]),severity:a.level==='Bloquant'?'Alerte':'Contrôle',title:a.label,detail:a.detail,evidence:a.source,amount:a.amount,od:''}));
 const cycles={};
 CLOSING_CYCLES.forEach(cy=>{const n=anomalies.filter(x=>x.cycle===cy.id).length,used=tbN.rows.some(r=>cycleOf27(r.account)===cy.id);cycles[cy.id]=n?{status:'À revoir',anomalies:n,missing:0,progress:40}:used?{status:'Sans alerte auto',anomalies:0,missing:0,progress:60}:{status:'Non concerné',anomalies:0,missing:0,progress:100};});
 cycles.RF={status:'À réaliser',anomalies:0,missing:0,progress:0};
 const eq=Math.abs(fN.diff)<0.005;
 return {client:c.id,year,real27:true,source:`Pennylane — balance du ${datefr(tbN.start)} au ${datefr(tbN.end)}`,fetchedAt:tbN.fetchedAt,
  balanceStatus:eq?'Équilibrée':'Déséquilibrée',balanceDiff:fN.diff,
  turnoverN:fN.turnover,turnoverN1:fN1?fN1.turnover:0,resultN:fN.result,resultN1:fN1?fN1.result:0,totalBalance:fN.assets,
  cycles,anomalies,ods:[],docsMissing:reqs.map(q=>q.label),rows:tbN.rows.length,
  conclusion:`Balance ${eq?'équilibrée':'déséquilibrée'} · ${anomalies.length} point(s) détecté(s) automatiquement${fN1?'':' · comparatif N-1 indisponible'}. Aucune OD n’est proposée sans pièce : cut-off, provisions et résultat fiscal restent à réviser.`};
}
async function syncClosing27(){
 const ca=state.closingAssistant,c=cfind(ca.client)||state.clients.find(x=>x.missions?.annualAccounts);
 if(!c)return toast('Aucun dossier avec mission bilan.');
 ca.client=c.id;
 await busy27('Récupération de la balance Pennylane',async()=>{
  const r=fiscalRange27(c,Number(ca.year)),p=fiscalRange27(c,Number(ca.year)-1);
  const tbN=await trialBalance27(c,r.start,r.end);
  if(!tbN.rows.length)throw Error('Balance vide sur la période '+datefr(r.start)+' – '+datefr(r.end)+'. Vérifie l’exercice et le dossier rattaché.');
  let tbN1=null;try{tbN1=await trialBalance27(c,p.start,p.end);}catch(e){tbN1=null;}
  state.closingAnalysis[closingKey(c.id,ca.year)]=closingAnalysis27(c,ca.year,tbN,tbN1);
  Object.assign(ca,{synced:true,analyzed:true,lastSync:tbN.fetchedAt,runId:uid('CLOSE')});
  c.pennylaneSync={status:'Synchronisé',result:figures27(tbN.rows).result,turnover:figures27(tbN.rows).turnover,balance:figures27(tbN.rows).assets,updated:tbN.fetchedAt};
  init25().runs.unshift({date:new Date().toLocaleString('fr-FR'),type:'Balance Pennylane — clôture '+ca.year,client:c.id,status:'Terminé',detail:tbN.rows.length+' comptes · '+tbN.source});
  log25('Balance Pennylane importée (clôture)',c.id,r.start+' → '+r.end);
  save();toast('Balance '+ca.year+' importée et analysée : '+state.closingAnalysis[closingKey(c.id,ca.year)].anomalies.length+' point(s) à revoir');
 });
}
function analyzeClosing27(){
 const a=closingAnalysisCurrent();
 if(!a?.real27)return toast('Synchronise d’abord la balance depuis Pennylane (étape 1).');
 state.closingAssistant.analyzed=true;save();render();toast('Analyse affichée : '+a.anomalies.length+' point(s) à revoir');
}

/* ---------- Juridique annuel ---------- */
async function syncLegal27(cid,year){
 const c=cfind(cid);if(!c)return;
 await busy27('Lecture des comptes dans Pennylane',async()=>{
  const r=fiscalRange27(c,Number(year)),tb=await trialBalance27(c,r.start,r.end),f=figures27(tb.rows);
  if(!tb.rows.length)throw Error('Balance vide pour l’exercice clos le '+datefr(r.end)+'.');
  ensureLegalData(c);const d=c.legalInputs;
  d.result=f.result;d.turnover=f.turnover;d.totalBalance=f.assets;
  d.carry=-(tb.rows.filter(x=>/^11/.test(x.account)).reduce((a,x)=>a+x.debit-x.credit,0))/100;
  c.pennylaneSync={status:'Synchronisé',result:f.result,turnover:f.turnover,balance:f.assets,updated:tb.fetchedAt};
  log25('Comptes Pennylane importés (juridique)',c.id,'Exercice clos le '+r.end);
  save();toast('Exercice clos le '+datefr(r.end)+' : résultat '+euro(f.result)+' · effectif à confirmer manuellement');
 });
 openLegalWorkflow(cid,year);
}
function importAccountsLegal27(cid,year){
 const a=state.closingAnalysis[closingKey(cid,year)];
 if(!a?.real27)return toast('Importe d’abord la balance Pennylane dans Clôture & Bilan pour cet exercice.');
 const l=legalStateV18(cid,year);
 l.accountsValidated=true;l.result=Number(a.resultN||0);l.stage=Math.max(l.stage,1);l.updated=new Date().toISOString();
 save();render();toast('Résultat Pennylane '+euro(a.resultN)+' repris dans le juridique annuel');
}

/* ---------- Préparation mensuelle ---------- */
async function importReview27(){
 const c=selected25();if(!c)return;
 const period=state.reviewPeriod25||new Date().toISOString().slice(0,7),[y,m]=period.split('-').map(Number);
 const end=iso27(new Date(Date.UTC(y,m,0)));
 let fy=fiscalRange27(c,y);if(fy.start>end)fy=fiscalRange27(c,y-1);if(fy.end<end)fy=fiscalRange27(c,y+1);
 const prevEnd=iso27(new Date(Date.UTC(y-1,m,0))),prevStart=fiscalRange27(c,Number(fy.end.slice(0,4))-1).start;
 await busy27('Récupération de la balance Pennylane',async()=>{
  const tb=await trialBalance27(c,fy.start,end);
  let prev=null;try{prev=await trialBalance27(c,prevStart,prevEnd);}catch(e){prev=null;}
  const o=init25(),key=c.id+'|'+period;
  o.reviews[key]={client:c.id,period,rows:tb.rows,previous:prev?.rows?.length?prev.rows:null,file:`Pennylane ${datefr(fy.start)} → ${datefr(end)}`,previousFile:prev?.rows?.length?`Pennylane ${datefr(prevStart)} → ${datefr(prevEnd)}`:'',decisions:{},validated:false,importedAt:new Date().toISOString()};
  log25('Balance Pennylane importée (revue mensuelle)',c.id,period);
  save();toast(tb.rows.length+' comptes importés depuis Pennylane');
 });
}

/* ---------- Écran de configuration ---------- */
async function testPennylane27(){await busy27('Test de connexion Pennylane',async()=>{pl27.test=await api27('/api/pennylane/test',{method:'POST',body:'{}'});await refreshStatus27();});}
async function loadCustomers27(){await busy27('Chargement des clients Pennylane',async()=>{pl27.customers=(await api27('/api/pennylane/customers')).items;const n=autoMatchCustomers27(pl27.customers);save();toast(pl27.customers.length+' client(s) Pennylane · '+n+' rapprochement(s) automatique(s)');});}
async function loadCompanies27(){await busy27('Chargement des dossiers du cabinet',async()=>{
 pl27.companies=(await api27('/api/pennylane/companies')).items;let n=0;
 for(const c of state.clients){const l=link27(c);if(l.companyId)continue;const m=pl27.companies.find(k=>k.siren&&k.siren===c.siren)||pl27.companies.find(k=>norm27(k.name)===norm27(c.name));if(m){l.companyId=m.id;n++;}}
 save();toast(pl27.companies.length+' dossier(s) Pennylane · '+n+' rapprochement(s) automatique(s)');});}
function setLink27(cid,key,val){const c=cfind(cid);if(!c)return;link27(c)[key]=val?String(val).trim():null;if(key==='customerId')link27(c).customerMatch=val?'Manuel':'';log25('Rattachement Pennylane modifié',cid,key+' = '+(val||'aucun'));persist25();}
async function setToken27(cid){
 const c=cfind(cid);if(!c)return;
 const has=pl27.status?.dossierTokens?.[cid];
 const token=prompt((has?'Un jeton est déjà enregistré pour ':'Jeton API Pennylane du dossier ')+c.name+'.\nColle le jeton (lecture seule suffit) — laisse vide pour le supprimer :','');
 if(token===null)return;
 await busy27('Enregistrement du jeton',async()=>{await api27('/api/pennylane/dossier-token',{method:'PUT',body:JSON.stringify({client:cid,token:token.trim()})});await refreshStatus27();toast(token.trim()?'Jeton vérifié et enregistré sur le serveur':'Jeton supprimé');});
}
function options27(list,current,placeholder){
 const cur=current==null?'':String(current);
 return `<option value="">${placeholder}</option>`+list.map(k=>`<option value="${esc(k.id)}" ${String(k.id)===cur?'selected':''}>${esc(k.name)}${k.siren?' · '+esc(k.siren):''}</option>`).join('')+(cur&&!list.some(k=>String(k.id)===cur)?`<option value="${esc(cur)}" selected>ID ${esc(cur)}</option>`:'');
}
function pennylanePanel27(){
 if(!shared25.active)return `<div class="panel panelBody"><h2>Pennylane</h2><p>La connexion Pennylane passe par le serveur du cabinet (les clés API n’y quittent jamais le serveur). Démarre <code>node server.js</code> puis ouvre le CRM à son adresse.</p></div>`;
 const s=pl27.status||{},t=pl27.test,sync=state.pennylaneSync||{},admin=shared25.user?.role==='admin';
 const line=(k,ok,txt)=>`<div class="kpiLine"><b>${k}</b><span><span class="badge ${ok?'green':'orange'}">${ok?'Configuré':'À configurer'}</span> ${esc(txt||'')}</span></div>`;
 const rows=state.clients.map(c=>{const l=link27(c),tok=s.dossierTokens?.[c.id];return `<tr><td><b>${esc(c.name)}</b><div class="sub">${esc(c.siren||'SIREN à compléter')}</div></td>
  <td>${pl27.customers?`<select class="statusSelect" onchange="setLink27('${c.id}','customerId',this.value)">${options27(pl27.customers,l.customerId,'— non rattaché —')}</select>`:`<input class="mini" style="width:110px" placeholder="ID client" value="${esc(l.customerId||'')}" onchange="setLink27('${c.id}','customerId',this.value)">`}<div class="sub">${esc(l.customerMatch?'Rapprochement : '+l.customerMatch:'')}</div></td>
  <td>${pl27.companies?`<select class="statusSelect" onchange="setLink27('${c.id}','companyId',this.value)">${options27(pl27.companies,l.companyId,'— non rattaché —')}</select>`:`<input class="mini" style="width:110px" placeholder="ID dossier" value="${esc(l.companyId||'')}" onchange="setLink27('${c.id}','companyId',this.value)">`}</td>
  <td>${tok?`<span class="badge green">Jeton du dossier</span><div class="sub">${esc(tok.addedBy||'')} · ${new Date(tok.addedAt).toLocaleDateString('fr-FR')}</div>`:dossierAccess27(c)?'<span class="badge green">Via jeton cabinet</span>':'<span class="badge orange">Aucun accès</span>'} ${admin?`<button class="btn small secondary" onclick="setToken27('${c.id}')">${tok?'Modifier':'Jeton'}</button>`:''}</td></tr>`;}).join('');
 return `<div class="panel panelBody"><h2>Pennylane</h2><p class="sub">Lecture seule. Les factures viennent du Pennylane <b>du cabinet</b> (clé « PENNYLANE_CABINET_TOKEN ») ; les balances viennent de chaque <b>dossier client</b>, soit via la clé de l’API cabinet (« PENNYLANE_FIRM_TOKEN » + identifiant du dossier), soit via un jeton propre au dossier.</p>
 ${s.error?`<p class="bad">${esc(s.error)}</p>`:''}
 ${line('Facturation du cabinet',s.cabinet,t?.cabinet?(t.cabinet.ok?'Connexion OK'+(t.cabinet.company?' · '+t.cabinet.company:''):t.cabinet.error):'')}
 ${line('API cabinet (dossiers clients)',s.firm,t?.firm?(t.firm.ok?'Connexion OK':t.firm.error):'Optionnelle si des jetons par dossier sont utilisés')}
 <div class="kpiLine"><b>Dernière synchro des factures</b><span>${sync.lastSync?new Date(sync.lastSync).toLocaleString('fr-FR')+' · '+esc(sync.status||''):'Jamais'}</span></div>
 <div class="v25actions" style="margin-top:12px"><button class="btn" onclick="testPennylane27()">Tester la connexion</button><button class="btn green" onclick="syncInvoices27()" ${s.cabinet?'':'disabled'}>↻ Synchroniser les factures</button><button class="btn secondary" onclick="loadCustomers27()" ${s.cabinet?'':'disabled'}>Rapprocher les clients facturés</button><button class="btn secondary" onclick="loadCompanies27()" ${s.firm?'':'disabled'}>Rapprocher les dossiers du cabinet</button></div></div>
 ${sync.unmatched?.length?`<div class="panel"><div class="panelHead"><h2>Factures Pennylane non rattachées</h2><span class="sub">Rattache le client Pennylane à une fiche CRM ci-dessous puis resynchronise.</span></div><table><thead><tr><th>Client Pennylane</th><th>ID</th><th>Factures</th><th>Montant HT</th></tr></thead><tbody>${sync.unmatched.slice(0,40).map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.customerId)}</td><td>${u.count}</td><td>${euro(u.amountHT)}</td></tr>`).join('')}</tbody></table></div>`:''}
 <div class="panel"><div class="panelHead"><h2>Rattachement des dossiers</h2><span class="sub">Rapprochement automatique par SIREN puis par raison sociale ; modifiable à la main.</span></div><table><thead><tr><th>Client CRM</th><th>Client facturé (Pennylane cabinet)</th><th>Dossier comptable Pennylane</th><th>Accès balance</th></tr></thead><tbody>${rows||'<tr><td colspan="4">Aucun client dans le portefeuille.</td></tr>'}</tbody></table></div>`;
}

/* ---------- Branchement sur la maquette ---------- */
syncPennylaneDemo=function(cid,year){return cid?syncLegal27(cid,year):syncInvoices27();};
syncClosingPennylane=syncClosing27;
analyzeClosing=analyzeClosing27;
importAccountsLegalV18=importAccountsLegal27;
const previousOpenClosing27=openClosingDossierV19;
openClosingDossierV19=function(cid){ensureV19State();state.closingAssistant.year=state.closingView.year;state.closingAssistant.synced=Boolean(state.closingAnalysis[closingKey(cid,state.closingView.year)]?.real27);previousOpenClosing27(cid);};

const previousSettings27=settings25;
settings25=function(){
 let h=previousSettings27();
 const s=pl27.status||{};
 h=h.replace('<span>Non connecté — aucune synchronisation réelle</span>',`<span>${shared25.active?(s.cabinet||s.firm?'Connecté en lecture seule'+(state.pennylaneSync?.lastSync?' · dernière synchro '+new Date(state.pennylaneSync.lastSync).toLocaleString('fr-FR'):''):'Serveur prêt — clés API à renseigner (voir ci-dessous)'):'Disponible uniquement via le serveur'}</span>`);
 if(shared25.active)h=h.replace('<span>Non connecté — saisie manuelle du SIREN</span>','<span>Annuaire des entreprises (API publique) actif via le serveur · Pappers non utilisé</span>');
 const i=h.indexOf('<div class="panel panelBody"><h2>Sauvegardes');
 return i<0?h+pennylanePanel27():h.slice(0,i)+pennylanePanel27()+h.slice(i);
};
const previousReview27=reviewPage25;
reviewPage25=function(){
 const h=previousReview27();
 return h.replace('<label class="btn">Importer la balance',`<button class="btn green" onclick="importReview27()">↻ Balance depuis Pennylane</button><label class="btn secondary">Importer la balance`);
};
function fixTexts27(){
 const root=document.getElementById('root');if(!root)return;
 const s=pl27.status||{},on=shared25.active&&(s.cabinet||s.firm||Object.keys(s.dossierTokens||{}).length);
 for(const el of root.querySelectorAll('.note,.info,.syncBox .sub')){
  const t=el.textContent;
  if(t.startsWith('Module historique V24'))el.textContent='Module historique : certaines analyses restent indicatives. '+(on?'Pennylane est connecté en lecture seule (factures et balances) ; les autres services externes ne le sont pas.':'Pennylane n’est pas encore configuré (Automatisations cabinet).');
  else if(t.startsWith('Maquette : données Pennylane simulées'))el.textContent=state.pennylaneSync?.lastSync?'Données réelles Pennylane depuis le '+datefr(state.pennylaneSync.from||''):'Aucune synchronisation réelle effectuée';
  else if(t.startsWith('Connexion réelle :'))el.innerHTML='<b>Connexion Pennylane :</b> les factures clients du cabinet (montants HT, avoirs déduits, brouillons exclus) sont rapprochées des fiches CRM par identifiant client Pennylane, SIREN puis raison sociale. Les factures non rattachées sont listées dans Automatisations cabinet.';
  else if(t.startsWith('Mode actuel :')){const a=closingAnalysisCurrent();el.innerHTML='<b>Source :</b> '+(a?.real27?esc(a.source)+' · importée le '+new Date(a.fetchedAt).toLocaleString('fr-FR')+'. Les contrôles sont calculés sur la balance réelle ; aucune OD n’est proposée ni envoyée automatiquement.':'balance du dossier lue dans Pennylane (étape 1). Rattache le dossier dans Automatisations cabinet si besoin.');}
 }
}
const previousRender27=render;
render=function(){
 previousRender27();
 fixTexts27();
 if(shared25.active&&shared25.ready&&!pl27.status&&!pl27.statusLoading)refreshStatus27().then(()=>render());
};
document.title='RB Partners CRM V27';
