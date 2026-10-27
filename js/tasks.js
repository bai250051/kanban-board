/* Cửa sổ công việc: tạo/sửa/xóa, checklist, đính kèm, bình luận */
/* ---------- Modal chung ---------- */
function openModal(id){$(id).classList.add('open')}
function closeModals(){document.querySelectorAll('.modal-backdrop').forEach(m=>m.classList.remove('open'));stopVoice(true)}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeModals));
document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('mousedown',e=>{if(e.target===m)closeModals()}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const anyOpen=document.querySelector('.modal-backdrop.open')||$('notificationPanel').classList.contains('open');closeModals();$('notificationPanel').classList.remove('open');if(!anyOpen&&zoomDay&&user){zoomDay=null;render()}}});
let undoSnap=null,undoTimer=null;
function pushUndo(){try{undoSnap=JSON.stringify(db)}catch(e){undoSnap=null}clearTimeout(undoTimer);undoTimer=setTimeout(()=>{undoSnap=null},30000)}
function doUndo(){
 if(!undoSnap||!user)return false;
 let d;try{d=JSON.parse(undoSnap)}catch(e){return false}
 undoSnap=null;db=d;if(viewMode==='grades')setTimeout(renderGrades,0);db.seen=db.seen||{};db.fired=db.fired||{};db.ack=db.ack||{};db.boards.forEach(normalizeBoard);if(!db.boards.some(b=>b.id===db.current))db.current=db.boards[0].id;
 closeModals();render();showToast('Đã hoàn tác');return true;
}
function showToast(msg,undo){
 const t=$('toast');t.textContent=msg;t.classList.remove('has-action');
 if(undo&&undoSnap){const b=document.createElement('button');b.type='button';b.className='toast-undo';b.textContent='Hoàn tác';b.onclick=doUndo;t.appendChild(b);t.classList.add('has-action')}
 t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),undo?7000:3200);
}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'&&undoSnap&&!/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement||{}).tagName||'')){e.preventDefault();doUndo()}});

/* ---------- Công việc: tạo / sửa / xóa ---------- */
function openTask(id=null,status=null,day=null){
 if(viewMode!=='board'){viewMode='board';render()}
 const b=board(),t=b.tasks.find(x=>x.id===id),team=b.type==='team';status=status||cols(b)[0].id;
 $('taskStatus').innerHTML=cols(b).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
 editId=t?t.id:null;taskDeleteArmed=false;resetDeleteBtn();
 $('modalTitle').textContent=t?'Chỉnh sửa công việc':'Tạo công việc mới';
 $('taskTitle').value=t?t.title:'';$('taskDesc').value=t?t.desc||'':'';$('taskStatus').value=t?t.status:status;$('taskPriority').value=t?t.priority:'Trung bình';
 $('taskDue').value=t?t.due||'':'';$('taskRemind').value=String(t?(t.remind??1440):1440);$('taskTag').value=t?t.tag||'':'';
 $('assigneeField').hidden=!team;$('sprintField').hidden=!team;
 $('taskSprint').innerHTML='<option value="">Backlog (chưa có sprint)</option>'+(b.sprints||[]).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+(x.closed?' (đã kết thúc)':'')+'</option>').join('');
 $('taskSprint').value=t?(t.sprint||''):((b.view==='sprint'&&sprintOf(b,b.sprintSel))?b.sprintSel:(filters.sprint!=='all'&&filters.sprint!=='backlog'&&sprintOf(b,filters.sprint)?filters.sprint:''));
 $('taskAssignee').innerHTML='<option value="">Chưa giao</option>'+b.members.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+(m.id===user.email?' (tôi)':'')+'</option>').join('');
 $('taskAssignee').value=t?(t.assignee||''):user.email;
 if(!t&&day)$('taskDue').value=day+'T23:59';
 draftTagColor=t?t.tagColor||'':'';renderTagSwatches();
 $('tagList').innerHTML=[...new Set(b.tasks.map(x=>x.tag).filter(Boolean))].map(x=>'<option value="'+esc(x)+'">').join('');
 draftChecklist=(t?t.checklist||[]:[]).map(x=>({...x}));renderDraftChecklist();
 draftAtt=(t?t.attachments||[]:[]).map(x=>({...x}));renderAtt();draftComments=[];$('cmText').value='';renderComments();
 $('ckNew').value='';$('voiceStatus').textContent='';$('voiceChip').textContent='';
 $('deleteTaskBtn').hidden=!t;openModal('taskModal');setTimeout(()=>$('taskTitle').focus(),50);
}
function renderTagSwatches(){
 const box=$('tagSwatches');box.innerHTML=TAG_COLORS.map(c=>'<button type="button" class="swatch'+(c===draftTagColor?' on':'')+(c?'':' none')+'"'+(c?' style="background:'+c+'"':'')+' data-c="'+c+'" title="'+(c?'Màu nhãn':'Không màu')+'" aria-label="'+(c?'Màu nhãn':'Không màu')+'"></button>').join('');
 box.querySelectorAll('.swatch').forEach(sw=>sw.onclick=()=>{draftTagColor=sw.dataset.c;renderTagSwatches()});
}
function resetDeleteBtn(){const b=$('deleteTaskBtn');b.classList.remove('armed');b.textContent='🗑 Xóa công việc'}
$('createTaskBtn').onclick=()=>openTask(null,null,board().type==='personal'?zoomDay:null);
$('addTaskWeekBtn').onclick=()=>openTask(null,null,null);
$('taskForm').addEventListener('submit',e=>{
 e.preventDefault();const b=board();addDraftItem();
 const title=$('taskTitle').value.trim();if(!title)return;
 const data={sprint:b.type==='team'?$('taskSprint').value:'',attachments:draftAtt,title,desc:$('taskDesc').value.trim(),status:$('taskStatus').value,priority:$('taskPriority').value,assignee:b.type==='team'?$('taskAssignee').value:user.email,due:$('taskDue').value,remind:+$('taskRemind').value,tag:$('taskTag').value.trim(),tagColor:draftTagColor,checklist:draftChecklist.filter(x=>x.text.trim())};
 if(editId){const t=b.tasks.find(x=>x.id===editId);if(t){if(t.due!==data.due)Object.keys(db.fired).forEach(k=>{if(k.includes(':'+t.id+':'))delete db.fired[k]});const ns=data.status;delete data.status;Object.assign(t,data);setStatus(b,t,ns)}showToast('Đã cập nhật công việc')}
 else{const nt={id:uid(),comments:draftComments.slice(),...data,status:cols(b)[0].id};b.tasks.unshift(nt);setStatus(b,nt,data.status);showToast('Đã tạo công việc mới')}
 closeModals();render();checkReminders();
});
$('deleteTaskBtn').onclick=()=>{
 const btn=$('deleteTaskBtn');
 if(!taskDeleteArmed){taskDeleteArmed=true;btn.classList.add('armed');btn.textContent='Bấm lần nữa để xóa';setTimeout(()=>{taskDeleteArmed=false;resetDeleteBtn()},3500);return}
 const b=board();pushUndo();b.tasks=b.tasks.filter(t=>t.id!==editId);closeModals();render();showToast('Đã xóa công việc',true);
};

/* ---------- Checklist ---------- */
function renderDraftChecklist(){
 const box=$('checkList');box.innerHTML='';
 draftChecklist.forEach((it,i)=>{
  const row=document.createElement('div');row.className='ck-row'+(it.done?' is-done':'');
  row.innerHTML='<input type="checkbox" '+(it.done?'checked':'')+' aria-label="Hoàn thành"><input class="ck-text" value="'+esc(it.text)+'" aria-label="Nội dung mục"><button type="button" class="ck-del" title="Xóa mục" aria-label="Xóa mục">×</button>';
  const [cb,tx,del]=row.children;
  cb.onchange=()=>{it.done=cb.checked;row.classList.toggle('is-done',it.done);updateCkBar()};
  tx.oninput=()=>{it.text=tx.value};
  tx.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('ckNew').focus()}};
  del.onclick=()=>{draftChecklist.splice(i,1);renderDraftChecklist()};
  box.appendChild(row);
 });
 updateCkBar();
}
function updateCkBar(){const n=draftChecklist.length,d=draftChecklist.filter(x=>x.done).length;$('ckCount').textContent=n?'('+d+'/'+n+' · '+Math.round(d/n*100)+'%)':'(chưa có mục nào)';$('ckBarFill').style.width=(n?d/n*100:0)+'%'}
function addDraftItem(){
 const v=$('ckNew').value;if(!v.trim())return;
 v.split(/\r?\n/).map(s=>s.replace(/^[\s\-*•\d.)\]]+/,'').trim()).filter(Boolean).forEach(s=>draftChecklist.push({id:uid(),text:s,done:false}));
 $('ckNew').value='';renderDraftChecklist();$('ckNew').focus();
}
$('ckAdd').onclick=addDraftItem;
$('ckNew').addEventListener('paste',e=>{const tx=(e.clipboardData||window.clipboardData).getData('text');if(/\r?\n/.test(tx)){e.preventDefault();$('ckNew').value=tx;addDraftItem()}});
$('ckNew').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addDraftItem()}});

/* ---------- Đính kèm (lưu file trong IndexedDB) ---------- */
const FileStore=(()=>{
 let dbp=null;
 const open=()=>dbp||(dbp=new Promise((res,rej)=>{try{const r=indexedDB.open('kanban_files',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}}));
 const tx=async(mode,fn)=>{const d=await open();return new Promise((res,rej)=>{const t=d.transaction('files',mode),rq=fn(t.objectStore('files'));t.oncomplete=()=>res(rq&&rq.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})};
 return{put:(k,v)=>tx('readwrite',s=>s.put(v,k)),get:k=>tx('readonly',s=>s.get(k)),del:k=>tx('readwrite',s=>s.delete(k)),keys:()=>tx('readonly',s=>s.getAllKeys())};
})();
let draftAtt=[],draftComments=[];
const MAX_FILE=10*1024*1024,MAX_INLINE=300*1024,escRe=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const fmtSize=n=>n<1024?n+' B':n<1048576?Math.round(n/1024)+' KB':n<1073741824?(n/1048576).toFixed(1)+' MB':(n/1073741824).toFixed(1)+' GB';
async function fileBlob(a){if(a.idb){try{return await FileStore.get(a.id)}catch(e){return null}}if(a.data){try{return await(await fetch(a.data)).blob()}catch(e){return null}}return null}
function renderAtt(){
 const box=$('attList');box.innerHTML='';$('attCount').textContent=draftAtt.length?'('+draftAtt.length+')':'';
 draftAtt.forEach((a,i)=>{
  const row=document.createElement('div');row.className='att-row';
  const img=!a.url&&!a.missing&&/^image\//.test(a.type||'');
  row.innerHTML='<div class="att-ico">'+(a.url?'🔗':(img?'🖼':'📄'))+'</div><span class="att-name" title="'+esc(a.name)+'">'+esc(a.name)+'</span>'+(a.size?'<span class="att-size">'+fmtSize(a.size)+'</span>':'')+(a.missing?'<span class="att-size">(file không đi kèm liên kết mời)</span>':(a.url?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener">Mở</a>':'<a href="#" data-dl>Tải</a>'))+'<button type="button" class="ck-del" aria-label="Xóa tệp">×</button>';
  if(img)fileBlob(a).then(bl=>{if(bl){const u=URL.createObjectURL(bl);row.querySelector('.att-ico').innerHTML='<img alt="" src="'+u+'">'}});
  const dl=row.querySelector('[data-dl]');
  if(dl)dl.onclick=async e=>{e.preventDefault();const bl=await fileBlob(a);if(!bl){showToast('Không tìm thấy nội dung tệp này');return}const u=URL.createObjectURL(bl),l=document.createElement('a');l.href=u;l.download=a.name;document.body.appendChild(l);l.click();setTimeout(()=>{URL.revokeObjectURL(u);l.remove()},800)};
  row.querySelector('.ck-del').onclick=()=>{draftAtt.splice(i,1);renderAtt()};
  box.appendChild(row);
 });
}
$('attFile').addEventListener('change',async e=>{
 const files=[...e.target.files];e.target.value='';
 for(const f of files){
  if(f.size>MAX_FILE){showToast('“'+f.name+'” lớn hơn 10 MB, hãy dán liên kết thay thế');continue}
  const id=uid();
  try{
   if(navigator.storage&&navigator.storage.estimate){const est=await navigator.storage.estimate();if(est.quota&&est.quota-est.usage<f.size*2){showToast('Bộ nhớ trình duyệt không đủ chỗ cho “'+f.name+'”');continue}}
   await FileStore.put(id,f);draftAtt.push({id,name:f.name,size:f.size,type:f.type,idb:true});
  }catch(err){
   if(f.size<=MAX_INLINE){const data=await new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result);r.readAsDataURL(f)});draftAtt.push({id,name:f.name,size:f.size,type:f.type,data})}
   else showToast('Trình duyệt không cho lưu file lớn ở chế độ này. Hãy dùng file dưới 300 KB hoặc dán liên kết.');
  }
 }
 renderAtt();
});
function addAttLink(){
 const v=$('attLink').value.trim();if(!v)return;
 let u;try{u=new URL(/^https?:\/\//i.test(v)?v:'https://'+v)}catch(e){showToast('Liên kết chưa hợp lệ');return}
 draftAtt.push({id:uid(),name:u.hostname.replace(/^www\./,'')+(u.pathname.length>1?u.pathname.slice(0,28):''),url:u.href});$('attLink').value='';renderAtt();
}
$('attLinkBtn').onclick=addAttLink;$('attLink').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addAttLink()}});
async function migrateFiles(){
 let changed=false;
 for(const b of db.boards)for(const t of b.tasks)for(const a of(t.attachments||[])){if(a.data&&!a.idb){try{const bl=await(await fetch(a.data)).blob();await FileStore.put(a.id,bl);delete a.data;a.idb=true;changed=true}catch(e){}}}
 if(changed)save();
}
async function gcFiles(){
 try{
  const keep=new Set();
  for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('kanban_s2_data_')){try{JSON.parse(localStorage.getItem(k)).boards.forEach(bb=>(bb.tasks||[]).forEach(t=>(t.attachments||[]).forEach(a=>keep.add(a.id))))}catch(e){}}}
  for(const k of await FileStore.keys()){if(!keep.has(k))await FileStore.del(k)}
 }catch(e){}
}
async function updateStorageInfo(){
 const el=$('storageInfo');let txt='';
 try{const est=await navigator.storage.estimate();txt='Trình duyệt đã dùng '+fmtSize(est.usage)+' / '+fmtSize(est.quota)}catch(e){txt='Không đọc được dung lượng trình duyệt'}
 el.textContent=txt+' · Dữ liệu bảng của bạn: '+fmtSize(db?JSON.stringify(db).length:0);
}

/* ---------- Bình luận & @nhắc tên ---------- */
function timeAgo(iso){const d=(Date.now()-new Date(iso).getTime())/60000;if(d<1)return 'vừa xong';if(d<60)return Math.floor(d)+' phút trước';if(d<1440)return Math.floor(d/60)+' giờ trước';if(d<10080)return Math.floor(d/1440)+' ngày trước';const x=new Date(iso);return pad(x.getDate())+'/'+pad(x.getMonth()+1)+'/'+x.getFullYear()}
function mentionHtml(text,b){
 let h=esc(text);
 [...b.members].sort((x,y)=>y.name.length-x.name.length).forEach(m=>{h=h.replace(new RegExp('@'+escRe(esc(m.name))+'(?![\\p{L}\\p{N}])','giu'),x=>'<span class="mention">'+x+'</span>')});
 return h;
}
function currentComments(){const b=board();const t=editId?b.tasks.find(x=>x.id===editId):null;return t?(t.comments=t.comments||[]):draftComments}
function renderComments(){
 const b=board(),list=currentComments(),box=$('cmList');box.innerHTML='';$('cmCount').textContent=list.length?'('+list.length+')':'';
 list.forEach((c,i)=>{
  const m=memberOf(b,c.authorId),row=document.createElement('div');row.className='cm';
  row.innerHTML='<div class="mini-avatar '+((m&&m.color)||'')+'">'+esc(initials(c.authorName))+'</div><div class="cm-body"><div class="cm-head"><b>'+esc(c.authorName)+'</b><span>'+timeAgo(c.ts)+'</span>'+(c.authorId===user.email?'<button type="button" class="cm-del" title="Xóa bình luận" aria-label="Xóa bình luận">×</button>':'')+'</div><div class="cm-text">'+mentionHtml(c.text,b)+'</div></div>';
  const del=row.querySelector('.cm-del');if(del)del.onclick=()=>{list.splice(i,1);renderComments();render()};
  box.appendChild(row);
 });
 box.scrollTop=box.scrollHeight;
}
function sendComment(){
 const b=board(),text=$('cmText').value.trim();if(!text)return;
 const mentions=b.type==='team'?b.members.filter(m=>new RegExp('@'+escRe(m.name)+'(?![\\p{L}\\p{N}])','iu').test(text)).map(m=>m.id):[];
 currentComments().push({id:uid(),authorId:user.email,authorName:user.name,text,mentions,ts:new Date().toISOString()});
 $('cmText').value='';hideMentions();renderComments();if(editId)render();
}
$('cmSend').onclick=sendComment;
let mentionIdx=0,mentionList=[];
function hideMentions(){$('mentionPop').hidden=true;mentionList=[]}
function showMentions(){
 const b=board();if(b.type!=='team'){hideMentions();return}
 const ta=$('cmText'),before=ta.value.slice(0,ta.selectionStart),m=/@([^\s@]*)$/u.exec(before);
 if(!m){hideMentions();return}
 const q=m[1].toLowerCase();
 mentionList=b.members.filter(x=>x.id!==user.email&&(!q||x.name.toLowerCase().split(/\s+/).some(w=>w.startsWith(q))||x.name.toLowerCase().startsWith(q)));
 if(!mentionList.length){hideMentions();return}
 mentionIdx=Math.min(mentionIdx,mentionList.length-1);
 const pop=$('mentionPop');pop.hidden=false;
 pop.innerHTML=mentionList.map((x,i)=>'<button type="button" class="'+(i===mentionIdx?'on':'')+'" data-i="'+i+'"><span class="mini-avatar '+(x.color||'')+'">'+esc(initials(x.name))+'</span>'+esc(x.name)+'</button>').join('');
 pop.querySelectorAll('button').forEach(btn=>btn.onmousedown=e=>{e.preventDefault();pickMention(+btn.dataset.i)});
}
function pickMention(i){
 const ta=$('cmText'),m=mentionList[i];if(!m)return;
 const pos=ta.selectionStart,before=ta.value.slice(0,pos).replace(/@([^\s@]*)$/u,'@'+m.name+' ');
 ta.value=before+ta.value.slice(pos);ta.selectionStart=ta.selectionEnd=before.length;hideMentions();ta.focus();
}
$('cmText').addEventListener('input',()=>{mentionIdx=0;showMentions()});
$('cmText').addEventListener('keydown',e=>{
 if(!$('mentionPop').hidden&&mentionList.length){
  if(e.key==='ArrowDown'){e.preventDefault();mentionIdx=(mentionIdx+1)%mentionList.length;showMentions();return}
  if(e.key==='ArrowUp'){e.preventDefault();mentionIdx=(mentionIdx-1+mentionList.length)%mentionList.length;showMentions();return}
  if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();pickMention(mentionIdx);return}
  if(e.key==='Escape'){e.stopPropagation();hideMentions();return}
 }
 if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();sendComment()}
});
$('cmText').addEventListener('blur',()=>setTimeout(hideMentions,120));
