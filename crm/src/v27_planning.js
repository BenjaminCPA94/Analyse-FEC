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

/* ---------- Saisie : formulaire clair (création et modification) ---------- */
const PL_SEC_HELP27={onb:'Démarrage d’un nouveau dossier.',annual:'Reliée au Bilan ou à l’AGO de l’exercice : « Fait » termine le dossier dans l’onglet correspondant.',current:'Travail qui revient (saisie, TVA, tableaux…) : il se recrée tout seul selon la récurrence.',exc:'Apparaît aussi dans l’onglet Travaux exceptionnels, puis en Facturation si elle est à facturer.'};
function plForm27(id,sec){
 const t=id?plTask27(id):null,me=me27(),p=workPrefs27();
 const v=t?{...t}:{section:sec||'exc',status:'A faire',bill:'À définir',recurrence:(sec==='current'?'Mensuelle':'Non'),collab:p.pwho||me||'',year:new Date().getFullYear()-1,mission:'Bilan'};
 const c=cfind(v.client),team=[...new Set(activeTeam27().map(m=>m.name))],people=n=>[...new Set(['',...team,...(n&&!team.includes(n)?[n]:[])])];
 const f=(l,h,help)=>`<div class="field"><label>${l}</label>${h}${help?`<div class="sub">${help}</div>`:''}</div>`;
 const sel=(k,o,val)=>`<select id="plf_${k}">${o.map(x=>`<option value="${esc(x)}" ${x===(val??'')?'selected':''}>${esc(x||'—')}</option>`).join('')}</select>`;
 const radio=(k,o,val)=>`<div class="pl27seg">${o.map(([x,l])=>`<label class="${x===val?'on':''}"><input type="radio" name="plf_${k}" value="${esc(x)}" ${x===val?'checked':''} onchange="plFormSync27()">${esc(l)}</label>`).join('')}</div>`;
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal pl27form"><div class="modalHead"><div><h3>${t?'Modifier la tâche':'Nouvelle tâche'}</h3><div class="sub">${t?`Créée le ${datefr(String(t.createdAt||'').slice(0,10))}${t.doneAt?' · terminée le '+datefr(t.doneAt):''}`:'Renseigne au minimum la tâche. Le reste peut être complété plus tard.'}</div></div><button class="btn secondary small" onclick="closeModal()" aria-label="Fermer">✕</button></div><div class="modalBody">
  <h4 class="pl27h">1. Quoi ?</h4>
  ${f('Tâche',`<input id="plf_title" value="${esc(v.title||'')}" placeholder="Ex. : déposer les comptes, changement de gérant, saisie mensuelle…">`)}
  ${f('Type de travail',radio('section',PL_SECTIONS27.map(([k,l])=>[k,l.replace(/^[IV]+\. /,'')]),v.section),`<span id="plf_help">${PL_SEC_HELP27[v.section]||''}</span>`)}
  <div class="formGrid" id="plf_annual" ${v.section==='annual'?'':'hidden'}>${f('Mission',sel('mission',['Bilan','AGO'],v.mission||'Bilan'))}${f('Exercice',`<input id="plf_year" type="number" value="${esc(v.year??'')}">`)}</div>
  <h4 class="pl27h">2. Pour qui ?</h4>
  <div class="formGrid">${f('Client',`<input id="plf_client" list="pl27_clients" value="${esc(c?.name||v.clientLabel||'')}" placeholder="Laisser vide : tâche interne">`,c?esc(c.siren?'SIREN '+c.siren:''):'')}${f('Fait par',sel('collab',people(v.collab),v.collab||''))}${f('Manager',sel('manager',people(v.manager),v.manager||''),'Repris de la fiche client si vide.')}</div>
  <h4 class="pl27h">3. Quand ?</h4>
  <div class="formGrid">${f('Échéance',`<input id="plf_end" type="date" value="${esc(v.end||'')}">`)}${f('Début (facultatif)',`<input id="plf_start" type="date" value="${esc(v.start||'')}">`)}${f('Récurrence',sel('recurrence',PL_REC27,v.recurrence||'Non'))}${f('Priorité',sel('priority',PL_PRIO27,v.priority||''))}</div>
  <h4 class="pl27h">4. Facturation</h4>
  <div class="formGrid">${f('À facturer ?',radio('bill',[['À définir','À définir'],['Oui','Oui'],['Non','Non']],v.bill||'À définir'))}${f('Honoraires HT (€)',`<input id="plf_fees" type="number" min="0" step="10" value="${esc(v.fees??'')}" placeholder="${v.section==='annual'?'Repris de la fiche client si vide':'Montant à facturer'}">`)}</div>
  <h4 class="pl27h">5. Suivi</h4>
  <div class="formGrid">${f('Statut',sel('status',PL_STATUS27,v.status||'A faire'))}${f('Temps passé (heures)',`<input id="plf_time" type="number" min="0" step="0.25" value="${esc(v.time??'')}">`,'Enregistré aussi dans Saisie des temps.')}</div>
 </div><div class="modalFooter" style="display:flex;justify-content:space-between;gap:8px">${t?`<button class="btn secondary pf27del" onclick="plDel27('${t.id}')">Supprimer</button>`:'<span></span>'}<span style="display:flex;gap:8px"><button class="btn secondary" onclick="closeModal()">Annuler</button><button class="btn" onclick="plSave27('${t?t.id:''}')">${t?'Enregistrer':'Ajouter la tâche'}</button></span></div></div></div>`;
 document.getElementById('plf_title').focus();
}
function plFormSync27(){
 const sec=document.querySelector('input[name="plf_section"]:checked')?.value;
 document.querySelectorAll('.pl27seg label').forEach(l=>l.classList.toggle('on',l.querySelector('input').checked));
 const a=document.getElementById('plf_annual');if(a)a.hidden=sec!=='annual';
 const h=document.getElementById('plf_help');if(h)h.textContent=PL_SEC_HELP27[sec]||'';
}
function plSave27(id){
 const g=k=>(document.getElementById('plf_'+k)?.value||'').trim(),r=k=>document.querySelector(`input[name="plf_${k}"]:checked`)?.value||'';
 const title=g('title');if(!title)return toast('Écris la tâche.');
 const name=g('client'),c=name?plClientByName27(name):null;
 if(name&&!c)return toast('Client introuvable : choisis-le dans la liste (ou laisse vide pour une tâche interne).');
 const num=x=>x===''?'':Number(String(x).replace(',','.'));
 const nv={title,section:r('section')||'exc',client:c?.id||'',collab:g('collab'),manager:g('manager'),end:g('end'),start:g('start'),recurrence:g('recurrence')||'Non',priority:g('priority'),bill:r('bill')||'À définir',fees:num(g('fees')),status:g('status')||'A faire',time:num(g('time'))};
 if(nv.section==='annual'){nv.mission=g('mission')||'Bilan';nv.year=num(g('year'))||new Date().getFullYear()-1;if(nv.fees===''&&c)nv.fees=(nv.mission==='AGO'?fees27(c).legalAnnual:fees27(c).annualAccounts)||'';}
 if(c&&!nv.manager)nv.manager=people27(c,'manager');
 let t=id?plTask27(id):null;const isNew=!t;
 if(isNew){t={id:uid('MT'),createdAt:new Date().toISOString(),by:shared25.user?.username||''};plItems27().push(t);}
 const changed=isNew?Object.keys(nv):Object.keys(nv).filter(k=>String(t[k]??'')!==String(nv[k]??''));
 if(!isNew&&!changed.length){closeModal();return;}
 if(nv.client)t.clientLabel='';
 Object.assign(t,nv);
 // Automatisations : statut en dernier (fin de Bilan / AGO, récurrence, facturation).
 for(const k of ['client','section','mission','year','bill','fees','end','collab','time'].filter(k=>changed.includes(k)))plApply27(t,k);
 if(changed.includes('status'))plApply27(t,'status');else if(changed.length)plSyncExc27(t);
 log25(isNew?'Planning · tâche ajoutée':'Planning · tâche modifiée',t.client,title);
 closeModal();save();render();
 if(t.status==='Fait'&&t.bill==='Oui'&&!t.client)toast('Tâche sans client : rattache-la à un client pour qu’elle passe en facturation.');
 else toast(isNew?'Tâche ajoutée':'Tâche enregistrée');
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
 const c=cfind(t.client),late=!plDone27(t)&&t.end&&t.end<today27(),sub=[t.section==='annual'&&t.mission?`${t.mission} ${t.year||''}`:'',t.recurrence&&t.recurrence!=='Non'?'↻ '+t.recurrence.toLowerCase():''].filter(Boolean).join(' · ');
 const bill=t.bill==='Oui'?(plBillKey27(t)?plBillCell27(t):`<span class="pl27badge" style="background:#e0364f">À facturer</span>`)+(t.fees?` <b>${euro(t.fees)}</b>`:''):t.bill==='Non'?'<span class="sub">Non facturable</span>':'<span class="sub">À définir</span>';
 return `<tr class="pl27row ${plDone27(t)?'pl27done':''}" onclick="plForm27('${t.id}')" title="Cliquer pour ouvrir la tâche">
  <td class="pl27name">${t.priority?`<span class="pl27dot" style="background:${PL_PRIO_COLOR27[t.priority]}" title="Priorité ${esc(t.priority)}"></span>`:''}<b class="pl27title">${esc(t.title)}</b>${sub?`<div class="sub">${esc(sub)}</div>`:''}</td>
  <td>${c?esc(c.name):t.clientLabel?`<span class="sub" title="Client inconnu du CRM">${esc(t.clientLabel)} ?</span>`:'<span class="sub">Interne</span>'}${plLinkCell27(t)}</td>
  <td>${esc(plNames27(t.collab)[0]||'—')}</td>
  <td class="${late?'pl27late':''}">${t.end?datefr(t.end):'<span class="sub">—</span>'}${late?'<div class="sub bad">en retard</div>':''}</td>
  <td onclick="event.stopPropagation()"><select class="pl27pill" aria-label="Statut" style="background:${PL_STATUS_COLOR27[t.status]||'#8a94a6'}" onchange="plSet27('${t.id}','status',this.value)">${PL_STATUS27.map(x=>`<option ${x===t.status?'selected':''}>${x}</option>`).join('')}</select></td>
  <td>${bill}</td></tr>`;
}
const PL_HEAD27='<tr><th class="pl27name">Tâche</th><th style="width:17%">Client</th><th style="width:13%">Fait par</th><th style="width:10%">Échéance</th><th style="width:150px">Statut</th><th style="width:15%">Facturation</th></tr>';
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
  ${hidden?'':`<div class="board27 pl27board" data-k="pl_${k}"><table><thead>${PL_HEAD27}</thead><tbody>${list.map(plRow27).join('')||`<tr><td colspan="6" class="sub">Aucune tâche.</td></tr>`}</tbody></table><div class="pl27addbar"><button class="btn small light" onclick="plForm27('','${k}')">+ Nouvelle tâche ${esc(label.replace(/^[IV]+\. /,'').toLowerCase())}</button></div></div>`}</div>`;};
 return `<div class="titleRow"><div><h1>Mon travail · Planning</h1><div class="sub">« + Nouvelle tâche » pour ajouter, clic sur une ligne pour l’ouvrir. Le statut se change directement dans la liste.</div></div>
  <div class="v25actions"><button class="btn" onclick="plForm27('','exc')">+ Nouvelle tâche</button><label class="btn small secondary" style="cursor:pointer">Importer un planning Monday (Excel)<input type="file" accept=".xlsx" hidden onchange="plImport27(this.files[0]);this.value=''"></label><button class="btn small secondary" onclick="workPrefs27().mode='auto';save();render()">Échéances automatiques</button></div></div>
 <div class="cards" style="grid-template-columns:repeat(4,1fr)"><div class="card"><small>Tâches ouvertes</small><span class="big">${open.length}</span></div><div class="card"><small>En retard</small><span class="big ${late?'bad':'good'}">${late}</span></div><div class="card"><small>Échéance sous 7 jours</small><span class="big ${week?'warn':''}">${week}</span></div><div class="card"><small>À facturer (tâches)</small><span class="big ${bill?'bad':''}">${euro(bill)}</span></div></div>
 <div class="panel panelBody myt27bar"><label class="sub">Personne <select onchange="workPrefs27().pwho=this.value;save();render()"><option value="">Toute l’équipe</option>${people.map(n=>`<option ${n===who?'selected':''}>${esc(n)}</option>`).join('')}</select></label><input placeholder="Rechercher une tâche ou un client" value="${esc(p.pq||'')}" onchange="workPrefs27().pq=this.value;save();render()" style="flex:1;max-width:340px"></div>
 <datalist id="pl27_clients">${state.clients.filter(c=>c.status!=='Inactif').map(c=>`<option value="${esc(c.name)}">`).join('')}</datalist>
 ${PL_SECTIONS27.map(group).join('')}
 <div class="pl27grp" style="--g:#17a673"><div class="pl27gh" onclick="plToggle27('done')"><span>${coll.done===false?'▾':'▸'}</span><b>Fait</b><span class="sub">${done.length} tâche(s) terminée(s) ou annulée(s)</span></div>
 ${coll.done===false?`<div class="board27 pl27board" data-k="pl_done"><table><thead>${PL_HEAD27}</thead><tbody>${done.sort((a,b)=>String(b.doneAt||'').localeCompare(String(a.doneAt||''))).slice(0,300).map(plRow27).join('')||'<tr><td colspan="6" class="sub">Aucune tâche terminée.</td></tr>'}</tbody></table></div>`:''}</div>`;
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
.pl27name{text-align:left!important}.pl27title{font-weight:600}
.pl27sub{display:flex;gap:6px;margin-top:3px}.pl27pill{border:0;border-radius:5px;color:#fff;font-weight:600;height:26px;min-width:120px;text-align:center;cursor:pointer}.pl27pill option{color:#1f2a3d;background:#fff}
.pl27badge{display:inline-block;color:#fff;border-radius:5px;padding:3px 8px;font-size:12px;font-weight:600}.pl27late input{color:#c4162a;font-weight:700}
.pl27done td{opacity:.6}.pl27done .pl27title{text-decoration:line-through}.pl27board{overflow-x:visible}.pl27board table{width:100%;min-width:0;table-layout:fixed}.pl27board td,.pl27board th{white-space:normal;word-break:break-word;text-align:left}.pl27board .pl27pill{min-width:0;width:100%}.pl27row{cursor:pointer}.pl27row:hover td{background:#f6f8fc}.pl27board td{height:44px}.pl27name{min-width:320px}
.pl27dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;vertical-align:1px}.pl27addbar{padding:8px 10px;border-top:1px solid #f1f2f5}
.modal.pl27form{width:min(720px,96vw)}.pl27form .modalBody{display:flex;flex-direction:column;gap:10px}.pl27form .formGrid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px 14px}
.pl27form .field label{text-transform:none;letter-spacing:0;font-size:13px;font-weight:600;color:#1f2a3d}.pl27h{margin:8px 0 0;font-size:14px;color:#1768c6;border-bottom:1px solid #eef0f4;padding-bottom:4px}
.pl27seg{display:flex;flex-wrap:wrap;gap:6px}.pl27seg label{border:1px solid #d9dee7;border-radius:999px;padding:6px 12px;cursor:pointer;font-weight:600;font-size:13px;background:#fff}.pl27seg label.on{background:#1768c6;border-color:#1768c6;color:#fff}.pl27seg input{position:absolute;opacity:0;width:1px;height:1px}`;document.head.append(st);})();
