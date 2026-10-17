/* RB Partners V27 — Prospects simplifiés (inspirés du tableau Monday « CRM »).
 * Un tableau par statut : À contacter → RDV → Proposition envoyée → Gagné / Perdu.
 * Les besoins cochés deviennent les missions proposées ; « Gagné » envoie le dossier au bon endroit :
 *  - société existante : fiche client en onboarding avec missions et honoraires ;
 *  - société à créer : dossier dans la Matrice création (formulaire client), puis fiche client à la création.
 * Relances automatiques : prochaine action dépassée, ou proposition sans nouvelle depuis 15 jours. */
const PR_STAGES27=['À contacter','RDV','Proposition envoyée','Gagné','Perdu'];
const PR_COLORS27={'À contacter':'#8e959f','RDV':'#fdab3d','Proposition envoyée':'#579bfc','Gagné':'#00c875','Perdu':'#e2445c'};
const PR_LEGACY27={'Nouveau':'À contacter','A contacter':'À contacter','A traiter':'À contacter','À traiter':'À contacter','RDV à planifier':'RDV','RDV réalisé':'RDV','RDV planifié':'RDV','Proposition envoyée':'Proposition envoyée','Négociation':'Proposition envoyée','Devis envoyé':'Proposition envoyée','Validé':'Gagné','Signé':'Gagné','Gagné':'Gagné','Refusé':'Perdu','Perdu':'Perdu'};
const PR_SOURCES27=['Bouche à oreille','Recommandation client','Partenaire','Site internet','LinkedIn','Réseau','Autre'];
const PR_NEEDS27=[...MISSIONS27,['creation','Création de société'],['taxe3','Taxe 3 %'],['conseil','Conseil / juridique']];
const PR_BILLING27=['A définir','Forfait mensuel (prélèvement)','Forfait annuel','À la mission'];
const PR_FOLLOWUP_DAYS27=15;

function prStage27(p){const s=PR_LEGACY27[p.stage]||p.stage;return PR_STAGES27.includes(s)?s:'À contacter';}
function prMigrate27(){for(const p of state.prospects||[]){const s=prStage27(p);if(p.stage!==s)p.stage=s;if(!p.createdAt)p.createdAt=p.created||today27();if(!p.missions27)p.missions27={};}}
function prTeam27(){return [...new Set([...(typeof activeTeam27==='function'?activeTeam27().map(m=>m.name):[]),...state.prospects.map(p=>p.owner).filter(Boolean)])];}
function prValue27(p){const f=p.fees27||{};const s=['accounting','annualAccounts','legalAnnual','other'].reduce((a,k)=>a+Number(f[k]||0),0);return s||Number(p.value||0);}
/* Relance : prochaine action dépassée, ou proposition envoyée sans action prévue depuis 15 jours. */
function prFollow27(p){
 const st=prStage27(p);if(['Gagné','Perdu'].includes(st))return null;
 if(p.nextDate)return p.nextDate<today27()?{late:true,txt:'Relance '+datefr(p.nextDate)}:p.nextDate===today27()?{late:false,txt:'Aujourd’hui'}:null;
 if(st==='Proposition envoyée'&&p.sentAt&&(Date.now()-new Date(p.sentAt))>PR_FOLLOWUP_DAYS27*864e5)return {late:true,txt:'Sans réponse depuis '+Math.floor((Date.now()-new Date(p.sentAt))/864e5)+' j'};
 return null;
}

/* ---------- page ---------- */
function prospectsPage27(){
 prMigrate27();
 const v=state.prospectsView27||(state.prospectsView27={q:'',who:'',collapsed:{'Gagné':true,'Perdu':true}}),q=(v.q||'').toLowerCase();
 const list=state.prospects.filter(p=>(!q||[p.name,p.contact,p.email,p.siren].some(x=>String(x||'').toLowerCase().includes(q)))&&(!v.who||p.owner===v.who));
 const by=s=>list.filter(p=>prStage27(p)===s),y=String(new Date().getFullYear());
 const open=list.filter(p=>!['Gagné','Perdu'].includes(prStage27(p))),late=open.filter(p=>prFollow27(p)?.late);
 const won=list.filter(p=>prStage27(p)==='Gagné'&&String(p.wonAt||'').startsWith(y)),lost=list.filter(p=>prStage27(p)==='Perdu'&&String(p.lostAt||'').startsWith(y));
 const head=`<tr><th class="n27">Name</th><th>Statut</th><th>Prochaine action</th><th>Commercial</th><th>Source</th><th>Contact</th><th>Besoins</th><th>Honoraires / an</th><th>Mode de facturation</th><th>Date de rajout</th><th>Dossier</th></tr>`;
 const row=p=>{const st=prStage27(p),f=prFollow27(p),c=state.clients.find(x=>x.prospectId===p.id),cr=p.creation27&&creation27().items.find(x=>x.id===p.creation27);
  return `<tr><td class="n27"><div class="name27"><a href="#" onclick="event.preventDefault();openProspect('${p.id}')" title="${esc(p.name)}">${esc(p.name)}</a>${f?`<span class="badge ${f.late?'red':'orange'}">${esc(f.late?'Relancer':'Aujourd’hui')}</span>`:''}<button class="btn small light" onclick="openProspect('${p.id}')">Ouvrir</button></div></td>
  <td style="min-width:150px"><select class="pill27" style="background:${PR_COLORS27[st]}" onchange="prSetStage27('${p.id}',this.value)">${PR_STAGES27.map(s=>`<option ${s===st?'selected':''}>${s}</option>`).join('')}</select></td>
  <td style="min-width:190px;padding:0 8px;text-align:left" class="${f?.late?'bad':''}" title="${esc(p.next||'')}">${p.nextDate?datefr(p.nextDate)+' · ':''}${esc(p.next||(f?f.txt:''))}</td>
  <td style="padding:0 8px">${esc(p.owner||'')}</td><td style="padding:0 8px">${esc(p.source||'')}</td>
  <td style="padding:0 8px;text-align:left">${esc(p.contact||'')}${p.email?`<div class="sub">${esc(p.email)}</div>`:''}</td>
  <td style="padding:0 8px;text-align:left;max-width:240px;overflow:hidden;text-overflow:ellipsis">${PR_NEEDS27.filter(([k])=>p.missions27?.[k]).map(([,l])=>`<span class="badge blue" style="margin:1px">${esc(l)}</span>`).join('')}</td>
  <td style="padding:0 8px;text-align:right">${prValue27(p)?euro(prValue27(p)):''}</td><td style="padding:0 8px">${esc(p.billing27||'')}</td><td style="padding:0 8px">${datefr(p.createdAt)}</td>
  <td style="padding:0 8px">${c?`<a href="#" onclick="event.preventDefault();openClient('${c.id}')">Fiche client</a>`:cr?`<a href="#" onclick="event.preventDefault();routePage('creation');crOpen27('${cr.id}')">Matrice création</a>`:''}</td></tr>`;};
 return `<div class="titleRow"><div><h1>Prospects</h1><div class="sub">Fais avancer le statut d’un clic. « Gagné » crée la fiche client (onboarding) ou le dossier de création, avec les missions et honoraires proposés.</div></div>
 <div class="v25actions"><input class="search" style="width:200px" placeholder="Rechercher…" value="${esc(v.q||'')}" onchange="state.prospectsView27.q=this.value;save();render()"><select class="search" style="width:170px" onchange="state.prospectsView27.who=this.value;save();render()"><option value="">Tous les commerciaux</option>${prTeam27().map(n=>`<option ${n===v.who?'selected':''}>${esc(n)}</option>`).join('')}</select><label class="btn small light">Importer un Excel<input hidden type="file" accept=".xlsx" onchange="importBoard27(this.files[0]);this.value=''"></label><button class="btn small" onclick="openNewProspect()">+ Nouveau prospect</button></div></div>
 <div class="cards" style="grid-template-columns:repeat(4,1fr)"><div class="card"><small>En cours</small><span class="big">${open.length}</span><div class="sub">${euro(open.reduce((a,p)=>a+prValue27(p),0))} / an potentiels</div></div><div class="card"><small>À relancer</small><span class="big ${late.length?'bad':'good'}">${late.length}</span><div class="sub">action dépassée ou proposition sans réponse</div></div><div class="card"><small>Propositions envoyées</small><span class="big">${by('Proposition envoyée').length}</span><div class="sub">${euro(by('Proposition envoyée').reduce((a,p)=>a+prValue27(p),0))} / an</div></div><div class="card"><small>Gagnés ${y}</small><span class="big good">${won.length}</span><div class="sub">${euro(won.reduce((a,p)=>a+prValue27(p),0))} / an${won.length+lost.length?` · ${Math.round(won.length/(won.length+lost.length)*100)} % de transformation`:''}</div></div></div>
 ${PR_STAGES27.map(s=>{const l=by(s);if(!l.length&&['Gagné','Perdu'].includes(s))return '';const col=PR_COLORS27[s],collapsed=v.collapsed?.[s];
  return `<div class="grp27" style="color:${col}" onclick="prToggle27('${s}')">${collapsed?'▸':'▾'} ${s} <span class="sub">${l.length} prospect(s)${l.length?' · '+euro(l.reduce((a,p)=>a+prValue27(p),0))+' / an':''}</span></div>${collapsed?'':l.length?`<div class="board27" data-k="${esc('prospects|'+s)}" style="--g:${col}"><table><thead>${head}</thead><tbody>${l.sort((a,b)=>String(a.nextDate||'9999').localeCompare(String(b.nextDate||'9999'))||String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map(row).join('')}</tbody></table></div>`:'<div class="sub" style="margin:0 0 10px 12px">Aucun prospect.</div>'}`;}).join('')}`;
}
function prToggle27(s){const v=state.prospectsView27;v.collapsed=v.collapsed||{};v.collapsed[s]=!v.collapsed[s];save();render();}

/* ---------- création ---------- */
openNewProspect=function(){
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal" style="width:min(680px,96vw)"><div class="modalHead"><div><h3>Nouveau prospect</h3><div class="sub">Le reste se complète dans la fiche, au fil des échanges.</div></div><button class="btn secondary" onclick="closeModal()">Fermer</button></div><div class="modalBody"><div class="formGrid">
 <div class="field"><label>Société ou projet</label><input id="np_name" placeholder="Ex. : SCI Dupont, ou « Création — Paul Martin »"></div>
 <div class="field"><label>Contact</label><input id="np_contact"></div>
 <div class="field"><label>E-mail</label><input id="np_email" type="email"></div>
 <div class="field"><label>Téléphone</label><input id="np_phone"></div>
 <div class="field"><label>Commercial</label><input id="np_owner" list="pr_team27" value="${esc((typeof me27==='function'&&me27())||'')}"><datalist id="pr_team27">${prTeam27().map(n=>`<option value="${esc(n)}">`).join('')}</datalist></div>
 <div class="field"><label>Source</label><select id="np_source"><option value=""></option>${PR_SOURCES27.map(s=>`<option>${s}</option>`).join('')}</select></div></div>
 <div style="margin-top:10px"><div class="sub" style="margin-bottom:6px;font-weight:600">Besoins</div><div class="checks">${PR_NEEDS27.map(([k,l])=>`<label class="check"><input type="checkbox" class="np_need" value="${k}"> ${esc(l)}</label>`).join('')}</div></div></div>
 <div class="modalFooter" style="display:flex;justify-content:flex-end"><button class="btn green" onclick="createProspect27()">Créer le prospect</button></div></div></div>`;
 document.getElementById('np_name').focus();
};
function createProspect27(){
 const g=k=>document.getElementById('np_'+k)?.value.trim()||'';
 if(!g('name'))return toast('Indique le nom de la société ou du projet.');
 const m={};document.querySelectorAll('.np_need:checked').forEach(x=>{m[x.value]=true;});
 const p={id:uid('P'),name:g('name'),contact:g('contact'),email:g('email'),phone:g('phone'),owner:g('owner'),source:g('source'),stage:'À contacter',createdAt:today27(),missions27:m,fees27:{accounting:0,annualAccounts:0,legalAnnual:0,other:0},value:0,next:'Premier contact',nextDate:today27(),notes:'',journal27:[]};
 state.prospects.push(p);log25('Prospect créé','',p.name);closeModal();state.page='prospects';persist25();openProspect(p.id);
}

/* ---------- fiche prospect ---------- */
openProspect=function(id){
 const p=pfind(id);if(!p)return;prMigrate27();const st=prStage27(p),f=p.fees27||(p.fees27={accounting:0,annualAccounts:0,legalAnnual:0,other:0}),c=state.clients.find(x=>x.prospectId===p.id),cr=p.creation27&&creation27().items.find(x=>x.id===p.creation27);
 const inp=(k,l,type='text',extra='')=>`<div class="field"><label>${l}</label><input id="pp_${k}" type="${type}" value="${esc(p[k]||'')}" ${extra} onchange="prSave27('${id}')"></div>`;
 const fee=(k,l)=>`<div class="field"><label>${l}</label><input id="pf_${k}" type="number" min="0" step="10" value="${f[k]||''}" onchange="prSave27('${id}')"></div>`;
 const journal=(p.journal27||[]).slice().reverse();
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal" style="width:min(1000px,96vw)"><div class="modalHead"><div><h3>${esc(p.name)}</h3><div class="sub">Ajouté le ${datefr(p.createdAt)}${p.owner?' · '+esc(p.owner):''}${p.source?' · '+esc(p.source):''}</div></div><button class="btn secondary" onclick="closeModal()">Fermer</button></div>
 <div class="modalBody">
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${PR_STAGES27.map(s=>`<button class="btn small ${s===st?'':'secondary'}" style="${s===st?`background:${PR_COLORS27[s]};border-color:${PR_COLORS27[s]}`:''}" onclick="prSetStage27('${id}','${s}')">${s}</button>`).join('<span class="sub" style="align-self:center">→</span>')}</div>
  ${c?`<div class="note" style="margin-bottom:12px">Gagné : <a href="#" onclick="event.preventDefault();closeModal();openClient('${c.id}')">fiche client ${esc(c.name)}</a> (${esc(c.status)}).</div>`:cr?`<div class="note" style="margin-bottom:12px">Gagné : dossier <a href="#" onclick="event.preventDefault();closeModal();routePage('creation');crOpen27('${cr.id}')">${esc(cr.name)}</a> dans la Matrice création (${esc(crStatus27(cr))}).</div>`:''}
  ${st==='Perdu'?`<div class="field" style="max-width:380px"><label>Motif de la perte</label><select id="pp_lostReason" onchange="prSave27('${id}')">${['','Prix','Choix d’un autre cabinet','Projet abandonné','Pas de réponse','Hors cible','Autre'].map(o=>`<option ${o===(p.lostReason||'')?'selected':''}>${o}</option>`).join('')}</select></div>`:''}
  <div class="grid2" style="align-items:start">
   <div>
    <h4 style="margin:0 0 6px">Prochaine action</h4>
    <div class="formGrid">${inp('next','Action à faire')}${inp('nextDate','Date','date')}</div>
    <h4 style="margin:14px 0 6px">Coordonnées</h4>
    <div class="formGrid">${inp('name','Société ou projet')}${inp('contact','Contact')}${inp('email','E-mail','email')}${inp('phone','Téléphone')}${inp('owner','Commercial','text','list="pr_team27"')}<datalist id="pr_team27">${prTeam27().map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
     <div class="field"><label>Source</label><select id="pp_source" onchange="prSave27('${id}')"><option value=""></option>${[...new Set([...PR_SOURCES27,p.source].filter(Boolean))].map(s=>`<option ${s===p.source?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
     ${inp('siren','SIREN (si la société existe)','text','inputmode="numeric" maxlength="11"')}<div class="field"><label>&nbsp;</label><button class="btn small secondary" onclick="prLookup27('${id}')">Rechercher la société</button></div></div>
    ${p.identity26?.name?`<div class="sub">${esc(p.identity26.legalForm||'')} · ${esc(p.identity26.address||'')}${p.identity26.capital?' · capital '+esc(p.identity26.capital):''}${p.identity26.directors?.length?' · '+esc(p.identity26.directors.map(d=>d.name).join(', ')):''}</div>`:''}
   </div>
   <div>
    <h4 style="margin:0 0 6px">Besoins et proposition</h4>
    <div class="checks">${PR_NEEDS27.map(([k,l])=>`<label class="check"><input type="checkbox" id="pm_${k}" ${p.missions27?.[k]?'checked':''} onchange="prSave27('${id}')"> ${esc(l)}</label>`).join('')}</div>
    <div class="formGrid" style="margin-top:10px">${fee('accounting','Honoraires courants (an)')}${fee('annualAccounts','Bilan')}${fee('legalAnnual','AGO / juridique annuel')}${fee('other','Autres (an)')}${p.missions27?.creation?`<div class="field"><label>Création de société (HT)</label><input id="pp_creationFees" type="number" min="0" step="10" value="${p.creationFees||''}" onchange="prSave27('${id}')"></div>`:''}
     <div class="field"><label>Mode de facturation</label><select id="pp_billing27" onchange="prSave27('${id}')">${PR_BILLING27.map(o=>`<option ${o===(p.billing27||'A définir')?'selected':''}>${o}</option>`).join('')}</select></div></div>
    <div class="sub">Total : <b id="pp_total">${euro(prValue27(p))}</b> / an${p.missions27?.creation&&p.creationFees?` + ${euro(p.creationFees)} de création`:''}. Repris automatiquement sur la fiche client.</div>
   </div>
  </div>
  <h4 style="margin:16px 0 6px">Échanges</h4>
  <div style="display:flex;gap:8px"><input id="pp_comment" class="search" style="flex:1" placeholder="Compte rendu d’appel, de rendez-vous… (Entrée pour ajouter)" onkeydown="if(event.key==='Enter')prComment27('${id}')"><button class="btn small" onclick="prComment27('${id}')">Ajouter</button></div>
  <div style="margin-top:8px">${journal.map(j=>`<div class="kpiLine" style="align-items:flex-start"><span>${esc(j.text)}</span><span class="sub" style="white-space:nowrap">${new Date(j.at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})} · ${esc(j.user||'')}</span></div>`).join('')||(p.notes?`<div class="sub" style="white-space:pre-wrap">${esc(p.notes)}</div>`:'<div class="sub">Aucun échange noté.</div>')}</div>
 </div>
 <div class="modalFooter" style="display:flex;justify-content:space-between"><button class="btn small secondary" onclick="prDelete27('${id}')">Supprimer</button>${st==='Gagné'||st==='Perdu'?'':`<button class="btn green" onclick="prSetStage27('${id}','Gagné')">Gagné → ${p.missions27?.creation?'Matrice création':'onboarding'}</button>`}</div></div></div>`;
};
function prSave27(id){
 const p=pfind(id);if(!p)return;const g=k=>document.getElementById(k);
 ['name','contact','email','phone','owner','next','nextDate','source','siren','billing27','lostReason'].forEach(k=>{const el=g('pp_'+k);if(el)p[k]=el.value.trim();});
 if(g('pp_creationFees'))p.creationFees=Number(g('pp_creationFees').value||0);
 p.missions27=p.missions27||{};const hadCreation=p.missions27.creation;PR_NEEDS27.forEach(([k])=>{const el=g('pm_'+k);if(el)p.missions27[k]=el.checked;});
 const f=p.fees27||(p.fees27={});['accounting','annualAccounts','legalAnnual','other'].forEach(k=>{const el=g('pf_'+k);if(el)f[k]=Number(el.value||0);});
 p.value=prValue27(p);save();
 if(hadCreation!==p.missions27.creation)openProspect(id);
 else{const t=document.getElementById('pp_total');if(t)t.textContent=euro(prValue27(p));}
}
function prComment27(id){
 const p=pfind(id),el=document.getElementById('pp_comment');if(!p||!el||!el.value.trim())return;
 prSave27(id);(p.journal27=p.journal27||[]).push({at:new Date().toISOString(),user:(typeof me27==='function'&&me27())||shared25.user?.username||'',text:el.value.trim()});
 save();openProspect(id);render();
}
async function prLookup27(id){
 prSave27(id);const p=pfind(id),siren=String(p?.siren||'').replace(/\D/g,'');
 if(!/^\d{9}$/.test(siren))return toast('Renseigne un SIREN de 9 chiffres.');
 try{
  const r=await fetch(shared25.active?'/api/company?siren='+siren:'https://recherche-entreprises.api.gouv.fr/search?q='+siren+'&per_page=1');
  if(!r.ok)throw Error('service de recherche indisponible');
  const d=mapCompany26(await r.json(),siren);p.siren=siren;p.identity26={...(p.identity26||{}),...d};p.legalForm=d.legalForm||p.legalForm;if(d.name&&(!p.name||/^(nouveau|création)/i.test(p.name)))p.name=d.name;
  save();openProspect(id);toast('Société trouvée : '+d.name);
 }catch(e){alert('Recherche impossible : '+e.message);}
}
function prDelete27(id){const p=pfind(id);if(!p||!confirm(`Supprimer le prospect « ${p.name} » ?`))return;state.prospects=state.prospects.filter(x=>x.id!==id);log25('Prospect supprimé','',p.name);closeModal();persist25();}

/* ---------- avancement, « Gagné » ---------- */
function prSetStage27(id,s){
 const p=pfind(id);if(!p)return;if(document.getElementById('pp_name'))prSave27(id);
 const from=prStage27(p);if(from===s)return;
 if(s==='Gagné')return prWin27(id);
 p.stage=s;
 if(s==='Proposition envoyée'){p.sentAt=new Date().toISOString();if(!p.nextDate||p.nextDate<=today27()){p.next='Relancer la proposition';p.nextDate=iso(addDays(new Date(),PR_FOLLOWUP_DAYS27));}}
 if(s==='RDV'&&(!p.next||p.next==='Premier contact'))p.next='Rendez-vous';
 if(s==='Perdu'){p.lostAt=today27();p.nextDate='';}
 (p.journal27=p.journal27||[]).push({at:new Date().toISOString(),user:(typeof me27==='function'&&me27())||'',text:`Statut : ${from} → ${s}`});
 log25('Prospect : '+s,'',p.name);persist25();
 if(document.getElementById('pp_name'))openProspect(id);
}
function prWin27(id){
 const p=pfind(id);if(!p)return;
 if(p.missions27?.creation){
  // Société à créer : dossier dans la Matrice création, la fiche client viendra avec la société.
  let it=p.creation27&&crFind27(p.creation27);
  if(!it){it={id:uid('CR'),name:p.name,legalForm:'',contactName:p.contact||'',contactEmail:p.email||'',deadline:'',fees:Number(p.creationFees||0),fields:{denomination:p.name},files:[],createdAt:new Date().toISOString(),owner:p.owner||'',prospectId:p.id};creation27().items.push(it);p.creation27=it.id;}
  p.stage='Gagné';p.wonAt=today27();p.nextDate='';
  (p.journal27=p.journal27||[]).push({at:new Date().toISOString(),user:(typeof me27==='function'&&me27())||'',text:'Gagné : dossier ouvert dans la Matrice création'});
  log25('Prospect gagné → Matrice création','',p.name);closeModal();state.page='creation';persist25();crOpen27(it.id);
  toast('Dossier ouvert dans la Matrice création : envoie le formulaire au client.');return;
 }
 validateProspect(id);
 const c=state.clients.find(x=>x.prospectId===id);
 if(c){p.stage='Gagné';p.wonAt=today27();p.nextDate='';prApply27(p,c);(p.journal27=p.journal27||[]).push({at:new Date().toISOString(),user:(typeof me27==='function'&&me27())||'',text:'Gagné : fiche client créée en onboarding'});persist25();}
}
/* Reprend sur la fiche client ce qui a été vendu (en plus de validateProspect pour les sociétés existantes). */
function prApply27(p,c){
 const m=p.missions27||{},f=p.fees27||{};
 c.missions={...(c.missions||{})};MISSIONS27.forEach(([k])=>{if(m[k])c.missions[k]=true;});
 if(prValue27(p)){Object.assign(fees27(c),{accounting:Number(f.accounting||0)||(!f.annualAccounts&&!f.legalAnnual&&!f.other?Number(p.value||0):0),annualAccounts:Number(f.annualAccounts||0),legalAnnual:Number(f.legalAnnual||0),other:Number(f.other||0)});syncFees27(c);}
 if(p.owner){c.manager=c.manager||p.owner;(c.people27=c.people27||{}).manager=c.people27.manager||p.owner;}
 if(p.billing27&&p.billing27!=='A définir')c.billing27=p.billing27;
 c.contact={...(c.contact||{}),name:c.contact?.name||p.contact||'',email:c.contact?.email||p.email||'',phone:c.contact?.phone||p.phone||''};
 c.prospectId=c.prospectId||p.id;
}
// Création issue d'un prospect : la fiche client reprend les missions et honoraires vendus.
const previousCrClient27=crClient27;
crClient27=function(id){
 const it=crFind27(id),had=it?.client;previousCrClient27(id);
 const p=it?.prospectId&&pfind(it.prospectId),c=it?.client&&cfind(it.client);
 if(p&&c&&!had){prApply27(p,c);persist25();}
};

/* ---------- import Excel (export Monday « CRM ») ---------- */
function importProspects27(rows,hi){
 const H=rows[hi].map(normHead27),idx=n=>H.indexOf(n);
 const data=rows.slice(hi+1).filter(r=>r[0]&&String(r[0]).trim()&&!['name','subitems'].includes(normHead27(r[0]))&&r.slice(1).some(v=>v!=null&&v!==''));
 if(!confirm(`Importer ${data.length} prospect(s) ?\nUn prospect déjà présent (même nom) est mis à jour.`))return;
 const date=v=>v==null||v===''?'':typeof v==='number'?new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10):/^\d{4}-\d{2}-\d{2}/.test(String(v))?String(v).slice(0,10):'';
 const needMap={'comptabilite':'accounting','tenue comptable':'accounting','fiscalite fr':'tax','bilan fr':'annualAccounts','ago':'legal','paie':'payroll','social':'payroll','irpp':'irpp','reporting':'reporting','creation':'creation','creation de societe':'creation','taxe 3%':'taxe3','conseil':'conseil','juridique':'conseil','facturation electronique':'einvoice'};
 let created=0,updated=0;
 for(const r of data){
  const get=n=>{const i=idx(n);return i<0?null:r[i];},name=String(r[0]).trim();
  let p=state.prospects.find(x=>norm27(x.name)===norm27(name));
  if(!p){p={id:uid('P'),name,missions27:{},fees27:{accounting:0,annualAccounts:0,legalAnnual:0,other:0},value:0,journal27:[]};state.prospects.push(p);created++;}else updated++;
  const s=String(get('statut')||'').trim();p.stage=PR_LEGACY27[s]||PR_LEGACY27[s.replace(/^A /,'À ')]||(/(gagn|sign|valid)/i.test(s)?'Gagné':/(perdu|refus)/i.test(s)?'Perdu':/(rdv|rendez)/i.test(s)?'RDV':/(devis|propos)/i.test(s)?'Proposition envoyée':'À contacter');
  if(get('commercial'))p.owner=String(get('commercial')).split(',')[0].trim();
  const src=String(get('source')||'');if(src&&src!=='A définir')p.source=src;
  if(get('contacts'))p.contact=String(get('contacts'));
  String(get('besoins')||'').split(',').map(x=>normHead27(x)).filter(Boolean).forEach(n=>{const k=needMap[n]||Object.entries(needMap).find(([l])=>n.startsWith(l))?.[1];if(k)p.missions27[k]=true;});
  if(get('typologie'))p.typo27=String(get('typologie'));
  p.createdAt=date(get('date de rajout'))||p.createdAt||today27();
  const mf=String(get('mode de facturation')||'');if(mf&&mf!=='A définir')p.billing27=mf;
  const com=String(get('commentaires')||'');if(com&&!(p.journal27||[]).some(j=>j.text.includes(com)))(p.journal27=p.journal27||[]).push({at:new Date().toISOString(),user:'Import',text:'Commentaires Monday : '+com});
  const pf=String(get('porte-feuilles clients')||'').split(',')[0].trim(),c=pf&&state.clients.find(x=>norm27(x.name)===norm27(pf));
  if(c&&!state.clients.some(x=>x.prospectId===p.id&&x.id!==c.id)){c.prospectId=c.prospectId||p.id;}
  const mc=String(get('matrice creation')||'').split(',')[0].trim(),it=mc&&creation27().items.find(x=>norm27(x.name)===norm27(mc));
  if(it){p.creation27=it.id;it.prospectId=it.prospectId||p.id;p.missions27.creation=true;}
  if(p.stage==='Gagné')p.wonAt=p.wonAt||p.createdAt;
 }
 log25('Import Excel Prospects','',`${created} créé(s), ${updated} mis à jour`);state.page='prospects';persist25();
 toast(`Prospects : ${created} créé(s), ${updated} mis à jour.`);
}
const previousImportProspects27=importBoard27;
importBoard27=async function(file){
 if(!file)return;
 let rows;try{rows=await readXlsx27(file);}catch(e){return previousImportProspects27(file);}
 const hi=rows.findIndex(r=>normHead27(r[0])==='name');
 if(hi>=0&&['commercial','besoins','typologie'].every(h=>rows[hi].some(x=>normHead27(x)===h)))return importProspects27(rows,hi);
 return previousImportProspects27(file);
};

prospects=prospectsPage27;
const previousRenderProspects27=render;
render=function(){
 previousRenderProspects27();
 if(state.page==='cabinetdash'){const n=(state.prospects||[]).filter(p=>prFollow27(p)?.late).length,root=document.getElementById('root');if(n&&!root.querySelector('.prNote27')){const d=document.createElement('div');d.className='note prNote27';d.style.margin='0 0 12px';d.style.cursor='pointer';d.onclick=()=>routePage('prospects');d.innerHTML=`<b>Prospects :</b> ${n} prospect(s) à relancer.`;root.querySelector('.titleRow')?.after(d);}}
};
