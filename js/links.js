/* Liên kết việc từ bảng nhóm sang bảng cá nhân.
   Mỗi thẻ cá nhân được liên kết mang thêm trường  link:{boardId,boardName,taskId,snap,done,prev,tprev,lost}.
   - Dữ liệu thật của việc vẫn nằm ở bảng nhóm; bảng cá nhân chỉ giữ một thẻ riêng của người dùng
     (xếp ngày, checklist riêng...) nên không cần sửa cấu trúc dữ liệu chung trên máy chủ.
   - Khi nhóm sửa tên, mô tả, hạn, ưu tiên hoặc nhãn thì thẻ cá nhân cập nhật theo (so với bản đã thấy lần trước: snap).
     Nếu chỉ phía cá nhân sửa thì giữ nguyên (ví dụ dời hạn riêng để tự xếp lịch).
   - Trạng thái xong đồng bộ hai chiều: bên nào đổi sang/ra khỏi cột hoàn thành thì bên kia đổi theo.
   - Việc nhóm bị xóa hoặc người dùng rời nhóm: thẻ cá nhân đánh dấu mất liên kết và vẫn dùng như việc riêng. */
const LINK_FIELDS=['title','desc','priority','tag','tagColor','due'];
const lkNorm=v=>v==null?'':String(v);
const lkSnap=t=>{const o={};LINK_FIELDS.forEach(f=>{o[f]=lkNorm(t[f])});return o};
const teamBoardsOf=()=>db.boards.filter(b=>b.type==='team');
const personalBoardsOf=()=>db.boards.filter(b=>b.type==='personal');
const lkDoneCol=b=>cols(b).find(c=>c.done)||null;
const lkOpenCols=b=>cols(b).filter(c=>!c.done);

/* Tập các việc nhóm (boardId:taskId) đã có thẻ cá nhân của người dùng này */
function linkedKeys(){
 const s=new Set();if(!db)return s;
 personalBoardsOf().forEach(pb=>pb.tasks.forEach(t=>{if(t.link&&!t.link.lost)s.add(t.link.boardId+':'+t.link.taskId)}));
 return s;
}
function linkOf(boardId,taskId){
 if(!db)return null;
 for(const pb of personalBoardsOf()){
  const pt=pb.tasks.find(t=>t.link&&!t.link.lost&&t.link.boardId===boardId&&t.link.taskId===taskId);
  if(pt)return{pb,pt};
 }
 return null;
}

/* ---------- Tạo liên kết ---------- */
function lkInitialStatus(tb,tt,pb){
 if(isDone(tb,tt)){const d=lkDoneCol(pb);if(d)return d.id}
 const open=lkOpenCols(pb),idx=cols(tb).findIndex(c=>c.id===tt.status);
 return((idx>0&&open[1])||open[0]||cols(pb)[0]).id;
}
function linkTask(tb,tt,pb){
 const ex=linkOf(tb.id,tt.id);if(ex)return ex.pt;
 const st=lkInitialStatus(tb,tt,pb),done=isDone(tb,tt);
 const pt={id:uid(),title:tt.title,desc:tt.desc||'',status:st,priority:tt.priority||'Trung bình',assignee:user.email,due:tt.due||'',remind:tt.remind==null?1440:tt.remind,tag:tt.tag||'',tagColor:tt.tagColor||'',sprint:'',comments:[],attachments:[],
  checklist:(tt.checklist||[]).map(x=>({id:uid(),text:x.text,done:!!x.done})),
  link:{boardId:tb.id,boardName:tb.name,taskId:tt.id,snap:lkSnap(tt),done}};
 setStatus(pb,pt,st);
 if(done&&tt.doneAt&&isDone(pb,pt))pt.doneAt=tt.doneAt;
 pb.tasks.unshift(pt);
 return pt;
}

/* ---------- Đồng bộ (chạy đầu mỗi lần vẽ lại giao diện) ---------- */
function lkSetDone(b,t,done,l,prevKey,reopenIdx){
 const dc=lkDoneCol(b);if(!dc)return false;
 if(done){if(!isDone(b,t)){l[prevKey]=t.status;setStatus(b,t,dc.id)}return true}
 if(isDone(b,t)){
  const open=lkOpenCols(b);if(!open.length)return false;
  const target=open.find(c=>c.id===l[prevKey])||open[reopenIdx]||open[0];
  setStatus(b,t,target.id);
 }
 return true;
}
function syncLinks(){
 if(!db)return false;
 const teams=teamBoardsOf();let changed=false;
 personalBoardsOf().forEach(pb=>pb.tasks.forEach(pt=>{
  const l=pt.link;if(!l)return;
  const tb=teams.find(b=>b.id===l.boardId),tt=tb&&tb.tasks.find(x=>x.id===l.taskId);
  if(!tt){if(!l.lost){l.lost=true;changed=true}return}
  if(l.lost){delete l.lost;changed=true}
  if(tb.name!==l.boardName){l.boardName=tb.name;changed=true}
  l.snap=l.snap||{};
  LINK_FIELDS.forEach(f=>{
   const v=lkNorm(tt[f]);
   if(v===lkNorm(l.snap[f]))return;
   pt[f]=v;l.snap[f]=v;changed=true;
   if(f==='due'){delete pt.keepDue;Object.keys(db.fired||{}).forEach(k=>{if(k.includes(':'+pt.id+':'))delete db.fired[k]})}
  });
  if(!lkDoneCol(pb)||!lkDoneCol(tb))return;           // thiếu cột hoàn thành ở một bên: không đồng bộ trạng thái xong
  const tDone=isDone(tb,tt),pDone=isDone(pb,pt);
  if(tDone!==!!l.done){                               // nhóm vừa đổi: thẻ cá nhân đi theo
   if(lkSetDone(pb,pt,tDone,l,'prev',0)){l.done=tDone;changed=true}
  }else if(pDone!==tDone){                            // cá nhân vừa đổi: việc nhóm đi theo
   if(lkSetDone(tb,tt,pDone,l,'tprev',1)){l.done=pDone;changed=true}
  }
 }));
 return changed;
}

/* ---------- Giao diện: nhãn trên thẻ ---------- */
function lkBadge(t,b){
 if(!b||!db)return'';
 if(b.type==='personal'&&t.link){
  return t.link.lost
   ?'<span class="lk-badge lost" title="Việc gốc trong nhóm không còn truy cập được">⚠ Mất liên kết</span>'
   :'<span class="lk-badge" title="Liên kết với việc trong nhóm “'+esc(t.link.boardName)+'”">🔗 '+esc(t.link.boardName)+'</span>';
 }
 if(b.type==='team'&&linkOf(b.id,t.id))return'<span class="lk-badge" title="Việc này đã có trong bảng cá nhân của bạn">📌 Trong bảng cá nhân</span>';
 return'';
}

/* ---------- Giao diện: khung liên kết trong cửa sổ công việc ---------- */
function unlinkTask(pb,pt){pushUndo();delete pt.link;render();refreshLinkField(board(),pt);showToast('Đã gỡ liên kết, thẻ này giờ là việc riêng',true)}
function removeLinkedCopy(pb,pt,tt){
 if(!confirm('Gỡ việc này khỏi bảng cá nhân “'+pb.name+'”? Việc trong nhóm vẫn giữ nguyên.'))return;
 pushUndo();pb.tasks=pb.tasks.filter(x=>x!==pt);render();refreshLinkField(board(),tt);showToast('Đã gỡ khỏi bảng cá nhân',true);
}
function refreshLinkField(b,t){
 const f=$('linkField');if(!f)return;
 const box=$('linkBox');box.innerHTML='';f.hidden=true;
 if(!t||!db)return;
 const msg=h=>{const s=document.createElement('div');s.className='link-msg';s.innerHTML=h;box.appendChild(s)};
 const acts=()=>{const r=document.createElement('div');r.className='link-actions';box.appendChild(r);return r};
 const btn=(txt,fn,primary)=>{const x=document.createElement('button');x.type='button';x.className='btn '+(primary?'btn-primary':'btn-light');x.textContent=txt;x.onclick=fn;return x};
 if(b.type==='personal'){
  const l=t.link;if(!l)return;
  f.hidden=false;$('linkLabel').textContent='Liên kết với nhóm';
  if(l.lost){
   msg('⚠ Việc gốc trong nhóm “'+esc(l.boardName)+'” không còn truy cập được (đã bị xóa, hoặc bạn không còn trong nhóm). Thẻ này vẫn dùng được như việc riêng.');
   acts().appendChild(btn('Gỡ liên kết',()=>unlinkTask(b,t)));
  }else{
   msg('🔗 Đang liên kết với việc trong nhóm “'+esc(l.boardName)+'”. Khi nhóm sửa tên, hạn, ưu tiên hay nhãn thì thẻ này cập nhật theo. Đánh dấu xong ở bên nào thì bên kia cũng xong.');
   const a=acts();
   a.appendChild(btn('Mở việc nhóm',()=>{closeModals();switchBoard(l.boardId);openTask(l.taskId)}));
   a.appendChild(btn('Gỡ liên kết',()=>unlinkTask(b,t)));
  }
  return;
 }
 if(b.type!=='team')return;
 const pbs=personalBoardsOf();if(!pbs.length)return;
 f.hidden=false;$('linkLabel').textContent='Bảng cá nhân của bạn';
 const ex=linkOf(b.id,t.id);
 if(ex){
  const c=colOf(ex.pb,ex.pt.status);
  msg('📌 Đã có trong “'+esc(ex.pb.name)+'”'+(c?' (cột “'+esc(c.name)+'”)':'')+'. Đánh dấu xong ở bên nào thì bên kia cũng xong.');
  const a=acts();
  a.appendChild(btn('Mở trong bảng cá nhân',()=>{closeModals();switchBoard(ex.pb.id);openTask(ex.pt.id)}));
  a.appendChild(btn('Gỡ khỏi bảng cá nhân',()=>removeLinkedCopy(ex.pb,ex.pt,t)));
 }else{
  msg('Chưa có trong bảng cá nhân của bạn. Thêm vào để xếp ngày trong thời khóa biểu tuần.');
  const a=acts();let sel=null;
  if(pbs.length>1){sel=document.createElement('select');sel.id='linkTarget';sel.innerHTML=pbs.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');a.appendChild(sel)}
  a.appendChild(btn('📌 Thêm vào bảng cá nhân',()=>{
   const pb=sel?pbs.find(p=>p.id===sel.value):pbs[0];if(!pb)return;
   pushUndo();linkTask(b,t,pb);render();refreshLinkField(board(),t);showToast('Đã thêm vào “'+pb.name+'”',true);
  },true));
 }
}

/* ---------- Giao diện: chọn nhiều việc từ nhóm ---------- */
let pullSel=new Set();
const pullKey=x=>x.tb.id+':'+x.t.id;
function pullCandidates(showAll){
 const linked=linkedKeys(),out=[];
 teamBoardsOf().forEach(tb=>tb.tasks.forEach(t=>{
  if(isDone(tb,t)||linked.has(tb.id+':'+t.id))return;
  if(!showAll&&t.assignee!==user.email)return;
  out.push({tb,t});
 }));
 return out.sort((x,y)=>{const a=dueTs(x.t.due),b=dueTs(y.t.due);return((isNaN(a)?Infinity:a)-(isNaN(b)?Infinity:b))||0});
}
function renderPull(){
 const showAll=$('pullAll').checked,list=pullCandidates(showAll),box=$('pullList');
 pullSel=new Set([...pullSel].filter(k=>list.some(x=>pullKey(x)===k)));
 box.innerHTML='';
 if(!list.length){
  box.innerHTML='<div class="notification-empty">'+(teamBoardsOf().length?(showAll?'Mọi việc chưa xong trong các nhóm đều đã có trong bảng cá nhân.':'Không có việc nào được giao cho bạn mà chưa nằm trong bảng cá nhân.'):'Bạn chưa tham gia bảng nhóm nào.')+'</div>';
 }else{
  let cur=null;
  list.forEach(x=>{
   if(cur!==x.tb){cur=x.tb;const h=document.createElement('div');h.className='ro-board';h.textContent='NHÓM · '+x.tb.name.toUpperCase();box.appendChild(h)}
   const m=memberOf(x.tb,x.t.assignee),sp=x.t.sprint?sprintOf(x.tb,x.t.sprint):null,k=pullKey(x);
   const row=document.createElement('label');row.className='pull-row';
   row.innerHTML='<input type="checkbox" '+(pullSel.has(k)?'checked':'')+'><div><div class="pull-title">'+esc(x.t.title)+'</div><div class="pull-meta">'+(x.t.due?'Hạn '+fmtDue(x.t.due):'Chưa đặt hạn')+' · '+(m?(m.id===user.email?'phụ trách: bạn':'phụ trách: '+esc(m.name)):'chưa giao')+(sp?' · '+esc(sp.name.split(' —')[0]):'')+'</div></div>';
   row.querySelector('input').onchange=e=>{if(e.target.checked)pullSel.add(k);else pullSel.delete(k);updatePullFoot()};
   box.appendChild(row);
  });
 }
 updatePullFoot();
}
function updatePullFoot(){
 const n=pullSel.size,total=pullCandidates($('pullAll').checked).length;
 $('pullAdd').disabled=!n;$('pullAdd').textContent=n?'Thêm '+n+' việc vào bảng cá nhân':'Thêm vào bảng cá nhân';
 $('pullSelAll').disabled=!total;$('pullSelAll').textContent=n&&n===total?'Bỏ chọn tất cả':'Chọn tất cả';
}
function openPull(){
 if(!personalBoard())return;
 pullSel=new Set();$('pullAll').checked=false;renderPull();openModal('pullModal');
}
$('pullTeamBtn').onclick=openPull;
$('pullAll').onchange=renderPull;
$('pullSelAll').onclick=()=>{
 const list=pullCandidates($('pullAll').checked);
 if(pullSel.size===list.length)pullSel=new Set();else pullSel=new Set(list.map(pullKey));
 renderPull();
};
$('pullAdd').onclick=()=>{
 const pb=personalBoard();if(!pb||!pullSel.size)return;
 pushUndo();let n=0;
 pullCandidates(true).forEach(x=>{if(pullSel.has(pullKey(x))){linkTask(x.tb,x.t,pb);n++}});
 closeModals();render();showToast('Đã thêm '+n+' việc từ nhóm vào “'+pb.name+'”',true);
};
