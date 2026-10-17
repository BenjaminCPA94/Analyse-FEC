/* RB Partners V27 — Portefeuille clients et Onboarding sur le modèle des tableaux Excel du cabinet,
 * prospects reliés automatiquement au reste du CRM, navigation simplifiée.
 * Une donnée se saisit une seule fois sur la fiche client (personnes, régimes, clôture, missions, honoraires)
 * et se retrouve partout : Portefeuille, Onboarding, Fiscalité, Bilan, AGO, Contrôle des honoraires. */

/* ---------- Missions et onboarding ---------- */
const MISSIONS27=[['accounting','Tenue comptable'],['tax','Fiscalité FR'],['annualAccounts','Bilan FR'],['legal','AGO'],['payroll','Paie'],['irpp','IRPP'],['reporting','Reporting'],['ponctuelle','Mission ponctuelle'],['einvoice','Facturation électronique']];
const ONB_STEPS27=[
 ['Envoyer la LDM comptabilité','LDM comptabilité'],
 ['Envoyer la lettre de reprise, le cas échéant','Lettre de reprise'],
 ['Création de la fiche client et abonnement dans Pennylane','Fiche + abonnement Pennylane'],
 ['Mettre en place le prélèvement automatique','Prélèvement automatique'],
 ['Renseigner le montant des honoraires + temps prévu','Honoraires + temps prévu'],
 ['Renseigner tous les tableaux du CRM','Tableaux CRM renseignés'],
 ['Création du dossier sur Sharepoint','Dossier SharePoint'],
 ['Activation du compte impôt.gouv','Compte impots.gouv'],
 ['Envoyer le mandat bancaire aux impôts','Mandat bancaire impôts'],
 ['Envoyer Mandat Sobank','Mandat Sobank'],
 ['Questionnaire LAB + Documents bénéficiaires effectifs & Dirigeants','LAB + bénéficiaires'],
 ['Présentation environnement Pennylane','Présentation Pennylane'],
 ['Compléter le dossier permanent','Dossier permanent'],
 ['Catégoriser le client','Catégoriser le client'],
];
const ONB_OPTS27=['A faire','En cours','Fait','Bloqué','NA'];
function onb27(c){if(!c.onb27)c.onb27={s:{},p:{}};return c.onb27;}
function ldm27(c){return c.ldm27||(c.lm26?.validated?'Oui':c.lm26?.generated?'En cours':'Non');}
/* Étapes cochées automatiquement à partir des données déjà saisies (une valeur saisie à la main reste prioritaire). */
function onbAuto27(c,i){
 if(i===0)return ldm27(c)==='Oui'?'Fait':ldm27(c)==='En cours'?'En cours':'A faire';
 if(i===2)return c.pl27?.customerId?'Fait':'A faire';
 if(i===4)return feeTotalClient(c)>0?'Fait':'A faire';
 if(i===5)return c.siren&&c.closing&&['IS','IR'].includes(c.taxRegime)&&MISSIONS27.some(([k])=>c.missions?.[k])?'Fait':'A faire';
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
 {k:'onbAuto',label:'Onboarding',t:'auto',w:100,render:x=>{const p=onbProgress27(x.c);return isOnboarding27(x.c)||p.done<p.total?`<a href="#" onclick="event.preventDefault();routePage('onboarding')">${autoPill27(p.label,p.color)}</a>`:autoPill27('Terminé',C27.green);}},
 ...PEOPLE27,
 clientCol27('siren','SIREN','text',c=>c.siren||'',(c,v)=>{c.siren=String(v).replace(/\s/g,'').slice(0,9);},null,100),
 clientCol27('forme','Forme juridique','text',c=>c.legalForm||'',(c,v)=>{c.legalForm=v;},null,90),
 {...STATUT_COL27,label:'Statut'},
 GROUPE27,
 {...CLOTURE27},
 clientCol27('regimeFiscal','Régime fiscal','status',c=>['IS','IR'].includes(c.taxRegime)?c.taxRegime:'A définir',(c,v)=>{c.taxRegime=v==='A définir'?'À confirmer':v;},['IS','IR','A définir']),
 clientCol27('tva','Régime TVA','status',c=>TVA27.includes(c.vatRegime)?c.vatRegime:'',(c,v)=>{c.vatRegime=v;},TVA27),
 ...MISSIONS27.map(missionCol27),
 {k:'ldm',label:'LDM signée',t:'status',opts:['Oui','En cours','Non'],get:x=>ldm27(x.c),set:(x,v)=>{x.c.ldm27=v;}},
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
 {k:'ldm',label:'LDM signée',t:'status',opts:['Oui','En cours','Non'],get:x=>ldm27(x.c),set:(x,v)=>{x.c.ldm27=v;}},
 ...ONB_STEPS27.map(([full,short],i)=>({k:'s'+i,label:short,full,t:'status',opts:ONB_OPTS27,w:120,get:x=>onbStep27(x.c,i),set:(x,v)=>{onb27(x.c).s[i]=v;}})),
];
COLS27.portfolio=PF_COLS27;COLS27.onb=ONB_COLS27;
const FISCAL_KEYS27=['regimeFiscal','tva','cloture','associe','manager','collab',...MISSIONS27.map(([k])=>'m_'+k)];
KINDS27.portfolio={label:'Portefeuille',
 group:x=>isOnboarding27(x.c)?"En cours d'onboarding":['Inactif','Compromis','Autres'].includes(x.c.status)?'Inactifs, compromis et autres':'Actifs',
 afterSet:(x,k)=>{if(FISCAL_KEYS27.includes(k))regenerateAll(state,x.c.id,true);},
 rerender:['statutClient','entry',...MISSIONS27.map(([k])=>'m_'+k),'honoCourants','honoBilan','honoAgo','honoAutres','ldm','groupe']};
KINDS27.onb={label:'Onboarding',
 group:x=>{const p=onbProgress27(x.c);return p.blocked?'Bloqués':p.done===p.total?'Prêts à passer en actif':'En cours';},
 due:x=>{const d=val27(x,'deadline');return d?{due:d,label:'Deadline onboarding'}:null;},
 afterSet:(x,k,v)=>{
  if(k==='ldm'&&v==='Oui')onb27(x.c).s[0]=onb27(x.c).s[0]||'Fait';
  const p=onbProgress27(x.c);
  if(p.done===p.total&&isOnboarding27(x.c)){x.c.status='Actif';toast(x.c.name+' : onboarding terminé, le client passe en portefeuille actif');log25('Onboarding terminé',x.c.id,'Client actif');}
 },
 rerender:['entry','deadline','ldm',...ONB_STEPS27.map((_,i)=>'s'+i)]};
const PF_GROUPS27={order:["En cours d'onboarding",'Actifs','Inactifs, compromis et autres'],colors:{"En cours d'onboarding":C27.orange,'Actifs':C27.green,'Inactifs, compromis et autres':C27.grey},sortKey:x=>x.c.name.toLowerCase(),nameExtra:()=>''};
const ONB_GROUPS27={order:['Bloqués','En cours','Prêts à passer en actif'],colors:{'Bloqués':C27.red,'En cours':C27.orange,'Prêts à passer en actif':C27.green},
 nameExtra:x=>`<button class="btn small light" onclick="letterDialog26('${x.c.id}')" title="Préparer la lettre de mission">LDM</button>`,
 empty:'Aucun client en onboarding. Un prospect validé arrive ici automatiquement, avec ses missions et ses honoraires.'};

/* ---------- Pages ---------- */
function portfolioPage27(){
 const all=state.clients.map(c=>ctx27('portfolio',c,0)),act=state.clients.filter(c=>!isOnboarding27(c)&&!['Inactif','Compromis','Autres'].includes(c.status));
 const budget=act.reduce((a,c)=>a+feeTotalClient(c)-Number(fees27(c).exceptional||0),0);
 return `<div class="titleRow"><div><h1>Portefeuille clients</h1><div class="sub">Une ligne par client. Ce qui est saisi ici alimente automatiquement l’onboarding, la fiscalité, les tableaux Bilan et AGO et le contrôle des honoraires.</div></div>
  <div class="v25actions"><button class="btn small" onclick="identityDialog26('client')">+ Client par SIREN</button>
  <label class="btn small light">Importer un Excel<input hidden type="file" accept=".xlsx" onchange="importBoard27(this.files[0]);this.value=''"></label>
  <button class="btn small secondary" onclick="exportBoard27('portfolio')">Exporter (Excel)</button></div></div>
 <div class="cards" style="grid-template-columns:repeat(4,1fr)"><div class="card"><small>Clients actifs</small><span class="big">${act.length}</span></div><div class="card"><small>En onboarding</small><span class="big warn">${state.clients.filter(isOnboarding27).length}</span></div><div class="card"><small>Honoraires annuels (actifs)</small><span class="big">${euro(budget)}</span></div><div class="card"><small>Bilans à produire</small><span class="big">${state.clients.filter(c=>c.missions?.annualAccounts&&!['Inactif','Compromis'].includes(c.status)).length}</span></div></div>
 ${filtersHtml27('<span class="sub">Clique sur un nom pour ouvrir la fiche complète.</span>')}
 ${groupsHtml27('portfolio',filterCtx27(all),0,PF_GROUPS27)}`;
}
function onboardingPage27(){
 const list=state.clients.filter(isOnboarding27).map(c=>ctx27('onb',c,0));
 return `<div class="titleRow"><div><h1>Onboarding</h1><div class="sub">Les 14 étapes d’entrée d’un client. Certaines se cochent seules (LDM validée, client trouvé dans Pennylane, honoraires saisis, fiche complète, client catégorisé). Le client passe en portefeuille actif dès que tout est fait.</div></div>
  <div class="v25actions"><button class="btn small" onclick="identityDialog26('client')">+ Client par SIREN</button><button class="btn small secondary" onclick="cabinetDialog26()">Modèle de lettre de mission</button></div></div>
 <div class="cards" style="grid-template-columns:repeat(3,1fr)"><div class="card"><small>Clients en onboarding</small><span class="big">${list.length}</span></div><div class="card"><small>Bloqués</small><span class="big ${list.some(x=>onbProgress27(x.c).blocked)?'bad':'good'}">${list.filter(x=>onbProgress27(x.c).blocked).length}</span></div><div class="card"><small>Deadline dépassée</small><span class="big ${list.some(x=>urgency27(x)?.level==='retard')?'bad':'good'}">${list.filter(x=>urgency27(x)?.level==='retard').length}</span></div></div>
 ${filtersHtml27()}
 ${groupsHtml27('onb',filterCtx27(list),0,ONB_GROUPS27)}`;
}
clientsV11=portfolioPage27;
onboardingV15=onboardingPage27;

/* ---------- Fiscalité : échéances recalculées depuis la fiche, pour l'exercice en cours ---------- */
// Les tâches de bilan, de juridique et d'onboarding sont désormais portées par les tableaux ;
// seules les échéances fiscales restent générées, pour l'année en cours, afin de garder la base légère.
regenerateAll=function(s,cid,first=false){
 const c=s.clients.find(x=>x.id===cid);if(!c)return;
 if(!c.missions)c.missions={};
 const y=new Date().getFullYear();
 s.fiscal=s.fiscal.filter(x=>!(x.client===cid&&x.year===y)).concat(preserve(s.fiscal.filter(x=>x.client===cid&&x.year===y),genFiscal(c,y)));
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
  let c=(siren.length===9&&state.clients.find(x=>x.siren===siren))||state.clients.find(x=>norm27(x.name)===norm27(name));
  if(!c){c=newClient26({name,siren:siren.length===9?siren:'',legalForm:v.forme||'',contact:v.contact||'',email:''});state.clients.push(c);created++;}else updated++;
  if(!c.missions)c.missions={};
  const x=ctx27('portfolio',c,0),set=(k,val)=>{const col=PF_COLS27.find(z=>z.k===k);if(col&&col.set)col.set(x,val);};
  if(v.entry)c.entry=date(v.entry);
  ['associe','manager','collab'].forEach(k=>{if(v[k])set(k,uniqNames27(v[k]));});
  if(siren.length===9)c.siren=siren;
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
  c.status=onbGroup?'Onboarding':String(v.actif||'')==='Inactif'?'Inactif':/inactif/i.test(it.group)?'Inactif':'Actif';
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
 previousRenderPortfolio27();
 if(['clients','onboarding'].includes(state.page)){const root=document.getElementById('root');[...root.children].forEach(el=>{if(el.classList.contains('note')&&el.textContent.startsWith('Module historique'))el.remove();});}
};
