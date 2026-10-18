/* RB Partners V27 — lettre de reprise de dossier adressée au confrère précédent (article 163 du décret
 * n° 2012-432 du 30 mars 2012). Pré-remplie depuis la fiche client et les coordonnées du cabinet, avec aperçu,
 * téléchargement Word (.docx) et impression / PDF. L'étape d'onboarding correspondante se met à jour seule. */
const REPRISE_DOCS27=[
 'Balance générale et grand livre du dernier exercice clos',
 'Fichier des écritures comptables (FEC) des exercices concernés',
 'Comptes annuels et liasses fiscales des trois derniers exercices',
 'Tableau des immobilisations et des amortissements',
 'Tableaux d’emprunts et échéanciers',
 'Déclarations de TVA, d’IS, de CFE et de CVAE des douze derniers mois, avec accusés de réception',
 'Dossier permanent : statuts, procès-verbaux d’assemblées, Kbis, baux et contrats importants',
 'Dossier de travail de la dernière clôture et justificatifs des soldes',
 'Situation des comptes fiscaux et sociaux (espace impots.gouv, URSSAF)',
 'Export ou accès au logiciel comptable, le cas échéant',
];
function reprise27(c){
 const i=clientIdentity26(c),b=cabinet26(),d=i.directors?.[0];
 if(!c.reprise27)c.reprise27={};
 const r=c.reprise27;
 return {firm:'',civ:'Cher Confrère',confrere:'',firmAddress:'',firmEmail:'',
  clientAddress:i.address||'',signer:d?.name||c.contact?.name||'',signerRole:d?.role||'dirigeant',
  start:c.lm26?.start||iso(new Date(new Date().getFullYear(),new Date().getMonth()+1,1)),
  exercises:`${new Date().getFullYear()-1} et ${new Date().getFullYear()}`,answerBy:iso(addDays(new Date(),15)),
  docs:REPRISE_DOCS27.map((_,k)=>k),extra:'',sendMode:'Par courriel et lettre recommandée avec accusé de réception',
  city:b.city||'Paris',date:today27(),cabinetEmail:b.email27||'',...r};
}
function repriseDialog27(cid){
 const c=cfind(cid);if(!c)return;const r=reprise27(c),b=cabinet26();
 const f=(k,l,type='text',full)=>`<div class="field" ${full?'style="grid-column:1/-1"':''}><label for="rp_${k}">${l}</label><input id="rp_${k}" type="${type}" value="${esc(r[k]||'')}"></div>`;
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal" style="width:min(1060px,96vw)"><div class="modalHead"><div><h3>Lettre de reprise · ${esc(c.name)}</h3><div class="sub">Information du confrère précédent avant l’acceptation de la mission (art. 163 du décret n° 2012-432) et demande de transmission du dossier.</div></div><button class="btn secondary" onclick="closeModal()">Fermer</button></div>
 <div class="modalBody">${!b.name||!b.expert?`<div class="note" style="margin-bottom:12px">Coordonnées du cabinet incomplètes : <a href="#" onclick="event.preventDefault();cabinetDialog26()">les compléter</a> (nom, adresse, expert-comptable signataire).</div>`:''}
  <h3 style="margin:4px 0 8px">Confrère précédent</h3>
  <div class="formGrid">${f('firm','Cabinet précédent')}${f('confrere','Expert-comptable (nom)')}<div class="field"><label for="rp_civ">Formule d’appel</label><select id="rp_civ">${['Cher Confrère','Chère Consœur','Chers Confrères'].map(o=>`<option ${o===r.civ?'selected':''}>${o}</option>`).join('')}</select></div>${f('firmAddress','Adresse du cabinet précédent','text',true)}${f('firmEmail','Email du confrère','email')}</div>
  <h3 style="margin:16px 0 8px">Dossier repris</h3>
  <div class="formGrid">${f('clientAddress','Siège du client','text',true)}${f('signer','Représentant du client')}${f('signerRole','Qualité')}${f('start','Reprise à compter du','date')}${f('exercises','Exercices concernés')}${f('answerBy','Réponse souhaitée avant le','date')}</div>
  <h3 style="margin:16px 0 8px">Envoi</h3>
  <div class="formGrid">${f('city','Fait à')}${f('date','Date de la lettre','date')}${f('cabinetEmail','Email de réponse du cabinet','email')}${f('sendMode','Mode d’envoi','text',true)}</div>
  <h3 style="margin:16px 0 8px">Éléments demandés</h3>
  <div class="checks">${REPRISE_DOCS27.map((d,k)=>`<label class="check"><input type="checkbox" id="rp_doc_${k}" ${r.docs.includes(k)?'checked':''}> ${esc(d)}</label>`).join('')}</div>
  <div class="field" style="margin-top:10px"><label for="rp_extra">Précisions (facultatif)</label><textarea id="rp_extra" rows="2">${esc(r.extra||'')}</textarea></div>
 </div>
 <div class="modalFooter" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn secondary" onclick="previewReprise27('${cid}')">Aperçu</button><button class="btn secondary" onclick="printReprise27('${cid}')">Imprimer / PDF</button><button class="btn" onclick="downloadReprise27('${cid}')">Télécharger Word</button><button class="btn green" onclick="sentReprise27('${cid}')">Confirmer l’envoi</button></div></div></div>`;
}
function readReprise27(cid){
 const c=cfind(cid),g=k=>document.getElementById('rp_'+k);
 if(!c||!g('firm'))return c&&reprise27(c);
 const r=c.reprise27;
 ['firm','civ','confrere','firmAddress','firmEmail','clientAddress','signer','signerRole','start','exercises','answerBy','city','date','cabinetEmail','sendMode','extra'].forEach(k=>{r[k]=g(k).value.trim();});
 r.docs=REPRISE_DOCS27.map((_,k)=>k).filter(k=>g('doc_'+k).checked);
 if(r.cabinetEmail)cabinet26().email27=r.cabinetEmail;
 save();return reprise27(c);
}
/* Contenu de la lettre, partagé par l'aperçu, l'impression et le Word. */
function repriseBlocks27(c,r){
 const b=cabinet26(),i=clientIdentity26(c),long=d=>d?new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'[date]';
 const desc=[c.legalForm&&c.legalForm!=='À confirmer'?c.legalForm:'',c.siren?'SIREN '+c.siren:''].filter(Boolean).join(', ');
 return {
  sender:[b.name||'[Nom du cabinet]',b.address||'[Adresse du cabinet]',b.siren?'SIREN '+b.siren:'','Société d’expertise comptable inscrite au Tableau de l’Ordre',r.cabinetEmail||''].filter(Boolean),
  recipient:[r.firm||'[Cabinet précédent]',r.confrere?'À l’attention de '+r.confrere:'',...String(r.firmAddress||'[Adresse]').split(/\n|, (?=\d{5})/)].filter(Boolean),
  place:`${r.city||'[Ville]'}, le ${long(r.date)}`,
  mode:r.sendMode,
  object:`Objet : reprise du dossier ${c.name}${c.siren?' — SIREN '+c.siren:''}`,
  civ:r.civ+',',
  paras:[
   `La société ${c.name}${desc?' ('+desc+')':''}${r.clientAddress?', dont le siège est situé '+r.clientAddress:''}, représentée par ${r.signer||'son dirigeant'}${r.signerRole?' en sa qualité de '+r.signerRole.toLowerCase():''}, nous a fait part de son souhait de nous confier sa mission d’expertise comptable à compter du ${long(r.start)}.`,
   `Conformément à l’article 163 du décret n° 2012-432 du 30 mars 2012 relatif à l’exercice de l’activité d’expertise comptable et aux règles de confraternité de notre profession, nous tenions à vous en informer avant d’accepter cette mission.`,
   `Nous vous serions reconnaissants de bien vouloir nous indiquer si des honoraires vous restent dus par ce client, ainsi que tout élément dont vous estimeriez utile de nous faire part.`,
   `Afin d’assurer la continuité du dossier, et avec l’accord de notre client commun, nous vous remercions de bien vouloir nous transmettre les éléments suivants relatifs aux exercices ${r.exercises||'concernés'} :`,
  ],
  list:r.docs.map(k=>REPRISE_DOCS27[k]),
  after:[
   r.extra||'',
   `Nous vous remercions de nous faire parvenir ces éléments si possible avant le ${long(r.answerBy)}${r.cabinetEmail?', à l’adresse '+r.cabinetEmail:''}, ou par tout autre moyen à votre convenance.`,
   `Nous restons naturellement à votre disposition pour organiser cette transition dans les meilleures conditions et vous prions d’agréer, ${r.civ}, l’expression de nos sentiments confraternels les meilleurs.`,
  ].filter(Boolean),
  sign:[b.expert||'[Expert-comptable signataire]','Expert-comptable',b.name||''].filter(Boolean),
  cc:`Copie : ${c.name}`,
 };
}
function repriseHTML27(c,r){
 const L=repriseBlocks27(c,r);
 return `<div class="letter27"><div class="lt27Top"><div class="lt27From">${L.sender.map((s,i)=>i?`<div>${esc(s)}</div>`:`<div class="lt27Firm">${esc(s)}</div>`).join('')}</div><div class="lt27To">${L.recipient.map(s=>`<div>${esc(s)}</div>`).join('')}</div></div>
 <div class="lt27Place">${esc(L.place)}</div><div class="lt27Mode">${esc(L.mode)}</div><div class="lt27Obj">${esc(L.object)}</div>
 <p>${esc(L.civ)}</p>${L.paras.map(p=>`<p>${esc(p)}</p>`).join('')}<ul>${L.list.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>${L.after.map(p=>`<p>${esc(p)}</p>`).join('')}
 <div class="lt27Sign">${L.sign.map((s,i)=>`<div ${i?'':'class="lt27SignName"'}>${esc(s)}</div>`).join('')}</div><div class="lt27Cc">${esc(L.cc)}</div></div>`;
}
function previewReprise27(cid){
 const c=cfind(cid),r=readReprise27(cid);
 document.getElementById('modalRoot').innerHTML=`<div class="modalShade"><div class="modal" style="width:min(900px,96vw)"><div class="modalHead"><h3>Aperçu · lettre de reprise</h3><button class="btn secondary" onclick="repriseDialog27('${cid}')">← Modifier</button></div><div class="modalBody" style="background:#f2f4f7">${repriseHTML27(c,r)}</div><div class="modalFooter" style="display:flex;gap:8px;justify-content:flex-end"><button class="btn secondary" onclick="printReprise27('${cid}')">Imprimer / PDF</button><button class="btn" onclick="downloadReprise27('${cid}')">Télécharger Word</button><button class="btn green" onclick="sentReprise27('${cid}')">Confirmer l’envoi</button></div></div></div>`;
 markReprise27(c,'En cours');
}
/* Suivi de la reprise : préparée → envoi confirmé → réponse reçue → pièces récupérées.
 * L'étape d'onboarding n'est terminée qu'à la récupération des pièces. */
function markReprise27(c,status){
 const o=onb27(c),r=c.reprise27||(c.reprise27={});
 if(status==='En cours'&&!r.preparedAt){r.preparedAt=new Date().toISOString();r.preparedBy=shared25.user?.username||'';}
 if(status==='Fait'||!o.s[1]||['A faire','NA'].includes(o.s[1])){o.s[1]=status;save();}
}
function repriseStage27(c){const r=c.reprise27||{};return r.piecesAt?'Pièces récupérées':r.answeredAt?'Réponse reçue':r.sentAt?'Envoyée':r.preparedAt?'Préparée':'';}
function repriseStep27(cid,step){
 const c=cfind(cid);if(!c)return;const r=c.reprise27||(c.reprise27={}),now=new Date().toISOString(),me=shared25.user?.username||'';
 if(step==='answer'){r.answeredAt=now;r.answeredBy=me;log25('Lettre de reprise : réponse du confrère reçue',cid,r.firm||'');}
 if(step==='pieces'){const note=prompt('Pièces récupérées (liste ou commentaire, conservé dans l’historique) :',r.piecesNote||'');if(note===null)return;r.piecesAt=now;r.piecesBy=me;r.piecesNote=note;onb27(c).s[1]='Fait';log25('Lettre de reprise : pièces récupérées',cid,note);}
 persist25();
}
function printReprise27(cid){
 const c=cfind(cid),r=readReprise27(cid);
 document.getElementById('print26')?.remove();
 const el=document.createElement('div');el.id='print26';el.innerHTML=repriseHTML27(c,r);document.body.append(el);
 document.body.classList.add('printing26');window.print();document.body.classList.remove('printing26');el.remove();
 markReprise27(c,'En cours');
}
function downloadReprise27(cid){
 const c=cfind(cid),r=readReprise27(cid),L=repriseBlocks27(c,r),x=s=>xmlEscapeWord(String(s));
 const run=(t,o={})=>`<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>${o.b?'<w:b/>':''}${o.i?'<w:i/>':''}<w:sz w:val="${o.sz||21}"/><w:color w:val="${o.color||'222222'}"/></w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
 const para=(content,o={})=>`<w:p><w:pPr>${o.jc?`<w:jc w:val="${o.jc}"/>`:''}${o.ind?`<w:ind w:left="${o.ind}"/>`:''}<w:spacing w:before="${o.before||0}" w:after="${o.after??120}" w:line="276" w:lineRule="auto"/></w:pPr>${content}</w:p>`;
 const lines=(arr,o)=>arr.map((s,i)=>para(run(s,{...o,b:o.firstBold&&!i,sz:o.firstBold&&!i?26:o.sz,color:o.firstBold&&!i?'1F3864':o.color}),{after:0,ind:o.ind})).join('');
 const body=[
  lines(L.sender,{firstBold:true,sz:19,color:'555555'}),
  para('',{after:240}),
  lines(L.recipient,{ind:5200,sz:21}),
  para('',{after:200}),
  para(run(L.place),{jc:'right'}),
  para(run(L.mode,{i:true,sz:19,color:'555555'})),
  para(run(L.object,{b:true}),{before:120,after:240}),
  para(run(L.civ)),
  ...L.paras.map(p=>para(run(p),{jc:'both'})),
  ...L.list.map(d=>para(run('•  '+d),{ind:420,after:60})),
  para('',{after:60}),
  ...L.after.map(p=>para(run(p),{jc:'both'})),
  para('',{after:240}),
  L.sign.map((s,i)=>para(run(s,{b:!i}),{ind:5200,after:0})).join(''),
  para('',{after:360}),
  para(run(L.cc,{i:true,sz:18,color:'777777'})),
 ].join('');
 const doc=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
 const ct=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
 const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
 const blob=zipStored([{name:'[Content_Types].xml',data:ct},{name:'_rels/.rels',data:rels},{name:'word/document.xml',data:doc}],'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Lettre_de_reprise_${c.name.replace(/[^\wÀ-ÿ-]+/g,'_')}.docx`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
 markReprise27(c,'En cours');log25('Lettre de reprise générée',cid,r.firm||'');toast('Lettre de reprise téléchargée (Word)');
}
function sentReprise27(cid){
 const c=cfind(cid);readReprise27(cid);
 const mode=c.reprise27.sendMode||'',date=prompt(`Confirme l’envoi de la lettre de reprise${mode?' ('+mode+')':''} : date d’envoi (AAAA-MM-JJ)`,today27());
 if(date===null)return;if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return alert('Date invalide (format AAAA-MM-JJ).');
 Object.assign(c.reprise27,{sentAt:date,sentBy:shared25.user?.username||'',sentConfirmedAt:new Date().toISOString()});
 markReprise27(c,'En cours');log25('Lettre de reprise : envoi confirmé',cid,(c.reprise27.firm||'')+' · '+date);closeModal();persist25();
 toast('Envoi confirmé. L’étape sera terminée à la récupération des pièces.');
}
(function(){const s=document.createElement('style');s.textContent=`
.letter27{background:#fff;max-width:760px;margin:0 auto;padding:46px 54px;font-family:Calibri,"Segoe UI",Arial,sans-serif;font-size:13.5px;line-height:1.55;color:#222;box-shadow:0 1px 4px rgba(16,24,40,.08)}
.lt27Top{display:flex;justify-content:space-between;gap:30px;margin-bottom:30px}.lt27From{font-size:11.5px;color:#555}.lt27Firm{font-size:16px;font-weight:700;color:#1f3864;margin-bottom:3px}
.lt27To{margin-top:70px;min-width:250px}.lt27Place{text-align:right;margin:10px 0 4px}.lt27Mode{font-style:italic;font-size:12px;color:#555;margin-bottom:16px}
.lt27Obj{font-weight:700;margin-bottom:18px}.letter27 p{text-align:justify;margin:0 0 10px}.letter27 ul{margin:0 0 12px 18px;padding:0}.letter27 li{margin:2px 0}
.lt27Sign{margin:30px 0 0 55%}.lt27SignName{font-weight:700}.lt27Cc{margin-top:40px;font-size:11px;font-style:italic;color:#777}
@media print{body.printing26 #print26 .letter27{box-shadow:none;padding:0;max-width:none}}`;document.head.append(s);})();
