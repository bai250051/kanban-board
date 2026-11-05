/* Đồng bộ nhóm và lời mời bằng mã số thành viên (chỉ hoạt động khi dùng kho máy chủ) */
let pendingInvites=[];
const serverMode=()=>Store.name==='supabase';
function startSync(){
 if(!serverMode())return;
 Store.onRemote=handleRemote;
 Store.subscribe(id=>(db&&db.boards.find(b=>b.id===id))||null);
 refreshAccountUI();
}
function stopSync(){if(serverMode()){Store.unsubscribe();Store.onRemote=null;pendingInvites=[];renderInvites()}}
function refreshAccountUI(){
 const m=Store.me;if(!m)return;
 const rl=document.querySelector('.profile-role');if(rl)rl.textContent='Mã số: '+m.member_no;
 $('accountField').hidden=false;$('accName').textContent=m.name;$('accNo').textContent=m.member_no;
 document.querySelectorAll('[data-local-only]').forEach(e=>e.hidden=true);
 document.querySelectorAll('.server-only').forEach(e=>{if(e.id==='accountField'||e.id==='inviteNoField')e.hidden=false});
}
$('copyNo').onclick=async()=>{const t=String(Store.me&&Store.me.member_no||'');try{await navigator.clipboard.writeText(t)}catch(e){}showToast('Đã sao chép mã số '+t)};

/* ----- nhận thay đổi từ máy chủ ----- */
function handleRemote(evt){
 if(!db)return;
 if(evt.type==='board'){
  const i=db.boards.findIndex(b=>b.id===evt.id),nb=evt.apply(i>=0?db.boards[i]:null);normalizeBoard(nb);
  if(i>=0)db.boards[i]=nb;else{db.boards.push(nb);showToast('Bạn đã tham gia nhóm “'+nb.name+'”')}
  render();if($('inviteModal').classList.contains('open'))renderMembers();
 }else if(evt.type==='removed'){
  const b=db.boards.find(x=>x.id===evt.boardId);if(!b)return;
  db.boards=db.boards.filter(x=>x.id!==evt.boardId);
  if(db.current===evt.boardId)db.current=db.boards[0].id;
  render();showToast('Bạn không còn truy cập được nhóm “'+b.name+'” (bị gỡ khỏi nhóm hoặc nhóm đã bị xóa)');
 }else if(evt.type==='members'){
  db.boards.filter(b=>b.type==='team').forEach(b=>{
   const rows=evt.mems.filter(m=>m.board_id===b.id);if(!rows.length)return;
   const old=new Map(b.members.map(m=>[m.id,m]));
   b.members=rows.map(m=>{const p=evt.profs.get(m.user_id)||{};return{id:m.user_id,name:p.display_name||'Thành viên',member_no:p.member_no,color:(old.get(m.user_id)||{}).color||''}});
   const ow=rows.find(m=>m.role==='owner');if(ow)b.owner=ow.user_id;
  });
  render();if($('inviteModal').classList.contains('open'))renderMembers();
 }else if(evt.type==='invites'){
  const more=evt.list.length>pendingInvites.length;pendingInvites=evt.list;renderInvites();renderNotifications();
  if(more)showToast('Bạn có lời mời vào nhóm mới (xem ở chuông thông báo)');
 }
}
function renderInvites(){
 const el=$('inviteList');if(!el)return;
 el.innerHTML=pendingInvites.map(i=>'<div class="invite-item"><div><b>'+esc(i.from_name)+'</b> mời bạn vào nhóm <b>'+esc(i.board_name)+'</b></div><div class="inv-actions"><button type="button" class="inv-yes" data-inv="'+i.id+'" data-acc="1">Chấp nhận</button><button type="button" class="inv-no" data-inv="'+i.id+'" data-acc="0">Từ chối</button></div></div>').join('');
 el.querySelectorAll('[data-inv]').forEach(b=>b.onclick=async()=>{
  b.disabled=true;const r=await Store.invites.respond(+b.dataset.inv,b.dataset.acc==='1');
  if(r.error){showToast(r.error);b.disabled=false;return}
  pendingInvites=pendingInvites.filter(x=>x.id!==+b.dataset.inv);renderInvites();renderNotifications();
  showToast(b.dataset.acc==='1'?'Đã chấp nhận lời mời':'Đã từ chối lời mời');
 });
}

/* ----- mời bằng mã số ----- */
async function openServerInvite(b){
 flushSave();await Store.idle();
 $('inviteNo').value='';$('inviteNoMsg').textContent='Hỏi người cần mời mã số thành viên của họ (hiện trong Cài đặt). Họ cần mở web và chấp nhận lời mời.';
 $('inviteNoField').hidden=false;renderMembers();openModal('inviteModal');
 const isOwner=b.owner===user.email;$('inviteNoField').hidden=!isOwner;
 if(!isOwner)$('inviteNoMsg').textContent='Chỉ trưởng nhóm mới mời được thành viên.';
 renderPendingInvites(b);
}
async function renderPendingInvites(b){
 const box=$('pendingInvField'),list=$('pendingInvList');
 if(b.owner!==user.email){box.hidden=true;return}
 const rows=await Store.invites.ofBoard(b.id);box.hidden=!rows.length;
 list.innerHTML=rows.map(r=>'<div class="pending-row"><span>'+esc(r.display_name)+' (mã số '+r.member_no+')</span><button class="m-del" data-cancel="'+r.id+'" title="Thu hồi lời mời" type="button">×</button></div>').join('');
 list.querySelectorAll('[data-cancel]').forEach(x=>x.onclick=async()=>{const r=await Store.invites.cancel(+x.dataset.cancel);if(r.error)showToast(r.error);renderPendingInvites(b)});
}
async function inviteByNo(){
 const b=board(),msg=$('inviteNoMsg'),raw=$('inviteNo').value.trim();
 if(!/^[0-9]{1,12}$/.test(raw)){msg.textContent='Mã số chỉ gồm chữ số, ví dụ 12.';return}
 const btn=$('inviteNoBtn');btn.disabled=true;
 try{
  flushSave();await Store.idle();
  const f=await Store.invites.find(+raw);
  if(f.error){msg.textContent=f.error;return}
  if(!f.member){msg.textContent='Không tìm thấy mã số '+raw+'.';return}
  if(!confirm('Mời '+f.member.display_name+' (mã số '+raw+') vào nhóm “'+b.name+'”?'))return;
  const r=await Store.invites.send(b.id,+raw);
  if(r.error){msg.textContent=r.error;return}
  msg.textContent='Đã gửi lời mời cho '+f.member.display_name+'. Họ cần mở web và chấp nhận.';$('inviteNo').value='';renderPendingInvites(b);
 }finally{btn.disabled=false}
}
$('inviteNoBtn').onclick=inviteByNo;$('inviteNo').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();inviteByNo()}});
