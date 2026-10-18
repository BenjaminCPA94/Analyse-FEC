/* RB Partners V27 — fiche « Nouveau prospect » : coordonnées, température, relance, structure envisagée
 * (recherche par nom avec préremplissage), adresses, personne assignée. La suite (étapes, missions,
 * honoraires, validation vers l'onboarding) reste celle de l'écran Prospects. */
const TEMPS27=[['Froid','#2f6fd6'],['Tiède','#f08a3c'],['Chaud','#e0364f']];
const STRUCTS27=['Société existante','Société à créer','Entreprise individuelle','Association','Autre'];
const FORMS27=['SAS','SASU','SARL','EURL','SA','SCI','SNC','SELARL','SELAS','Entreprise individuelle','Micro-entreprise','Association','Autre'];
const TITLES27=['Président','Directeur général','Gérant','Co-gérant','Associé unique','Président du conseil d’administration','Entrepreneur individuel'];
let pf27=null,pfSeq27=0,pfTimer27=null;
function tempDot27(t){const c=(TEMPS27.find(x=>x[0]===t)||[])[1];return c?`<span class="pf27dot" style="background:${c}"></span>`:'';}
function tempBadge27(p){return p.temp27?`<span class="pf27temp">${tempDot27(p.temp27)}${esc(p.temp27)}</span>`:'<span class="sub">—</span>';}
function closingIso27(v){const m=String(v||'').match(/^(\d{1,2})\/(\d{1,2})$/);return m&&+m[1]<=31&&+m[2]<=12?String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0'):'';}
function assignees27(cur){const names=(typeof activeTeam27==='function'?activeTeam27().map(m=>m.name):[]);if(!names.length)names.push(...PEOPLE);if(cur&&!names.includes(cur))names.unshift(cur);return names;}
function pfAddr27(a){return [[a.num,a.street].filter(Boolean).join(' '),[a.zip,a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');}

/* ---------- Formulaire ---------- */
function prospectForm27(id){
 const p=id?pfind(id):null,f={struct:'Société existante',closing:'31/12',addr:{},home:{},homeSame:true,temp:'Tiède',owner:p?.owner||(typeof me27==='function'?me27():'')||state.currentUser||'',...(p?.form27||{})};
 if(p&&!p.form27){f.company=p.name;f.email=p.email;f.phone=p.phone;f.siren=p.siren;f.legalForm=p.legalForm;f.budget=p.value||'';f.comment=p.notes;f.last=p.contact;}
 pf27={id:id||'',f};const v=k=>esc(f[k]??''),g=(k,l,h)=>`<div class="field"><label for="pf27_${k}">${l}</label>${h}</div>`,inp=(k,ph='',t='text',x='')=>`<input id="pf27_${k}" type="${t}" value="${v(k)}" placeholder="${esc(ph)}" ${x}>`;
 const sel=(k,opts,ph)=>`<select id="pf27_${k}">${ph?`<option value="">${ph}</option>`:''}${opts.map(o=>`<option ${f[k]===o?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
 const addr=(k,a)=>`<div class="pf27grid4"><div class="field"><label>N°</label><input id="pf27_${k}_num" value="${esc(a.num||'')}" placeholder="12"></div><div class="field"><label>Rue</label><input id="pf27_${k}_street" value="${esc(a.street||'')}" placeholder="rue de la Paix"></div><div class="field"><label>Code postal</label><input id="pf27_${k}_zip" value="${esc(a.zip||'')}" placeholder="75002" inputmode="numeric" maxlength="5"></div><div class="field"><label>Ville</label><input id="pf27_${k}_city" value="${esc(a.city||'')}" placeholder="Paris"></div></div>`;
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal pf27"><div class="modalHead"><div><h3>${id?'Modifier le prospect':'＋ Nouveau prospect'}</h3><div class="sub">Renseignez les coordonnées du prospect et la structure envisagée.</div></div><button class="btn secondary small" onclick="closeModal()" aria-label="Fermer">✕</button></div><div class="modalBody">
 <div class="formGrid">${g('first','Prénom',inp('first'))}${g('last','Nom',inp('last'))}${g('phone','Téléphone',inp('phone','06 12 34 56 78','tel'))}${g('email','Adresse mail',inp('email','contact@email.fr','email'))}</div>
 <label class="pf27switch"><input type="checkbox" id="pf27_pm" ${f.pm?'checked':''} onchange="pfToggle27()"><span></span>Le dirigeant est une personne morale (société)</label>
 <div class="formGrid"><div id="pf27_civBox">${g('civ','Civilité du dirigeant',sel('civ',['M.','Mme'],'Sélectionner'))}</div><div id="pf27_pmBox">${g('pmName','Société dirigeante',inp('pmName','Nom de la société dirigeante'))}</div></div>
 ${g('comment','Commentaire projet',`<textarea id="pf27_comment" placeholder="Décrivez le projet du prospect…">${v('comment')}</textarea>`)}
 <div class="formGrid"><div class="field"><label>Température</label><div class="pf27dd" id="pf27_tempBox"><button type="button" class="pf27ddBtn" onclick="pfTempOpen27(event)" aria-haspopup="listbox"><span id="pf27_tempLbl">${tempDot27(f.temp)}${esc(f.temp)}</span><span class="pf27chev">⌄</span></button><div class="pf27ddList" role="listbox" hidden>${TEMPS27.map(([t])=>`<div role="option" class="pf27opt ${f.temp===t?'on':''}" onclick="pfTemp27('${t}')"><span class="pf27chk">${f.temp===t?'✓':''}</span>${tempDot27(t)}${t}</div>`).join('')}</div></div></div>${g('relance','Date de relance',inp('relance','','date'))}</div>
 ${g('followup','Note de relance / suivi',`<textarea id="pf27_followup" placeholder="Ex : rappeler fin août, attend son bilan…">${v('followup')}</textarea>`)}
 <div class="pf27card">${g('struct','Structure envisagée',sel('struct',STRUCTS27))}
  <div class="field pf27ac"><label for="pf27_company" id="pf27_companyLbl">Nom de la structure</label><input id="pf27_company" value="${v('company')}" autocomplete="off" placeholder="Tapez le nom — SIREN, forme, dirigeant, adresse pré-remplis" oninput="pfSearch27()"><div id="pf27_hits" class="pf27hits" hidden></div><div id="pf27_status" class="sub" role="status"></div></div>
  <div class="formGrid"><div id="pf27_sirenBox">${g('siren','SIREN',inp('siren','123456789','text','inputmode="numeric" maxlength="11"'))}</div>${g('legalForm','Forme juridique',sel('legalForm',FORMS27.includes(f.legalForm)||!f.legalForm?FORMS27:[f.legalForm,...FORMS27],'Sélectionner'))}
  ${g('title','Titre du dirigeant',inp('title','Sélectionner ou saisir un titre','text','list="pf27_titles"')+`<datalist id="pf27_titles">${TITLES27.map(t=>`<option value="${esc(t)}">`).join('')}</datalist>`)}${g('capital','Capital social (€)',inp('capital','0','number','min="0" step="any"'))}
  ${g('closing','Clôture de l’exercice (JJ/MM)',inp('closing','31/12'))}<div id="pf27_createdBox">${g('created','Date de création',inp('created','','date'))}</div>
  ${g('sector','Secteur d’activité',inp('sector','Conseil, commerce…'))}${g('budget','Budget annuel HT (€) <span class="bad">*</span>',inp('budget','0.00','number','min="0" step="any" required'))}</div></div>
 <h4 class="pf27h">⌖ Adresse de la société</h4>${addr('addr',f.addr||{})}
 <div class="pf27card"><h4 class="pf27h" style="margin-top:0">⌖ Adresse personnelle du dirigeant</h4><label class="pf27switch"><input type="checkbox" id="pf27_homeSame" ${f.homeSame!==false?'checked':''} onchange="pfToggle27()"><span></span>Identique à l’adresse de la société</label><div id="pf27_homeBox">${addr('home',f.home||{})}</div></div>
 ${g('owner','Assigné à',`<select id="pf27_owner">${assignees27(f.owner).map(n=>`<option ${n===f.owner?'selected':''}>${esc(n)}</option>`).join('')}</select>`)}
 </div><div class="modalFooter"><button class="btn secondary" onclick="closeModal()">Annuler</button><button class="btn" onclick="savePf27()">Enregistrer</button></div></div></div>`;
 document.getElementById('pf27_struct').addEventListener('change',pfToggle27);pfToggle27();
}
function pfToggle27(){
 const q=k=>document.getElementById('pf27_'+k),pm=q('pm').checked,create=q('struct').value==='Société à créer';
 q('civBox').hidden=pm;q('pmBox').hidden=!pm;q('homeBox').hidden=q('homeSame').checked;
 q('sirenBox').hidden=create;q('createdBox').hidden=create;
 q('companyLbl').textContent=create?'Nom envisagé de la structure':'Nom de la structure';
 q('company').placeholder=create?'Nom envisagé (pas de recherche)':'Tapez le nom — SIREN, forme, dirigeant, adresse pré-remplis';
 if(create)q('hits').hidden=true;
}
function pfTempOpen27(e){e.stopPropagation();const l=document.querySelector('#pf27_tempBox .pf27ddList');l.hidden=!l.hidden;if(!l.hidden)setTimeout(()=>document.addEventListener('click',()=>{l.hidden=true;},{once:true}));}
function pfTemp27(t){pf27.f.temp=t;document.getElementById('pf27_tempLbl').innerHTML=tempDot27(t)+esc(t);document.querySelectorAll('#pf27_tempBox .pf27opt').forEach(o=>{const on=o.textContent.trim().endsWith(t);o.classList.toggle('on',on);o.querySelector('.pf27chk').textContent=on?'✓':'';});document.querySelector('#pf27_tempBox .pf27ddList').hidden=true;}

/* ---------- Recherche par nom (Annuaire des entreprises, données publiques) ---------- */
function pfSearch27(){
 clearTimeout(pfTimer27);const q=document.getElementById('pf27_company').value.trim(),box=document.getElementById('pf27_hits');
 if(document.getElementById('pf27_struct').value==='Société à créer'||q.length<3){box.hidden=true;return;}
 pfTimer27=setTimeout(async()=>{
  const seq=++pfSeq27,st=document.getElementById('pf27_status');st.textContent='Recherche…';
  try{
   const digits=q.replace(/\s/g,''),url=shared25.active?(/^\d{9}$/.test(digits)?'/api/company?siren='+digits:'/api/company?q='+encodeURIComponent(q)):'https://recherche-entreprises.api.gouv.fr/search?per_page=6&q='+encodeURIComponent(q);
   const r=await fetch(url);if(!r.ok)throw Error(r.status===429?'Trop de recherches : réessaie dans une minute.':'Recherche indisponible : saisis les informations manuellement.');
   const res=(await r.json()).results||[];if(seq!==pfSeq27||!document.getElementById('pf27_hits'))return;
   pf27.hits=res;st.textContent=res.length?'':'Aucune entreprise trouvée : complète la fiche manuellement.';
   box.innerHTML=res.map((x,i)=>`<div class="pf27hit" onclick="pfPick27(${i})"><b>${esc(x.nom_raison_sociale||x.nom_complet||'')}</b><span class="sub">${esc(x.siren)} · ${esc(legalName26(x.nature_juridique)||x.nature_juridique||'')} · ${esc(x.siege?.libelle_commune||'')}${x.etat_administratif==='C'?' · cessée':''}</span></div>`).join('');box.hidden=!res.length;
  }catch(e){if(seq===pfSeq27&&document.getElementById('pf27_status')){document.getElementById('pf27_status').textContent=e.message||'Recherche indisponible.';box.hidden=true;}}
 },350);
}
async function pfPick27(i){
 const x=pf27?.hits?.[i];if(!x)return;const q=k=>document.getElementById('pf27_'+k),s=x.siege||{},d=(x.dirigeants||[])[0]||{},set=(k,v)=>{if(v!=null&&v!=='')q(k).value=v;};
 const data=mapCompany26({results:[x]},x.siren);pf27.identity=data;
 set('company',data.name);set('siren',data.siren);set('created',data.created);set('sector',[x.activite_principale,x.libelle_activite_principale].filter(Boolean).join(' — '));
 const lf=data.legalForm;if(lf){if(![...q('legalForm').options].some(o=>o.value===lf))q('legalForm').add(new Option(lf,lf));q('legalForm').value=lf;}
 set('addr_num',[s.numero_voie,s.indice_repetition].filter(Boolean).join(' '));set('addr_street',[s.type_voie&&(TYPE_VOIE27[s.type_voie]||s.type_voie),s.libelle_voie].filter(Boolean).join(' '));set('addr_zip',s.code_postal);set('addr_city',s.libelle_commune);
 if(d.type_dirigeant==='personne morale'||d.denomination){q('pm').checked=true;set('pmName',d.denomination);}else if(d.nom){set('last',d.nom.toUpperCase());set('first',(d.prenoms||'').split(' ')[0]);}
 if(d.qualite)set('title',d.qualite);
 q('hits').hidden=true;q('status').textContent=`${data.source} · ${data.active==='C'?'Attention : entreprise déclarée cessée. ':''}Vérifie les valeurs préremplies ; capital et clôture ne sont pas fournis par l’annuaire public.`;pfToggle27();
 if(shared25.active)try{const r=await fetch('/api/company?siren='+x.siren);if(r.ok){const hit=((await r.json()).results||[]).find(y=>y.siren===x.siren);if(hit?.capital_pappers!=null&&q('capital')&&!q('capital').value)q('capital').value=hit.capital_pappers;}}catch(e){}
}
const TYPE_VOIE27={RUE:'rue',AV:'avenue',BD:'boulevard',PL:'place',CHE:'chemin',ALL:'allée',IMP:'impasse',QUAI:'quai',RTE:'route',SQ:'square',CRS:'cours',PASS:'passage'};

/* ---------- Enregistrement ---------- */
function savePf27(){
 const q=k=>document.getElementById('pf27_'+k),val=k=>(q(k)?.value||'').trim(),adr=k=>({num:val(k+'_num'),street:val(k+'_street'),zip:val(k+'_zip'),city:val(k+'_city')});
 const f={...pf27.f,first:val('first'),last:val('last'),phone:val('phone'),email:val('email'),pm:q('pm').checked,civ:val('civ'),pmName:val('pmName'),comment:val('comment'),relance:val('relance'),followup:val('followup'),struct:val('struct'),company:val('company'),siren:cleanSiren26(val('siren')),legalForm:val('legalForm'),title:val('title'),capital:val('capital'),closing:val('closing'),created:val('created'),sector:val('sector'),budget:val('budget'),addr:adr('addr'),homeSame:q('homeSame').checked,home:adr('home'),owner:val('owner')};
 if(f.struct==='Société à créer'){f.siren='';f.created='';}
 const person=[f.first,f.last].filter(Boolean).join(' '),name=f.company||(f.pm?f.pmName:'')||person;
 if(!name)return toast('Renseigne au moins le nom du prospect ou de la structure.');
 if(f.budget===''||!(Number(f.budget)>=0))return toast('Le budget annuel HT est obligatoire.');
 if(f.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))return toast('Adresse mail invalide.');
 if(f.siren&&!/^\d{9}$/.test(f.siren))return toast('Le SIREN doit comporter 9 chiffres.');
 if(f.closing&&!closingIso27(f.closing))return toast('Clôture attendue au format JJ/MM (ex. 31/12).');
 let p=pf27.id?pfind(pf27.id):null;
 if(f.siren){const c=state.clients.find(c=>c.siren===f.siren&&c.prospectId!==p?.id);if(c)return toast('Ce SIREN figure déjà dans le portefeuille : '+c.name);if(state.prospects.some(x=>x!==p&&x.siren===f.siren&&x.stage!=='Refusé'))return toast('Un prospect possède déjà ce SIREN.');}
 if(!p){p={id:uid('P'),stage:'Nouveau',appointment:'',source:'Fiche prospect',created27:new Date().toISOString()};state.prospects.push(p);}
 const contact=f.pm?[f.pmName,person&&'représentée par '+person].filter(Boolean).join(', '):[f.civ,person].filter(Boolean).join(' ');
 const prev=p.identity26||{},id=pf27.identity&&pf27.identity.siren===f.siren?pf27.identity:{};
 Object.assign(p,{name,contact,email:f.email,phone:f.phone,owner:f.owner,value:Number(f.budget||0),notes:f.comment,temp27:f.temp,relance27:f.relance,siren:f.siren,legalForm:f.legalForm,form27:f,
  next:f.followup||p.next||'Qualifier le prospect',
  identity26:{...prev,...id,name,siren:f.siren,legalForm:f.legalForm,address:pfAddr27(f.addr)||id.address||prev.address||'',capital:f.capital,contact:person,email:f.email,naf:id.naf||prev.naf||'',created:f.created,directors:id.directors||prev.directors||(person||f.pmName?[{name:f.pm?f.pmName:person,role:f.title}]:[])}});
 // Budget repris en honoraires courants tant qu'il n'a pas été ventilé (bilan, AGO, autres) dans la suite.
 const fe=p.fees27,split=fe&&(Number(fe.annualAccounts)||Number(fe.legalAnnual)||Number(fe.other));
 if(fe&&!split)fe.accounting=p.value;
 if(split&&fe.accounting+fe.annualAccounts+fe.legalAnnual+fe.other!==p.value)setTimeout(()=>toast('Budget modifié : pense à ajuster la ventilation des honoraires dans la fiche.'),400);
 log25(pf27.id?'Prospect modifié':'Prospect créé','',name);
 const editing=pf27.id;pf27=null;closeModal();state.page='prospects';persist25();
 toast(editing?'Prospect enregistré':'Prospect créé');if(editing)openProspect(editing);
}
openNewProspect=function(){prospectForm27('');};

/* ---------- Suite : fiche prospect existante, validation ---------- */
const previousOpenProspect27b=openProspect;
openProspect=function(id){
 previousOpenProspect27b(id);
 const p=pfind(id),head=document.querySelector('.modalHead'),own=document.getElementById('p_owner');if(!p||!head)return;
 if(own){const names=assignees27(p.owner);own.innerHTML=names.map(n=>`<option ${n===p.owner?'selected':''}>${esc(n)}</option>`).join('');}
 const b=document.createElement('div');b.className='pf27head';
 b.innerHTML=`${tempBadge27(p)}${p.relance27?`<span class="badge ${p.relance27<=today27()?'red':'blue'}">Relance ${datefr(p.relance27)}</span>`:''}${p.form27?.struct?`<span class="badge gray">${esc(p.form27.struct)}</span>`:''}${p.phone?`<a class="badge gray" href="tel:${esc(p.phone)}">${esc(p.phone)}</a>`:''}<button class="btn small" onclick="prospectForm27('${id}')">Modifier la fiche</button>`;
 head.firstElementChild.append(b);
};
const previousValidateProspect27b=validateProspect;
validateProspect=function(id){
 const p=pfind(id);previousValidateProspect27b(id);
 const c=state.clients.find(x=>x.prospectId===id),f=p?.form27;if(!c||!f)return;
 const cl=closingIso27(f.closing);if(cl)c.closing=cl;
 if(f.legalForm)c.legalForm=f.legalForm;
 c.contact={...(c.contact||{}),name:[f.civ,f.first,f.last].filter(Boolean).join(' ')||c.contact?.name||'',email:f.email||c.contact?.email||'',phone:f.phone||c.contact?.phone||''};
 c.identity26={...(c.identity26||{}),...p.identity26,sector:f.sector,leaderTitle:f.title,leaderPm:f.pm?f.pmName:'',leaderHome:f.homeSame?'':pfAddr27(f.home)};
 if(f.struct==='Société à créer')c.creation27=true;
 log25('Fiche prospect reprise sur le client',c.id,f.struct||'');persist25();
};

/* ---------- Liste des prospects : température et relance ---------- */
const previousProspectsPage27=prospects;
prospects=function(){
 const html=previousProspectsPage27(),box=document.createElement('div');box.innerHTML=html;
 const tr=box.querySelector('thead tr');if(!tr)return html;
 tr.children[0].insertAdjacentHTML('afterend','<th>Température</th>');tr.children[5].insertAdjacentHTML('afterend','<th>Relance</th>');tr.children[4].textContent='Budget HT';
 box.querySelectorAll('tbody tr').forEach(row=>{const id=(row.getAttribute('onclick')||'').match(/openProspect\('([^']+)'/)?.[1],p=id&&pfind(id);if(!p)return;
  row.children[0].insertAdjacentHTML('afterend',`<td>${tempBadge27(p)}</td>`);
  row.children[5].insertAdjacentHTML('afterend',`<td class="${p.relance27&&p.relance27<=today27()&&!['Validé','Refusé'].includes(p.stage)?'bad':''}">${p.relance27?datefr(p.relance27):'—'}</td>`);
  if(p.phone)row.children[3].insertAdjacentHTML('beforeend',`<div class="sub">${esc(p.phone)}</div>`);
  if(p.form27?.struct)row.children[0].querySelector('.sub').textContent=p.form27.struct;});
 return box.innerHTML;
};

/* ---------- Mon travail : relances des prospects ---------- */
if(typeof tasks27==='function'){
 const previousTasks27b=tasks27;
 tasks27=function(){
  const out=previousTasks27b();
  for(const p of state.prospects||[]){if(!p.relance27||['Validé','Refusé'].includes(p.stage))continue;const key='R|'+p.id,m=taskMeta27(key);
   out.push({key,src:'prospect',c:{id:'',pid:p.id,name:p.name},action:'Relancer le prospect'+(p.form27?.followup?' : '+p.form27.followup:''),status:p.stage,period:p.temp27||'',official:'',target:p.relance27,owner:m.owner||p.owner||'',meta:m});}
  return out;
 };
}

(function(){const st=document.createElement('style');st.textContent=`
.modal.pf27{width:min(620px,96vw)}
.pf27 .formGrid{grid-template-columns:1fr 1fr;gap:12px 16px}.pf27 .field label{text-transform:none;letter-spacing:0;font-size:13px;font-weight:600;color:#1f2a3d}.pf27 .modalHead h3{font-size:18px}
.pf27 .modalFooter .btn:not(.secondary){background:#22345f;border-color:#22345f}.pf27 input,.pf27 select,.pf27 textarea{border-radius:8px}.pf27 .modalBody{display:flex;flex-direction:column;gap:12px}.pf27 .field textarea{min-height:70px}
.pf27switch{display:flex;align-items:center;gap:10px;border:1px solid #e3e7ee;border-radius:10px;padding:12px 14px;font-weight:600;cursor:pointer}
.pf27switch input{position:absolute;opacity:0;width:1px;height:1px}.pf27switch span{width:38px;height:22px;border-radius:11px;background:#d9dee7;position:relative;flex:none;transition:.15s}
.pf27switch span:after{content:'';position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.15s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.pf27switch input:checked+span{background:#22345f}.pf27switch input:checked+span:after{left:19px}.pf27switch input:focus-visible+span{outline:2px solid #1768c6;outline-offset:2px}
.pf27card{border:1px solid #e3e7ee;border-radius:12px;padding:14px;background:#fafbfc;display:flex;flex-direction:column;gap:10px}
.pf27h{margin:6px 0 0;font-size:14px}.pf27grid4{display:grid;grid-template-columns:1fr 2fr;gap:8px 12px}
.pf27dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.pf27temp{white-space:nowrap}.pf27dd{position:relative}.pf27ddBtn{width:100%;display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid #d9dee7;border-radius:8px;padding:9px 11px;font:inherit;cursor:pointer;text-align:left}
.pf27ddList{position:absolute;z-index:5;left:0;right:0;top:calc(100% + 4px);background:#fff;border:1px solid #e3e7ee;border-radius:10px;box-shadow:0 10px 24px rgba(0,0,0,.12);padding:4px}
.pf27opt{padding:8px 10px;border-radius:7px;cursor:pointer;display:flex;align-items:center}.pf27opt:hover,.pf27opt.on{background:#eef1fa}.pf27chk{width:18px;font-size:12px}
.pf27ac{position:relative}.pf27hits{position:absolute;z-index:6;left:0;right:0;top:64px;background:#fff;border:1px solid #e3e7ee;border-radius:10px;box-shadow:0 10px 24px rgba(0,0,0,.12);max-height:260px;overflow:auto}
.pf27hit{padding:9px 12px;cursor:pointer;display:flex;flex-direction:column;gap:2px}.pf27hit:hover{background:#eef1fa}
.pf27head{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px}.pf27head a.badge{text-decoration:none}
@media(max-width:560px){.pf27 .formGrid{grid-template-columns:1fr}}`;document.head.append(st);})();
