/* RB Partners V27 — Fiscalité Fr : « Tableau principal » des régimes par client, puis une vue par mois et une vue annuelle.
 * Les échéances de chaque mois sont déduites automatiquement des régimes (TVA, DEB/DES, taxe sur les salaires,
 * acomptes d'IS, CFE, CVAE, TVS, IFU, taxe foncière, CRL) : rien n'est à recréer d'une année sur l'autre. */
/* Statuts distincts selon la nature de l'obligation : une déclaration n'est terminée qu'une fois déposée,
 * un paiement qu'une fois payé. « Validée » ou « Envoyée » ne valent pas dépôt. */
const FISC_DECL_ST27=['À faire','En préparation','En attente client','En revue','Validée – à déposer','Déposée','Accusé de réception','Bloqué','N.A'];
const FISC_PAY_ST27=['À faire','En préparation','En attente client','Montant validé – à payer','Payée','Bloqué','N.A'];
const FISC_PAY_TYPES27=['IS','CFE','CVAE','TF'];
const FISC_ST27=FISC_DECL_ST27;
const FISC_NA27=/^(N\.A|NA|N\/A|Pas obligatoire|Pas de CFE|Neant|Néant|Fait en interne)$/;
const FISC_DONE_DECL27=/^(Déposée|Accusé de réception|Déclarée|Declarée|Télédéclaré|Télédéclarée|Payée)$/;
const FISC_DONE_PAY27=/^(Payée)$/;
/* Anciens statuts ambigus (repris des imports ou de la version précédente) : jamais comptés comme déposés. */
const FISC_CHECK27=/^(Validé|Validée|Envoyée|Envoyé|Fait|Validation client)$/;
function fiscOpts27(o){return FISC_PAY_TYPES27.includes(o.type)?FISC_PAY_ST27:FISC_DECL_ST27;}
function fiscDone27(o,st){st=String(st||'');return FISC_NA27.test(st)||(FISC_PAY_TYPES27.includes(o.type)?FISC_DONE_PAY27:FISC_DONE_DECL27).test(st);}
function fiscCheck27(o,st){st=String(st||'');return !fiscDone27(o,st)&&(FISC_CHECK27.test(st)||(FISC_PAY_TYPES27.includes(o.type)&&/^(Déclarée|Declarée|Télédéclaré)$/.test(st)));}
// Compatibilité : test « terminé » sans connaître l'obligation (déclaration).
const FISC_DONE27={test:st=>fiscDone27({type:'TVA'},st)};
const MONTHS27=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
function fisc27(c){if(!c.fisc27)c.fisc27={};return c.fisc27;}
const pad27=n=>String(n).padStart(2,'0');
function dueDay27(y,m,d){return `${y}-${pad27(m)}-${pad27(Math.min(Number(d)||15,new Date(y,m,0).getDate()))}`;}
const isYes27=v=>/^Oui/.test(String(v||''));

/* Obligations fiscales d'un client pour une année, déduites de ses régimes. */
function obligations27(c,y){
 const f=fisc27(c),out=[],add=(key,label,m,day,type,def)=>out.push({key,label,m,due:dueDay27(y,m,day),type,def:def||'À faire'});
 const tvaDay=f.tvaDay??c.vatDeadline??24;
 if(c.vatRegime==='Mensuelle')for(let m=1;m<=12;m++)add('TVA-'+pad27(m),'TVA '+pad27(m),m,tvaDay,'TVA');
 if(c.vatRegime==='Trimestrielle')[1,4,7,10].forEach(m=>add('TVA-'+pad27(m),'TVA '+pad27(m),m,tvaDay,'TVA'));
 if(c.vatRegime==='Annuelle'){add('CA12','Solde CA12',5,5,'TVA');add('TVA-S1','Acompte TVA S1',7,15,'TVA');add('TVA-S2','Acompte TVA S2',12,15,'TVA');}
 if(f.debdes==='Mensuelle')for(let m=1;m<=12;m++)add('DEB-'+pad27(m),'DES/DEB '+pad27(m),m,f.debDay??10,'DEB');
 const tsDay=f.tsDay??15;
 if(f.ts==='Mensuelle')for(let m=1;m<=12;m++)add('TS-'+pad27(m),'Taxe/Salaire '+pad27(m),m,tsDay,'TS');
 if(f.ts==='Trimestriel')[1,4,7,10].forEach(m=>add('TS-'+pad27(m),'Taxe/Salaire '+pad27(m),m,tsDay,'TS'));
 if(f.ts==='Annuelle')add('TS-01','Taxe/Salaire 01',1,tsDay,'TS');
 if(f.acIS==='Oui')[[3,1],[6,2],[9,3],[12,4]].forEach(([m,t])=>add('IS-T'+t,'IS T'+t,m,f.isDay??15,'IS'));
 if(f.cfe==='Oui avec acompte')add('CFE-AC','Acompte CFE',6,f.cfeDay??15,'CFE');
 if(isYes27(f.cfe))add('CFE','CFE annuelle',12,f.cfeDay??15,'CFE');
 if(f.cvae==='Oui'){add('CVAE-AC1','Acompte CVAE 1',6,15,'CVAE');add('CVAE-AC2','Acompte CVAE 2',9,15,'CVAE');}
 if(f.tvs==='Oui')add('TVS','TVS annuelle',1,f.tvsDay??tvaDay,'TVS');
 if(f.ifu==='Oui')add('IFU','IFU annuelle',2,15,'IFU');
 if(f.tf&&!['Non','A définir'].includes(f.tf))add('TF','Taxe foncière',10,15,'TF',f.tf==='Payée'?'Payée':f.tf==='En interne'?'Fait en interne':f.tf==='Validé'?'Validé':'À faire');
 if(f.crl==='Oui')add('CRL','CRL',5,15,'CRL');
 return out;
}
function fiscClients27(){return state.clients.filter(c=>c.missions?.tax||c.fisc27);}
function fiscView27(){const b=boards27();if(b.fiscView==null)b.fiscView='main';if(!b.fiscYear)b.fiscYear=new Date().getFullYear();return b;}
function inView27(o,view){return view==='year'?!['TVA','DEB','TS'].includes(o.type)||o.key==='CA12'||o.key.startsWith('TVA-S'):o.m===Number(view);}

/* ---------- Tableau principal : les régimes ---------- */
const fiscCol27=(k,label,opts,w)=>({k:'f_'+k,label,t:opts?'status':'num',nosum:!opts&&k!=='cfeN1',opts,w,get:x=>fisc27(x.c)[k]??(opts?'A définir':''),set:(x,v)=>{fisc27(x.c)[k]=v===''?undefined:v;if(k==='cvae')x.c.cvae=v==='Oui';}});
const FISC_MAIN_COLS27=[
 ...PEOPLE27,
 clientCol27('siren','SIREN','text',c=>c.siren||'',(c,v)=>{c.siren=String(v).replace(/\s/g,'').slice(0,9);},null,100),
 {...STATUT_COL27,label:'Actif/Inactif'},
 GROUPE27,
 clientCol27('regimeFiscal','Régime fiscal','status',c=>['IS','IR'].includes(c.taxRegime)?c.taxRegime:'A définir',(c,v)=>{c.taxRegime=v==='A définir'?'À confirmer':v;},['IS','IR','A définir']),
 clientCol27('tva','TVA','status',c=>TVA27.includes(c.vatRegime)?c.vatRegime:'',(c,v)=>{c.vatRegime=v;},TVA27),
 {k:'f_tvaDay',label:'Deadline TVA',t:'num',nosum:true,w:85,get:x=>fisc27(x.c).tvaDay??x.c.vatDeadline??'',set:(x,v)=>{fisc27(x.c).tvaDay=v===''?undefined:Number(v);if(v!=='')x.c.vatDeadline=Number(v);}},
 fiscCol27('debdes','DEB/DES',['A définir','Non','Mensuelle']),
 fiscCol27('debDay','Deadline DEB/DES',null,85),
 fiscCol27('ts','Taxe/Salaires',['A définir','Non','Mensuelle','Trimestriel','Annuelle']),
 fiscCol27('tsDay','Deadline Taxe/Salaire',null,85),
 fiscCol27('acIS','Acomptes IS',['A définir','Oui','Non','NA']),
 fiscCol27('isDay','Deadline IS',null,85),
 fiscCol27('tvs','TVS',['A définir','Oui','Non']),
 fiscCol27('tvsDay','Deadline TVS',null,85),
 fiscCol27('ifu','IFU',['A définir','Oui','Non']),
 fiscCol27('cfe','CFE',['A définir','Oui sans acompte','Oui avec acompte','Non'],140),
 fiscCol27('cfeDay','Deadline CFE',null,85),
 fiscCol27('cfeN1','CFE N-1 (€)',null,95),
 fiscCol27('cvae','CVAE',['A définir','Oui','Non']),
 fiscCol27('crl','CRL',['A définir','Oui','Non']),
 fiscCol27('tf','Taxe foncière',['A définir','Non','Oui','Payée','En interne','Validé','En attente client'],130),
 {k:'oblig',label:'Échéances / an',t:'auto',w:105,get:x=>obligations27(x.c,fiscView27().fiscYear).length},
];
COLS27.fisc=FISC_MAIN_COLS27;
KINDS27.fisc={label:'Fiscalité',group:x=>x.c.status==='À qualifier'?'À qualifier':x.c.status==='Inactif'?'Inactifs':x.c.status==='Compromis'?'Compromis':isOnboarding27(x.c)?"En cours d'onboarding":'Actifs',
 afterSet:(x,k)=>{if(k==='tva'||k==='regimeFiscal')regenerateAll(state,x.c.id,true);},
 rerender:['tva','f_tvaDay','f_debdes','f_ts','f_acIS','f_tvs','f_ifu','f_cfe','f_cvae','f_crl','f_tf','statutClient','regimeFiscal']};

/* ---------- Vues mensuelles et annuelle : les échéances ---------- */
function fiscMonthCols27(view,clients,y){
 const keys=new Map();
 for(const c of clients)for(const o of obligations27(c,y))if(inView27(o,view)&&!keys.has(o.key))keys.set(o.key,o);
 const order=['TVA','TS','DEB','IS','CFE','CVAE','TVS','IFU','TF','CRL'];
 const obls=[...keys.values()].sort((a,b)=>order.indexOf(a.type)-order.indexOf(b.type)||a.m-b.m||a.key.localeCompare(b.key));
 return [
  ...PEOPLE27.slice(1),
  {k:'regTVA',label:'Régime TVA',t:'auto',w:110,render:x=>x.c.vatRegime&&x.c.vatRegime!=='À confirmer'?autoPill27(x.c.vatRegime,C27.blue):'<span class="sub">—</span>'},
  ...obls.map(o=>({k:o.key,label:o.label,full:`${o.label} — échéance le ${String(o.due).slice(8)}/${String(o.due).slice(5,7)} (selon le client)`,t:'status',opts:fiscOpts27(o),w:135,
   na:x=>!obligations27(x.c,y).some(z=>z.key===o.key),get:x=>x.r[o.key]||obligations27(x.c,y).find(z=>z.key===o.key)?.def||'À faire',set:(x,v)=>{x.row(true)[o.key]=v;}})),
 ];
}
function fiscTodo27(x,v){return obligations27(x.c,x.y).filter(o=>inView27(o,v)).map(o=>({o,st:x.r[o.key]||o.def})).filter(z=>!fiscDone27(z.o,z.st));}
KINDS27.fiscm={label:'Fiscalité',
 group:x=>{const todo=fiscTodo27(x,fiscView27().fiscView);return !todo.length?'Terminé':todo.every(z=>fiscCheck27(z.o,z.st))?'À vérifier':'À traiter';},
 due:x=>{const todo=fiscTodo27(x,fiscView27().fiscView).filter(z=>!fiscCheck27(z.o,z.st)).sort((a,b)=>a.o.due.localeCompare(b.o.due));return todo[0]?{due:todo[0].o.due,label:todo[0].o.label}:null;},
 rerender:[]};
function setFiscView27(v){const b=fiscView27();b.fiscView=v;save();render();}
function fiscalPage27(){
 const b=fiscView27(),view=b.fiscView,y=b.fiscYear,clients=fiscClients27(),now=new Date();
 const tabs=[['main','Tableau principal'],...MONTHS27.map((m,i)=>[String(i+1),m]),['year','Annuelle']];
 const head=`<div class="titleRow"><div><h1>Fiscalité Fr ${y}</h1><div class="sub">Le tableau principal indique les régimes de chaque client ; les échéances de chaque mois en sont déduites automatiquement.</div></div>
  <div class="v25actions">${[y-1,y,y+1].map(v=>`<button class="btn small ${v===y?'':'secondary'}" onclick="fiscView27().fiscYear=${v};save();render()">${v}</button>`).join('')}
  <label class="btn small light">Importer un Excel<input hidden type="file" accept=".xlsx" onchange="importBoard27(this.files[0]);this.value=''"></label>
  <button class="btn small secondary" onclick="exportBoard27('${view==='main'?'fisc':'fiscm'}')">Exporter (Excel)</button></div></div>
  <div class="tabs27">${tabs.map(([k,l])=>`<button class="${String(view)===k?'on':''} ${k===String(now.getMonth()+1)&&y===now.getFullYear()?'now':''}" onclick="setFiscView27('${k}')">${l}</button>`).join('')}</div>`;
 if(view==='main'){
  const ctxs=clients.map(c=>ctx27('fisc',c,0));
  return head+`<div class="cards" style="grid-template-columns:repeat(4,1fr)"><div class="card"><small>Clients suivis</small><span class="big">${clients.length}</span></div><div class="card"><small>TVA mensuelle</small><span class="big">${clients.filter(c=>c.vatRegime==='Mensuelle').length}</span></div><div class="card"><small>Acomptes d’IS</small><span class="big">${clients.filter(c=>fisc27(c).acIS==='Oui').length}</span></div><div class="card"><small>Régimes à définir</small><span class="big warn">${clients.filter(c=>!TVA27.includes(c.vatRegime)).length}</span></div></div>
  ${filtersHtml27('<span class="sub">Un client apparaît ici dès que la mission « Fiscalité FR » est cochée dans le portefeuille.</span>')}
  ${groupsHtml27('fisc',filterCtx27(ctxs),0,{order:['À qualifier','Actifs',"En cours d'onboarding",'Compromis','Inactifs'],colors:{'À qualifier':C27.red,'Actifs':C27.green,"En cours d'onboarding":C27.orange,'Compromis':C27.red,'Inactifs':C27.grey},sortKey:x=>x.c.name.toLowerCase(),nameExtra:()=>'',empty:'Aucun client avec la mission « Fiscalité FR ». Coche-la dans le portefeuille ou importe ton fichier Fiscalité.'})}`;
 }
 const concerned=clients.filter(c=>c.status!=='Inactif'&&obligations27(c,y).some(o=>inView27(o,view)));
 COLS27.fiscm=fiscMonthCols27(view,concerned,y);
 const ctxs=concerned.map(c=>ctx27('fiscm',c,y));
 let total=0,done=0,late=0,check=0;
 for(const x of ctxs)for(const o of obligations27(x.c,y).filter(o=>inView27(o,view))){total++;const st=x.r[o.key]||o.def;if(fiscDone27(o,st))done++;else if(fiscCheck27(o,st))check++;else if(o.due<today27())late++;}
 return head+`<div class="cards" style="grid-template-columns:repeat(4,1fr)"><div class="card"><small>Clients concernés</small><span class="big">${concerned.length}</span></div><div class="card"><small>Déclarations</small><span class="big">${total}</span></div><div class="card"><small>Déposées / payées</small><span class="big good">${done} / ${total}</span></div><div class="card"><small>En retard</small><span class="big ${late?'bad':'good'}">${late}</span>${check?`<div class="sub">+ ${check} à vérifier (ancien statut « validé / envoyé »)</div>`:''}</div></div>
 ${filtersHtml27('<span class="sub">Les colonnes du mois sont calculées à partir des régimes du tableau principal.</span>')}
 ${groupsHtml27('fiscm',filterCtx27(ctxs),y,{order:['À traiter','À vérifier','Terminé'],colors:{'À traiter':C27.blue,'À vérifier':C27.orange,'Terminé':C27.green},nameExtra:()=>'',empty:'Aucune échéance ce mois-ci pour les clients suivis.'})}`;
}
fiscalV15=fiscalPage27;

/* ---------- Import du fichier Fiscalité Excel ---------- */
const FISC_HEAD27={'associe':'associe','manager':'manager','collaborateurs':'collab','siren':'siren','actif/inactif':'statut','groupe':'groupe','tva':'tva','deadline tva':'tvaDay','deb/des':'debdes','deadline deb/des':'debDay','taxe fonciere':'tf','acomptes is':'acIS','deadline is':'isDay','tvs':'tvs','deadline tvs':'tvsDay','ifu':'ifu','cfe':'cfe','deadline cfe':'cfeDay','taxe/salaires':'ts','deadline taxe/salaire':'tsDay','crl':'crl'};
function fiscStatusKey27(n){
 let m;
 if((m=n.match(/^tva (\d\d)$/)))return 'TVA-'+m[1];
 if((m=n.match(/^taxe\/salaire (\d\d)$/)))return 'TS-'+m[1];
 if((m=n.match(/^des\/deb (\d\d)$/)))return 'DEB-'+m[1];
 if((m=n.match(/^is t([1-4])$/)))return 'IS-T'+m[1];
 return {'tvs annuelle':'TVS','ifu annuelle':'IFU','acompte cfe':'CFE-AC','cfe annuelle':'CFE','acompte cvae':'CVAE-AC2','acompte tva s1':'TVA-S1','acompte tva s2':'TVA-S2','solde ca12':'CA12'}[n]||null;
}
// Les statuts importés sont repris tels quels (sauf orthographe) : « Validé » ou « Envoyée » restent « à vérifier ».
function normStatus27(v){return /^a faire$/i.test(v)?'À faire':/^(NA|N\/A)$/.test(v)?'N.A':/^Declarée$/.test(v)?'Déclarée':v;}
function importFiscal27(rows,hi,file){
 const heads=rows[hi].map(normHead27),year=Number((String(rows[0]?.[0]||'')+' '+(file?.name||'')).match(/\b(20\d\d)\b/)?.[1])||fiscView27().fiscYear;
 const data=rows.slice(hi+1).filter(r=>r[0]&&!['name','subitems'].includes(normHead27(r[0]))&&r.slice(1).some(v=>v!=null&&v!==''));
 if(!confirm(`Importer la fiscalité ${year} de ${data.length} client(s) ?\nLes régimes alimentent le tableau principal et les statuts mensuels sont repris. Les clients sont rapprochés par SIREN puis par nom ; les absents sont créés.`))return;
 let created=0,updated=0;
 for(const r of data){
  const v={},st={};
  heads.forEach((h,i)=>{const val=r[i];if(val==null||val==='')return;if(/^cfe \d{4}$/.test(h))v.cfeN1=val;else if(h==='deadline taxe fonciere')v.tfDay=val;else if(FISC_HEAD27[h]&&v[FISC_HEAD27[h]]==null)v[FISC_HEAD27[h]]=val;const k=fiscStatusKey27(h);if(k&&val!=='-')st[k]=normStatus27(String(val));});
  const name=String(r[0]).trim(),siren=String(v.siren||'').replace(/\D/g,'').slice(0,9);
  const m=matchClient27(name,v.siren);if(m.skip)continue;
  let c=m.c;
  if(!c){c=importNewClient27(name,m.siren);created++;}else updated++;
  if(!c.missions)c.missions={};c.missions.tax=true;
  if(m.siren&&!c.siren)c.siren=m.siren;
  ['associe','manager','collab'].forEach(k=>{if(v[k])(c.people27=c.people27||{})[k]=uniqNames27(v[k]);});
  if(v.groupe)c.group27=String(v.groupe);
  if(v.statut){const s=uniqNames27(v.statut);c.status=s==='Compromis'?'Compromis':s==='Inactif'?'Inactif':s.startsWith('Dossiers internes')?'Autres':c.status==='Onboarding'&&!c.onbValidated27&&c.onb27?'Onboarding':/^Actif/.test(s)?'Actif':c.status;}
  if(v.tva&&TVA27.includes(String(v.tva)))c.vatRegime=String(v.tva);
  const f=fisc27(c);
  if(Number(v.tvaDay)>0){f.tvaDay=Number(v.tvaDay);c.vatDeadline=Number(v.tvaDay);}
  ['debdes','tf','acIS','tvs','ifu','cfe','ts','crl'].forEach(k=>{if(v[k]!=null)f[k]=String(v[k]);});
  ['debDay','isDay','tvsDay','cfeDay','tsDay'].forEach(k=>{if(Number(v[k])>0)f[k]=Number(v[k]);});
  if(v.cfeN1!=null)f.cfeN1=Number(v.cfeN1)||0;
  const row=row27('fiscm',c.id,year,true);Object.assign(row,st);

 }
 const b=fiscView27();b.fiscYear=year;b.fiscView='main';
 init25();log25('Import Excel Fiscalité '+year,'',`${created} client(s) créé(s), ${updated} mis à jour`);
 state.page='fiscal';persist25();toast(`${data.length} client(s) importé(s) : ${created} créé(s), ${updated} mis à jour`);
}
(function(){const s=document.createElement('style');s.textContent=`
.tabs27{display:flex;gap:2px;flex-wrap:wrap;border-bottom:1px solid var(--border);margin:-4px 0 14px}
.tabs27 button{border:0;background:none;padding:7px 11px;font-size:12px;color:#5b6577;cursor:pointer;border-bottom:2px solid transparent;font-family:inherit}
.tabs27 button.on{color:#1768c6;border-bottom-color:#1768c6;font-weight:600}.tabs27 button.now:not(.on){color:#1d2939;font-weight:600}
.board27 td.na27{background:repeating-linear-gradient(135deg,#fafbfc,#fafbfc 6px,#f3f4f7 6px,#f3f4f7 12px)}`;document.head.append(s);})();

// Les anciennes tâches fiscales stockées (une par échéance) ne servent plus : on les retire une fois.
if(Array.isArray(state.fiscal)&&state.fiscal.length&&!state.fiscalPurged27){state.fiscal=[];state.fiscalPurged27=true;}
