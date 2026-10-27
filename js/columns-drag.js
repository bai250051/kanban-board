/* Tùy chỉnh cột và kéo thả bằng cảm ứng */
/* ---------- Tùy chỉnh cột ---------- */
let draftCols=[];
function openCols(){draftCols=cols(board()).map(c=>({...c}));renderColsList();openModal('colsModal')}
function renderColsList(){
 const box=$('colsList');box.innerHTML='';
 draftCols.forEach((c,i)=>{
  const row=document.createElement('div');row.className='col-row';
  row.innerHTML='<input class="col-name" maxlength="24" value="'+esc(c.name)+'" aria-label="Tên cột"><div class="swatches">'+COL_COLORS.map(x=>'<button type="button" class="swatch'+(x===c.color?' on':'')+'" style="background:'+x+'" data-c="'+x+'" aria-label="Chọn màu"></button>').join('')+'</div><label class="col-done"><input type="checkbox" '+(c.done?'checked':'')+'> Hoàn thành</label><button type="button" class="col-ctl" data-up '+(i===0?'disabled':'')+' aria-label="Lên">↑</button><button type="button" class="col-ctl" data-down '+(i===draftCols.length-1?'disabled':'')+' aria-label="Xuống">↓</button><button type="button" class="col-ctl del" data-del '+(draftCols.length<=2?'disabled':'')+' aria-label="Xóa cột">×</button>';
  row.querySelector('.col-name').oninput=e=>{c.name=e.target.value};
  row.querySelectorAll('.swatch').forEach(sw=>sw.onclick=()=>{c.color=sw.dataset.c;renderColsList()});
  row.querySelector('.col-done input').onchange=e=>{c.done=e.target.checked};
  row.querySelector('[data-up]').onclick=()=>{[draftCols[i-1],draftCols[i]]=[draftCols[i],draftCols[i-1]];renderColsList()};
  row.querySelector('[data-down]').onclick=()=>{[draftCols[i+1],draftCols[i]]=[draftCols[i],draftCols[i+1]];renderColsList()};
  row.querySelector('[data-del]').onclick=()=>{draftCols.splice(i,1);renderColsList()};
  box.appendChild(row);
 });
 $('colsAdd').disabled=draftCols.length>=6;
}
$('manageColsBtn').onclick=openCols;
$('colsAdd').onclick=()=>{if(draftCols.length>=6)return;draftCols.push({id:'c_'+uid(),name:'Cột mới',color:COL_COLORS[draftCols.length%COL_COLORS.length]});renderColsList()};
$('colsReset').onclick=()=>{draftCols=defaultColumns();renderColsList()};
$('colsForm').addEventListener('submit',e=>{
 e.preventDefault();const b=board();
 if(draftCols.some(c=>!c.name.trim())){showToast('Tên cột không được để trống');return}
 if(!draftCols.some(c=>c.done)){showToast('Cần ít nhất một cột đánh dấu “Hoàn thành”');return}
 const keep=new Set(draftCols.map(c=>c.id));let moved=0;pushUndo();
 b.tasks.forEach(t=>{if(!keep.has(t.status)){t.status=draftCols[0].id;moved++}});
 b.columns=draftCols.map(c=>({id:c.id,name:c.name.trim(),color:c.color,...(c.done?{done:true}:{})}));
 b.tasks.forEach(t=>{if(isDone(b,t)){if(!t.doneAt)t.doneAt=new Date().toISOString()}else delete t.doneAt});
 closeModals();render();showToast('Đã cập nhật cột'+(moved?' · '+moved+' thẻ chuyển về “'+draftCols[0].name.trim()+'”':''),!!moved);
});

/* ---------- Kéo thả bằng cảm ứng (nhấn giữ thẻ ~0,35 giây) ---------- */
const TD={timer:null,active:false,ghost:null,card:null,sx:0,sy:0,lx:0,ly:0,target:null,scroll:null};
function dropTargetAt(x,y){const el=document.elementFromPoint(x,y);const t=el&&el.closest('.column,.wk-cell:not(.events),.tray-cards,.sp-card,.sp-chip,.lane-head');return t&&t._drop?t:null}
function touchHighlight(x,y){
 const t=dropTargetAt(x,y);
 if(TD.target&&TD.target!==t){TD.target.classList.remove('drag-over');clearInsert(TD.target)}
 TD.target=t;if(t){t.classList.add('drag-over');if(t._reorder)markInsert(t,y)}
}
function startTouchDrag(){
 const c=TD.card;if(!c||!c.isConnected)return;TD.active=true;TD.timer=null;
 const r=c.getBoundingClientRect(),g=c.cloneNode(true);g.classList.add('touch-ghost');g.style.width=r.width+'px';g.style.left=(TD.lx-r.width/2)+'px';g.style.top=(TD.ly-24)+'px';
 document.body.appendChild(g);TD.ghost=g;c.classList.add('dragging');document.body.classList.add('touch-dragging');
 if(navigator.vibrate)try{navigator.vibrate(25)}catch(e){}
 TD.scroll=setInterval(()=>{
  const w=window.innerHeight;if(TD.ly<90)window.scrollBy(0,-14);else if(TD.ly>w-90)window.scrollBy(0,14);
  const sc=[document.querySelector('.week-scroll'),$('board')].find(x=>x&&x.offsetParent&&x.scrollWidth>x.clientWidth);
  if(sc){if(TD.lx<54)sc.scrollLeft-=14;else if(TD.lx>window.innerWidth-54)sc.scrollLeft+=14}
  touchHighlight(TD.lx,TD.ly);
 },16);
}
function endTouchDrag(drop){
 clearTimeout(TD.timer);TD.timer=null;clearInterval(TD.scroll);TD.scroll=null;
 if(!TD.active){TD.card=null;return}
 const t=TD.target,card=TD.card;TD.active=false;
 if(TD.ghost){TD.ghost.remove();TD.ghost=null}
 if(card)card.classList.remove('dragging');document.body.classList.remove('touch-dragging');
 if(t){t.classList.remove('drag-over');const before=t._reorder?insertBefore(t,TD.ly):undefined;clearInsert(t);TD.target=null;if(drop&&card)t._drop(card.dataset.id,before)}
 TD.card=null;
}
document.addEventListener('touchstart',e=>{
 if(e.touches.length!==1||TD.active)return;
 const card=e.target.closest&&e.target.closest('.task-card');
 if(!card||e.target.closest('input,button,a,label,select,textarea'))return;
 const t=e.touches[0];TD.card=card;TD.sx=TD.lx=t.clientX;TD.sy=TD.ly=t.clientY;
 clearTimeout(TD.timer);TD.timer=setTimeout(startTouchDrag,350);
},{passive:true});
document.addEventListener('touchmove',e=>{
 const t=e.touches[0];if(!t)return;
 TD.lx=t.clientX;TD.ly=t.clientY;
 if(!TD.active){if(TD.timer&&Math.hypot(t.clientX-TD.sx,t.clientY-TD.sy)>10){clearTimeout(TD.timer);TD.timer=null}return}
 e.preventDefault();TD.ghost.style.left=(t.clientX-TD.ghost.offsetWidth/2)+'px';TD.ghost.style.top=(t.clientY-24)+'px';touchHighlight(t.clientX,t.clientY);
},{passive:false});
document.addEventListener('touchend',()=>endTouchDrag(true));
document.addEventListener('touchcancel',()=>endTouchDrag(false));
document.addEventListener('contextmenu',e=>{if(TD.timer||TD.active)e.preventDefault()});
