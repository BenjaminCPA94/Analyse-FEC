/* RB Partners V27 — Lot 3 : navigation, « Mon travail », fiche client, préférences personnelles.
 *  - Menu : Pilotage · Clients · Production · Honoraires · Mon travail · Organisation · Paramètres.
 *  - Mon travail : les tâches sont déduites des tableaux existants (bilans, AGO, fiscalité, onboarding, travaux,
 *    créations, facturation, pièces attendues) : aucune double saisie. Chaque tâche indique client, action, période,
 *    date cible interne, échéance officielle, responsable, blocage, prochaine action, et ouvre le dossier.
 *  - Suivi d'une tâche (responsable, relecteur, blocage, prochaine action, relance) : state.tasks27, partagé.
 *  - Préférences d'affichage (filtres, vues, onglets) : propres à chaque utilisateur, gardées sur son poste. */

/* ---------- Identité : compte CRM ↔ membre de l'équipe ---------- */
// Le compte est relié explicitement à un collaborateur (Charge équipe › Compte CRM) ; jamais d'attribution par défaut.
me27=function(){const u=(shared25.user?.username||'').toLowerCase();if(!u)return shared25.active?'':(activeTeam27()[0]?.name||'');return team27().find(m=>String(m.user||'').toLowerCase()===u)?.name||'';};
function meMember27(){const n=me27();return n?team27().find(m=>m.name===n):null;}
function teamView27(){return !shared25.active||['admin','associe','manager'].includes(shared25.user?.role);}

/* ---------- Préférences personnelles (sur le poste) ---------- */
const prefs27={loaded:false};
function prefKey27(){return 'rb_prefs27_'+(shared25.user?.username||'local');}
function prefsSave27(){try{const o={};for(const p of PREF_PATHS27){const v=p.reduce((x,k)=>x?.[k],state);if(v!==undefined)o[p.join('.')]=v;}localStorage.setItem(prefKey27(),JSON.stringify(o));}catch(e){}}
function prefsLoad27(){try{const o=JSON.parse(localStorage.getItem(prefKey27())||'null');if(!o)return;for(const [k,v] of Object.entries(o)){const p=k.split('.');let t=state;for(const x of p.slice(0,-1))t=t[x]=t[x]&&typeof t[x]==='object'?t[x]:{};t[p[p.length-1]]=v;}}catch(e){}}
const previousSaveWork27=save;
save=function(){prefsSave27();return previousSaveWork27.apply(this,arguments);};

/* ---------- Menu ---------- */
const NAV27=[
 ['Pilotage',[['cabinetdash','▦ Tableau de bord']]],
 ['Clients',[['prospects','↗ Prospects'],['creation','✎ Créations de société'],['onboarding','◎ Onboarding'],['clients','▣ Portefeuille clients']]],
 ['Production',[['fiscal','◫ Fiscalité'],['closing','◩ Clôture & Bilan'],['legal','⌘ Juridique annuel / AGO'],['exceptional','✦ Travaux exceptionnels']]],
 ['Honoraires',[['billing','$ Facturation'],['fees','€ Contrôle honoraires'],['feereview','€ Revue des honoraires']]],
 ['Mon travail',[['work','◎ Mon travail'],['time','◷ Saisie des temps']]],
 ['Organisation',[['capacity','◉ Charge équipe'],['quality','✓ Qualité du portefeuille'],['profit','€ Rentabilité']]],
 ['Paramètres',[['rules','⚙ Comptes, imports et connexions']]],
];
function buildNav27(){
 const nav=document.querySelector('.nav');if(!nav)return;
 nav.innerHTML=NAV27.map(([sec,links])=>`<div class="navsec">${sec}</div>`+links.map(([p,l])=>`<a href="#" data-page="${p}">${l}</a>`).join('')).join('');
 nav.querySelectorAll('a').forEach(a=>a.onclick=e=>{e.preventDefault();window.nav(a.dataset.page);});
}
buildNav27();

/* ---------- Suivi des tâches (partagé) ---------- */
function taskMeta27(key){const t=state.tasks27=state.tasks27||{};return t[key]||{};}
function setTaskMeta27(key,k,v){const t=state.tasks27=state.tasks27||{},m=t[key]=t[key]||{};if(v==null||v==='')delete m[k];else m[k]=v;m.at=new Date().toISOString();m.by=shared25.user?.username||'';if(!Object.keys(m).some(x=>!['at','by'].includes(x)))delete t[key];save();render();}
const WAIT27=/attente client|attente du client|Réponse partielle|Mail préparé|En attente client/i,REVIEW27=/A revoir|À revoir|En revue|Validée – à déposer|Montant validé|Validation client|Informations reçues/i,BLOCK27=/Bloqu/i;
const LEAD27={fiscal:3,bilan:20,ago:15,onb:0,exc:3,creation:0,billing:0,piece:0,prospect:0};
function minusDays27(d,n){if(!d)return '';const x=new Date(d+'T12:00:00');x.setDate(x.getDate()-n);return iso(x);}
/* Toutes les tâches ouvertes, déduites des données (une seule par élément). */
function tasks27(){
 const out=[],y=boards27().year,fy=new Date().getFullYear(),t=today27(),horizon=iso(addDays(new Date(),45)),past=iso(addDays(new Date(),-120));
 const add=x=>{const m=taskMeta27(x.key);x.meta=m;x.owner=m.owner||x.owner||'';x.target=x.target||minusDays27(x.official,LEAD27[x.src]||0)||x.official||'';out.push(x);};
 for(const c of state.clients){
  if(c.status==='Inactif')continue;
  const team=[people27(c,'collab'),people27(c,'manager')].filter(Boolean).join(', ');
  for(const [kind,label,page] of [['bilan','Bilan','closing'],['ago','Juridique annuel / AGO','legal']]){
   const x=ctx27(kind,c,y),g=group27(x);if(['Terminés','Non concernés'].includes(g))continue;
   const d=dueOf27(x),st=kind==='bilan'?val27(x,'etat'):val27(x,'statut');
   add({key:(kind==='bilan'?'B|':'J|')+c.id+'|'+y,src:kind,c,action:`${label} ${y}`,status:st||g,period:'Exercice '+y,official:d?.due||'',owner:team,page});
  }
  if(c.missions?.tax||c.fisc27){const r=row27('fiscm',c.id,fy);for(const o of obligations27(c,fy)){const st=r[o.key]||o.def;if(fiscDone27(o,st)||o.due>horizon||o.due<past)continue;add({key:'F|'+c.id+'|'+o.key+'|'+fy,src:'fiscal',c,action:o.label,status:st,period:MONTHS27[o.m-1]+' '+fy,official:o.dueOfficial||o.due,target:o.target,owner:team,page:'fiscal'});}}
  if(isOnboarding27(c)){const rest=ONB_ORDER27.filter(i=>!['Fait','NA'].includes(onbStep27(c,i)));if(rest.length){const i=rest[0],blk=rest.find(j=>onbStep27(c,j)==='Bloqué');add({key:'O|'+c.id,src:'onb',c,action:`Onboarding : ${ONB_STEPS27[i][1]} (${rest.length} étape(s) restante(s))`,status:blk!=null?'Bloqué':onbStep27(c,i),period:'Mise en place',official:val27(ctx27('onb',c,0),'deadline')||'',owner:onb27(c).p[i]||team,page:'onboarding'});}}
 }
 for(const w of exc27().items){const c=cfind(w.client);if(!c||w.statut==='Terminé')continue;add({key:'X|'+w.id,src:'exc',c,action:w.name,status:w.statut||'A faire',period:String(w.date||'').slice(0,4),official:w.deadline||'',owner:w.realise||people27(c,'collab'),reviewer:w.revu||'',page:'exceptional'});}
 if(typeof creation27==='function')for(const it of creation27().items){const st=crStatus27(it);if(['Société créée','Abandonné','À envoyer'].includes(st))continue;const act={'Mail préparé':'Confirmer l’envoi du formulaire','En attente du client':'Formulaire de création attendu','Réponse partielle':'Formulaire de création commencé par le client','Informations reçues':'Contrôler les informations reçues','Contrôlé':'Rédiger les statuts','Statuts en cours':'Finaliser les statuts','Dépôt au greffe':'Suivre le dépôt au greffe'}[st]||st;add({key:'R|'+it.id,src:'creation',c:it.client&&cfind(it.client)||{id:'',name:it.name},action:act,status:Object.keys(it.clientChanges||{}).length?'À revoir':st,period:'Création',official:it.deadline||'',owner:it.owner||'',page:'creation',crId:it.id});}
 if(typeof toBill27==='function')for(const b of toBill27()){add({key:'P|'+b.key,src:'billing',c:b.c,action:`Facturer : ${b.label} (${euro(b.amount)} HT)`,status:'À facturer',period:String(b.y||''),official:'',owner:[people27(b.c,'manager'),people27(b.c,'associe')].filter(Boolean).join(', '),page:'billing'});}
 for(const r of (state.ops25?.requests||[]).filter(r=>!r.received&&!r.cancelled)){const c=cfind(r.client);if(!c)continue;add({key:'Q|'+r.id,src:'piece',c,action:'Pièce attendue : '+r.label,status:'En attente client',period:r.period,official:r.due,owner:people27(c,'collab'),page:'clients'});}
 return out;
}
function taskBucket27(x){
 const t=today27(),d=x.meta.relance||x.target||x.official,blocked=x.meta.blocker||BLOCK27.test(x.status||'');
 return {blocked,waiting:WAIT27.test(x.status||'')&&!blocked,review:REVIEW27.test(x.status||'')&&!blocked,late:Boolean(x.official&&x.official<t)||Boolean(x.target&&x.target<t),today:Boolean(d&&d<=t),week:Boolean(d&&d<=iso(addDays(new Date(),7)))};
}
function taskWhy27(x){
 const t=today27(),n=d=>Math.round((new Date(d+'T12:00:00')-new Date(t+'T12:00:00'))/864e5);
 if(x.official&&x.official<t)return {txt:`échéance dépassée de ${-n(x.official)} j`,cls:'bad',score:1000-n(x.official)};
 if(x.target&&x.target<t)return {txt:`date cible dépassée de ${-n(x.target)} j`,cls:'bad',score:600-n(x.target)};
 if(x.meta.blocker||BLOCK27.test(x.status||''))return {txt:'bloqué',cls:'bad',score:500};
 const d=x.target||x.official;
 if(d)return {txt:n(d)===0?'aujourd’hui':`dans ${n(d)} j`,cls:n(d)<=3?'warn':'',score:300-n(d)};
 return {txt:'sans date',cls:'sub',score:0};
}
function mine27(x,who){if(!who)return true;const w=who.toLowerCase();return String(x.owner||'').toLowerCase().split(/\s*,\s*/).includes(w)||String(x.meta.reviewer||x.reviewer||'').toLowerCase().split(/\s*,\s*/).includes(w);}
const WORK_VIEWS27=[['today','Aujourd’hui'],['week','Cette semaine'],['late','En retard'],['waiting','En attente du client'],['review','À revoir'],['blocked','Bloqué'],['noaction','Sans prochaine action'],['all','Tout']];
function workPrefs27(){if(!state.work27)state.work27={view:'today',who:null,src:''};return state.work27;}
function workPage27(){
 const p=workPrefs27(),me=me27(),team=teamView27(),who=p.who==null?me:p.who,all=tasks27();
 const scoped=all.filter(x=>mine27(x,who)&&(!p.src||x.src===p.src));
 const inView=(x,v)=>{const b=taskBucket27(x);return v==='all'?true:v==='today'?(b.today||b.late)&&!b.waiting:v==='week'?b.week&&!b.waiting:v==='late'?b.late:v==='waiting'?b.waiting:v==='review'?b.review:v==='blocked'?b.blocked:false;};
 const noAction=state.clients.filter(c=>c.status==='Actif'&&(!who||inPeople27(c,who))&&!all.some(x=>x.c.id===c.id&&(x.official||x.target||x.meta.next)));
 const list=p.view==='noaction'?[]:scoped.filter(x=>inView(x,p.view)).map(x=>({...x,why:taskWhy27(x)})).sort((a,b)=>b.why.score-a.why.score);
 const count=v=>v==='noaction'?noAction.length:scoped.filter(x=>inView(x,v)).length;
 const people=[...new Set(activeTeam27().map(m=>m.name))];
 const SRC={bilan:'Bilan',ago:'AGO',fiscal:'Fiscalité',onb:'Onboarding',exc:'Travaux exc.',creation:'Création',billing:'Facturation',piece:'Pièces',prospect:'Prospect'};
 return `<div class="titleRow"><div><h1>Mon travail</h1><div class="sub">Tâches déduites des tableaux du CRM, triées par priorité : échéance dépassée, date cible dépassée, blocage, puis date la plus proche. Clique sur une ligne pour la suivre (responsable, relecteur, blocage, prochaine action, relance).</div></div>
 <div class="v25actions">${team?`<select class="statusSelect" onchange="workPrefs27().who=this.value==='__all'?'':this.value;save();render()"><option value="${esc(me)}" ${who===me?'selected':''}>${me?'Moi ('+esc(me)+')':'Moi (compte non relié)'}</option><option value="__all" ${who===''?'selected':''}>Toute l’équipe</option>${people.filter(n=>n!==me).map(n=>`<option ${n===who?'selected':''}>${esc(n)}</option>`).join('')}</select>`:''}<select class="statusSelect" onchange="workPrefs27().src=this.value;save();render()"><option value="">Tous les types</option>${Object.entries(SRC).map(([k,l])=>`<option value="${k}" ${p.src===k?'selected':''}>${l}</option>`).join('')}</select></div></div>
 ${shared25.active&&!me?'<div class="note" style="margin-bottom:12px">Ton compte n’est relié à aucun collaborateur : aucune tâche ne peut t’être attribuée. Demande à un associé de renseigner ton identifiant dans <b>Charge équipe › Compte CRM</b>.</div>':''}
 <div class="tabs27">${WORK_VIEWS27.map(([k,l])=>`<button class="${p.view===k?'on':''}" onclick="workPrefs27().view='${k}';save();render()">${l} <span class="sub">${count(k)}</span></button>`).join('')}</div>
 ${p.view==='noaction'?`<div class="panel"><div class="panelHead"><h3>Dossiers actifs sans prochaine action</h3><span class="sub">Aucune échéance, aucune tâche datée et aucune prochaine action renseignée</span></div><table><tbody>${noAction.map(c=>`<tr><td><b><a href="#" onclick="event.preventDefault();openClient('${c.id}')">${esc(c.name)}</a></b></td><td class="sub">${esc(people27(c,'manager')||'')}</td></tr>`).join('')||'<tr><td class="sub">Aucun.</td></tr>'}</tbody></table></div>`:
 `<div class="panel"><div class="board27" data-k="work" style="--g:#1768c6"><table><thead><tr><th class="n27">Client</th><th>Action</th><th>Type</th><th>Période</th><th>Date cible</th><th>Échéance officielle</th><th>Priorité</th><th>Responsable</th><th>Blocage</th><th>Prochaine action</th><th></th></tr></thead><tbody>${list.slice(0,400).map(x=>`<tr><td class="n27"><div class="name27"><a href="#" onclick="event.preventDefault();${x.c.id?`openClient('${x.c.id}')`:x.c.pid?`nav('prospects');openProspect('${x.c.pid}')`:`routePage('creation')`}" title="${esc(x.c.name)}">${esc(x.c.name)}</a></div></td><td style="text-align:left;padding:0 8px;min-width:240px">${esc(x.action)} <span class="sub">· ${esc(x.status||'')}</span></td><td>${SRC[x.src]}</td><td>${esc(x.period||'')}</td><td>${datefr(x.meta.relance||x.target)}</td><td>${datefr(x.official)}</td><td class="${x.why.cls}" style="padding:0 8px">${esc(x.why.txt)}</td><td style="padding:0 8px">${esc(x.owner||'—')}${x.meta.reviewer||x.reviewer?`<div class="sub">relecture : ${esc(x.meta.reviewer||x.reviewer)}</div>`:''}</td><td class="bad" style="padding:0 8px">${esc(x.meta.blocker||'')}</td><td style="padding:0 8px;text-align:left">${esc(x.meta.next||'')}</td><td style="white-space:nowrap;padding:0 6px"><button class="btn small light" onclick="taskPanel27('${esc(x.key)}')">Suivre</button> <button class="btn small secondary" onclick="${x.crId?`routePage('creation');crOpen27('${x.crId}')`:`routePage('${x.page}','${x.c.id}')`}">Ouvrir</button></td></tr>`).join('')||`<tr><td colspan="11" class="sub" style="padding:14px">Rien dans cette vue.</td></tr>`}</tbody></table></div></div>`}`;
}
function taskPanel27(key){
 const x=tasks27().find(t=>t.key===key);if(!x)return;const m=x.meta,people=activeTeam27().map(p=>p.name);
 const f=(k,l,type='text',list='')=>`<div class="field"><label>${l}</label><input id="tm_${k}" type="${type}" value="${esc(m[k]||'')}" ${list?`list="${list}"`:''}></div>`;
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal" style="width:min(640px,96vw)"><div class="modalHead"><div><h3>${esc(x.action)}</h3><div class="sub">${esc(x.c.name)} · ${esc(x.period||'')} · ${esc(x.status||'')}${x.official?' · échéance '+datefr(x.official):''}</div></div><button class="btn secondary" onclick="closeModal()">Fermer</button></div><div class="modalBody">
 <datalist id="tm_people">${people.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
 <div class="formGrid">${f('owner','Responsable','text','tm_people')}${f('reviewer','Relecteur','text','tm_people')}${f('next','Prochaine action')}${f('relance','Date de relance','date')}<div class="field" style="grid-column:1/-1"><label>Blocage (ce qui empêche d’avancer, qui doit intervenir)</label><input id="tm_blocker" value="${esc(m.blocker||'')}"></div><div class="field" style="grid-column:1/-1"><label>Note</label><textarea id="tm_note" rows="2">${esc(m.note||'')}</textarea></div></div>
 ${m.by?`<div class="sub">Dernière mise à jour par ${esc(m.by)} le ${new Date(m.at).toLocaleString('fr-FR')}</div>`:''}</div>
 <div class="modalFooter" style="display:flex;justify-content:flex-end"><button class="btn green" onclick="saveTask27('${esc(key)}')">Enregistrer</button></div></div></div>`;
}
function saveTask27(key){
 const t=state.tasks27=state.tasks27||{},m={};
 for(const k of ['owner','reviewer','next','relance','blocker','note']){const v=document.getElementById('tm_'+k)?.value.trim();if(v)m[k]=v;}
 if(m.relance&&!/^\d{4}-\d{2}-\d{2}$/.test(m.relance))return toast('Date de relance invalide.');
 if(Object.keys(m).length){t[key]={...m,at:new Date().toISOString(),by:shared25.user?.username||''};}else delete t[key];
 log25('Suivi de tâche mis à jour','',key);closeModal();persist25();
}

/* ---------- Fiche client : identité et contacts, équipe, documents ---------- */
const PROFILE_FIELDS27=[['language','Langue de communication',['Français','Anglais','Autre']],['group','Groupe de sociétés'],['opName','Contact opérationnel'],['opEmail','E-mail du contact opérationnel'],['opPhone','Téléphone du contact opérationnel'],['signer','Signataire (lettre de mission, AGO)'],['billTo','Destinataire de facturation (e-mail)'],['reporting','Calendrier de reporting',['Aucun','Mensuel','Trimestriel','Semestriel','Annuel']],['kind','Profil du dossier',['Société opérationnelle','Création','Reprise','Holding','Implantation étrangère','SCI / patrimonial']],['regIdForeign','Immatriculation étrangère (si pas de SIREN)']];
function profile27(c){return c.profile27||{};}
function setProfile27(cid,k,v){const c=cfind(cid);if(!c)return;c.profile27={...(c.profile27||{}),[k]:v};if(k==='group')c.group27=v;log25('Fiche client mise à jour',cid,k);persist25();}
function setMissionDate27(cid,k,which,v){const c=cfind(cid);if(!c)return;const d=c.missionDates27=c.missionDates27||{};d[k]={...(d[k]||{}),[which]:v};log25('Dates de mission',cid,k+' '+which+' '+v);persist25();}
function setPeople27(cid,k,v){const c=cfind(cid);if(!c)return;(c.people27=c.people27||{})[k]=v;persist25();}
function identTab27(c){
 const p=profile27(c),inp=(k,l,opts)=>`<div class="field"><label>${l}</label>${opts?`<select onchange="setProfile27('${c.id}','${k}',this.value)"><option value=""></option>${opts.map(o=>`<option ${o===p[k]?'selected':''}>${o}</option>`).join('')}</select>`:`<input value="${esc(k==='group'?(p.group??c.group27??''):(p[k]||''))}" onchange="setProfile27('${c.id}','${k}',this.value.trim())">`}</div>`;
 return `<div class="grid2" style="align-items:start"><div class="panel"><div class="panelHead"><h3>Identité et contacts</h3><button class="btn small light" onclick="identityDialog26('client','${c.id}')">Raison sociale, SIREN, adresse…</button></div><div class="panelBody"><div class="formGrid">${PROFILE_FIELDS27.map(([k,l,o])=>inp(k,l,o)).join('')}</div></div></div>
 <div class="panel"><div class="panelHead"><h3>Équipe</h3></div><div class="panelBody"><div class="formGrid">${[['associe','Associé'],['manager','Manager'],['collab','Collaborateurs'],['reviewer','Relecteur']].map(([k,l])=>`<div class="field"><label>${l}</label><input value="${esc(people27(c,k)||c.people27?.[k]||'')}" onchange="setPeople27('${c.id}','${k}',this.value.trim())"></div>`).join('')}</div></div></div></div>
 <div class="panel"><div class="panelHead"><h3>Missions et dates</h3><span class="sub">Une mission terminée ne génère plus d’échéances après sa date de fin</span></div><table><thead><tr><th>Mission</th><th>Active</th><th>Début</th><th>Fin</th></tr></thead><tbody>${MISSIONS27.map(([k,l])=>{const d=c.missionDates27?.[k]||{};return `<tr><td>${esc(l)}</td><td>${c.missions?.[k]?'<span class="badge green">Oui</span>':'<span class="sub">Non</span>'}</td><td><input type="date" value="${esc(d.from||'')}" onchange="setMissionDate27('${c.id}','${k}','from',this.value)"></td><td><input type="date" value="${esc(d.to||'')}" onchange="setMissionDate27('${c.id}','${k}','to',this.value)"></td></tr>`;}).join('')}</tbody></table></div>`;
}
function docsTab27(c){
 const reqs=(state.ops25?.requests||[]).filter(r=>r.client===c.id&&!r.cancelled),cr=typeof creation27==='function'?creation27().items.find(x=>x.client===c.id):null;
 return `<div class="panel"><div class="panelHead"><h3>Liens du dossier</h3></div><div class="panelBody">${Object.entries(c.links||{}).map(([k,u])=>`<a class="btn small secondary" style="margin:2px" href="${esc(u)}" target="_blank" rel="noopener">${esc(k)}</a>`).join('')}</div></div>
 <div class="panel"><div class="panelHead"><h3>Pièces demandées au client</h3><button class="btn small light" onclick="routePage('collect25','${c.id}')">Demander une pièce</button></div><table><thead><tr><th>Pièce</th><th>Période</th><th>Attendue le</th><th>État</th></tr></thead><tbody>${reqs.map(r=>`<tr><td>${esc(r.label)}</td><td>${esc(r.period)}</td><td>${datefr(r.due)}</td><td>${r.received?`<span class="badge green">Reçue</span> <span class="sub">${esc(r.proof||'')}</span>`:'<span class="badge orange">À recevoir</span>'}</td></tr>`).join('')||'<tr><td colspan="4" class="sub">Aucune pièce demandée.</td></tr>'}</tbody></table></div>
 ${cr?`<div class="panel"><div class="panelHead"><h3>Justificatifs de création</h3><button class="btn small light" onclick="routePage('creation');crOpen27('${cr.id}')">Dossier de création</button></div><div class="panelBody">${CR_FILES27.map(f=>{const d=crDocs27(cr,f.key);return `<div class="kpiLine"><span>${esc(f.label.split(',')[0])}</span><b>${d.length?d.map(y=>`<a href="${esc(crFileHref27(cr,y))}" target="_blank" rel="noopener">${esc(y.name)}</a>`).join(', '):'<span class="sub">—</span>'}</b></div>`;}).join('')}</div></div>`:''}`;
}
const CLIENT_TABS27=[['ident','Identité et équipe'],['docs','Documents']];
const previousClientPage27=clientPage27;
clientPage27=function(){
 const tab=state.clientTab27||'synthese',c=cfind(state.selectedClient)||state.clients[0];
 let html=previousClientPage27();
 html=html.replace(/(<div class="tabs27">[\s\S]*?)(<\/div>)/,(m,a,b)=>a+CLIENT_TABS27.concat(window.CLIENT_TABS_MORE27||[]).map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="clientTab27('${k}')">${l}</button>`).join('')+b);
 if(c&&tab==='ident')html+=identTab27(c);
 if(c&&tab==='docs')html+=docsTab27(c);
 return html;
};
clientPage=clientPage27;

/* ---------- Tableaux : en-têtes fixes, colonne client fixe, défilement conservé ---------- */
(function(){const s=document.createElement('style');s.textContent=`.board27{max-height:72vh;overflow:auto}.board27 thead th{position:sticky;top:0;z-index:3}.board27 thead th.n27{z-index:4}
.board27 tbody tr:focus-within td{background:#f5f8ff}`;document.head.append(s);})();

/* ---------- Affichage ---------- */
const previousRenderWork27=render;
render=function(){
 if(shared25.ready&&!prefs27.loaded){prefs27.loaded=true;prefsLoad27();if(!state.page||state.page==='cabinetdash')state.page='work';}
 // Défilement vertical des tableaux conservé (en plus de l'horizontal).
 const keep={};document.querySelectorAll('.board27[data-k]').forEach(e=>{keep[e.dataset.k]=e.scrollTop;});
 previousRenderWork27();
 document.querySelectorAll('.board27[data-k]').forEach(e=>{if(keep[e.dataset.k])e.scrollTop=keep[e.dataset.k];});
 if(state.page==='work'){document.getElementById('root').innerHTML=workPage27();}
 document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===state.page));
};
