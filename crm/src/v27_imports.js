/* RB Partners V27 — Imports Excel avec aperçu, rapport et retour arrière.
 * Chaque import (Portefeuille, Bilan, AGO, Fiscalité, Autres travaux, Matrice création) est d'abord exécuté sur une copie
 * des données : rien n'est modifié tant que l'aperçu n'est pas validé, et l'application se fait en une fois (pas
 * d'application partielle silencieuse). L'aperçu montre les clients créés et modifiés, les valeurs remplacées, les
 * lignes ignorées, les erreurs et les rapprochements ambigus (à trancher : rattacher, créer ou ignorer).
 * Une cellule vide n'efface jamais une valeur existante, sauf choix explicite. Chaque import appliqué est journalisé
 * et peut être annulé : seules les valeurs que personne n'a modifiées depuis sont remises en l'état. */
const imp27={pending:null,running:false};
const deep27=o=>JSON.parse(JSON.stringify(o??null));
const empty27=v=>v==null||v===''||(typeof v==='object'&&!Array.isArray(v)&&!Object.keys(v).length);

/* ---------- Différences entité par entité ---------- */
// Chemin d'un élément : ['clients','#C_x'] pour une liste d'éléments identifiés, ['boards27','bilan','C_x|2025'] pour une ligne de tableau.
function entityPaths27(a,b,path=[],out=[]){
 if(same27(a,b))return out;
 const ids=v=>Array.isArray(v)&&v.every(x=>isObj27(x)&&typeof x.id==='string');
 if((ids(a)||a==null)&&(ids(b)||b==null)&&(Array.isArray(a)||Array.isArray(b))){
  const A=new Map((a||[]).map(x=>[x.id,x])),B=new Map((b||[]).map(x=>[x.id,x]));
  for(const id of new Set([...A.keys(),...B.keys()]))if(!same27(A.get(id),B.get(id)))out.push({path:path.concat('#'+id),before:A.get(id)??null,after:B.get(id)??null});
  return out;
 }
 if(isObj27(a)&&isObj27(b)&&path.length<3){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))if(!isPref27(path.concat(k)))entityPaths27(a[k],b[k],path.concat(k),out);return out;}
 out.push({path,before:a??null,after:b??null});return out;
}
function getPath27(root,path){let o=root;for(const k of path){if(o==null)return undefined;o=String(k).startsWith('#')&&Array.isArray(o)?o.find(x=>x.id===k.slice(1)):o[k];}return o;}
function putPath27(root,path,value){
 let o=root;
 for(let i=0;i<path.length-1;i++){const k=path[i],nk=path[i+1];let n=String(k).startsWith('#')?o.find(x=>x.id===k.slice(1)):o[k];if(n==null){n=String(nk).startsWith('#')?[]:{};o[k]=n;}o=n;}
 const last=path[path.length-1];
 if(String(last).startsWith('#')){const id=last.slice(1),i=o.findIndex(x=>x.id===id);if(value==null){if(i>=0)o.splice(i,1);}else if(i>=0)o[i]=value;else o.push(value);}
 else if(value==null)delete o[last];else o[last]=value;
}
/* Champs à plat (deux niveaux) pour comparer un client ou une ligne de tableau. */
function flat27(o,prefix='',out={}){for(const [k,v] of Object.entries(o||{})){if(isObj27(v)&&!prefix)flat27(v,k+'.',out);else out[prefix+k]=v;}return out;}
const NOISE27=/^(createdAt|createdBy|ops25|onbOpen|collapsed)$/;

/* ---------- Exécution sur une copie ---------- */
async function sandboxImport27(file,rows,opts){
 const real=state,snap=deep27(state),saved={save,persist25,render,toast,alert:window.alert,confirm:window.confirm,readXlsx27};
 const msgs={confirm:[],alert:[],toast:[]};
 importRun27.on=true;importRun27.issues=[];importRun27.decisions=opts.decisions||{};
 state=deep27(state);
 save=()=>{};persist25=()=>{};render=()=>{};toast=m=>msgs.toast.push(String(m));window.alert=m=>msgs.alert.push(String(m));window.confirm=m=>{msgs.confirm.push(String(m));return true;};readXlsx27=async()=>rows;
 let clone,error='';
 try{await imp27.base(file);}catch(e){error=e.message;}
 finally{clone=state;state=real;({save,persist25,render,toast,readXlsx27}=saved);window.alert=saved.alert;window.confirm=saved.confirm;importRun27.on=false;}
 const issues=importRun27.issues.slice();
 // Cellules vides : la valeur existante est conservée (sauf choix explicite).
 let kept=0;const before=new Map(snap.clients.map(c=>[c.id,c]));
 const protect=(b,a)=>{if(!b||!a)return;for(const [k,v] of Object.entries(flat27(b))){if(NOISE27.test(k.split('.')[0])||empty27(v))continue;const parts=k.split('.'),cur=parts.length>1?a[parts[0]]?.[parts[1]]:a[k];if(empty27(cur)){if(parts.length>1){a[parts[0]]=a[parts[0]]||{};a[parts[0]][parts[1]]=v;}else a[k]=v;kept++;}}};
 if(!opts.allowEmpty){
  for(const c of clone.clients)protect(before.get(c.id),c);
  for(const kind of Object.keys(clone.boards27||{}))if(isObj27(clone.boards27[kind]))for(const [k,row] of Object.entries(clone.boards27[kind]))if(isObj27(row))protect(snap.boards27?.[kind]?.[k],row);
 }
 return {snap,clone,issues,msgs,error,kept};
}
function summarize27(r){
 const s={created:[],modified:[],replaced:[],filled:0,rows:0,errors:[],ambiguous:[],ignored:[],info:[]};
 const B=new Map(r.snap.clients.map(c=>[c.id,c]));
 for(const c of r.clone.clients){
  const b=B.get(c.id);
  if(!b){s.created.push(c);continue;}
  if(same27(b,c))continue;
  const fb=flat27(b),fa=flat27(c),ch=[];
  for(const k of new Set([...Object.keys(fb),...Object.keys(fa)])){if(NOISE27.test(k.split('.')[0])||same27(fb[k],fa[k]))continue;if(empty27(fb[k]))s.filled++;else{ch.push(k);s.replaced.push({c,k,before:fb[k],after:fa[k]});}}
  s.modified.push({c,keys:ch});
 }
 for(const kind of Object.keys(r.clone.boards27||{})){const A=r.snap.boards27?.[kind],Z=r.clone.boards27[kind];if(!isObj27(Z))continue;
  for(const [k,row] of Object.entries(Z)){const o=A?.[k];if(same27(o,row))continue;s.rows++;if(!isObj27(row))continue;const name=cfind(k.split('|')[0])?.name||r.clone.clients.find(c=>c.id===k.split('|')[0])?.name||k;
   for(const [f,v] of Object.entries(row)){const ov=o?.[f];if(same27(ov,v))continue;if(empty27(ov))s.filled++;else s.replaced.push({c:{name},k:kind+' '+k.split('|')[1]+' · '+f,before:ov,after:v});}}}
 for(const coll of ['exc27','creation27'])if(r.clone[coll]?.items){const before=new Map((r.snap[coll]?.items||[]).map(x=>[x.id,x]));r.clone[coll].items.forEach(x=>{if(!before.has(x.id))s.info.push(`${coll==='exc27'?'Travail':'Dossier de création'} ajouté : ${x.name}`);});}
 for(const i of r.issues){if(i.type==='erreur')s.errors.push(i);else if(i.type==='ambigu')s.ambiguous.push(i);else if(i.type==='ignorée')s.ignored.push(i);else s.info.push(i.row+' : '+i.msg);}
 // Contrôles après import : SIREN, dates, montants.
 for(const c of r.clone.clients){const sv=sirenOf27(c.siren);if(c.siren&&(!sv||!sirenValid27(sv))&&!s.errors.some(e=>e.row===c.name&&/SIREN/.test(e.msg)))s.errors.push({row:c.name,msg:`SIREN « ${c.siren} » invalide`});if(c.entry&&!/^\d{4}-\d{2}-\d{2}$/.test(c.entry))s.errors.push({row:c.name,msg:`date d’entrée « ${c.entry} » invalide`});for(const [k,v] of Object.entries(c.feesBreakdown||{}))if(v!==''&&v!=null&&!Number.isFinite(Number(v)))s.errors.push({row:c.name,msg:`honoraires ${k} « ${v} » invalides`});}
 if(r.error)s.errors.unshift({row:'Fichier',msg:r.error});
 r.msgs.alert.forEach(m=>s.errors.unshift({row:'Fichier',msg:m}));
 return s;
}

/* ---------- Aperçu ---------- */
const previousImportBoard27b=importBoard27;
imp27.base=previousImportBoard27b;
importBoard27=async function(file){
 if(!file)return;
 if(shared25.active&&!perm27('import'))return alert('Les imports sont réservés aux managers, associés et administrateurs.');
 let rows;try{rows=await readXlsx27(file);}catch(e){return alert('Import impossible : '+e.message);}
 imp27.pending={file,rows,decisions:{},allowEmpty:false};
 await previewImport27();
};
async function previewImport27(){
 const p=imp27.pending;if(!p)return;
 // Les choix faits dans l'aperçu (rapprochements ambigus, effacement) sont relus avant de recalculer.
 document.querySelectorAll('select[data-amb]').forEach(s=>{if(s.value)p.decisions[s.dataset.amb]=s.value;else delete p.decisions[s.dataset.amb];});
 const ae=document.getElementById('imp_allowEmpty');if(ae)p.allowEmpty=ae.checked;
 p.result=await sandboxImport27(p.file,p.rows,{decisions:p.decisions,allowEmpty:p.allowEmpty});
 p.summary=summarize27(p.result);
 showImportPreview27();
}
function showImportPreview27(){
 const p=imp27.pending,s=p.summary,r=p.result,v=x=>typeof x==='object'?JSON.stringify(x):String(x??'');
 const fatal=!r.clone||r.msgs.alert.length||r.error;
 const card=(l,n,cls)=>`<div class="card"><small>${l}</small><span class="big ${n&&cls?cls:''}">${n}</span></div>`;
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal" style="width:min(1100px,97vw)"><div class="modalHead"><div><h3>Aperçu de l’import · ${esc(p.file.name)}</h3><div class="sub">${esc(r.msgs.confirm[0]?.split('\n')[0]||'Rien n’est encore modifié : vérifie puis applique.')}</div></div><button class="btn secondary" onclick="imp27.pending=null;closeModal()">Annuler</button></div>
 <div class="modalBody">
  <div class="cards" style="grid-template-columns:repeat(7,1fr)">${card('Clients créés',s.created.length)}${card('Clients modifiés',s.modified.length)}${card('Lignes de tableau modifiées',s.rows)}${card('Valeurs remplacées',s.replaced.length,'warn')}${card('Cellules vides ignorées',r.kept)}${card('Lignes mises de côté',s.ambiguous.length+s.ignored.length,'warn')}${card('Erreurs',s.errors.length,'bad')}</div>
  ${s.errors.length?`<div class="panel"><div class="panelHead"><h3>Erreurs</h3><span class="sub">À corriger dans le fichier ou dans le CRM ; les lignes concernées sont importées sans la valeur fautive.</span></div><table><tbody>${s.errors.slice(0,100).map(e=>`<tr><td><b>${esc(e.row)}</b></td><td>${esc(e.msg)}</td></tr>`).join('')}</tbody></table></div>`:''}
  ${s.ambiguous.length?`<div class="panel"><div class="panelHead"><h3>Rapprochements à trancher</h3><span class="sub">Ces lignes ne sont pas importées tant qu’aucun choix n’est fait.</span></div><table><thead><tr><th>Ligne du fichier</th><th>Constat</th><th>Choix</th></tr></thead><tbody>${s.ambiguous.map(a=>`<tr><td><b>${esc(a.row)}</b></td><td class="sub">${esc(a.msg)}</td><td><select data-amb="${esc(a.key)}"><option value="">Mettre de côté</option>${a.candidates.map(c=>`<option value="C:${esc(c.id)}">Rattacher à ${esc(c.name)}${c.siren?' ('+esc(c.siren)+')':''}</option>`).join('')}<option value="new">Créer une nouvelle fiche</option><option value="ignore">Ignorer la ligne</option></select></td></tr>`).join('')}</tbody></table></div>`:''}
  ${s.created.length?`<div class="panel"><div class="panelHead"><h3>Clients créés (statut « À qualifier »)</h3></div><div class="panelBody">${s.created.slice(0,200).map(c=>`<span class="badge blue" style="margin:2px">${esc(c.name)}${c.siren?' · '+esc(c.siren):''}</span>`).join('')}${s.created.length>200?` … +${s.created.length-200}`:''}</div></div>`:''}
  ${s.replaced.length?`<div class="panel"><div class="panelHead"><h3>Valeurs remplacées</h3><span class="sub">Valeurs existantes que le fichier change (${s.filled} champ(s) vide(s) seront simplement complétés)</span></div><div style="max-height:320px;overflow:auto"><table><thead><tr><th>Client</th><th>Champ</th><th>Avant</th><th>Après</th></tr></thead><tbody>${s.replaced.slice(0,400).map(x=>`<tr><td>${esc(x.c.name)}</td><td class="sub">${esc(x.k)}</td><td>${esc(v(x.before)).slice(0,80)}</td><td><b>${esc(v(x.after)).slice(0,80)}</b></td></tr>`).join('')}</tbody></table></div></div>`:''}
  ${s.info.length||s.ignored.length?`<div class="panel"><div class="panelHead"><h3>Informations</h3></div><div class="panelBody sub">${[...s.ignored.map(i=>i.row+' : '+i.msg),...s.info].slice(0,100).map(esc).join('<br>')}</div></div>`:''}
  <label class="sub"><input type="checkbox" id="imp_allowEmpty" ${p.allowEmpty?'checked':''}> Autoriser les cellules vides à effacer les valeurs existantes</label>
 </div>
 <div class="modalFooter" style="display:flex;justify-content:space-between;gap:8px"><button class="btn secondary" onclick="previewImport27()">Recalculer avec mes choix</button><button class="btn green" ${fatal?'disabled':''} onclick="applyImport27()">Appliquer l’import</button></div></div></div>`;
}

/* ---------- Application et rapport ---------- */
async function applyImport27(){
 const p=imp27.pending;if(!p?.result?.clone)return;
 const {snap,clone}=p.result,s=p.summary;
 // Appliqué en une fois sur les données actuelles (fusion si un collègue a enregistré pendant l'aperçu).
 const {merged,conflicts}=mergeStates27(snap,clone,deep27(state));
 const paths=entityPaths27(snap,clone);
 const id=uid('IMP'),meta={id,at:new Date().toISOString(),user:shared25.user?.username||state.currentUser||'',file:p.file.name,created:s.created.length,modified:s.modified.length,rows:s.rows,replaced:s.replaced.length,kept:p.result.kept,ignored:s.ambiguous.length+s.ignored.length,errors:s.errors.length,changes:paths.length};
 state=merged;imp27.pending=null;closeModal();init25();
 (state.imports27=state.imports27||[]).unshift({...meta,undoable:false});state.imports27=state.imports27.slice(0,30);
 log25('Import appliqué',`${p.file.name}`,`${meta.created} créé(s), ${meta.modified} modifié(s), ${meta.rows} ligne(s) de tableau, ${meta.replaced} valeur(s) remplacée(s), ${meta.ignored} ligne(s) de côté, ${meta.errors} erreur(s)`);
 persist25();
 // Valeurs « après » relevées une fois les données affichées (l'affichage complète certains champs par défaut).
 const changes=paths.map(c=>({path:c.path,before:c.before,after:deep27(getPath27(state,c.path)??null)}));
 let stored=false,why='';
 if(shared25.active){try{await api27('/api/imports',{method:'POST',body:JSON.stringify({meta,changes})});stored=true;}catch(e){why=e.message;}}
 else{try{localStorage.setItem('rb_import27_'+id,JSON.stringify({meta,changes}));stored=true;}catch(e){why=e.message;}}
 const rec=(state.imports27||[]).find(x=>x.id===id);if(rec){rec.undoable=stored;save();}
 toast(`Import appliqué : ${meta.created} créé(s), ${meta.modified} modifié(s)${conflicts.length?` · ${conflicts.length} valeur(s) modifiée(s) entre-temps par un collègue conservée(s)`:''}.${stored?' Annulable dans Automatisations cabinet › Imports.':' Retour arrière indisponible : '+why}`);
}
/* Comparaison tolérante : les champs vides ajoutés ensuite par l'affichage (objets vides, zéros) ne comptent pas comme une modification. */
function emptyish27(v){return v==null||v===''||v===0||v===false||(Array.isArray(v)&&!v.length)||(isObj27(v)&&Object.values(v).every(emptyish27));}
function sameish27(cur,ref){
 if(same27(cur,ref))return true;
 if(isObj27(cur)&&isObj27(ref)){for(const k of new Set([...Object.keys(cur),...Object.keys(ref)])){if(!(k in ref)&&emptyish27(cur[k]))continue;if(!(k in cur)&&emptyish27(ref[k]))continue;if(!sameish27(cur[k],ref[k]))return false;}return true;}
 return false;
}
async function undoImport27(id){
 const rec=(state.imports27||[]).find(x=>x.id===id);if(!rec)return;
 let data;
 try{data=shared25.active?await api27('/api/imports?id='+encodeURIComponent(id)):JSON.parse(localStorage.getItem('rb_import27_'+id)||'null');}catch(e){return alert('Retour arrière impossible : '+e.message);}
 if(!data?.changes)return alert('Les données de retour arrière de cet import ne sont plus disponibles.');
 if(!confirm(`Annuler l’import « ${rec.file} » du ${new Date(rec.at).toLocaleString('fr-FR')} ?\n${data.changes.length} élément(s) concerné(s). Seuls ceux que personne n’a modifiés depuis seront remis en l’état ; les autres te seront listés.`))return;
 const conflicts=[];let undone=0;
 for(const ch of data.changes){const cur=getPath27(state,ch.path);if(sameish27(cur??null,ch.after)){putPath27(state,ch.path,ch.before==null?null:deep27(ch.before));undone++;}else conflicts.push(ch);}
 rec.undoneAt=new Date().toISOString();rec.undoneBy=shared25.user?.username||'';rec.undoConflicts=conflicts.length;
 log25('Import annulé',rec.file,`${undone} élément(s) remis en l’état, ${conflicts.length} conservé(s) car modifié(s) depuis`);persist25();
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal" style="width:min(760px,96vw)"><div class="modalHead"><h3>Import annulé · ${esc(rec.file)}</h3><button class="btn secondary" onclick="closeModal()">Fermer</button></div><div class="modalBody"><p>${undone} élément(s) remis en l’état.</p>${conflicts.length?`<p><b>${conflicts.length} élément(s) conservé(s)</b> car modifié(s) depuis l’import :</p><ul>${conflicts.slice(0,100).map(c=>`<li>${esc(c.path.join(' › '))}</li>`).join('')}</ul>`:''}</div></div></div>`;
}
function importsPanel27(){
 const l=state.imports27||[];if(!l.length)return '';
 return `<div class="panel"><div class="panelHead"><h2>Imports</h2><span class="sub">Rapport de chaque import appliqué ; un import peut être annulé (retour arrière contrôlé)</span></div><table><thead><tr><th>Date</th><th>Fichier</th><th>Par</th><th>Résultat</th><th></th></tr></thead><tbody>${l.map(i=>`<tr><td style="white-space:nowrap">${new Date(i.at).toLocaleString('fr-FR')}</td><td>${esc(i.file)}</td><td>${esc(i.user||'')}</td><td class="sub">${i.created} créé(s), ${i.modified} modifié(s), ${i.rows} ligne(s) de tableau, ${i.replaced} remplacée(s), ${i.kept} cellule(s) vide(s) ignorée(s), ${i.ignored} de côté, ${i.errors} erreur(s)${i.undoneAt?` · <b>annulé le ${new Date(i.undoneAt).toLocaleString('fr-FR')}</b>${i.undoConflicts?` (${i.undoConflicts} conservé(s))`:''}`:''}</td><td>${!i.undoneAt&&i.undoable&&perm27('import')?`<button class="btn small secondary" onclick="undoImport27('${esc(i.id)}')">Annuler l’import</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
}
const previousRenderImports27=render;
render=function(){
 previousRenderImports27();
 if(state.page==='rules'){const root=document.getElementById('root');if(!root.querySelector('.impPanel27')){const d=document.createElement('div');d.className='impPanel27';d.innerHTML=importsPanel27();root.append(d);}}
};
