/* Thời khóa biểu tuần và lịch cố định */
/* ---------- Thời khóa biểu tuần (bảng cá nhân) ---------- */
const VN_TZ='Asia/Ho_Chi_Minh';
const vnTime24=new Intl.DateTimeFormat('vi-VN',{timeZone:VN_TZ,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const vnTime12=new Intl.DateTimeFormat('en-US',{timeZone:VN_TZ,hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true});
const vnTimeFmt={format:d=>timeFmt==='24'?vnTime24.format(d):vnTime12.format(d).replace(/\u202f/g,' ')};
const vnDateFmt=new Intl.DateTimeFormat('vi-VN',{timeZone:VN_TZ,weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
const vnDayFmt=new Intl.DateTimeFormat('en-CA',{timeZone:VN_TZ});
const vnToday=()=>vnDayFmt.format(new Date());
let lastVnDay=vnToday();
function tickClock(){
 const now=new Date();$('clockTime').textContent=vnTimeFmt.format(now);$('clockDate').textContent=vnDateFmt.format(now);
 const d=vnToday();if(d!==lastVnDay){lastVnDay=d;if(user&&db&&!document.querySelector('.modal-backdrop.open')){render();maybeRollover()}}
}
tickClock();setInterval(tickClock,1000);
let weekStart=mondayOf(parseDay(vnToday())),zoomDay=null;
function mondayOf(d){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
function parseDay(s){const p=s.split('-').map(Number);return new Date(p[0],p[1]-1,p[2])}
const addDay=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const dayShort=d=>d.getDay()===0?'Chủ Nhật':'Thứ '+(d.getDay()+1);
const dm=d=>pad(d.getDate())+'/'+pad(d.getMonth()+1);
function tasksOn(b,day,status){return b.tasks.filter(t=>t.due&&t.due.slice(0,10)===day&&(!status||t.status===status)&&matches(t,b)).sort((x,y)=>dueTs(x.due)-dueTs(y.due))}
function renderBoard(b){
 const personal=b.type==='personal';
 const tv=personal?'columns':(b.view||'columns');$('board').hidden=personal||tv!=='columns';$('teamAlt').hidden=personal||tv==='columns';$('weekWrap').hidden=!personal;
 $('boardPanelTitle').textContent=personal?'Thời khóa biểu tuần':'Bảng công việc';
 $('boardPanelSub').textContent=personal?(zoomDay?'Đang xem một ngày · kéo thẻ giữa các cột để đổi trạng thái':'Nhấn vào tên thứ để phóng to ngày đó · kéo thẻ sang ô khác để đổi ngày hoặc trạng thái'):({columns:'Kéo thả thẻ để cập nhật trạng thái',sprint:'Chọn sprint ở trên để xem tiến độ · kéo thẻ vào ô sprint để chuyển sprint',people:'Mỗi dải là một người · kéo thẻ sang dải khác để giao lại việc'})[tv];
 if(personal)renderWeek(b);else if(tv==='sprint')renderSprintView(b);else if(tv==='people')renderPeopleView(b);else renderTeamBoard(b);
}
function attachDrop(el,day,status){attachDropFn(el,id=>moveToCell(id,day,status))}
function moveToCell(id,day,status){
 const t=board().tasks.find(x=>x.id===id);if(!t)return;
 const time=t.due&&t.due.length>10?t.due.slice(11,16):'23:59',nd=day?day+'T'+time:'';
 if(nd===t.due&&(!status||status===t.status))return;pushUndo();
 if(nd!==t.due)Object.keys(db.fired).forEach(k=>{if(k.includes(':'+t.id+':'))delete db.fired[k]});
 t.due=nd;if(status)setStatus(board(),t,status);render();checkReminders();
 showToast(day?'Đã chuyển sang '+dayShort(parseDay(day))+' ('+dm(parseDay(day))+')':'Đã bỏ ngày, thẻ về khay chưa xếp ngày',true);
}
function openZoom(day){zoomDay=day;weekStart=mondayOf(parseDay(day));render()}
function renderWeek(b){
 const wrap=$('weekView'),tray=$('weekTray');
 $('weekBar').hidden=!!zoomDay;
 if(zoomDay){tray.hidden=true;tray.innerHTML='';return renderZoom(b)}
 tray.hidden=false;
 const days=[...Array(7)].map((_,i)=>addDay(weekStart,i)),today=vnToday();
 $('weekLabel').textContent='Tuần '+dm(days[0])+' – '+dm(days[6])+'/'+days[6].getFullYear();
 let h='<div class="week-scroll"><div class="week-grid"><div></div>'+days.map(d=>{const n=tasksOn(b,ymd(d)).length;return '<button class="wk-day'+(ymd(d)===today?' today':'')+'" data-day="'+ymd(d)+'" title="Phóng to ngày này">'+dayShort(d)+'<small>'+dm(d)+(n?' · '+n+' việc':'')+'</small></button>'}).join('');
 h+='<div class="wk-rowlabel events">Lịch cố định</div>'+days.map(d=>'<div class="wk-cell events'+(ymd(d)===today?' today-col':'')+'" data-day="'+ymd(d)+'"></div>').join('');
 cols(b).forEach((c,ci)=>{const cls=(['todo','doing','done'].includes(c.id)?c.id:'custom')+(ci===0?' first':'');h+='<div class="wk-rowlabel" style="background:'+esc(c.color)+'">'+esc(c.name)+'</div>'+days.map(d=>'<div class="wk-cell '+cls+'" data-day="'+ymd(d)+'" data-status="'+esc(c.id)+'"><button class="wk-add" title="Thêm việc vào ô này" aria-label="Thêm việc">＋</button></div>').join('')});
 wrap.innerHTML=h+'</div></div>';
 wrap.querySelector('.week-grid').style.gridTemplateColumns='72px '+days.map(d=>ymd(d)===today?'minmax(250px,2.2fr)':'minmax(104px,1fr)').join(' ');
 wrap.querySelectorAll('.wk-day').forEach(btn=>btn.onclick=()=>openZoom(btn.dataset.day));
 wrap.querySelectorAll('.wk-cell.events').forEach(cell=>{occurrencesOn(b,cell.dataset.day).forEach(ev=>cell.appendChild(makeEventChip(ev,cell.dataset.day)))});
 wrap.querySelectorAll('.wk-cell:not(.events)').forEach(cell=>{
  const day=cell.dataset.day,st=cell.dataset.status,add=cell.querySelector('.wk-add');
  if(day===today)cell.classList.add('today-col');
  tasksOn(b,day,st).forEach(t=>cell.insertBefore(makeCard(t,b,day!==today),add));
  attachDrop(cell,day,st);add.onclick=()=>openTask(null,st,day);
 });
 const free=b.tasks.filter(t=>!t.due&&matches(t,b)),late=b.tasks.filter(t=>t.due&&!isDone(b,t)&&t.due.slice(0,10)<ymd(weekStart)&&matches(t,b));
 tray.innerHTML='<div><div class="tray-title">Chưa xếp ngày · '+free.length+'<small>Kéo thẻ vào một ô để xếp lịch, hoặc kéo thẻ về đây để bỏ ngày</small></div><div class="tray-cards" id="trayFree"></div></div>'+(late.length?'<div><div class="tray-title late">Chưa xong từ các tuần trước · '+late.length+'</div><div class="tray-cards" id="trayLate"></div></div>':'');
 const tf=$('trayFree');free.forEach(t=>tf.appendChild(makeCard(t,b,'tray')));if(!free.length)tf.innerHTML='<span class="tray-empty">Không có thẻ nào chưa xếp ngày.</span>';attachDrop(tf,'',null);
 if(late.length){const tl=$('trayLate');late.forEach(t=>tl.appendChild(makeCard(t,b,'tray')))}
}
function renderZoom(b){
 const d=parseDay(zoomDay),wrap=$('weekView'),total=tasksOn(b,zoomDay).length;wrap.innerHTML='';
 const bar=document.createElement('div');bar.className='zoom-bar';
 bar.innerHTML='<button class="btn btn-light" data-z="back">← Cả tuần</button><div class="zoom-nav"><button class="icon-btn" data-z="prev" aria-label="Ngày trước">‹</button><div class="zoom-title">'+dayShort(d)+', '+dm(d)+'/'+d.getFullYear()+' <span class="type-pill personal">'+total+' việc</span></div><button class="icon-btn" data-z="next" aria-label="Ngày sau">›</button></div><button class="btn btn-primary" data-z="add">＋ Thêm việc ngày này</button>';
 bar.querySelector('[data-z=back]').onclick=()=>{zoomDay=null;render()};
 bar.querySelector('[data-z=prev]').onclick=()=>openZoom(ymd(addDay(d,-1)));
 bar.querySelector('[data-z=next]').onclick=()=>openZoom(ymd(addDay(d,1)));
 bar.querySelector('[data-z=add]').onclick=()=>openTask(null,null,zoomDay);
 wrap.appendChild(bar);
 const evs=occurrencesOn(b,zoomDay);
 if(evs.length){const sec=document.createElement('div');sec.className='zoom-events';sec.innerHTML='<div class="tray-title">Lịch cố định trong ngày · '+evs.length+'</div>';const lst=document.createElement('div');lst.className='ev-list';evs.forEach(ev=>lst.appendChild(makeEventChip(ev,zoomDay)));sec.appendChild(lst);wrap.appendChild(sec)}
 const bd=document.createElement('div');bd.className='board zoom-board';
 setBoardCols(bd,cols(b).length);
 cols(b).forEach(c=>{const col=buildColumn(c,tasksOn(b,zoomDay,c.id),b);col.querySelector('.add-card').onclick=()=>openTask(null,c.id,zoomDay);attachDrop(col,zoomDay,c.id);bd.appendChild(col)});
 wrap.appendChild(bd);
}
$('prevWeek').onclick=()=>{weekStart=addDay(weekStart,-7);render()};
$('nextWeek').onclick=()=>{weekStart=addDay(weekStart,7);render()};
$('thisWeek').onclick=()=>{weekStart=mondayOf(parseDay(vnToday()));render()};


/* ---------- Lịch cố định (lặp theo tuần) ---------- */
const vnHMFmt=new Intl.DateTimeFormat('en-GB',{timeZone:VN_TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const vnNowHM=()=>vnHMFmt.format(new Date());
let evEdit=null,evDeleteArmed=false;
function eventOccursOn(e,day){return day>=e.from&&day<=e.to&&!(e.skip||[]).includes(day)&&e.days.includes(parseDay(day).getDay())}
const occ=(ev,day)=>{const o=(ev.overrides||{})[day];return o?{...ev,...o,overridden:true}:ev};
function occurrencesOn(b,day){return(b.events||[]).filter(e=>eventOccursOn(e,day)).map(e=>occ(e,day)).sort((x,y)=>x.start.localeCompare(y.start))}
function describeDays(d){
 const k=[...d].sort((x,y)=>((x+6)%7)-((y+6)%7)).join(',');
 if(k==='1,2,3,4,5,6,0')return 'mỗi ngày';if(k==='1,2,3,4,5')return 'Thứ 2 – Thứ 6';if(k==='6,0')return 'cuối tuần';
 return k.split(',').map(x=>+x===0?'CN':'T'+(+x+1)).join(', ');
}
const fmtDay=s=>{const d=parseDay(s);return dm(d)+'/'+d.getFullYear()};
function eventConflicts(v,ignoreId,b){
 const others=(b.events||[]).filter(e=>e.id!==ignoreId);if(!others.length||!v.from||!v.to)return[];
 const out=[];let d=parseDay(v.from);const e=parseDay(v.to);let k=0;
 while(d<=e&&k++<800){const ds=ymd(d);if(v.days.includes(d.getDay()))others.forEach(o=>{if(eventOccursOn(o,ds)&&o.start<v.end&&v.start<o.end)out.push({o,ds})});d=addDay(d,1)}
 return out;
}
function makeEventChip(ev,day){
 const today=vnToday(),now=vnNowHM();let st='';
 if(day===today){if(now>=ev.end)st='past';else if(now>=ev.start)st='live'}else if(day<today)st='past';
 const el=document.createElement('button');el.type='button';el.className='ev-chip '+st;
 el.innerHTML='<span class="ev-time">'+esc(fmtT(ev.start))+'–'+esc(fmtT(ev.end))+(ev.overridden?'<b class="ev-edit" title="Buổi này đã chỉnh riêng">✎</b>':'')+(st==='live'?'<b class="ev-live">Đang diễn ra</b>':'')+'</span><span class="ev-title">'+esc(ev.title)+'</span>'+(ev.place?'<span class="ev-place">📍 '+esc(ev.place)+'</span>':'');
 el.title=ev.title+(ev.place?' · '+ev.place:'');el.onclick=()=>openEvent(ev.id,day);return el;
}
function personalBoard(){const b=board();return b.type==='personal'?b:(db.boards.find(x=>x.type==='personal')||null)}
function routeSpeech(text,ctx){
 const ev=parseEventCommand(text,vnToday());
 if(ctx==='event'){
  if(ev.start||ev.days.length){setEventForm(ev,text)}else showToast('Mình chưa nghe ra giờ hoặc ngày, bạn nói lại nhé');
  return;
 }
 if(ev.isEvent){
  const pb=personalBoard();
  if(!pb){showToast('Cần có một bảng cá nhân để thêm lịch cố định');if(ctx==='task')applyVoice(text);return}
  closeModals();
  if(db.current!==pb.id){db.current=pb.id;zoomDay=null;render();showToast('Đã chuyển sang bảng cá nhân để thêm lịch cố định')}
  openEvent(null,null,ev,text);return;
 }
 if(ctx==='task')applyVoice(text);else{openTask();applyVoice(text)}
}
function setEventForm(v,text){
 $('evTitle').value=v.title||'';$('evPlace').value=v.place||'';$('evStart').value=v.start||$('evStart').value||'08:00';$('evEnd').value=v.end||$('evEnd').value||'09:00';
 if(v.from)$('evFrom').value=v.from;if(v.to)$('evTo').value=v.to;
 if(v.remind!=null)$('evRemind').value=String(v.remind);
 if(v.days&&v.days.length)document.querySelectorAll('#dayPicks input').forEach(i=>i.checked=v.days.includes(+i.value));
 $('evSpeech').textContent=text?'Đã nghe: “'+text+'”'+((v.notes&&v.notes.length)?' — '+v.notes.join('; ')+'.':''):'';
 updateEvSummary();
}
function readEventForm(){return{remind:+$('evRemind').value,title:$('evTitle').value.trim(),place:$('evPlace').value.trim(),start:$('evStart').value,end:$('evEnd').value,from:$('evFrom').value,to:$('evTo').value,days:[...document.querySelectorAll('#dayPicks input:checked')].map(i=>+i.value)}}
function updateEvSummary(){
 const v=readEventForm(),b=board(),ex=evEdit&&evEdit.id?(b.events||[]).find(x=>x.id===evEdit.id):null,skip=ex?ex.skip||[]:[];
 let n=0;if(v.from&&v.to&&v.days.length){let d=parseDay(v.from),k=0;const e=parseDay(v.to);while(d<=e&&k++<1000){const ds=ymd(d);if(v.days.includes(d.getDay())&&!skip.includes(ds))n++;d=addDay(d,1)}}
 $('evSummary').textContent=(v.title||'Lịch cố định')+' · '+(v.start?fmtT(v.start):'--:--')+'–'+(v.end?fmtT(v.end):'--:--')+' · '+(v.days.length?describeDays(v.days):'chưa chọn thứ')+' · '+(v.from?fmtDay(v.from):'?')+' → '+(v.to?fmtDay(v.to):'?')+' · '+n+' buổi';
 const w=$('evWarn');w.hidden=true;
 if(v.start&&v.end&&v.start<v.end&&n){
  const c=eventConflicts(v,ex?ex.id:null,b);
  if(c.length){const by={};c.forEach(x=>{(by[x.o.title]=by[x.o.title]||[]).push(x.ds)});w.hidden=false;w.textContent='⚠ Trùng giờ với '+Object.keys(by).map(t=>'“'+t+'” ('+by[t].length+' buổi, ví dụ '+dm(parseDay(by[t][0]))+')').join('; ')+'. Bạn vẫn có thể lưu.'}
 }
}
function openEvent(id,date,draft,text){
 const b=board();if(b.type!=='personal'){showToast('Lịch cố định chỉ dùng cho bảng cá nhân');return}
 b.events=b.events||[];const ex=id?b.events.find(e=>e.id===id):null;
 evEdit={id:ex?ex.id:null,date:date||null};evDeleteArmed=false;resetEvDelete();
 const t=vnToday(),v=ex||draft||{title:'',place:'',start:'08:00',end:'09:00',days:[1,2,3,4,5],from:t,to:ymd(addDay(parseDay(t),90)),notes:[]};
 $('evHeading').textContent=ex?'Chỉnh sửa lịch cố định':(draft?'Xác nhận lịch cố định':'Thêm lịch cố định');
 $('evVoiceStatus').textContent='';
 document.querySelectorAll('#dayPicks input').forEach(i=>i.checked=false);$('evRemind').value='15';
 setEventForm({...v,title:v.title,start:v.start,end:v.end},draft?text:'');
 $('evDelete').hidden=!ex;$('evSkip').hidden=!(ex&&date&&eventOccursOn(ex,date));
 const one=!!(ex&&date&&eventOccursOn(ex,date));$('evOne').hidden=!one;
 if(one){const o=occ(ex,date);$('evOneDate').textContent=dayShort(parseDay(date))+' '+dm(parseDay(date));$('evOneStart').value=o.start;$('evOneEnd').value=o.end;$('evOnePlace').value=(ex.overrides&&ex.overrides[date]&&ex.overrides[date].place)||'';$('evOneTag').textContent=o.overridden?'(đang chỉnh riêng)':'';$('evOneReset').hidden=!o.overridden}
 if(ex&&date)$('evSkip').textContent='Nghỉ buổi '+dm(parseDay(date));
 openModal('eventModal');
}
function resetEvDelete(){const x=$('evDelete');x.classList.remove('armed');x.textContent='🗑 Xóa cả chuỗi'}
$('eventForm').addEventListener('input',updateEvSummary);
document.querySelectorAll('[data-pick]').forEach(btn=>btn.onclick=()=>{const set={all:[0,1,2,3,4,5,6],wk:[1,2,3,4,5],we:[6,0]}[btn.dataset.pick];document.querySelectorAll('#dayPicks input').forEach(i=>i.checked=set.includes(+i.value));updateEvSummary()});
$('eventForm').addEventListener('submit',e=>{
 e.preventDefault();const b=board(),v=readEventForm();if(!v.title)return;
 if(!v.start||!v.end||v.start>=v.end){showToast('Giờ kết thúc phải sau giờ bắt đầu');return}
 if(!v.from||!v.to||v.from>v.to){showToast('Ngày kết thúc phải sau ngày bắt đầu');return}
 if(!v.days.length){showToast('Hãy chọn ít nhất một thứ trong tuần');return}
 b.events=b.events||[];const ex=evEdit&&evEdit.id?b.events.find(x=>x.id===evEdit.id):null;
 if(ex)Object.assign(ex,v);else b.events.push({id:uid(),...v,skip:[]});
 let n=0,d=parseDay(v.from),k=0;const en=parseDay(v.to);while(d<=en&&k++<1000){if(v.days.includes(d.getDay()))n++;d=addDay(d,1)}
 closeModals();render();showToast((ex?'Đã cập nhật lịch “':'Đã thêm lịch “')+v.title+'” ('+n+' buổi)');
});
$('evOneSave').onclick=()=>{
 const b=board(),ex=b.events.find(x=>x.id===evEdit.id),st=$('evOneStart').value,en=$('evOneEnd').value,pl=$('evOnePlace').value.trim();
 if(!ex||!evEdit.date)return;if(!st||!en||st>=en){showToast('Giờ kết thúc phải sau giờ bắt đầu');return}
 pushUndo();ex.overrides=ex.overrides||{};ex.overrides[evEdit.date]={start:st,end:en,...(pl?{place:pl}:{})};
 closeModals();render();showToast('Đã chỉnh riêng buổi '+dm(parseDay(evEdit.date))+' ('+st+'–'+en+')',true);
};
$('evOneReset').onclick=()=>{const b=board(),ex=b.events.find(x=>x.id===evEdit.id);if(!ex||!evEdit.date)return;pushUndo();if(ex.overrides)delete ex.overrides[evEdit.date];closeModals();render();showToast('Đã bỏ chỉnh sửa riêng, buổi này theo giờ của cả chuỗi',true)};
$('evSkip').onclick=()=>{const b=board(),ex=b.events.find(x=>x.id===evEdit.id);if(!ex||!evEdit.date)return;ex.skip=ex.skip||[];pushUndo();if(!ex.skip.includes(evEdit.date))ex.skip.push(evEdit.date);closeModals();render();showToast('Đã nghỉ buổi '+dm(parseDay(evEdit.date)),true)};
$('evDelete').onclick=()=>{
 if(!evDeleteArmed){evDeleteArmed=true;$('evDelete').classList.add('armed');$('evDelete').textContent='Bấm lần nữa để xóa';setTimeout(()=>{evDeleteArmed=false;resetEvDelete()},3500);return}
 const b=board();pushUndo();b.events=(b.events||[]).filter(x=>x.id!==evEdit.id);closeModals();render();showToast('Đã xóa cả chuỗi lịch',true);
};
$('addEventBtn').onclick=()=>openEvent(null,null,null);
