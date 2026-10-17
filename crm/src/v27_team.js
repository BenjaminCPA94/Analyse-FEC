/* RB Partners V27 — équipe réelle, saisie des temps, rentabilité, charge équipe, fiche client unifiée et recherche.
 * L'équipe est déduite des personnes saisies dans les tableaux (associés, managers, collaborateurs, réalisé par) :
 * aucun collaborateur de démonstration. Tout est recalculé à chaque affichage. */
const TEAM_ROLES27=['Associé','Manager','Collaborateur','Assistant(e)','Stagiaire'];
const TIME_MISSIONS27=['Compta courante','Bilan','Juridique / AGO','Fiscalité','Onboarding','Travail exceptionnel','Social / paie','Interne','Autre'];
const ROLE_COST27={'Associé':120,'Manager':80,'Collaborateur':50,'Assistant(e)':35,'Stagiaire':20};
function splitNames27(s){return String(s||'').split(',').map(x=>x.trim()).filter(x=>x&&x.length>2);}
function initials27(n){return n.split(/[\s-]+/).filter(Boolean).map(w=>w[0]).join('').slice(0,3).toUpperCase();}
/* Équipe : membres enregistrés + toute personne nouvelle trouvée dans les tableaux (rôle déduit de la colonne). */
function team27(){
 if(!state.team27)state.team27=[];
 const t=state.team27,known=new Set(t.map(m=>m.name.toLowerCase())),add=(n,role)=>{const k=n.toLowerCase();if(known.has(k))return;known.add(k);t.push({id:uid('TM'),name:n,initials:initials27(n),role,cost:ROLE_COST27[role],capacity:140,active:true,auto:true});};
 for(const c of state.clients){splitNames27(people27(c,'associe')).forEach(n=>add(n,'Associé'));splitNames27(people27(c,'manager')).forEach(n=>add(n,'Manager'));splitNames27(people27(c,'collab')).forEach(n=>add(n,'Collaborateur'));}
 (state.exc27?.items||[]).forEach(w=>{splitNames27(w.realise).forEach(n=>add(n,'Collaborateur'));splitNames27(w.revu).forEach(n=>add(n,'Manager'));});
 return t;
}
function activeTeam27(){return team27().filter(m=>m.active!==false).sort((a,b)=>TEAM_ROLES27.indexOf(a.role)-TEAM_ROLES27.indexOf(b.role)||a.name.localeCompare(b.name));}
function memberOf27(name){const n=String(name||'').toLowerCase();return team27().find(m=>m.name.toLowerCase()===n||m.initials.toLowerCase()===n);}
function costOf27(name){return Number(memberOf27(name)?.cost??50);}
function setMember27(id,k,v){const m=team27().find(x=>x.id===id);if(!m)return;m[k]=['cost','capacity'].includes(k)?Number(v||0):k==='active'?v:String(v).trim();if(k==='name')m.initials=initials27(m.name);m.auto=false;save();render();}
function addMember27(){const n=prompt('Nom du collaborateur :');if(!n)return;team27().push({id:uid('TM'),name:n.trim(),initials:initials27(n.trim()),role:'Collaborateur',cost:50,capacity:140,active:true});persist25();}
function inPeople27(c,name){const n=name.toLowerCase();return ['associe','manager','collab'].some(k=>splitNames27(people27(c,k)).some(x=>x.toLowerCase()===n));}
function me27(){const u=(shared25.user?.username||'').toLowerCase(),t=activeTeam27();return (u&&(t.find(m=>String(m.user||'').toLowerCase()===u)||t.find(m=>m.name.toLowerCase().startsWith(u))))?.name||t[0]?.name||'';}

/* ---------- Saisie des temps ---------- */
function timeFilter27(){if(!state.timeF27)state.timeF27={period:'month',who:''};return state.timeF27;}
function inPeriod27(d,p){const t=new Date(),x=new Date(d+'T12:00:00');if(p==='week'){const s=new Date(t);s.setDate(t.getDate()-((t.getDay()+6)%7));s.setHours(0,0,0,0);return x>=s;}if(p==='month')return d.slice(0,7)===today27().slice(0,7);if(p==='year')return d.slice(0,4)===today27().slice(0,4);return true;}
function addTime27(){
 const g=k=>document.getElementById('t27_'+k)?.value.trim(),c=state.clients.find(x=>x.name===g('client'));
 if(!c&&g('mission')!=='Interne')return toast('Choisis un client de la liste (ou la mission « Interne »).');
 const h=Number(String(g('hours')).replace(',','.'));if(!(h>0&&h<=24))return toast('Indique un nombre d’heures entre 0 et 24.');
 state.time.unshift({id:uid('T'),date:g('date')||today27(),user:g('who'),client:c?.id||'',mission:g('mission'),exc:g('exc')||'',hours:h,note:g('note'),created:new Date().toISOString()});
 log25('Temps saisi',c?.id||'',`${h} h · ${g('mission')}`);state.timeDraft27={who:g('who'),mission:g('mission')};persist25();toast(h+' h enregistrée(s)');
}
function delTime27(id){if(!confirm('Supprimer cette saisie ?'))return;state.time=state.time.filter(t=>t.id!==id);persist25();}
function excOptions27(){const c=state.clients.find(x=>x.name===document.getElementById('t27_client')?.value),sel=document.getElementById('t27_exc');if(!sel)return;sel.innerHTML='<option value="">—</option>'+(c?exc27().items.filter(w=>w.client===c.id&&w.statut!=='Terminé'):[]).map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('');}
function timePage27(){
 const f=timeFilter27(),d=state.timeDraft27||{},list=state.time.filter(t=>t.date&&inPeriod27(t.date,f.period)&&(!f.who||t.user===f.who));
 const tot=list.reduce((a,t)=>a+Number(t.hours||0),0),byM={};list.forEach(t=>{byM[t.mission||'Autre']=(byM[t.mission||'Autre']||0)+Number(t.hours||0);});
 return `<datalist id="t27_clients">${state.clients.map(c=>`<option value="${esc(c.name)}">`).join('')}</datalist>
 <div class="titleRow"><div><h1>Saisie des temps</h1><div class="sub">Une saisie par tâche, en fin de journée. Les temps alimentent la rentabilité des dossiers et la charge de l’équipe.</div></div></div>
 <div class="panel panelBody"><div class="formGrid" style="grid-template-columns:130px 1.2fr 1.6fr 1.2fr 1.3fr 80px 2fr auto;align-items:end">
  <div class="field"><label>Date</label><input id="t27_date" type="date" value="${today27()}"></div>
  <div class="field"><label>Collaborateur</label><select id="t27_who">${activeTeam27().map(m=>`<option ${m.name===(d.who||me27())?'selected':''}>${esc(m.name)}</option>`).join('')}</select></div>
  <div class="field"><label>Client</label><input id="t27_client" list="t27_clients" placeholder="Nom du client" onchange="excOptions27()"></div>
  <div class="field"><label>Mission</label><select id="t27_mission">${TIME_MISSIONS27.map(m=>`<option ${m===d.mission?'selected':''}>${m}</option>`).join('')}</select></div>
  <div class="field"><label>Travail exceptionnel</label><select id="t27_exc"><option value="">—</option></select></div>
  <div class="field"><label>Heures</label><input id="t27_hours" type="number" step="0.25" min="0" placeholder="1,5"></div>
  <div class="field"><label>Commentaire</label><input id="t27_note" placeholder="Ex. : TVA septembre, révision fournisseurs…"></div>
  <button class="btn green" onclick="addTime27()">Ajouter</button></div></div>
 <div class="v25actions" style="margin:4px 0 10px">${[['week','Cette semaine'],['month','Ce mois'],['year','Cette année'],['all','Tout']].map(([k,l])=>`<button class="btn small ${f.period===k?'':'secondary'}" onclick="timeFilter27().period='${k}';save();render()">${l}</button>`).join('')}
  <select class="statusSelect" onchange="timeFilter27().who=this.value;save();render()"><option value="">Toute l’équipe</option>${activeTeam27().map(m=>`<option ${m.name===f.who?'selected':''}>${esc(m.name)}</option>`).join('')}</select>
  <span class="sub"><b>${tot.toLocaleString('fr-FR')} h</b> · ${Object.entries(byM).map(([k,v])=>`${k} ${v.toLocaleString('fr-FR')} h`).join(' · ')||'aucune saisie'}</span></div>
 <div class="panel"><table><thead><tr><th>Date</th><th>Collaborateur</th><th>Client</th><th>Mission</th><th>Détail</th><th style="text-align:right">Heures</th><th style="text-align:right">Coût</th><th></th></tr></thead><tbody>${list.slice(0,400).map(t=>{const w=t.exc&&exc27().items.find(x=>x.id===t.exc);return `<tr><td>${datefr(t.date)}</td><td>${esc(t.user||'')}</td><td>${t.client?`<a href="#" onclick="event.preventDefault();openClient('${t.client}')">${esc(cfind(t.client)?.name||'')}</a>`:'<span class="sub">Interne</span>'}</td><td>${esc(t.mission||t.task||'')}</td><td>${w?'<b>'+esc(w.name)+'</b> · ':''}${esc(t.note||'')}</td><td style="text-align:right">${Number(t.hours||0).toLocaleString('fr-FR')}</td><td style="text-align:right">${euro(Number(t.hours||0)*costOf27(t.user))}</td><td style="text-align:right"><button class="btn small secondary" onclick="delTime27('${t.id}')">×</button></td></tr>`;}).join('')||'<tr><td colspan="8" class="sub">Aucune saisie sur la période.</td></tr>'}</tbody></table></div>`;
}

/* ---------- Rentabilité ---------- */
function profitRows27(y){
 const synced=Boolean(state.pennylaneSync?.lastSync);
 return state.clients.filter(c=>!['Inactif'].includes(c.status)).map(c=>{
  const times=state.time.filter(t=>t.client===c.id&&String(t.date).startsWith(y)),hours=times.reduce((a,t)=>a+Number(t.hours||0),0),cost=times.reduce((a,t)=>a+Number(t.hours||0)*costOf27(t.user),0);
  const budget=feeTotalClient(c)-Number(fees27(c).exceptional||0),excF=exc27().items.filter(w=>w.client===c.id&&excYear27(w)===y).reduce((a,w)=>a+Number(w.fees||0),0);
  const billed=(state.pennylaneInvoices||[]).filter(i=>i.client===c.id&&String(i.date).startsWith(y)&&i.status!=='Annulée').reduce((a,i)=>a+Number(i.amount||0),0);
  const revenue=synced?billed:budget+excF,margin=revenue-cost;
  return {c,hours,cost,budget,excF,billed,revenue,margin,rate:revenue?margin/revenue:null,bh:Number(c.budgetHours||0)};
 }).filter(r=>r.hours||r.revenue);
}
function setBudgetHours27(cid,v){const c=cfind(cid);if(!c)return;c.budgetHours=Number(v||0);save();render();}
function profitPage27(){
 const y=Number(state.profitY27||new Date().getFullYear()),rows=profitRows27(y).sort((a,b)=>(a.rate??9)-(b.rate??9)),synced=Boolean(state.pennylaneSync?.lastSync);
 const R=rows.reduce((a,r)=>a+r.revenue,0),C=rows.reduce((a,r)=>a+r.cost,0),H=rows.reduce((a,r)=>a+r.hours,0),low=rows.filter(r=>r.rate!=null&&r.hours&&r.rate<.35).length;
 const works=exc27().items.filter(w=>excYear27(w)===y).map(w=>{const t=state.time.filter(x=>x.exc===w.id),h=t.reduce((a,x)=>a+Number(x.hours||0),0),co=t.reduce((a,x)=>a+Number(x.hours||0)*costOf27(x.user),0);return {w,h,co,m:Number(w.fees||0)-co};}).filter(x=>x.h);
 return `<div class="titleRow"><div><h1>Rentabilité ${y}</h1><div class="sub">${synced?'Honoraires = facturé dans Pennylane':'Honoraires = budget du portefeuille + travaux exceptionnels (Pennylane non synchronisé)'} ; coût = temps saisis × coût horaire de chaque collaborateur (Charge équipe).</div></div><div class="v25actions">${[y-1,y,y+1].map(v=>`<button class="btn small ${v===y?'':'secondary'}" onclick="state.profitY27=${v};save();render()">${v}</button>`).join('')}</div></div>
 <div class="cards" style="grid-template-columns:repeat(4,1fr)"><div class="card"><small>Honoraires</small><span class="big">${euro(R)}</span></div><div class="card"><small>Coût du temps</small><span class="big">${euro(C)}</span><div class="sub">${H.toLocaleString('fr-FR')} h saisies</div></div><div class="card"><small>Marge</small><span class="big ${R-C<0?'bad':'good'}">${euro(R-C)}</span><div class="sub">${R?Math.round((R-C)/R*100)+' %':'—'}</div></div><div class="card"><small>Dossiers sous 35 % de marge</small><span class="big ${low?'bad':'good'}">${low}</span></div></div>
 ${H?'':'<div class="note" style="margin-bottom:12px">Aucun temps saisi sur l’année : la marge sera significative dès les premières saisies (Saisie des temps).</div>'}
 <div class="panel"><table><thead><tr><th>Client</th><th style="text-align:right">Honoraires</th><th style="text-align:right">Heures</th><th style="text-align:right">Budget heures</th><th style="text-align:right">Coût</th><th style="text-align:right">Marge</th><th style="text-align:right">Taux</th></tr></thead><tbody>${rows.map(r=>`<tr><td><a href="#" onclick="event.preventDefault();openClient('${r.c.id}')"><b>${esc(r.c.name)}</b></a></td><td style="text-align:right">${euro(r.revenue)}</td><td style="text-align:right">${r.hours.toLocaleString('fr-FR')} h</td><td style="text-align:right"><input class="mini" style="width:70px;text-align:right" type="number" value="${r.bh||''}" placeholder="—" onchange="setBudgetHours27('${r.c.id}',this.value)">${r.bh?` <span class="${r.hours>r.bh?'bad':'sub'}">${Math.round(r.hours/r.bh*100)} %</span>`:''}</td><td style="text-align:right">${euro(r.cost)}</td><td style="text-align:right" class="${r.margin<0?'bad':''}">${euro(r.margin)}</td><td style="text-align:right">${r.rate==null?'—':`<span class="badge ${r.rate<.35?'red':r.rate<.6?'orange':'green'}">${Math.round(r.rate*100)} %</span>`}</td></tr>`).join('')||'<tr><td colspan="7" class="sub">Aucun dossier.</td></tr>'}</tbody></table></div>
 ${works.length?`<div class="panel"><div class="panelHead"><h3>Travaux exceptionnels</h3></div><table><thead><tr><th>Travail</th><th>Client</th><th style="text-align:right">Honoraires</th><th style="text-align:right">Heures</th><th style="text-align:right">Coût</th><th style="text-align:right">Marge</th></tr></thead><tbody>${works.map(x=>`<tr><td>${esc(x.w.name)}</td><td>${esc(cfind(x.w.client)?.name||'')}</td><td style="text-align:right">${euro(x.w.fees)}</td><td style="text-align:right">${x.h} h</td><td style="text-align:right">${euro(x.co)}</td><td style="text-align:right" class="${x.m<0?'bad':''}">${euro(x.m)}</td></tr>`).join('')}</tbody></table></div>`:''}`;
}

/* ---------- Charge équipe ---------- */
function workload27(m){
 const y=boards27().year,fy=new Date().getFullYear(),mo=new Date().getMonth()+1,mine=state.clients.filter(c=>c.status!=='Inactif'&&inPeople27(c,m.name));
 const bil=mine.filter(c=>{const x=ctx27('bilan',c,y);return group27(x)!=='Non concernés'&&group27(x)!=='Terminés';}).length;
 const ago=mine.filter(c=>{const x=ctx27('ago',c,y);return group27(x)!=='Non concernés'&&group27(x)!=='Terminés';}).length;
 let fisc=0;mine.filter(c=>c.missions?.tax||c.fisc27).forEach(c=>{const r=row27('fiscm',c.id,fy);obligations27(c,fy).filter(o=>o.m===mo&&!FISC_DONE27.test(r[o.key]||o.def)).forEach(()=>fisc++);});
 const onb=mine.filter(isOnboarding27).length,exc=exc27().items.filter(w=>w.statut!=='Terminé'&&(splitNames27(w.realise).some(n=>n.toLowerCase()===m.name.toLowerCase()))).length;
 const hours=state.time.filter(t=>t.user===m.name&&String(t.date).slice(0,7)===today27().slice(0,7)).reduce((a,t)=>a+Number(t.hours||0),0);
 return {clients:mine.length,bil,ago,fisc,onb,exc,hours,util:m.capacity?hours/m.capacity:0};
}
function capacityPage27(){
 const team=activeTeam27(),all=team27();
 return `<div class="titleRow"><div><h1>Charge équipe</h1><div class="sub">Calculée à partir des dossiers attribués dans les tableaux (associé, manager, collaborateurs, réalisé par) et des temps saisis ce mois-ci.</div></div><button class="btn small" onclick="addMember27()">+ Collaborateur</button></div>
 <div class="panel"><table><thead><tr><th>Collaborateur</th><th>Rôle</th><th style="text-align:right">Dossiers</th><th style="text-align:right">Bilans à faire</th><th style="text-align:right">AGO à faire</th><th style="text-align:right">Fiscalité du mois</th><th style="text-align:right">Onboardings</th><th style="text-align:right">Travaux exc.</th><th>Temps du mois</th></tr></thead><tbody>${team.map(m=>{const w=workload27(m);return `<tr><td><b>${esc(m.name)}</b></td><td>${esc(m.role)}</td><td style="text-align:right">${w.clients}</td><td style="text-align:right">${w.bil}</td><td style="text-align:right">${w.ago}</td><td style="text-align:right">${w.fisc}</td><td style="text-align:right">${w.onb}</td><td style="text-align:right">${w.exc}</td><td style="min-width:180px"><div class="onbProg27"><div class="bar27"><i style="width:${Math.min(100,w.util*100)}%;background:${w.util>1?C27.red:w.util>.8?C27.orange:C27.green}"></i></div><span>${w.hours.toLocaleString('fr-FR')} / ${m.capacity} h</span></div></td></tr>`;}).join('')||'<tr><td colspan="9" class="sub">Aucun collaborateur : ils apparaissent dès qu’ils sont renseignés dans un tableau.</td></tr>'}</tbody></table></div>
 <div class="panel"><div class="panelHead"><h3>Équipe du cabinet</h3><span class="sub">Rôle, coût horaire (rentabilité) et capacité mensuelle. Les nouveaux noms des tableaux sont ajoutés automatiquement.</span></div><table><thead><tr><th>Nom</th><th>Initiales</th><th>Compte CRM</th><th>Rôle</th><th style="text-align:right">Coût horaire (€)</th><th style="text-align:right">Capacité (h / mois)</th><th>Actif</th></tr></thead><tbody>${all.map(m=>`<tr><td><input class="cell27" style="text-align:left" value="${esc(m.name)}" onchange="setMember27('${m.id}','name',this.value)"></td><td><input class="cell27" style="width:60px" value="${esc(m.initials)}" onchange="setMember27('${m.id}','initials',this.value)"></td><td><input class="cell27" style="width:110px" placeholder="identifiant" value="${esc(m.user||'')}" onchange="setMember27('${m.id}','user',this.value)"></td><td><select class="statusSelect" onchange="setMember27('${m.id}','role',this.value)">${TEAM_ROLES27.map(r=>`<option ${r===m.role?'selected':''}>${r}</option>`).join('')}</select></td><td style="text-align:right"><input class="mini" style="width:80px;text-align:right" type="number" value="${m.cost}" onchange="setMember27('${m.id}','cost',this.value)"></td><td style="text-align:right"><input class="mini" style="width:80px;text-align:right" type="number" value="${m.capacity}" onchange="setMember27('${m.id}','capacity',this.value)"></td><td><input type="checkbox" ${m.active!==false?'checked':''} onchange="setMember27('${m.id}','active',this.checked)"></td></tr>`).join('')}</tbody></table></div>`;
}

/* ---------- Fiche client unifiée ---------- */
function clientTab27(t){state.clientTab27=t;save();render();}
function clientPage27(){
 const c=cfind(state.selectedClient)||state.clients[0];if(!c)return '<div class="panel panelBody">Aucun client.</div>';
 const tab=state.clientTab27||'synthese',i=clientIdentity26(c),y=new Date().getFullYear(),f=fees27(c),inv=(state.invoices||[]).filter(x=>x.client===c.id),times=state.time.filter(t=>t.client===c.id);
 const works=exc27().items.filter(w=>w.client===c.id),p=onbProgress27(c),audit=(state.ops25?.audit||[]).filter(e=>e.client===c.id);
 const statut=STATUT_COL27.get({c});
 const tabs=[['synthese','Synthèse'],['onb','Onboarding'],['fisc','Fiscalité'],['bilan','Bilan & AGO'],['exc','Travaux exceptionnels'],['fact','Facturation'],['temps','Temps'],['hist','Historique']];
 const kv=(k,v)=>`<div class="kpiLine"><span class="sub">${k}</span><b style="text-align:right">${v||'<span class="sub">—</span>'}</b></div>`;
 let body='';
 if(tab==='synthese')body=`<div class="grid2"><div class="panel"><div class="panelHead"><h3>Identité</h3><button class="btn small light" onclick="identityDialog26('client','${c.id}')">Actualiser par SIREN</button></div><div class="panelBody">${kv('Raison sociale',esc(c.name))}${kv('SIREN',esc(c.siren))}${kv('Forme juridique',esc(c.legalForm))}${kv('Adresse',esc(i.address))}${kv('Code APE',esc(i.naf))}${kv('Capital',i.capital?euro(i.capital):'')}${kv('Dirigeants',(i.directors||[]).map(d=>esc(d.name)).join(', '))}${kv('Contact',esc([c.contact?.name,c.contact?.email].filter(Boolean).join(' · ')))}${kv('Groupe',esc(c.group27))}${kv('Date d’entrée',c.entry?datefr(c.entry):'')}</div></div>
  <div class="panel"><div class="panelHead"><h3>Dossier</h3><button class="btn small light" onclick="routePage('clients')">Modifier dans le portefeuille</button></div><div class="panelBody">${kv('Associé',esc(people27(c,'associe')))}${kv('Manager',esc(people27(c,'manager')))}${kv('Collaborateurs',esc(people27(c,'collab')))}${kv('Clôture',closingLabel27(c))}${kv('Régime fiscal',esc(c.taxRegime))}${kv('TVA',esc(c.vatRegime))}${kv('Missions',MISSIONS27.filter(([k])=>c.missions?.[k]).map(([,l])=>l).join(', '))}${kv('LDM signée',esc(ldm27(c)))}</div></div></div>
  <div class="cards" style="grid-template-columns:repeat(5,1fr)"><div class="card"><small>Honoraires courants</small><span class="big">${euro(f.accounting)}</span></div><div class="card"><small>Bilan</small><span class="big">${euro(f.annualAccounts)}</span></div><div class="card"><small>AGO</small><span class="big">${euro(f.legalAnnual)}</span></div><div class="card"><small>Autres</small><span class="big">${euro(f.other)}</span></div><div class="card"><small>Budget annuel</small><span class="big">${euro(feeTotalClient(c)-Number(f.exceptional||0))}</span></div></div>`;
 if(tab==='onb')body=onbRow27(ctx27('onb',c,0)).replace('class="onb27 ','class="onb27 open ')+(boards27().onbOpen?.[c.id]?'':`<div class="sub" style="margin-top:6px">Clique sur la ligne pour dérouler les 14 étapes.</div>`);
 if(tab==='fisc'){const r=row27('fiscm',c.id,y),obl=obligations27(c,y);body=`<div class="panel"><div class="panelHead"><h3>Échéances fiscales ${y}</h3><button class="btn small light" onclick="routePage('fiscal')">Fiscalité</button></div><table><thead><tr><th>Mois</th><th>Déclaration</th><th>Échéance</th><th>Statut</th></tr></thead><tbody>${obl.map(o=>{const s=r[o.key]||o.def,late=!FISC_DONE27.test(s)&&o.due<today27();return `<tr><td>${MONTHS27[o.m-1]}</td><td>${esc(o.label)}</td><td class="${late?'bad':''}">${datefr(o.due)}</td><td><span class="badge" style="background:${color27(s)};color:#fff">${esc(s)}</span></td></tr>`;}).join('')||'<tr><td colspan="4" class="sub">Aucun régime renseigné : complète le tableau principal de la Fiscalité.</td></tr>'}</tbody></table></div>`;}
 if(tab==='bilan')body=clientBoards27(c);
 if(tab==='exc')body=`<div class="panel"><div class="panelHead"><h3>Travaux exceptionnels</h3><button class="btn small light" onclick="routePage('exceptional')">Ouvrir le tableau</button></div><table><thead><tr><th>Travail</th><th>Date</th><th>Statut</th><th style="text-align:right">Honoraires</th><th>Facturation</th></tr></thead><tbody>${works.map(w=>`<tr><td>${esc(w.name)}</td><td>${datefr(w.date)}</td><td><span class="badge" style="background:${color27(w.statut)};color:#fff">${esc(w.statut)}</span></td><td style="text-align:right">${euro(w.fees)}</td><td>${excBilling27(w,excInvoices27()[w.id]).label}</td></tr>`).join('')||'<tr><td colspan="5" class="sub">Aucun travail exceptionnel.</td></tr>'}</tbody></table></div>`;
 if(tab==='fact')body=`<div class="panel"><div class="panelHead"><h3>Factures émises</h3><button class="btn small light" onclick="routePage('billing')">Facturation</button></div><table><thead><tr><th>Facture</th><th>Date</th><th>Source</th><th style="text-align:right">Montant HT</th></tr></thead><tbody>${inv.map(x=>`<tr><td>${esc(x.label)}</td><td>${datefr(x.date)}</td><td><span class="badge ${x.source==='pennylane'?'green':'blue'}">${x.source==='pennylane'?'Pennylane':'Saisie CRM'}</span></td><td style="text-align:right">${euro(invHT27(x))}</td></tr>`).join('')||'<tr><td colspan="4" class="sub">Aucune facture émise.</td></tr>'}</tbody></table></div>`;
 if(tab==='temps')body=`<div class="panel"><div class="panelHead"><h3>Temps passés</h3><span class="sub">${times.reduce((a,t)=>a+Number(t.hours||0),0).toLocaleString('fr-FR')} h au total</span></div><table><thead><tr><th>Date</th><th>Collaborateur</th><th>Mission</th><th>Commentaire</th><th style="text-align:right">Heures</th></tr></thead><tbody>${times.slice(0,200).map(t=>`<tr><td>${datefr(t.date)}</td><td>${esc(t.user)}</td><td>${esc(t.mission||'')}</td><td>${esc(t.note||'')}</td><td style="text-align:right">${t.hours}</td></tr>`).join('')||'<tr><td colspan="5" class="sub">Aucun temps saisi.</td></tr>'}</tbody></table></div>`;
 if(tab==='hist')body=`<div class="panel"><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Détail</th></tr></thead><tbody>${audit.slice(0,200).map(e=>`<tr><td>${new Date(e.date).toLocaleString('fr-FR')}</td><td>${esc(e.user)}</td><td>${esc(e.action)}</td><td>${esc(e.details)}</td></tr>`).join('')||'<tr><td colspan="4" class="sub">Aucune action enregistrée pour ce client.</td></tr>'}</tbody></table></div>`;
 return `<div class="hero27"><div><div class="sub"><a href="#" onclick="event.preventDefault();routePage('clients')">← Portefeuille clients</a></div><h1>${esc(c.name)}</h1><div class="sub">${esc(c.legalForm||'')}${c.siren?' · SIREN '+esc(c.siren):''} · clôture ${closingLabel27(c)} · ${esc(people27(c,'manager')||'')}</div></div>
  <div class="v25actions"><span class="badge" style="background:${color27(statut||c.status)};color:#fff">${esc(statut||c.status)}</span>${c.siren?`<button class="btn small secondary" onclick="copy('${esc(c.siren)}')">Copier le SIREN</button>`:''}<a class="btn small secondary" href="https://www.impots.gouv.fr/professionnel" target="_blank" rel="noopener">impots.gouv</a>${c.pl27?.companyId?`<a class="btn small secondary" href="https://app.pennylane.com/companies/${encodeURIComponent(c.pl27.companyId)}" target="_blank" rel="noopener">Pennylane</a>`:''}<button class="btn small" onclick="letterDialog26('${c.id}')">Lettre de mission</button><button class="btn small secondary" onclick="repriseDialog27('${c.id}')">Lettre de reprise</button></div></div>
 <div class="tabs27">${tabs.map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="clientTab27('${k}')">${l}${k==='onb'&&isOnboarding27(c)?' · '+p.label:''}</button>`).join('')}</div>${body}`;
}
clientPage=clientPage27;

/* ---------- Recherche universelle ---------- */
function search27(q){
 let d=document.getElementById('search27');if(!d){d=document.createElement('div');d.id='search27';d.className='search27';document.querySelector('.top')?.append(d);}
 q=String(q||'').trim().toLowerCase();if(q.length<2){d.style.display='none';return;}
 const hit=s=>String(s||'').toLowerCase().includes(q);
 const res=[...state.clients.filter(c=>hit(c.name)||hit(c.siren)||hit(c.group27)).slice(0,8).map(c=>({t:'Client',l:c.name,s:[c.siren,c.group27].filter(Boolean).join(' · '),go:`openClient('${c.id}')`})),
  ...state.prospects.filter(p=>hit(p.name)||hit(p.siren)).slice(0,4).map(p=>({t:'Prospect',l:p.name,s:p.stage,go:`routePage('prospects');openProspect('${p.id}')`})),
  ...exc27().items.filter(w=>hit(w.name)||hit(w.desc)).slice(0,4).map(w=>({t:'Travail',l:w.name,s:cfind(w.client)?.name,go:`exc27().year=${excYear27(w)};routePage('exceptional')`}))];
 d.innerHTML=res.map(r=>`<a href="#" onclick="event.preventDefault();document.getElementById('search27').style.display='none';document.getElementById('globalSearch').value='';${r.go}"><span class="sub">${r.t}</span><b>${esc(r.l)}</b><span class="sub">${esc(r.s||'')}</span></a>`).join('')||'<div class="sub" style="padding:10px">Aucun résultat.</div>';
 d.style.display='block';
}
(function(){
 const old=document.getElementById('globalSearch');if(old){const n=old.cloneNode(true);n.placeholder='Rechercher un client, un SIREN, un groupe, un prospect…';old.replaceWith(n);n.addEventListener('input',e=>search27(e.target.value));n.addEventListener('keydown',e=>{if(e.key==='Enter'){document.querySelector('#search27 a')?.click();}if(e.key==='Escape'){e.target.value='';search27('');}});}
 document.addEventListener('click',e=>{if(!e.target.closest('#search27')&&!e.target.closest('#globalSearch')){const d=document.getElementById('search27');if(d)d.style.display='none';}});
 // Prototypes sans fonctionnement réel retirés : assistant IA, moteur de skills, analyse IA, rôles fictifs.
 document.querySelectorAll('.top button').forEach(b=>{if(/Demander à l’IA|Demander à l'IA/.test(b.textContent))b.remove();});
 ['skills','paperasse','users'].forEach(p=>{REMOVED_PAGES27.push(p);document.querySelectorAll(`.nav a[data-page="${p}"]`).forEach(a=>a.remove());});
 const s=document.createElement('style');s.textContent=`.search27{display:none;position:absolute;top:52px;left:22px;width:min(520px,80vw);background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(16,24,40,.12);z-index:50;max-height:420px;overflow:auto}
.search27 a{display:grid;grid-template-columns:70px 1fr auto;gap:10px;padding:8px 12px;text-decoration:none;color:inherit;border-bottom:1px solid #f1f2f5;align-items:center}.search27 a:hover{background:#f5f8ff}
.hero27{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:12px;flex-wrap:wrap}.hero27 h1{margin:4px 0}`;document.head.append(s);
})();
const previousRenderTeam27=render;
render=function(){
 previousRenderTeam27();
 const root=document.getElementById('root'),p=state.page;
 if(p==='time')root.innerHTML=timePage27();
 if(p==='profit')root.innerHTML=profitPage27();
 if(p==='capacity')root.innerHTML=capacityPage27();
 if(p==='client')root.innerHTML=clientPage27();
 if(p==='fees'&&!state.pennylaneSync?.lastSync&&!root.querySelector('.feesNote27')){const n=document.createElement('div');n.className='note feesNote27';n.style.marginBottom='12px';n.innerHTML='<b>Pennylane n’est pas encore synchronisé :</b> le « facturé » est à 0 et tous les dossiers apparaissent à vérifier. Les écarts seront fiables après la première synchronisation (Automatisations cabinet).';root.querySelector('.titleRow')?.after(n);}
};
