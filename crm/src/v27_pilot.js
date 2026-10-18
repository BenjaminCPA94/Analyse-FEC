/* RB Partners V27 — Lot 5 : pilotage.
 *  - Équipe : identifiants stables ; les personnes trouvées dans les tableaux sont proposées sans être enregistrées
 *    à l'affichage (un rendu ne modifie plus les données) ; coûts horaires historisés avec leur date d'effet.
 *  - Temps : collaborateur choisi explicitement (jamais le premier de la liste), identifiant stable, contrôles.
 *  - Rentabilité : méthode choisie et affichée (budget contractuel ou facturé), marge sur coût du temps,
 *    temps absents ou incomplets et coûts estimés signalés.
 *  - Charge : capacité moins absences, consommé et prévisionnel distincts, production et revue, estimations manquantes.
 *  - Revue annuelle des honoraires, contrôle qualité du portefeuille, travaux hors forfait sans accord tarifaire. */

/* ---------- Équipe ---------- */
team27=function(){
 const t=Array.isArray(state.team27)?state.team27:[],known=new Set(t.map(m=>m.name.toLowerCase())),virt=[];
 const add=(n,role)=>{const k=n.toLowerCase();if(known.has(k))return;known.add(k);virt.push({id:'auto:'+k.normalize('NFD').replace(/[^a-z0-9]/g,'_'),name:n,initials:initials27(n),role,cost:ROLE_COST27[role],capacity:140,active:true,auto:true,virtual:true});};
 for(const c of state.clients){splitNames27(people27(c,'associe')).forEach(n=>add(n,'Associé'));splitNames27(people27(c,'manager')).forEach(n=>add(n,'Manager'));splitNames27(people27(c,'collab')).forEach(n=>add(n,'Collaborateur'));}
 (state.exc27?.items||[]).forEach(w=>{splitNames27(w.realise).forEach(n=>add(n,'Collaborateur'));splitNames27(w.revu).forEach(n=>add(n,'Manager'));});
 return t.concat(virt);
};
function persistMember27(id){
 if(!String(id).startsWith('auto:'))return team27().find(m=>m.id===id);
 const v=team27().find(m=>m.id===id);if(!v)return null;
 const m={...v,id:uid('TM')};delete m.virtual;m.auto=false;(state.team27=state.team27||[]).push(m);return m;
}
setMember27=function(id,k,v){
 const m=persistMember27(id);if(!m)return;
 if(k==='cost'){const nv=Number(v||0);if(Number(m.cost)!==nv){m.costHist=m.costHist||[{from:'0000-01-01',cost:Number(m.cost||0)}];const d=today27(),last=m.costHist[m.costHist.length-1];if(last.from===d)last.cost=nv;else m.costHist.push({from:d,cost:nv,by:shared25.user?.username||''});}m.cost=nv;}
 else m[k]=['capacity'].includes(k)?Number(v||0):k==='active'?v:String(v).trim();
 if(k==='name')m.initials=initials27(m.name);m.auto=false;save();render();
};
function memberById27(id){return team27().find(m=>m.id===id);}
function costAt27(m,date){if(!m)return 50;const h=m.costHist;if(!h?.length)return Number(m.cost??50);let e=h[0];for(const x of h)if(x.from<=(date||today27()))e=x;return Number(e.cost??50);}
costOf27=function(name,date){return costAt27(memberOf27(name),date);};
function costEstimated27(m){return !m||m.virtual||m.auto||m.cost==null;}

/* ---------- Saisie des temps ---------- */
const previousTimePage27=timePage27;
timePage27=function(){
 let html=previousTimePage27();
 const me=me27(),collab=shared25.active&&shared25.user?.role==='collaborateur';
 // Collaborateur : choix explicite, jamais présélectionné ; un collaborateur ne saisit que pour lui-même.
 html=html.replace(/<select id="t27_who">[\s\S]*?<\/select>/,`<select id="t27_who" ${collab?'disabled':''}><option value="">— Choisir —</option>${activeTeam27().map(m=>`<option value="${esc(m.name)}" ${m.name===(collab?me:(state.timeDraft27?.who||me))?'selected':''}>${esc(m.name)}</option>`).join('')}</select>`);
 if(shared25.active&&!me)html=html.replace('<div class="panel panelBody">','<div class="note" style="margin-bottom:10px">Ton compte n’est relié à aucun collaborateur : choisis le collaborateur concerné, ou demande à un associé de relier ton compte (Charge équipe › Compte CRM).</div><div class="panel panelBody">');
 return html;
};
addTime27=function(){
 const g=k=>document.getElementById('t27_'+k)?.value.trim(),who=g('who'),m=activeTeam27().find(x=>x.name===who),c=state.clients.find(x=>x.name===g('client'));
 if(!m)return toast('Choisis le collaborateur.');
 if(shared25.active&&shared25.user?.role==='collaborateur'&&who!==me27())return toast('Tu ne peux saisir que tes propres temps.');
 if(!c&&g('mission')!=='Interne')return toast('Choisis un client de la liste (ou la mission « Interne »).');
 const h=Number(String(g('hours')).replace(',','.'));if(!(h>0&&h<=24))return toast('Indique un nombre d’heures entre 0 et 24.');
 const date=g('date')||today27();if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return toast('Date invalide.');
 if(date>iso(addDays(new Date(),7)))return toast('Date trop éloignée dans le futur.');
 const mem=persistMember27(m.id)||m;
 state.time.unshift({id:uid('T'),date,user:mem.name,memberId:mem.id,client:c?.id||'',mission:g('mission'),exc:g('exc')||'',hours:h,note:g('note'),created:new Date().toISOString(),late:date<iso(addDays(new Date(),-31))||undefined});
 log25('Temps saisi',c?.id||'',`${h} h · ${g('mission')} · ${mem.name}`);state.timeDraft27={who:mem.name,mission:g('mission')};persist25();toast(h+' h enregistrée(s)');
};
function timeMember27(t){return (t.memberId&&memberById27(t.memberId))||memberOf27(t.user);}
function timeCost27(t){return Number(t.hours||0)*costAt27(timeMember27(t),t.date);}

/* ---------- Rentabilité ---------- */
profitRows27=function(y,method){
 const synced=Boolean(state.pennylaneSync?.lastSync),start=`${y}-01-01`,elapsed=Math.min(1,Math.max(0,(Date.now()-Date.parse(start))/(365*864e5)));
 return state.clients.filter(c=>c.status!=='Inactif').map(c=>{
  const times=state.time.filter(t=>t.client===c.id&&String(t.date).startsWith(y)),hours=times.reduce((a,t)=>a+Number(t.hours||0),0),cost=times.reduce((a,t)=>a+timeCost27(t),0);
  const est=times.some(t=>costEstimated27(timeMember27(t)));
  const budget=feeTotalClient(c)-Number(fees27(c).exceptional||0);
  const billed=synced?(state.pennylaneInvoices||[]).filter(i=>i.client===c.id&&String(i.date).startsWith(y)&&i.status!=='Annulée'&&i.category!=='Travaux exceptionnels').reduce((a,i)=>a+Number(i.amount||0),0):null;
  const revenue=method==='billed'?billed:budget,bh=Number(c.budgetHours||0);
  const noTime=!hours,incomplete=hours&&bh&&hours<bh*elapsed*0.5;
  const margin=revenue==null||noTime?null:revenue-cost;
  return {c,hours,cost,budget,billed,revenue,margin,rate:margin!=null&&revenue?margin/revenue:null,bh,noTime,incomplete,est};
 }).filter(r=>r.hours||r.revenue);
};
profitPage27=function(){
 const y=Number(state.profitY27||new Date().getFullYear()),method=state.profitMethod27||'budget',synced=Boolean(state.pennylaneSync?.lastSync);
 const rows=profitRows27(y,method).sort((a,b)=>(a.rate??9)-(b.rate??9)),withTime=rows.filter(r=>!r.noTime);
 const R=withTime.reduce((a,r)=>a+(r.revenue||0),0),C=withTime.reduce((a,r)=>a+r.cost,0),H=rows.reduce((a,r)=>a+r.hours,0),low=withTime.filter(r=>r.rate!=null&&r.rate<.35).length;
 const works=exc27().items.filter(w=>excYear27(w)===y).map(w=>{const t=state.time.filter(x=>x.exc===w.id),h=t.reduce((a,x)=>a+Number(x.hours||0),0),co=t.reduce((a,x)=>a+timeCost27(x),0);return {w,h,co,m:Number(w.fees||0)-co};}).filter(x=>x.h);
 const tag=(r)=>[r.noTime?'<span class="badge orange">pas de temps saisi</span>':'',r.incomplete?'<span class="badge orange">temps incomplets ?</span>':'',r.est?'<span class="badge blue" title="Coût horaire par défaut : collaborateur sans coût renseigné">coût estimé</span>':''].join(' ');
 return `<div class="titleRow"><div><h1>Rentabilité ${y}</h1><div class="sub">Période : 1er janvier – 31 décembre ${y}. Méthode : <b>${method==='billed'?'honoraires facturés dans Pennylane (hors travaux exceptionnels)':'budget contractuel (honoraires annuels du portefeuille, hors travaux exceptionnels)'}</b>. Marge sur coût du temps = honoraires − temps saisis × coût horaire en vigueur à la date du temps. Les dossiers sans temps saisi ne sont pas comptés dans la marge.</div></div>
 <div class="v25actions">${[y-1,y,y+1].map(v=>`<button class="btn small ${v===y?'':'secondary'}" onclick="state.profitY27=${v};save();render()">${v}</button>`).join('')}<select class="statusSelect" onchange="state.profitMethod27=this.value;save();render()"><option value="budget" ${method==='budget'?'selected':''}>Budget contractuel</option><option value="billed" ${method==='billed'?'selected':''} ${synced?'':'disabled'}>Facturé (Pennylane)${synced?'':' — non synchronisé'}</option></select></div></div>
 <div class="cards" style="grid-template-columns:repeat(4,1fr)"><div class="card"><small>Honoraires (dossiers avec temps)</small><span class="big">${euro(R)}</span></div><div class="card"><small>Coût du temps</small><span class="big">${euro(C)}</span><div class="sub">${H.toLocaleString('fr-FR')} h saisies</div></div><div class="card"><small>Marge sur coût du temps</small><span class="big ${R-C<0?'bad':'good'}">${euro(R-C)}</span><div class="sub">${R?Math.round((R-C)/R*100)+' %':'—'}</div></div><div class="card"><small>Dossiers sous 35 % · sans temps</small><span class="big ${low?'bad':'good'}">${low}</span><div class="sub">${rows.filter(r=>r.noTime).length} dossier(s) sans temps saisi</div></div></div>
 <div class="panel"><table><thead><tr><th>Client</th><th style="text-align:right">Honoraires</th><th style="text-align:right">Heures</th><th style="text-align:right">Budget heures</th><th style="text-align:right">Coût</th><th style="text-align:right">Marge</th><th style="text-align:right">Taux</th><th>Signalements</th></tr></thead><tbody>${rows.map(r=>`<tr><td><a href="#" onclick="event.preventDefault();openClient('${r.c.id}')"><b>${esc(r.c.name)}</b></a></td><td style="text-align:right">${r.revenue==null?'—':euro(r.revenue)}</td><td style="text-align:right">${r.hours.toLocaleString('fr-FR')} h</td><td style="text-align:right"><input class="mini" style="width:70px;text-align:right" type="number" value="${r.bh||''}" placeholder="—" onchange="setBudgetHours27('${r.c.id}',this.value)">${r.bh?` <span class="${r.hours>r.bh?'bad':'sub'}">${Math.round(r.hours/r.bh*100)} %</span>`:''}</td><td style="text-align:right">${euro(r.cost)}</td><td style="text-align:right" class="${r.margin<0?'bad':''}">${r.margin==null?'—':euro(r.margin)}</td><td style="text-align:right">${r.rate==null?'—':Math.round(r.rate*100)+' %'}</td><td>${tag(r)}</td></tr>`).join('')||'<tr><td colspan="8" class="sub">Aucun dossier.</td></tr>'}</tbody></table></div>
 ${works.length?`<div class="panel"><div class="panelHead"><h3>Travaux exceptionnels (comptés à part)</h3></div><table><thead><tr><th>Travail</th><th>Client</th><th style="text-align:right">Honoraires</th><th style="text-align:right">Heures</th><th style="text-align:right">Coût</th><th style="text-align:right">Marge</th></tr></thead><tbody>${works.map(x=>`<tr><td>${esc(x.w.name)}</td><td>${esc(cfind(x.w.client)?.name||'')}</td><td style="text-align:right">${euro(x.w.fees)}</td><td style="text-align:right">${x.h} h</td><td style="text-align:right">${euro(x.co)}</td><td style="text-align:right" class="${x.m<0?'bad':''}">${euro(x.m)}</td></tr>`).join('')}</tbody></table></div>`:''}`;
};

/* ---------- Charge prévisionnelle ---------- */
function absence27(m,ym){return Number(m.absences?.[ym]||0);}
function setAbsence27(id,ym,v){const m=persistMember27(id);if(!m)return;m.absences={...(m.absences||{}),[ym]:Number(v||0)};save();render();}
function forecast27(m,ym){
 const n=m.name.toLowerCase(),mine=state.clients.filter(c=>!['Inactif','À qualifier'].includes(c.status)&&inPeople27(c,m.name));
 let prod=0,review=0,missing=0;
 for(const c of mine){
  const bh=Number(c.budgetHours||0);if(!bh){missing++;continue;}
  const coll=splitNames27(people27(c,'collab')).map(x=>x.toLowerCase()),mgr=splitNames27(people27(c,'manager')).map(x=>x.toLowerCase()),month=bh/12;
  if(coll.includes(n))prod+=month*0.8/Math.max(1,coll.length);
  if(mgr.includes(n))review+=month*0.2/Math.max(1,mgr.length);
 }
 for(const w of exc27().items.filter(w=>w.statut!=='Terminé')){
  const done=state.time.filter(t=>t.exc===w.id).reduce((a,t)=>a+Number(t.hours||0),0);
  if(splitNames27(w.realise).some(x=>x.toLowerCase()===n)){if(w.time==null||w.time==='')missing++;else prod+=Math.max(0,Number(w.time)-done);}
  if(splitNames27(w.revu).some(x=>x.toLowerCase()===n)&&w.time)review+=Number(w.time)*0.1;
 }
 const consumed=state.time.filter(t=>(timeMember27(t)?.id===m.id||t.user===m.name)&&String(t.date).startsWith(ym)).reduce((a,t)=>a+Number(t.hours||0),0);
 const cap=Math.max(0,Number(m.capacity||0)-absence27(m,ym)*7);
 return {prod:Math.round(prod),review:Math.round(review),consumed,cap,missing,remaining:Math.max(0,Math.round(prod+review-consumed))};
}
const previousCapacityPage27=capacityPage27;
capacityPage27=function(){
 const ym=today27().slice(0,7),team=activeTeam27();
 const panel=`<div class="panel"><div class="panelHead"><h3>Prévisionnel de ${MONTHS27[Number(ym.slice(5))-1].toLowerCase()}</h3><span class="sub">Production = budget d’heures mensuel des dossiers (80 % répartis entre les collaborateurs) + travaux exceptionnels restants ; revue = 20 % pour le manager + 10 % des travaux revus. Capacité = capacité mensuelle − absences (7 h par jour).</span></div><table><thead><tr><th>Collaborateur</th><th style="text-align:right">Capacité</th><th style="text-align:right">Absences (j)</th><th style="text-align:right">Production prévue</th><th style="text-align:right">Revue prévue</th><th style="text-align:right">Déjà consommé</th><th style="text-align:right">Reste à faire</th><th>Charge</th><th>Estimations manquantes</th></tr></thead><tbody>${team.map(m=>{const f=forecast27(m,ym),u=f.cap?(f.prod+f.review)/f.cap:0;return `<tr><td><b>${esc(m.name)}</b></td><td style="text-align:right">${f.cap} h</td><td style="text-align:right"><input class="mini" type="number" min="0" max="23" style="width:56px;text-align:right" value="${absence27(m,ym)||''}" onchange="setAbsence27('${esc(m.id)}','${ym}',this.value)"></td><td style="text-align:right">${f.prod} h</td><td style="text-align:right">${f.review} h</td><td style="text-align:right">${f.consumed} h</td><td style="text-align:right">${f.remaining} h</td><td style="min-width:140px"><div class="onbProg27"><div class="bar27"><i style="width:${Math.min(100,u*100)}%;background:${u>1?C27.red:u>.85?C27.orange:C27.green}"></i></div><span>${Math.round(u*100)} %</span></div></td><td>${f.missing?`<span class="badge orange">${f.missing} sans budget d’heures</span>`:''}</td></tr>`;}).join('')}</tbody></table></div>`;
 return previousCapacityPage27().replace('<div class="panel">',panel+'<div class="panel">').replace('Les nouveaux noms des tableaux sont ajoutés automatiquement.','Les noms trouvés dans les tableaux sont proposés ici ; ils sont enregistrés dès qu’on les modifie.');
};

/* ---------- Revue annuelle des honoraires ---------- */
function feeReviewRows27(){
 const from=iso(addDays(new Date(),-365));
 return state.clients.filter(c=>c.status==='Actif').map(c=>{
  const t=state.time.filter(x=>x.client===c.id&&x.date>=from),h=t.reduce((a,x)=>a+Number(x.hours||0),0),cost=t.reduce((a,x)=>a+timeCost27(x),0);
  const fee=feeTotalClient(c)-Number(fees27(c).exceptional||0),rate=h?fee/h:null,margin=h&&fee?(fee-cost)/fee:null;
  const target=h&&cost?Math.ceil(cost/0.65/50)*50:null,up=target&&fee&&target>fee?Math.round((target/fee-1)*100):0;
  return {c,fee,h,cost,rate,margin,bh:Number(c.budgetHours||0),suggest:!h?'Temps non saisis : revue impossible':up?`Revoir à la hausse (≈ +${up} %, ${euro(target)} pour 35 % de marge)`:'Honoraires cohérents'};
 }).sort((a,b)=>(a.margin??9)-(b.margin??9));
}
function feeReviewPage27(){
 const rows=feeReviewRows27();
 return `<div class="titleRow"><div><h1>Revue des honoraires</h1><div class="sub">Douze derniers mois : honoraires annuels du dossier (budget), heures saisies et coût du temps. Base de discussion pour la revue annuelle, pas une décision automatique.</div></div><button class="btn small secondary" onclick="exportFeeReview27()">Exporter (Excel)</button></div>
 <div class="panel"><table><thead><tr><th>Client</th><th style="text-align:right">Honoraires annuels</th><th style="text-align:right">Budget heures</th><th style="text-align:right">Heures (12 mois)</th><th style="text-align:right">Taux horaire réalisé</th><th style="text-align:right">Marge sur coût du temps</th><th>Proposition</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b><a href="#" onclick="event.preventDefault();openClient('${r.c.id}')">${esc(r.c.name)}</a></b></td><td style="text-align:right">${euro(r.fee)}</td><td style="text-align:right">${r.bh||'—'}</td><td style="text-align:right">${r.h.toLocaleString('fr-FR')}</td><td style="text-align:right">${r.rate==null?'—':euro(r.rate)+' / h'}</td><td style="text-align:right" class="${r.margin!=null&&r.margin<.35?'bad':''}">${r.margin==null?'—':Math.round(r.margin*100)+' %'}</td><td class="sub">${esc(r.suggest)}</td></tr>`).join('')||'<tr><td colspan="7" class="sub">Aucun client actif.</td></tr>'}</tbody></table></div>`;
}
function exportFeeReview27(){const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';download25('Revue_honoraires_'+today27()+'.csv','﻿'+[['Client','Honoraires','Budget heures','Heures 12 mois','Taux horaire','Marge','Proposition'].map(q).join(';'),...feeReviewRows27().map(r=>[r.c.name,r.fee,r.bh,r.h,r.rate==null?'':Math.round(r.rate),r.margin==null?'':Math.round(r.margin*100)+' %',r.suggest].map(q).join(';'))].join('\n'),'text/csv');}

/* ---------- Qualité du portefeuille ---------- */
function qualityChecks27(){
 const act=state.clients.filter(c=>!['Inactif'].includes(c.status)),out=[];
 const add=(c,what,page)=>out.push({c,what,page});
 for(const c of act){
  if(c.status==='À qualifier')add(c,'Client créé par import, statut à qualifier','clients');
  if(!c.siren&&!profile27(c).regIdForeign&&profile27(c).kind!=='Création')add(c,'SIREN manquant','client');
  else if(c.siren&&!sirenValid27(sirenOf27(c.siren)))add(c,'SIREN invalide','client');
  if(!people27(c,'manager'))add(c,'Aucun manager','client');
  if(c.status==='Actif'&&ldm27(c)!=='Signée')add(c,'Lettre de mission non signée','onboarding');
  if(c.missions?.tax&&!['Mensuelle','Trimestrielle','Annuelle','Non soumis','Franchise'].includes(c.vatRegime))add(c,'Régime de TVA non défini','fiscal');
  if(c.status==='Actif'&&!['IS','IR'].includes(c.taxRegime))add(c,'Régime fiscal non défini','fiscal');
  if(c.status==='Actif'&&MISSIONS27.some(([k])=>c.missions?.[k])&&!feeTotalClient(c))add(c,'Missions sans honoraires','clients');
  if(c.status==='Actif'&&feeTotalClient(c)&&!Number(c.budgetHours||0))add(c,'Honoraires sans budget de temps','profit');
 }
 for(const w of exc27().items)if(w.included!=='Oui'&&!(Number(w.fees)>0)&&w.statut!=='Annulé'){const c=cfind(w.client);if(c)add(c,`Travail « ${w.name} » hors forfait sans accord tarifaire (honoraires non renseignés)`,'exceptional');}
 return out;
}
function qualityPage27(){
 const l=qualityChecks27(),by={};l.forEach(x=>{(by[x.what.replace(/«.*»/,'«…»')]=by[x.what.replace(/«.*»/,'«…»')]||[]).push(x);});
 return `<div class="titleRow"><div><h1>Qualité du portefeuille</h1><div class="sub">Contrôles automatiques des informations manquantes ou incohérentes. Chaque ligne ouvre l’écran où corriger.</div></div></div>
 <div class="cards" style="grid-template-columns:repeat(4,1fr)">${Object.entries(by).slice(0,8).map(([k,v])=>`<div class="card"><small>${esc(k)}</small><span class="big ${v.length?'warn':'good'}">${v.length}</span></div>`).join('')||'<div class="card"><small>Contrôles</small><span class="big good">0</span><div class="sub">Rien à signaler</div></div>'}</div>
 <div class="panel"><table><thead><tr><th>Client</th><th>Constat</th><th></th></tr></thead><tbody>${l.map(x=>`<tr><td><b>${esc(x.c.name)}</b></td><td>${esc(x.what)}</td><td><button class="btn small light" onclick="routePage('${x.page}','${x.c.id}')">Corriger</button></td></tr>`).join('')||'<tr><td colspan="3" class="sub">Aucun constat.</td></tr>'}</tbody></table></div>`;
}

/* ---------- Pennylane : état de la synchronisation ---------- */
function plStatusPanel27(){
 const s=state.pennylaneSync||{};
 return `<div class="panel"><div class="panelHead"><h2>Synchronisation Pennylane</h2></div><div class="panelBody">${s.lastSync?`Dernière synchronisation réussie : <b>${new Date(s.lastSync).toLocaleString('fr-FR')}</b>`:'Aucune synchronisation réussie'} · périmètre : factures clients du cabinet (lecture seule) · ${(state.pennylaneInvoices||[]).length} facture(s) connue(s)${s.error?`<div class="bad" style="margin-top:6px">Dernière erreur : ${esc(s.error)} — les données précédentes sont conservées.</div>`:''}</div></div>`;
}

/* ---------- Affichage ---------- */
const previousRenderPilot27=render;
render=function(){
 previousRenderPilot27();
 const root=document.getElementById('root');
 if(state.page==='feereview')root.innerHTML=feeReviewPage27();
 if(state.page==='quality')root.innerHTML=qualityPage27();
 if(state.page==='rules'&&!root.querySelector('.plStatus27')){const d=document.createElement('div');d.className='plStatus27';d.innerHTML=plStatusPanel27();root.prepend(d);}
 document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===state.page));
};
