/* RB Partners V27 — Historique des paramètres d'un dossier, avec dates d'effet.
 * Régimes fiscaux, clôture, missions, honoraires, budget et statut sont historisés au moment où ils changent :
 * une modification d'aujourd'hui ne réécrit pas les exercices précédents. Les échéances fiscales de chaque mois
 * sont calculées avec les régimes en vigueur ce mois-là, et une obligation déjà traitée reste affichée même si
 * le régime a changé depuis. La date d'effet proposée (1er du mois en cours) se corrige dans la fiche client. */
const HIST_FIELDS27=[
 ['vatRegime','Régime de TVA',c=>c.vatRegime,(c,v)=>{c.vatRegime=v;}],
 ['vatDeadline','Échéance TVA (jour)',c=>c.vatDeadline,(c,v)=>{c.vatDeadline=v;}],
 ['taxRegime','Régime fiscal',c=>c.taxRegime,(c,v)=>{c.taxRegime=v;}],
 ['closing','Date de clôture',c=>c.closing,(c,v)=>{c.closing=v;}],
 ...['tvaDay','debdes','debDay','ts','tsDay','acIS','isDay','tvs','tvsDay','ifu','cfe','cfeDay','cvae','tf','crl'].map(k=>['fisc27.'+k,'Fiscalité · '+k,c=>c.fisc27?.[k],(c,v)=>{c.fisc27={...(c.fisc27||{}),[k]:v};}]),
 ['missions','Missions',c=>c.missions,(c,v)=>{c.missions=v;}],
 ['feesBreakdown','Honoraires',c=>c.feesBreakdown,(c,v)=>{c.feesBreakdown=v;}],
 ['budgetHours','Budget de temps',c=>c.budgetHours,(c,v)=>{c.budgetHours=v;}],
 ['status','Statut',c=>c.status,(c,v)=>{c.status=v;}],
];
const FISCAL_HIST27=/^(vatRegime|vatDeadline|taxRegime|fisc27\.)/;
const hist27={snap:null};
const histVal27=v=>JSON.stringify(v??null);
const histUnset27=v=>v==null||v===''||['À confirmer','A définir','À définir','A confirmer'].includes(v)||(typeof v==='object'&&!Object.values(v).some(Boolean));
function histSnapshot27(){const m=new Map();for(const c of state.clients)m.set(c.id,Object.fromEntries(HIST_FIELDS27.map(([k,,g])=>[k,histVal27(g(c))])));return m;}
/* Enregistre les changements depuis le dernier passage (appelé à chaque enregistrement). La première modification
 * d'un champ crée deux entrées : l'ancienne valeur (valable pour tout le passé) et la nouvelle, avec sa date d'effet. */
function histRecord27(){
 if(!hist27.snap){hist27.snap=histSnapshot27();return;}
 const now=new Date(),month=now.toISOString().slice(0,8)+'01',day=now.toISOString().slice(0,10),by=shared25.user?.username||'';
 for(const c of state.clients){
  const old=hist27.snap.get(c.id);
  for(const [k,,g] of HIST_FIELDS27){
   const v=histVal27(g(c));
   if(!old||old[k]===v)continue;
   // Première saisie d'une valeur jusque-là non renseignée : c'est un complément, valable aussi pour le passé.
   if(histUnset27(JSON.parse(old[k]))&&!c.hist27?.[k]?.length)continue;
   // Déjà historisé (par exemple par un collègue, reçu lors d'une fusion) : rien à ajouter.
   if(c.hist27?.[k]?.length&&histVal27(c.hist27[k][c.hist27[k].length-1].v)===v)continue;
   const h=c.hist27=c.hist27||{},list=h[k]=h[k]||[];
   if(!list.length)list.push({from:'0000-01-01',v:JSON.parse(old[k]),init:true});
   const from=FISCAL_HIST27.test(k)?month:day,last=list[list.length-1];
   if(last.from===from&&!last.init)Object.assign(last,{v:JSON.parse(v),by,at:now.toISOString()});
   else list.push({from,v:JSON.parse(v),by,at:now.toISOString()});
  }
 }
 hist27.snap=histSnapshot27();
}
/* Valeurs d'un dossier à une date donnée. */
function viewAt27(c,date){
 if(!c.hist27)return c;
 const v={...c,fisc27:{...(c.fisc27||{})}};
 for(const [k,,,set] of HIST_FIELDS27){const l=c.hist27[k];if(!l?.length)continue;let e=l[0];for(const x of l)if(x.from<=date)e=x;set(v,JSON.parse(JSON.stringify(e.v??null)));}
 return v;
}
const oblCache27=new Map();
const previousObligations27=obligations27;
obligations27=function(c,y){
 const hasHist=c.hist27&&Object.keys(c.hist27).some(k=>FISCAL_HIST27.test(k)),row=row27('fiscm',c.id,y),hasRow=row&&Object.keys(row).length;
 if(!hasHist&&!hasRow)return previousObligations27(c,y);
 const key=c.id+'|'+y+'|'+JSON.stringify(c.hist27||{})+'|'+JSON.stringify([c.vatRegime,c.vatDeadline,c.taxRegime,c.fisc27,row]);
 if(oblCache27.has(key))return oblCache27.get(key);
 let out=[];
 if(hasHist){
  // Chaque mois avec les régimes en vigueur au 1er du mois.
  const all=new Map();
  for(let m=1;m<=12;m++)for(const o of previousObligations27(viewAt27(c,`${y}-${pad27(m)}-01`),y)){if(!all.has(o.key))all.set(o.key,o);if(o.m===m&&!out.some(z=>z.key===o.key))out.push(o);}
  // Régimes successifs (y compris celui d'origine) : leurs obligations déjà traitées restent visibles.
  for(const [k,l] of Object.entries(c.hist27))if(FISCAL_HIST27.test(k))for(const e of l)for(const o of previousObligations27(viewAt27(c,e.init?'0000-01-01':e.from),y))if(!all.has(o.key))all.set(o.key,o);
  // Obligations déjà traitées sous l'ancien régime : conservées.
  for(const [k,o] of all)if(!out.some(z=>z.key===k)&&row?.[k]&&row[k]!==o.def)out.push({...o,kept:true,label:o.label+' (ancien régime)'});
 }else out=previousObligations27(c,y);
 if(hasRow&&!hasHist){const keys=new Set(out.map(o=>o.key));for(const k of Object.keys(row))if(!keys.has(k)&&/^(TVA|TS|DEB|IS|CFE|CVAE|TVS|IFU|TF|CRL|CA12)/.test(k)&&row[k]&&!/^(À faire|A faire|N\.A|NA|-)$/.test(row[k])){const m=Number((k.match(/-(\d\d)$/)||[])[1])||12;out.push({key:k,label:k.replace('-',' ')+' (régime modifié)',m,due:dueDay27(y,m,15),type:k.split('-')[0].replace(/\d+$/,''),def:'À faire',kept:true});}}
 if(hasHist)out.sort((a,b)=>a.m-b.m||a.key.localeCompare(b.key));
 oblCache27.set(key,out);if(oblCache27.size>4000)oblCache27.clear();
 return out;
};
// Clôture d'un exercice : celle en vigueur au 1er janvier de l'année de clôture.
const previousCloseOf27=closeOf27;
closeOf27=function(c,y){return previousCloseOf27(c.hist27?.closing?viewAt27(c,`${y}-01-01`):c,y);};

const previousSaveHistory27=save;
save=function(){try{histRecord27();}catch(e){console.error('historique',e);}return previousSaveHistory27.apply(this,arguments);};

/* ---------- Fiche client : historique éditable ---------- */
function histPanel27(c){
 const h=c.hist27||{},rows=HIST_FIELDS27.filter(([k])=>h[k]?.length>1);
 const show=v=>typeof v==='object'&&v?Object.entries(v).filter(([,x])=>x).map(([k,x])=>x===true?k:k+' '+x).join(', '):String(v??'—');
 return `<div class="panel"><div class="panelHead"><h3>Historique des paramètres</h3><span class="sub">Une modification s’applique à partir de sa date d’effet ; les exercices antérieurs gardent l’ancienne valeur</span></div>${rows.length?`<table><thead><tr><th>Paramètre</th><th>À partir du</th><th>Valeur</th><th>Par</th><th></th></tr></thead><tbody>${rows.map(([k,l])=>h[k].map((e,i)=>`<tr><td>${i?'':esc(l)}</td><td>${e.init?'<span class="sub">origine</span>':`<input type="date" value="${esc(e.from)}" onchange="histFrom27('${c.id}','${esc(k)}',${i},this.value)">`}</td><td>${esc(show(e.v))}</td><td class="sub">${esc(e.by||'')}</td><td>${e.init||i<h[k].length-1?'':`<span class="sub">en vigueur</span>`}</td></tr>`).join('')).join('')}</tbody></table>`:'<div class="panelBody sub">Aucun changement enregistré pour l’instant.</div>'}</div>`;
}
function histFrom27(cid,k,i,from){
 const c=cfind(cid),l=c?.hist27?.[k];if(!l?.[i]||!/^\d{4}-\d{2}-\d{2}$/.test(from))return;
 l[i].from=from;l[i].fromBy=shared25.user?.username||'';l.sort((a,b)=>a.init?-1:b.init?1:a.from.localeCompare(b.from));
 oblCache27.clear();log25('Date d’effet modifiée',cid,`${k} à partir du ${from}`);persist25();
}
const previousRenderHistory27=render;
render=function(){
 if(shared25.ready&&!hist27.snap)hist27.snap=histSnapshot27();
 previousRenderHistory27();
 if(state.page==='client'&&(state.clientTab27||'synthese')==='synthese'){const c=cfind(state.selectedClient),root=document.getElementById('root');if(c&&!root.querySelector('.hist27')){const d=document.createElement('div');d.className='hist27';d.style.marginTop='12px';d.innerHTML=histPanel27(c);root.append(d);}}
};
