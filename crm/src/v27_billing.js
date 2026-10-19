/* RB Partners V27 — Facturation fiabilisée.
 * Parcours : mission facturable → facture déclarée ou émise dans Pennylane → rapprochement confirmé.
 * Règles :
 *  - une facture Pennylane n'est jamais rattachée automatiquement sur un montant « proche » ou une fenêtre de dates :
 *    ces correspondances sont proposées dans « Rapprochements à valider » et confirmées par un humain ;
 *  - seule une égalité de numéro de facture (saisie CRM ↔ Pennylane) vaut preuve et rapproche sans validation ;
 *  - une facture peut couvrir plusieurs missions et une mission peut avoir plusieurs factures (acompte, solde, avoir) :
 *    chaque lien porte un montant HT affecté ;
 *  - une facture saisie dans le CRM est une information déclarée, en attente de Pennylane ; elle n'est jamais effacée
 *    automatiquement : au rapprochement elle est marquée « rapprochée » et ses affectations passent sur la facture Pennylane ;
 *  - un ancien statut « facturé » sans référence reste « Facturé (déclaré) », sans facture reconstituée ;
 *  - aucun montant HT n'est déduit d'un TTC avec un taux supposé ;
 *  - tous les exercices sont parcourus (pas seulement les deux derniers). */
const BILL_CAT27={B:'Bilan / clôture',J:'Juridique annuel',X:'Travaux exceptionnels'};
const BILL_TYPES27=['Facture','Acompte','Solde','Avoir'];
function billingKey27(){if(!state.billing27)state.billing27={done:{},filter:'Année en cours'};const b=state.billing27;b.done=b.done||{};b.links=b.links||{};b.rejected=b.rejected||{};return b;}
function plInv27(){return (state.pennylaneInvoices||[]).filter(i=>i.source==='pennylane'&&i.status!=='Annulée');}
function plFind27(id){return (state.pennylaneInvoices||[]).find(i=>i.id===id);}
const round27=n=>Math.round(Number(n||0)*100)/100;

/* ---------- Montants ---------- */
/* HT d'une facture : connu par Pennylane (montant HT) ou saisi ; sinon inconnu (null), jamais estimé. */
function invHT27(i){
 if(i.ht!=null&&i.ht!=='')return Number(i.ht)||0;
 const p=plFind27(i.id);if(p&&p.amount!=null)return Number(p.amount)||0;
 return null;
}
function htTxt27(v){return v==null?'<span class="sub" title="Montant HT non communiqué">HT inconnu</span>':euro(v);}

/* ---------- Missions facturables ---------- */
function keyInfo27(key){const [t,a,b]=String(key).split('|');return t==='X'?{t,wid:a,w:exc27().items.find(x=>x.id===a)}:{t,cid:a,y:Number(b),c:cfind(a)};}
function expected27(key){const k=keyInfo27(key);if(k.t==='B')return Number(fees27(k.c||{}).annualAccounts||0);if(k.t==='J')return Number(fees27(k.c||{}).legalAnnual||0);if(k.t==='X')return Number(k.w?.fees||0);return 0;}
function keyLabel27(key){const k=keyInfo27(key);if(k.t==='B')return 'Bilan '+k.y;if(k.t==='J')return 'Juridique annuel '+k.y;if(k.t==='X')return k.w?.name||'Travail exceptionnel';return key;}
function keyClient27(key){const k=keyInfo27(key);return k.t==='X'?cfind(k.w?.client):k.c;}
/* Ancien marquage sans facture : colonne « Facturation » d'un import, date saisie à la main, statut « Facturé » d'un travail. */
function legacyBilled27(key){
 const k=keyInfo27(key);
 if(k.t==='B'||k.t==='J'){const r=boards27()[k.t==='B'?'bilan':'ago']?.[k.cid+'|'+k.y];return r?.factManual?{ref:'',date:/^\d{4}-\d{2}-\d{2}$/.test(r.factManual)?r.factManual:''}:null;}
 if(k.t==='X'&&k.w?.factStatus==='Facturé')return {ref:['import','manuel','CRM'].includes(k.w.factRef)?'':k.w.factRef||'',date:''};
 return null;
}
/* Toutes les affectations : liens confirmés vers Pennylane + factures déclarées dans le CRM non encore rapprochées. */
let allocCache27=null;
function allocs27(){
 if(allocCache27)return allocCache27;
 const out=[],b=billingKey27();
 for(const [id,list] of Object.entries(b.links)){const inv=plFind27(id);if(!inv||inv.status==='Annulée')continue;for(const l of list)out.push({...l,inv,source:'pennylane'});}
 for(const m of state.invoices||[]){
  if(m.source!=='manual'||m.reconciled)continue;
  const list=Array.isArray(m.alloc)?m.alloc:m.origin&&invHT27(m)!=null?[{key:m.origin,ht:invHT27(m)}]:m.origin?[{key:m.origin,ht:null}]:[];
  for(const l of list)out.push({...l,inv:m,source:'manual'});
 }
 allocCache27=out;setTimeout(()=>{allocCache27=null;},0);
 return out;
}
function billState27(key,cache){
 const list=(cache||allocs27()).filter(a=>a.key===key),exp=expected27(key);
 const known=list.filter(a=>a.ht!=null),billed=round27(known.reduce((s,a)=>s+Number(a.ht),0)),unknown=list.length>known.length;
 const refs=[...new Set(list.map(a=>a.inv.number||'').filter(Boolean))];
 const pl=list.some(a=>a.source==='pennylane'),declared=list.some(a=>a.source==='manual');
 if(list.length){
  if(unknown||billed>=exp-0.5||!exp)return {label:'Facturé',billed,exp,rest:0,refs,pl,declared};
  return {label:'Partiellement facturé',billed,exp,rest:round27(exp-billed),refs,pl,declared};
 }
 const old=legacyBilled27(key);
 if(old)return {label:'Facturé (déclaré)',billed:0,exp,rest:0,refs:old.ref?[old.ref]:[],legacy:true};
 return {label:'À facturer',billed:0,exp,rest:exp,refs:[]};
}
function billYears27(){
 const ys=new Set([new Date().getFullYear()-1,new Date().getFullYear()]);
 for(const k of ['bilan','ago'])Object.keys(boards27()[k]||{}).forEach(id=>{const y=Number(id.split('|')[1]);if(y>2000)ys.add(y);});
 return [...ys].sort();
}
/* Missions terminées et facturables, tous exercices confondus. */
function billableItems27(){
 const out=[];
 for(const yy of billYears27())for(const c of state.clients){
  const b=ctx27('bilan',c,yy),a=ctx27('ago',c,yy);
  if(group27(b)==='Terminés'&&val27(b,'lancerFact')==='Oui')out.push({key:'B|'+c.id+'|'+yy,c,src:'Bilan '+yy,label:'Bilan '+yy,page:'closing',y:yy});
  if(group27(a)==='Terminés'&&val27(a,'lancerFact')!=='Non')out.push({key:'J|'+c.id+'|'+yy,c,src:'AGO '+yy,label:'Juridique annuel '+yy,page:'legal',y:yy});
 }
 exc27().items.forEach(w=>{const c=cfind(w.client);if(c&&w.included!=='Oui'&&(w.statut==='Terminé'||w.lancerFact==='Oui'))out.push({key:'X|'+w.id,c,src:'Travail exceptionnel',label:w.name,page:'exceptional',exc:w.id,y:excYear27(w)});});
 return out;
}
/* Prestations encore à facturer (tout ou partie). */
function toBill27(){
 const cache=allocs27(),done=billingKey27().done;
 return billableItems27().map(x=>{const s=billState27(x.key,cache);return {...x,state:s,amount:s.rest};}).filter(x=>['À facturer','Partiellement facturé'].includes(x.state.label)&&!done[x.key]);
}
/* Écarts d'honoraires courants : à vérifier, ce ne sont pas des prestations à facturer. */
function feeGaps27(){
 if(!state.pennylaneSync?.lastSync)return [];
 const y=new Date().getFullYear(),m=new Date().getMonth()+1,done=billingKey27().done;
 return state.clients.filter(c=>!['Inactif','Compromis'].includes(c.status)).map(c=>({c,r:feeReconciliation(c,y,m),key:'R|'+c.id+'|'+y+'-'+m})).filter(x=>x.r.gap>10&&!done[x.key]).map(x=>({...x,label:`Écart à date ${MONTHS27[m-1].toLowerCase()} ${y}`,amount:Math.round(x.r.gap)}));
}
function gapChecked27(key){const b=billingKey27();b.done[key]={at:new Date().toISOString(),by:shared25.user?.username||''};log25('Écart d’honoraires vérifié',key.split('|')[1],key);persist25();}

/* ---------- Rapprochements proposés (jamais appliqués sans validation) ---------- */
function plAllocated27(id){return round27((billingKey27().links[id]||[]).reduce((s,l)=>s+Number(l.ht||0),0));}
function suggestions27(){
 const b=billingKey27(),cache=allocs27(),out=[],open=toBill27();
 const free=plInv27().map(i=>({inv:i,left:round27(Number(i.amount||0)-plAllocated27(i.id))})).filter(x=>Math.abs(x.left)>0.5);
 for(const it of open){
  const t=it.key[0],cat=BILL_CAT27[t];if(!cat)continue;
  let from='0000',to='9999';
  if(t==='B'||t==='J'){const cd=closeOf27(it.c,it.y);from=iso(cd);to=iso(addMonths27(cd,15));}
  if(t==='X'){const w=exc27().items.find(x=>x.id===it.exc);if(w?.date)from=iso(addDays(new Date(w.date+'T12:00:00'),-30));}
  for(const f of free){
   const i=f.inv;if(i.client!==it.c.id||i.category!==cat||!(i.date>from&&i.date<=to)||b.rejected[i.id+'|'+it.key])continue;
   const same=Math.abs(f.left-it.amount)<0.5;
   out.push({kind:'pl',key:it.key,it,inv:i,left:f.left,ht:round27(Math.min(f.left,it.amount)||f.left),why:`Même client, catégorie « ${cat} », facture du ${datefr(i.date)}${same?', montant identique au reste à facturer':', montant différent'}`});
  }
 }
 // Factures saisies dans le CRM ↔ factures Pennylane : même client, montant HT identique (±1 €) et dates à 45 jours près.
 const manual=(state.invoices||[]).filter(m=>m.source==='manual'&&!m.reconciled);
 for(const m of manual){const ht=invHT27(m);if(ht==null)continue;
  for(const i of plInv27()){if(i.client!==m.client||b.rejected[i.id+'|M|'+m.id])continue;
   if(Math.abs(Number(i.amount||0)-ht)<1&&Math.abs(new Date(i.date)-new Date(m.date))<=45*864e5)out.push({kind:'manual',m,inv:i,why:`Montant HT identique, ${datefr(m.date)} ↔ ${datefr(i.date)}`});}}
 return out;
}
function confirmLink27(invId,key,ht){
allocCache27=null; const inv=plFind27(invId);ht=round27(ht);if(!inv||!ht)return toast('Montant à affecter invalide.');
 const b=billingKey27();(b.links[invId]=b.links[invId]||[]).push({key,ht,at:new Date().toISOString(),by:shared25.user?.username||'',method:'validé'});
 log25('Rapprochement confirmé',keyClient27(key)?.id||'',`${inv.number||invId} → ${keyLabel27(key)} · ${euro(ht)} HT`);persist25();
}
/* Action groupée avec aperçu : seulement les propositions sans ambiguïté (montant identique au reste, une seule facture candidate par mission et une seule mission par facture). */
function exactSuggestions27(){
 const pl=suggestions27().filter(x=>x.kind==='pl'),byKey={},byInv={};
 pl.forEach(x=>{(byKey[x.key]=byKey[x.key]||[]).push(x);(byInv[x.inv.id]=byInv[x.inv.id]||[]).push(x);});
 return pl.filter(x=>Math.abs(x.left-x.it.amount)<0.5&&byKey[x.key].length===1&&byInv[x.inv.id].length===1);
}
function confirmExact27(){
 const l=exactSuggestions27();if(!l.length)return toast('Aucune proposition sans ambiguïté.');
 if(!confirm(`Confirmer ${l.length} rapprochement(s) sans ambiguïté ?\n\n${l.slice(0,15).map(x=>`• ${x.it.c.name} — ${x.it.label} ↔ ${x.inv.number||x.inv.id} (${euro(x.ht)} HT)`).join('\n')}${l.length>15?`\n… et ${l.length-15} autre(s)`:''}\n\nChaque lien reste annulable dans « Factures émises ».`))return;
 const b=billingKey27(),me=shared25.user?.username||'',at=new Date().toISOString();allocCache27=null;
 l.forEach(x=>(b.links[x.inv.id]=b.links[x.inv.id]||[]).push({key:x.key,ht:round27(x.ht),at,by:me,method:'validé (groupé)'}));
 log25('Rapprochements confirmés en groupe','',l.length+' lien(s)');persist25();
}
function rejectLink27(invId,key){allocCache27=null;billingKey27().rejected[invId+'|'+key]={at:new Date().toISOString(),by:shared25.user?.username||''};log25('Rapprochement écarté','',invId+' / '+key);persist25();}
function unlink27(invId,key){allocCache27=null;const b=billingKey27();b.links[invId]=(b.links[invId]||[]).filter(l=>l.key!==key);if(!b.links[invId].length)delete b.links[invId];log25('Rapprochement annulé','',invId+' / '+key);persist25();}
/* La saisie CRM est rapprochée (jamais effacée) : ses affectations passent sur la facture Pennylane. */
function reconcileManual27(mid,plId,method){
allocCache27=null; const m=(state.invoices||[]).find(x=>x.id===mid),inv=plFind27(plId);if(!m||!inv)return;
 const b=billingKey27(),list=Array.isArray(m.alloc)?m.alloc:m.origin?[{key:m.origin,ht:invHT27(m)??Number(inv.amount||0)}]:[];
 for(const a of list)if(!(b.links[plId]||[]).some(l=>l.key===a.key))(b.links[plId]=b.links[plId]||[]).push({key:a.key,ht:round27(a.ht),at:new Date().toISOString(),by:shared25.user?.username||'',method:method||'validé',from:mid});
 m.reconciled={pl:plId,number:inv.number||'',at:new Date().toISOString(),by:shared25.user?.username||'',method:method||'validé'};
 log25('Saisie CRM rapprochée de Pennylane',m.client,`${m.number||m.label} ↔ ${inv.number||plId}`);
}
/* Seule preuve automatique : le même numéro de facture. */
function reconcileByNumber27(){
 const norm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');let n=0;
 for(const m of (state.invoices||[]).filter(x=>x.source==='manual'&&!x.reconciled&&norm(x.number))){
  const hits=plInv27().filter(i=>i.client===m.client&&norm(i.number)===norm(m.number));
  if(hits.length===1){reconcileManual27(m.id,hits[0].id,'numéro identique');n++;}
 }
 return n;
}
const previousSyncInvoices27=syncInvoices27;
syncInvoices27=async function(silent){await previousSyncInvoices27(silent);allocCache27=null;if(reconcileByNumber27()){save();render();}};
// Les liens de la version précédente (rapprochement automatique « au plus proche ») ne sont plus utilisés.
plInvoice27=function(){return null;};

/* ---------- Déclarer une facture (une ou plusieurs missions, acompte, solde, avoir) ---------- */
function markBilled27(key,excId){
 if(excId)key='X|'+excId;
 const c=keyClient27(key);if(!c)return toast('Élément introuvable.');
 const items=toBill27().filter(x=>x.c.id===c.id);if(!items.some(x=>x.key===key))items.unshift({key,c,label:keyLabel27(key),amount:billState27(key).rest||expected27(key),src:''});
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal" style="width:min(720px,96vw)"><div class="modalHead"><div><h3>Déclarer une facture · ${esc(c.name)}</h3><div class="sub">Information déclarée dans le CRM, en attente de la facture Pennylane (rapprochement par numéro, ou à valider).</div></div><button class="btn secondary" onclick="closeModal()">Fermer</button></div><div class="modalBody">
  <div class="formGrid"><div class="field"><label>Type</label><select id="bf_type" onchange="billTotal27()">${BILL_TYPES27.map(t=>`<option>${t}</option>`).join('')}</select></div>
  <div class="field"><label>Numéro de facture</label><input id="bf_num" placeholder="Ex. : F-2026-0123"></div>
  <div class="field"><label>Date</label><input id="bf_date" type="date" value="${today27()}"></div></div>
  <h4 style="margin:12px 0 6px">Missions couvertes (montant HT affecté)</h4>
  <table class="miniTable27" style="width:100%"><tbody>${items.map(x=>`<tr><td style="width:28px"><input type="checkbox" class="bf_item" data-key="${esc(x.key)}" ${x.key===key?'checked':''} onchange="billTotal27()"></td><td>${esc(x.label)} <span class="sub">· reste ${euro(x.amount)}</span></td><td style="width:140px"><input class="bf_amt" data-key="${esc(x.key)}" type="number" step="0.01" value="${x.amount||''}" oninput="billTotal27()" style="width:130px"></td></tr>`).join('')}</tbody></table>
  <p class="sub" id="bf_total"></p></div>
 <div class="modalFooter" style="display:flex;justify-content:flex-end"><button class="btn green" onclick="saveBill27('${esc(c.id)}')">Enregistrer la facture</button></div></div></div>`;
 billTotal27();
}
function billLines27(){const out=[];document.querySelectorAll('.bf_item:checked').forEach(cb=>{const a=document.querySelector(`.bf_amt[data-key="${CSS.escape(cb.dataset.key)}"]`);out.push({key:cb.dataset.key,ht:round27(a?.value)});});return out;}
function billTotal27(){const l=billLines27(),av=document.getElementById('bf_type')?.value==='Avoir',t=l.reduce((s,x)=>s+x.ht,0),el=document.getElementById('bf_total');if(el)el.textContent=`Total ${av?'de l’avoir':'de la facture'} : ${euro(av?-t:t)} HT (${l.length} mission(s))`;}
function saveBill27(cid){
allocCache27=null; const c=cfind(cid),g=k=>document.getElementById('bf_'+k)?.value.trim()||'',lines=billLines27(),type=g('type')||'Facture';
 if(!c)return;if(!lines.length)return toast('Coche au moins une mission.');
 if(lines.some(l=>!Number.isFinite(l.ht)||l.ht<=0))return toast('Indique un montant HT positif pour chaque mission cochée.');
 const date=g('date')||today27();if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return toast('Date invalide.');
 const sign=type==='Avoir'?-1:1,alloc=lines.map(l=>({key:l.key,ht:sign*l.ht})),ht=round27(alloc.reduce((s,a)=>s+a.ht,0)),num=g('num');
 state.invoices.push({id:uid('I'),client:c.id,type,label:(num?num+' · ':'')+(type!=='Facture'?type+' · ':'')+lines.map(l=>keyLabel27(l.key)).join(', '),number:num,date,ht,source:'manual',declared:true,alloc,createdBy:shared25.user?.username||'',createdAt:new Date().toISOString()});
 log25(type+' déclarée',c.id,`${num||'sans numéro'} · ${euro(ht)} HT · ${lines.map(l=>keyLabel27(l.key)).join(', ')}`);
 closeModal();persist25();toast(type+' enregistrée dans « Factures émises » (déclarée, en attente de Pennylane)');
}
function delInvoice27(id){
allocCache27=null; const i=state.invoices.find(x=>x.id===id);if(!i||i.source==='pennylane')return;
 if(!confirm('Supprimer cette facture déclarée dans le CRM ? Les missions concernées reviendront dans « À facturer ».'))return;
 state.invoices=state.invoices.filter(x=>x.id!==id);
 log25('Facture déclarée supprimée',i.client,i.label);persist25();
}
function markExcBilled27(id){return markBilled27(null,id);}
/* Affecter une facture Pennylane à la main (sans proposition) : choix de la mission et du montant. */
function assignPl27(invId){
 const inv=plFind27(invId);if(!inv)return;const left=round27(Number(inv.amount||0)-plAllocated27(invId));
 const items=billableItems27().filter(x=>x.c.id===inv.client);
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal" style="width:min(640px,96vw)"><div class="modalHead"><div><h3>Affecter ${esc(inv.number||'la facture')}</h3><div class="sub">${datefr(inv.date)} · ${euro(inv.amount)} HT · reste à affecter ${euro(left)}</div></div><button class="btn secondary" onclick="closeModal()">Fermer</button></div><div class="modalBody">
 ${items.length?`<div class="formGrid"><div class="field" style="grid-column:1/-1"><label>Mission</label><select id="as_key">${items.map(x=>`<option value="${esc(x.key)}">${esc(x.label)} — reste ${euro(billState27(x.key).rest)}</option>`).join('')}</select></div><div class="field"><label>Montant HT affecté</label><input id="as_ht" type="number" step="0.01" value="${left}"></div></div>`:'<div class="sub">Aucune mission facturable pour ce client.</div>'}</div>
 <div class="modalFooter" style="display:flex;justify-content:flex-end">${items.length?`<button class="btn green" onclick="confirmLink27('${esc(invId)}',document.getElementById('as_key').value,Number(document.getElementById('as_ht').value));closeModal();render()">Affecter</button>`:''}</div></div></div>`;
}

/* ---------- Page ---------- */
function billingPage27(){
 const b=billingKey27(),f=['Année en cours','Toutes'].includes(b.filter)?b.filter:'Année en cours',y=String(new Date().getFullYear()),mo=today27().slice(0,7);
 const cache=allocs27(),list=toBill27(),gaps=feeGaps27(),sugg=suggestions27();
 const inv=(state.invoices||[]).filter(i=>i.status!=='Annulée').sort((a,c)=>String(c.date||'').localeCompare(String(a.date||''))),shown=f==='Toutes'?inv:inv.filter(i=>String(i.date).startsWith(y));
 const countable=inv.filter(i=>!(i.source==='manual'&&i.reconciled)),yearInv=countable.filter(i=>String(i.date).startsWith(y));
 const sumKnown=l=>l.reduce((s,i)=>s+(invHT27(i)??0),0),unknownN=yearInv.filter(i=>invHT27(i)==null).length,declN=yearInv.filter(i=>i.source==='manual').length;
 const allocOf=i=>i.source==='pennylane'?(b.links[i.id]||[]):i.reconciled?[]:Array.isArray(i.alloc)?i.alloc:i.origin?[{key:i.origin,ht:invHT27(i)}]:[];
 const stateOf=i=>{if(i.source==='manual')return i.reconciled?['Rapprochée '+(i.reconciled.number||''),'green']:['Déclarée · en attente Pennylane','orange'];const left=round27(Number(invHT27(i)??0)-plAllocated27(i.id));return (b.links[i.id]||[]).length?(Math.abs(left)>0.5?['Pennylane · reste '+euro(left)+' à affecter','orange']:['Pennylane · affectée','green']):['Pennylane · non affectée','blue'];};
 return `<div class="titleRow"><div><h1>Facturation</h1><div class="sub">Mission facturable → facture (déclarée ou émise dans Pennylane) → rapprochement confirmé. Aucun rapprochement n’est fait sur un simple montant voisin : il est proposé ci-dessous et validé par toi. Les encaissements se suivent dans Pennylane.</div></div>
 <div class="v25actions"><button class="btn small secondary" onclick="syncInvoices27()">↻ Synchroniser Pennylane</button><a class="btn small light" href="https://app.pennylane.com/" target="_blank" rel="noopener">Ouvrir Pennylane</a></div></div>
 <div class="cards" style="grid-template-columns:repeat(4,1fr)"><div class="card"><small>Reste à facturer (HT)</small><span class="big ${list.length?'bad':'good'}">${euro(list.reduce((a,x)=>a+x.amount,0))}</span><div class="sub">${list.length} prestation(s), tous exercices</div></div><div class="card"><small>Rapprochements à valider</small><span class="big ${sugg.length?'warn':'good'}">${sugg.length}</span></div><div class="card"><small>Écarts d’honoraires à vérifier</small><span class="big ${gaps.length?'warn':'good'}">${gaps.length}</span></div><div class="card"><small>Facturé ${y} (HT)</small><span class="big">${euro(sumKnown(yearInv))}</span><div class="sub">ce mois : ${euro(sumKnown(yearInv.filter(i=>String(i.date).startsWith(mo))))}${declN?` · dont ${declN} déclarée(s) CRM`:''}${unknownN?` · ${unknownN} HT inconnu`:''}</div></div></div>
 ${state.pennylaneSync?.lastSync?'':'<div class="note" style="margin-bottom:12px">Pennylane n’est pas encore synchronisé : aucune facture émise n’est connue et les écarts d’honoraires ne sont pas calculés.</div>'}
 ${sugg.length?`<div class="panel"><div class="panelHead"><h3>Rapprochements à valider</h3><div class="v25actions"><span class="sub">Correspondances possibles, jamais appliquées sans ta confirmation</span>${exactSuggestions27().length?`<button class="btn small green" onclick="confirmExact27()">Confirmer les ${exactSuggestions27().length} sans ambiguïté…</button>`:''}</div></div><table><thead><tr><th>Client</th><th>Facture Pennylane</th><th>Proposé pour</th><th>Motif</th><th style="text-align:right">Montant affecté</th><th></th></tr></thead><tbody>${sugg.map((s,n)=>s.kind==='pl'?`<tr><td><b>${esc(s.it.c.name)}</b></td><td>${esc(s.inv.number||'—')} <span class="sub">· ${datefr(s.inv.date)} · ${euro(s.inv.amount)} HT${Math.abs(s.left-s.inv.amount)>0.5?' · reste '+euro(s.left):''}</span></td><td>${esc(s.it.label)} <span class="sub">· reste ${euro(s.it.amount)}</span></td><td class="sub">${esc(s.why)}</td><td style="text-align:right"><input id="sg_${n}" type="number" step="0.01" value="${s.ht}" style="width:110px"></td><td style="white-space:nowrap"><button class="btn small green" onclick="confirmLink27('${esc(s.inv.id)}','${esc(s.key)}',Number(document.getElementById('sg_${n}').value))">Confirmer</button> <button class="btn small secondary" onclick="rejectLink27('${esc(s.inv.id)}','${esc(s.key)}')">Écarter</button></td></tr>`:`<tr><td><b>${esc(cfind(s.m.client)?.name||'')}</b></td><td>${esc(s.inv.number||'—')} <span class="sub">· ${datefr(s.inv.date)} · ${euro(s.inv.amount)} HT</span></td><td>Saisie CRM ${esc(s.m.number||s.m.label)} <span class="sub">· ${euro(invHT27(s.m))} HT</span></td><td class="sub">${esc(s.why)}</td><td></td><td style="white-space:nowrap"><button class="btn small green" onclick="reconcileManual27('${esc(s.m.id)}','${esc(s.inv.id)}');persist25()">C’est la même</button> <button class="btn small secondary" onclick="rejectLink27('${esc(s.inv.id)}','M|${esc(s.m.id)}')">Écarter</button></td></tr>`).join('')}</tbody></table></div>`:''}
 <div class="panel"><div class="panelHead"><h3>Prestations à facturer</h3><span class="sub">Missions terminées, tous exercices · une facture peut couvrir plusieurs missions</span></div><table><thead><tr><th>Client</th><th>Origine</th><th>Objet</th><th style="text-align:right">Prévu HT</th><th style="text-align:right">Déjà facturé</th><th style="text-align:right">Reste HT</th><th></th></tr></thead><tbody>${list.map(x=>`<tr><td><b><a href="#" onclick="event.preventDefault();openClient('${x.c.id}')">${esc(x.c.name)}</a></b></td><td><a href="#" onclick="event.preventDefault();routePage('${x.page}')">${esc(x.src)}</a></td><td>${esc(x.label)}${x.state.label==='Partiellement facturé'?' <span class="badge orange">Partiel</span>':''}</td><td style="text-align:right">${x.state.exp?euro(x.state.exp):'<span class="sub">honoraires à renseigner</span>'}</td><td style="text-align:right">${x.state.billed?euro(x.state.billed):''}</td><td style="text-align:right"><b>${euro(x.amount)}</b></td><td style="text-align:right"><button class="btn small light" onclick="markBilled27('${x.key}')">Déclarer une facture</button></td></tr>`).join('')||'<tr><td colspan="7" class="sub">Rien à facturer pour l’instant.</td></tr>'}</tbody></table></div>
 ${gaps.length?`<div class="panel"><div class="panelHead"><h3>Écarts d’honoraires à vérifier</h3><span class="sub">Honoraires courants facturés dans Pennylane inférieurs au prorata du budget : à analyser, ce n’est pas automatiquement une facture à émettre</span></div><table><thead><tr><th>Client</th><th>Constat</th><th style="text-align:right">Écart HT</th><th></th></tr></thead><tbody>${gaps.map(x=>`<tr><td><b><a href="#" onclick="event.preventDefault();openClient('${x.c.id}')">${esc(x.c.name)}</a></b></td><td>${esc(x.label)}</td><td style="text-align:right">${euro(x.amount)}</td><td style="text-align:right"><button class="btn small secondary" onclick="routePage('fees')">Analyser</button> <button class="btn small light" onclick="gapChecked27('${x.key}')">Vérifié</button></td></tr>`).join('')}</tbody></table></div>`:''}
 <div class="panel"><div class="panelHead"><h3>Factures émises</h3><div class="v25actions">${['Année en cours','Toutes'].map(o=>`<button class="btn small ${f===o?'':'secondary'}" onclick="billingKey27().filter='${o}';save();render()">${o}</button>`).join('')}</div></div><table><thead><tr><th>Client</th><th>Facture</th><th>Date</th><th>État</th><th>Missions couvertes</th><th style="text-align:right">Montant HT</th><th></th></tr></thead><tbody>${shown.slice(0,400).map(i=>{const [st,col]=stateOf(i),al=allocOf(i);return `<tr style="${i.reconciled?'opacity:.6':''}"><td><b><a href="#" onclick="event.preventDefault();openClient('${i.client}')">${esc(cfind(i.client)?.name||'—')}</a></b></td><td>${esc(i.label||'')}</td><td>${datefr(i.date)}</td><td><span class="badge ${col}">${esc(st)}</span></td><td class="sub">${al.map(a=>esc(keyLabel27(a.key))+(a.ht!=null?' ('+euro(a.ht)+')':'')+(i.source==='pennylane'?` <a href="#" title="Annuler ce rapprochement" onclick="event.preventDefault();unlink27('${esc(i.id)}','${esc(a.key)}')">×</a>`:'')).join('<br>')}</td><td style="text-align:right">${htTxt27(invHT27(i))}</td><td style="text-align:right;white-space:nowrap">${i.source==='pennylane'?`<button class="btn small light" onclick="assignPl27('${esc(i.id)}')">Affecter</button>`:i.reconciled?'':`<button class="btn small secondary" title="Supprimer la facture déclarée" onclick="delInvoice27('${i.id}')">×</button>`}</td></tr>`;}).join('')||'<tr><td colspan="7" class="sub">Aucune facture.</td></tr>'}</tbody></table></div>`;
}
billing=billingPage27;

/* ---------- Bilan, AGO, travaux exceptionnels : état de facturation issu des rapprochements ---------- */
const previousCtxBilling27=ctx27;
ctx27=function(kind,c,y){
 const x=previousCtxBilling27(kind,c,y);
 if(kind==='bilan'||kind==='ago'){const s=billState27((kind==='bilan'?'B|':'J|')+c.id+'|'+y),v=['Facturé','Facturé (déclaré)'].includes(s.label)?{number:s.refs.join(', ')||s.label,date:''}:null;if(kind==='bilan')x.invB=v;else x.invJ=v;}
 return x;
};
function excInvoices27(){const map={},cache=allocs27();for(const w of exc27().items){const s=billState27('X|'+w.id,cache);if(s.label!=='À facturer')map[w.id]=s;}return map;}
function excBilling27(w,s){
 if(w.included==='Oui')return {label:'Inclus au forfait'};
 s=s||billState27('X|'+w.id);
 if(s.label!=='À facturer')return {label:s.label,ref:s.refs.join(', ')||(s.label==='Partiellement facturé'?'reste '+euro(s.rest):'')};
 if(w.statut==='Terminé'||w.lancerFact==='Oui')return {label:'À facturer'};
 return {label:'—'};
}
// Toute modification enregistrée invalide le cache des affectations.
const previousSaveBilling27=save;
save=function(){allocCache27=null;return previousSaveBilling27.apply(this,arguments);};

/* ---------- Contrôle : missions dont le statut de facturation n'est pas renseigné ----------
 * Bilan, Juridique annuel / AGO et travaux exceptionnels concernés, terminés ou non, sans « Lancer facturation »
 * choisi (Oui / Non). But : ne pas oublier de décider si une mission réalisée est à facturer. */
const BILLCTL_BLANK27=v=>v==null||v===''||v==='-';
function billControl27(){
 const out=[];
 for(const y of billYears27())for(const c of state.clients){
  if(['Inactif','Compromis'].includes(c.status))continue;
  for(const [kind,label,page] of [['bilan','Bilan','closing'],['ago','Juridique annuel / AGO','legal']]){
   const x=ctx27(kind,c,y),g=group27(x);if(g==='Non concernés')continue;
   if(!BILLCTL_BLANK27(row27(kind,c.id,y).lancerFact))continue;
   out.push({kind,c,y,id:'',label:`${label} ${y}`,page,done:g==='Terminés',status:kind==='bilan'?val27(x,'etat'):val27(x,'statut')});
  }
 }
 for(const w of exc27().items){const c=cfind(w.client);if(!c||w.included==='Oui'||!BILLCTL_BLANK27(w.lancerFact))continue;
  out.push({kind:'exc',c,y:excYear27(w),id:w.id,label:w.name||'Travail exceptionnel',page:'exceptional',done:w.statut==='Terminé',status:w.statut||'—'});}
 return out.sort((a,b)=>Number(b.done)-Number(a.done)||String(b.y).localeCompare(String(a.y))||a.c.name.localeCompare(b.c.name));
}
function setBillCtl27(kind,cid,y,id,v){
 if(!v)return;
 if(kind==='exc'){const w=exc27().items.find(x=>x.id===id);if(!w)return;w.lancerFact=v;}
 else row27(kind,cid,Number(y),true).lancerFact=v;
 log25('Contrôle facturation · lancer facturation',cid,v);save();render();
 toast(v==='Oui'?'Mission marquée à facturer':'Mission marquée non facturable');
}
function billControlPanel27(){
 const b=billingKey27(),all=billControl27(),onlyDone=b.ctlDone!==false,list=onlyDone?all.filter(x=>x.done):all,nDone=all.filter(x=>x.done).length;
 const btn=(on,l,v)=>`<button class="btn small ${on?'':'secondary'}" onclick="billingKey27().ctlDone=${v};save();render()">${l}</button>`;
 return `<div class="panel billCtl27"><div class="panelHead"><div><h3>Contrôle : statut de facturation à renseigner <span class="badge ${nDone?'red':'green'}">${nDone} terminée(s)</span> <span class="badge gray">${all.length-nDone} en cours</span></h3><div class="sub">Missions des onglets Bilan, Juridique annuel / AGO et Travaux exceptionnels dont « Lancer facturation » n’est pas renseigné. Choisis Oui (à facturer) ou Non : les missions « Oui » terminées passent dans « Prestations à facturer ».</div></div><div class="v25actions">${btn(onlyDone,'Terminées',true)}${btn(!onlyDone,'Toutes',false)}</div></div>
 <table><thead><tr><th>Client</th><th>Mission</th><th>Exercice</th><th>Avancement</th><th>Lancer facturation</th><th></th></tr></thead><tbody>${list.slice(0,300).map(x=>`<tr><td><b>${esc(x.c.name)}</b></td><td>${esc(x.label)}</td><td>${esc(String(x.y||''))}</td><td><span class="badge ${x.done?'green':'orange'}">${x.done?'Terminée':'En cours'}</span> <span class="sub">${esc(x.status||'')}</span></td><td><select class="cell27" aria-label="Lancer facturation" onchange="setBillCtl27('${x.kind}','${x.c.id}','${x.y}','${x.id}',this.value)"><option value="">À renseigner</option><option>Oui</option><option>Non</option></select></td><td><button class="btn small light" onclick="routePage('${x.page}')">Ouvrir l’onglet</button></td></tr>`).join('')||`<tr><td colspan="6" class="sub">${onlyDone?'Aucune mission terminée sans statut de facturation.':'Toutes les missions ont un statut de facturation.'}</td></tr>`}</tbody></table>${list.length>300?`<div class="panelBody sub">300 premières lignes affichées sur ${list.length}.</div>`:''}</div>`;
}
billing=function(){
 const html=billingPage27(),mark='<div class="panel"><div class="panelHead"><h3>Factures émises';
 return html.includes(mark)?html.replace(mark,billControlPanel27()+mark):html+billControlPanel27();
};
