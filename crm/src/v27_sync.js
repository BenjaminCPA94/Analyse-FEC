/* RB Partners V27 — enregistrement fiable et accès.
 *  - Conflit (quelqu'un a enregistré entre-temps) : fusion élément par élément (client, facture, temps…) et champ par champ.
 *    Ce que chacun a modifié de son côté est conservé ; si le même champ a été modifié des deux côtés, la version du serveur
 *    est gardée, l'écart est affiché et ta valeur peut être reprise d'un clic. Ta version complète reste en brouillon local.
 *  - Refus du serveur (droits, données incohérentes) : message explicite, brouillon conservé, rechargement maîtrisé.
 *  - Comptes : rôles administrateur / associé / manager / collaborateur, révocation des sessions, journal serveur,
 *    sauvegardes et restauration (administrateur). */
const ROLE_LABELS27={admin:'Administrateur',associe:'Associé',manager:'Manager',collaborateur:'Collaborateur'};
// Préférences d'affichage : propres à chaque poste, jamais imposées aux autres lors d'une fusion.
const PREF_KEYS27=['page','selectedClient','clientTab27','reviewPeriod25','timeDraft27'];
const sync27={conflicts:[],audit:null,backups:null};
function perm27(p){return !shared25.active||Boolean(shared25.user?.perms?.[p]);}

/* ---------- Fusion à trois versions ---------- */
const isObj27=v=>v&&typeof v==='object'&&!Array.isArray(v);
const same27=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const idList27=a=>Array.isArray(a)&&a.length>0&&a.every(x=>isObj27(x)&&typeof x.id==='string');
function label27(path,obj){const n=obj&&(obj.name||obj.label||obj.number);return path+(n?' « '+n+' »':'');}
function merge27(base,mine,theirs,path,out){
 if(same27(mine,base))return theirs;
 if(same27(theirs,base)||same27(mine,theirs))return mine;
 if(isObj27(base)&&isObj27(mine)&&isObj27(theirs)){
  const r={};for(const k of new Set([...Object.keys(theirs),...Object.keys(mine),...Object.keys(base)])){const v=merge27(base[k],mine[k],theirs[k],path.concat(k),out);if(v!==undefined)r[k]=v;}return r;
 }
 if((idList27(base)||idList27(mine)||idList27(theirs))&&[base,mine,theirs].every(a=>a==null||Array.isArray(a))){
  const B=new Map((base||[]).map(x=>[x.id,x])),M=new Map((mine||[]).map(x=>[x.id,x])),T=new Map((theirs||[]).map(x=>[x.id,x])),r=[];
  const order=[...(theirs||[]).map(x=>x.id),...(mine||[]).map(x=>x.id).filter(id=>!T.has(id))];
  for(const id of order){
   const b=B.get(id),m=M.get(id),t=T.get(id),p=path.concat('#'+id);
   if(!b){if(m&&t&&!same27(m,t)){out.push({path:p,label:label27(p.join(' › '),t),mine:m,theirs:t});r.push(t);}else r.push(t||m);continue;}
   if(!m&&!t)continue;
   if(!m){if(same27(t,b))continue;out.push({path:p,label:label27(p.join(' › '),t),mine:null,theirs:t,note:'supprimé de ton côté, modifié par un collègue'});r.push(t);continue;}
   if(!t){if(same27(m,b))continue;out.push({path:p,label:label27(p.join(' › '),m),mine:m,theirs:null,note:'modifié de ton côté, supprimé par un collègue'});continue;}
   r.push(merge27(b,m,t,p,out));
  }
  return r;
 }
 out.push({path,label:path.join(' › '),mine,theirs});return theirs;
}
function mergeStates27(base,mine,theirs){
 const out=[],merged=merge27(base,mine,theirs,[],out);
 for(const k of PREF_KEYS27)if(k in mine)merged[k]=mine[k];
 return {merged,conflicts:out.filter(c=>!PREF_KEYS27.includes(c.path[0]))};
}
/* Applique une valeur à un chemin (les éléments de liste sont désignés par « #id »). */
function setPath27(root,path,value){
 let o=root;
 for(let i=0;i<path.length-1;i++){const k=path[i];o=String(k).startsWith('#')?o.find(x=>x.id===k.slice(1)):o[k];if(o==null)return false;}
 const last=path[path.length-1];
 if(String(last).startsWith('#')){const id=last.slice(1),i=o.findIndex(x=>x.id===id);if(value==null){if(i>=0)o.splice(i,1);}else if(i>=0)o[i]=value;else o.push(value);}
 else if(value===undefined)delete o[last];else o[last]=value;
 return true;
}

/* ---------- Brouillon local ---------- */
function draftKey27(){return 'rb_draft27_'+(shared25.user?.username||'local');}
function draftKeep27(reason){try{localStorage.setItem(draftKey27(),JSON.stringify({at:new Date().toISOString(),reason,revision:shared25.revision,state}));}catch(e){}}
function draftClear27(){try{localStorage.removeItem(draftKey27());}catch(e){}}
function draftGet27(){try{return JSON.parse(localStorage.getItem(draftKey27())||'null');}catch(e){return null;}}
function draftDownload27(){const d=draftGet27();if(d)download25('RB_Partners_brouillon_'+d.at.slice(0,16).replace(/[:T]/g,'-')+'.json',JSON.stringify({format:'RB25',draft:true,savedAt:d.at,reason:d.reason,state:d.state},null,2));}

/* ---------- Enregistrement ---------- */
flush25=async function(){
 if(shared25.busy||!shared25.pending||shared25.conflict)return;
 shared25.busy=true;const payload=shared25.pending;shared25.pending=null;let retryConflict=false;
 try{
  const r=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:shared25.revision,state:JSON.parse(payload)})});
  const x=await r.json().catch(()=>({}));
  if(r.status===409){shared25.pending=shared25.pending||payload;retryConflict=true;return;}
  if(!r.ok){shared25.pending=shared25.pending||payload;draftKeep27(x.error||'refus '+r.status);throw Error((r.status===403?'Refusé par le serveur (droits) : ':r.status===422?'Refusé par le serveur : ':'')+(x.error||'Enregistrement refusé ('+r.status+')'));}
  shared25.revision=x.revision;shared25.base=payload;shared25.error='';
  // Le brouillon reste disponible tant que des écarts de conflit n'ont pas été traités.
  if(!shared25.pending&&!sync27.conflicts.some(c=>!c.done))draftClear27();
 }catch(e){shared25.error=e.message;if(!/^Refusé/.test(e.message))draftKeep27(e.message);}
 finally{
  shared25.busy=false;
  if(retryConflict){await resolveConflict27();return;}
  status25();if(shared25.pending&&!shared25.error)flush25();
 }
};
async function resolveConflict27(){
 shared25.busy=true;
 try{
  draftKeep27('conflit');
  const r=await fetch('/api/state');if(!r.ok)throw Error('Rechargement impossible ('+r.status+')');
  const mine=JSON.parse(JSON.stringify(state)),theirs=await r.json(),base=JSON.parse(shared25.base||'{}');
  let {merged,conflicts}=mergeStates27(base,mine,theirs.state||{});
  // Modifications faites pendant le rechargement : réappliquées par-dessus le résultat de la fusion.
  const now=JSON.parse(JSON.stringify(state));
  if(!same27(now,mine))merged=mergeStates27(mine,now,merged).merged;
  state=merged;shared25.revision=theirs.revision;shared25.base=JSON.stringify(theirs.state);shared25.pending=JSON.stringify(state);shared25.error='';shared25.conflict=false;
  sync27.conflicts=conflicts;sync27.by=theirs.updatedBy||'un collègue';
  init25();render();
  if(conflicts.length)showConflicts27();else toast(`Enregistrement simultané de ${sync27.by} : tes modifications ont été fusionnées avec les siennes.`);
 }catch(e){shared25.error='Conflit non résolu : '+e.message;shared25.conflict=true;}
 finally{shared25.busy=false;status25();if(shared25.pending&&!shared25.conflict)flush25();}
}
function short27(v){if(v==null)return '—';const t=typeof v==='object'?(v.name||v.label||JSON.stringify(v)):String(v);return t.length>90?t.slice(0,90)+'…':t;}
function showConflicts27(){
 const list=sync27.conflicts;
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal" style="width:min(900px,96vw)"><div class="modalHead"><div><h3>Enregistrement simultané avec ${esc(sync27.by)}</h3><div class="sub">Tes autres modifications sont fusionnées et enregistrées. Pour ${list.length} élément(s) modifié(s) des deux côtés, la version du serveur a été gardée.</div></div><button class="btn secondary" onclick="closeModal()">Fermer</button></div>
 <div class="modalBody"><table><thead><tr><th>Élément</th><th>Version gardée (${esc(sync27.by)})</th><th>Ta version</th><th></th></tr></thead><tbody>${list.map((c,i)=>`<tr><td>${esc(c.label)}${c.note?`<div class="sub">${esc(c.note)}</div>`:''}</td><td>${esc(short27(c.theirs))}</td><td>${esc(short27(c.mine))}</td><td>${c.done?'<span class="badge green">Reprise</span>':`<button class="btn small light" onclick="takeMine27(${i})">Reprendre ma valeur</button>`}</td></tr>`).join('')}</tbody></table>
 <div class="v25actions" style="margin-top:10px"><button class="btn small secondary" onclick="draftDownload27()">Télécharger ma version complète</button></div></div></div></div>`;
}
function takeMine27(i){const c=sync27.conflicts[i];if(!c||c.done)return;if(setPath27(state,c.path,c.mine===null?null:JSON.parse(JSON.stringify(c.mine)))){c.done=true;log25('Conflit : valeur reprise','',c.label);persist25();showConflicts27();}else toast('Élément introuvable : télécharge ta version pour la reprendre à la main.');}

// Version de référence pour la fusion : l'état tel que reçu du serveur (posée au premier affichage après chargement).
function onLoaded27(){
 shared25.base=JSON.stringify(state);
 const d=draftGet27();
 if(d&&d.state)setTimeout(()=>{if(confirm(`Un brouillon non enregistré du ${new Date(d.at).toLocaleString('fr-FR')} a été conservé sur ce poste (${d.reason||'enregistrement interrompu'}).\n\nOK : le télécharger pour le consulter (il reste conservé).\nAnnuler : le supprimer.`))draftDownload27();else draftClear27();},300);
}
reloadShared25=async function(){
 if(shared25.busy)return;
 if(!confirm('Recharger les données du serveur ? Tes modifications non enregistrées restent conservées en brouillon sur ce poste (téléchargeable).'))return;
 draftKeep27('rechargement manuel');
 try{const r=await fetch('/api/state');if(!r.ok)throw Error('Session expirée ou serveur indisponible');const x=await r.json();if(!validState25(x.state))throw Error('Aucune donnée partagée');state=x.state;shared25.revision=x.revision;shared25.base=JSON.stringify(x.state);shared25.pending=null;shared25.conflict=false;shared25.error='';init25();render();toast('Données rechargées ; brouillon conservé.');}catch(e){alert(e.message);}
};

/* ---------- Comptes et rôles ---------- */
addUser27=async function(){
 const username=prompt('Identifiant du nouveau compte (lettres, chiffres, . _ -) :');if(!username)return;
 const password=prompt('Mot de passe provisoire (12 caractères minimum) — à transmettre à la personne :');if(!password)return;
 const role=prompt('Rôle : admin, associe, manager ou collaborateur','collaborateur');if(!role)return;
 try{await api27('/api/users',{method:'POST',body:JSON.stringify({username:username.trim(),password,role:role.trim().toLowerCase()})});toast('Compte '+username+' créé');await loadUsers27();}catch(e){alert(e.message);}
};
async function setRole27(username,role){try{await api27('/api/users/role',{method:'POST',body:JSON.stringify({username,role})});toast('Rôle de '+username+' : '+ROLE_LABELS27[role]);await loadUsers27();}catch(e){alert(e.message);await loadUsers27();}}
async function revokeUser27(username){if(!confirm('Déconnecter '+username+' de tous ses appareils ?'))return;try{await api27('/api/users/revoke',{method:'POST',body:JSON.stringify({username})});toast('Sessions de '+username+' révoquées');await loadUsers27();}catch(e){alert(e.message);}}
accountsPanel27=function(){
 if(!shared25.active)return '';
 const isAdmin=shared25.user?.role==='admin';
 if(isAdmin&&!users27.list)setTimeout(loadUsers27,0);
 return `<div class="panel"><div class="panelHead"><h2>Comptes d’accès</h2><div class="v25actions"><span class="sub">Ton rôle : <b>${esc(ROLE_LABELS27[shared25.user?.role]||'—')}</b></span><button class="btn small secondary" onclick="changePassword27()">Changer mon mot de passe</button>${isAdmin?'<button class="btn small" onclick="addUser27()">+ Ajouter un compte</button>':''}</div></div>
 ${isAdmin?`<table><thead><tr><th>Compte</th><th>Rôle</th><th>Créé le</th><th></th></tr></thead><tbody>${(users27.list||[]).map(u=>`<tr><td><b>${esc(u.username)}</b>${u.revokedAt?`<div class="sub">sessions révoquées le ${new Date(u.revokedAt).toLocaleString('fr-FR')}</div>`:''}</td><td>${u.username===shared25.user?.username?esc(ROLE_LABELS27[u.role]):`<select onchange="setRole27('${esc(u.username)}',this.value)">${Object.entries(ROLE_LABELS27).map(([k,l])=>`<option value="${k}" ${k===u.role?'selected':''}>${l}</option>`).join('')}</select>`}</td><td>${u.createdAt?new Date(u.createdAt).toLocaleDateString('fr-FR'):'—'}</td><td style="white-space:nowrap">${u.username===shared25.user?.username?'<span class="sub">toi</span>':`<button class="btn small secondary" onclick="revokeUser27('${esc(u.username)}')">Déconnecter</button> <button class="btn small secondary" onclick="removeUser27('${esc(u.username)}')">Supprimer</button>`}</td></tr>`).join('')||'<tr><td colspan="4">Chargement…</td></tr>'}</tbody></table>
 <div class="panelBody sub"><b>Droits appliqués par le serveur.</b> Collaborateur : saisie et suivi des dossiers, sans suppression, import en masse, honoraires ni coûts horaires. Manager : en plus, imports, honoraires et missions. Associé : en plus, suppressions, paramètres du cabinet, coûts et rentabilité, validations exceptionnelles, journal. Administrateur : tout, dont comptes et sauvegardes.</div>`:'<div class="panelBody sub">Seul un administrateur peut créer des comptes ou changer les rôles.</div>'}</div>`;
};

/* ---------- Journal serveur et sauvegardes (Automatisations cabinet) ---------- */
async function loadAudit27(){try{sync27.audit=(await api27('/api/audit?limit=300')).items;}catch(e){sync27.audit=[];toast(e.message);}render();}
function auditPanel27(){
 if(!shared25.active||!perm27('audit'))return '';
 if(!sync27.audit)setTimeout(loadAudit27,0);
 const fmt=e=>e.changes?e.changes.slice(0,6).map(c=>`${c.op} ${c.type}${c.name?' « '+c.name+' »':''}${c.diff&&Object.keys(c.diff).length?' ('+Object.entries(c.diff).map(([k,[a,b]])=>`${k} : ${short27(a)} → ${short27(b)}`).join(', ')+')':''}`).join(' · ')+(e.changes.length>6||e.more?` · +${e.changes.length-6+(e.more||0)}`:''):[e.target,e.newRole,e.reasons?.join(' '),e.ip].filter(Boolean).join(' · ');
 return `<div class="panel"><div class="panelHead"><h2>Journal serveur</h2><button class="btn small secondary" onclick="sync27.audit=null;render()">Actualiser</button></div><div class="panelBody sub">Opérations enregistrées par le serveur avec l’auteur réel de la session (connexions, enregistrements, comptes, liens de création, sauvegardes).</div><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Détail</th></tr></thead><tbody>${(sync27.audit||[]).slice(0,150).map(e=>`<tr><td style="white-space:nowrap">${new Date(e.at).toLocaleString('fr-FR')}</td><td>${esc(e.user||'')}</td><td>${esc(e.action)}</td><td class="sub">${esc(fmt(e))}</td></tr>`).join('')||'<tr><td colspan="4">Chargement…</td></tr>'}</tbody></table></div>`;
}
async function loadBackups27(){try{sync27.backups=(await api27('/api/backups')).items;}catch(e){sync27.backups=[];}render();}
function backupPanel27(){
 if(!shared25.active||!perm27('backup'))return '';
 if(!sync27.backups)setTimeout(loadBackups27,0);
 return `<div class="panel"><div class="panelHead"><h2>Sauvegardes serveur</h2><div class="v25actions"><a class="btn small" href="/api/backup">Télécharger une sauvegarde</a><a class="btn small secondary" href="/api/backup?files=1" title="Peut échouer au-delà de 4 Mo sur Vercel">… avec les justificatifs</a><label class="btn small secondary">Restaurer un fichier<input hidden type="file" accept=".json" onchange="restoreFile27(this.files[0]);this.value=''"></label></div></div>
 <div class="panelBody sub">Indépendantes de l’historique des 30 versions : données, comptes, liens et réponses des formulaires de création. Une sauvegarde automatique est faite chaque nuit (14 jours conservés) si la tâche planifiée Vercel et CRON_SECRET sont configurés. Toute restauration affiche d’abord un aperçu ; l’état actuel reste dans l’historique.</div>
 <table><thead><tr><th>Sauvegarde automatique</th><th>Révision</th><th>Clients</th><th></th></tr></thead><tbody>${(sync27.backups||[]).map(b=>`<tr><td>${new Date(b.createdAt).toLocaleString('fr-FR')}</td><td>${b.revision}</td><td>${b.clients}</td><td><button class="btn small secondary" onclick="restore27({date:'${esc(b.date)}'})">Restaurer…</button></td></tr>`).join('')||'<tr><td colspan="4" class="sub">Aucune sauvegarde automatique pour l’instant.</td></tr>'}</tbody></table></div>`;
}
async function restoreFile27(file){if(!file)return;try{const backup=JSON.parse(await file.text());await restore27({backup});}catch(e){alert('Fichier illisible : '+e.message);}}
async function restore27(src){
 try{
  const {preview:p}=await api27('/api/restore',{method:'POST',body:JSON.stringify(src)});
  const msg=`Restaurer la sauvegarde du ${new Date(p.backupDate).toLocaleString('fr-FR')} ?\n\nActuellement : ${p.current.clients} clients, ${p.current.factures} factures déclarées, ${p.current.temps} temps, ${p.current.creations} créations.\nSauvegarde : ${p.backup.clients} clients, ${p.backup.factures} factures déclarées, ${p.backup.temps} temps, ${p.backup.creations} créations.\nFormulaires : ${p.creationLinks} lien(s), ${p.files} justificatif(s) dont ${p.filesWithData} avec contenu.\n\nL’état actuel reste dans l’historique des versions.`;
  if(!confirm(msg))return;
  const users=p.users&&confirm('Restaurer aussi les comptes d’accès de la sauvegarde ? (Annuler = garder les comptes actuels)');
  const r=await api27('/api/restore',{method:'POST',body:JSON.stringify({...src,apply:true,users})});
  alert(`Restauration effectuée (version ${r.revision}, ${r.restoredFiles} justificatif(s) restauré(s)). La page va se recharger.`);location.reload();
 }catch(e){alert('Restauration impossible : '+e.message);}
}

/* ---------- Affichage selon les droits ---------- */
const previousRenderSync27=render;
render=function(){
 if(shared25.active&&shared25.ready&&shared25.base==null)onLoaded27();
 if(shared25.active&&shared25.ready&&!perm27('costs')&&['profit'].includes(state.page)){previousRenderSync27();document.getElementById('root').innerHTML='<div class="panel panelBody">La rentabilité utilise les coûts horaires : accès réservé aux associés et administrateurs.</div>';return;}
 if(shared25.active&&shared25.ready&&shared25.base==null)onLoaded27();
 previousRenderSync27();
 if(state.page==='rules'){const root=document.getElementById('root');if(!root.querySelector('.syncPanels27')){const d=document.createElement('div');d.className='syncPanels27';d.innerHTML=backupPanel27()+auditPanel27();root.append(d);}}
 if(shared25.active&&!perm27('costs'))document.querySelectorAll('.nav a[data-page="profit"]').forEach(a=>a.style.display='none');
};
