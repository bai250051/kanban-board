/* Thanh bên, tiêu đề, thẻ và cột */
/* ---------- Sidebar & header ---------- */
function renderSidebar(){
 ['personal','team'].forEach(type=>{
  const box=$(type+'Boards');box.innerHTML='';const list=db.boards.filter(b=>b.type===type);
  list.forEach(b=>{const el=document.createElement('div');el.className='side-board'+(b.id===db.current&&viewMode==='board'?' selected':'');el.innerHTML='<span class="dot '+(type==='team'?'green':'')+'"></span><span class="side-name">'+esc(b.name)+'</span>';el.onclick=()=>switchBoard(b.id);box.appendChild(el)});
  if(!list.length)box.innerHTML='<div class="side-empty">Chưa có bảng nào</div>';
 });
}
function switchBoard(id){viewMode='board';zoomDay=null;db.current=id;filters.q='';filters.assignee='all';filters.priority='all';filters.tag='all';filters.sprint='all';$('searchInput').value='';$('priorityFilter').value='all';$('sidebar').classList.remove('open');boardDeleteArmed=false;render()}
function renderHeader(b){
 const team=b.type==='team';
 $('crumbType').textContent=team?'Làm nhóm':'Cá nhân';$('crumbBoard').textContent=b.name;
 $('eyebrow').textContent=team?'KHÔNG GIAN NHÓM':'KHÔNG GIAN CÁ NHÂN';
 $('boardHeading').innerHTML=esc(b.name)+'<span class="type-pill '+(team?'':'personal')+'">'+(team?'Nhóm · '+b.members.length+' thành viên':'Cá nhân')+'</span>';
 $('boardSubtitle').textContent=b.desc||(team?'Phân công và theo dõi công việc cùng cả nhóm.':'Sắp xếp việc của riêng bạn.');

 const tags=[...new Set(b.tasks.map(t=>t.tag).filter(Boolean))].sort();
 const tf=$('tagFilter');tf.hidden=!tags.length;tf.innerHTML='<option value="all">Mọi nhãn</option>'+tags.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
 if(!tags.includes(filters.tag))filters.tag='all';filters.sprint='all';tf.value=filters.tag;
 document.querySelectorAll('.team-only').forEach(el=>el.hidden=!team);
 if(team){
  document.querySelectorAll('#viewSeg button').forEach(x=>x.classList.toggle('on',x.dataset.view===(b.view||'columns')));
  const sf=$('sprintFilter');sf.hidden=!(b.sprints.length&&b.view!=='sprint');sf.innerHTML='<option value="all">Mọi sprint</option><option value="backlog">Backlog (chưa có sprint)</option>'+b.sprints.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
  if(filters.sprint!=='all'&&filters.sprint!=='backlog'&&!b.sprints.some(x=>x.id===filters.sprint))filters.sprint='all';sf.value=filters.sprint;
  $('memberStack').innerHTML=b.members.slice(0,5).map((m,i)=>'<div class="mini-avatar '+(m.color||COLORS[i%4])+'" title="'+esc(m.name)+'">'+esc(initials(m.name))+'</div>').join('')+(b.members.length>5?'<div class="mini-avatar" title="Thêm">+'+(b.members.length-5)+'</div>':'');
  const sel=$('assigneeFilter'),cur=filters.assignee;
  sel.innerHTML='<option value="all">Mọi người phụ trách</option><option value="__none">Chưa giao</option>'+b.members.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+'</option>').join('');
  if(![...sel.options].some(o=>o.value===cur))filters.assignee='all';sel.value=filters.assignee;
 }else filters.assignee='all';
}

/* ---------- Thẻ & cột ---------- */
function countdown(due){
 const ts=dueTs(due);if(isNaN(ts))return{text:'',cls:''};
 const diff=ts-Date.now(),abs=Math.abs(diff),mi=Math.floor(abs/60000),h=Math.floor(mi/60),d=Math.floor(h/24);
 const span=d>=1?d+' ngày'+(h%24?' '+(h%24)+' giờ':''):h>=1?h+' giờ'+(mi%60?' '+(mi%60)+' phút':''):Math.max(mi,1)+' phút';
 if(diff<0)return{text:'Quá hạn '+span,cls:'late'};
 return{text:'Còn '+span,cls:diff<=86400000?'soon':diff<=3*86400000?'warn':''};
}
function matches(t,b){
 if(filters.q){const hay=(t.title+' '+(t.desc||'')+' '+(t.tag||'')).toLowerCase();if(!hay.includes(filters.q.toLowerCase()))return false}
 if(filters.priority!=='all'&&t.priority!==filters.priority)return false;
 if(filters.tag!=='all'&&(t.tag||'')!==filters.tag)return false;
 if(b.type==='team'&&b.view!=='sprint'&&filters.sprint!=='all'){if(filters.sprint==='backlog'){if(t.sprint)return false}else if(t.sprint!==filters.sprint)return false}
 if(b.type==='team'&&filters.assignee!=='all'){if(filters.assignee==='__none'){if(t.assignee)return false}else if(t.assignee!==filters.assignee)return false}
 return true;
}
const badges=(t,b)=>{const a=[];if(b&&b.type==='team'&&t.sprint){const sp=sprintOf(b,t.sprint);if(sp)a.push('<span class="sp-badge">🏁 '+esc(sp.name.split(' —')[0])+'</span>')}if((t.comments||[]).length)a.push('💬 '+t.comments.length);if((t.attachments||[]).length)a.push('📎 '+t.attachments.length);return a.length?'<div class="card-badges">'+a.map(x=>x.startsWith('<span')?x:'<span>'+x+'</span>').join('')+'</div>':''};
const tagStyle=t=>t.tagColor?' style="background:'+t.tagColor+'26;color:'+t.tagColor+'"':'';
function cardHtml(t,b,compact){
 if(compact){
  const tg=t.priority==='Cao'?'orange':t.priority==='Thấp'?'green':'',lst=t.checklist||[],dn=lst.filter(x=>x.done).length,pc=lst.length?Math.round(dn/lst.length*100):0;
  let du='';if(t.due){const c=isDone(b,t)?{text:'',cls:''}:countdown(t.due);du='<span class="due '+c.cls+'">◷ '+(compact==='tray'?fmtDue(t.due):(t.due.length>10?fmtT(t.due.slice(11,16)):''))+(c.text?'<em>'+c.text+'</em>':'')+'</span>'}
  return '<div class="card-top"><span class="tag '+tg+'"'+tagStyle(t)+'>'+esc(t.tag||(t.priority==='Cao'?'Ưu tiên cao':'Công việc'))+'</span><button class="more" data-edit="'+esc(t.id)+'" aria-label="Sửa">⋯</button></div><h3>'+esc(t.title)+'</h3>'+(lst.length?'<div class="card-check"><div class="check-head"><span>☑ '+dn+'/'+lst.length+'</span><span>'+pc+'%</span></div><div class="progress wide"><span style="width:'+pc+'%"></span></div></div>':'')+badges(t,b)+(du?'<div class="card-meta">'+du+'</div>':'');
 }
 const tagCls=t.priority==='Cao'?'orange':t.priority==='Thấp'?'green':'';
 const tag=t.tag||(t.priority==='Cao'?'Ưu tiên cao':'');
 const list=t.checklist||[],done=list.filter(x=>x.done).length,pct=list.length?Math.round(done/list.length*100):0;
 let chk='';
 if(list.length){
  chk='<div class="card-check"><div class="check-head"><span>☑ Checklist '+done+'/'+list.length+'</span><span>'+pct+'%</span></div><div class="progress wide"><span style="width:'+pct+'%"></span></div><ul class="mini-check">'+list.slice(0,3).map(x=>'<li><label><input type="checkbox" data-ck="'+esc(x.id)+'" '+(x.done?'checked':'')+'><span class="'+(x.done?'done':'')+'">'+esc(x.text)+'</span></label></li>').join('')+(list.length>3?'<li class="mini-more">+'+(list.length-3)+' mục khác…</li>':'')+'</ul></div>';
 }
 let due='<span class="due" style="color:#a3abbb">Chưa đặt hạn</span>';
 if(t.due){const c=isDone(b,t)?{text:'',cls:''}:countdown(t.due);due='<span class="due '+c.cls+'">◷ '+fmtDue(t.due)+(c.text?'<em>'+c.text+'</em>':'')+'</span>'}
 let who='';
 if(b.type==='team'){const m=memberOf(b,t.assignee);who=m?'<span class="assignee" title="Người phụ trách: '+esc(m.name)+'"><span class="mini-avatar '+(m.color||COLORS[b.members.indexOf(m)%4])+'">'+esc(initials(m.name))+'</span><span class="aname">'+esc(lastName(m.name))+'</span></span>':'<span class="assignee none">Chưa giao</span>'}
 return '<div class="card-top"><span class="tag '+tagCls+'"'+tagStyle(t)+'>'+esc(tag||'Công việc')+'</span><button class="more" data-edit="'+esc(t.id)+'" title="Sửa" aria-label="Sửa">⋯</button></div><h3>'+esc(t.title)+'</h3>'+(t.desc?'<p>'+esc(t.desc)+'</p>':'')+chk+badges(t,b)+'<div class="card-meta">'+due+who+'</div>';
}
function setBoardCols(el,n){el.style.gridTemplateColumns='minmax(310px,1.55fr) repeat('+Math.max(n-1,1)+',minmax(215px,1fr))'}
function buildColumn(c,list,b,compact){
 const col=document.createElement('section');col.className='column';col.dataset.status=c.id;
 col.innerHTML='<div class="column-head"><div class="column-name"><span class="status-dot" style="background:'+esc(c.color)+'"></span>'+esc(c.name.toLocaleUpperCase('vi'))+' <span class="count">'+list.length+'</span></div><button class="add-card" title="Thêm thẻ">＋</button></div><div class="cards"></div>';
 const box=col.querySelector('.cards');list.forEach(t=>box.appendChild(makeCard(t,b,compact)));if(!list.length)box.innerHTML='<div class="empty">Chưa có công việc</div>';
 return col;
}
function renderTeamBoard(b){
 const box=$('board');box.innerHTML='';setBoardCols(box,cols(b).length);
 cols(b).forEach(c=>{const col=buildColumn(c,b.tasks.filter(t=>t.status===c.id&&matches(t,b)),b);col.querySelector('.add-card').onclick=()=>openTask(null,c.id);attachDropFn(col,(id,before)=>moveTask(id,c.id,before),true);box.appendChild(col)});
}
function makeCard(t,b,compact){
 const el=document.createElement('article');el.className='task-card'+(compact?' compact':'');el.draggable=true;el.dataset.id=t.id;el.innerHTML=cardHtml(t,b,compact);
 el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',t.id);e.dataTransfer.effectAllowed='move';setTimeout(()=>el.classList.add('dragging'),0)});
 el.addEventListener('dragend',()=>{el.classList.remove('dragging');document.querySelectorAll('.insert-before,.insert-end').forEach(x=>x.classList.remove('insert-before','insert-end'))});
 el.addEventListener('dblclick',()=>openTask(t.id));
 el.querySelector('[data-edit]').onclick=()=>openTask(t.id);
 el.querySelectorAll('[data-ck]').forEach(cb=>{cb.onchange=()=>{const it=t.checklist.find(x=>x.id===cb.dataset.ck);if(it){it.done=cb.checked;render()}};cb.ondblclick=e=>e.stopPropagation()});
 return el;
}
function renderStats(b){
 const n=b.tasks.length,done=b.tasks.filter(t=>isDone(b,t)).length,now=Date.now(),first=cols(b)[0].id;
 $('totalStat').textContent=n;$('doingStat').textContent=b.tasks.filter(t=>!isDone(b,t)&&t.status!==first).length;$('doneStat').textContent=done;
 $('doneNote').textContent=(n?Math.round(done/n*100):0)+'% tổng công việc';
 $('dueStat').textContent=b.tasks.filter(t=>{if(isDone(b,t)||!t.due)return false;const d=dueTs(t.due)-now;return d>=0&&d<=3*86400000}).length;
}
function render(){const b=board();renderSidebar();applyView();renderHeader(b);renderBoard(b);renderStats(b);renderNotifications();save()}
function moveTask(id,status,beforeId){
 const b=board(),t=b.tasks.find(x=>x.id===id);if(!t||beforeId===id)return;
 const changed=t.status!==status;pushUndo();
 if(changed)setStatus(b,t,status);
 if(beforeId!==undefined){
  b.tasks=b.tasks.filter(x=>x!==t);let idx;
  if(beforeId){idx=b.tasks.findIndex(x=>x.id===beforeId);if(idx<0)idx=b.tasks.length}
  else{idx=-1;b.tasks.forEach((x,i)=>{if(x.status===status)idx=i});idx=idx<0?b.tasks.length:idx+1}
  b.tasks.splice(idx,0,t);
 }
 render();showToast(changed?'Đã chuyển sang “'+colOf(b,status).name+'”':'Đã đổi thứ tự thẻ',true);
}
function insertTarget(el,y){for(const c of el.querySelectorAll('.task-card:not(.dragging)')){const r=c.getBoundingClientRect();if(y<r.top+r.height/2)return c}return null}
function clearInsert(el){el.querySelectorAll('.insert-before').forEach(c=>c.classList.remove('insert-before'));el.querySelectorAll('.insert-end').forEach(c=>c.classList.remove('insert-end'))}
function markInsert(el,y){clearInsert(el);const t=insertTarget(el,y);if(t)t.classList.add('insert-before');else{const box=el.querySelector('.cards');if(box)box.classList.add('insert-end')}}
function insertBefore(el,y){const t=insertTarget(el,y);return t?t.dataset.id:null}
function attachDropFn(el,fn,reorder){
 el._drop=fn;el._reorder=!!reorder;
 el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('drag-over');if(reorder)markInsert(el,e.clientY)});
 el.addEventListener('dragleave',e=>{if(!el.contains(e.relatedTarget)){el.classList.remove('drag-over');clearInsert(el)}});
 el.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();el.classList.remove('drag-over');const before=reorder?insertBefore(el,e.clientY):undefined;clearInsert(el);fn(e.dataTransfer.getData('text/plain'),before)});
}
