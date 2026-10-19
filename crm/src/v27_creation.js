/* RB Partners V27 — Matrice création.
 * Un futur client veut créer sa société : on lui envoie par mail un lien vers un formulaire sécurisé
 * (/creation/<jeton>, sans compte) où il renseigne les informations et dépose les justificatifs.
 * Ses réponses arrivent automatiquement dans le tableau (colonnes du Monday « Matrice création ») ;
 * « Créer la fiche client » les reverse dans le portefeuille (onboarding) et crée le travail exceptionnel
 * « Création de société », qui passe en « À facturer » quand la société est créée. */
const CR_STAGES27=['Contrôlé','Statuts en cours','Dépôt au greffe','Société créée','Abandonné'];
const CR_GROUPS27=['À envoyer','Mail préparé','En attente du client','Réponse partielle','Informations reçues','Contrôlé','Statuts en cours','Dépôt au greffe','Société créée','Abandonné'];
const CR_COLORS27={'Mail préparé':'#e2a03f','Contrôlé':'#0086c0','À envoyer':'#c4c4c4','En attente du client':'#fdab3d','Réponse partielle':'#ffcb00','Informations reçues':'#579bfc','Statuts en cours':'#a25ddc','Dépôt au greffe':'#784bd1','Société créée':'#00c875','Abandonné':'#808080'};
const CR_TEXT27=CREATION_FIELDS.filter(f=>f.key&&f.type!=='file'),CR_FILES27=CREATION_FIELDS.filter(f=>f.type==='file');
const cr27={lastPull:0,pulling:false};
function creation27(){if(!state.creation27)state.creation27={items:[]};return state.creation27;}
function crFind27(id){return creation27().items.find(x=>x.id===id);}
function crStatus27(it){
 if(it.stage)return it.stage;
 if(it.submittedAt||it.imported)return 'Informations reçues';
 if(it.updatedAt)return 'Réponse partielle';
 // Un lien mailto ouvert ne prouve pas l'envoi : « Mail préparé » tant que l'envoi n'est pas confirmé.
 return it.sentAt?'En attente du client':it.preparedAt?'Mail préparé':'À envoyer';
}
function crUrl27(it){return it.token?location.origin+'/creation/'+it.token:'';}
function crDocs27(it,kind){return [...(it.files||[]).filter(f=>f.kind===kind),...(it.links?.[kind]?String(it.links[kind]).split(/[\s,]+/).filter(u=>/^https?:/.test(u)).map(u=>({url:u,name:decodeURIComponent(u.split('/').pop()||'lien')})):[])];}
function crFileHref27(it,f){return f.url||`/api/creation/file?t=${encodeURIComponent(it.token)}&id=${encodeURIComponent(f.id)}`;}

/* ---------- réponses des clients ---------- */
async function pullCreation27(silent=true){
 const items=creation27().items.filter(x=>x.token);
 if(!items.length||cr27.pulling||!shared25.active)return false;
 cr27.pulling=true;cr27.lastPull=Date.now();
 try{
  const r=await api27('/api/creation/list',{method:'POST',body:JSON.stringify({tokens:items.map(x=>x.token)})});let changed=false;
  for(const sub of r.items||[]){
   const it=creation27().items.find(x=>x.token===sub.token);if(!it)continue;
   const files=JSON.stringify(sub.files||[]);
   if(sub.updatedAt&&sub.updatedAt!==it.updatedAt||files!==JSON.stringify(it.files||[])){
    // Une valeur corrigée par le cabinet, ou un dossier déjà contrôlé, n'est jamais écrasée : la modification du client part en « à arbitrer ».
    const prev=it.clientFields||{},locked=crLocked27(it);it.fields=it.fields||{};it.clientChanges=it.clientChanges||{};
    for(const [k,v] of Object.entries(sub.fields||{})){
     if(v===prev[k]||v===it.fields[k])continue;
     const cabinetEdited=it.fields[k]&&it.fields[k]!==(prev[k]||'');
     if(locked||cabinetEdited)it.clientChanges[k]={value:v,cabinet:it.fields[k]||'',at:sub.updatedAt};
     else if(v)it.fields[k]=v;
    }
    if(locked&&Object.keys(it.clientChanges).length)log25('Matrice création : modification du client après contrôle',it.client||'',it.name);
    it.clientFields=sub.fields||{};it.files=sub.files||[];
    if(sub.submittedAt&&sub.submittedAt!==it.submittedAt)log25('Matrice création : informations reçues',it.client||'',it.name);
    it.submittedAt=sub.submittedAt||it.submittedAt||null;it.updatedAt=sub.updatedAt;it.link=sub.link||it.link;
    if(sub.fields?.legalForm&&!it.legalForm)it.legalForm=sub.fields.legalForm;
    changed=true;
   }
  }
  for(const sub of r.items||[]){const it=creation27().items.find(x=>x.token===sub.token);if(it&&sub.link&&JSON.stringify(sub.link)!==JSON.stringify(it.link)){it.link=sub.link;changed=true;}}
  if(changed){save();render();if(!silent)toast('Réponses des clients mises à jour');}
  else if(!silent)toast('Aucune nouvelle réponse');
  return changed;
 }catch(e){if(!silent)alert('Récupération impossible : '+e.message);return false;}
 finally{cr27.pulling=false;}
}
async function crLink27(it){
 if(it.token)return it.token;
 const r=await api27('/api/creation/link',{method:'POST',body:JSON.stringify({name:it.name,legalForm:it.legalForm||'',cabinet:cabinet26().name||'RB Partners'})});
 // L'état a pu être remplacé pendant l'appel (fusion après un enregistrement simultané) : on relit l'élément.
 const cur=crFind27(it.id)||it;cur.token=r.token;cur.link={state:'actif',expiresAt:r.expiresAt};it.token=r.token;save();return r.token;
}
function crLocked27(it){return ['Contrôlé','Statuts en cours','Dépôt au greffe','Société créée','Abandonné'].includes(it.stage);}
async function crLinkState27(id,action,silent){
 const it=crFind27(id);if(!it?.token)return;
 try{const r=await api27('/api/creation/state',{method:'POST',body:JSON.stringify({token:it.token,action,days:60})});it.link=r.link;log25('Matrice création : lien '+({revoke:'révoqué',close:'clôturé',reopen:'rouvert',extend:'prolongé'})[action],it.client||'',it.name);save();if(!silent){render();crOpen27(id);}}
 catch(e){if(!silent)alert('Action impossible : '+e.message);}
}
function crConfirmSent27(id){
 const it=crFind27(id);if(!it)return;
 const d=prompt('Confirme l’envoi du formulaire au client : date d’envoi (AAAA-MM-JJ)',today27());if(d===null)return;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return alert('Date invalide (format AAAA-MM-JJ).');
 it.sentAt=d;it.sentBy=shared25.user?.username||'';it.sentConfirmedAt=new Date().toISOString();
 log25('Matrice création : envoi du formulaire confirmé',it.client||'',it.name+' · '+d);persist25();if(document.getElementById('cri_name'))crOpen27(id);
}
function crResolve27(id,k,keep){
 const it=crFind27(id),c=it?.clientChanges?.[k];if(!c)return;
 if(keep==='client')it.fields[k]=c.value;
 delete it.clientChanges[k];log25('Matrice création : modification du client '+(keep==='client'?'acceptée':'écartée'),it.client||'',k);
 if(it.client)crToClient27(it);persist25();crOpen27(id);
}

/* ---------- page ---------- */
function crCell27(v,w=180){const t=String(v??'');return `<td style="max-width:${w}px;min-width:${Math.min(w,120)}px;overflow:hidden;text-overflow:ellipsis;padding:0 8px;text-align:left" title="${esc(t)}">${esc(t)}</td>`;}
function creationPage27(){
 const b=creation27(),q=(b.q||'').toLowerCase(),items=b.items.filter(it=>!q||[it.name,it.contactName,it.contactEmail,it.fields?.dir1,it.fields?.sh1].some(v=>String(v||'').toLowerCase().includes(q)));
 const groups={};items.forEach(it=>{const g=crStatus27(it);(groups[g]=groups[g]||[]).push(it);});
 const count=g=>(b.items.filter(it=>crStatus27(it)===g)).length;
 const cols=[['Statut',it=>null],['CRM',it=>null],['Forme juridique',it=>it.legalForm||it.fields?.legalForm,110],['Deadline',it=>null],...CR_TEXT27.filter(f=>!['denomination','legalForm'].includes(f.key)).map(f=>[f.label.replace(/ \(.*\)$/,''),it=>f.type==='date'?datefr(it.fields?.[f.key]):it.fields?.[f.key],/pct/.test(f.key)?90:f.type==='textarea'?220:150]),...CR_FILES27.map(f=>[f.label.split(',')[0].replace('Pièce d’identité','Pièce d’identité'),it=>null])];
 const head=`<tr><th class="n27">Name</th>${cols.map(c=>`<th>${esc(c[0])}</th>`).join('')}</tr>`;
 const row=it=>{const st=crStatus27(it),c=it.client&&cfind(it.client),late=it.deadline&&it.deadline<today27()&&!['Société créée','Abandonné'].includes(st);
  return `<tr><td class="n27"><div class="name27"><a href="#" onclick="event.preventDefault();crOpen27('${it.id}')" title="${esc(it.name)}">${esc(it.name)}</a>${late?'<span class="badge red">Retard</span>':''}<button class="btn small light" onclick="crOpen27('${it.id}')">Ouvrir</button></div></td>
  <td style="min-width:150px"><select class="pill27" style="background:${CR_COLORS27[st]}" onchange="crStage27('${it.id}',this.value)">${[...new Set([st,...CR_GROUPS27.filter(g=>!CR_STAGES27.includes(g)&&g===crAuto27(it)),...CR_STAGES27])].map(s=>`<option ${s===st?'selected':''}>${esc(s)}</option>`).join('')}</select></td>
  <td style="min-width:140px;padding:0 8px;text-align:left">${c?`<a href="#" onclick="event.preventDefault();openClient('${c.id}')">${esc(c.name)}</a>`:`<button class="btn small secondary" onclick="crClient27('${it.id}')">Créer la fiche</button>`}</td>
  ${crCell27(it.legalForm||it.fields?.legalForm,110)}<td style="min-width:110px"><input class="cell27" type="date" value="${esc(it.deadline||'')}" onchange="crSet27('${it.id}','deadline',this.value)" style="border:0;background:transparent;width:100%;text-align:center"></td>
  ${cols.slice(4,4+CR_TEXT27.length-2).map(c=>crCell27(c[1](it),c[2])).join('')}
  ${CR_FILES27.map(f=>{const d=crDocs27(it,f.key);return `<td style="min-width:120px">${d.length?d.map(x=>`<a href="${esc(crFileHref27(it,x))}" target="_blank" rel="noopener" title="${esc(x.name)}">📄</a>`).join(' '):'<span class="sub">—</span>'}</td>`;}).join('')}</tr>`;};
 return `<div class="titleRow"><div><h1>Matrice création</h1><div class="sub">Envoie au client un lien vers le formulaire de création : ses réponses et ses justificatifs arrivent ici automatiquement, puis se déversent dans le portefeuille.</div></div>
 <div class="v25actions"><input class="search" style="width:220px" placeholder="Rechercher…" value="${esc(b.q||'')}" onchange="creation27().q=this.value;save();render()"><button class="btn small secondary" onclick="pullCreation27(false)">↻ Récupérer les réponses</button><label class="btn small light">Importer un Excel<input hidden type="file" accept=".xlsx" onchange="importBoard27(this.files[0]);this.value=''"></label><button class="btn small" onclick="crNew27()">+ Nouvelle création</button></div></div>
 <div class="cards" style="grid-template-columns:repeat(4,1fr)"><div class="card"><small>Formulaire à envoyer</small><span class="big">${count('À envoyer')}</span></div><div class="card"><small>En attente du client</small><span class="big ${count('En attente du client')+count('Réponse partielle')?'warn':''}">${count('En attente du client')+count('Réponse partielle')}</span><div class="sub">dont ${count('Réponse partielle')} commencé(s)</div></div><div class="card"><small>Informations reçues à traiter</small><span class="big ${count('Informations reçues')?'bad':'good'}">${count('Informations reçues')}</span></div><div class="card"><small>Statuts / dépôt en cours</small><span class="big">${count('Statuts en cours')+count('Dépôt au greffe')}</span><div class="sub">${count('Société créée')} société(s) créée(s)</div></div></div>
 ${CR_GROUPS27.filter(g=>groups[g]).map(g=>{const col=CR_COLORS27[g],collapsed=b.collapsed?.[g];return `<div class="grp27" style="color:${col}" onclick="crToggle27('${esc(g)}')">${collapsed?'▸':'▾'} ${esc(g)} <span class="sub">${groups[g].length} dossier(s)</span></div>${collapsed?'':`<div class="board27" data-k="${esc('creation|'+g)}" style="--g:${col}"><table><thead>${head}</thead><tbody>${groups[g].sort((a,b)=>String(a.deadline||'9999').localeCompare(String(b.deadline||'9999'))||a.name.localeCompare(b.name)).map(row).join('')}</tbody></table></div>`}`;}).join('')||'<div class="panel panelBody">Aucune création en cours. Clique sur « Nouvelle création » pour envoyer le formulaire à un client, ou importe l’export Excel de ta Matrice création.</div>'}`;
}
function crAuto27(it){return crStatus27({...it,stage:''});}
function crToggle27(g){const b=creation27();b.collapsed=b.collapsed||{};b.collapsed[g]=!b.collapsed[g];save();render();}
function crSet27(id,k,v){const it=crFind27(id);if(!it)return;it[k]=v;persist25();}
function crStage27(id,v){
 const it=crFind27(id);if(!it)return;it.stage=CR_STAGES27.includes(v)?v:'';
 if(v==='Contrôlé'){it.controlledAt=new Date().toISOString();it.controlledBy=shared25.user?.username||'';}
 // Dossier finalisé : le formulaire n'est plus modifiable par le client.
 if(['Société créée','Abandonné'].includes(v)&&it.token&&it.link?.state!=='clôturé')crLinkState27(id,'close',true);
 // La société créée termine le travail exceptionnel lié : il passe automatiquement dans « À facturer ».
 const w=it.exc&&exc27().items.find(x=>x.id===it.exc);
 if(w){if(v==='Société créée'){w.statut='Terminé';w.doneAt=w.doneAt||today27();if(w.lancerFact!=='Non')w.lancerFact='Oui';}else if(v==='Abandonné'){w.statut='A revoir';}else if(['Statuts en cours','Dépôt au greffe'].includes(v)&&w.statut==='A faire')w.statut='En cours';}
 log25('Matrice création : '+v,it.client||'',it.name);persist25();
}

/* ---------- nouvelle création, envoi du formulaire ---------- */
function crNew27(){
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal" style="width:min(640px,96vw)"><div class="modalHead"><div><h3>Nouvelle création de société</h3><div class="sub">Le client recevra un lien vers le formulaire à compléter.</div></div><button class="btn secondary" onclick="closeModal()">Fermer</button></div><div class="modalBody"><div class="formGrid">
 <div class="field"><label>Nom du projet / de la société</label><input id="cr_name" placeholder="Ex. : Holding Dupont"></div>
 <div class="field"><label>Forme juridique envisagée</label><select id="cr_form"><option value="">À définir avec le client</option>${CREATION_FIELDS.find(f=>f.key==='legalForm').options.slice(0,-1).map(o=>`<option>${o}</option>`).join('')}</select></div>
 <div class="field"><label>Contact (prénom et nom)</label><input id="cr_contact"></div>
 <div class="field"><label>E-mail du client</label><input id="cr_email" type="email"></div>
 <div class="field"><label>Deadline</label><input id="cr_deadline" type="date"></div>
 <div class="field"><label>Honoraires de création (HT)</label><input id="cr_fees" type="number" min="0" step="10" placeholder="Ex. : 900"></div></div></div>
 <div class="modalFooter" style="display:flex;justify-content:flex-end;gap:8px"><button class="btn secondary" onclick="crCreate27(false)">Créer sans envoyer</button><button class="btn green" onclick="crCreate27(true)">Créer et envoyer le mail</button></div></div></div>`;
 document.getElementById('cr_name').focus();
}
async function crCreate27(send){
 const g=k=>document.getElementById('cr_'+k)?.value.trim()||'';
 if(!g('name'))return toast('Indique le nom du projet.');
 const it={id:uid('CR'),name:g('name'),legalForm:g('form'),contactName:g('contact'),contactEmail:g('email'),deadline:g('deadline'),fees:Number(g('fees')||0),fields:{denomination:g('name'),...(g('form')?{legalForm:g('form')}:{})},files:[],createdAt:new Date().toISOString(),owner:state.currentUser||''};
 creation27().items.push(it);log25('Matrice création : nouveau dossier','',it.name);closeModal();persist25();
 if(send)await crSend27(it.id);
}
async function crSend27(id){
 const it=crFind27(id);if(!it)return;
 try{await crLink27(it);}catch(e){return alert('Lien impossible à créer : '+e.message);}
 const url=crUrl27(it),cab=cabinet26().name||'RB Partners',me=(typeof me27==='function'&&me27())||shared25.user?.username||'';
 const subject=`Création de ${it.name} : informations à nous transmettre`;
 const body=`Bonjour${it.contactName?' '+it.contactName.split(' ')[0]:''},\n\nPour préparer la création de ${it.name}, merci de compléter le formulaire sécurisé ci-dessous. Il réunit toutes les informations et pièces nécessaires à la rédaction des statuts et au dépôt du dossier d’immatriculation :\n\n${url}\n\nVos réponses sont enregistrées au fur et à mesure : vous pouvez revenir à tout moment avec le même lien. Comptez une quinzaine de minutes, en ayant à portée de main les pièces d’identité des dirigeants et actionnaires et le justificatif d’adresse du siège.\n\nJe reste à votre disposition pour toute question.\n\nBien cordialement,\n${me}\n${cab}`;
 it.preparedAt=new Date().toISOString();it.preparedBy=shared25.user?.username||'';log25('Matrice création : mail préparé (envoi à confirmer)',it.client||'',it.name+(it.contactEmail?' → '+it.contactEmail:''));persist25();
 try{await navigator.clipboard?.writeText(url);}catch(e){}
 crMail27(`mailto:${encodeURIComponent(it.contactEmail||'')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
 toast('Mail préparé dans ta messagerie (lien copié). Une fois envoyé, clique sur « Confirmer l’envoi ».');
}
function crMail27(href){location.href=href;}
async function crCopy27(id){const it=crFind27(id);if(!it)return;try{await crLink27(it);}catch(e){return alert('Lien impossible à créer : '+e.message);}const url=crUrl27(it);try{await navigator.clipboard.writeText(url);toast('Lien copié');}catch(e){prompt('Lien du formulaire :',url);}render();crOpen27(id);}

/* ---------- fiche d'un dossier ---------- */
function crOpen27(id){
 const it=crFind27(id);if(!it)return;const st=crStatus27(it),c=it.client&&cfind(it.client),f=it.fields||{};
 const field=x=>{const v=f[x.key]||'',idv='crf_'+x.key;return `<div class="field" ${x.type==='textarea'?'style="grid-column:1/-1"':''}><label>${esc(x.label)}${it.clientFields?.[x.key]&&it.clientFields[x.key]===v?' <span class="sub">· client</span>':''}</label>${x.type==='select'?`<select id="${idv}"><option value=""></option>${[...new Set([...x.options,v].filter(Boolean))].map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}</select>`:x.type==='textarea'?`<textarea id="${idv}" rows="3">${esc(v)}</textarea>`:`<input id="${idv}" type="${x.type==='date'?'date':'text'}" value="${esc(v)}">`}</div>`;};
 let sections='',open=false;
 for(const x of CREATION_FIELDS){if(x.section){if(x.section==='Les justificatifs')continue;sections+=(open?'</div>':'')+`<h4 style="margin:16px 0 6px">${esc(x.section)}</h4><div class="formGrid">`;open=true;continue;}if(x.type==='file')continue;sections+=field(x);}
 sections+=open?'</div>':'';
 const docs=CR_FILES27.map(x=>{const d=crDocs27(it,x.key);return `<div class="kpiLine" style="align-items:flex-start"><span>${esc(x.label.split(',')[0])}${x.required?' *':''}</span><b>${d.length?d.map(y=>`<a href="${esc(crFileHref27(it,y))}" target="_blank" rel="noopener">${esc(y.name)}</a>`).join('<br>'):'<span class="bad">manquant</span>'}</b></div>`;}).join('');
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal" style="width:min(980px,96vw)"><div class="modalHead"><div><h3>${esc(it.name)}</h3><div class="sub"><span class="badge" style="background:${CR_COLORS27[st]};color:#fff">${esc(st)}</span>${it.sentAt?' · formulaire envoyé le '+datefr(it.sentAt.slice(0,10)):''}${it.submittedAt?' · réponse reçue le '+new Date(it.submittedAt).toLocaleString('fr-FR'):it.updatedAt?' · client en cours de saisie':''}</div></div><button class="btn secondary" onclick="closeModal()">Fermer</button></div>
 <div class="modalBody">
  <div class="v25actions" style="margin-bottom:12px;flex-wrap:wrap"><button class="btn small" onclick="crSend27('${it.id}')">✉ ${it.sentAt?'Renvoyer':'Envoyer'} le formulaire par mail</button><button class="btn small secondary" onclick="crCopy27('${it.id}')">Copier le lien</button>${it.token?`<a class="btn small light" href="${esc(crUrl27(it))}" target="_blank" rel="noopener">Voir le formulaire</a>`:''}${c?`<button class="btn small light" onclick="closeModal();openClient('${c.id}')">Fiche client : ${esc(c.name)}</button>`:`<button class="btn small green" onclick="crSaveFields27('${it.id}',true);crClient27('${it.id}')">Créer la fiche client</button>`}</div>
  ${it.preparedAt&&!it.sentAt?`<div class="note" style="margin-bottom:10px">Mail préparé le ${datefr(String(it.preparedAt).slice(0,10))} : il n’est pas marqué envoyé tant que tu ne l’as pas confirmé. <button class="btn small green" onclick="crConfirmSent27('${it.id}')">Confirmer l’envoi</button></div>`:''}
  ${it.sentAt?`<div class="sub" style="margin-bottom:6px">Envoi confirmé le ${datefr(String(it.sentAt).slice(0,10))}${it.sentBy?' par '+esc(it.sentBy):''}${it.controlledAt?` · contrôlé le ${datefr(String(it.controlledAt).slice(0,10))}${it.controlledBy?' par '+esc(it.controlledBy):''}`:''}</div>`:''}
  ${it.token?`<div class="sub" style="margin-bottom:10px">Lien du client : <code>${esc(crUrl27(it))}</code> · <b>${esc(it.link?.state||'actif')}</b>${it.link?.expiresAt?' · valable jusqu’au '+datefr(String(it.link.expiresAt).slice(0,10)):''}
   ${it.link?.state==='actif'?`<button class="btn small secondary" onclick="crLinkState27('${it.id}','extend')">Prolonger de 60 j</button> <button class="btn small secondary" onclick="if(confirm('Désactiver le lien ? Le client ne pourra plus ouvrir le formulaire.'))crLinkState27('${it.id}','revoke')">Révoquer</button>`:`<button class="btn small secondary" onclick="crLinkState27('${it.id}','reopen')">Réactiver le lien</button>`}</div>`:''}
  ${Object.keys(it.clientChanges||{}).length?`<div class="panel" style="border-color:#f79009"><div class="panelHead"><h3>Modifications du client à arbitrer</h3><span class="sub">Le client a changé ces réponses après une correction ou un contrôle du cabinet</span></div><table><thead><tr><th>Champ</th><th>Version cabinet</th><th>Nouvelle réponse du client</th><th></th></tr></thead><tbody>${Object.entries(it.clientChanges).map(([k,c])=>`<tr><td>${esc(CREATION_FIELDS.find(f=>f.key===k)?.label||k)}</td><td>${esc(c.cabinet)}</td><td>${esc(c.value)}</td><td style="white-space:nowrap"><button class="btn small green" onclick="crResolve27('${it.id}','${esc(k)}','client')">Prendre la réponse du client</button> <button class="btn small secondary" onclick="crResolve27('${it.id}','${esc(k)}','cabinet')">Garder la version cabinet</button></td></tr>`).join('')}</tbody></table></div>`:''}
  <div class="formGrid"><div class="field"><label>Nom du dossier</label><input id="cri_name" value="${esc(it.name)}"></div><div class="field"><label>Contact</label><input id="cri_contactName" value="${esc(it.contactName||'')}"></div><div class="field"><label>E-mail</label><input id="cri_contactEmail" value="${esc(it.contactEmail||'')}"></div><div class="field"><label>Deadline</label><input id="cri_deadline" type="date" value="${esc(it.deadline||'')}"></div><div class="field"><label>Honoraires de création (HT)</label><input id="cri_fees" type="number" value="${esc(it.fees||'')}"></div></div>
  ${sections}
  <h4 style="margin:16px 0 6px">Justificatifs</h4><div class="panel"><div class="panelBody">${docs}</div></div>
 </div>
 <div class="modalFooter" style="display:flex;justify-content:space-between;gap:8px"><button class="btn small secondary" onclick="crDelete27('${it.id}')">Supprimer le dossier</button><button class="btn green" onclick="crSaveFields27('${it.id}')">Enregistrer</button></div></div></div>`;
}
function crSaveFields27(id,quiet){
 const it=crFind27(id);if(!it)return;const v=k=>document.getElementById(k)?.value.trim();
 ['name','contactName','contactEmail','deadline'].forEach(k=>{const x=v('cri_'+k);if(x!=null)it[k]=x||(k==='name'?it.name:'');});
 const fees=v('cri_fees');if(fees!=null)it.fees=Number(fees||0);
 it.fields=it.fields||{};CR_TEXT27.forEach(x=>{const val=v('crf_'+x.key);if(val!=null)it.fields[x.key]=val;});
 if(it.fields.legalForm)it.legalForm=it.fields.legalForm;
 if(it.client)crToClient27(it);
 if(!quiet){closeModal();persist25();toast('Dossier enregistré');}else save();
}
async function crDelete27(id){
 const it=crFind27(id);if(!it)return;
 if(!confirm(`Supprimer le dossier « ${it.name} » ?${it.token?'\nLe lien envoyé au client ne fonctionnera plus et ses justificatifs seront effacés.':''}`))return;
 if(it.token&&shared25.active){try{await api27('/api/creation/delete',{method:'POST',body:JSON.stringify({token:it.token})});}catch(e){return alert('Suppression impossible : '+e.message);}}
 creation27().items=creation27().items.filter(x=>x.id!==id);log25('Matrice création : dossier supprimé',it.client||'',it.name);closeModal();persist25();
}

/* ---------- vers le portefeuille ---------- */
function crClosing27(d){return /^\d{4}-\d{2}-\d{2}$/.test(d||'')?d.slice(5):'';}
function crToClient27(it){
 const c=cfind(it.client);if(!c)return;const f=it.fields||{};
 const id={...(c.identity26||{})};
 if(f.capital)id.capital=f.capital;if(f.seat)id.address=f.seat;if(f.purpose)id.purpose27=f.purpose;
 const dirs=[f.dir1,f.dir2].filter(Boolean).map(t=>({name:String(t).split(/\s*\/\s*|\n/).slice(0,2).join(' ').trim(),role:/^SAS/.test(it.legalForm||'')?'Président':'Gérant',detail:t}));
 if(dirs.length)id.directors=dirs;
 c.identity26=id;
 if(it.legalForm&&(!c.legalForm||c.legalForm==='À confirmer'))c.legalForm=it.legalForm;
 if(crClosing27(f.firstClose))c.closing=crClosing27(f.firstClose);
 if(f.firstClose)c.firstClose27=f.firstClose;
 c.contact={...(c.contact||{}),name:c.contact?.name||it.contactName||'',email:c.contact?.email||it.contactEmail||''};
}
function crClient27(id){
 const it=crFind27(id);if(!it)return;
 if(it.client&&cfind(it.client))return openClient(it.client);
 let c=state.clients.find(x=>norm27(x.name)===norm27(it.fields?.denomination||it.name));
 if(c&&!confirm(`Un client « ${c.name} » existe déjà. Le rattacher à ce dossier ?`))c=null;
 if(!c){c=newClient26({name:it.fields?.denomination||it.name,siren:'',legalForm:it.legalForm||'',contact:it.contactName||'',email:it.contactEmail||''});state.clients.push(c);}
 it.client=c.id;c.creation27=it.id;crToClient27(it);
 if(!it.exc){const w={id:uid('EX'),client:c.id,name:'Création de société',typo:'Juridique',fees:Number(it.fees||0),date:today27(),deadline:it.deadline||'',realise:'',time:'',desc:`Création ${it.legalForm||''} ${it.name}`.trim(),associe:people27(c,'associe'),statut:it.stage==='Société créée'?'Terminé':'En cours',lancerFact:it.stage==='Société créée'?'Oui':'',created:today27()};exc27().items.push(w);it.exc=w.id;}
 log25('Matrice création : fiche client créée',c.id,it.name);closeModal();persist25();
 toast(`Fiche « ${c.name} » créée : elle apparaît dans l’onboarding, et la création dans les travaux exceptionnels.`);
}

/* ---------- import Excel (export Monday « Matrice création ») ---------- */
function importCreation27(rows,hi){
 const H=rows[hi].map(normHead27),idx=n=>H.indexOf(n);
 const data=rows.slice(hi+1).filter(r=>r[0]&&String(r[0]).trim()&&!['name','subitems'].includes(normHead27(r[0]))&&r.slice(1).some(v=>v!=null&&v!==''));
 if(!confirm(`Importer ${data.length} dossier(s) dans la Matrice création ?\nUn dossier déjà présent (même nom) est mis à jour ; la colonne CRM rattache le client du portefeuille.`))return;
 const date=v=>v==null||v===''?'':typeof v==='number'?new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10):/^\d{4}-\d{2}-\d{2}/.test(String(v))?String(v).slice(0,10):String(v);
 let created=0,updated=0;
 for(const r of data){
  const name=String(r[0]).trim(),get=n=>{const i=idx(n);return i<0?null:r[i];};
  let it=creation27().items.find(x=>norm27(x.name)===norm27(name));
  if(!it){it={id:uid('CR'),name,fields:{},files:[],createdAt:new Date().toISOString(),imported:true};creation27().items.push(it);created++;}else updated++;
  it.fields=it.fields||{};it.links=it.links||{};
  for(const f of CREATION_FIELDS.filter(f=>f.key&&f.head)){
   if(f.key==='denomination')continue;const v=get(f.head);if(v==null||v==='')continue;
   if(f.type==='file')it.links[f.key]=String(v);else it.fields[f.key]=f.type==='date'?date(v):String(v).trim();
  }
  it.fields.denomination=it.fields.denomination||name;
  if(it.fields.legalForm)it.legalForm=it.fields.legalForm;
  const dl=get('deadline');if(dl)it.deadline=date(dl);
  // Colonne CRM, sinon même nom qu'un client du portefeuille : la société existe déjà.
  const crm=String(get('crm')||'').split(',')[0].trim(),c=state.clients.find(x=>crm&&nameKey27(x.name)===nameKey27(crm))||state.clients.find(x=>nameKey27(x.name)===nameKey27(name));
  if(c&&!it.client){it.client=c.id;c.creation27=it.id;}
  if(!it.stage)it.stage=crm||c?'Société créée':'';
 }
 log25('Import Matrice création','',`${created} créé(s), ${updated} mis à jour`);persist25();
 toast(`Matrice création : ${created} dossier(s) créé(s), ${updated} mis à jour.`);
}
const previousImportBoard27=importBoard27;
importBoard27=async function(file){
 if(!file)return;
 let rows;try{rows=await readXlsx27(file);}catch(e){return previousImportBoard27(file);}
 const hi=rows.findIndex(r=>normHead27(r[0])==='name');
 if(hi>=0&&rows[hi].some(h=>normHead27(h)==="forme juridique de l'entreprise")&&rows[hi].some(h=>normHead27(h)==='objet social'))return importCreation27(rows,hi);
 return previousImportBoard27(file);
};

/* ---------- navigation, tableau de bord ---------- */
(function(){
 const menu=document.querySelector('.nav'),pr=menu?.querySelector('a[data-page="prospects"]');if(!pr||menu.querySelector('a[data-page="creation"]'))return;
 const a=document.createElement('a');a.href='#';a.dataset.page='creation';a.textContent='✎ Matrice création';a.onclick=e=>{e.preventDefault();nav(a.dataset.page);};
 pr.after(a);
})();
const previousRenderCreation27=render;
render=function(){
 previousRenderCreation27();
 if(state.page==='creation'){document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('active',a.dataset.page==='creation'));document.getElementById('root').innerHTML=creationPage27();}
 if(state.page==='cabinetdash'){const n=creation27().items.filter(it=>crStatus27(it)==='Informations reçues').length,root=document.getElementById('root');if(n&&!root.querySelector('.crNote27')){const d=document.createElement('div');d.className='note crNote27';d.style.margin='0 0 12px';d.style.cursor='pointer';d.onclick=()=>routePage('creation');d.innerHTML=`<b>Matrice création :</b> ${n} formulaire(s) de création reçu(s) à traiter.`;root.querySelector('.titleRow')?.after(d);}}
 if(shared25.active&&shared25.ready&&!cr27.pulling&&Date.now()-cr27.lastPull>(state.page==='creation'?60e3:15*60e3)&&creation27().items.some(x=>x.token))setTimeout(()=>pullCreation27(true),0);
};
