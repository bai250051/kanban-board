/* Tạo/đổi tên/xóa bảng và mời thành viên */
/* ---------- Bảng: tạo / đổi tên / xóa ---------- */
document.querySelectorAll('[data-newboard]').forEach(b=>b.onclick=()=>{newBoardDefault=b.dataset.newboard;$('newBoardType').value=newBoardDefault;$('newBoardName').value='';$('newBoardDesc').value='';openModal('boardModal');setTimeout(()=>$('newBoardName').focus(),50)});
$('boardForm').addEventListener('submit',e=>{
 e.preventDefault();const type=$('newBoardType').value,name=$('newBoardName').value.trim();if(!name)return;
 const me={id:user.email,name:user.name,email:user.email,color:''};
 const nb={id:'b_'+uid(),name,desc:$('newBoardDesc').value.trim(),type,owner:user.email,members:[me],tasks:[],sprints:type==='team'?[{id:uid(),name:'Sprint 1',goal:'',start:vnToday(),end:ymd(addDay(parseDay(vnToday()),13))}]:[]};
 db.boards.push(nb);db.current=nb.id;closeModals();render();showToast('Đã tạo bảng “'+name+'”');
 if(type==='team')setTimeout(openInvite,250);
});
$('renameBtn').onclick=()=>{const b=board(),n=prompt('Tên bảng mới:',b.name);if(n&&n.trim()){b.name=n.trim().slice(0,70);render()}};
$('deleteBoardBtn').onclick=()=>{
 const btn=$('deleteBoardBtn');
 if(db.boards.length<2){showToast('Cần giữ lại ít nhất một bảng');return}
 if(!boardDeleteArmed){boardDeleteArmed=true;btn.classList.add('armed');btn.textContent='Bấm lần nữa để xóa';setTimeout(()=>{boardDeleteArmed=false;btn.classList.remove('armed');btn.textContent='🗑 Xóa bảng'},3500);return}
 pushUndo();const id=db.current;db.boards=db.boards.filter(b=>b.id!==id);db.current=db.boards[0].id;boardDeleteArmed=false;btn.classList.remove('armed');btn.textContent='🗑 Xóa bảng';render();showToast('Đã xóa bảng',true);
};

/* ---------- Mời thành viên ---------- */
const toB64=s=>{const by=new TextEncoder().encode(s);let bin='';by.forEach(x=>bin+=String.fromCharCode(x));return btoa(bin)};
const fromB64=s=>{const bin=atob(s);return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0)))};
function makeInviteLink(b){
 const snap={id:b.id,name:b.name,desc:b.desc,owner:b.owner,ownerName:user.name,members:b.members,columns:cols(b),sprints:b.sprints,tasks:b.tasks.map(t=>({...t,attachments:(t.attachments||[]).map(a=>(a.data||a.idb)?{id:a.id,name:a.name,size:a.size,type:a.type,missing:true}:a)}))};
 const enc=toB64(JSON.stringify(snap)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 return location.href.split('#')[0]+'#join='+enc;
}
function parseJoinHash(){const m=location.hash.match(/^#join=(.+)$/);if(!m)return null;try{const s=JSON.parse(fromB64(m[1].replace(/-/g,'+').replace(/_/g,'/')));return s&&s.id&&s.name&&Array.isArray(s.members)?s:null}catch(e){return null}}
function renderMembers(){
 const b=board(),isOwner=b.owner===user.email;$('memberCount').textContent=b.members.length;
 $('memberList').innerHTML=b.members.map((m,i)=>'<div class="member-row"><div class="mini-avatar '+(m.color||COLORS[i%4])+'">'+esc(initials(m.name))+'</div><span class="m-name">'+esc(m.name)+(m.id===user.email?' (tôi)':'')+'</span><span class="m-role">'+(m.id===b.owner?'Trưởng nhóm':'Thành viên')+'</span>'+(isOwner&&m.id!==b.owner?'<button class="m-del" data-rm="'+esc(m.id)+'" title="Xóa khỏi nhóm" aria-label="Xóa khỏi nhóm">×</button>':'')+'</div>').join('');
 $('memberList').querySelectorAll('[data-rm]').forEach(btn=>btn.onclick=()=>{b.tasks.forEach(t=>{if(t.assignee===btn.dataset.rm)t.assignee=''});b.members=b.members.filter(m=>m.id!==btn.dataset.rm);renderMembers();$('inviteLink').value=makeInviteLink(b);render()});
}
function openInvite(){const b=board();if(b.type!=='team')return;$('inviteLink').value=makeInviteLink(b);$('addMemberName').value='';renderMembers();openModal('inviteModal')}
$('inviteBtn').onclick=openInvite;
$('copyInvite').onclick=async()=>{const inp=$('inviteLink');try{await navigator.clipboard.writeText(inp.value)}catch(e){inp.select();document.execCommand('copy')}showToast('Đã sao chép liên kết mời')};
$('inviteLink').onfocus=e=>e.target.select();
function addMember(){const b=board(),name=$('addMemberName').value.trim();if(!name)return;b.members.push({id:'m_'+uid(),name,color:COLORS[b.members.length%4]});$('addMemberName').value='';renderMembers();$('inviteLink').value=makeInviteLink(b);render()}
$('addMemberBtn').onclick=addMember;$('addMemberName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addMember()}});
function openJoin(snap){
 const ex=db.boards.find(b=>b.id===snap.id);
 $('joinText').innerHTML=ex?'Bạn đã có nhóm <strong>'+esc(snap.name)+'</strong> rồi. Mở bảng này?':'<strong>'+esc(snap.ownerName||'Một thành viên')+'</strong> mời bạn tham gia nhóm <strong>'+esc(snap.name)+'</strong> ('+snap.members.length+' thành viên, '+(snap.tasks||[]).length+' công việc).';
 $('joinBtn').textContent=ex?'Mở bảng':'Tham gia nhóm';
 $('joinBtn').onclick=()=>{
  if(!ex){
   const members=snap.members.map(m=>({...m}));
   if(!members.some(m=>m.id===user.email))members.push({id:user.email,name:user.name,email:user.email,color:COLORS[members.length%4]});
   const nb={id:snap.id,name:snap.name,desc:snap.desc||'',type:'team',owner:snap.owner||'',members,columns:snap.columns,sprints:snap.sprints||[],tasks:snap.tasks||[],events:[]};normalizeBoard(nb);db.boards.push(nb);
  }
  db.current=snap.id;pendingJoin=null;history.replaceState(null,'',location.pathname+location.search);closeModals();render();showToast(ex?'Đã mở bảng nhóm':'Bạn đã tham gia nhóm “'+snap.name+'”');
 };
 openModal('joinModal');
}
