/* RB Partners V27 — Travaux exceptionnels (modèle « Autres travaux »), Facturation automatique et Tableau de bord
 * calculé uniquement à partir des données réelles du CRM (aucun montant de démonstration). */

/* ---------- Travaux exceptionnels ---------- */
const EXC_TYPES27=['Comptabilité','Juridique','Fiscalité','Conseil','Social','RH','Évaluation','Autre'];
const EXC_STATUS27=['A faire','En cours','En attente client','A revoir','Terminé'];
function exc27(){if(!state.exc27)state.exc27={items:[],year:new Date().getFullYear(),q:''};return state.exc27;}
function excYear27(w){return Number(String(w.date||w.created||'').slice(0,4))||new Date().getFullYear();}
/* Facturation des travaux : voir v27_billing.js (excInvoices27, excBilling27). */
function setExc27(el,id,k){
 const w=exc27().items.find(x=>x.id===id);if(!w)return;
 let v=el.value;if(['fees','time'].includes(k))v=v===''?'':Number(v);
 if(k==='client'){const c=state.clients.find(x=>x.name===v);if(!c)return toast('Client introuvable : choisis un nom de la liste.');v=c.id;}
 w[k]=v;
 if(k==='statut'&&v==='Terminé'&&w.lancerFact!=='Non'){w.lancerFact='Oui';w.doneAt=w.doneAt||today27();toast('Travail terminé : il apparaît dans Facturation › À facturer');}
 log25('Travail exceptionnel · '+k,w.client,String(v));
 save();if(['statut','lancerFact','client','date','fees','factStatus','included'].includes(k))render();else if(el.tagName==='SELECT')el.style.background=color27(v);
}
function delExc27(id){const e=exc27(),w=e.items.find(x=>x.id===id);if(!w||!confirm('Supprimer « '+w.name+' » ?'))return;e.items=e.items.filter(x=>x.id!==id);log25('Travail exceptionnel supprimé',w.client,w.name);persist25();}
function newExcDialog27(){
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal" style="width:min(720px,96vw)"><div class="modalHead"><h3>Nouveau travail exceptionnel</h3><button class="btn secondary" onclick="closeModal()">Fermer</button></div><div class="modalBody">
 <datalist id="exc_clients">${state.clients.map(c=>`<option value="${esc(c.name)}">`).join('')}</datalist>
 <div class="formGrid"><div class="field" style="grid-column:1/-1"><label>Client</label><input id="nx_client" list="exc_clients" placeholder="Nom du client"></div>
 <div class="field" style="grid-column:1/-1"><label>Intitulé</label><input id="nx_name" placeholder="Ex. : transfert de siège, évaluation, bilan de rattrapage…"></div>
 <div class="field"><label>Typologie</label><select id="nx_typo">${EXC_TYPES27.map(t=>`<option>${t}</option>`).join('')}</select></div>
 <div class="field"><label>Honoraires prévus (HT)</label><input id="nx_fees" type="number" min="0"></div>
 <div class="field"><label>Date de mission</label><input id="nx_date" type="date" value="${today27()}"></div>
 <div class="field"><label>Deadline</label><input id="nx_deadline" type="date"></div>
 <div class="field"><label>Réalisé par</label><input id="nx_realise"></div><div class="field"><label>Temps estimé (h)</label><input id="nx_time" type="number" min="0" step="0.5"></div>
 <div class="field" style="grid-column:1/-1"><label>Description</label><textarea id="nx_desc" rows="2"></textarea></div></div></div>
 <div class="modalFooter" style="display:flex;justify-content:flex-end"><button class="btn green" onclick="saveNewExc27()">Créer</button></div></div></div>`;
}
function saveNewExc27(){
 const g=k=>document.getElementById('nx_'+k).value.trim(),c=state.clients.find(x=>x.name===g('client'));
 if(!c)return toast('Choisis un client existant dans la liste.');if(!g('name'))return toast('Renseigne l’intitulé.');
 exc27().items.push({id:uid('EX'),client:c.id,name:g('name'),typo:g('typo'),fees:Number(g('fees')||0),date:g('date'),deadline:g('deadline'),realise:g('realise'),time:g('time')?Number(g('time')):'',desc:g('desc'),associe:people27(c,'associe'),statut:'A faire',lancerFact:'',created:today27()});
 log25('Travail exceptionnel créé',c.id,g('name'));closeModal();persist25();
}
function excPage27(){
 const e=exc27(),y=e.year,q=(e.q||'').toLowerCase(),inv=excInvoices27();
 const items=e.items.filter(w=>excYear27(w)===y&&(!q||[w.name,cfind(w.client)?.name,w.desc,w.typo].join(' ').toLowerCase().includes(q)));
 const groups={'En cours':[],'Terminés — à facturer':[],'Terminés et facturés':[]};
 items.forEach(w=>{const b=excBilling27(w,inv[w.id]);groups[w.statut!=='Terminé'?'En cours':/^(Facturé|Inclus)/.test(b.label)?'Terminés et facturés':'Terminés — à facturer'].push(w);});
 const colors={'En cours':C27.orange,'Terminés — à facturer':C27.red,'Terminés et facturés':C27.green};
 const sum=l=>l.reduce((a,w)=>a+Number(w.fees||0),0);
 const sel=(w,k,opts)=>`<td style="min-width:${k==='statut'?140:120}px"><select class="pill27" style="background:${color27(w[k]||'')}" onchange="setExc27(this,'${w.id}','${k}')">${(w[k]&&!opts.includes(w[k])?[w[k],...opts]:opts).map(o=>`<option ${o===(w[k]||'')?'selected':''}>${esc(o)}</option>`).join('')}${w[k]?'':'<option selected value="">—</option>'}</select></td>`;
 const inp=(w,k,type='text',wd=120)=>`<td style="min-width:${wd}px"><input class="cell27" type="${type}" ${type==='number'?'step="any"':''} value="${esc(w[k]??'')}" title="${esc(w[k]??'')}" onchange="setExc27(this,'${w.id}','${k}')"></td>`;
 const head=`<tr><th class="n27">Travail</th><th>Client</th><th>Associé</th><th>Réalisé par</th><th>Revu par</th><th>Date mission</th><th>Description</th><th>Typologie</th><th>Deadline</th><th>Honoraires prévus</th><th>Temps estimé (h)</th><th>Statut</th><th>Lancer facturation</th><th>Facturation</th><th>Statut facturation</th><th>Facture Pennylane</th></tr>`;
 const row=w=>{const c=cfind(w.client),b=excBilling27(w,inv[w.id]),late=w.deadline&&w.statut!=='Terminé'&&w.deadline<today27();
  return `<tr><td class="n27"><div class="name27"><span title="${esc(w.name)}" style="flex:1;overflow:hidden;text-overflow:ellipsis">${esc(w.name)}</span>${late?'<span class="badge red">Retard</span>':''}<button class="btn small secondary" title="Supprimer" onclick="delExc27('${w.id}')">×</button></div></td>
  <td style="min-width:170px"><input class="cell27" list="exc_clients" value="${esc(c?.name||'')}" onchange="setExc27(this,'${w.id}','client')"></td>
  ${inp(w,'associe','text',150)}${inp(w,'realise','text',140)}${inp(w,'revu','text',140)}${inp(w,'date','date',125)}${inp(w,'desc','text',220)}${sel(w,'typo',EXC_TYPES27)}
  <td style="min-width:125px" class="${late?'late27':''}"><input class="cell27" type="date" value="${esc(w.deadline||'')}" onchange="setExc27(this,'${w.id}','deadline')"></td>
  ${inp(w,'fees','number',105)}${inp(w,'time','number',95)}${sel(w,'statut',EXC_STATUS27)}${sel(w,'lancerFact',['Oui','Non'])}<td style="min-width:150px"><select class="cell27" title="Une prestation incluse au forfait n’est pas facturée en plus" onchange="setExc27(this,'${w.id}','included')">${[['','En supplément'],['Oui','Inclus au forfait']].map(([v,l])=>`<option value="${v}" ${v===(w.included||'')?'selected':''}>${l}</option>`).join('')}</select></td>
  <td style="min-width:130px">${b.label==='—'?'<span class="sub">—</span>':`<span class="pill27 static27" style="background:${/^(Facturé|Inclus)/.test(b.label)?C27.green:b.label==='Partiellement facturé'?C27.orange:C27.red}">${b.label}</span>`}</td>
  <td style="min-width:140px">${['À facturer','Partiellement facturé'].includes(b.label)?`${b.ref?'<span class="sub">'+esc(b.ref)+'</span> ':''}<button class="btn small light" onclick="markExcBilled27('${w.id}')">Déclarer une facture</button>`:b.ref?esc(b.ref):esc(b.label)}</td></tr>`;};
 return `<datalist id="exc_clients">${state.clients.map(c=>`<option value="${esc(c.name)}">`).join('')}</datalist>
 <div class="titleRow"><div><h1>Autres travaux Fr ${y}</h1><div class="sub">Travaux exceptionnels : évaluation, création, transfert de siège, rattrapage, juridique ponctuel… Un travail terminé part automatiquement dans Facturation.</div></div>
 <div class="v25actions">${[y-1,y,y+1].map(v=>`<button class="btn small ${v===y?'':'secondary'}" onclick="exc27().year=${v};save();render()">${v}</button>`).join('')}<button class="btn small" onclick="newExcDialog27()">+ Nouveau travail</button>
 <label class="btn small light">Importer un Excel<input hidden type="file" accept=".xlsx" onchange="importBoard27(this.files[0]);this.value=''"></label><button class="btn small secondary" onclick="exportExc27()">Exporter (Excel)</button></div></div>
 <div class="cards" style="grid-template-columns:repeat(4,1fr)"><div class="card"><small>Travaux ${y}</small><span class="big">${items.length}</span></div><div class="card"><small>En cours</small><span class="big warn">${groups['En cours'].length}</span><div class="sub">${euro(sum(groups['En cours']))} prévus</div></div><div class="card"><small>Terminés à facturer</small><span class="big ${groups['Terminés — à facturer'].length?'bad':'good'}">${euro(sum(groups['Terminés — à facturer']))}</span></div><div class="card"><small>Facturés</small><span class="big good">${euro(sum(groups['Terminés et facturés']))}</span></div></div>
 <div class="v25actions" style="margin-bottom:6px"><input class="mini" style="width:260px" placeholder="Rechercher travail, client, typologie" value="${esc(e.q||'')}" onchange="exc27().q=this.value;save();render()"></div>
 ${Object.entries(groups).filter(([,l])=>l.length).map(([g,l])=>{const k='exc|'+g,col=boards27().collapsed[k];return `<div class="grp27" style="color:${colors[g]}" onclick="toggleGroup27('exc','${g}')">${col?'▸':'▾'} ${g} <span class="sub">${l.length} travail(aux) · ${euro(sum(l))}</span></div>${col?'':`<div class="board27" data-k="${esc(k)}" style="--g:${colors[g]}"><table><thead>${head}</thead><tbody>${l.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).map(row).join('')}</tbody><tfoot><tr><td class="n27"><b>Total</b></td><td colspan="8"></td><td><b>${euro(sum(l))}</b></td><td colspan="5"></td></tr></tfoot></table></div>`}`;}).join('')||'<div class="panel panelBody">Aucun travail exceptionnel pour cet exercice. Crée-en un ou importe ton fichier Excel « Autres travaux ».</div>'}`;
}
function exportExc27(){
 const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"',inv=excInvoices27(),y=exc27().year;
 const lines=[['Name','Client','Associé','Réalisé par','Revu par','Date mission','Description','Typologie','Deadline','Honoraires prévus','Temps estimé','Statut','Lancer Facturation','Statut facturation','Facture'].map(q).join(';')];
 exc27().items.filter(w=>excYear27(w)===y).forEach(w=>{const b=excBilling27(w,inv[w.id]);lines.push([w.name,cfind(w.client)?.name,w.associe,w.realise,w.revu,datefr(w.date),w.desc,w.typo,datefr(w.deadline),w.fees,w.time,w.statut,w.lancerFact,b.label,b.ref].map(q).join(';'));});
 download25('Autres_travaux_Fr_'+y+'.csv','﻿'+lines.join('\r\n'),'text/csv;charset=utf-8');
}
function importExc27(rows,hi,file){
 const H=rows[hi].map(normHead27),idx=n=>H.indexOf(n),year=Number((String(rows[0]?.[0]||'')+' '+(file?.name||'')).match(/\b(20\d\d)\b/)?.[1])||exc27().year;
 const data=rows.slice(hi+1).filter(r=>r[0]&&!['name','subitems'].includes(normHead27(r[0]))&&r.slice(1).some(v=>v!=null&&v!==''));
 if(!confirm(`Importer ${data.length} travail(aux) exceptionnel(s) ${year} ?\nLes clients sont rapprochés par nom ; les absents sont créés. Un travail déjà importé (même intitulé, même client, même date) est mis à jour.`))return;
 const get=(r,n)=>{const i=idx(n);return i<0?null:r[i];},date=v=>v==null||v===''?'':typeof v==='number'?new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10):String(v).slice(0,10);
 let created=0,updated=0,newClients=0;
 for(const r of data){
  const name=String(r[0]).trim(),cname=String(get(r,'portefeuille clients')||name).split(',')[0].trim();
  const m=matchClient27(cname,'');if(m.skip)continue;
  let c=m.c;
  if(!c){c=importNewClient27(cname,'');newClients++;}
  const g=get(r,'groupe');if(g&&!c.group27)c.group27=String(g);
  const w={name,client:c.id,associe:uniqNames27(get(r,'associe')||''),realise:uniqNames27(get(r,'realise par')||''),revu:uniqNames27(get(r,'revu par')||''),date:date(get(r,'date mission'))||`${year}-01-01`,desc:String(get(r,'description')||''),typo:String(get(r,'typologie')||''),deadline:date(get(r,'deadline fin travaux - end')||get(r,'deadline fin travaux - start')),fees:Number(get(r,'honoraires prevus')||0),time:get(r,'temps estime')==null?'':Number(get(r,'temps estime')),statut:String(get(r,'statut')||'A faire'),lancerFact:String(get(r,'lancer facturation')||'')};
  if(/Facturé/.test(String(get(r,'statut facturation')||''))){w.factStatus='Facturé';w.factRef='import';}
  const ex=exc27().items.find(x=>x.client===c.id&&x.name===w.name&&x.date===w.date);
  if(ex){Object.assign(ex,w);updated++;}else{exc27().items.push({id:uid('EX'),created:today27(),...w});created++;}
 }
 exc27().year=year;state.page='exceptional';log25('Import Excel Autres travaux '+year,'',`${created} créé(s), ${updated} mis à jour`);
 init25();persist25();toast(`${data.length} travail(aux) importé(s) : ${created} créé(s), ${updated} mis à jour${newClients?', '+newClients+' client(s) créé(s)':''}`);
}
exceptional=excPage27;

/* ---------- Facturation : voir v27_billing.js ---------- */

/* ---------- Tableau de bord cabinet (temps réel) ---------- */
function dashboardPage27(){
 const y=new Date().getFullYear(),m=new Date().getMonth()+1,ex=boards27().year,t=today27();
 const act=state.clients.filter(c=>!isOnboarding27(c)&&!['Inactif','Compromis','Autres','À qualifier'].includes(c.status)),onb=state.clients.filter(isOnboarding27);
 const prosp=(state.prospects||[]).filter(p=>!['Validé','Refusé'].includes(p.stage));
 const budget=act.reduce((a,c)=>a+feeTotalClient(c)-Number(fees27(c).exceptional||0),0);
 const plYear=(state.pennylaneInvoices||[]).filter(i=>String(i.date).startsWith(y)&&i.status!=='Annulée'),factured=state.invoices.filter(i=>i.status!=='Annulée'&&!i.reconciled&&String(i.date).startsWith(y)).reduce((a,i)=>a+(invHT27(i)??0),0);
 const invY=state.invoices.filter(i=>i.status!=='Annulée'&&!i.reconciled&&String(i.date).startsWith(y)),factMonth=invY.filter(i=>String(i.date).startsWith(t.slice(0,7))).reduce((a,i)=>a+(invHT27(i)??0),0);
 const bill=toBill27(),billSum=bill.reduce((a,x)=>a+x.amount,0);
 const prod=kind=>{const l=state.clients.map(c=>ctx27(kind,c,ex)).filter(x=>group27(x)!=='Non concernés');return {n:l.length,done:l.filter(x=>group27(x)==='Terminés').length,late:l.filter(x=>urgency27(x)?.level==='retard').length};};
 const B=prod('bilan'),A=prod('ago');
 let fT=0,fD=0,fL=0;fiscClients27().filter(c=>c.status!=='Inactif').forEach(c=>{const r=row27('fiscm',c.id,y);obligations27(c,y).filter(o=>o.m===m).forEach(o=>{fT++;const s=r[o.key]||o.def;if(fiscDone27(o,s))fD++;else if(o.due<t)fL++;});});
 const excOpen=exc27().items.filter(w=>w.statut!=='Terminé');
 const onbLate=onb.filter(c=>urgency27(ctx27('onb',c,0))?.level==='retard').length;
 const alerts=[...boardAlerts27().map(a=>({lvl:a.u?.level==='retard'?'red':'orange',txt:`${a.x.c.name} — ${a.title}`,sub:a.detail,page:a.kind.includes('ago')?'legal':a.kind.startsWith('F')?'billing':'closing'})),
  ...(fL?[{lvl:'red',txt:`${fL} déclaration(s) fiscale(s) de ${MONTHS27[m-1].toLowerCase()} en retard`,sub:'Fiscalité › '+MONTHS27[m-1],page:'fiscal'}]:[]),
  ...(onbLate?[{lvl:'orange',txt:`${onbLate} onboarding(s) au-delà de la deadline`,sub:'Onboarding',page:'onboarding'}]:[]),
  ...excOpen.filter(w=>w.deadline&&w.deadline<t).map(w=>({lvl:'red',txt:`${cfind(w.client)?.name||''} — ${w.name} en retard`,sub:'Travaux exceptionnels · deadline '+datefr(w.deadline),page:'exceptional'})),
];
 const stages=['Nouveau','RDV à planifier','RDV réalisé','Proposition envoyée','Négociation'];
 const card=(l,v,cls,sub,page)=>`<div class="card" ${page?`style="cursor:pointer" onclick="routePage('${page}')"`:''}><small>${l}</small><span class="big ${cls||''}">${v}</span>${sub?`<div class="sub">${sub}</div>`:''}</div>`;
 const bar=(d,n,late)=>`<div class="bar27" style="margin:6px 0"><i style="width:${n?d/n*100:0}%;background:${C27.green}"></i></div><div class="sub">${d} / ${n} terminés${late?` · <span class="bad">${late} en retard</span>`:''}</div>`;
 return `<div class="titleRow"><div><h1>Tableau de bord cabinet</h1><div class="sub">Calculé en temps réel à partir des tableaux du CRM et des factures Pennylane — ${new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}.</div></div>${state.pennylaneSync?.lastSync?`<span class="sub">Pennylane synchronisé le ${new Date(state.pennylaneSync.lastSync).toLocaleString('fr-FR')}</span>`:'<span class="badge orange">Pennylane non synchronisé</span>'}</div>
 <div class="cards" style="grid-template-columns:repeat(4,1fr)">${card('Clients actifs',act.length,'','',  'clients')}${card('Onboarding en cours',onb.length,onb.length?'warn':'',onbLate?onbLate+' en retard':'','onboarding')}${card('Prospects en cours',prosp.length,'',euro(prosp.reduce((a,p)=>a+Number(p.value||0),0))+' estimés','prospects')}${card('Honoraires annuels (actifs)',euro(budget),'','budget du portefeuille','clients')}</div>
 <div class="cards" style="grid-template-columns:repeat(4,1fr)">${card('Facturé '+y+' (HT)',euro(factured),'','Pennylane + saisies CRM','billing')}${card('À facturer',euro(billSum),billSum?'bad':'good',bill.length+' élément(s)','billing')}${card('Facturé ce mois (HT)',euro(factMonth),'','','billing')}${card('Factures émises '+y,invY.length,'',invY.filter(i=>i.source==='manual').length+' saisie(s) CRM','billing')}</div>
 <div class="grid2"><div class="panel"><div class="panelHead"><h3>Production — exercice ${ex}</h3><span class="sub">Fiscalité : ${MONTHS27[m-1].toLowerCase()} ${y}</span></div><div class="panelBody">
  <div class="kpiLine" style="display:block;cursor:pointer" onclick="routePage('closing')"><b>Bilans</b>${bar(B.done,B.n,B.late)}</div>
  <div class="kpiLine" style="display:block;cursor:pointer" onclick="routePage('legal')"><b>Juridique annuel / AGO</b>${bar(A.done,A.n,A.late)}</div>
  <div class="kpiLine" style="display:block;cursor:pointer" onclick="routePage('fiscal')"><b>Déclarations fiscales du mois</b>${bar(fD,fT,fL)}</div>
  <div class="kpiLine" style="cursor:pointer" onclick="routePage('exceptional')"><b>Travaux exceptionnels en cours</b><span>${excOpen.length} · ${euro(excOpen.reduce((a,w)=>a+Number(w.fees||0),0))}</span></div></div></div>
 <div class="panel"><div class="panelHead"><h3>Pipeline prospects</h3><button class="btn small light" onclick="routePage('prospects')">Ouvrir</button></div><div class="panelBody">${stages.map(s=>{const l=prosp.filter(p=>p.stage===s);return `<div class="kpiLine"><span>${s}</span><b>${l.length} · ${euro(l.reduce((a,p)=>a+Number(p.value||0),0))}</b></div>`;}).join('')}</div></div></div>
 <div class="panel"><div class="panelHead"><h3>À traiter en priorité</h3><span class="sub">${alerts.length} point(s)</span></div><div class="panelBody">${alerts.slice(0,15).map(a=>`<div class="kpiLine" style="cursor:pointer" onclick="routePage('${a.page}')"><div><span class="badge ${a.lvl}">${a.lvl==='red'?'Retard':'À surveiller'}</span> <b>${esc(a.txt)}</b><div class="sub">${esc(a.sub||'')}</div></div><span class="sub">Ouvrir ›</span></div>`).join('')||'<div class="sub">Aucun retard : tout est à jour.</div>'}${alerts.length>15?`<div class="sub" style="margin-top:6px">… et ${alerts.length-15} autre(s)</div>`:''}</div></div>`;
}
cabinetDashboardV24=dashboardPage27;

/* ---------- Navigation : Boîte documents retirée, bandeau « Module historique » supprimé partout ---------- */
REMOVED_PAGES27.push('docs');
document.querySelectorAll('.nav a[data-page="docs"]').forEach(a=>a.remove());
const previousRenderCabinet27=render;
render=function(){
 if(REMOVED_PAGES27.includes(state.page))state.page='cabinetdash';
 // Factures de démonstration injectées par la maquette d'origine : seules les factures réellement synchronisées comptent.
 if(Array.isArray(state.pennylaneInvoices)&&state.pennylaneInvoices.some(i=>i.source!=='pennylane'))state.pennylaneInvoices=state.pennylaneInvoices.filter(i=>i.source==='pennylane');
 previousRenderCabinet27();
 document.querySelectorAll('#root > .note').forEach(el=>{if(el.textContent.startsWith('Module historique'))el.remove();});
};
