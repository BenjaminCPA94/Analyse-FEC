/* RB Partners V27 — tableaux « Bilan Fr » et « AGO » par exercice, sur le modèle des suivis Excel du cabinet.
 * - Une ligne par client du portefeuille, regroupée par avancement (à faire, en cours, terminés, non concernés).
 * - Cases éditables directement (statuts colorés, montants, dates, personnes).
 * - Import direct des exports Excel (.xlsx) et export CSV.
 * - Automatismes : échéances calculées, retards remontés dans les alertes, facturation contrôlée dans Pennylane,
 *   lien bilan → AGO, « Lancer facturation » positionné quand un dossier est terminé, acomptes d'IS proposés. */
const C27={green:'#00c875',orange:'#fdab3d',red:'#e2445c',blue:'#579bfc',purple:'#a25ddc',grey:'#c4c4c4',dark:'#797e93',teal:'#037f4c',empty:'#e6e9ef'};
const BILAN_ETATS27=['1. A faire','2. En cours','3. A revoir par Manager','4. A revoir par Associés','5. A envoyer au client','6. En attente client','7. Validé client','8. A télédéclarer','9. Bilan télédéclaré'];
const AGO_STATUTS27=['1. A faire','2. A revoir par Manager','3. A revoir par Associés','4. A envoyer au client','5. Déposé au Greffe','6. En attente client','7. Validé par le greffe','En attente Greffe','En attente validation greffe','A définir','N.A'];
const OUINON27=['Oui','Non'];
const TVA27=['Mensuelle','Trimestrielle','Annuelle','Non assujetti','Exonéré','Franchise en base'];
const STATUT_CLIENT27=['Actif',"En cours d'onboarding",'Dossier compromis','Inactif','Autres dossiers'];

function color27(v){
 v=String(v??'');
 if(!v||v==='-')return C27.empty;
 if(/^(NA|N\.A|Non concerné)$/i.test(v))return C27.grey;
 if(/^9\.|^7\. Validé|Validé client|Télédéclaré|^Oui|^Actif$|^Validé|^Envoy|^Déclar|^Declar|^Payée|^Fait|^Terminé|^Facturé/.test(v))return C27.green;
 if(/A revoir|vérifier|Bloqué|ompromis/.test(v))return C27.red;
 if(/^1\.|^A faire$/i.test(v))return C27.blue;
 if(/attente|envoyer|Déposé|^[2-8]\.|onboarding|^En cours/.test(v))return C27.orange;
 if(/A définir|Autres dossiers/.test(v))return C27.purple;
 if(/^Non$|Inactif/.test(v))return C27.dark;
 if(/RAN|Dividendes|réserves|Compte courant/.test(v))return C27.purple;
 if(/CA<500K/.test(v))return C27.teal;
 return C27.blue;
}
function boards27(){
 if(!state.boards27)state.boards27={bilan:{},ago:{},year:new Date().getFullYear()-1,q:'',who:'',collapsed:{}};
 return state.boards27;
}
function row27(kind,cid,y,create){const b=boards27(),k=cid+'|'+y;if(!b[kind])b[kind]={};if(create&&!b[kind][k])b[kind][k]={};return b[kind][k]||{};}
function today27(){return iso(new Date());}
function addMonths27(d,n){const y=d.getFullYear(),m=d.getMonth()+n,last=new Date(y,m+1,0).getDate();return new Date(y,m,Math.min(d.getDate(),last));}
function daysBetween27(a,b){return Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/864e5);}
/* Liasse : clôture au 31/12 → 2e jour ouvré après le 1er mai + 15 jours (télétransmission) ; sinon 3 mois + 15 jours. */
function liasseDue27(cd){
 if(cd.getMonth()===11&&cd.getDate()===31){
  const d=new Date(cd.getFullYear()+1,4,1);let k=0;
  while(k<2){d.setDate(d.getDate()+1);const wd=d.getDay();if(wd!==0&&wd!==6&&!(d.getMonth()===4&&d.getDate()===8))k++;}
  return addDays(d,15);
 }
 return addDays(addMonths27(cd,3),15);
}
function closeOf27(c,y){try{return closeDate(c,y);}catch(e){return new Date(y,11,31);}}
function closingLabel27(c){const [m,d]=String(c.closing||'12-31').split('-');return d&&m?d+'/'+m:'';}
function uniqNames27(s){return [...new Set(String(s||'').split(',').map(x=>x.trim()).filter(Boolean))].join(', ');}
function people27(c,k){const p=c.people27||{};return p[k]??({associe:c.associate,manager:c.manager,collab:c.collab}[k])??'';}
function fees27(c){if(!c.feesBreakdown)c.feesBreakdown={accounting:0,annualAccounts:0,legalAnnual:0,exceptional:0,other:0};return c.feesBreakdown;}
function syncFees27(c){const f=fees27(c);c.annualFees=Number(f.accounting||0)+Number(f.annualAccounts||0)+Number(f.legalAnnual||0)+Number(f.other||0);}
function plInvoice27(c,y,category){
 const cd=closeOf27(c,y),from=iso(cd),to=iso(addMonths27(cd,15));
 return (state.pennylaneInvoices||[]).filter(i=>i.source==='pennylane'&&i.client===c.id&&i.category===category&&i.status!=='Annulée'&&i.date>from&&i.date<=to).sort((a,b)=>a.date.localeCompare(b.date))[0]||null;
}

/* ---------- Colonnes ---------- */
// t : status | people | text | num | date | auto. scope client = valeur commune à tous les exercices.
const clientCol27=(k,label,t,get,set,opts,w)=>({k,label,t,opts,w,get:x=>get(x.c),set:(x,v)=>set(x.c,v)});
const rowCol27=(k,label,t,def,opts,w)=>({k,label,t,opts,w,get:x=>x.r[k]??(typeof def==='function'?def(x):def),set:(x,v)=>{x.row(true)[k]=v;}});
const PEOPLE27=[
 clientCol27('associe','Associé','people',c=>people27(c,'associe'),(c,v)=>{(c.people27=c.people27||{}).associe=v;}),
 clientCol27('manager','Manager','people',c=>people27(c,'manager'),(c,v)=>{(c.people27=c.people27||{}).manager=v;}),
 clientCol27('collab','Collaborateurs','people',c=>people27(c,'collab'),(c,v)=>{(c.people27=c.people27||{}).collab=v;}),
];
const GROUPE27=clientCol27('groupe','Groupe','text',c=>c.group27||'',(c,v)=>{c.group27=v;});
const CLOTURE27={k:'cloture',label:'Clôture',t:'text',w:70,get:x=>closingLabel27(x.c),set:(x,v)=>{const m=String(v).match(/^(\d{1,2})\/(\d{1,2})$/);if(!m)return toast('Format attendu : JJ/MM');x.c.closing=m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');}};
const IS_DEFAULT27=x=>{const is=Number(x.r.isCrl||0);return is>3000?Math.round(is/4*100)/100:'';};
const BILAN_COLS27=[
 ...PEOPLE27,GROUPE27,
 {...CLOTURE27,label:'Date de clôture'},
 {k:'echeance',label:'Échéance',t:'date',get:x=>x.r.echeance||iso(liasseDue27(x.cd)),set:(x,v)=>{x.row(true).echeance=v;}},
 clientCol27('siren','Siren','text',c=>c.siren||'',(c,v)=>{c.siren=String(v).replace(/\s/g,'');},null,100),
 rowCol27('afaire','Bilan {Y} à faire','status',x=>x.c.missions?.annualAccounts?'Oui':'Non',OUINON27),
 rowCol27('etat','Etat dossier','status','1. A faire',BILAN_ETATS27,170),
 clientCol27('regimeFiscal','Régime fiscal','status',c=>c.taxRegime==='IR'?'IR':'IS',(c,v)=>{c.taxRegime=v;},['IS','IR']),
 clientCol27('tva','Régime TVA','status',c=>TVA27.includes(c.vatRegime)?c.vatRegime:'',(c,v)=>{c.vatRegime=v;},TVA27),
 rowCol27('soldeIS','Solde IS','status','A Faire',['A Faire','A vérifier manager','Télédéclaré','NA']),
 rowCol27('cvae','Solde CVAE','status','NA',['A Faire','Télédéclaré','CA<500K€','NA']),
 rowCol27('ca12','Solde CA12','status',x=>x.c.vatRegime==='Annuelle'?'A Faire':'NA',['A Faire','Télédéclaré','NA']),
 rowCol27('das2','DAS 2','status','A Faire',['A Faire','A vérifier manager','Télédéclaré','NA']),
 rowCol27('liasse','Liasse fiscale','status','A Faire',['A Faire','A vérifier manager','Télédéclaré','Télédéclaré + AR']),
 rowCol27('decloyer','Décloyer','status','NA',['A Faire','Télédéclaré','NA']),
 rowCol27('lancerFact','Lancer Facturation','status','Non',OUINON27),
 {k:'factPL',label:'Facturation (Pennylane)',t:'auto',w:150,get:x=>x.invB?x.invB.number||'Facturé':''},
 clientCol27('honoAnnuels','Honoraires annuels','num',c=>fees27(c).accounting||0,(c,v)=>{fees27(c).accounting=Number(v||0);syncFees27(c);}),
 clientCol27('honoBilan','Honoraires bilans','num',c=>fees27(c).annualAccounts||0,(c,v)=>{fees27(c).annualAccounts=Number(v||0);syncFees27(c);}),
 clientCol27('forme','Forme juridique','text',c=>c.legalForm||'',(c,v)=>{c.legalForm=v;},null,90),
 {k:'budget',label:'Budget',t:'auto',sum:true,get:x=>Number(fees27(x.c).accounting||0)+Number(fees27(x.c).annualAccounts||0)},
 clientCol27('miroir','Miroir','status',c=>({Actif:'Actif',Inactif:'Inactif',Compromis:'Compromis'})[c.status]||(c.status==='Onboarding'?'Actif':''),(c,v)=>{c.status=v;},['Actif','Inactif','Compromis']),
 rowCol27('isCrl','IS/CRL','num',''),
 rowCol27('ac1','Acompte 1','num',IS_DEFAULT27),rowCol27('ac2','Acompte 2','num',IS_DEFAULT27),rowCol27('ac3','Acompte 3','num',IS_DEFAULT27),rowCol27('ac4','Acompte 4','num',IS_DEFAULT27),
 rowCol27('formule','Formule','text',''),
];
const AGO_COLS27=[
 ...PEOPLE27,
 {...CLOTURE27},
 GROUPE27,
 rowCol27('juridique','Juridique {Y}','status',x=>x.c.missions?.legal?'Oui':'Non',['Oui','Non','A définir','NA','Bloqué']),
 {k:'bilanAuto',label:'Bilan {Y}',t:'auto',w:150,get:x=>x.bilanEtat||''},
 rowCol27('rl','RL 10 %','status','A définir',['Oui','Non','A définir']),
 rowCol27('affectation','Dividendes ou RAN','status','A définir',['A définir','RAN','Dividendes','Autres réserves','Compte courant','Non']),
 rowCol27('statut','Statut AGO','status','1. A faire',AGO_STATUTS27,170),
 {k:'echeanceAgo',label:'Échéance AGO',t:'auto',w:110,get:x=>iso(addMonths27(x.cd,6))},
 rowCol27('annexe',"Type d'annexe",'status','Annexe simplifiée',['Annexe simplifiée','Annexe abrégée','Annexe complète','Dispense (micro)']),
 rowCol27('lancerFact','Lancer facturation','status','-',['Oui','Non','-']),
 clientCol27('honoAgo','Honoraires','num',c=>fees27(c).legalAnnual||0,(c,v)=>{fees27(c).legalAnnual=Number(v||0);syncFees27(c);}),
 clientCol27('statutClient','Statut client','status',c=>({Actif:'Actif',Onboarding:"En cours d'onboarding",Compromis:'Dossier compromis','Dossier compromis':'Dossier compromis',Inactif:'Inactif',Autres:'Autres dossiers'})[c.status]||'',(c,v)=>{c.status={"En cours d'onboarding":'Onboarding','Dossier compromis':'Compromis','Autres dossiers':'Autres'}[v]||v;},STATUT_CLIENT27,150),
 {k:'factPL',label:'Facturation (Pennylane)',t:'auto',w:150,get:x=>x.invJ?x.invJ.number||'Facturé':''},
];
const COLS27={bilan:BILAN_COLS27,ago:AGO_COLS27};
/* Extensions par type de tableau (portefeuille, onboarding…) : groupes, échéances, automatismes. */
const KINDS27={};

/* Contexte d'une ligne : client, exercice, valeurs et signaux automatiques. */
function ctx27(kind,c,y){
 const r=row27(kind,c.id,y),x={kind,c,y,r,cd:closeOf27(c,y),row:create=>row27(kind,c.id,y,create)};
 if(kind==='bilan'){x.invB=plInvoice27(c,y,'Bilan / clôture');}
 else if(kind==='ago'){x.invJ=plInvoice27(c,y,'Juridique annuel');const b=row27('bilan',c.id,y);x.bilanEtat=b.etat||(c.missions?.annualAccounts?'1. A faire':'');}
 return x;
}
function val27(x,k){const col=COLS27[x.kind].find(c=>c.k===k);return col?col.get(x):undefined;}
function group27(x){
 if(KINDS27[x.kind])return KINDS27[x.kind].group(x);
 if(x.kind==='bilan'){
  const a=val27(x,'afaire'),e=val27(x,'etat');
  if(a!=='Oui')return 'Non concernés';if(/^9\./.test(e))return 'Terminés';if(/^1\./.test(e))return 'À faire';return 'En cours';
 }
 const j=val27(x,'juridique'),s=val27(x,'statut');
 if(j!=='Oui'||s==='N.A')return 'Non concernés';if(/^7\./.test(s))return 'Terminés';if(/attente|Déposé|envoyer/.test(s))return 'En attente';return 'À faire';
}
const GROUP_COLORS27={'À faire':C27.blue,'En cours':C27.orange,'En attente':C27.orange,'Terminés':C27.green,'Non concernés':C27.grey};
const GROUP_ORDER27=['À faire','En cours','En attente','Terminés','Non concernés'];
function dueOf27(x){
 if(KINDS27[x.kind])return KINDS27[x.kind].due?.(x)||null;
 if(x.kind==='bilan'){if(val27(x,'afaire')!=='Oui'||/^9\./.test(val27(x,'etat')))return null;return {due:val27(x,'echeance'),label:'Échéance bilan'};}
 if(val27(x,'juridique')!=='Oui'||/^7\.|N\.A/.test(val27(x,'statut')))return null;
 return /^5\.|Greffe/.test(val27(x,'statut'))?{due:iso(addMonths27(x.cd,7)),label:'Dépôt greffe'}:{due:iso(addMonths27(x.cd,6)),label:'AGO'};
}
function urgency27(x){
 const d=dueOf27(x);if(!d||!d.due||(!KINDS27[x.kind]&&x.cd>new Date()))return null;
 const n=daysBetween27(today27(),d.due);
 return n<0?{...d,level:'retard',days:-n}:n<=30?{...d,level:'proche',days:n}:null;
}

/* ---------- Édition ---------- */
function setCell27(el,kind,cid,y,k){
 const c=cfind(cid);if(!c)return;
 const col=COLS27[kind].find(z=>z.k===k),x=ctx27(kind,c,Number(y));
 let v=el.value;if(col.t==='num')v=v===''?'':Number(v);
 col.set(x,v);
 // Automatismes : dossier terminé → facturation à lancer, liasse et AGO cohérents.
 const r=['bilan','ago'].includes(kind)?x.row(true):{};
 if(kind==='bilan'&&k==='etat'&&/^9\./.test(v)){if(!r.lancerFact||r.lancerFact==='Non')r.lancerFact='Oui';if(!r.liasse||r.liasse==='A Faire')r.liasse='Télédéclaré';}
 if(kind==='ago'&&k==='statut'&&/^7\./.test(v)&&(!r.lancerFact||r.lancerFact==='-'))r.lancerFact='Oui';
 KINDS27[kind]?.afterSet?.(x,k,v);
 log25((KINDS27[kind]?.label||(kind==='bilan'?'Bilan ':'AGO ')+y)+' · '+col.label.replace('{Y}',y),cid,String(v));
 if(KINDS27[kind]?.rerender?.includes(k)||['etat','statut','afaire','juridique','echeance','miroir','statutClient','isCrl','honoAnnuels','honoBilan','cloture'].includes(k)||kind==='bilan'&&k==='etat'){save();render();}
 else{save();if(col.t==='status')el.style.background=color27(v);}
}
function toggleGroup27(kind,g){const b=boards27(),k=kind+'|'+g;b.collapsed[k]=!b.collapsed[k];save();render();}
function setBoardFilter27(k,v){boards27()[k]=k==='year'?Number(v):v;save();render();}

/* ---------- Rendu ---------- */
function cell27(kind,x,col){
 if(col.render)return `<td style="min-width:${col.w||110}px">${col.render(x)}</td>`;
 if(col.na&&col.na(x))return `<td class="na27" style="min-width:${col.w||110}px"></td>`;
 const v=col.get(x),id=`'${kind}','${x.c.id}',${x.y},'${col.k}'`;
 if(col.t==='status')return `<td style="min-width:${col.w||120}px"><select class="pill27" style="background:${color27(v)}" onchange="setCell27(this,${id})">${(col.opts.includes(v)||!v?col.opts:[v,...col.opts]).map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}${v?'':'<option selected value="">—</option>'}</select></td>`;
 if(col.t==='auto'){
  if(col.k==='factPL')return `<td style="min-width:${col.w||120}px">${v?`<span class="pill27 static27" style="background:${C27.green}">${esc(v)}</span>`:`<span class="sub">${state.pennylaneSync?.lastSync?'Non facturé':'—'}</span>`}</td>`;
  if(col.k==='bilanAuto')return `<td style="min-width:${col.w||120}px">${v?`<span class="pill27 static27" style="background:${color27(v)}">${esc(v)}</span>`:'<span class="sub">—</span>'}</td>`;
  if(col.k==='echeanceAgo'){const u=urgency27(x);return `<td style="min-width:110px" class="${u?.level==='retard'?'late27':u?'soon27':''}">${datefr(v)}</td>`;}
  return `<td style="min-width:${col.w||90}px">${col.sum?euro(v):esc(v)}</td>`;
 }
 if(col.t==='date'){const u=urgency27(x);return `<td style="min-width:120px" class="${u?.level==='retard'?'late27':u?'soon27':''}"><input class="cell27" type="date" value="${esc(v)}" onchange="setCell27(this,${id})"></td>`;}
 if(col.t==='num')return `<td style="min-width:${col.w||95}px"><input class="cell27" type="number" step="any" value="${v===''||v==null?'':esc(v)}" placeholder="${col.k.startsWith('ac')&&v?esc(v):''}" onchange="setCell27(this,${id})"></td>`;
 return `<td style="min-width:${col.w||(col.t==='people'?160:110)}px"><input class="cell27 ${col.t==='people'?'people27':''}" value="${esc(v)}" title="${esc(v)}" onchange="setCell27(this,${id})"></td>`;
}
function groupsHtml27(kind,ctxs,y,opt={}){
 const b=boards27(),cols=COLS27[kind],order=opt.order||GROUP_ORDER27,colors=opt.colors||GROUP_COLORS27;
 const groups={};ctxs.forEach(x=>{const g=group27(x);(groups[g]=groups[g]||[]).push(x);});
 const sortKey=opt.sortKey||(x=>(dueOf27(x)?.due||'9999')+x.c.name.toLowerCase());
 const nameExtra=opt.nameExtra||(x=>kind==='ago'?`<button class="btn small light" onclick="openAgo27('${x.c.id}',${y})">Ouvrir</button>`:'');
 const head=`<tr><th class="n27">Name</th>${cols.map(c=>`<th title="${esc(c.full||c.label.replace('{Y}',y))}">${esc(c.label.replace('{Y}',y))}</th>`).join('')}</tr>`;
 return order.filter(g=>groups[g]).map(g=>{const list=groups[g].sort((a,b)=>sortKey(a).localeCompare(sortKey(b))),collapsed=b.collapsed[kind+'|'+g],col=colors[g]||C27.blue;
  const sums=cols.map(c=>(c.t==='num'&&!c.nosum)||c.sum?list.reduce((a,x)=>a+Number(c.get(x)||0),0):null);
  return `<div class="grp27" style="color:${col}" onclick="toggleGroup27('${kind}','${esc(g)}')">${collapsed?'▸':'▾'} ${esc(g)} <span class="sub">${list.length} dossier(s)</span></div>
  ${collapsed?'':`<div class="board27" data-k="${esc(kind+'|'+g)}" style="--g:${col}"><table><thead>${head}</thead><tbody>${list.map(x=>{const u=urgency27(x);return `<tr><td class="n27"><div class="name27"><a href="#" onclick="event.preventDefault();openClient('${x.c.id}')" title="${esc(x.c.name)}">${esc(x.c.name)}</a>${u?`<span class="badge ${u.level==='retard'?'red':'orange'}">${u.level==='retard'?'Retard '+u.days+' j':'J-'+u.days}</span>`:''}${nameExtra(x)}</div></td>${cols.map(c=>cell27(kind,x,c)).join('')}</tr>`;}).join('')}</tbody>
  ${sums.some(v=>v!=null)?`<tfoot><tr><td class="n27"><b>Total</b></td>${sums.map(s=>`<td>${s==null?'':`<b>${euro(s)}</b>`}</td>`).join('')}</tr></tfoot>`:''}</table></div>`}`;}).join('')||`<div class="panel panelBody">${opt.empty||'Aucun client. Importe ton fichier Excel ou crée des clients dans le portefeuille.'}</div>`;
}
function filterCtx27(list){
 const b=boards27(),q=(b.q||'').toLowerCase(),who=(b.who||'').toLowerCase();
 return list.filter(x=>(!q||x.c.name.toLowerCase().includes(q)||(x.c.siren||'').includes(q)||(x.c.group27||'').toLowerCase().includes(q))&&(!who||['associe','manager','collab'].some(k=>people27(x.c,k).toLowerCase().includes(who))));
}
function filtersHtml27(extra=''){
 const b=boards27(),who=(b.who||'').toLowerCase();
 const people=[...new Set(state.clients.flatMap(c=>['associe','manager','collab'].flatMap(k=>people27(c,k).split(',').map(s=>s.trim()))).filter(Boolean))].sort();
 return `<div class="v25actions" style="margin-bottom:6px"><input class="mini" style="width:240px" placeholder="Rechercher client, SIREN, groupe" value="${esc(b.q||'')}" onchange="setBoardFilter27('q',this.value)">
  <select class="statusSelect" onchange="setBoardFilter27('who',this.value)"><option value="">Toute l’équipe</option>${people.map(p=>`<option ${p.toLowerCase()===who?'selected':''}>${esc(p)}</option>`).join('')}</select>${extra}</div>`;
}
function boardPage27(kind){
 const b=boards27(),y=b.year;
 const ctxs=filterCtx27(state.clients.map(c=>ctx27(kind,c,y)));
 const title=kind==='bilan'?`Bilan Fr ${y}`:`AGO ${y}`;
 const all=state.clients.map(c=>ctx27(kind,c,y)),concern=all.filter(x=>group27(x)!=='Non concernés');
 const late=concern.filter(x=>urgency27(x)?.level==='retard').length,done=concern.filter(x=>group27(x)==='Terminés').length;
 const unbilled=concern.filter(x=>group27(x)==='Terminés'&&state.pennylaneSync?.lastSync&&!(kind==='bilan'?x.invB:x.invJ)).length;
 return `<div class="titleRow"><div><h1>${esc(title)}</h1><div class="sub">${kind==='bilan'?'Suivi des bilans de l’exercice':'Suivi du juridique annuel de l’exercice'} ${y} — modifiable directement dans les cases, enregistré automatiquement.</div></div>
  <div class="v25actions">${[-2,-1,0,1].map(d=>new Date().getFullYear()+d).map(v=>`<button class="btn small ${v===y?'':'secondary'}" onclick="setBoardFilter27('year',${v})">${v}</button>`).join('')}
  <label class="btn small light">Importer un Excel<input hidden type="file" accept=".xlsx" onchange="importBoard27(this.files[0]);this.value=''"></label>
  <button class="btn small secondary" onclick="exportBoard27('${kind}')">Exporter (Excel)</button></div></div>
 <div class="cards" style="grid-template-columns:repeat(4,1fr)"><div class="card"><small>Dossiers concernés</small><span class="big">${concern.length}</span></div><div class="card"><small>Terminés</small><span class="big good">${done} / ${concern.length}</span></div><div class="card"><small>En retard</small><span class="big ${late?'bad':'good'}">${late}</span></div><div class="card"><small>Terminés non facturés</small><span class="big ${unbilled?'warn':'good'}">${unbilled}</span>${state.pennylaneSync?.lastSync?'':'<div class="sub">synchro Pennylane à venir</div>'}</div></div>
 ${filtersHtml27(kind==='ago'?'<span class="sub">« Ouvrir » sur une ligne prépare le pack AGO (procès-verbal, rapport de gestion).</span>':'')}
 ${groupsHtml27(kind,ctxs,y)}
 <div class="info" style="margin-top:14px"><b>Automatique :</b> ${kind==='bilan'?'échéance proposée = date limite de la liasse (2<sup>e</sup> jour ouvré après le 1<sup>er</sup> mai + 15 j pour une clôture au 31/12, sinon 3 mois + 15 j), modifiable ; un bilan passé en « 9. Bilan télédéclaré » met « Lancer Facturation » à Oui et la liasse à Télédéclaré ; acomptes d’IS proposés au quart de l’IS au-delà de 3 000 €.':'échéance AGO = clôture + 6 mois, puis dépôt au greffe à + 7 mois ; la colonne « Bilan » reprend l’état du tableau Bilan ; un dossier « 7. Validé par le greffe » met « Lancer facturation » à Oui.'} Les retards remontent dans le tableau de bord et la facturation est vérifiée dans les factures Pennylane du cabinet.</div>`;
}
function openAgo27(cid,y){ensureV20State();state.legalView.year=y;openLegalDossierV20(cid);}

/* ---------- Export CSV (ouvrable dans Excel) ---------- */
function exportBoard27(kind){
 const b=boards27(),y=b.year,cols=COLS27[kind],q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const lines=[['Name','Groupe d’avancement',...cols.map(c=>c.label.replace('{Y}',y))].map(q).join(';')];
 for(const c of state.clients){const x=ctx27(kind,c,y);lines.push([c.name,group27(x),...cols.map(col=>{const v=col.get(x);return col.t==='date'||col.k==='echeanceAgo'?datefr(v):v;})].map(q).join(';'));}
 download25((kind==='bilan'?'Bilan_Fr_':'AGO_')+y+'.csv','﻿'+lines.join('\r\n'),'text/csv;charset=utf-8');
}

/* ---------- Import des exports Excel (.xlsx) ---------- */
async function unzip27(buf){
 const dv=new DataView(buf),u8=new Uint8Array(buf);
 let e=u8.length-22;while(e>=0&&dv.getUint32(e,true)!==0x06054b50)e--;
 if(e<0)throw Error('Ce fichier n’est pas un classeur Excel (.xlsx).');
 const files={},n=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);
 for(let i=0;i<n;i++){const nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true);files[new TextDecoder().decode(u8.subarray(p+46,p+46+nl))]={method:dv.getUint16(p+10,true),size:dv.getUint32(p+20,true),off:dv.getUint32(p+42,true)};p+=46+nl+xl+cl;}
 return {async read(name){const f=files[name];if(!f)return null;const s=f.off+30+dv.getUint16(f.off+26,true)+dv.getUint16(f.off+28,true),data=u8.subarray(s,s+f.size);
  if(f.method===0)return new TextDecoder().decode(data);
  return new TextDecoder().decode(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());}};
}
async function readXlsx27(file){
 const z=await unzip27(await file.arrayBuffer()),xml=s=>new DOMParser().parseFromString(s,'application/xml');
 const ssx=await z.read('xl/sharedStrings.xml');
 const ss=ssx?[...xml(ssx).getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(t=>t.textContent).join('')):[];
 let path='xl/worksheets/sheet1.xml';
 try{const wb=xml(await z.read('xl/workbook.xml')),rels=xml(await z.read('xl/_rels/workbook.xml.rels')),rid=wb.getElementsByTagName('sheet')[0].getAttribute('r:id'),rel=[...rels.getElementsByTagName('Relationship')].find(r=>r.getAttribute('Id')===rid);if(rel){const t=rel.getAttribute('Target');path=t.startsWith('/')?t.slice(1):'xl/'+t.replace(/^\.\//,'');}}catch(e){}
 const sheet=await z.read(path);if(!sheet)throw Error('Feuille introuvable dans le classeur.');
 const col=ref=>{let n=0;for(const ch of ref.replace(/\d+$/,''))n=n*26+ch.charCodeAt(0)-64;return n-1;},rows=[];
 for(const r of xml(sheet).getElementsByTagName('row')){
  const row=[];
  for(const c of r.getElementsByTagName('c')){const t=c.getAttribute('t'),v=c.getElementsByTagName('v')[0]?.textContent;let val=null;
   if(t==='s')val=ss[Number(v)];else if(t==='inlineStr')val=[...c.getElementsByTagName('t')].map(x=>x.textContent).join('');else if(t==='str'||t==='e')val=v??null;else if(t==='b')val=v==='1'?'Oui':'Non';else if(v!=null)val=Number(v);
   row[col(c.getAttribute('r'))]=val;}
  rows[Number(r.getAttribute('r'))-1]=row;
 }
 return Array.from(rows,r=>r||[]);
}
const HEAD27={'name':'name','associe':'associe','manager':'manager','collaborateur':'collab','collaborateurs':'collab','groupe':'groupe','groupe#2':'statutClient','cloture':'cloture','date de cloture':'cloture','echeance':'echeance','siren':'siren','etat dossier':'etat','regime fiscal':'regimeFiscal','regime tva':'tva','solde is':'soldeIS','solde cvae':'cvae','solde ca12':'ca12','das 2':'das2','liasse fiscale':'liasse','decloyer':'decloyer','lancer facturation':'lancerFact','honoraires annuels':'honoAnnuels','honoraires bilans':'honoBilan','forme juridique':'forme','miroir':'miroir','is/crl':'isCrl','acompte 1':'ac1','acompte 2':'ac2','acompte 3':'ac3','acompte 4':'ac4','formule':'formule','rl 10 %':'rl','dividendes ou ran':'affectation','statut ago':'statut','facturation':'factLink',"type d'annexe":'annexe','honoraires':'honoAgo'};
const normHead27=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’`]/g,"'").replace(/\s+/g,' ').trim();
async function importBoard27(file){
 if(!file)return;
 let rows;try{rows=await readXlsx27(file);}catch(e){return alert('Import impossible : '+e.message);}
 const hi=rows.findIndex(r=>normHead27(r[0])==='name');
 if(hi<0)return alert('Ligne d’en-tête « Name » introuvable : utilise l’export Excel du tableau Portefeuille, Bilan ou AGO.');
 if(rows[hi].some(h=>['realise par','honoraires prevus'].includes(normHead27(h))))return importExc27(rows,hi,file);
 if(rows[hi].some(h=>['deadline tva','tva 01','acomptes is'].includes(normHead27(h))))return importFiscal27(rows,hi,file);
 if(rows[hi].some(h=>['date entree','onboarding statut','actif/inactif'].includes(normHead27(h))))return importPortfolio27(rows,hi);
 const seen={},keys=rows[hi].map(h=>{let n=normHead27(h);if(/^bilan \d{4} a faire$/.test(n))return 'afaire';if(/^juridique \d{4}$/.test(n))return 'juridique';seen[n]=(seen[n]||0)+1;if(seen[n]>1)n+='#'+seen[n];return HEAD27[n]||null;});
 const kind=keys.includes('statut')?'ago':keys.includes('etat')?'bilan':null;
 if(!kind)return alert('Colonnes « Etat dossier » (Bilan) ou « Statut AGO » introuvables.');
 const year=Number((String(rows[0]?.[0]||'')+' '+file.name).match(/\b(20\d\d)\b/)?.[1])||boards27().year;
 const data=rows.slice(hi+1).filter(r=>r[0]&&String(r[0]).trim()&&normHead27(r[0])!=='name'&&normHead27(r[0])!=='subitems'&&r.slice(1).some(v=>v!=null&&v!==''));
 if(!confirm(`Importer ${data.length} dossier(s) dans ${kind==='bilan'?'Bilan Fr':'AGO'} ${year} ?\nLes clients sont rapprochés par SIREN puis par nom ; les absents sont créés. Les valeurs du fichier remplacent celles du CRM pour cet exercice.`))return;
 let created=0,updated=0;
 for(const r of data){
  const v={};keys.forEach((k,i)=>{if(k&&r[i]!=null&&r[i]!=='')v[k]=r[i];});
  const name=String(v.name).trim(),siren=String(v.siren||'').replace(/\D/g,'');
  let c=(siren.length===9&&state.clients.find(x=>x.siren===siren))||state.clients.find(x=>norm27(x.name)===norm27(name));
  if(!c){c=newClient26({name,siren:siren.length===9?siren:'',legalForm:v.forme||'',contact:'',email:''});c.entry='';c.status='Actif';state.clients.push(c);created++;}else updated++;
  const x=ctx27(kind,c,year),row=x.row(true);
  for(const col of COLS27[kind]){
   if(col.t==='auto'||v[col.k]==null)continue;
   let val=v[col.k];
   if(col.t==='people')val=uniqNames27(val);
   else if(col.t==='date')val=typeof val==='number'?new Date(Math.round((val-25569)*864e5)).toISOString().slice(0,10):String(val).slice(0,10);
   else if(col.t==='num')val=Number(String(val).replace(',','.'))||0;
   else if(col.k==='cloture'){const m=String(val).match(/^(\d{1,2})\/(\d{1,2})/);if(!m)continue;val=m[1]+'/'+m[2];}
   else val=String(val).trim();
   if(col.k==='siren'&&String(val).replace(/\D/g,'').length!==9)continue;
   col.set(x,val);
  }
  // Colonne « Facturation » renseignée dans l'export : le dossier a déjà été facturé.
  if(v.factLink)row.factManual=row.factManual||'import';
  if(!c.missions)c.missions={};
  if(kind==='bilan'&&v.afaire)c.missions.annualAccounts=row.afaire==='Oui'||c.missions.annualAccounts;
  if(kind==='ago'&&v.juridique)c.missions.legal=row.juridique==='Oui'||c.missions.legal;
 }
 boards27().year=year;state.page=kind==='bilan'?'closing':'legal';
 init25();log25('Import Excel '+(kind==='bilan'?'Bilan Fr ':'AGO ')+year,'',`${created} client(s) créé(s), ${updated} mis à jour`);
 persist25();toast(`${data.length} dossier(s) importé(s) : ${created} créé(s), ${updated} mis à jour`);
}

/* ---------- Fiche client ---------- */
function clientBoards27(c){
 const y=new Date().getFullYear(),years=[y,y-1,y-2];
 return `<div class="panel"><div class="panelHead"><h3>Bilan et juridique par exercice</h3><div class="v25actions"><button class="btn small light" onclick="routePage('closing')">Tableau Bilan</button><button class="btn small light" onclick="routePage('legal')">Tableau AGO</button></div></div><table><thead><tr><th>Exercice</th><th>Clôture</th><th>Bilan</th><th>Échéance</th><th>Statut AGO</th><th>Échéance AGO</th><th>Facturation</th></tr></thead><tbody>${years.map(yy=>{const b=ctx27('bilan',c,yy),a=ctx27('ago',c,yy);
  const pill=v=>`<span class="badge" style="background:${color27(v)};color:#fff">${esc(v)}</span>`;
  return `<tr><td><b>${yy}</b></td><td>${datefr(iso(b.cd))}</td><td>${val27(b,'afaire')==='Oui'?pill(val27(b,'etat')):'<span class="sub">Non concerné</span>'}</td><td>${val27(b,'afaire')==='Oui'?datefr(val27(b,'echeance')):''}</td><td>${val27(a,'juridique')==='Oui'?pill(val27(a,'statut')):'<span class="sub">Non concerné</span>'}</td><td>${val27(a,'juridique')==='Oui'?datefr(iso(addMonths27(a.cd,6))):''}</td><td>${b.invB?'Bilan '+esc(b.invB.number||'facturé'):''}${b.invB&&a.invJ?' · ':''}${a.invJ?'AGO '+esc(a.invJ.number||'facturé'):''}</td></tr>`;}).join('')}</tbody></table></div>`;
}

/* ---------- Alertes automatiques ---------- */
function boardAlerts27(){
 const y=new Date().getFullYear(),out=[],synced=Boolean(state.pennylaneSync?.lastSync);
 for(const yy of [y-1,y])for(const c of state.clients){
  for(const kind of ['bilan','ago']){
   const x=ctx27(kind,c,yy),u=urgency27(x),g=group27(x);
   if(u)out.push({kind,x,u,title:(kind==='bilan'?(u.level==='retard'?'Bilan en retard':'Bilan à terminer'):(u.level==='retard'?u.label+' en retard':u.label+' à faire'))+' — exercice '+yy,detail:`${val27(x,kind==='bilan'?'etat':'statut')} · échéance ${datefr(u.due)}`});
   if(g==='Terminés'&&synced&&!(kind==='bilan'?x.invB:x.invJ))out.push({kind:'F'+kind,x,u:null,title:(kind==='bilan'?'Bilan ':'Juridique ')+yy+' terminé non facturé',detail:'Aucune facture « '+(kind==='bilan'?'bilan / clôture':'juridique')+' » trouvée dans Pennylane après la clôture.'});
  }
 }
 return out;
}
const previousExceptions27=deriveExceptionsV18;
deriveExceptionsV18=function(){
 const t=today27();
 const base=previousExceptions27().filter(x=>!['Juridique','Clôture','Recouvrement'].includes(x.area));
 // Recouvrement : suivi dans Pennylane, pas d'alerte de factures échues dans le CRM.
 boardAlerts27().forEach(a=>base.push({id:exceptionId(['BOARD',a.kind,a.x.c.id,a.x.y]),area:a.kind.startsWith('F')?'Facturation':a.kind==='bilan'?'Clôture':'Juridique',client:a.x.c.id,severity:a.u?.level==='retard'?'Critique':'À vérifier',title:a.title,detail:a.detail,auto:true,action:a.kind.startsWith('F')?'fees':a.kind==='bilan'?'closing':'legal',owner:people27(a.x.c,'manager')}));
 return base.filter(x=>!state.v18.resolved[x.id]);
};
const previousAlerts27=deriveAlerts;
deriveAlerts=function(){
 const out=previousAlerts27();
 boardAlerts27().filter(a=>a.u?.level==='retard'||a.kind.startsWith('F')).forEach(a=>out.push({level:a.u?.level==='retard'?'critical':'warning',client:a.x.c.id,title:`${a.x.c.name} — ${a.title}`,body:a.detail,action:a.kind.includes('ago')?'legal':'closing'}));
 return out;
};

/* ---------- Branchement ---------- */
(function(){const s=document.createElement('style');s.textContent=`
.board27{overflow-x:auto;border:1px solid var(--border);border-radius:8px;background:#fff;margin-bottom:6px}
.board27 table{border-collapse:separate;border-spacing:0;font-size:12px;width:max-content;min-width:100%}
.board27 th{background:#f5f6f8;white-space:nowrap;padding:8px 6px;font-size:11px;color:#676879;font-weight:600;border-bottom:1px solid #e6e9ef;border-right:1px solid #eceef2;text-align:center}
.board27 td{border-bottom:1px solid #eef0f4;border-right:1px solid #f1f2f5;padding:0;height:36px;text-align:center;white-space:nowrap;vertical-align:middle}
.board27 tfoot td{background:#fafbfc;font-size:11px}
.board27 .n27{position:sticky;left:0;background:#fff;z-index:1;text-align:left;padding:0 10px;min-width:300px;max-width:300px;border-left:6px solid var(--g);box-shadow:2px 0 0 #eef0f4}
.board27 th.n27{background:#f5f6f8;z-index:2}
.name27{display:flex;align-items:center;gap:6px;overflow:hidden}.name27 a{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#323338;font-weight:600;text-decoration:none;flex:1}
.name27 .badge{font-size:10px;padding:2px 5px}.name27 .btn{padding:3px 6px;font-size:10px}
.pill27{appearance:none;-webkit-appearance:none;border:0;width:100%;height:36px;color:#fff;font-weight:600;font-size:11.5px;text-align:center;text-align-last:center;cursor:pointer;padding:0 6px;display:flex;align-items:center;justify-content:center}
.pill27 option{color:#323338;background:#fff}.static27{cursor:default}
.cell27{border:0;background:transparent;width:100%;height:36px;text-align:center;font-size:12px;padding:0 6px;font-family:inherit}
.cell27:focus{outline:2px solid #579bfc;background:#fff}.people27{font-size:11px}
.board27 td>a{text-decoration:none}
.late27{background:#fde8eb;color:#c62a3d;font-weight:700}.soon27{background:#fff4e0;color:#b26b00;font-weight:700}
.grp27{display:flex;align-items:center;gap:8px;font-weight:800;font-size:15px;margin:18px 0 8px;cursor:pointer;user-select:none}`;document.head.append(s);})();
closingPageV19=()=>boardPage27('bilan');
legalPortfolioV20=()=>boardPage27('ago');
clientClosingWorkspace=clientBoards27;
const previousRenderBoards27=render;
render=function(){
 previousRenderBoards27();
 if(!['closing','legal'].includes(state.page))return;
 const root=document.getElementById('root');
 [...root.children].forEach(el=>{if((el.tagName==='BUTTON'&&el.textContent==='Contrôler une balance importée')||(el.classList.contains('note')&&el.textContent.startsWith('Module historique')))el.remove();});
};
