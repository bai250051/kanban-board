/* Xuất lịch .ics và Cài đặt (giao diện, định dạng giờ) */
/* ---------- Xuất lịch (.ics) ---------- */
const icsEsc=x=>String(x||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
const icsDT=x=>x.replace(/[-:]/g,'').slice(0,13)+'00';
const icsLine=l=>{const o=[];while(l.length>73){o.push(l.slice(0,73));l=' '+l.slice(73)}o.push(l);return o.join('\r\n')};
const ICS_DAY=['SU','MO','TU','WE','TH','FR','SA'];
function buildICS(){
 const L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Kanban Board//VI','CALSCALE:GREGORIAN','X-WR-CALNAME:Kanban Board'],stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';let n=0;
 const alarm=(m,txt)=>m>0?['BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+icsEsc(txt),'TRIGGER:-PT'+m+'M','END:VALARM']:[];
 db.boards.forEach(b=>{
  b.tasks.forEach(t=>{
   if(!t.due||isDone(b,t)||(b.type==='team'&&t.assignee&&t.assignee!==user.email))return;
   const st=t.due.length>10?t.due:t.due+'T23:59',e=new Date(new Date(st).getTime()+30*60000);
   L.push('BEGIN:VEVENT','UID:task-'+t.id+'@kanban','DTSTAMP:'+stamp,'DTSTART:'+icsDT(st),'DTEND:'+icsDT(dtLocal(e)),'SUMMARY:'+icsEsc('⏰ Hạn: '+t.title),'DESCRIPTION:'+icsEsc(b.name+(t.desc?' — '+t.desc:'')),...alarm(t.remind||0,'Sắp đến hạn: '+t.title),'END:VEVENT');n++;
  });
  (b.events||[]).forEach(ev=>{
   let d=parseDay(ev.from);const end=parseDay(ev.to);let k=0;while(d<=end&&k<7&&!ev.days.includes(d.getDay())){d=addDay(d,1);k++}
   if(d>end)return;const d0=ymd(d),once=ev.from===ev.to,rm=ev.remind==null?15:ev.remind;
   const ex=[...(ev.skip||[]),...Object.keys(ev.overrides||{})].filter(x=>x>=ev.from&&x<=ev.to);
   L.push('BEGIN:VEVENT','UID:event-'+ev.id+'@kanban','DTSTAMP:'+stamp,'DTSTART:'+icsDT(d0+'T'+ev.start),'DTEND:'+icsDT(d0+'T'+ev.end),'SUMMARY:'+icsEsc(ev.title));
   if(ev.place)L.push('LOCATION:'+icsEsc(ev.place));
   if(!once)L.push('RRULE:FREQ=WEEKLY;BYDAY='+[...ev.days].sort((a,b)=>((a+6)%7)-((b+6)%7)).map(x=>ICS_DAY[x]).join(',')+';UNTIL='+ev.to.replace(/-/g,'')+'T235959');
   ex.forEach(x=>L.push('EXDATE:'+icsDT(x+'T'+ev.start)));
   L.push(...alarm(rm,'Sắp bắt đầu: '+ev.title),'END:VEVENT');n++;
   Object.entries(ev.overrides||{}).forEach(([day,o])=>{if(day<ev.from||day>ev.to||(ev.skip||[]).includes(day))return;L.push('BEGIN:VEVENT','UID:event-'+ev.id+'-'+day+'@kanban','DTSTAMP:'+stamp,'DTSTART:'+icsDT(day+'T'+o.start),'DTEND:'+icsDT(day+'T'+o.end),'SUMMARY:'+icsEsc(ev.title),...((o.place||ev.place)?['LOCATION:'+icsEsc(o.place||ev.place)]:[]),...alarm(rm,'Sắp bắt đầu: '+ev.title),'END:VEVENT');n++});
  });
 });
 L.push('END:VCALENDAR');return{text:L.map(icsLine).join('\r\n')+'\r\n',count:n};
}
$('exportIcs').onclick=()=>{
 const r=buildICS();if(!r.count){showToast('Chưa có thẻ có hạn hoặc lịch cố định nào để xuất');return}
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([r.text],{type:'text/calendar;charset=utf-8'}));a.download='kanban-lich.ics';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
 showToast('Đã xuất '+r.count+' mục lịch. Hãy nhập file vào ứng dụng lịch của bạn');
};

/* ---------- Cài đặt: giao diện sáng / tối ---------- */
const THEME_KEY='kanban_theme';
function getTheme(){try{return localStorage.getItem(THEME_KEY)==='dark'?'dark':'light'}catch(e){return'light'}}
function applyTheme(t,anim){
 const r=document.documentElement;if(anim){r.classList.add('theme-anim');setTimeout(()=>r.classList.remove('theme-anim'),450)}
 r.setAttribute('data-theme',t);try{localStorage.setItem(THEME_KEY,t)}catch(e){}
 document.querySelectorAll('[data-theme-choice]').forEach(el=>{const on=el.dataset.themeChoice===t;el.classList.toggle('active',on);el.setAttribute('aria-pressed',on?'true':'false')});
}
document.querySelectorAll('[data-theme-choice]').forEach(el=>el.onclick=()=>{applyTheme(el.dataset.themeChoice,true);showToast(el.dataset.themeChoice==='dark'?'Đã chuyển sang giao diện tối':'Đã chuyển sang giao diện sáng')});
const openSettings=()=>{$('sidebar').classList.remove('open');openModal('settingsModal');updateStorageInfo()};
$('settingsBtn').onclick=openSettings;$('sideSettings').onclick=openSettings;
applyTheme(getTheme(),false);
['evStart','evEnd','evOneStart','evOneEnd'].forEach(id=>tpInit($(id),$(id+'Tp')));dueInit();
function applyTimeFmt(f){
 timeFmt=f==='24'?'24':'12';try{localStorage.setItem(TF_KEY,timeFmt)}catch(e){}
 document.querySelectorAll('#timeFmtSeg [data-tf]').forEach(b=>b.classList.toggle('on',b.dataset.tf===timeFmt));
 tpList.forEach(p=>p.build());tickClock();if(user&&db)render();
}
document.querySelectorAll('#timeFmtSeg [data-tf]').forEach(b=>b.onclick=()=>{applyTimeFmt(b.dataset.tf);showToast(timeFmt==='24'?'Đã chuyển sang giờ 24 giờ':'Đã chuyển sang giờ AM/PM')});
applyTimeFmt(timeFmt);
