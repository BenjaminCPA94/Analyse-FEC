/* RB Partners V27 — Clôture & Bilan : suivi des bilans et du juridique annuel par exercice.
 * Tout est calculé automatiquement à partir des fiches clients :
 *  - les dossiers de chaque exercice (missions « comptes annuels » et « juridique ») ;
 *  - les échéances (liasse, AGO dans les 6 mois, dépôt au greffe) ;
 *  - les retards et échéances proches, remontés dans le tableau de bord et « À traiter aujourd'hui » ;
 *  - la facturation du bilan et du juridique, lue dans les factures Pennylane du cabinet.
 * Le statut du juridique est partagé avec l'écran « Juridique annuel / AGO ». */
const BILAN_STEPS27=['À lancer','En production','En revue','Validé client','Liasse déposée'];
const JUR_STEPS27=['À préparer','Comptes approuvables','Pack AGO préparé','Pack validé','AGO signée','Comptes déposés'];
const INACTIVE27=['Perdu','Résilié','Archivé','Sorti','Inactif'];

function today27(){return iso(new Date());}
function addMonths27(d,n){const y=d.getFullYear(),m=d.getMonth()+n,last=new Date(y,m+1,0).getDate();return new Date(y,m,Math.min(d.getDate(),last));}
function daysBetween27(a,b){return Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/864e5);}
/* Liasse IS/IR : clôture au 31/12 → 2e jour ouvré après le 1er mai, + 15 jours de délai pour la télétransmission ;
 * autre clôture → 3 mois + 15 jours. Date indicative. */
function liasseDue27(cd){
 if(cd.getMonth()===11&&cd.getDate()===31){
  const d=new Date(cd.getFullYear()+1,4,1);let k=0;
  while(k<2){d.setDate(d.getDate()+1);const wd=d.getDay();if(wd!==0&&wd!==6&&!(d.getMonth()===4&&d.getDate()===8))k++;}
  return addDays(d,15);
 }
 return addDays(addMonths27(cd,3),15);
}
function suiviState27(){if(!state.suivi27)state.suivi27={};return state.suivi27;}
function suiviFilters27(){if(!state.suivi27f)state.suivi27f={year:new Date().getFullYear()-1,who:'Tous',view:'Tous',q:''};return state.suivi27f;}
function bilanBilled27(c,cd,category){
 const from=iso(cd),to=iso(addMonths27(cd,15));
 return (state.pennylaneInvoices||[]).filter(i=>i.source==='pennylane'&&i.client===c.id&&i.category===category&&i.status!=='Annulée'&&i.date>from&&i.date<=to).sort((a,b)=>a.date.localeCompare(b.date));
}
function urgency27(due,done,started){
 if(done||!started)return null;
 const n=daysBetween27(today27(),due);
 return n<0?{level:'retard',days:-n}:n<=30?{level:'proche',days:n}:null;
}

/* Une ligne de suivi pour un client et un exercice (année de clôture). */
function exercise27(c,y){
 if(!c||INACTIVE27.includes(c.status))return null;
 const needB=Boolean(c.missions?.annualAccounts),needJ=Boolean(c.missions?.legal);
 if(!needB&&!needJ)return null;
 const cd=closeDate(c,y),close=iso(cd),key=c.id+'|'+y;
 if(c.entry&&c.entry>iso(addMonths27(cd,12)))return null;
 const s=suiviState27()[key]||{},closed=close<today27();
 const bilan=needB?(s.bilan||(closed?'À lancer':'Exercice en cours')):null;
 const bilanDone=bilan==='Liasse déposée'||!needB;
 const l=state.legalV18?.[legalKeyV18(c.id,y)],stage=Math.min(5,l?.stage||0);
 const jurDone=!needJ||stage>=5;
 const jurReady=bilanDone||['Validé client','Liasse déposée'].includes(bilan);
 const liasse=iso(liasseDue27(cd)),ago=iso(addMonths27(cd,6)),depot=iso(addMonths27(cd,7));
 const synced=Boolean(state.pennylaneSync?.lastSync);
 const invB=needB?bilanBilled27(c,cd,'Bilan / clôture'):[],invJ=needJ?bilanBilled27(c,cd,'Juridique annuel'):[];
 return {c,y,key,close,closed,needB,needJ,bilan,bilanDone,stage,jur:needJ?JUR_STEPS27[stage]:null,jurDone,jurReady,liasse,ago,depot,
  jurDue:stage>=4?depot:ago,
  uB:needB?urgency27(liasse,bilanDone,closed):null,
  uJ:needJ?urgency27(stage>=4?depot:ago,jurDone,closed):null,
  invB,invJ,synced,
  notBilledB:needB&&synced&&bilan==='Liasse déposée'&&!invB.length,
  notBilledJ:needJ&&synced&&stage>=4&&!invJ.length,
  log:s.log||[]};
}
function exercises27(year){return state.clients.map(c=>exercise27(c,year)).filter(Boolean);}
/* Exercices surveillés par les alertes : N-1 et N. Les plus anciens se soldent par la reprise d'historique. */
function openYears27(){const y=new Date().getFullYear();return [y-1,y];}

/* ---------- Actions (horodatées automatiquement) ---------- */
function track27(cid,y,what,val){
 const s=suiviState27(),key=cid+'|'+y;if(!s[key])s[key]={};
 (s[key].log=s[key].log||[]).unshift({what,status:val,date:new Date().toISOString(),user:shared25.user?.username||state.currentUser||''});
 s[key].log=s[key].log.slice(0,30);
 log25(what+' : '+val,cid,'Exercice '+y);
}
function setBilan27(cid,y,val){
 const s=suiviState27(),key=cid+'|'+y;if(!s[key])s[key]={};
 s[key].bilan=val;track27(cid,y,'Bilan',val);
 if(val==='Liasse déposée')state.closing.filter(t=>t.client===cid&&t.year===Number(y)).forEach(t=>t.status='Terminée');
 const r=exercise27(cfind(cid),Number(y));
 persist25();
 if(val==='Liasse déposée')toast(r?.needJ?'Bilan terminé — le juridique est débloqué (AGO avant le '+datefr(r.ago)+')':'Bilan terminé');
}
function setJur27(cid,y,stage){
 stage=Number(stage);const l=legalStateV18(cid,Number(y));
 Object.assign(l,{stage,accountsValidated:stage>=1,packGenerated:stage>=2,packValidated:stage>=3,signed:stage>=4,filed:stage>=5,updated:new Date().toISOString()});
 track27(cid,y,'Juridique',JUR_STEPS27[stage]);persist25();
}
function closeYear27(year){
 const open=exercises27(year).filter(r=>r.closed&&(!r.bilanDone||!r.jurDone));
 if(!open.length)return toast('Tous les dossiers de l’exercice '+year+' sont déjà terminés.');
 if(!confirm(`Reprise d’historique : marquer ${open.length} dossier(s) de l’exercice ${year} comme terminés (liasse déposée et comptes déposés) ?\nÀ utiliser pour les exercices déjà traités avant la mise en service du CRM.`))return;
 for(const r of open){
  if(r.needB&&!r.bilanDone){const s=suiviState27();if(!s[r.key])s[r.key]={};s[r.key].bilan='Liasse déposée';state.closing.filter(t=>t.client===r.c.id&&t.year===year).forEach(t=>t.status='Terminée');}
  if(r.needJ&&!r.jurDone)Object.assign(legalStateV18(r.c.id,year),{stage:5,accountsValidated:true,packGenerated:true,packValidated:true,signed:true,filed:true,updated:new Date().toISOString()});
  track27(r.c.id,year,'Reprise d’historique','Terminé');
 }
 persist25();toast(open.length+' dossier(s) de l’exercice '+year+' marqué(s) terminés');
}
function setSuiviFilter27(k,v){suiviFilters27()[k]=k==='year'?Number(v):v;save();render();}

/* ---------- Écran ---------- */
function dueBadge27(due,u,done,label){
 if(done)return `<span class="badge green">${label?esc(label):'Terminé'}</span>`;
 const t=`<div class="sub">${datefr(due)}</div>`;
 if(!u)return t;
 return `<span class="badge ${u.level==='retard'?'red':'orange'}">${u.level==='retard'?'Retard '+u.days+' j':'J-'+u.days}</span>`+t;
}
function billedCell27(list,needed,done,synced){
 if(!needed)return '<span class="sub">—</span>';
 if(list.length)return `<span class="badge green">Facturé</span><div class="sub">${esc(list[0].number||'')} · ${datefr(list[0].date)}</div>`;
 if(!synced)return '<span class="sub">Synchro Pennylane à venir</span>';
 return done?'<span class="badge red">Non facturé</span>':'<span class="sub">Pas encore</span>';
}
function suiviRow27(r,showYear){
 const c=r.c,last=r.log[0];
 const bilanCell=!r.needB?'<span class="badge gray">Non concerné</span>':!r.closed&&!suiviState27()[r.key]?.bilan?`<span class="badge gray">Exercice en cours</span><div class="sub">clôture dans ${daysBetween27(today27(),r.close)} j</div>`:
  `<select class="statusSelect" onchange="setBilan27('${c.id}',${r.y},this.value)">${BILAN_STEPS27.map(s=>`<option ${s===r.bilan?'selected':''}>${s}</option>`).join('')}</select>`;
 const jurCell=!r.needJ?'<span class="badge gray">Non concerné</span>':!r.jurReady&&r.stage===0?`<span class="badge gray">En attente du bilan</span>`:
  `<select class="statusSelect" onchange="setJur27('${c.id}',${r.y},this.value)">${JUR_STEPS27.map((s,i)=>`<option value="${i}" ${i===r.stage?'selected':''}>${s}</option>`).join('')}</select>`;
 return `<tr${r.uB?.level==='retard'||r.uJ?.level==='retard'?' style="background:#fff6f7"':''}>
  <td><b><a href="#" onclick="event.preventDefault();openClient('${c.id}')">${esc(c.name)}</a></b><div class="sub">${showYear?'Exercice '+r.y+' · ':''}${esc(c.legalForm||'')} · clôture ${datefr(r.close)}</div><div class="sub">${esc(c.manager||'')}${c.collab&&c.collab!==c.manager?' / '+esc(c.collab):''}</div></td>
  <td>${bilanCell}</td><td>${r.needB&&r.closed?dueBadge27(r.liasse,r.uB,r.bilanDone,'Liasse déposée'):r.needB?`<div class="sub">${datefr(r.liasse)}</div>`:''}</td>
  <td>${jurCell}</td><td>${r.needJ&&r.closed?dueBadge27(r.jurDue,r.uJ,r.jurDone,'Comptes déposés')+`<div class="sub">${r.stage>=4?'dépôt greffe':'AGO'}</div>`:r.needJ?`<div class="sub">AGO ${datefr(r.ago)}</div>`:''}</td>
  <td>${r.needB?`<div><span class="sub">Bilan :</span> ${billedCell27(r.invB,true,r.bilan==='Liasse déposée',r.synced)}</div>`:''}${r.needJ?`<div style="margin-top:4px"><span class="sub">Juridique :</span> ${billedCell27(r.invJ,true,r.stage>=4,r.synced)}</div>`:''}</td>
  <td>${last?`<div class="sub">${esc(last.what)} → ${esc(last.status)}</div><div class="sub">${esc(last.user)} · ${new Date(last.date).toLocaleDateString('fr-FR')}</div>`:'<span class="sub">—</span>'}</td></tr>`;
}
const SUIVI_HEAD27='<thead><tr><th>Dossier</th><th>Bilan</th><th>Échéance liasse</th><th>Juridique</th><th>Échéance AGO / dépôt</th><th>Facturation (Pennylane)</th><th>Dernière mise à jour</th></tr></thead>';

function suiviPage27(){
 const f=suiviFilters27(),all=exercises27(f.year),q=(f.q||'').toLowerCase();
 const people=[...new Set(state.clients.flatMap(c=>[c.manager,c.collab]).filter(Boolean))].sort();
 const rows=all.filter(r=>(f.who==='Tous'||r.c.manager===f.who||r.c.collab===f.who)
  &&(!q||r.c.name.toLowerCase().includes(q)||(r.c.siren||'').includes(q))
  &&(f.view==='Tous'||(f.view==='Retard'&&(r.uB?.level==='retard'||r.uJ?.level==='retard'))||(f.view==='À faire'&&(!r.bilanDone||!r.jurDone))||(f.view==='Terminés'&&r.bilanDone&&r.jurDone)||(f.view==='Non facturés'&&(r.notBilledB||r.notBilledJ))))
  .sort((a,b)=>(a.bilanDone&&a.jurDone)-(b.bilanDone&&b.jurDone)||(a.closed?a.liasse:'9').localeCompare(b.closed?b.liasse:'9')||a.c.name.localeCompare(b.c.name));
 const nb=all.filter(r=>r.needB),nj=all.filter(r=>r.needJ);
 const card=(label,v,cls='',sub='')=>`<div class="card"><small>${label}</small><span class="big ${cls}">${v}</span>${sub?`<div class="sub">${sub}</div>`:''}</div>`;
 const lateB=nb.filter(r=>r.uB?.level==='retard').length,lateJ=nj.filter(r=>r.uJ?.level==='retard').length,unbilled=all.filter(r=>r.notBilledB||r.notBilledJ).length;
 const upcoming=openYears27().flatMap(exercises27).flatMap(r=>[r.uB&&{r,kind:'Liasse',due:r.liasse,u:r.uB},r.uJ&&{r,kind:r.stage>=4?'Dépôt greffe':'AGO',due:r.jurDue,u:r.uJ}].filter(Boolean)).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,8);
 return `<div class="titleRow"><div><h1>Clôture & Bilan</h1><div class="sub">Suivi des bilans et du juridique annuel par exercice. Les dossiers, échéances, alertes et la facturation sont calculés automatiquement.</div></div>
  <div class="v25actions">${[-2,-1,0,1].map(d=>new Date().getFullYear()+d).map(y=>`<button class="btn small ${y===f.year?'':'secondary'}" onclick="setSuiviFilter27('year',${y})">Exercice ${y}</button>`).join('')}${f.year<new Date().getFullYear()&&all.some(r=>r.closed&&(!r.bilanDone||!r.jurDone))?`<button class="btn small light" onclick="closeYear27(${f.year})" title="Pour les exercices déjà traités avant la mise en service du CRM">Reprise d’historique ${f.year}</button>`:''}</div></div>
 <div class="cards" style="grid-template-columns:repeat(6,1fr)">${card('Dossiers de l’exercice',all.length)}${card('Bilans terminés',nb.filter(r=>r.bilanDone).length+' / '+nb.length,'good')}${card('Bilans en retard',lateB,lateB?'bad':'good')}${card('Juridiques terminés',nj.filter(r=>r.jurDone).length+' / '+nj.length,'good')}${card('Juridiques en retard',lateJ,lateJ?'bad':'good')}${card('Terminés non facturés',unbilled,unbilled?'warn':'good',state.pennylaneSync?.lastSync?'':'synchro Pennylane à venir')}</div>
 ${upcoming.length?`<div class="panel"><div class="panelHead"><h3>Prochaines échéances (tous exercices)</h3><span class="sub">Retards et échéances à 30 jours</span></div><div class="panelBody">${upcoming.map(x=>`<div class="kpiLine"><span><b>${esc(x.r.c.name)}</b> · ${x.kind} exercice ${x.r.y}</span><span><span class="badge ${x.u.level==='retard'?'red':'orange'}">${x.u.level==='retard'?'Retard '+x.u.days+' j':'J-'+x.u.days}</span> ${datefr(x.due)}</span></div>`).join('')}</div></div>`:''}
 <div class="panel"><div class="panelHead"><h3>Dossiers — exercice ${f.year}</h3><div class="v25actions">
  <input class="mini" style="width:220px" placeholder="Rechercher client / SIREN" value="${esc(f.q||'')}" onchange="setSuiviFilter27('q',this.value)">
  <select class="statusSelect" onchange="setSuiviFilter27('who',this.value)"><option>Tous</option>${people.map(p=>`<option ${p===f.who?'selected':''}>${esc(p)}</option>`).join('')}</select>
  <select class="statusSelect" onchange="setSuiviFilter27('view',this.value)">${['Tous','À faire','Retard','Terminés','Non facturés'].map(v=>`<option ${v===f.view?'selected':''}>${v}</option>`).join('')}</select></div></div>
  <table>${SUIVI_HEAD27}<tbody>${rows.map(r=>suiviRow27(r,false)).join('')||'<tr><td colspan="7">Aucun dossier pour ces critères. Les dossiers apparaissent automatiquement dès qu’une fiche client a la mission « comptes annuels » ou « juridique ».</td></tr>'}</tbody></table></div>
 <div class="info"><b>Règles automatiques :</b> les alertes portent sur les exercices ${openYears27().join(' et ')} (utilise « Reprise d’historique » pour solder un exercice traité avant le CRM) ; liasse au 2<sup>e</sup> jour ouvré après le 1<sup>er</sup> mai + 15 jours pour une clôture au 31/12, sinon 3 mois + 15 jours ; AGO dans les 6 mois de la clôture ; dépôt au greffe dans le mois suivant (dates indicatives à confirmer selon le dossier). Le juridique se débloque quand le bilan est validé par le client. Un bilan ou un juridique terminé sans facture Pennylane correspondante est signalé. La production (saisie, rapprochements, lettrage) se fait dans l’outil de production.</div>`;
}
function clientSuivi27(c){
 const y=new Date().getFullYear(),rows=[y+1,y,y-1,y-2].map(x=>exercise27(c,x)).filter(Boolean);
 return `<div class="panel"><div class="panelHead"><h3>Bilans et juridique par exercice</h3><button class="btn small light" onclick="routePage('closing')">Voir tout le portefeuille</button></div><table>${SUIVI_HEAD27}<tbody>${rows.map(r=>suiviRow27(r,true)).join('')||'<tr><td colspan="7">Ni mission comptes annuels ni mission juridique sur ce dossier.</td></tr>'}</tbody></table></div>`;
}

/* ---------- Alertes automatiques ---------- */
function suiviAlerts27(){
 return openYears27().flatMap(exercises27).flatMap(r=>{
  const out=[],c=r.c;
  if(r.uB)out.push({kind:'B',r,u:r.uB,title:(r.uB.level==='retard'?'Liasse en retard':'Liasse à déposer')+' — exercice '+r.y,detail:`${r.bilan} · échéance ${datefr(r.liasse)}`});
  if(r.uJ)out.push({kind:'J',r,u:r.uJ,title:(r.uJ.level==='retard'?(r.stage>=4?'Dépôt des comptes en retard':'AGO en retard'):(r.stage>=4?'Dépôt des comptes à faire':'AGO à tenir'))+' — exercice '+r.y,detail:`${r.jur} · échéance ${datefr(r.jurDue)}`});
  if(r.notBilledB)out.push({kind:'FB',r,u:null,title:'Bilan '+r.y+' terminé non facturé',detail:'Aucune facture « bilan / clôture » trouvée dans Pennylane après la clôture.'});
  if(r.notBilledJ)out.push({kind:'FJ',r,u:null,title:'Juridique '+r.y+' terminé non facturé',detail:'Aucune facture « juridique » trouvée dans Pennylane après la clôture.'});
  return out;
 });
}
const previousExceptions27=deriveExceptionsV18;
deriveExceptionsV18=function(){
 const t=today27();
 const base=previousExceptions27().filter(x=>!['Juridique','Clôture','Recouvrement'].includes(x.area));
 // Factures échues : comparées à la date du jour (la maquette utilisait une date figée).
 state.invoices.filter(i=>Number(i.paid||0)<Number(i.amount||0)&&i.due&&i.due<t).forEach(i=>base.push({id:exceptionId(['AR',i.id]),area:'Recouvrement',client:i.client,severity:'À vérifier',title:'Facture échue non réglée',detail:`${i.label} · solde ${euro(i.amount-i.paid)}`,amount:i.amount-i.paid,auto:true,action:'billing',owner:cfind(i.client)?.manager||''}));
 suiviAlerts27().forEach(a=>base.push({id:exceptionId(['SUIVI',a.kind,a.r.c.id,a.r.y]),area:a.kind.startsWith('F')?'Facturation':a.kind==='B'?'Clôture':'Juridique',client:a.r.c.id,severity:a.u?.level==='retard'?'Critique':'À vérifier',title:a.title,detail:a.detail,auto:true,action:a.kind.startsWith('F')?'fees':'closing',owner:a.r.c.manager||''}));
 return base.filter(x=>!state.v18.resolved[x.id]);
};
const previousAlerts27=deriveAlerts;
deriveAlerts=function(){
 const out=previousAlerts27();
 suiviAlerts27().filter(a=>a.u?.level==='retard'||a.kind.startsWith('F')).forEach(a=>out.push({level:a.u?.level==='retard'?'critical':'warning',client:a.r.c.id,title:`${a.r.c.name} — ${a.title}`,body:a.detail,action:'closing'}));
 return out;
};

/* ---------- Branchement ---------- */
const previousRenderSuivi27=render;
render=function(){
 previousRenderSuivi27();
 if(state.page!=='closing')return;
 const root=document.getElementById('root');
 [...root.children].forEach(el=>{if((el.tagName==='BUTTON'&&el.textContent==='Contrôler une balance importée')||(el.classList.contains('note')&&el.textContent.startsWith('Module historique')))el.remove();});
};
closingPageV19=suiviPage27;
clientClosingWorkspace=clientSuivi27;
