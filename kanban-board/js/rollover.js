/* Việc chưa xong từ hôm qua: dời hạn hoặc giữ nguyên */
/* ---------- Việc chưa xong từ hôm qua: dời hạn hoặc giữ nguyên ---------- */
let roItems=[];
function pendingRollover(){
 const today=vnToday(),out=[];
 db.boards.forEach(b=>b.tasks.forEach(t=>{
  if(isDone(b,t)||!t.due||t.due.slice(0,10)>=today||t.keepDue===t.due)return;
  if(b.type==='team'&&t.assignee!==user.email)return;
  out.push({b,t,res:null});
 }));
 return out.sort((x,y)=>dueTs(x.t.due)-dueTs(y.t.due));
}
function rolledDue(t){const today=vnToday(),tm=t.due.length>10?t.due.slice(11,16):'23:59',cand=today+'T'+tm;return new Date(cand).getTime()<Date.now()?today+'T23:59':cand}
const daysLate=t=>Math.round((parseDay(vnToday())-parseDay(t.due.slice(0,10)))/86400000);
function roApply(it,act){
 const{b,t}=it;if(it.res)return;
 if(act==='done'){const dc=cols(b).find(c=>c.done);if(!dc)return;setStatus(b,t,dc.id);it.res='✓ Đã chuyển sang “'+dc.name+'”';it.keep=false}
 else if(act==='move'){const nd=rolledDue(t);Object.keys(db.fired).forEach(k=>{if(k.includes(':'+t.id+':'))delete db.fired[k]});t.due=nd;delete t.keepDue;t.rolled=(t.rolled||0)+1;it.res='➜ Đã dời hạn sang '+fmtDue(nd);it.keep=false}
 else{t.keepDue=t.due;const k=b.id+':'+t.id+':'+t.due+':late';db.ack=db.ack||{};db.ack[k]=1;db.seen[k]=1;it.res='✗ Giữ nguyên hạn '+fmtDue(t.due);it.keep=true}
}
function renderRollover(){
 const left=roItems.filter(i=>!i.res).length;
 $('roIntro').textContent=left?'Bạn có '+left+' việc chưa xong và đã qua hạn từ các ngày trước. Với mỗi việc, hãy chọn đánh dấu đã xong, dời hạn sang hôm nay (giữ nguyên giờ, nếu giờ đó đã qua thì đặt 23:59), hoặc giữ nguyên hạn cũ.':'Đã xử lý hết các việc tồn. Bạn có thể đóng cửa sổ này.';
 $('roMoveAll').disabled=!left;$('roKeepAll').disabled=!left;
 const byBoard=[];roItems.forEach(i=>{let g=byBoard.find(x=>x.b===i.b);if(!g)byBoard.push(g={b:i.b,items:[]});g.items.push(i)});
 const box=$('roList');box.innerHTML='';
 byBoard.forEach(g=>{
  const h=document.createElement('div');h.className='ro-board';h.textContent=(g.b.type==='team'?'NHÓM · ':'CÁ NHÂN · ')+g.b.name.toUpperCase();box.appendChild(h);
  g.items.forEach(it=>{
   const t=it.t,row=document.createElement('div');row.className='ro-row'+(it.res?' decided':'');
   const preview=it.res?'':' · nếu dời: '+fmtDue(rolledDue(t));
   row.innerHTML='<div class="ro-title">'+esc(t.title)+'</div><div class="ro-meta">Hạn cũ '+fmtDue(t.due)+' · <span class="ro-late">quá hạn '+daysLate(t)+' ngày</span>'+(it.res?'':esc(preview))+'</div>'+(it.res?'<div class="ro-result'+(it.keep?' keep':'')+'">'+esc(it.res)+'</div>':'<div class="ro-actions"><button type="button" class="ro-done">✓ Đã xong</button><button type="button" class="ro-move">➜ Dời sang hôm nay</button><button type="button" class="ro-keep">✗ Không dời</button></div>');
   if(!it.res){
    row.querySelector('.ro-done').onclick=()=>{pushUndo();roApply(it,'done');render();renderRollover();showToast('Đã chuyển “'+t.title+'” sang cột hoàn thành',true)};
    row.querySelector('.ro-move').onclick=()=>{pushUndo();roApply(it,'move');render();renderRollover();showToast('Đã dời hạn “'+t.title+'” sang hôm nay',true)};
    row.querySelector('.ro-keep').onclick=()=>{pushUndo();roApply(it,'keep');render();renderRollover();showToast('Giữ nguyên hạn cũ của “'+t.title+'”',true)};
   }
   box.appendChild(row);
  });
 });
}
$('roMoveAll').onclick=()=>{const todo=roItems.filter(i=>!i.res);if(!todo.length)return;pushUndo();todo.forEach(i=>roApply(i,'move'));render();renderRollover();showToast('Đã dời '+todo.length+' việc sang hôm nay',true)};
$('roKeepAll').onclick=()=>{const todo=roItems.filter(i=>!i.res);if(!todo.length)return;pushUndo();todo.forEach(i=>roApply(i,'keep'));render();renderRollover();showToast('Giữ nguyên hạn của '+todo.length+' việc',true)};
function openRollover(){roItems=pendingRollover();if(!roItems.length){showToast('Không có việc nào cần xử lý');return}renderRollover();openModal('rolloverModal')}
function maybeRollover(){
 if(!user||!db)return;const today=vnToday();
 if(db.rollover===today||document.querySelector('.modal-backdrop.open'))return;
 const list=pendingRollover();db.rollover=today;save();
 if(!list.length)return;roItems=list;renderRollover();openModal('rolloverModal');
}
