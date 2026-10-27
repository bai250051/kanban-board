/* Thông báo hạn nộp và nhắc việc */
/* ---------- Thông báo hạn nộp (kiểu Edux) ---------- */
function deadlineItems(){
 const now=Date.now(),out=[];
 db.boards.forEach(b=>b.tasks.forEach(t=>{
  if(isDone(b,t)||!t.due)return;
  if(b.type==='team'&&t.assignee!==user.email)return;
  const ts=dueTs(t.due);if(isNaN(ts))return;
  const remindMs=(t.remind||0)*60000;let state=null;
  if(ts<now)state='late';else if(remindMs&&ts-now<=remindMs)state='soon';else if(ts-now<=7*86400000)state='up';
  if(state)out.push({key:b.id+':'+t.id+':'+t.due+':'+state,state,t,b,ts});
 }));
 const today0=parseDay(vnToday());
 db.boards.forEach(b=>{if(b.type!=='personal')return;(b.events||[]).forEach(ev0=>{[0,1].forEach(k=>{const day=ymd(addDay(today0,k));if(!eventOccursOn(ev0,day))return;const ev=occ(ev0,day),ts=new Date(day+'T'+ev.start).getTime();if(ts<now)return;const rm=(ev.remind==null?15:ev.remind)*60000;let state=null;if(rm&&ts-now<=rm)state='soon';else if(ts-now<=24*3600000)state='up';if(state)out.push({key:b.id+':e'+ev.id+':'+day+':'+state,state,ev,day,b,ts,t:{id:ev.id,title:ev.title,due:day+'T'+ev.start,remind:ev.remind}})})})});
 return out.sort((a,b)=>a.ts-b.ts);
}
function mentionItems(){
 const out=[];db.boards.forEach(b=>{if(b.type!=='team')return;b.tasks.forEach(t=>(t.comments||[]).forEach(c=>{if((c.mentions||[]).includes(user.email)&&c.authorId!==user.email)out.push({key:'m:'+c.id,t,b,c})}))});
 return out.sort((x,y)=>new Date(y.c.ts)-new Date(x.c.ts));
}
function renderNotifications(){
 if(!user)return;
 const items=deadlineItems(),ments=mentionItems(),unread=items.filter(i=>i.state!=='up'&&!db.seen[i.key]&&!(db.ack||{})[i.key]).length+ments.filter(i=>!db.seen[i.key]).length;
 const badge=$('notifyCount');badge.hidden=!unread;badge.textContent=unread>9?'9+':unread;
 document.title=(unread?'('+unread+') ':'')+'Kanban Board';
 const groups=[['late','QUÁ HẠN','n-late'],['soon','SẮP ĐẾN HẠN / SẮP DIỄN RA','n-soon'],['up','SẮP TỚI','n-up']];
 let html='';
 const pendRo=pendingRollover().length;
 if(pendRo)html+='<button type="button" class="notification-item rollover-link" data-ro="1">↻ Có '+pendRo+' việc chưa xong từ trước hôm nay · dời hạn hoặc giữ nguyên</button>';
 if(ments.length)html+='<div class="notif-group">NHẮC TÊN · '+ments.length+'</div>'+ments.map(i=>'<button class="notification-item notif-mention'+(!db.seen[i.key]?' unread':'')+'" data-key="'+esc(i.key)+'" data-b="'+esc(i.b.id)+'" data-t="'+esc(i.t.id)+'"><strong>'+esc(i.c.authorName)+' đã nhắc bạn · '+timeAgo(i.c.ts)+'</strong><span class="n-title">'+esc(i.t.title)+'</span><span>'+esc(i.b.name)+' · “'+esc(i.c.text.length>70?i.c.text.slice(0,70)+'…':i.c.text)+'”</span></button>').join('');
 groups.forEach(([st,label,cls])=>{
  const list=items.filter(i=>i.state===st);if(!list.length)return;
  html+='<div class="notif-group">'+label+' · '+list.length+'</div>'+list.map(i=>{
   const c=countdown(i.t.due),acked=!!(db.ack||{})[i.key],attrs=' data-key="'+esc(i.key)+'" data-b="'+esc(i.b.id)+'" data-t="'+esc(i.t.id)+'"'+(i.ev?' data-ev="'+esc(i.day)+'"':'');
   const unreadCls=(i.state!=='up'&&!db.seen[i.key]&&!acked?' unread':'');
   const body='<strong>'+esc(c.text)+'</strong><span class="n-title">'+(i.ev?'🗓 ':'')+esc(i.t.title)+'</span><span>'+esc(i.b.name)+' · '+(i.ev?'Bắt đầu ':'Hạn ')+fmtDue(i.t.due)+'</span>';
   if(i.state==='late'&&!i.ev)return '<div class="notification-item has-actions '+cls+unreadCls+'"'+attrs+'><button type="button" class="ni-main">'+body+'</button>'+(acked?'<div class="ni-ack">✗ Đã xác nhận: chưa hoàn thành, thẻ giữ nguyên</div>':'<div class="ni-actions"><button type="button" class="ni-done" data-act="done">✓ Đã hoàn thành</button><button type="button" class="ni-no" data-act="no">✗ Chưa hoàn thành</button></div>')+'</div>';
   return '<button class="notification-item '+cls+unreadCls+'"'+attrs+'>'+body+'</button>';
  }).join('');
 });
 $('notificationList').innerHTML=html||'<div class="notification-empty">Không có thông báo nào. 🎉</div>';
 $('notificationList').querySelectorAll('[data-ro]').forEach(el=>el.onclick=()=>{$('notificationPanel').classList.remove('open');openRollover()});
 const openFrom=el=>{viewMode='board';db.seen[el.dataset.key]=1;$('notificationPanel').classList.remove('open');db.current=el.dataset.b;render();if(el.dataset.ev)openEvent(el.dataset.t,el.dataset.ev);else openTask(el.dataset.t)};
 $('notificationList').querySelectorAll('.notification-item:not(.has-actions):not([data-ro])').forEach(el=>el.onclick=()=>openFrom(el));
 $('notificationList').querySelectorAll('.notification-item.has-actions').forEach(el=>{
  el.querySelector('.ni-main').onclick=()=>openFrom(el);
  const done=el.querySelector('[data-act=done]'),no=el.querySelector('[data-act=no]');
  if(done)done.onclick=e=>{e.stopPropagation();const b=db.boards.find(x=>x.id===el.dataset.b),t=b&&b.tasks.find(x=>x.id===el.dataset.t),dc=b&&cols(b).find(c=>c.done);if(!t||!dc)return;pushUndo();setStatus(b,t,dc.id);db.seen[el.dataset.key]=1;render();showToast('Đã chuyển “'+t.title+'” sang “'+dc.name+'”',true)};
  if(no)no.onclick=e=>{e.stopPropagation();db.ack=db.ack||{};db.ack[el.dataset.key]=1;db.seen[el.dataset.key]=1;save();renderNotifications();showToast('Đã ghi nhận: thẻ vẫn chưa hoàn thành và được giữ nguyên')};
 });
 const perm='Notification' in window?Notification.permission:'unsupported';
 $('permStatus').textContent=perm==='granted'?'Nhắc trên trình duyệt: đang bật':perm==='denied'?'Trình duyệt đang chặn thông báo':perm==='unsupported'?'Trình duyệt không hỗ trợ':'Nhắc trên trình duyệt: chưa bật';
 $('permBtn').hidden=perm!=='default';
}
function notifyBrowser(i){
 if(!('Notification' in window)||Notification.permission!=='granted')return;
 try{new Notification(i.state==='late'?'Công việc đã quá hạn':(i.ev?'Sắp bắt đầu: ':'Sắp đến hạn: ')+countdown(i.t.due).text.replace('Còn ','còn '),{body:i.t.title+' — '+i.b.name+' ('+(i.ev?'bắt đầu ':'hạn ')+fmtDue(i.t.due)+')'})}catch(e){}
}
function checkReminders(){
 if(!user||!db)return;
 const fresh=deadlineItems().filter(i=>i.state!=='up'&&!db.fired[i.key]);
 if(fresh.length){
  fresh.forEach(i=>{db.fired[i.key]=1;notifyBrowser(i)});save();
  showToast(fresh.length===1?(fresh[0].state==='late'?'Quá hạn: ':(fresh[0].ev?'Sắp bắt đầu: ':'Sắp đến hạn: '))+fresh[0].t.title:'Bạn có '+fresh.length+' công việc cần chú ý về hạn nộp');
 }
 renderNotifications();
}
$('notifyBtn').onclick=e=>{e.stopPropagation();const p=$('notificationPanel');p.classList.toggle('open');$('notifyBtn').setAttribute('aria-expanded',p.classList.contains('open'))};
$('notificationPanel').addEventListener('click',e=>e.stopPropagation());
document.addEventListener('click',()=>$('notificationPanel').classList.remove('open'));
$('markReadBtn').onclick=()=>{deadlineItems().forEach(i=>db.seen[i.key]=1);mentionItems().forEach(i=>db.seen[i.key]=1);save();renderNotifications()};
$('permBtn').onclick=()=>{try{Notification.requestPermission().then(()=>{renderNotifications();showToast(Notification.permission==='granted'?'Đã bật nhắc hạn trên trình duyệt':'Bạn chưa cho phép thông báo')})}catch(e){showToast('Trình duyệt không hỗ trợ thông báo')}};
setInterval(()=>{if(!user)return;checkReminders();maybeRollover();if(!document.querySelector('.modal-backdrop.open')){const b=board();renderBoard(b);renderStats(b)}},30000);
