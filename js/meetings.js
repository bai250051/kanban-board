/* Cuộc họp nhóm: tạo, đặt lịch và báo trùng lịch (Sprint 5).
   - Cuộc họp lưu ngay trong bảng nhóm: b.meetings=[{id,title,start:'YYYY-MM-DDTHH:MM',dur,place,note,att:[mã thành viên],by,created}].
     Nhờ vậy cuộc họp đi theo cơ chế đồng bộ và gộp theo mã của bảng nhóm, không cần bảng riêng.
   - Bảng cá nhân của mỗi người là dữ liệu riêng nên mỗi máy tự đẩy lên "khung giờ bận" của chính mình
     (chỉ giờ bắt đầu, giờ kết thúc và loại, KHÔNG kèm tên việc) qua Store.busy.push. Khi đặt giờ họp, web đọc khung giờ bận
     của các thành viên qua Store.busy.board (chỉ thành viên cùng bảng đọc được) rồi báo ai bị trùng.
     Loại khung giờ: f = lịch cố định, m = cuộc họp, d = việc đến hạn (chỉ nhắc nhẹ, không tính là trùng).
   - Khung giờ của người khác chỉ mới như lần cuối họ mở web; web ghi rõ khi dữ liệu cũ hoặc chưa có. */
const MT_WINDOW=42;                       // số ngày tới được đẩy lên khung giờ bận
const MT_KIND={f:'lịch cố định',m:'cuộc họp khác',d:'việc đến hạn'};
const mtEndOf=(start,dur)=>dtLocal(vnWall(new Date(dueTs(start)+dur*60000)));
const mtEnd=m=>mtEndOf(m.start,m.dur||60);
const hmOf=s=>fmtT(s.slice(11,16));
const mtRange=m=>hmOf(m.start)+'–'+hmOf(mtEnd(m));
const mtDayLabel=s=>{const d=parseDay(s.slice(0,10));return dayShort(d)+' '+dm(d)};

/* Các cuộc họp tôi được mời, ở mọi bảng nhóm */
function meetingsForMe(){
 const out=[];
 db.boards.forEach(b=>{if(b.type!=='team')return;(b.meetings||[]).forEach(m=>{if((m.att||[]).includes(user.email))out.push({b,m})})});
 return out.sort((x,y)=>x.m.start.localeCompare(y.m.start));
}

/* ---------- Khung giờ bận của chính mình ---------- */
function busySlotsNow(){
 const today=vnToday(),t0=parseDay(today),days=[...Array(MT_WINDOW)].map((_,i)=>ymd(addDay(t0,i))),last=days[days.length-1];
 const out=[],linked=typeof linkedKeys==='function'?linkedKeys():new Set();
 db.boards.forEach(b=>{
  if(b.type==='personal')days.forEach(day=>occurrencesOn(b,day).forEach(ev=>{if(ev.start&&ev.end&&ev.start<ev.end)out.push({s:day+'T'+ev.start,e:day+'T'+ev.end,k:'f'})}));
  b.tasks.forEach(t=>{
   if(!t.due||t.due.length<=10||isDone(b,t))return;
   if(b.type==='team'&&(t.assignee!==user.email||linked.has(b.id+':'+t.id)))return;
   const d=t.due.slice(0,16);if(d.slice(0,10)<today||d.slice(0,10)>last)return;
   out.push({s:d,e:d,k:'d'});
  });
 });
 meetingsForMe().forEach(({m})=>{const dd=m.start.slice(0,10);if(dd>=today&&dd<=last)out.push({s:m.start,e:mtEnd(m),k:'m',r:m.id})});
 return out.sort((a,b)=>a.s.localeCompare(b.s)).slice(0,2500);
}
let busyTimer=null,busyLast=null,busyUser='',busyRetryAt=0;
async function pushBusyNow(){
 if(!db||!user||!Store.busy||Date.now()<busyRetryAt)return;
 if(busyUser!==user.email){busyUser=user.email;busyLast=null}
 const slots=db.shareBusy===false?[]:busySlotsNow(),j=JSON.stringify(slots);
 if(j===busyLast)return;
 try{await Store.busy.push(slots);busyLast=j}catch(e){busyRetryAt=Date.now()+60000}   // máy chủ chưa có bảng hoặc mất mạng: thử lại sau 1 phút
}
function scheduleBusyPush(){
 if(busyTimer)return;
 busyTimer=setTimeout(()=>{busyTimer=null;pushBusyNow()},2000);
}

/* ---------- Đọc khung giờ bận của các thành viên ---------- */
const mtBusy={};
async function mtFetchBusy(b,force){
 const c=mtBusy[b.id];if(!force&&c&&Date.now()-c.at<45000)return c;
 let map={},err=null;
 try{if(Store.busy)map=await Store.busy.board(b.id,b.members.map(m=>m.id));else err='Chưa hỗ trợ'}catch(e){err=(e&&(e.message||e.code))||'lỗi'}
 return mtBusy[b.id]={at:Date.now(),map,err};
}

/* ---------- Tìm trùng lịch (hàm thuần, dễ kiểm thử) ---------- */
function mtConflicts(b,start,dur,att,ignoreId,map,mySlots){
 const end=mtEndOf(start,dur),day=start.slice(0,10);
 const inBoard=new Set((b.meetings||[]).map(x=>x.id));
 return att.map(id=>{
  const mem=memberOf(b,id)||{id,name:'Thành viên'},hard=[],soft=[];let sameDay=0;
  (b.meetings||[]).forEach(o=>{
   if(o.id===ignoreId||!(o.att||[]).includes(id))return;
   const oe=mtEnd(o);if(o.start<end&&start<oe)hard.push({k:'m',s:o.start,e:oe,t:o.title});
  });
  const row=id===user.email?null:map[id],slots=id===user.email?mySlots:(row?row.slots:[]);
  slots.forEach(x=>{
   if(x.k==='m'&&inBoard.has(x.r))return;           // cuộc họp của bảng này đã xét ở trên
   if(x.k==='d'){if(x.s>=start&&x.s<=end)soft.push({k:'d',s:x.s});else if(x.s.slice(0,10)===day)sameDay++;return}
   if(x.s<end&&start<x.e)hard.push({k:x.k,s:x.s,e:x.e});
  });
  const stale=row&&row.updated_at&&Date.now()-Date.parse(row.updated_at)>3*86400000;
  return{id,name:mem.name,hard,soft,sameDay,noData:id!==user.email&&!row,stale:stale?row.updated_at:null};
 });
}
function mtSuggest(b,dur,att,ignoreId,map,mySlots,fromDay){
 const out=[],nowTs=Date.now();let d=parseDay(fromDay);
 for(let i=0;i<14&&out.length<6;i++,d=addDay(d,1)){
  const day=ymd(d);let perDay=0;
  for(let mins=7*60;mins+dur<=22*60&&perDay<2&&out.length<6;mins+=30){
   const st=day+'T'+pad(Math.floor(mins/60))+':'+pad(mins%60);
   if(dueTs(st)<=nowTs)continue;
   if(mtConflicts(b,st,dur,att,ignoreId,map,mySlots).every(x=>!x.hard.length&&!x.soft.length)){out.push(st);perDay++;mins+=Math.max(0,dur-30)}
  }
 }
 return out;
}
function mtCheckHtml(res,info){
 const bad=res.filter(x=>x.hard.length);
 let h=bad.length?'<div class="mt-sum">⚠ '+bad.length+'/'+res.length+' người trùng lịch</div>':'<div class="mt-sum">✓ Không ai trùng lịch ('+res.length+' người)</div>';
 if(info&&info.err)h+='<div class="mt-line">Chưa đọc được lịch của thành viên khác ('+esc(info.err)+'). Cần chạy <b>supabase/meetings.sql</b> trên Supabase. Hiện chỉ kiểm tra được lịch của bạn và các cuộc họp trong nhóm.</div>';
 res.forEach(x=>{
  const lines=[];
  x.hard.forEach(y=>lines.push('⚠ trùng '+MT_KIND[y.k]+' '+hmOf(y.s)+'–'+hmOf(y.e)+(y.t?' “'+esc(y.t)+'”':'')));
  x.soft.forEach(y=>lines.push('● có việc đến hạn lúc '+hmOf(y.s)+' trong giờ họp'));
  if(x.sameDay)lines.push('· '+x.sameDay+' việc đến hạn cùng ngày');
  if(x.noData&&!(info&&info.err))lines.push('· chưa có dữ liệu lịch (bạn ấy chưa mở web bản mới)');
  if(x.stale){const d=new Date(x.stale);lines.push('· lịch cập nhật lần cuối '+pad(d.getDate())+'/'+pad(d.getMonth()+1))}
  if(!lines.length)return;
  h+='<div class="mt-line"><b>'+esc(x.name)+(x.id===user.email?' (tôi)':'')+'</b>: '+lines.join(' · ')+'</div>';
 });
 return h;
}

/* ---------- Danh sách cuộc họp của bảng nhóm ---------- */
let mtListBoard=null;
function openMeetings(){
 const b=board();if(b.type!=='team')return;
 mtListBoard=b;renderMeetingList();openModal('meetingsModal');
}
function renderMeetingList(){
 const b=mtListBoard,box=$('mtList'),now=Date.now();
 const all=[...(b.meetings||[])].sort((x,y)=>x.start.localeCompare(y.start));
 const up=all.filter(m=>dueTs(mtEnd(m))>=now),past=all.filter(m=>dueTs(mtEnd(m))<now).reverse();
 const row=m=>{
  const by=memberOf(b,m.by),mine=(m.att||[]).includes(user.email);
  return'<button type="button" class="mt-row" data-id="'+esc(m.id)+'"><div class="mt-when"><b>'+esc(mtDayLabel(m.start))+'</b><span>'+esc(mtRange(m))+'</span></div><div class="mt-main"><div class="mt-title">'+esc(m.title)+'</div><div class="mt-meta">'+(m.place?'📍 '+esc(m.place)+' · ':'')+'👥 '+(m.att||[]).length+' người'+(by?' · tạo bởi '+esc(by.id===user.email?'bạn':by.name):'')+(mine?'':' · bạn không trong danh sách')+'</div></div>'+(mine&&mtJoinState(m)==='ok'?'<span class="mt-join">📹 Vào họp</span>':'')+'</button>';
 };
 box.innerHTML=(up.length?up.map(row).join(''):'<div class="notification-empty">Chưa có cuộc họp sắp tới. Bấm “Tạo cuộc họp” để đặt lịch, web sẽ báo ai đang trùng lịch.</div>')
  +(past.length?'<details class="mt-past"><summary>Đã qua · '+past.length+'</summary>'+past.map(row).join('')+'</details>':'');
 box.querySelectorAll('.mt-row').forEach(el=>el.onclick=e=>{const m=b.meetings.find(x=>x.id===el.dataset.id);if(!m)return;closeModals();if(e.target.closest('.mt-join'))joinMeeting(b,m);else openMeetingForm(b,m)});
}
$('meetingsBtn').onclick=openMeetings;
$('mtNewBtn').onclick=()=>{const b=mtListBoard||board();closeModals();openMeetingForm(b,null)};

/* ---------- Biểu mẫu cuộc họp ---------- */
let mtBoard=null,mtEditId=null,mtRO=false,mtTok=0,mtTimer=null;
tpInit($('mtStart'),$('mtStartTp'));
const mtRead=()=>({title:$('mtTitle').value.trim(),date:$('mtDate').value,time:$('mtStart').value,dur:+$('mtDur').value||60,place:$('mtPlace').value.trim(),note:$('mtNote').value.trim(),att:[...$('mtAtt').querySelectorAll('input:checked')].map(i=>i.value)});
function openMeetingForm(b,m){
 mtBoard=b;mtEditId=m?m.id:null;
 const canEdit=!m||m.by===user.email||b.owner===user.email;mtRO=!canEdit;
 $('mtHeading').textContent=m?(canEdit?'Sửa cuộc họp':'Cuộc họp'):'Tạo cuộc họp';
 $('mtTitle').value=m?m.title:'';
 $('mtDate').value=m?m.start.slice(0,10):ymd(addDay(parseDay(vnToday()),1));
 $('mtStart').value=m?m.start.slice(11,16):'09:00';
 const dur=String(m?(m.dur||60):60);
 if(![...$('mtDur').options].some(o=>o.value===dur)){const o=document.createElement('option');o.value=dur;o.textContent=dur+' phút';$('mtDur').appendChild(o)}
 $('mtDur').value=dur;$('mtPlace').value=m?m.place||'':'';$('mtNote').value=m?m.note||'':'';
 const att=m?(m.att||[]):b.members.map(x=>x.id);
 $('mtAtt').innerHTML=b.members.map(x=>'<label class="mt-att"><input type="checkbox" value="'+esc(x.id)+'"'+(att.includes(x.id)?' checked':'')+'><span>'+esc(x.name)+(x.id===user.email?' (tôi)':'')+'</span></label>').join('');
 $('mtForm').querySelectorAll('input,select,textarea,button.mt-edit-only').forEach(el=>{el.disabled=mtRO});
 $('mtDelete').hidden=!m||mtRO;$('mtSave').hidden=mtRO;$('mtSuggestBtn').hidden=mtRO;$('mtAttAll').hidden=mtRO;$('mtSuggest').innerHTML='';
 $('mtRoNote').hidden=!mtRO;
 mtUpdateJoinRow(m);
 openModal('meetingModal');mtRecheck(true);
}
function mtRecheck(force){clearTimeout(mtTimer);mtTimer=setTimeout(()=>mtDoCheck(force),force?0:250)}
async function mtDoCheck(force){
 const b=mtBoard;if(!b)return;
 const tok=++mtTok,box=$('mtCheck'),v=mtRead();
 if(!v.date||!v.time||!v.att.length){box.className='mt-check';box.textContent='Chọn ngày, giờ và người tham gia để kiểm tra trùng lịch.';return}
 box.className='mt-check';box.textContent='Đang kiểm tra lịch…';
 const info=await mtFetchBusy(b,force);if(tok!==mtTok)return;
 const res=mtConflicts(b,v.date+'T'+v.time,v.dur,v.att,mtEditId,info.map,busySlotsNow());
 box.className='mt-check '+(res.some(x=>x.hard.length)?'warn':'ok');
 box.innerHTML=mtCheckHtml(res,info);
}
['mtDate','mtStart','mtDur'].forEach(id=>$(id).addEventListener('input',()=>mtRecheck(false)));
$('mtDur').addEventListener('change',()=>mtRecheck(false));
$('mtAtt').addEventListener('change',()=>mtRecheck(false));
$('mtAttAll').onclick=()=>{const all=[...$('mtAtt').querySelectorAll('input')],on=all.every(i=>i.checked);all.forEach(i=>{i.checked=!on});mtRecheck(false)};
$('mtSuggestBtn').onclick=async()=>{
 const b=mtBoard,v=mtRead(),box=$('mtSuggest');if(!b)return;
 if(!v.att.length){showToast('Chọn người tham gia trước');return}
 box.textContent='Đang tìm giờ trống…';
 const info=await mtFetchBusy(b,true),from=v.date&&v.date>=vnToday()?v.date:vnToday();
 const list=mtSuggest(b,v.dur,v.att,mtEditId,info.map,busySlotsNow(),from);
 box.innerHTML=list.length?'<span class="mt-sug-label">Giờ mọi người đều trống:</span>'+list.map(s=>'<button type="button" class="mt-chip" data-s="'+s+'">'+esc(mtDayLabel(s))+' · '+esc(hmOf(s))+'</button>').join(''):'<span class="mt-sug-label">Không tìm thấy giờ trống chung trong 14 ngày tới. Thử giảm số người hoặc thời lượng.</span>';
 box.querySelectorAll('.mt-chip').forEach(c=>c.onclick=()=>{$('mtDate').value=c.dataset.s.slice(0,10);$('mtStart').value=c.dataset.s.slice(11,16);mtRecheck(true)});
};
$('mtForm').onsubmit=e=>{
 e.preventDefault();
 const b=mtBoard;if(!b||mtRO)return;const v=mtRead();
 if(!v.title){showToast('Hãy đặt tên cuộc họp');return}
 if(!v.date||!v.time){showToast('Chọn ngày và giờ bắt đầu');return}
 if(!v.att.length){showToast('Chọn ít nhất một người tham gia');return}
 const start=v.date+'T'+v.time;
 const bad=mtConflicts(b,start,v.dur,v.att,mtEditId,(mtBusy[b.id]||{}).map||{},busySlotsNow()).filter(x=>x.hard.length);
 if(bad.length&&!confirm(bad.map(x=>x.name).join(', ')+' đang trùng lịch. Vẫn đặt cuộc họp này?'))return;
 pushUndo();
 if(mtEditId){const m=b.meetings.find(x=>x.id===mtEditId);if(m)Object.assign(m,{title:v.title,start,dur:v.dur,place:v.place,note:v.note,att:v.att})}
 else b.meetings.push({id:uid(),title:v.title,start,dur:v.dur,place:v.place,note:v.note,att:v.att,by:user.email,created:new Date().toISOString()});
 closeModals();render();showToast(mtEditId?'Đã lưu cuộc họp':'Đã đặt cuộc họp '+mtDayLabel(start)+' lúc '+hmOf(start),true);
};
$('mtDelete').onclick=()=>{
 const b=mtBoard;if(!b||!mtEditId||!confirm('Xóa cuộc họp này?'))return;
 pushUndo();b.meetings=b.meetings.filter(x=>x.id!==mtEditId);closeModals();render();showToast('Đã xóa cuộc họp',true);
};

/* ---------- Hiển thị trong bảng cá nhân (dòng "Lịch cố định") ---------- */
function makeMeetingChip(b,m){
 const now=Date.now(),s=dueTs(m.start),e=dueTs(mtEnd(m));let st='';if(now>=e)st='past';else if(now>=s)st='live';
 const el=document.createElement('button');el.type='button';el.className='ev-chip mt '+st;
 el.innerHTML='<span class="ev-time">'+esc(mtRange(m))+(st==='live'?'<b class="ev-live">Đang diễn ra</b>':'')+'</span><span class="ev-title">🤝 '+esc(m.title)+'</span>'+(m.place?'<span class="ev-place">📍 '+esc(m.place)+'</span>':'')+'<span class="ev-place">Nhóm: '+esc(b.name)+'</span>'+(mtJoinState(m)==='ok'?'<span class="mt-join">📹 Vào họp</span>':'');
 el.title='Cuộc họp nhóm “'+b.name+'”';el.onclick=e=>{if(e.target.closest('.mt-join')){e.stopPropagation();joinMeeting(b,m)}else openMeetingForm(b,m)};
 return el;
}
function meetingChips(cell,day){meetingsForMe().filter(x=>x.m.start.slice(0,10)===day).forEach(x=>cell.appendChild(makeMeetingChip(x.b,x.m)))}
function zoomMeetings(wrap,day){
 const ms=meetingsForMe().filter(x=>x.m.start.slice(0,10)===day);if(!ms.length)return;
 const sec=document.createElement('div');sec.className='zoom-events';sec.innerHTML='<div class="tray-title">Cuộc họp nhóm trong ngày · '+ms.length+'</div>';
 const lst=document.createElement('div');lst.className='ev-list';ms.forEach(x=>lst.appendChild(makeMeetingChip(x.b,x.m)));sec.appendChild(lst);wrap.appendChild(sec);
}

/* ---------- Nhắc họp (dùng chung chuông thông báo) ---------- */
function meetingReminderItems(){
 const now=Date.now(),out=[];
 meetingsForMe().forEach(({b,m})=>{
  const ts=dueTs(m.start);if(isNaN(ts)||ts<now)return;
  let state=null;if(ts-now<=30*60000)state='soon';else if(ts-now<=7*86400000)state='up';
  if(state)out.push({key:'mt:'+b.id+':'+m.id+':'+m.start+':'+state,state,t:{id:m.id,title:'Họp: '+m.title,due:m.start},b,ts,ev:true,mt:true,day:m.start.slice(0,10)});
 });
 return out;
}

/* ---------- Cài đặt: chia sẻ khung giờ bận ---------- */
function refreshShareBusyUI(){const c=$('shareBusyChk');if(c&&db)c.checked=db.shareBusy!==false}
$('shareBusyChk').onchange=e=>{
 db.shareBusy=e.target.checked;save();busyLast=null;busyRetryAt=0;scheduleBusyPush();
 showToast(db.shareBusy?'Đã bật chia sẻ khung giờ bận với nhóm':'Đã tắt. Thành viên sẽ không thấy lịch bận của bạn khi đặt họp');
};

/* ---------- Họp trực tuyến ngay trong web (JaaS, nhúng bằng Jitsi IFrame API) ---------- */
const MT_JOIN_BEFORE=15,MT_JOIN_AFTER=120;          // phút: mở trước giờ họp / còn vào được sau khi kết thúc (khớp với hàm jaas-token)
function mtJoinState(m){
 const s=dueTs(m.start),e=dueTs(mtEnd(m)),n=Date.now();
 if(n<s-MT_JOIN_BEFORE*60000)return'early';
 if(n>e+MT_JOIN_AFTER*60000)return'over';
 return'ok';
}
function mtUpdateJoinRow(m){
 const row=$('mtJoinRow'),show=!!m&&(m.att||[]).includes(user.email);
 row.hidden=!show;if(!show)return;
 const st=mtJoinState(m),btn=$('mtJoin');
 btn.disabled=st!=='ok';
 btn.textContent=st==='ok'?'📹 Vào họp':st==='early'?'📹 Vào họp (mở lúc '+hmOf(dtLocal(vnWall(new Date(dueTs(m.start)-MT_JOIN_BEFORE*60000))))+')':'Cuộc họp đã kết thúc';
}
$('mtJoin').onclick=()=>{const b=mtBoard,m=b&&b.meetings.find(x=>x.id===mtEditId);if(!m)return;closeModals();joinMeeting(b,m)};

let jitsiApi=null,jitsiScriptApp='';
function loadJitsiScript(appId){
 return new Promise((res,rej)=>{
  if(window.JitsiMeetExternalAPI&&(!jitsiScriptApp||jitsiScriptApp===appId))return res();
  const s=document.createElement('script');s.src='https://8x8.vc/'+encodeURIComponent(appId)+'/external_api.js';s.async=true;
  s.onload=()=>{jitsiScriptApp=appId;res()};
  s.onerror=()=>rej(new Error('Không tải được thư viện họp từ 8x8.vc. Kiểm tra mạng hoặc tắt trình chặn quảng cáo cho trang này.'));
  document.head.appendChild(s);
 });
}
function leaveCall(){
 if(jitsiApi){try{jitsiApi.dispose()}catch(e){}jitsiApi=null}
 $('callHost').innerHTML='';$('callOverlay').hidden=true;
}
async function joinMeeting(b,m){
 if(!(m.att||[]).includes(user.email)){showToast('Bạn không có trong danh sách tham gia cuộc họp này');return}
 if(jitsiApi){showToast('Bạn đang ở trong một cuộc họp, hãy rời họp trước');return}
 const st=mtJoinState(m);
 if(st==='early'){showToast('Chưa đến giờ vào họp. Mở từ '+MT_JOIN_BEFORE+' phút trước giờ bắt đầu');return}
 if(st==='over'){showToast('Cuộc họp đã kết thúc');return}
 $('callTitle').textContent='🤝 '+m.title;$('callStatus').textContent='Đang kết nối…';$('callOverlay').hidden=false;
 try{
  const t=await Store.meetToken(b.id,m.id);
  await loadJitsiScript(t.appId);
  if($('callOverlay').hidden)return;                 // người dùng đã bấm Rời họp trong lúc đang kết nối
  const host=$('callHost');host.innerHTML='';
  jitsiApi=new window.JitsiMeetExternalAPI(t.domain||'8x8.vc',{
   roomName:t.room,jwt:t.jwt,parentNode:host,width:'100%',height:'100%',lang:'vi',
   configOverwrite:{prejoinConfig:{enabled:true},disableDeepLinking:true},
   userInfo:{displayName:t.name}
  });
  jitsiApi.addListener('readyToClose',leaveCall);
  jitsiApi.addListener('videoConferenceLeft',leaveCall);
  $('callStatus').textContent='';
 }catch(e){leaveCall();showToast((e&&e.message)||'Không vào được cuộc họp')}
}
$('callLeave').onclick=leaveCall;

