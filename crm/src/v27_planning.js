/* RB Partners V27 — Mon travail : un seul tableau rempli à la main (tâche, client, fait par, échéance, statut,
 * à facturer, montant). Le client écrit est relié à sa fiche s'il existe (onglet « Tâches » de la fiche client),
 * sinon gardé en texte. Une tâche « À facturer = Oui » passée à « Fait » crée un travail exceptionnel
 * « Lancer facturation = Oui » → Facturation. Import d'un planning Monday (Excel) possible ; les tâches importées
 * gardent leurs liens (travaux exceptionnels, Bilan / AGO). Données partagées : state.myTasks27 ; filtres : work27. */
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
 plSyncAnnual27(t,k);plSyncExc27(t);
 if(['time','collab','client','status','mission','section','end'].includes(k))plSyncTime27(t);
 if(k==='status'&&t.status==='Fait')plRecur27(t);
}

/* ---------- Saisie ---------- */
function plClientByName27(name){const k=nameKey27(name);return state.clients.find(c=>c.name.toLowerCase()===name.toLowerCase())||state.clients.find(c=>nameKey27(c.name)===k);}
function plSet27(id,k,v){
 const t=plTask27(id);if(!t)return;
 // Client écrit à la main : relié à la fiche s'il existe dans le portefeuille, sinon gardé tel quel.
 if(k==='client'){v=String(v||'').trim();const c=v?plClientByName27(v):null;t.clientLabel=c?'':v;v=c?.id||'';}
 if(k==='collab'||k==='title')v=String(v||'').trim();
 if(['fees','time','year'].includes(k))v=v===''?'':Number(String(v).replace(',','.'));
 t[k]=v;plApply27(t,k);save();render();
 if(k==='status'&&v==='Fait'&&t.bill==='Oui'&&!t.client)toast('Tâche sans dossier : rattache-la à un client pour qu’elle passe en facturation.');
}
function plDel27(id){
 const t=plTask27(id);if(!t)return;
 if(!confirm(`Supprimer la tâche « ${t.title||'sans titre'} » ?${t.exc?'\nLe travail exceptionnel lié reste dans Travaux exceptionnels.':''}${t.timeId?'\nLe temps saisi lié est supprimé.':''}`))return;
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
/* ---------- Page simple : un seul tableau rempli à la main ---------- */
const PL_SIMPLE_STATUS27=['A faire','En cours','Fait'];
function plClientName27(t){return cfind(t.client)?.name||t.clientLabel||'';}
function plRow27(t){
 const c=cfind(t.client),late=!plDone27(t)&&t.end&&t.end<today27(),st=PL_SIMPLE_STATUS27.includes(t.status)?PL_SIMPLE_STATUS27:[...PL_SIMPLE_STATUS27,t.status];
 const inp=(k,val,type='text',extra='')=>`<input class="pl27in" type="${type}" value="${esc(val??'')}" ${extra} onchange="plSet27('${t.id}','${k}',this.value)">`;
 return `<tr class="${plDone27(t)?'pl27done':''}">
  <td>${inp('title',t.title)}</td>
  <td>${inp('client',plClientName27(t),'text','list="pl27_clients"')}${c?`<a class="sub" href="#" onclick="event.preventDefault();openClient('${c.id}')">fiche client ›</a>`:t.clientLabel?'<span class="sub">pas de fiche à ce nom</span>':''}</td>
  <td>${inp('collab',t.collab,'text','list="pl27_people"')}</td>
  <td class="${late?'pl27late':''}">${inp('end',t.end,'date')}</td>
  <td><select class="pl27pill" style="background:${PL_STATUS_COLOR27[t.status]||'#8a94a6'}" onchange="plSet27('${t.id}','status',this.value)">${st.map(x=>`<option ${x===t.status?'selected':''}>${esc(x)}</option>`).join('')}</select></td>
  <td><select class="pl27in" onchange="plSet27('${t.id}','bill',this.value)">${PL_BILL27.map(x=>`<option ${x===(t.bill||'À définir')?'selected':''}>${x}</option>`).join('')}</select></td>
  <td>${inp('fees',t.fees,'number','min="0" step="10" placeholder="€ HT"')}</td>
  <td><button class="btn small light pf27del" title="Supprimer" onclick="plDel27('${t.id}')">✕</button></td></tr>`;
}
const PL_HEAD27='<tr><th style="width:30%">Tâche</th><th style="width:18%">Client</th><th style="width:14%">Fait par</th><th style="width:130px">Échéance</th><th style="width:130px">Statut</th><th style="width:115px">À facturer</th><th style="width:105px">Montant HT</th><th style="width:84px"></th></tr>';
function plAddRow27(){
 const g=k=>(document.getElementById('pl27n_'+k)?.value||'').trim(),title=g('title');
 if(!title)return toast('Écris la tâche.');
 const name=g('client'),c=name?plClientByName27(name):null;
 const t={id:uid('MT'),section:'task',title,client:c?.id||'',clientLabel:c?'':name,collab:g('collab'),manager:'',status:'A faire',start:'',end:g('end'),recurrence:'Non',time:'',priority:'',fees:g('fees')===''?'':Number(g('fees')),bill:g('bill')||'À définir',createdAt:new Date().toISOString(),by:shared25.user?.username||''};
 plItems27().push(t);log25('Mon travail · tâche ajoutée',t.client,title);
 workPrefs27().plast={collab:t.collab};save();render();
 document.getElementById('pl27n_title')?.focus();
}
function planningPage27(){
 if(plMigrate27())save();
 const p=workPrefs27(),q=(p.pq||'').toLowerCase(),showDone=p.pdone===true;
 const people=[...new Set([...activeTeam27().map(m=>m.name),...plItems27().flatMap(t=>plNames27(t.collab))])];
 const match=t=>!q||[t.title,plClientName27(t),t.collab].some(v=>String(v||'').toLowerCase().includes(q));
 const all=plItems27().filter(match),open=all.filter(t=>!plDone27(t)).sort((a,b)=>String(a.end||'9999').localeCompare(String(b.end||'9999'))||String(a.createdAt).localeCompare(String(b.createdAt))),done=all.filter(plDone27).sort((a,b)=>String(b.doneAt||'').localeCompare(String(a.doneAt||'')));
 const enter=`onkeydown="if(event.key==='Enter')plAddRow27()"`;
 return `<div class="titleRow"><div><h1>Mon travail</h1><div class="sub">Écris tes tâches dans la dernière ligne du tableau, puis « Ajouter » (ou Entrée). Tout se modifie directement dans le tableau.</div></div>
  <div class="v25actions"><label class="btn small secondary" style="cursor:pointer">Importer un planning Monday (Excel)<input type="file" accept=".xlsx" hidden onchange="plImport27(this.files[0]);this.value=''"></label><button class="btn small secondary" onclick="workPrefs27().mode='auto';save();render()">Échéances automatiques</button></div></div>
 <datalist id="pl27_clients">${state.clients.filter(c=>c.status!=='Inactif').map(c=>`<option value="${esc(c.name)}">`).join('')}</datalist><datalist id="pl27_people">${people.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
 <div class="panel pl27simple"><div class="panelHead"><h3>Tâches en cours · ${open.length}</h3><input class="pl27search" placeholder="Rechercher (tâche, client, personne)" value="${esc(p.pq||'')}" onchange="workPrefs27().pq=this.value;save();render()"></div>
 <table><thead>${PL_HEAD27}</thead><tbody>${open.map(plRow27).join('')}
  <tr class="pl27new"><td><input id="pl27n_title" class="pl27in" placeholder="Nouvelle tâche…" ${enter}></td><td><input id="pl27n_client" class="pl27in" list="pl27_clients" placeholder="Client" ${enter}></td><td><input id="pl27n_collab" class="pl27in" list="pl27_people" placeholder="Fait par" value="${esc(p.plast?.collab||'')}" ${enter}></td><td><input id="pl27n_end" class="pl27in" type="date"></td><td></td><td><select id="pl27n_bill" class="pl27in">${PL_BILL27.map(x=>`<option>${x}</option>`).join('')}</select></td><td><input id="pl27n_fees" class="pl27in" type="number" min="0" step="10" placeholder="€ HT" ${enter}></td><td><button class="btn small" onclick="plAddRow27()">Ajouter</button></td></tr>
 </tbody></table></div>
 <div class="panel pl27simple"><div class="panelHead" style="cursor:pointer" onclick="workPrefs27().pdone=${!showDone};save();render()"><h3>${showDone?'▾':'▸'} Tâches terminées · ${done.length}</h3></div>${showDone?`<table><thead>${PL_HEAD27}</thead><tbody>${done.slice(0,300).map(plRow27).join('')||'<tr><td colspan="8" class="sub">Aucune tâche terminée.</td></tr>'}</tbody></table>`:''}</div>`;
}
/* ---------- Fiche client : onglet « Tâches » ---------- */
function clientTasksTab27(c){
 const list=plItems27().filter(t=>t.client===c.id),open=list.filter(t=>!plDone27(t)),done=list.filter(plDone27);
 const row=t=>`<tr><td><b>${esc(t.title)}</b></td><td>${esc(t.collab||'—')}</td><td>${t.end?datefr(t.end):'—'}</td><td><span class="pl27badge" style="background:${PL_STATUS_COLOR27[t.status]||'#8a94a6'}">${esc(t.status)}</span></td><td>${t.bill==='Oui'?'À facturer'+(t.fees?' · '+euro(t.fees):''):t.bill==='Non'?'Non':'—'}</td></tr>`;
 return `<div class="panel"><div class="panelHead"><h3>Tâches · ${open.length} en cours</h3><button class="btn small" onclick="routePage('work')">Ouvrir Mon travail</button></div><table><thead><tr><th>Tâche</th><th>Fait par</th><th>Échéance</th><th>Statut</th><th>Facturation</th></tr></thead><tbody>${open.concat(done).map(row).join('')||'<tr><td colspan="5" class="sub">Aucune tâche pour ce client. Ajoute-en une dans Mon travail en écrivant son nom dans la colonne Client.</td></tr>'}</tbody></table></div>`;
}
window.CLIENT_TABS_MORE27=(window.CLIENT_TABS_MORE27||[]).concat([['taches','Tâches']]);
const previousClientPagePl27=clientPage27;
clientPage27=function(){let html=previousClientPagePl27();const c=cfind(state.selectedClient)||state.clients[0];if(c&&state.clientTab27==='taches')html+=clientTasksTab27(c);return html;};
clientPage=clientPage27;
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
.pl27done td{opacity:.6}.pl27done .pl27title,.pl27done td:first-child input{text-decoration:line-through}.pl27board{overflow-x:visible}.pl27board table{width:100%;min-width:0;table-layout:fixed}.pl27board td,.pl27board th{white-space:normal;word-break:break-word;text-align:left}.pl27board .pl27pill{min-width:0;width:100%}.pl27simple table{width:100%;table-layout:fixed}.pl27simple td{padding:4px 6px;vertical-align:top}.pl27in{width:100%;height:32px;border:1px solid #e3e7ee;border-radius:6px;padding:0 8px;font:inherit;background:#fff}.pl27in:focus{border-color:#1768c6;outline:none}.pl27new td{background:#f5f8ff;border-top:2px solid #cfe0ff}.pl27search{height:32px;border:1px solid #d9dee7;border-radius:8px;padding:0 10px;width:280px}.pl27simple .pl27pill{width:100%;min-width:0;height:32px}.pl27row{cursor:pointer}.pl27row:hover td{background:#f6f8fc}.pl27board td{height:44px}.pl27name{min-width:320px}
.pl27dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;vertical-align:1px}.pl27addbar{padding:8px 10px;border-top:1px solid #f1f2f5}
.modal.pl27form{width:min(720px,96vw)}.pl27form .modalBody{display:flex;flex-direction:column;gap:10px}.pl27form .formGrid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px 14px}
.pl27form .field label{text-transform:none;letter-spacing:0;font-size:13px;font-weight:600;color:#1f2a3d}.pl27h{margin:8px 0 0;font-size:14px;color:#1768c6;border-bottom:1px solid #eef0f4;padding-bottom:4px}
.pl27seg{display:flex;flex-wrap:wrap;gap:6px}.pl27seg label{border:1px solid #d9dee7;border-radius:999px;padding:6px 12px;cursor:pointer;font-weight:600;font-size:13px;background:#fff}.pl27seg label.on{background:#1768c6;border-color:#1768c6;color:#fff}.pl27seg input{position:absolute;opacity:0;width:1px;height:1px}`;document.head.append(st);})();
