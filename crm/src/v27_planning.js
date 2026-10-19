/* RB Partners V27 — Mon travail : planning d'équipe (inspiré du tableau Monday « Équipe – Planning »).
 * Quatre groupes : Onboarding, Travaux annuels (Bilan + AGO), Travaux courants (récurrents), Travaux exceptionnels,
 * puis « Fait ». Chaque tâche : client, manager, collaborateur, statut, début / fin, récurrence, temps passé, priorité,
 * honoraires, à facturer, facturation.
 * Automatisations avec les autres onglets :
 *  - client choisi : SIREN, manager et collaborateur repris de la fiche ;
 *  - travaux exceptionnels : la tâche crée et tient à jour le travail exceptionnel (nom, honoraires, statut, échéance,
 *    « Lancer facturation ») → Travaux exceptionnels et Facturation ;
 *  - travaux annuels : la tâche est reliée au Bilan ou à l'AGO de l'exercice ; « À facturer » met à jour
 *    « Lancer facturation » du tableau, « Fait » termine le Bilan / l'AGO ; l'avancement du tableau est affiché ;
 *  - onboarding : avancement de l'onboarding du client affiché ;
 *  - autre tâche « À facturer = Oui » terminée : travail exceptionnel « Lancer facturation = Oui » → Facturation ;
 *  - temps passé : une saisie de temps reliée (Saisie des temps, Rentabilité, Charge équipe) ;
 *  - récurrence : la tâche terminée est recréée à l'échéance suivante ;
 *  - import d'un planning Monday (Excel). Données partagées : state.myTasks27 ; filtres personnels : work27. */
const PL_SECTIONS27=[['onb','I. Onboarding','#7e5bef'],['annual','II. Travaux annuels (Bilan + AGO)','#1768c6'],['current','III. Travaux courants (à échéance répétitive)','#f08a3c'],['exc','IV. Travaux exceptionnels','#0f9d74']];
const PL_STATUS27=['A faire','En cours','Bloqué','Validation client','Fait','Annulée'];
const PL_STATUS_COLOR27={'A faire':'#8a94a6','En cours':'#f0a43c','Bloqué':'#e0364f','Validation client':'#9b51e0','Fait':'#17a673','Annulée':'#5b6472'};
const PL_PRIO27=['','Critique','Haute','Moyenne','Basse'];
const PL_PRIO_COLOR27={Critique:'#c4162a',Haute:'#e0364f',Moyenne:'#f0a43c',Basse:'#6b9bd2'};
const PL_REC27=['Non','Hebdomadaire','Mensuelle','Trimestrielle','Annuelle'];
const PL_BILL27=['À définir','Oui','Non'];
const PL_EXC_STATUS27={'A faire':'A faire','En cours':'En cours','Bloqué':'A revoir','Validation client':'En attente client','Fait':'Terminé','Annulée':'A revoir'};
const PL_TIME_MISSION27={onb:'Onboarding',current:'Compta courante',exc:'Travail exceptionnel'};

/* ---------- Données ---------- */
function plItems27(){return myTasks27().items;}
// Reprise des tâches créées avec la première version de « Mon travail » (liste du jour).
function plMigrate27(){
 let n=0;
 for(const t of plItems27()){
  if(t.section)continue;n++;
  t.section=t.exc||t.billing==='À facturer'?'exc':'current';
  t.status={'À faire':'A faire','En cours':'En cours','Fait':'Fait'}[t.status]||t.status||'A faire';
  t.end=t.end||t.date||'';t.collab=t.collab||t.owner||'';t.fees=t.fees??t.amount??'';
  t.bill=t.bill||({'À facturer':'Oui','Déjà facturé':'Oui','Non facturable':'Non'}[t.billing]||'À définir');
  delete t.billing;delete t.amount;delete t.owner;delete t.date;
 }
 return n;
}
function plTask27(id){return plItems27().find(t=>t.id===id);}
function plDone27(t){return ['Fait','Annulée'].includes(t.status);}
function plKey27(t){if(t.section!=='annual'||!t.client||!t.year)return '';return (t.mission==='AGO'?'J|':'B|')+t.client+'|'+t.year;}
function plBillKey27(t){return t.section==='annual'?plKey27(t):t.exc?'X|'+t.exc:'';}
function plNames27(s){return String(s||'').split(',').map(x=>x.trim()).filter(Boolean);}
function plMine27(t,who){if(!who)return true;const w=who.toLowerCase();return [...plNames27(t.manager),...plNames27(t.collab)].some(n=>n.toLowerCase()===w);}

/* ---------- Automatisations ---------- */
function plSyncExc27(t){
 if(!t.client)return;
 let w=t.exc&&exc27().items.find(x=>x.id===t.exc);
 const want=t.section==='exc'||(t.bill==='Oui'&&t.status==='Fait'&&t.section!=='annual');
 if(!w&&!want)return;
 // Travail exceptionnel déjà saisi pour ce client sous le même nom : relié, jamais dupliqué.
 if(!w){const n=norm27(t.title),used=new Set(plItems27().map(o=>o.exc).filter(Boolean));w=exc27().items.find(x=>x.client===t.client&&!used.has(x.id)&&norm27(x.name||'')&&(norm27(x.name)===n||n.endsWith(norm27(x.name))));if(w){t.exc=w.id;w.fromTask=t.id;}}
 if(!w){const c=cfind(t.client);w={id:uid('EX'),client:t.client,name:t.title,typo:t.section==='exc'?'Juridique':'Autre',fees:0,date:(t.start||t.createdAt||today27()).slice(0,10),deadline:'',realise:'',time:'',desc:'Tâche du planning (Mon travail)',associe:c?people27(c,'associe'):'',statut:'A faire',fromTask:t.id};exc27().items.push(w);t.exc=w.id;log25('Planning · travail exceptionnel créé',t.client,t.title);}
 Object.assign(w,{client:t.client,name:t.title,fees:Number(t.fees||0),deadline:t.end||'',realise:t.collab||'',statut:PL_EXC_STATUS27[t.status]||w.statut,lancerFact:t.bill==='Oui'?'Oui':t.bill==='Non'?'Non':(w.lancerFact||'')});
 if(t.status==='Fait')w.doneAt=w.doneAt||today27();
 if(t.time!==''&&t.time!=null)w.time=Number(t.time)||'';
}
function plSyncAnnual27(t,k){
 if(t.section!=='annual'||!t.client||!t.year)return;
 const kind=t.mission==='AGO'?'ago':'bilan',r=row27(kind,t.client,Number(t.year),true);
 if(t.bill==='Oui')r.lancerFact='Oui';else if(t.bill==='Non')r.lancerFact='Non';
 if(k==='status'&&t.status==='Fait'){
  if(kind==='bilan'){r.afaire=r.afaire||'Oui';if(!/^9\./.test(r.etat||''))r.etat=BILAN_ETATS27[BILAN_ETATS27.length-1];}
  else{r.juridique=r.juridique||'Oui';if(!/^7\./.test(r.statut||''))r.statut='7. Validé par le greffe';}
  log25('Planning · '+(kind==='bilan'?'Bilan':'AGO')+' '+t.year+' terminé',t.client,t.title);
 }
}
function plSyncTime27(t){
 const h=Number(String(t.time??'').replace(',','.'))||0;let e=t.timeId&&state.time.find(x=>x.id===t.timeId);
 if(!h){if(e){state.time=state.time.filter(x=>x!==e);t.timeId='';}return;}
 const who=plNames27(t.collab)[0]||plNames27(t.manager)[0]||me27(),mem=typeof memberOf27==='function'?memberOf27(who):null;
 const mission=t.section==='annual'?(t.mission==='AGO'?'Juridique / AGO':'Bilan'):PL_TIME_MISSION27[t.section]||'Autre';
 if(!e){e={id:uid('T'),created:new Date().toISOString(),fromTask:t.id};state.time.unshift(e);t.timeId=e.id;}
 Object.assign(e,{date:(t.end&&t.end<=today27()?t.end:today27()),user:mem?.name||who,memberId:mem?.id||'',client:t.client||'',mission,exc:t.exc||'',hours:h,note:'Planning : '+t.title});
}
function plNextDate27(d,rec){
 if(!d)return '';const x=new Date(d+'T12:00:00');
 // Fin de mois conservée : 31/01 → 28/02 (ou 29/02), jamais 03/03.
 const addM=m=>{const d0=x.getDate();x.setDate(1);x.setMonth(x.getMonth()+m);x.setDate(Math.min(d0,new Date(x.getFullYear(),x.getMonth()+1,0).getDate()));};
 if(rec==='Hebdomadaire')x.setDate(x.getDate()+7);else if(rec==='Mensuelle')addM(1);else if(rec==='Trimestrielle')addM(3);else if(rec==='Annuelle')addM(12);
 return iso(x);
}
function plRecur27(t){
 if(!t.recurrence||t.recurrence==='Non'||t.next)return;
 const n={...t,id:uid('MT'),status:'A faire',start:plNextDate27(t.start,t.recurrence),end:plNextDate27(t.end||today27(),t.recurrence),time:'',timeId:'',exc:'',doneAt:'',next:'',createdAt:new Date().toISOString(),prev:t.id};
 if(n.section==='annual'&&n.year&&t.recurrence==='Annuelle')n.year=Number(n.year)+1;
 plItems27().push(n);t.next=n.id;
 toast('Tâche récurrente : prochaine occurrence créée pour le '+datefr(n.end));
}
function plApply27(t,k){
 if(k==='status')t.doneAt=plDone27(t)?(t.doneAt||today27()):'';
 if(k==='client'){const c=cfind(t.client);if(c){t.manager=t.manager||people27(c,'manager');t.collab=t.collab||people27(c,'collab');}}
 plSyncAnnual27(t,k);plSyncExc27(t);
 if(['time','collab','client','status','mission','section','end'].includes(k))plSyncTime27(t);
 if(k==='status'&&t.status==='Fait')plRecur27(t);
}

/* ---------- Saisie ---------- */
function plAdd27(sec){
 const g=k=>document.getElementById(`pl27_${k}_${sec}`)?.value.trim()||'',title=g('title');if(!title)return toast('Écris la tâche.');
 const name=g('client'),c=name?plClientByName27(name):null;
 if(name&&!c)return toast('Dossier introuvable : choisis-le dans la liste (ou laisse vide pour une tâche interne).');
 const p=workPrefs27(),me=me27(),y=new Date().getFullYear()-1;
 const t={id:uid('MT'),section:sec,title,client:c?.id||'',manager:c?people27(c,'manager'):'',collab:p.pwho||me||'',status:'A faire',start:'',end:g('end')||'',recurrence:sec==='current'?'Mensuelle':'Non',time:'',priority:'',fees:'',bill:'À définir',createdAt:new Date().toISOString(),by:shared25.user?.username||''};
 if(sec==='annual'){t.mission=/\bAGO\b|juridique/i.test(title)?'AGO':'Bilan';t.year=y;if(c)t.fees=(t.mission==='AGO'?fees27(c).legalAnnual:fees27(c).annualAccounts)||'';}
 if(c&&!t.collab)t.collab=people27(c,'collab');
 plItems27().push(t);plApply27(t,'client');log25('Planning · tâche ajoutée',t.client,title);save();render();
 document.getElementById('pl27_title_'+sec)?.focus();
}
function plClientByName27(name){const k=nameKey27(name);return state.clients.find(c=>c.name.toLowerCase()===name.toLowerCase())||state.clients.find(c=>nameKey27(c.name)===k);}
function plSet27(id,k,v){
 const t=plTask27(id);if(!t)return;
 if(k==='client'){const c=v?plClientByName27(v):null;if(v&&!c)return toast('Dossier introuvable : choisis-le dans la liste.');v=c?.id||'';}
 if(['fees','time','year'].includes(k))v=v===''?'':Number(String(v).replace(',','.'));
 t[k]=v;plApply27(t,k);save();render();
 if(k==='status'&&v==='Fait'&&t.bill==='Oui'&&!t.client)toast('Tâche sans dossier : rattache-la à un client pour qu’elle passe en facturation.');
}
function plDel27(id){
 const t=plTask27(id);if(!t)return;
 if(!confirm(`Supprimer la tâche « ${t.title} » ?${t.exc?'\nLe travail exceptionnel lié reste dans Travaux exceptionnels.':''}${t.timeId?'\nLe temps saisi lié est supprimé.':''}`))return;
 if(t.timeId)state.time=state.time.filter(x=>x.id!==t.timeId);
 myTasks27().items=plItems27().filter(x=>x.id!==id);save();render();
}

/* ---------- Affichage ---------- */
function plBillCell27(t){
 const key=plBillKey27(t);
 if(t.bill==='Non')return '<span class="sub">Non facturable</span>';
 if(!key)return t.bill==='Oui'?`<span class="sub">${t.client?'à la fin de la tâche':'dossier à indiquer'}</span>`:'<span class="sub">—</span>';
 const s=billState27(key);
 return `<span class="pl27badge" style="background:${/^Facturé/.test(s.label)?'#17a673':s.label==='Partiellement facturé'?'#f0a43c':'#e0364f'}">${esc(s.label)}</span>`;
}
function plLinkCell27(t){
 const c=cfind(t.client);if(!c)return '';
 if(t.section==='annual'&&t.year){const x=ctx27(t.mission==='AGO'?'ago':'bilan',c,Number(t.year)),v=t.mission==='AGO'?val27(x,'statut'):val27(x,'etat');return `<div class="sub" title="Avancement du tableau ${t.mission} ${t.year}">${esc(t.mission)} ${t.year} : ${esc(v||'—')}</div>`;}
 if(t.section==='onb'&&typeof onbProgress27==='function'&&isOnboarding27(c))return `<div class="sub">Onboarding ${onbProgress27(c).label}</div>`;
 if(t.exc)return '<div class="sub">→ Travaux exceptionnels</div>';
 return '';
}
function plRow27(t){
 const c=cfind(t.client),late=!plDone27(t)&&t.end&&t.end<today27(),sel=(k,o,v,w)=>`<select class="cell27" style="${w?'width:'+w+'px':''}" onchange="plSet27('${t.id}','${k}',this.value)">${o.map(x=>`<option value="${esc(x)}" ${x===(v??'')?'selected':''}>${esc(x||'—')}</option>`).join('')}</select>`;
 const inp=(k,type,w,ph='')=>`<input class="cell27" type="${type}" style="width:${w}px" value="${esc(t[k]??'')}" placeholder="${ph}" onchange="plSet27('${t.id}','${k}',this.value)">`;
 return `<tr class="${plDone27(t)?'pl27done':''}">
  <td class="pl27name"><input class="cell27 pl27title" value="${esc(t.title)}" onchange="plSet27('${t.id}','title',this.value)">${t.section==='annual'?`<div class="pl27sub">${sel('mission',['Bilan','AGO'],t.mission,80)}<input class="cell27" type="number" style="width:70px" value="${esc(t.year??'')}" title="Exercice" onchange="plSet27('${t.id}','year',this.value)"></div>`:''}</td>
  <td style="min-width:170px"><input class="cell27" list="pl27_clients" value="${esc(c?.name||t.clientLabel||'')}" placeholder="Interne" onchange="plSet27('${t.id}','client',this.value)">${plLinkCell27(t)}</td>
  <td class="sub" style="white-space:nowrap">${esc(c?.siren||'')}</td>
  <td>${inp('manager','text',120)}</td><td>${inp('collab','text',140)}</td>
  <td><select class="pl27pill" style="background:${PL_STATUS_COLOR27[t.status]||'#8a94a6'}" onchange="plSet27('${t.id}','status',this.value)">${PL_STATUS27.map(x=>`<option ${x===t.status?'selected':''}>${x}</option>`).join('')}</select></td>
  <td>${inp('start','date',130)}</td><td class="${late?'pl27late':''}">${inp('end','date',130)}</td>
  <td>${sel('recurrence',PL_REC27,t.recurrence||'Non',115)}</td>
  <td>${inp('time','number',70,'h')}</td>
  <td><select class="pl27pill" style="background:${PL_PRIO_COLOR27[t.priority]||'#c9ced8'}" onchange="plSet27('${t.id}','priority',this.value)">${PL_PRIO27.map(x=>`<option value="${x}" ${x===(t.priority||'')?'selected':''}>${x||'—'}</option>`).join('')}</select></td>
  <td>${inp('fees','number',90,'HT')}</td>
  <td>${sel('bill',PL_BILL27,t.bill||'À définir',105)}</td>
  <td style="min-width:130px">${plBillCell27(t)}</td>
  <td class="sub" style="white-space:nowrap">${t.createdAt?datefr(t.createdAt.slice(0,10)):''}${t.doneAt?' → '+datefr(t.doneAt):''}</td>
  <td><button class="btn small light pf27del" title="Supprimer la tâche" onclick="plDel27('${t.id}')">✕</button></td></tr>`;
}
const PL_HEAD27='<tr><th class="pl27name">Tâche</th><th>Client</th><th>SIREN</th><th>Manager</th><th>Collaborateur</th><th>Statut</th><th>Début</th><th>Échéance</th><th>Récurrence</th><th>Temps (h)</th><th>Priorité</th><th>Honoraires HT</th><th>À facturer</th><th>Facturation</th><th>Création → fin</th><th></th></tr>';
function planningPage27(){
 if(plMigrate27())save();
 const p=workPrefs27(),me=me27(),who=p.pwho==null?me:p.pwho,q=(p.pq||'').toLowerCase(),coll=p.pcoll||{};
 const people=[...new Set(activeTeam27().map(m=>m.name))];
 const match=t=>plMine27(t,who)&&(!q||[t.title,cfind(t.client)?.name,t.clientLabel].some(v=>String(v||'').toLowerCase().includes(q)));
 const all=plItems27().filter(match),open=all.filter(t=>!plDone27(t)),done=all.filter(plDone27);
 const sortOpen=(a,b)=>(PL_PRIO27.indexOf(a.priority||'')||9)-(PL_PRIO27.indexOf(b.priority||'')||9)||String(a.end||'9999').localeCompare(String(b.end||'9999'));
 const late=open.filter(t=>t.end&&t.end<today27()).length,week=open.filter(t=>t.end&&t.end>=today27()&&t.end<=iso(addDays(new Date(),7))).length;
 const bill=open.concat(done).filter(t=>t.bill==='Oui'&&plBillKey27(t)&&!/^Facturé/.test(billState27(plBillKey27(t)).label)).reduce((s,t)=>s+Number(t.fees||0),0);
 const group=([k,label,color])=>{const list=open.filter(t=>t.section===k).sort(sortOpen),hidden=coll[k];return `<div class="pl27grp" style="--g:${color}"><div class="pl27gh" onclick="plToggle27('${k}')"><span>${hidden?'▸':'▾'}</span><b>${esc(label)}</b><span class="sub">${list.length} tâche(s)${list.some(t=>t.end&&t.end<today27())?` · <span class="bad">${list.filter(t=>t.end&&t.end<today27()).length} en retard</span>`:''}</span></div>
  ${hidden?'':`<div class="board27 pl27board" data-k="pl_${k}"><table><thead>${PL_HEAD27}</thead><tbody>${list.map(plRow27).join('')}
  <tr class="pl27add"><td class="pl27name"><input id="pl27_title_${k}" placeholder="+ Ajouter une tâche" onkeydown="if(event.key==='Enter')plAdd27('${k}')"></td><td><input id="pl27_client_${k}" list="pl27_clients" placeholder="Client (vide : interne)" onkeydown="if(event.key==='Enter')plAdd27('${k}')"></td><td></td><td></td><td></td><td></td><td></td><td><input id="pl27_end_${k}" type="date" title="Échéance"></td><td colspan="8"><button class="btn small" onclick="plAdd27('${k}')">Ajouter</button></td></tr></tbody></table></div>`}</div>`;};
 return `<div class="titleRow"><div><h1>Mon travail · Planning</h1><div class="sub">Ton planning : chaque tâche avec son client, son statut, ses échéances et sa facturation. Les tâches sont reliées aux autres onglets (travaux exceptionnels, Bilan / AGO, saisie des temps, facturation).</div></div>
  <div class="v25actions"><label class="btn small secondary" style="cursor:pointer">Importer un planning Monday (Excel)<input type="file" accept=".xlsx" hidden onchange="plImport27(this.files[0]);this.value=''"></label><button class="btn small secondary" onclick="workPrefs27().mode='auto';save();render()">Échéances automatiques</button></div></div>
 <div class="cards" style="grid-template-columns:repeat(4,1fr)"><div class="card"><small>Tâches ouvertes</small><span class="big">${open.length}</span></div><div class="card"><small>En retard</small><span class="big ${late?'bad':'good'}">${late}</span></div><div class="card"><small>Échéance sous 7 jours</small><span class="big ${week?'warn':''}">${week}</span></div><div class="card"><small>À facturer (tâches)</small><span class="big ${bill?'bad':''}">${euro(bill)}</span></div></div>
 <div class="panel panelBody myt27bar"><label class="sub">Personne <select onchange="workPrefs27().pwho=this.value;save();render()"><option value="">Toute l’équipe</option>${people.map(n=>`<option ${n===who?'selected':''}>${esc(n)}</option>`).join('')}</select></label><input placeholder="Rechercher une tâche ou un client" value="${esc(p.pq||'')}" onchange="workPrefs27().pq=this.value;save();render()" style="flex:1;max-width:340px"></div>
 <datalist id="pl27_clients">${state.clients.filter(c=>c.status!=='Inactif').map(c=>`<option value="${esc(c.name)}">`).join('')}</datalist>
 ${PL_SECTIONS27.map(group).join('')}
 <div class="pl27grp" style="--g:#17a673"><div class="pl27gh" onclick="plToggle27('done')"><span>${coll.done===false?'▾':'▸'}</span><b>Fait</b><span class="sub">${done.length} tâche(s) terminée(s) ou annulée(s)</span></div>
 ${coll.done===false?`<div class="board27 pl27board" data-k="pl_done"><table><thead>${PL_HEAD27}</thead><tbody>${done.sort((a,b)=>String(b.doneAt||'').localeCompare(String(a.doneAt||''))).slice(0,300).map(plRow27).join('')||'<tr><td colspan="16" class="sub">Aucune tâche terminée.</td></tr>'}</tbody></table></div>`:''}</div>`;
}
function plToggle27(k){const p=workPrefs27(),c=p.pcoll=p.pcoll||{};c[k]=k==='done'?c[k]===false?undefined:false:!c[k];save();render();}

/* ---------- Import d'un planning Monday (Excel) ---------- */
function plXlDate27(v){if(v==null||v==='')return '';if(typeof v==='number')return iso(new Date(Math.round((v-25569)*864e5)+12*36e5));const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[0]:'';}
async function plImport27(file){
 if(!file)return;
 let rows;try{rows=await readXlsx27(file);}catch(e){return alert('Fichier illisible : '+e.message);}
 const secOf=s=>/onboarding/i.test(s)?'onb':/annuel|bilan|ago/i.test(s)?'annual':/courant|répétitive|repetitive/i.test(s)?'current':/exceptionnel/i.test(s)?'exc':/^fait$/i.test(s.trim())?'done':'';
 let sec='',head=null;const items=[],known=new Set(plItems27().map(t=>(t.title+'|'+(t.client||'')).toLowerCase()));let dup=0,unmatched=0;
 for(const r of rows){
  const first=r[0];if(first==null||first==='')continue;
  if(r.slice(1).every(v=>v==null||v==='')){const s=secOf(String(first));if(s)sec=s;continue;}
  if(String(first).trim()==='Name'){head=r.map(h=>String(h||'').trim().toLowerCase());continue;}
  if(!head||!sec)continue;
  const g=n=>{const i=head.indexOf(n);return i<0?null:r[i];};
  const title=String(first).trim(),cname=String(g('client')||'').trim(),siren=String(g('siren')||'').replace(/\D/g,'').slice(0,9);
  let c=siren&&state.clients.find(x=>sirenOf27(x.siren)===siren)||(cname?plClientByName27(cname):null)||plClientByName27(title.split(' - ')[0].split(' / ')[0].trim());
  if(!c&&(cname||siren))unmatched++;
  const st=String(g('statut')||'').trim(),status=PL_STATUS27.includes(st)?st:sec==='done'?'Fait':'A faire';
  let section=sec;if(sec==='done'){const ty=String(g('typologie')||'');section=/onboarding/i.test(ty)?'onb':/annuel/i.test(ty)?'annual':/courant/i.test(ty)?'current':'exc';}
  const prio={critical:'Critique',high:'Haute',medium:'Moyenne',low:'Basse'}[String(g('priorité')||'').toLowerCase()]||'';
  const rec=PL_REC27.includes(String(g('récurrence')||''))?String(g('récurrence')):'Non',bill=String(g('a facturer')||'');
  const t={id:uid('MT'),section,title,client:c?.id||'',clientLabel:c?'':cname,manager:String(g('manager')||''),collab:String(g('collaborateur')||''),status,start:plXlDate27(g('échéances - start')),end:plXlDate27(g('échéances - end')),recurrence:rec,time:g('temps passés')===null?'':Number(g('temps passés'))||'',priority:prio,fees:typeof g('honoraires')==='number'?g('honoraires'):'',bill:bill==='Oui'?'Oui':bill==='Non'?'Non':'À définir',createdAt:(plXlDate27(g('création de la tâche'))||today27())+'T09:00:00.000Z',doneAt:plXlDate27(g('fin de la tâche'))||(['Fait','Annulée'].includes(status)?plXlDate27(g('création de la tâche')):''),imported:true,next:'x'};
  if(section==='annual'){t.mission=/\bAGO\b|juridique/i.test(title)?'AGO':'Bilan';const y=title.match(/20\d\d/g);t.year=y?Number(y[y.length-1]):new Date().getFullYear()-1;}
  const k=(t.title+'|'+(t.client||'')).toLowerCase();if(known.has(k)){dup++;continue;}known.add(k);items.push(t);
 }
 if(!items.length)return alert(dup?`Aucune nouvelle tâche : les ${dup} tâche(s) du fichier sont déjà dans le planning.`:'Aucune tâche reconnue : le fichier doit avoir des groupes (Onboarding, Travaux annuels…) et une ligne d’en-tête « Name ».');
 const by=s=>items.filter(t=>t.section===s&&!plDone27(t)).length,fin=items.filter(plDone27).length;
 if(!confirm(`Importer ${items.length} tâche(s) ?\n\n• Onboarding : ${by('onb')}\n• Travaux annuels : ${by('annual')}\n• Travaux courants : ${by('current')}\n• Travaux exceptionnels : ${by('exc')}\n• Déjà faites / annulées : ${fin}\n\n${unmatched} tâche(s) avec un client inconnu du CRM (gardé en texte).${dup?`\n${dup} tâche(s) déjà présente(s) ignorée(s).`:''}\n\nLes tâches ouvertes sont reliées aux autres onglets (travaux exceptionnels, Bilan / AGO). Les tâches déjà faites sont seulement archivées.`))return;
 for(const t of items){plItems27().push(t);if(!plDone27(t)){t.next='';plSyncAnnual27(t,'');plSyncExc27(t);}}
 log25('Planning · import Monday','',items.length+' tâche(s)');save();render();toast(items.length+' tâche(s) importée(s)');
}

/* ---------- Branchement ---------- */
myWorkPage27=planningPage27;
(function(){const st=document.createElement('style');st.textContent=`
.pl27grp{margin:14px 0 6px;border-left:4px solid var(--g);background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(16,24,40,.05)}
.pl27gh{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;color:var(--g)}.pl27gh b{font-size:15px}
.pl27board{max-height:none;border-top:1px solid #eef0f4}.pl27board td{padding:3px 6px;vertical-align:middle;border-bottom:1px solid #f1f2f5}.pl27board th{white-space:nowrap;font-size:11px}
.pl27name{min-width:300px;text-align:left!important;position:sticky;left:0;background:#fff;z-index:1}.pl27title{width:100%;font-weight:600;text-align:left}
.pl27sub{display:flex;gap:6px;margin-top:3px}.pl27pill{border:0;border-radius:5px;color:#fff;font-weight:600;height:26px;min-width:120px;text-align:center;cursor:pointer}.pl27pill option{color:#1f2a3d;background:#fff}
.pl27badge{display:inline-block;color:#fff;border-radius:5px;padding:3px 8px;font-size:12px;font-weight:600}.pl27late input{color:#c4162a;font-weight:700}
.pl27done td{opacity:.6}.pl27done .pl27title{text-decoration:line-through}.pl27add td{background:#fafbfc}.pl27add input{height:30px;border:1px dashed #cfd5df;border-radius:6px;padding:0 8px;width:100%;background:#fff}`;document.head.append(st);})();
