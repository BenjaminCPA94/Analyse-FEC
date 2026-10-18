/* RB Partners V27 — Lot 4 : processus.
 *  - Calendrier fiscal : échéance officielle reportée au premier jour ouvré (week-ends et jours fériés), date cible
 *    interne distincte, règles versionnées par campagne avec leurs sources, à valider par le cabinet (sinon les dates
 *    sont affichées comme non certifiées) ; missions avec dates de début et de fin ; premier exercice atypique.
 *  - Parcours d'entrée : acceptation du dossier → mise en place → actif ; étapes adaptées au profil du dossier.
 *  - Sortie d'un client : dernières obligations, travaux et facturation restants, transmission, accès, archivage.
 *  - Relances : brouillon de relance consolidé par client (pièces et éléments attendus), validé et envoyé par un humain. */

/* ---------- Jours ouvrés ---------- */
function easter27(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;return new Date(Date.UTC(y,mo-1,da));}
const holidayCache27={};
function holidays27(y){
 if(holidayCache27[y])return holidayCache27[y];
 const e=easter27(y),plus=n=>{const d=new Date(e);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 return holidayCache27[y]=new Set([`${y}-01-01`,`${y}-05-01`,`${y}-05-08`,`${y}-07-14`,`${y}-08-15`,`${y}-11-01`,`${y}-11-11`,`${y}-12-25`,plus(1),plus(39),plus(50)]);
}
function businessDay27(d){if(!d)return d;const x=new Date(d+'T12:00:00Z');for(let i=0;i<10;i++){const s=x.toISOString().slice(0,10),w=x.getUTCDay();if(w!==0&&w!==6&&!holidays27(x.getUTCFullYear()).has(s))return s;x.setUTCDate(x.getUTCDate()+1);}return d;}

/* ---------- Règles du calendrier (version de campagne, sources, validation) ---------- */
const FISC_RULES27={version:'2026',sources:[['Calendrier fiscal des professionnels','https://www.impots.gouv.fr/professionnel/calendrier-fiscal'],['BOFiP — impôts','https://bofip.impots.gouv.fr/']],
 rules:[['TVA (mensuelle, trimestrielle)','Jour du mois propre au dossier (selon SIREN), défaut 24 ; trimestrielle : mois suivant le trimestre'],['CA12 et acomptes','Solde début mai (2e jour ouvré suivant le 1er mai), acomptes juillet et décembre'],['Acomptes d’IS','15 mars, 15 juin, 15 septembre, 15 décembre (exercice civil)'],['CFE','Acompte 15 juin si CFE N-1 ≥ 3 000 €, solde 15 décembre'],['CVAE','Acomptes 15 juin et 15 septembre selon le seuil de l’année'],['Taxe sur les salaires','Mensuelle, trimestrielle ou annuelle selon le montant N-1, avec la TVA'],['TVS / taxes véhicules','Avec la déclaration de TVA de janvier (régime réel) ou CA12'],['IFU / DAS2','Mi-février'],['DES / EMEBI','DES : 10e jour ouvré du mois suivant ; EMEBI : selon le calendrier des douanes'],['Taxe foncière, CRL','Taxe foncière mi-octobre (paiement), CRL avec la déclaration de résultats']],
 note:'Les jours d’échéance propres à chaque dossier priment. Les règles générales sont à vérifier chaque année avant validation.'};
function rulesState27(){return state.fiscRules27=state.fiscRules27||{};}
function rulesValidated27(){return rulesState27()[FISC_RULES27.version]?.at;}
function validateRules27(){
 if(shared25.active&&!['admin','associe'].includes(shared25.user?.role))return alert('Validation réservée aux associés et administrateurs.');
 rulesState27()[FISC_RULES27.version]={at:new Date().toISOString(),by:shared25.user?.username||''};log25('Calendrier fiscal validé','',FISC_RULES27.version);persist25();
}
function leadDays27(){return Number(state.settings27?.leadFiscal??3);}

/* ---------- Échéances : jour ouvré, date cible, dates de mission, sortie ---------- */
function missionWindow27(c,k){const d=c.missionDates27?.[k]||{},end=c.exit27?.endDate&&(!d.to||c.exit27.endDate<d.to)?c.exit27.endDate:d.to;return {from:d.from||'',to:end||''};}
const previousObligationsProc27=obligations27;
obligations27=function(c,y){
 const w=missionWindow27(c,'tax');
 return previousObligationsProc27(c,y).filter(o=>{const start=`${y}-${pad27(o.m)}-01`;return (!w.to||start<=w.to)&&(!w.from||`${y}-${pad27(o.m)}-31`>=w.from);}).map(o=>{const off=businessDay27(o.due);return {...o,dueRule:o.due,due:off,dueOfficial:off,target:minusDays27(off,leadDays27()),certified:Boolean(rulesValidated27())};});
};
// Premier exercice atypique : la clôture saisie (création, reprise) s'applique à l'année de cette clôture.
const previousCloseOfProc27=closeOf27;
closeOf27=function(c,y){if(c.firstClose27&&/^\d{4}-\d{2}-\d{2}$/.test(c.firstClose27)&&Number(c.firstClose27.slice(0,4))===y)return new Date(c.firstClose27+'T12:00:00');return previousCloseOfProc27(c,y);};

/* ---------- Parcours d'entrée et profil du dossier ---------- */
const PROFILE_NA27={'Création':[1],'SCI / patrimonial':[]};
const previousOnbAuto27=onbAuto27;
onbAuto27=function(c,i){if((PROFILE_NA27[profile27(c).kind]||[]).includes(i))return 'NA';return previousOnbAuto27(c,i);};
function onbPhase27(c){const ok=i=>['Fait','NA'].includes(onbStep27(c,i));if(!ok(0)||!ok(10))return 'Acceptation du dossier';if(onbMissing27(c).blocking.length||onbMissing27(c).other.length)return 'Mise en place';return 'Prêt à activer';}
const previousOnbRow27=onbRow27;
onbRow27=function(x){const ph=onbPhase27(x.c);return previousOnbRow27(x).replace('<div class="onbName27">',`<div class="onbName27"><span class="badge ${ph==='Prêt à activer'?'green':ph==='Mise en place'?'orange':'blue'}" style="margin-bottom:2px">${ph}${profile27(x.c).kind?' · '+esc(profile27(x.c).kind):''}</span>`);};

/* ---------- Sortie d'un client ---------- */
const EXIT_STEPS27=[['obligations','Dernières obligations traitées (déclarations, bilan, AGO de la période couverte)'],['billing','Travaux et facturation restants réglés'],['transfer','Éléments transmis au client ou au confrère successeur'],['access','Accès retirés (Pennylane, mandats impots.gouv, banques)'],['archive','Dossier archivé (pièces et papiers de travail)']];
function exitTab27(c){
 const e=c.exit27;
 if(!e)return `<div class="panel panelBody"><h3 style="margin-top:0">Sortie du client</h3><p class="sub">Démarre la sortie quand la fin de mission est décidée : les échéances après la date de fin ne sont plus générées et la liste de contrôle ci-dessous guide la clôture.</p><div class="formGrid"><div class="field"><label>Date de fin de mission</label><input id="ex_end" type="date"></div><div class="field"><label>Motif</label><select id="ex_reason">${['Départ vers un autre cabinet','Cessation / liquidation','Fin de mission ponctuelle','À l’initiative du cabinet','Autre'].map(o=>`<option>${o}</option>`).join('')}</select></div><div class="field"><label>Confrère successeur (le cas échéant)</label><input id="ex_successor"></div></div><button class="btn" style="margin-top:10px" onclick="startExit27('${c.id}')">Démarrer la sortie</button></div>`;
 const y=new Date().getFullYear(),pendingObl=[y,y+1].flatMap(yy=>obligations27(c,yy).filter(o=>!fiscDone27(o,row27('fiscm',c.id,yy)[o.key]||o.def)).map(o=>o.label+' '+yy)),bill=(typeof toBill27==='function'?toBill27():[]).filter(b=>b.c.id===c.id),works=exc27().items.filter(w=>w.client===c.id&&w.statut!=='Terminé');
 const auto={obligations:pendingObl.length?`${pendingObl.length} obligation(s) restante(s) : ${pendingObl.slice(0,6).join(', ')}`:'Aucune obligation restante d’après le calendrier',billing:bill.length||works.length?`${bill.length} prestation(s) à facturer, ${works.length} travail(aux) en cours`:'Rien à facturer'};
 const done=EXIT_STEPS27.every(([k])=>e.steps?.[k]);
 return `<div class="panel"><div class="panelHead"><h3>Sortie du client</h3><span class="sub">Fin de mission le ${datefr(e.endDate)} · ${esc(e.reason||'')}${e.successor?' · successeur : '+esc(e.successor):''}${e.closedAt?' · <b>dossier clôturé le '+datefr(e.closedAt.slice(0,10))+'</b>':''}</span></div><table><tbody>${EXIT_STEPS27.map(([k,l])=>{const s=e.steps?.[k];return `<tr><td style="width:36px"><input type="checkbox" ${s?'checked':''} ${e.closedAt?'disabled':''} onchange="exitStep27('${c.id}','${k}',this.checked)"></td><td><b>${l}</b>${auto[k]?`<div class="sub">${esc(auto[k])}</div>`:''}</td><td class="sub">${s?`fait le ${datefr(s.at.slice(0,10))} par ${esc(s.by||'')}`:''}</td></tr>`;}).join('')}</tbody></table>
 <div class="panelBody">${e.closedAt?'':`<button class="btn ${done?'green':'secondary'}" ${done?'':'disabled'} onclick="closeExit27('${c.id}')">Clôturer le dossier (passage en inactif)</button> <button class="btn small secondary" onclick="cancelExit27('${c.id}')">Annuler la sortie</button>`}</div></div>`;
}
function startExit27(cid){
 const c=cfind(cid),end=document.getElementById('ex_end')?.value;if(!c)return;if(!/^\d{4}-\d{2}-\d{2}$/.test(end||''))return toast('Indique la date de fin de mission.');
 c.exit27={endDate:end,reason:document.getElementById('ex_reason').value,successor:document.getElementById('ex_successor').value.trim(),startedAt:new Date().toISOString(),startedBy:shared25.user?.username||'',steps:{}};
 log25('Sortie du client démarrée',cid,`fin de mission le ${end}`);persist25();
}
function exitStep27(cid,k,on){const c=cfind(cid);if(!c?.exit27)return;c.exit27.steps=c.exit27.steps||{};if(on)c.exit27.steps[k]={at:new Date().toISOString(),by:shared25.user?.username||''};else delete c.exit27.steps[k];log25('Sortie : '+k+(on?' fait':' rouvert'),cid,'');persist25();}
function closeExit27(cid){const c=cfind(cid);if(!c?.exit27||!EXIT_STEPS27.every(([k])=>c.exit27.steps?.[k]))return;c.exit27.closedAt=new Date().toISOString();c.exit27.closedBy=shared25.user?.username||'';c.status='Inactif';log25('Dossier clôturé (sortie)',cid,c.exit27.reason||'');persist25();}
function cancelExit27(cid){const c=cfind(cid);if(!c?.exit27||c.exit27.closedAt)return;if(!confirm('Annuler la sortie de '+c.name+' ?'))return;delete c.exit27;log25('Sortie annulée',cid,'');persist25();}

/* ---------- Parcours (onglet de la fiche client) ---------- */
function processTab27(c){
 return `<div class="panel panelBody"><h3 style="margin-top:0">Parcours du dossier</h3><div class="formGrid"><div class="field"><label>Profil</label><select onchange="setProfile27('${c.id}','kind',this.value)"><option value=""></option>${PROFILE_FIELDS27.find(f=>f[0]==='kind')[2].map(o=>`<option ${o===profile27(c).kind?'selected':''}>${o}</option>`).join('')}</select></div><div class="field"><label>Clôture du premier exercice (si atypique)</label><input type="date" value="${esc(c.firstClose27||'')}" onchange="setFirstClose27('${c.id}',this.value)"></div><div class="field"><label>Étape</label><div style="padding:8px 0">${isOnboarding27(c)?`<span class="badge blue">${onbPhase27(c)}</span>`:c.exit27?'<span class="badge orange">Sortie en cours</span>':`<span class="badge green">${esc(c.status)}</span>`}</div></div></div><div class="sub">Prospect → proposition acceptée → acceptation du dossier (lettre de mission signée, LAB) → mise en place → actif → sortie.</div></div>`+exitTab27(c);
}
function setFirstClose27(cid,v){const c=cfind(cid);if(!c)return;if(v&&!/^\d{4}-\d{2}-\d{2}$/.test(v))return;c.firstClose27=v||undefined;log25('Premier exercice',cid,v);persist25();}
window.CLIENT_TABS_MORE27=[['process','Parcours et sortie']];
const previousClientPageProc27=clientPage27;
clientPage27=function(){let html=previousClientPageProc27();const c=cfind(state.selectedClient)||state.clients[0];if(c&&state.clientTab27==='process')html+=processTab27(c);return html;};
clientPage=clientPage27;

/* ---------- Relance consolidée par client (brouillon, validation humaine) ---------- */
function reminderDraft27(cid){
 const c=cfind(cid);if(!c)return;
 const items=tasks27().filter(x=>x.c.id===cid&&WAIT27.test(x.status||'')),lang=profile27(c).language==='Anglais'?'en':'fr',to=profile27(c).opEmail||c.contact?.email||'';
 const lines=items.map(x=>'- '+x.action.replace(/^Pièce attendue : /,'')+(x.period?' ('+x.period+')':''));
 const body=lang==='en'?`Hello,\n\nTo move forward on ${c.name}, could you please send us:\n${lines.join('\n')}\n\nThank you,\n${me27()||''}\n${cabinet26().name||'RB Partners'}`:`Bonjour,\n\nPour avancer sur le dossier ${c.name}, pourriez-vous nous transmettre :\n${lines.join('\n')}\n\nMerci par avance,\n${me27()||''}\n${cabinet26().name||'RB Partners'}`;
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal" style="width:min(680px,96vw)"><div class="modalHead"><div><h3>Relance · ${esc(c.name)}</h3><div class="sub">${items.length} élément(s) attendu(s) · destinataire : ${esc(to||'à renseigner (fiche client › Identité)')}</div></div><button class="btn secondary" onclick="closeModal()">Fermer</button></div><div class="modalBody"><textarea id="rel_text" rows="12" style="width:100%">${esc(body)}</textarea><div class="sub">Rien n’est envoyé par le CRM : copie le texte ou ouvre ta messagerie, puis confirme l’envoi.</div></div>
 <div class="modalFooter" style="display:flex;justify-content:space-between;gap:8px"><span><button class="btn small secondary" onclick="navigator.clipboard?.writeText(document.getElementById('rel_text').value).then(()=>toast('Texte copié'),()=>toast('Copie impossible : sélectionne le texte'))">Copier</button> <a class="btn small secondary" href="mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent((lang==='en'?'Outstanding items — ':'Éléments attendus — ')+c.name)}&body=${encodeURIComponent(body)}">Ouvrir ma messagerie</a></span><button class="btn green" onclick="reminderSent27('${cid}')">Confirmer que la relance est envoyée</button></div></div></div>`;
}
function reminderSent27(cid){
 const next=iso(addDays(new Date(),7)),items=tasks27().filter(x=>x.c.id===cid&&WAIT27.test(x.status||''));
 for(const x of items){const t=state.tasks27=state.tasks27||{};t[x.key]={...(t[x.key]||{}),relance:next,next:'Relancé le '+datefr(today27()),at:new Date().toISOString(),by:shared25.user?.username||''};}
 log25('Relance envoyée (confirmée)',cid,`${items.length} élément(s), prochaine relance le ${next}`);closeModal();persist25();toast('Relance enregistrée ; prochaine relance proposée le '+datefr(next));
}

/* ---------- Affichage ---------- */
const previousRenderProc27=render;
render=function(){
 previousRenderProc27();
 const root=document.getElementById('root');
 if(state.page==='fiscal'&&!root.querySelector('.rules27')){const d=document.createElement('div');d.className=rulesValidated27()?'sub rules27':'note rules27';d.style.margin='0 0 10px';const v=rulesState27()[FISC_RULES27.version];d.innerHTML=v?`Calendrier ${FISC_RULES27.version} validé par ${esc(v.by)} le ${datefr(v.at.slice(0,10))}. Échéances reportées au premier jour ouvré ; date cible interne : ${leadDays27()} jour(s) avant.`:`<b>Calendrier ${FISC_RULES27.version} à valider</b> : les dates sont calculées (report au premier jour ouvré, date cible ${leadDays27()} jour(s) avant) mais ne sont pas certifiées tant qu’un associé n’a pas vérifié les règles (Paramètres).`;root.querySelector('.titleRow')?.after(d);}
 if(state.page==='rules'&&!root.querySelector('.rulesPanel27')){const d=document.createElement('div');d.className='panel rulesPanel27';const v=rulesState27()[FISC_RULES27.version];d.innerHTML=`<div class="panelHead"><h2>Calendrier fiscal ${FISC_RULES27.version}</h2>${v?`<span class="badge green">Validé par ${esc(v.by)} le ${datefr(v.at.slice(0,10))}</span>`:`<button class="btn small" onclick="validateRules27()">J’ai vérifié les règles : valider</button>`}</div><table><tbody>${FISC_RULES27.rules.map(([a,b])=>`<tr><td><b>${esc(a)}</b></td><td class="sub">${esc(b)}</td></tr>`).join('')}</tbody></table><div class="panelBody sub">${esc(FISC_RULES27.note)} Sources : ${FISC_RULES27.sources.map(([l,u])=>`<a href="${u}" target="_blank" rel="noopener">${esc(l)}</a>`).join(' · ')}. Date cible interne : <input type="number" min="0" max="20" value="${leadDays27()}" style="width:60px" onchange="(state.settings27=state.settings27||{}).leadFiscal=Number(this.value);persist25()"> jour(s) avant l’échéance officielle.</div>`;root.append(d);}
 if(state.page==='work'&&workPrefs27().view==='waiting'){const ids=[...new Set(tasks27().filter(x=>mine27(x,workPrefs27().who==null?me27():workPrefs27().who)&&WAIT27.test(x.status||'')).map(x=>x.c.id).filter(Boolean))];if(ids.length&&!root.querySelector('.rel27')){const d=document.createElement('div');d.className='panel panelBody rel27';d.innerHTML=`<b>Relances consolidées</b> <span class="sub">— un brouillon par client, à valider avant envoi :</span> ${ids.map(id=>`<button class="btn small light" style="margin:2px" onclick="reminderDraft27('${id}')">${esc(cfind(id)?.name||'')}</button>`).join('')}`;root.querySelector('.tabs27')?.after(d);}}
};
