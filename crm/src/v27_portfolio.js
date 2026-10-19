/* RB Partners V27 — Portefeuille clients et Onboarding sur le modèle des tableaux Excel du cabinet,
 * prospects reliés automatiquement au reste du CRM, navigation simplifiée.
 * Une donnée se saisit une seule fois sur la fiche client (personnes, régimes, clôture, missions, honoraires)
 * et se retrouve partout : Portefeuille, Onboarding, Fiscalité, Bilan, AGO, Contrôle des honoraires. */

/* ---------- Missions et onboarding ---------- */
const MISSIONS27=[['accounting','Tenue comptable'],['tax','Fiscalité FR'],['annualAccounts','Bilan FR'],['legal','AGO'],['payroll','Paie'],['irpp','IRPP'],['reporting','Reporting'],['ponctuelle','Mission ponctuelle'],['einvoice','Facturation électronique']];
const ONB_STEPS27=[
 ['Envoyer la LDM comptabilité','LDM comptabilité'],
 ['Envoyer la lettre de reprise, le cas échéant','Lettre de reprise'],
 ['Création de la fiche client (facturation) dans Pennylane','Fiche facturation Pennylane'],
 ['Mettre en place le prélèvement automatique','Prélèvement automatique'],
 ['Renseigner le montant des honoraires + temps prévu','Honoraires + temps prévu'],
 ['Vérifier le paramétrage du dossier','Paramétrage vérifié'],
 ['Création du dossier sur Sharepoint','Dossier SharePoint'],
 ['Activation du compte impôt.gouv','Compte impots.gouv'],
 ['Envoyer le mandat bancaire aux impôts','Mandat bancaire impôts'],
 ['Envoyer Mandat Sobank','Mandat Sobank'],
 ['Questionnaire LAB + Documents bénéficiaires effectifs & Dirigeants','LAB + bénéficiaires'],
 ['Présentation environnement Pennylane','Présentation Pennylane'],
 ['Compléter le dossier permanent','Dossier permanent'],
 ['Catégoriser le client','Catégoriser le client'],
 ['Création du dossier de production dans Pennylane','Dossier production Pennylane'],
 ['Abonnement Pennylane actif','Abonnement Pennylane'],
];
/* Ordre d'affichage (les étapes 15 et 16 ont été ajoutées après coup : leur numéro de stockage ne change pas). */
const ONB_ORDER27=[0,1,2,14,15,3,4,5,6,7,8,9,10,11,12,13];
/* Prérequis bloquants : sans eux, l'onboarding ne se valide que par un associé ou un administrateur, avec justification. */
const ONB_BLOCKING27=[0,2,4,5,10];
const ONB_OPTS27=['A faire','En cours','Fait','Bloqué','À vérifier','NA'];
const LDM_OPTS27=['Non','Préparée','Envoyée','Signée'];
function onb27(c){if(!c.onb27)c.onb27={s:{},p:{}};return c.onb27;}
/* Lettre de mission : préparée, envoyée, signée. Les anciennes valeurs ambiguës ne valent pas signature. */
function ldm27(c){const v=c.ldm27;if(LDM_OPTS27.includes(v))return v;if(v==='Oui')return 'Signée';if(v==='En cours')return 'Préparée';return c.lm26?.generated||c.lm26?.validated?'Préparée':'Non';}
/* Étapes cochées automatiquement à partir des données déjà saisies (une valeur saisie à la main reste prioritaire). */
function onbParamMissing27(c){const m=[];if(!c.siren)m.push('SIREN');if(!c.closing)m.push('clôture');if(!['IS','IR'].includes(c.taxRegime))m.push('régime fiscal');if(!MISSIONS27.some(([k])=>c.missions?.[k]))m.push('missions');if(c.missions?.tax&&!['Mensuelle','Trimestrielle','Annuelle','Non soumis','Franchise'].includes(c.vatRegime))m.push('régime TVA');if(!people27(c,'manager'))m.push('manager');return m;}
function onbAuto27(c,i){
 if(i===0){const l=ldm27(c);return l==='Signée'?'Fait':l==='Non'?'A faire':'En cours';}
 // Un identifiant client Pennylane prouve seulement la fiche de facturation, pas le dossier de production ni l'abonnement.
 if(i===2)return c.pl27?.customerId?'Fait':'A faire';
 if(i===14){if(c.pl27?.companyId)return 'Fait';return onb27(c).s[2]==='Fait'?'À vérifier':'A faire';}
 if(i===15)return onb27(c).s[2]==='Fait'?'À vérifier':'A faire';
 // Des honoraires sans budget de temps ne terminent pas l'étape.
 if(i===4)return feeTotalClient(c)>0&&Number(c.budgetHours||0)>0?'Fait':feeTotalClient(c)>0||Number(c.budgetHours||0)>0?'En cours':'A faire';
 // Le paramétrage complet est un indice, la vérification reste humaine.
 if(i===5)return onbParamMissing27(c).length?'A faire':'À vérifier';
 if(i===13)return c.group27||c.typologie27?'Fait':'A faire';
 return 'A faire';
}
function onbStep27(c,i){return onb27(c).s[i]||onbAuto27(c,i);}
function onbProgress27(c){
 const st=ONB_STEPS27.map((_,i)=>onbStep27(c,i)),done=st.filter(s=>s==='Fait'||s==='NA').length;
 return {done,total:st.length,blocked:st.includes('Bloqué'),label:`${done}/${st.length}`,color:done===st.length?C27.green:st.includes('Bloqué')?C27.red:done?C27.orange:C27.blue};
}
function isOnboarding27(c){return c.status==='Onboarding';}

/* ---------- Colonnes ---------- */
const missionCol27=([k,label])=>({k:'m_'+k,label,t:'status',opts:OUINON27,w:105,get:x=>x.c.missions?.[k]?'Oui':'Non',set:(x,v)=>{(x.c.missions=x.c.missions||{})[k]=v==='Oui';}});
const STATUT_COL27=AGO_COLS27.find(c=>c.k==='statutClient');
const autoPill27=(v,color)=>v?`<span class="pill27 static27" style="background:${color||color27(v)}">${esc(v)}</span>`:'<span class="sub">—</span>';
const PF_COLS27=[
 {k:'entry',label:'Date entrée',t:'date',get:x=>x.c.entry||'',set:(x,v)=>{x.c.entry=v;}},
 {k:'onbAuto',label:'Onboarding',t:'auto',w:100,render:x=>{const p=onbProgress27(x.c);return onbDone27(x.c)?autoPill27('Validé',C27.green):isOnboarding27(x.c)||p.done<p.total?`<a href="#" onclick="event.preventDefault();routePage('onboarding')">${autoPill27(p.label,p.color)}</a>`:autoPill27('Terminé',C27.green);}},
 ...PEOPLE27,
 clientCol27('siren','SIREN','text',c=>c.siren||'',(c,v)=>{c.siren=String(v).replace(/\s/g,'').slice(0,9);},null,100),
 clientCol27('forme','Forme juridique','text',c=>c.legalForm||'',(c,v)=>{c.legalForm=v;},null,90),
 {...STATUT_COL27,label:'Statut'},
 GROUPE27,
 {...CLOTURE27},
 clientCol27('regimeFiscal','Régime fiscal','status',c=>['IS','IR'].includes(c.taxRegime)?c.taxRegime:'A définir',(c,v)=>{c.taxRegime=v==='A définir'?'À confirmer':v;},['IS','IR','A définir']),
 clientCol27('tva','Régime TVA','status',c=>TVA27.includes(c.vatRegime)?c.vatRegime:'',(c,v)=>{c.vatRegime=v;},TVA27),
 ...MISSIONS27.map(missionCol27),
 {k:'ldm',label:'Lettre de mission',t:'status',opts:LDM_OPTS27,get:x=>ldm27(x.c),set:(x,v)=>{x.c.ldm27=v;(x.c.ldmLog27=x.c.ldmLog27||[]).push({v,at:new Date().toISOString(),by:shared25.user?.username||''});}},
 clientCol27('honoCourants','Honoraires courants','num',c=>fees27(c).accounting||0,(c,v)=>{fees27(c).accounting=Number(v||0);syncFees27(c);}),
 clientCol27('honoBilan','Honoraires bilan','num',c=>fees27(c).annualAccounts||0,(c,v)=>{fees27(c).annualAccounts=Number(v||0);syncFees27(c);}),
 clientCol27('honoAgo','Honoraires AGO','num',c=>fees27(c).legalAnnual||0,(c,v)=>{fees27(c).legalAnnual=Number(v||0);syncFees27(c);}),
 clientCol27('honoAutres','Autres honoraires','num',c=>fees27(c).other||0,(c,v)=>{fees27(c).other=Number(v||0);syncFees27(c);}),
 {k:'budget',label:'Budget',t:'auto',sum:true,get:x=>feeTotalClient(x.c)-Number(fees27(x.c).exceptional||0)},
 clientCol27('contact','Contact','text',c=>c.contact?.name||'',(c,v)=>{c.contact={...(c.contact||{}),name:v};},null,140),
 clientCol27('email','Email','text',c=>c.contact?.email||'',(c,v)=>{c.contact={...(c.contact||{}),email:v};},null,170),
 {k:'bilanY',label:'Bilan (exercice suivi)',t:'auto',w:150,render:x=>{const b=ctx27('bilan',x.c,boards27().year);return val27(b,'afaire')==='Oui'?`<a href="#" onclick="event.preventDefault();routePage('closing')">${autoPill27(val27(b,'etat'))}</a>`:'<span class="sub">—</span>';}},
 {k:'agoY',label:'AGO (exercice suivi)',t:'auto',w:150,render:x=>{const a=ctx27('ago',x.c,boards27().year);return val27(a,'juridique')==='Oui'?`<a href="#" onclick="event.preventDefault();routePage('legal')">${autoPill27(val27(a,'statut'))}</a>`:'<span class="sub">—</span>';}},
 {k:'pennylane',label:'Pennylane',t:'auto',w:90,render:x=>x.c.pl27?.companyId?`<a class="btn small light" href="https://app.pennylane.com/companies/${encodeURIComponent(x.c.pl27.companyId)}" target="_blank" rel="noopener">Ouvrir</a>`:x.c.pl27?.customerId?'<span class="sub">Facturé</span>':'<span class="sub">—</span>'},
];
const ONB_COLS27=[
 {k:'entry',label:'Date entrée',t:'date',get:x=>x.c.entry||'',set:(x,v)=>{x.c.entry=v;}},
 {k:'deadline',label:'Deadline onboarding',t:'date',get:x=>x.c.onbDeadline27||(x.c.entry?iso(addDays(new Date(x.c.entry+'T12:00:00'),30)):''),set:(x,v)=>{x.c.onbDeadline27=v;}},
 {k:'progress',label:'Avancement',t:'auto',w:95,render:x=>{const p=onbProgress27(x.c);return autoPill27(p.label,p.color);}},
 ...PEOPLE27,
 {k:'ldm',label:'Lettre de mission',t:'status',opts:LDM_OPTS27,get:x=>ldm27(x.c),set:(x,v)=>{x.c.ldm27=v;(x.c.ldmLog27=x.c.ldmLog27||[]).push({v,at:new Date().toISOString(),by:shared25.user?.username||''});}},
 ...ONB_STEPS27.map(([full,short],i)=>({k:'s'+i,label:short,full,t:'status',opts:ONB_OPTS27,w:120,get:x=>onbStep27(x.c,i),set:(x,v)=>{onb27(x.c).s[i]=v;}})),
];
COLS27.portfolio=PF_COLS27;COLS27.onb=ONB_COLS27;
const FISCAL_KEYS27=['regimeFiscal','tva','cloture','associe','manager','collab',...MISSIONS27.map(([k])=>'m_'+k)];
KINDS27.portfolio={label:'Portefeuille',
 group:x=>x.c.status==='À qualifier'?'À qualifier (créés par import)':isOnboarding27(x.c)?"En cours d'onboarding":['Inactif','Compromis','Autres'].includes(x.c.status)?'Inactifs, compromis et autres':'Actifs',
 afterSet:(x,k)=>{if(FISCAL_KEYS27.includes(k))regenerateAll(state,x.c.id,true);},
 rerender:['statutClient','entry',...MISSIONS27.map(([k])=>'m_'+k),'honoCourants','honoBilan','honoAgo','honoAutres','ldm','groupe']};
KINDS27.onb={label:'Onboarding',
 group:x=>{const p=onbProgress27(x.c);return p.blocked?'Bloqués':p.done===p.total?'Prêts à valider':'En cours';},
 due:x=>{const d=val27(x,'deadline');return d?{due:d,label:'Deadline onboarding'}:null;},
 afterSet:(x,k,v)=>{
  if(k==='ldm'&&v==='Oui')onb27(x.c).s[0]=onb27(x.c).s[0]||'Fait';
  const p=onbProgress27(x.c);
  if(p.done===p.total&&isOnboarding27(x.c))toast(x.c.name+' : toutes les étapes sont faites, tu peux valider l’onboarding');
 },
 rerender:['entry','deadline','ldm',...ONB_STEPS27.map((_,i)=>'s'+i)]};
const PF_GROUPS27={order:['À qualifier (créés par import)',"En cours d'onboarding",'Actifs','Inactifs, compromis et autres'],colors:{'À qualifier (créés par import)':C27.red,"En cours d'onboarding":C27.orange,'Actifs':C27.green,'Inactifs, compromis et autres':C27.grey},sortKey:x=>x.c.name.toLowerCase(),nameExtra:()=>''};
const ONB_GROUPS27={order:['Prêts à valider','Bloqués','En cours'],colors:{'Bloqués':C27.red,'En cours':C27.orange,'Prêts à valider':C27.green},
 nameExtra:x=>`<button class="btn small light" onclick="letterDialog26('${x.c.id}')" title="Préparer la lettre de mission">LDM</button>`,
 empty:'Aucun client en onboarding. Un prospect validé arrive ici automatiquement, avec ses missions et ses honoraires.'};

/* ---------- Pages ---------- */
function portfolioPage27(){
 const all=state.clients.map(c=>ctx27('portfolio',c,0)),act=state.clients.filter(c=>!isOnboarding27(c)&&!['Inactif','Compromis','Autres','À qualifier'].includes(c.status));
 const budget=act.reduce((a,c)=>a+feeTotalClient(c)-Number(fees27(c).exceptional||0),0);
 return `<div class="titleRow"><div><h1>Portefeuille clients</h1><div class="sub">Une ligne par client. Ce qui est saisi ici alimente automatiquement l’onboarding, la fiscalité, les tableaux Bilan et AGO et le contrôle des honoraires.</div></div>
  <div class="v25actions"><button class="btn small" onclick="nav('prospects');openNewProspect()">+ Nouveau prospect</button><button class="btn small secondary" onclick="routePage('creation');crNew27()">+ Nouvelle création</button>
  <label class="btn small light">Importer un Excel<input hidden type="file" accept=".xlsx" onchange="importBoard27(this.files[0]);this.value=''"></label>
  <button class="btn small secondary" onclick="exportBoard27('portfolio')">Exporter (Excel)</button></div></div>
 <div class="cards" style="grid-template-columns:repeat(4,1fr)"><div class="card"><small>Clients actifs</small><span class="big">${act.length}</span></div><div class="card"><small>En onboarding</small><span class="big warn">${state.clients.filter(isOnboarding27).length}</span></div><div class="card"><small>Honoraires annuels (actifs)</small><span class="big">${euro(budget)}</span></div><div class="card"><small>Bilans à produire</small><span class="big">${state.clients.filter(c=>c.missions?.annualAccounts&&!['Inactif','Compromis'].includes(c.status)).length}</span></div></div>
 ${filtersHtml27('<span class="sub">Clique sur un nom pour ouvrir la fiche complète.</span>')}
 ${groupsHtml27('portfolio',filterCtx27(all),0,PF_GROUPS27)}`;
}
/* Onboarding : liste des dossiers ; un clic déroule les 14 étapes (présentation d'origine du CRM). */
const ONB_ACTIONS27={
 0:c=>`<button class="btn small light" onclick="letterDialog26('${c.id}')">Préparer la LDM</button>`,
 1:c=>{const st=typeof repriseStage27==='function'?repriseStage27(c):'',r=c.reprise27||{};return `${st?`<span class="sub" title="${esc([r.preparedAt&&'Préparée le '+datefr(String(r.preparedAt).slice(0,10)),r.sentAt&&'Envoyée le '+datefr(String(r.sentAt).slice(0,10))+(r.sentBy?' par '+r.sentBy:''),r.answeredAt&&'Réponse le '+datefr(String(r.answeredAt).slice(0,10)),r.piecesAt&&'Pièces le '+datefr(String(r.piecesAt).slice(0,10))].filter(Boolean).join(' · '))}">${esc(st)}</span> `:''}${st==='Envoyée'?`<button class="btn small light" onclick="repriseStep27('${c.id}','answer')">Réponse reçue</button> `:''}${['Envoyée','Réponse reçue'].includes(st)?`<button class="btn small light" onclick="repriseStep27('${c.id}','pieces')">Pièces récupérées</button>`:`<button class="btn small light" onclick="repriseDialog27('${c.id}')">Lettre de reprise</button>`}`;},
 2:c=>`<a class="btn small light" href="${esc(c.links?.pennylane||'https://app.pennylane.com/')}" target="_blank" rel="noopener">Pennylane</a>`,
 14:c=>`<a class="btn small light" href="${esc(c.links?.pennylane||'https://app.pennylane.com/')}" target="_blank" rel="noopener">Pennylane</a>`,
 4:c=>`<button class="btn small light" onclick="routePage('clients')">Saisir les honoraires</button>`,
 5:c=>`<button class="btn small light" onclick="identityDialog26('client','${c.id}')">Compléter la fiche</button>`,
 7:()=>`<a class="btn small light" href="https://www.impots.gouv.fr/professionnel" target="_blank" rel="noopener">impots.gouv</a>`,
 11:c=>`<a class="btn small light" href="${esc(c.links?.pennylane||'https://app.pennylane.com/')}" target="_blank" rel="noopener">Pennylane</a>`,
};
/* Validation manuelle de l'onboarding : le dossier passe dans « Onboarding validé » et le client devient actif. */
function onbMissing27(c){const st=i=>onbStep27(c,i),ok=v=>v==='Fait'||v==='NA';return {blocking:ONB_BLOCKING27.filter(i=>!ok(st(i))),other:ONB_ORDER27.filter(i=>!ONB_BLOCKING27.includes(i)&&!ok(st(i)))};}
function canForce27(){return ['admin','associe'].includes(shared25.user?.role||'')||!shared25.active;}
function validateOnb27(cid){
 const c=cfind(cid);if(!c)return;const p=onbProgress27(c),m=onbMissing27(c),lbl=i=>ONB_STEPS27[i][1];
 if(m.blocking.length){
  if(!canForce27())return alert(`Onboarding non validable : prérequis bloquants non terminés (${m.blocking.map(lbl).join(', ')}).\nSeul un associé ou un administrateur peut valider par exception, avec une justification.`);
  document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal" style="width:min(560px,96vw)"><div class="modalHead"><h3>Validation exceptionnelle · ${esc(c.name)}</h3><button class="btn secondary" onclick="closeModal()">Fermer</button></div><div class="modalBody"><div class="note" style="margin-bottom:10px">Prérequis bloquants non terminés : <b>${m.blocking.map(lbl).map(esc).join(', ')}</b>.</div><div class="field"><label>Justification (obligatoire, conservée dans l’historique)</label><textarea id="onb_reason" rows="3"></textarea></div></div><div class="modalFooter" style="display:flex;justify-content:flex-end"><button class="btn" style="background:#c4320a;border-color:#c4320a" onclick="forceOnb27('${cid}')">Valider par exception</button></div></div></div>`;
  return;
 }
 if(m.other.length&&!confirm(`${m.other.length} étape(s) complémentaire(s) non terminée(s) pour ${c.name} (${m.other.map(lbl).join(', ')}). Valider l’onboarding ?`))return;
 c.status='Actif';c.onbValidated27={date:new Date().toISOString(),user:shared25.user?.username||state.currentUser||'',pending:m.other.map(lbl)};
 log25('Onboarding validé',cid,p.label);persist25();toast(c.name+' : onboarding validé, le client est actif');
}
function forceOnb27(cid){
 const c=cfind(cid),reason=document.getElementById('onb_reason')?.value.trim();if(!c)return;
 if(!canForce27())return alert('Réservé aux associés et administrateurs.');
 if(!reason||reason.length<10)return toast('Indique une justification (10 caractères minimum).');
 const m=onbMissing27(c);
 c.status='Actif';c.onbValidated27={date:new Date().toISOString(),user:shared25.user?.username||'',forced:true,reason,missing:m.blocking.map(i=>ONB_STEPS27[i][1])};
 log25('Onboarding validé par exception',cid,reason);closeModal();persist25();toast(c.name+' : validé par exception (justification conservée)');
}
/* Dossier sorti de l'onboarding : validé avec le bouton, ou passé actif avant son ajout (prospect validé, étapes renseignées). */
function onbDone27(c){return !isOnboarding27(c)&&!['Inactif','Compromis'].includes(c.status)&&Boolean(c.onbValidated27||c.prospectId||Object.keys(c.onb27?.s||{}).length);}
function reopenOnb27(cid){const c=cfind(cid);if(!c||!confirm('Rouvrir l’onboarding de '+c.name+' ?'))return;c.status='Onboarding';delete c.onbValidated27;log25('Onboarding rouvert',cid,'');persist25();}
function toggleOnb27(cid){const b=boards27();b.onbOpen=b.onbOpen||{};b.onbOpen[cid]=!b.onbOpen[cid];save();render();}
function setOnbPerson27(cid,i,v){const c=cfind(cid);if(!c)return;onb27(c).p[i]=v;save();}
function onbRow27(x){
 const c=x.c,p=onbProgress27(c),open=boards27().onbOpen?.[c.id],u=urgency27(x),dl=val27(x,'deadline');
 const steps=ONB_ORDER27.map((i,n)=>{const [full]=ONB_STEPS27[i],st=onbStep27(c,i),auto=!onb27(c).s[i]&&st!=='A faire';
  return `<tr class="${onbSel27(c.id).has(i)?'onbSel27':''}"><td class="onbChk27"><input type="checkbox" aria-label="Sélectionner l’étape ${n+1}" ${onbSel27(c.id).has(i)?'checked':''} onchange="onbPick27('${c.id}',${i},this.checked)"></td><td class="onbNum27">${n+1}</td><td>${esc(full)}${ONB_BLOCKING27.includes(i)?' <span class="badge orange" title="Prérequis bloquant">bloquant</span>':''}${auto?` <span class="sub">· ${st==='À vérifier'?'à vérifier':'automatique'}</span>`:''}${i===5&&onbParamMissing27(c).length?` <span class="sub">· manque : ${esc(onbParamMissing27(c).join(', '))}</span>`:''}</td>
   <td><input class="cell27 onbPerson27" value="${esc(onb27(c).p[i]||'')}" placeholder="${esc(people27(c,'collab').split(',')[0]||'Responsable')}" onchange="setOnbPerson27('${c.id}',${i},this.value)"></td>
   <td style="width:150px"><select class="pill27 onbPill27" style="background:${st==='À vérifier'?C27.orange:color27(st==='Fait'?'Oui':st==='Bloqué'?'Bloqué':st==='En cours'?'2.':st==='NA'?'NA':'1.')}" onchange="setCell27(this,'onb','${c.id}',0,'s${i}')">${ONB_OPTS27.map(o=>`<option ${o===st?'selected':''}>${o}</option>`).join('')}</select></td>
   <td style="width:150px;text-align:right">${ONB_ACTIONS27[i]?ONB_ACTIONS27[i](c):''}</td></tr>`;}).join('');
 return `<div class="onb27 ${open?'open':''}"><div class="onbHead27" onclick="toggleOnb27('${c.id}')">
   <span class="chev27">${open?'▾':'▸'}</span>
   <div class="onbName27"><b>${esc(c.name)}</b><span class="sub">${esc(c.legalForm||'')}${c.siren?' · '+esc(c.siren):''}</span></div>
   <div class="onbMeta27"><span class="sub">Entrée</span>${c.entry?datefr(c.entry):'—'}</div>
   <div class="onbMeta27 ${u?.level==='retard'?'late27t':u?'soon27t':''}"><span class="sub">Deadline</span>${dl?datefr(dl):'—'}</div>
   <div class="onbProg27"><div class="bar27"><i style="width:${p.done/p.total*100}%;background:${p.color}"></i></div><span>${p.label}</span>${p.blocked?'<span class="badge red">Bloqué</span>':''}</div>
   <div class="onbMeta27"><span class="sub">Équipe</span>${esc(people27(c,'manager')||'—')}${people27(c,'collab')?' / '+esc(people27(c,'collab')):''}</div>
   <div class="onbMeta27"><span class="sub">LDM</span>${esc(ldm27(c))}</div>
   ${onbDone27(c)?`<div class="onbAct27"><span class="badge green">${c.onbValidated27?(c.onbValidated27.forced?'Validé par exception le ':'Validé le ')+new Date(c.onbValidated27.date).toLocaleDateString('fr-FR'):'Validé'}</span><button class="btn small secondary" onclick="event.stopPropagation();reopenOnb27('${c.id}')">Rouvrir</button></div>`:`<div class="onbAct27"><button class="btn small ${p.done===p.total?'green':'secondary'}" onclick="event.stopPropagation();validateOnb27('${c.id}')">Valider l’onboarding</button></div>`}
  </div>
  ${open?`<div class="onbBody27"><div class="v25actions" style="margin-bottom:8px"><button class="btn small secondary" onclick="openClient('${c.id}')">Fiche client</button><label class="sub">Date d’entrée <input class="mini" type="date" value="${esc(c.entry||'')}" onchange="setCell27(this,'onb','${c.id}',0,'entry')"></label><label class="sub">Deadline <input class="mini" type="date" value="${esc(dl||'')}" onchange="setCell27(this,'onb','${c.id}',0,'deadline')"></label><label class="sub">Lettre de mission <select class="mini" onchange="setCell27(this,'onb','${c.id}',0,'ldm')">${LDM_OPTS27.map(o=>`<option ${o===ldm27(c)?'selected':''}>${o}</option>`).join('')}</select></label></div>
   ${onbBulkBar27(c)}<table class="onbSteps27"><thead><tr><th class="onbChk27"><input type="checkbox" aria-label="Tout sélectionner" ${onbSel27(c.id).size===ONB_ORDER27.length?'checked':''} onchange="onbPickAll27('${c.id}',this.checked)"></th><th>#</th><th>Étape</th><th>Responsable</th><th>Statut</th><th></th></tr></thead><tbody>${steps}</tbody></table></div>`:''}</div>`;
}
/* Sélection de plusieurs étapes pour changer leur statut d'un coup (sélection propre à l'écran, non enregistrée). */
const ONB_SEL27={};
function onbSel27(cid){return ONB_SEL27[cid]||(ONB_SEL27[cid]=new Set());}
function onbPick27(cid,i,on){const s=onbSel27(cid);on?s.add(i):s.delete(i);render();}
function onbPickAll27(cid,on){const s=onbSel27(cid);s.clear();if(on)ONB_ORDER27.forEach(i=>s.add(i));render();}
function onbBulkBar27(c){const n=onbSel27(c.id).size;if(!n)return '';return `<div class="onbBulk27"><b>${n} étape(s) sélectionnée(s)</b><span>Passer en</span><select id="onbBulk27_${c.id}">${ONB_OPTS27.map(o=>`<option>${esc(o)}</option>`).join('')}</select><button class="btn small" onclick="onbBulkApply27('${c.id}')">Appliquer</button><button class="btn small secondary" onclick="onbPickAll27('${c.id}',false)">Annuler la sélection</button></div>`;}
function onbBulkApply27(cid){
 const c=cfind(cid),sel=[...onbSel27(cid)],v=document.getElementById('onbBulk27_'+cid)?.value;if(!c||!sel.length||!v)return;
 const x=ctx27('onb',c,0);sel.forEach(i=>{COLS27.onb.find(z=>z.k==='s'+i)?.set(x,v);KINDS27.onb?.afterSet?.(x,'s'+i,v);});
 log25('Onboarding · statut de '+sel.length+' étape(s)',cid,v);onbSel27(cid).clear();save();render();toast(sel.length+' étape(s) passée(s) en « '+v+' »');
}
function onboardingPage27(){
 const list=filterCtx27(state.clients.filter(isOnboarding27).map(c=>ctx27('onb',c,0)));
 const done=filterCtx27(state.clients.filter(onbDone27).map(c=>ctx27('onb',c,0))).sort((a,b)=>(b.c.onbValidated27?.date||b.c.entry||'').localeCompare(a.c.onbValidated27?.date||a.c.entry||''));
 const showDone=boards27().collapsed['onb|validated']!==true;
 const groups={};list.forEach(x=>{const g=group27(x);(groups[g]=groups[g]||[]).push(x);});
 const sortKey=x=>(val27(x,'deadline')||'9999')+x.c.name.toLowerCase();
 return `<div class="titleRow"><div><h1>Onboarding</h1><div class="sub">Clique sur un dossier pour dérouler ses étapes. Certaines se cochent seules ; c’est toi qui valides l’onboarding, le dossier passe alors dans « Onboarding validé ».</div></div>
  <div class="v25actions"><button class="btn small" onclick="nav('prospects');openNewProspect()">+ Nouveau prospect</button><button class="btn small secondary" onclick="routePage('creation');crNew27()">+ Nouvelle création</button><button class="btn small secondary" onclick="cabinetDialog26()">Modèle de lettre de mission</button></div></div>
 <div class="cards" style="grid-template-columns:repeat(3,1fr)"><div class="card"><small>Clients en onboarding</small><span class="big">${list.length}</span></div><div class="card"><small>Bloqués</small><span class="big ${list.some(x=>onbProgress27(x.c).blocked)?'bad':'good'}">${list.filter(x=>onbProgress27(x.c).blocked).length}</span></div><div class="card"><small>Deadline dépassée</small><span class="big ${list.some(x=>urgency27(x)?.level==='retard')?'bad':'good'}">${list.filter(x=>urgency27(x)?.level==='retard').length}</span></div></div>
 ${filtersHtml27()}
 <h2 class="sec27">Onboarding en cours <span class="sub">${list.length} dossier(s)</span></h2>
 ${ONB_GROUPS27.order.filter(g=>groups[g]).map(g=>`<div class="grp27" style="color:${ONB_GROUPS27.colors[g]}">${esc(g)} <span class="sub">${groups[g].length} dossier(s)</span></div>${groups[g].sort((a,b)=>sortKey(a).localeCompare(sortKey(b))).map(onbRow27).join('')}`).join('')||`<div class="panel panelBody">${ONB_GROUPS27.empty}</div>`}
 <h2 class="sec27" style="cursor:pointer" onclick="toggleGroup27('onb','validated')">${showDone?'▾':'▸'} Onboarding validé — dossiers actifs <span class="sub">${done.length} dossier(s)</span></h2>
 ${showDone?done.map(onbRow27).join('')||'<div class="panel panelBody sub">Aucun onboarding validé pour l’instant.</div>':''}`;
}
clientsV11=portfolioPage27;
onboardingV15=onboardingPage27;

/* ---------- Tâches générées par l'ancienne maquette : remplacées par les tableaux ---------- */
// Les échéances fiscales sont désormais calculées à la volée par l'onglet Fiscalité (régimes du tableau principal) :
// plus aucune tâche n'est stockée, ce qui garde la base légère.
regenerateAll=function(s,cid,first=false){
 const c=s.clients.find(x=>x.id===cid);if(!c)return;
 if(!c.missions)c.missions={};
 if(!first)save();
};

/* ---------- Import du portefeuille Excel (avec les sous-éléments d'onboarding) ---------- */
const PF_HEAD27={'date entree':'entry','associe':'associe','manager':'manager','collaborateurs':'collab','siren':'siren','deadline onboarding':'deadline','onboarding statut':'onbStatut','forme juridique':'forme','actif/inactif':'actif','groupe':'groupe','ldm signee':'ldm','regime fiscal':'regimeFiscal','cloture':'cloture','regime tva':'tva','fiscalite fr':'m_tax','bilan fr':'m_annualAccounts','ago':'m_legal','paie':'m_payroll','irpp':'m_irpp','reporting':'m_reporting','mission ponctuelle fr':'m_ponctuelle','facturation electronique':'m_einvoice','honoraires courants':'honoCourants','honoraires ago':'honoAgo','honoraires annuels':'honoBilan','contact':'contact','typologie':'typologie','besoins':'besoins'};
function importPortfolio27(rows,hi){
 const seen={},keys=rows[hi].map(h=>{const n=normHead27(h);seen[n]=(seen[n]||0)+1;return seen[n]>1?null:PF_HEAD27[n]||null;});
 const items=[];let group='',cur=null;
 for(const r of rows.slice(hi+1)){
  const a=r[0]==null?'':String(r[0]).trim();
  if(!a&&r[1]&&cur){if(normHead27(r[1])!=='name')cur.steps.push({name:String(r[1]),person:r[2]||'',status:r[3]||''});continue;}
  if(!a||normHead27(a)==='subitems'||normHead27(a)==='name')continue;
  if(r.slice(1).every(v=>v==null||v==='')){group=a;continue;}
  cur={row:r,group,steps:[]};items.push(cur);
 }
 if(!confirm(`Importer ${items.length} client(s) dans le portefeuille ?\nLes clients sont rapprochés par SIREN puis par nom ; les absents sont créés. Les étapes d’onboarding du fichier sont reprises.`))return;
 let created=0,updated=0;
 const date=v=>typeof v==='number'?new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10):String(v||'').slice(0,10);
 for(const it of items){
  const v={};keys.forEach((k,i)=>{if(k&&it.row[i]!=null&&it.row[i]!=='')v[k]=it.row[i];});
  const name=String(it.row[0]).trim(),siren=String(v.siren||'').replace(/\D/g,'').slice(0,9);
  const m=matchClient27(name,v.siren);if(m.skip)continue;
  let c=m.c;
  if(!c){c=importNewClient27(name,m.siren,{legalForm:v.forme,contact:v.contact});created++;}else updated++;
  if(!c.missions)c.missions={};
  const x=ctx27('portfolio',c,0),set=(k,val)=>{const col=PF_COLS27.find(z=>z.k===k);if(col&&col.set)col.set(x,val);};
  if(v.entry)c.entry=date(v.entry);
  ['associe','manager','collab'].forEach(k=>{if(v[k])set(k,uniqNames27(v[k]));});
  if(m.siren&&!sirenOf27(c.siren))c.siren=m.siren;
  if(v.forme)c.legalForm=String(v.forme);
  if(v.groupe)c.group27=String(v.groupe);
  if(v.typologie)c.typologie27=String(v.typologie);
  if(v.cloture)set('cloture',String(v.cloture).match(/^\d{1,2}\/\d{1,2}/)?.[0]||'');
  if(v.regimeFiscal)set('regimeFiscal',String(v.regimeFiscal));
  if(v.tva)set('tva',String(v.tva));
  if(v.ldm)c.ldm27=String(v.ldm);
  if(v.contact)c.contact={...(c.contact||{}),name:String(v.contact)};
  if(v.besoins){const b=String(v.besoins);[['AGO','legal'],['Bilan FR','annualAccounts'],['Fiscalité FR','tax'],['IRPP','irpp'],['Paie','payroll']].forEach(([t,k])=>{if(b.includes(t))c.missions[k]=true;});}
  MISSIONS27.forEach(([k])=>{if(v['m_'+k]!=null)c.missions[k]=String(v['m_'+k])==='Oui';});
  ['honoCourants','honoBilan','honoAgo'].forEach(k=>{if(v[k]!=null)set(k,Number(v[k])||0);});
  if(c.missions.accounting==null&&Number(v.honoCourants)>0)c.missions.accounting=true;
  const onbGroup=/onboarding/i.test(it.group)||String(v.onbStatut||'')==='En cours';
  // Statut repris seulement s'il est explicite dans le fichier (colonne ou groupe) ; sinon inchangé (« À qualifier » pour un nouveau client).
  const actif=String(v.actif||'');c.status=onbGroup?'Onboarding':actif==='Inactif'||/inactif/i.test(it.group||'')?'Inactif':/^actif/i.test(actif)||/^actifs?$/i.test(String(it.group||'').trim())?'Actif':c.status;
  if(v.deadline)c.onbDeadline27=date(v.deadline);
  for(const s of it.steps){
   const i=ONB_STEPS27.findIndex(([full])=>normHead27(full).slice(0,22)===normHead27(s.name).slice(0,22));
   if(i<0)continue;const o=onb27(c);
   if(ONB_OPTS27.includes(s.status))o.s[i]=s.status;
   if(s.person)o.p[i]=String(s.person);
  }
  regenerateAll(state,c.id,true);
 }
 init25();log25('Import Excel Portefeuille clients','',`${created} client(s) créé(s), ${updated} mis à jour`);
 state.page='clients';persist25();toast(`${items.length} client(s) importé(s) : ${created} créé(s), ${updated} mis à jour`);
}

/* ---------- Prospects : tout se déverse automatiquement dans la fiche client ---------- */
function prospectFees27(p){if(!p.fees27)p.fees27={accounting:0,annualAccounts:0,legalAnnual:0,other:0};if(!p.missions27)p.missions27={};return p.fees27;}
function saveProspectSilent27(id){
 const p=pfind(id),g=k=>document.getElementById(k);if(!p||!g('p_name'))return;
 p.name=g('p_name').value;p.contact=g('p_contact').value;p.email=g('p_email').value;p.owner=g('p_owner').value;p.appointment=g('p_appt').value;p.notes=g('p_notes').value;p.next=g('p_next').value;
 const f=prospectFees27(p);
 if(g('p27_f_accounting')){
  ['accounting','annualAccounts','legalAnnual','other'].forEach(k=>{f[k]=Number(g('p27_f_'+k).value||0);});
  MISSIONS27.forEach(([k])=>{p.missions27[k]=g('p27_m_'+k).checked;});
 }
 const sum=f.accounting+f.annualAccounts+f.legalAnnual+f.other;
 p.value=sum>0?sum:Number(g('p_value').value||0);
 if(sum>0)g('p_value').value=sum;
 save();
}
const previousOpenProspect27=openProspect;
openProspect=function(id){
 previousOpenProspect27(id);
 const p=pfind(id),body=document.querySelector('.modalBody');if(!p||!body||!document.getElementById('p_value'))return;
 const f=prospectFees27(p),box=document.createElement('div');box.className='panel panelBody';box.style.marginTop='14px';
 box.innerHTML=`<h3>Missions et honoraires proposés</h3><div class="sub" style="margin-bottom:10px">Repris automatiquement sur la fiche client à la validation : portefeuille, onboarding, fiscalité, Bilan, AGO et contrôle des honoraires.</div>
  <div class="checks">${MISSIONS27.map(([k,l])=>`<label class="check"><input type="checkbox" id="p27_m_${k}" ${p.missions27[k]?'checked':''}> ${esc(l)}</label>`).join('')}</div>
  <div class="formGrid" style="margin-top:10px">${[['accounting','Honoraires courants (an)'],['annualAccounts','Honoraires bilan'],['legalAnnual','Honoraires AGO'],['other','Autres honoraires']].map(([k,l])=>`<div class="field"><label for="p27_f_${k}">${l}</label><input id="p27_f_${k}" type="number" min="0" step="any" value="${f[k]||''}"></div>`).join('')}</div>
  <div class="sub">La « valeur annuelle estimée » est calculée à partir de ces montants. Tout est enregistré au fil de la saisie.</div>`;
 body.append(box);
 // Si seule la valeur globale a été saisie, elle est proposée en honoraires courants.
 if(!f.accounting&&!f.annualAccounts&&!f.legalAnnual&&!f.other&&p.value)document.getElementById('p27_f_accounting').value=p.value;
 body.querySelectorAll('input,select,textarea').forEach(el=>el.addEventListener('change',()=>saveProspectSilent27(id)));
};
const previousAdvance27=advanceProspect,previousReject27=rejectProspect,previousValidate27=validateProspect;
advanceProspect=function(id,st){saveProspectSilent27(id);return previousAdvance27(id,st);};
rejectProspect=function(id){saveProspectSilent27(id);return previousReject27(id);};
validateProspect=function(id){
 saveProspectSilent27(id);
 const p=pfind(id);previousValidate27(id);
 const c=state.clients.find(x=>x.prospectId===id);if(!p||!c)return;
 const f=prospectFees27(p),m=p.missions27||{};
 c.missions={...(c.missions||{})};MISSIONS27.forEach(([k])=>{if(m[k])c.missions[k]=true;});
 Object.assign(fees27(c),{accounting:f.accounting||(!f.annualAccounts&&!f.legalAnnual&&!f.other?Number(p.value||0):0),annualAccounts:f.annualAccounts,legalAnnual:f.legalAnnual,other:f.other});syncFees27(c);
 if(c.missions.accounting==null&&fees27(c).accounting>0)c.missions.accounting=true;
 if(p.owner){c.manager=p.owner;(c.people27=c.people27||{}).manager=c.people27.manager||p.owner;}
 if(p.identity26?.capital)c.identity26={...(c.identity26||{}),capital:p.identity26.capital};
 c.entry=c.entry||today27();c.status='Onboarding';
 regenerateAll(state,c.id,true);
 log25('Missions et honoraires repris du prospect',c.id,euro(c.annualFees));
 state.page='onboarding';persist25();
 toast(`${c.name} est en onboarding : missions et honoraires (${euro(c.annualFees)}) repris automatiquement`);
};

/* ---------- Capital social : Pappers (si une clé est configurée sur le serveur) ---------- */
const previousMapCompany27=mapCompany26;
mapCompany26=function(result,siren){
 const data=previousMapCompany27(result,siren),r=result?.results?.find(x=>x.siren===siren);
 if(r?.capital_pappers!=null)data.capital=String(r.capital_pappers);
 if(r?.capital_pappers!=null)data.source='Annuaire des entreprises + Pappers';
 return data;
};
const previousLookup27=lookup26;
lookup26=async function(){
 await previousLookup27();
 const v=identityDraft26?.values?.capital,el=document.getElementById('id26_capital'),st=document.getElementById('lookup_status26');
 if(v&&el&&!el.value)el.value=v;
 if(st&&el&&!el.value&&!/Capital/.test(st.textContent))st.textContent+=' Capital social non fourni par l’annuaire public : saisis-le, ou active Pappers (Automatisations cabinet).';
};

/* ---------- Navigation simplifiée ---------- */
const REMOVED_PAGES27=['dashboard','inbox','control','notifications'];
(function(){
 const nav=document.querySelector('.nav');if(!nav)return;
 REMOVED_PAGES27.forEach(p=>nav.querySelectorAll(`a[data-page="${p}"]`).forEach(a=>a.remove()));
 const onb=nav.querySelector('a[data-page="onboarding"]'),cl=nav.querySelector('a[data-page="clients"]');
 if(onb&&cl)cl.before(onb);
 document.querySelectorAll('.iconBtn[title="Notifications"]').forEach(b=>b.remove());
})();
const previousRenderPortfolio27=render;
render=function(){
 if(REMOVED_PAGES27.includes(state.page))state.page='cabinetdash';
 // Statuts posés par la version de test des prospects (retirée) : ramenés aux étapes de cet écran.
 const back={'À contacter':'Nouveau','RDV':'RDV réalisé','Gagné':'Validé','Perdu':'Refusé'};(state.prospects||[]).forEach(p=>{if(back[p.stage])p.stage=back[p.stage];});
 previousRenderPortfolio27();
 if(['clients','onboarding','fiscal'].includes(state.page)){const root=document.getElementById('root');[...root.children].forEach(el=>{if(el.classList.contains('note')&&el.textContent.startsWith('Module historique'))el.remove();});}
};
