/* RB Partners V27 — style épuré (typographie plus fine, moins d'ombres) et position de défilement conservée. */
(function(){const s=document.createElement('style');s.textContent=`
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:13px;color:#2b3445;-webkit-font-smoothing:antialiased;background:#f7f8fa}
h1{font-size:20px;font-weight:650;letter-spacing:-.01em}h2{font-size:15px;font-weight:650}h3{font-size:13.5px;font-weight:650}
.sub{font-size:11.5px}.titleRow{margin-bottom:14px}
.brand{font-size:16px;font-weight:700}.navsec{font-size:9.5px;font-weight:700}
.nav a{font-size:12.5px;padding:7px 10px}.nav a:hover,.nav a.active{font-weight:600}
.btn{font-weight:600;font-size:11.5px;padding:7px 11px;border-radius:6px}.btn.small{padding:5px 8px;font-size:11px}
.card{padding:11px 14px;border-radius:9px;box-shadow:none}.card small{font-weight:600;font-size:11px}
.big{font-size:19px;font-weight:700;margin-top:4px}
.panel{box-shadow:none;border-radius:9px}.panelHead{padding:10px 14px}.panelBody{padding:13px}
table{font-size:12.5px}th{font-size:10.5px;font-weight:600}
.badge{font-weight:600;font-size:10.5px;padding:3px 6px}
.field label{font-size:10px;font-weight:700}
.field input,.field select,.field textarea{font-size:13px;padding:7px 9px}
.modal input,.modal select,.modal textarea{font-size:13px}
.modalHead h3,.modal h3{font-size:14px}
.search{font-size:12.5px}.top{height:56px}
.statusSelect,.mini{font-size:11.5px}
.kpiLine{padding:7px 0}
.pill27{font-weight:500;font-size:11px;height:32px}.cell27{height:32px;font-size:12px}.board27 td{height:32px}
.board27 th{font-weight:600;font-size:10.5px}.name27 a{font-weight:500}
.grp27{font-size:13.5px;font-weight:650;margin:16px 0 6px}
.onb27{background:#fff;border:1px solid var(--border);border-radius:8px;margin-bottom:6px}
.onb27.open{border-color:#c9d8f0}
.onbHead27{display:grid;grid-template-columns:18px minmax(200px,2fr) 85px 85px minmax(150px,1.2fr) minmax(150px,1.4fr) 60px 170px;gap:12px;align-items:center;padding:9px 12px;cursor:pointer}
.onbHead27:hover{background:#fafbfc}.chev27{color:#8a93a3}
.onbName27{display:flex;flex-direction:column;overflow:hidden}.onbName27 b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.onbMeta27{display:flex;flex-direction:column;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.onbMeta27 .sub{font-size:10px;text-transform:uppercase;letter-spacing:.03em}
.onbAct27{display:flex;gap:6px;justify-content:flex-end;align-items:center}.sec27{font-size:15px;font-weight:650;margin:20px 0 4px;color:#1d2939}
.late27t{color:#c62a3d;font-weight:600}.soon27t{color:#b26b00;font-weight:600}
.onbProg27{display:flex;align-items:center;gap:8px;font-size:12px}.bar27{flex:1;height:6px;background:#edf0f4;border-radius:4px;overflow:hidden}.bar27 i{display:block;height:100%}
.onbBody27{border-top:1px solid #eef0f4;padding:10px 12px 12px 42px}
.onbSteps27{width:100%;border-collapse:collapse}.onbSteps27 td{border-bottom:1px solid #f1f2f5;padding:0 6px;height:34px}.onbSteps27 th{text-align:left;padding:6px}
.onbSteps27 a,.onbHead27 a{text-decoration:none}.onbNum27{color:#8a93a3;width:28px}.onbPerson27{text-align:left;max-width:200px}.onbPill27{border-radius:5px;height:26px}
.v25actions label.sub{display:flex;align-items:center;gap:6px}`;document.head.append(s);})();
// Une modification ne ramène plus en haut ni tout à gauche : le défilement est conservé après le rafraîchissement.
const previousRenderStyle27=render;
render=function(){
 const page=state.page,pos={y:window.scrollY,b:{}};
 document.querySelectorAll('.board27[data-k]').forEach(e=>{pos.b[e.dataset.k]=e.scrollLeft;});
 previousRenderStyle27();
 if(state.page!==page)return;
 document.querySelectorAll('.board27[data-k]').forEach(e=>{if(pos.b[e.dataset.k])e.scrollLeft=pos.b[e.dataset.k];});
 if(pos.y)window.scrollTo(0,pos.y);
};
