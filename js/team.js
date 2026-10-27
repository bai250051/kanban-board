/* Bảng nhóm: xem theo sprint / theo người */
/* ---------- Làm nhóm: xem theo sprint / theo người ---------- */
const sprintOf=(b,id)=>(b.sprints||[]).find(x=>x.id===id);
function sprintState(sp){const t=vnToday();if(sp.closed)return{k:'done',l:'Đã kết thúc'};if(sp.start>t)return{k:'next',l:'Sắp tới'};if(sp.end<t)return{k:'late',l:'Quá ngày kết thúc'};return{k:'run',l:'Đang chạy'}}
function sprintStat(b,id){const ts=b.tasks.filter(t=>id==='backlog'?!t.sprint:t.sprint===id),dn=ts.filter(t=>isDone(b,t)).length;return{n:ts.length,dn,pct:ts.length?Math.round(dn/ts.length*100):0}}
function assignSprint(taskId,spId){const b=board(),t=b.tasks.find(x=>x.id===taskId);if(!t)return;const to=spId==='backlog'?'':spId;if((t.sprint||'')===to)return;pushUndo();t.sprint=to;render();showToast(to?'Đã chuyển thẻ vào “'+sprintOf(b,to).name+'”':'Đã đưa thẻ về Backlog',true)}
function assignTask(taskId,assigneeId,status){
 const b=board(),t=b.tasks.find(x=>x.id===taskId);if(!t)return;
 const changedWho=(t.assignee||'')!==assigneeId,changedSt=status&&t.status!==status;if(!changedWho&&!changedSt)return;
 pushUndo();t.assignee=assigneeId;if(changedSt)setStatus(b,t,status);render();
 const m=memberOf(b,assigneeId);showToast(changedWho?(assigneeId?'Đã giao cho '+(m?m.name:'thành viên'):'Đã bỏ người phụ trách'):'Đã chuyển sang “'+colOf(b,status).name+'”',true);
}
function renderSprintView(b){
 const box=$('teamAlt');box.innerHTML='';
 let sel=b.sprintSel||'all';if(sel!=='all'&&sel!=='backlog'&&!sprintOf(b,sel)){sel=b.sprintSel='all'}
 const strip=document.createElement('div');strip.className='sprint-strip';
 const chip=(id,label,count)=>{const el=document.createElement('button');el.type='button';el.className='sp-chip'+(sel===id?' on':'');el.innerHTML=esc(label)+' <small>'+count+'</small>';el.onclick=()=>{b.sprintSel=id;render()};if(id==='backlog')attachDropFn(el,tid=>assignSprint(tid,'backlog'));return el};
 strip.appendChild(chip('all','Tất cả',b.tasks.length));strip.appendChild(chip('backlog','Backlog',b.tasks.filter(t=>!t.sprint).length));
 b.sprints.forEach(sp=>{
  const st=sprintState(sp),ss=sprintStat(b,sp.id),el=document.createElement('button');el.type='button';el.className='sp-card'+(sel===sp.id?' on':'');
  el.innerHTML='<span class="sp-name" title="'+esc(sp.name)+'">'+esc(sp.name)+'</span><span class="sp-dates">'+dm(parseDay(sp.start))+' → '+dm(parseDay(sp.end))+'<span class="sp-tag '+st.k+'">'+st.l+'</span></span><div class="progress wide"><span style="width:'+ss.pct+'%"></span></div><span class="sp-meta"><span>'+ss.dn+'/'+ss.n+' việc xong</span><span>'+ss.pct+'%</span></span>';
  el.onclick=()=>{b.sprintSel=sp.id;render()};attachDropFn(el,tid=>assignSprint(tid,sp.id));strip.appendChild(el);
 });
 const add=document.createElement('button');add.type='button';add.className='sp-add';add.textContent=b.sprints.length?'＋ Sprint':'＋ Tạo sprint đầu tiên';add.onclick=()=>openSprint(null);strip.appendChild(add);
 box.appendChild(strip);
 const sp=sprintOf(b,sel);
 if(sp){
  const st=sprintState(sp),ss=sprintStat(b,sp.id),d=document.createElement('div');d.className='sprint-detail';
  d.innerHTML='<div><h3>'+esc(sp.name)+'<span class="sp-tag '+st.k+'">'+st.l+'</span></h3><p>'+(sp.goal?'🎯 '+esc(sp.goal)+'<br>':'')+'📅 '+fmtDay(sp.start)+' → '+fmtDay(sp.end)+' · '+ss.dn+'/'+ss.n+' việc đã xong ('+ss.pct+'%)</p></div><div class="sd-actions"><button class="btn btn-light" data-sd="edit" type="button">✎ Sửa</button>'+(sp.closed?'<button class="btn btn-light" data-sd="reopen" type="button">↺ Mở lại</button>':'<button class="btn btn-primary" data-sd="end" type="button">🏁 Kết thúc sprint</button>')+'</div>';
  d.querySelector('[data-sd=edit]').onclick=()=>openSprint(sp.id);
  const rb=d.querySelector('[data-sd=reopen]');if(rb)rb.onclick=()=>{pushUndo();sp.closed=false;render();showToast('Đã mở lại sprint',true)};
  const eb=d.querySelector('[data-sd=end]');if(eb)eb.onclick=()=>openEndSprint(sp.id);
  box.appendChild(d);
 }
 const list=b.tasks.filter(t=>matches(t,b)&&(sel==='all'||(sel==='backlog'?!t.sprint:t.sprint===sel)));
 const bd=document.createElement('div');bd.className='board teamalt-board';bd.style.padding='0';setBoardCols(bd,cols(b).length);
 cols(b).forEach(c=>{const col=buildColumn(c,list.filter(t=>t.status===c.id),b);col.querySelector('.add-card').onclick=()=>openTask(null,c.id);attachDropFn(col,(id,before)=>moveTask(id,c.id,before),true);bd.appendChild(col)});
 box.appendChild(bd);
}
function renderPeopleView(b){
 const box=$('teamAlt');box.innerHTML='';
 let lanes=b.members.map(m=>({id:m.id,name:m.name,m}));lanes.push({id:'',name:'Chưa giao',m:null});
 if(filters.assignee!=='all')lanes=lanes.filter(l=>filters.assignee==='__none'?l.id==='':l.id===filters.assignee);
 const bar=document.createElement('div');bar.className='lane-bar';bar.innerHTML='<span>'+lanes.length+' dải · kéo thẻ vào dải của một người để giao lại việc</span><span class="sp"></span><button type="button" data-lb="collapse">Thu gọn tất cả</button><button type="button" data-lb="expand">Mở rộng tất cả</button>';
 bar.querySelector('[data-lb=collapse]').onclick=()=>{lanes.forEach(l=>b.collapsed[l.id||'_none']=true);render()};
 bar.querySelector('[data-lb=expand]').onclick=()=>{b.collapsed={};render()};
 box.appendChild(bar);
 lanes.forEach(l=>{
  const key=l.id||'_none',tasks=b.tasks.filter(t=>matches(t,b)&&(t.assignee||'')===l.id),all=b.tasks.filter(t=>(t.assignee||'')===l.id);
  const dn=all.filter(t=>isDone(b,t)).length,late=all.filter(t=>!isDone(b,t)&&t.due&&dueTs(t.due)<Date.now()).length,pct=all.length?Math.round(dn/all.length*100):0,col=!!b.collapsed[key];
  const el=document.createElement('section');el.className='lane'+(tasks.length?'':' empty');
  const head=document.createElement('div');head.className='lane-head';
  const idx=l.m?b.members.indexOf(l.m):0;
  head.innerHTML='<span class="lane-caret">'+(col?'▸':'▾')+'</span>'+(l.m?'<div class="mini-avatar '+(l.m.color||COLORS[idx%4])+'">'+esc(initials(l.name))+'</div>':'<div class="mini-avatar">?</div>')+'<div><div class="lane-name">'+esc(l.name)+(l.id===user.email?' (tôi)':'')+'</div><div class="lane-sub">'+all.length+' việc · '+dn+' xong'+(late?' · <span class="late">'+late+' trễ</span>':'')+'</div></div><div class="lane-prog"><div class="progress wide"><span style="width:'+pct+'%"></span></div></div><button type="button" class="lane-add" title="Thêm việc cho '+esc(l.name)+'" aria-label="Thêm việc">＋</button>';
  head.onclick=e=>{if(e.target.closest('.lane-add'))return;b.collapsed[key]=!col;render()};
  head.querySelector('.lane-add').onclick=e=>{e.stopPropagation();openTask(null,null);$('taskAssignee').value=l.id};
  attachDropFn(head,tid=>assignTask(tid,l.id,undefined));
  el.appendChild(head);
  if(!col){
   const body=document.createElement('div');body.className='lane-body';const bd=document.createElement('div');bd.className='board';bd.style.padding='0';setBoardCols(bd,cols(b).length);
   cols(b).forEach(c=>{
    const cl=buildColumn(c,tasks.filter(t=>t.status===c.id),b,true);
    cl.querySelector('.add-card').onclick=()=>{openTask(null,c.id);$('taskAssignee').value=l.id};
    attachDropFn(cl,tid=>assignTask(tid,l.id,c.id));bd.appendChild(cl);
   });
   body.appendChild(bd);el.appendChild(body);
  }
  box.appendChild(el);
 });
}
let spEdit=null;
function openSprint(id){
 const b=board(),sp=id?sprintOf(b,id):null;spEdit=sp?sp.id:null;
 const last=b.sprints[b.sprints.length-1],start=sp?sp.start:(last?ymd(addDay(parseDay(last.end),1)):vnToday());
 $('spHeading').textContent=sp?'Sửa sprint':'Thêm sprint';
 $('spName').value=sp?sp.name:'Sprint '+(b.sprints.length+1);$('spGoal').value=sp?sp.goal||'':'';$('spStart').value=start;$('spEnd').value=sp?sp.end:ymd(addDay(parseDay(start),13));
 $('spDelete').hidden=!sp;resetSpDelete();openModal('sprintModal');
}
let spDelArmed=false;
function resetSpDelete(){spDelArmed=false;const x=$('spDelete');x.classList.remove('armed');x.textContent='🗑 Xóa sprint'}
$('sprintForm').addEventListener('submit',e=>{
 e.preventDefault();const b=board(),name=$('spName').value.trim(),start=$('spStart').value,end=$('spEnd').value;
 if(!name)return;if(!start||!end||start>end){showToast('Ngày kết thúc phải sau ngày bắt đầu');return}
 const v={name,goal:$('spGoal').value.trim(),start,end};let sp=spEdit?sprintOf(b,spEdit):null;
 if(sp)Object.assign(sp,v);else{sp={id:uid(),...v};b.sprints.push(sp);b.sprintSel=sp.id}
 closeModals();render();showToast((spEdit?'Đã cập nhật ':'Đã thêm ')+'“'+name+'”');
});
$('spDelete').onclick=()=>{
 if(!spDelArmed){spDelArmed=true;$('spDelete').classList.add('armed');$('spDelete').textContent='Bấm lần nữa để xóa';setTimeout(resetSpDelete,3500);return}
 const b=board();pushUndo();let n=0;b.tasks.forEach(t=>{if(t.sprint===spEdit){t.sprint='';n++}});b.sprints=b.sprints.filter(x=>x.id!==spEdit);if(b.sprintSel===spEdit)b.sprintSel='all';
 closeModals();render();showToast('Đã xóa sprint'+(n?' · '+n+' thẻ về Backlog':''),true);
};
let esId=null;
function openEndSprint(id){
 const b=board(),sp=sprintOf(b,id);if(!sp)return;esId=id;
 const open=b.tasks.filter(t=>t.sprint===id&&!isDone(b,t)),next=b.sprints.filter(x=>x.id!==id&&!x.closed&&x.start>=sp.start).sort((x,y)=>x.start.localeCompare(y.start))[0];
 $('esText').textContent=open.length?'Sprint “'+sp.name+'” còn '+open.length+' việc chưa xong.':'Tất cả việc của “'+sp.name+'” đã xong. Bạn có thể kết thúc sprint.';
 $('esDest').innerHTML=(next?'<option value="'+esc(next.id)+'">Chuyển sang “'+esc(next.name)+'”</option>':'')+'<option value="backlog">Chuyển về Backlog</option><option value="keep">Giữ nguyên trong sprint này</option>';
 $('esDest').disabled=!open.length;openModal('endSprintModal');
}
$('esConfirm').onclick=()=>{
 const b=board(),sp=sprintOf(b,esId);if(!sp)return;pushUndo();const dest=$('esDest').value;let n=0;
 if(!$('esDest').disabled&&dest!=='keep')b.tasks.forEach(t=>{if(t.sprint===esId&&!isDone(b,t)){t.sprint=dest==='backlog'?'':dest;n++}});
 sp.closed=true;closeModals();render();showToast('Đã kết thúc “'+sp.name+'”'+(n?' · '+n+' việc đã được chuyển':''),true);
};
