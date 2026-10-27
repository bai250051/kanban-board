/* Nhập thông minh bằng giọng nói hoặc câu gõ */
/* ---------- Giọng nói ---------- */
function parseVoiceCommand(text,members){
 const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
 const B=x=>new RegExp("(?<![\\p{L}\\p{N}])(?:"+x+")(?![\\p{L}\\p{N}])","iu");
 let orig=String(text||"").replace(/[,;]/g," ").replace(/\s+/g," ").trim();
 let low=orig.toLocaleLowerCase("vi");
 if(low.length!==orig.length){low=orig.toLowerCase();if(low.length!==orig.length)orig=low}
 function cut(re){const m=re.exec(low);if(!m)return null;low=low.slice(0,m.index)+" "+low.slice(m.index+m[0].length);orig=orig.slice(0,m.index)+" "+orig.slice(m.index+m[0].length);return m}
 const now=new Date();const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 let m,priority=null,remind=null,assignee=null,period=null,date=null,time=null;
 // 1. Nhắc trước
 if(m=cut(B("nhắc(?:\\s+tôi|\\s+mình)?(?:\\s+trước)?\\s*(\\d+)\\s*(phút|giờ|tiếng|ngày)(?:\\s+trước)?"))){const n=+m[1];remind=/phút/.test(m[2])?n:/ngày/.test(m[2])?n*1440:n*60}
 // 2. Ưu tiên
 if(cut(B("ưu tiên\\s+(?:cao|khẩn cấp|gấp)|rất gấp|khẩn cấp|khẩn")))priority="Cao";
 else if(cut(B("ưu tiên\\s+(?:trung bình|vừa)")))priority="Trung bình";
 else if(cut(B("ưu tiên\\s+thấp|không gấp")))priority="Thấp";
 // 3. Người phụ trách
 if(members&&members.length){
  for(const mem of members){
   const parts=mem.name.toLocaleLowerCase("vi").split(/\s+/).filter(Boolean);const c=[parts.join(" ")];
   if(parts.length>1){c.push(parts.slice(-2).join(" "));c.push(parts[parts.length-1])}
   const re=B("(?:giao\\s+việc\\s+cho|giao\\s+cho|giao|người\\s+phụ\\s+trách(?:\\s+là)?|phụ\\s+trách(?:\\s+là)?)\\s+(?:bạn\\s+|anh\\s+|chị\\s+|em\\s+)?(?:"+c.map(escRe).join("|")+")");
   if(cut(re)){assignee=mem.id;break}
  }
  if(!assignee&&cut(B("(?:giao\\s+)?cho\\s+(?:tôi|mình|tớ)|(?:tôi|mình)\\s+(?:làm|phụ trách)")))assignee="__me";
 }
 // 4. Ngày
 const partOf=s=>/sáng/.test(s)?"sáng":/chiều/.test(s)?"chiều":/tối/.test(s)?"tối":null;
 const addDays=n=>{const d=new Date(today);d.setDate(d.getDate()+n);return d};
 if(m=cut(B("(?:sáng|chiều|tối)\\s+nay|hôm nay"))){date=addDays(0);period=partOf(m[0])}
 else if(m=cut(B("(?:(?:sáng|chiều|tối)\\s+)?(?:ngày\\s+kia|ngày\\s+mốt|mốt)"))){date=addDays(2);period=partOf(m[0])}
 else if(m=cut(B("(?:(?:sáng|chiều|tối)\\s+)?(?:ngày\\s+mai|mai)"))){date=addDays(1);period=partOf(m[0])}
 else if(m=cut(B("(?:thứ\\s+(hai|ba|tư|năm|sáu|bảy|[2-7])|chủ\\s+nhật)(?:\\s+(tuần\\s+sau|tuần\\s+tới|tuần\\s+này))?"))){
  const map={"hai":1,"ba":2,"tư":3,"năm":4,"sáu":5,"bảy":6,"2":1,"3":2,"4":3,"5":4,"6":5,"7":6};
  const target=m[1]?map[m[1]]:0,dow=now.getDay(),offMon=t=>(t+6)%7,wk=m[2]||"";
  let diff;
  if(/sau|tới/.test(wk)){diff=((8-dow)%7||7)+offMon(target)}
  else if(/này/.test(wk)){diff=offMon(target)-offMon(dow);if(diff<0)diff+=7}
  else{diff=(target-dow+7)%7;if(diff===0)diff=7}
  date=addDays(diff);
 }
 else if(m=cut(B("(?:sau|trong)\\s+(\\d+)\\s+ngày(?:\\s+(?:nữa|tới))?|(\\d+)\\s+ngày\\s+(?:nữa|tới)"))){date=addDays(+(m[1]||m[2]))}
 else if(m=cut(B("tuần\\s+sau|tuần\\s+tới"))){date=addDays(7)}
 else if(m=cut(B("(?:ngày\\s+)?(\\d{1,2})\\s*(?:tháng|/|-)\\s*(\\d{1,2})(?:\\s*(?:năm|/|-)\\s*(\\d{4}))?"))){
  const d=+m[1],mo=+m[2];let y=m[3]?+m[3]:today.getFullYear();let c=new Date(y,mo-1,d);
  if(c.getMonth()===mo-1&&c.getDate()===d){if(!m[3]&&c<today)c=new Date(y+1,mo-1,d);date=c}
 }
 else if(m=cut(B("ngày\\s+(\\d{1,2})"))){
  const d=+m[1];let c=new Date(today.getFullYear(),today.getMonth(),d);
  if(c<today)c=new Date(today.getFullYear(),today.getMonth()+1,d);
  if(c.getDate()===d)date=c;
 }
 // 5. Giờ
 const applyPeriod=(h,p)=>{if(p==="chiều"||p==="tối"){if(h<12)h+=12}else if(p==="sáng"){if(h===12)h=0}else if(p==="đêm"){if(h===12)h=0;else if(h>=6&&h<12)h+=12}else if(p==="trưa"){if(h<10)h+=12}return h};
 if(m=cut(B("(?:vào\\s+lúc\\s+|lúc\\s+|trước\\s+|đến\\s+)?(\\d{1,2})\\s*(?:giờ|h|:)\\s*(?:(\\d{1,2})\\s*(?:phút)?)?\\s*(rưỡi)?\\s*(sáng|trưa|chiều|tối|đêm)?"))){
  let h=+m[1],mi=m[3]?30:+(m[2]||0);const p=m[4]||period;
  if(h<=24&&mi<=59){h=applyPeriod(h,p);if(h===24)h=0;time=[h,mi]}
 }else if(m=cut(B("(?:lúc\\s+)?(\\d{1,2})\\s*(?:giờ\\s*)?rưỡi\\s*(sáng|trưa|chiều|tối|đêm)?"))){
  let h=+m[1];const p=m[2]||period;if(h<=23){time=[applyPeriod(h,p),30]}
 }
 // 6. Hạn
 let due="";
 if(date||time){
  let d=date;
  if(!time){const defH={"sáng":[8,0],"chiều":[15,0],"tối":[19,0]};time=defH[period]||[23,59]}
  if(!d){d=new Date(today);const t=new Date(today);t.setHours(time[0],time[1],0,0);if(t<now)d=addDays(1)}
  d=new Date(d.getFullYear(),d.getMonth(),d.getDate(),time[0],time[1]);
  const p2=n=>String(n).padStart(2,"0");
  due=d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate())+"T"+p2(d.getHours())+":"+p2(d.getMinutes());
 }
 // 7. Tiêu đề
 let title=orig.replace(/\s+/g," ").trim();
 title=title.replace(/^(?:(?:hãy|xin|vui lòng)\s+)?(?:thêm|tạo|lên lịch|đặt lịch|nhắc)(?:\s+(?:cho tôi|giúp tôi|giúp mình))?(?:\s+(?:một|1))?(?:\s+(?:công việc|việc|lịch|task))?(?=\s|$)\s*/iu,"");
 title=title.replace(/(?<![\p{L}\p{N}])(?:hạn nộp|hạn chót|deadline|hạn)(?![\p{L}\p{N}])/giu," ").replace(/\s+/g," ").trim();
 const W="(?:vào lúc|vào|lúc|trước|đến|là|và)(?![\\p{L}\\p{N}])";
 const lead=new RegExp("^(?:"+W+"|[.:\\-\\s])+","iu"),tail=new RegExp("(?:\\s+(?:vào lúc|vào|lúc|trước|đến|là|và|cho)|[.:\\-\\s])+$","iu");
 title=title.replace(lead,"").replace(tail,"").trim();
 if(title)title=title.charAt(0).toLocaleUpperCase("vi")+title.slice(1);
 return{title,due,priority,assignee,remind};
}


/* ===== Lịch lặp bằng giọng nói ===== */
function normalizeVnNumbers(s){
 const U={'không':0,'một':1,'mốt':1,'hai':2,'ba':3,'bốn':4,'tư':4,'năm':5,'lăm':5,'sáu':6,'bảy':7,'tám':8,'chín':9};
 const unit='(?:một|mốt|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín)';
 const NW='(?:(?:hai|ba|bốn|năm|sáu|bảy|tám|chín)\\s+mươi(?:\\s+'+unit+')?|mười(?:\\s+'+unit+')?|không|'+unit+')';
 const val=w=>{w=w.trim().split(/\s+/);if(w[0]==='mười')return 10+(w[1]?U[w[1]]:0);if(w[1]==='mươi')return U[w[0]]*10+(w[2]?U[w[2]]:0);return U[w[0]]};
 s=s.replace(new RegExp('(?<![\\p{L}\\p{N}])('+NW+')(?=\\s*(?:giờ|phút|h)(?![\\p{L}]))','giu'),(m,a)=>String(val(a.toLowerCase())));
 s=s.replace(new RegExp('(giờ\\s+)('+NW+')(?![\\p{L}\\p{N}])','giu'),(m,a,b)=>a+val(b.toLowerCase()));
 return s;
}
function parseEventCommand(text,todayStr){
 const B=x=>new RegExp("(?<![\\p{L}\\p{N}])(?:"+x+")(?![\\p{L}\\p{N}])","iu");
 let orig=normalizeVnNumbers(String(text||"")).replace(/[,;]/g," ").replace(/\s+/g," ").trim();
 let low=orig.toLocaleLowerCase("vi");
 if(low.length!==orig.length){low=orig.toLowerCase();if(low.length!==orig.length)orig=low}
 function cut(re){const m=re.exec(low);if(!m)return null;low=low.slice(0,m.index)+" "+low.slice(m.index+m[0].length);orig=orig.slice(0,m.index)+" "+orig.slice(m.index+m[0].length);return m}
 const p2=n=>String(n).padStart(2,"0"),fmt=d=>d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());
 const pd=s=>{const p=s.split("-").map(Number);return new Date(p[0],p[1]-1,p[2])};
 const today=todayStr?pd(todayStr):(()=>{const n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate())})();
 const addD=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
 const eom=(y,mo)=>new Date(y,mo,0);
 const dm=d=>p2(d.getDate())+"/"+p2(d.getMonth()+1);
 const notes=[];let m,from=null,to=null,days=null,start=null,end=null,single=null,recKw=false,weekly=false,hasRange=false,hasDateRange=false;
 let remind=null;
 if(m=cut(B("nhắc(?:\\s+tôi|\\s+mình)?(?:\\s+trước)?\\s*(\\d+)\\s*(phút|giờ|tiếng)(?:\\s+trước)?"))){const n=+m[1],mins=/phút/.test(m[2])?n:n*60;remind=[5,10,15,30,60].filter(x=>x<=mins).pop()||5}
 // ---- 1. Khoảng ngày
 if(m=cut(B("từ\\s+tháng\\s+(\\d{1,2})(?:\\s+năm\\s+(\\d{4}))?\\s+(?:đến|tới)\\s+(?:hết\\s+|cuối\\s+)?tháng\\s+(\\d{1,2})(?:\\s+năm\\s+(\\d{4}))?"))){
  const a=+m[1],b=+m[3],y1=m[2]?+m[2]:today.getFullYear(),y2=m[4]?+m[4]:(b<a?y1+1:y1);
  let f=new Date(y1,a-1,1),t=eom(y2,b);
  if(!m[2]&&t<today){f=new Date(y1+1,a-1,1);t=eom(y2+1,b);notes.push("Khoảng tháng này đã qua nên mình tính sang năm sau")}
  from=f;to=t;hasDateRange=true;
 }else{
  const re=B("từ\\s+(?:ngày\\s+)?(\\d{1,2})(?:\\s*(?:tháng|/)\\s*(\\d{1,2}))?\\s+(?:đến|tới)\\s+(?:ngày\\s+)?(\\d{1,2})(?:\\s*(?:tháng|/)\\s*(\\d{1,2}))?(?!\\s*(?:giờ|h(?![\\p{L}])|:|phút))"),r=re.exec(low);
  if(r&&/ngày|\/|tháng/.test(r[0])){
   m=cut(re);const d1=+m[1],d2=+m[3],y=today.getFullYear();
   let m2=m[4]?+m[4]:(m[2]?+m[2]:today.getMonth()+1),m1=m[2]?+m[2]:m2;if(!m[2]&&!m[4]&&d2<d1)m2=m1+1;
   let f=new Date(y,m1-1,d1),t=new Date(y,m2-1,d2);if(t<today){f=new Date(y+1,m1-1,d1);t=new Date(y+1,m2-1,d2)}
   from=f;to=t;hasDateRange=true;
  }
 }
 // ---- 2. Giờ bắt đầu - kết thúc
 const ap=(h,p)=>{if(p==="chiều"||p==="tối"){if(h<12)h+=12}else if(p==="sáng"){if(h===12)h=0}else if(p==="đêm"){if(h===12)h=0;else if(h>=6&&h<12)h+=12}else if(p==="trưa"){if(h<10)h+=12}return h};
 const hm=(h,mi)=>p2(h)+":"+p2(mi);
 if(m=cut(B("(?:từ\\s+|lúc\\s+|vào\\s+lúc\\s+)?(\\d{1,2})(?:\\s*(?:giờ|h|:)\\s*(?:(\\d{1,2})\\s*(?:phút)?)?\\s*(rưỡi)?)?\\s*(sáng|trưa|chiều|tối|đêm)?\\s*(?:đến|tới|-|–)\\s*(\\d{1,2})\\s*(?:giờ|h|:)\\s*(?:(\\d{1,2})\\s*(?:phút)?)?\\s*(rưỡi)?\\s*(sáng|trưa|chiều|tối|đêm)?"))){
  const h1=+m[1],mi1=m[3]?30:+(m[2]||0),h2=+m[5],mi2=m[7]?30:+(m[6]||0),pa=m[4]||null,pb=m[8]||null;
  if(h1<=24&&h2<=24&&mi1<=59&&mi2<=59){
   let eh=ap(h2,pb||pa),sh=ap(h1,pa||pb);
   if(sh*60+mi1>=eh*60+mi2&&!pa)sh=h1;
   if(sh*60+mi1>=eh*60+mi2&&!pb&&eh<12)eh=h2+12;
   start=hm(sh%24,mi1);end=hm(eh%24,mi2);hasRange=true;
  }
 }else if(m=cut(B("(?:lúc\\s+|vào\\s+lúc\\s+|từ\\s+)?(\\d{1,2})\\s*(?:giờ|h|:)\\s*(?:(\\d{1,2})\\s*(?:phút)?)?\\s*(rưỡi)?\\s*(sáng|trưa|chiều|tối|đêm)?"))){
  const h=ap(+m[1],m[4]||null),mi=m[3]?30:+(m[2]||0);
  if(h<=24&&mi<=59){start=hm(h%24,mi);const t=(h*60+mi+60)%1440;end=hm(Math.floor(t/60),t%60);notes.push("Bạn chưa nói giờ kết thúc nên mình tạm đặt dài 1 giờ")}
 }
 // ---- 3. Lặp theo thứ
 const DM={hai:1,ba:2,tư:3,năm:4,sáu:5,bảy:6,"2":1,"3":2,"4":3,"5":4,"6":5,"7":6};
 if(cut(B("hàng\\s+ngày|hằng\\s+ngày|mỗi\\s+ngày|mọi\\s+ngày|tất\\s+cả\\s+các\\s+ngày|ngày\\s+nào\\s+cũng"))){days=[0,1,2,3,4,5,6];recKw=true}
 else if(cut(B("(?:các\\s+)?ngày\\s+trong\\s+tuần|ngày\\s+thường|các\\s+ngày\\s+đi\\s+học"))){days=[1,2,3,4,5];recKw=true}
 else if(cut(B("(?:vào\\s+)?cuối\\s+tuần"))){days=[6,0];recKw=true}
 else if(m=cut(B("thứ\\s+(hai|ba|tư|năm|sáu|bảy|[2-7])\\s+(?:đến|tới|-)\\s+thứ\\s+(hai|ba|tư|năm|sáu|bảy|[2-7])"))){
  const a=(DM[m[1]]+6)%7,b=(DM[m[2]]+6)%7;days=[];for(let i=a;;i=(i+1)%7){days.push((i+1)%7);if(i===b)break}recKw=true;
 }else{
  const got=[];let guard=0;
  while(guard++<10&&(m=cut(B("thứ\\s+([2-7](?:\\s+(?:và\\s+)?[2-7](?!(?:\\s*(?:giờ|h(?![\\p{L}])|:|phút|tháng|/))|\\d))*)")))){m[1].split(/\s+(?:và\s+)?/).forEach(x=>got.push(DM[x]))}
  guard=0;while(guard++<10&&(m=cut(B("thứ\\s+(hai|ba|tư|năm|sáu|bảy)")))){got.push(DM[m[1]])}
  while(guard++<20&&(m=cut(B("chủ\\s+nhật")))){got.push(0)}
  if(got.length)days=[...new Set(got)].sort((x,y)=>((x+6)%7)-((y+6)%7));
 }
 if(cut(B("hàng\\s+tuần|hằng\\s+tuần|mỗi\\s+tuần|mỗi\\s+thứ|các\\s+thứ"))){weekly=true;recKw=true}
 // ---- 4. Ngày đơn / ngày kết thúc / độ dài
 if(!hasDateRange){
  if(m=cut(B("(?:đến|tới)\\s+(?:hết\\s+|cuối\\s+)?tháng\\s+(\\d{1,2})"))){const mo=+m[1];let y=today.getFullYear(),t=eom(y,mo);if(t<today)t=eom(y+1,mo);from=today;to=t;hasDateRange=true}
  else if(m=cut(B("(?:đến|tới)\\s+(?:hết\\s+)?ngày\\s+(\\d{1,2})(?:\\s*(?:tháng|/)\\s*(\\d{1,2}))?"))){const d=+m[1],mo=m[2]?+m[2]:today.getMonth()+1;let y=today.getFullYear(),t=new Date(y,mo-1,d);if(t<today)t=new Date(y+1,mo-1,d);from=today;to=t;hasDateRange=true}
  else if(m=cut(B("(?:trong|suốt)\\s+(\\d+)\\s+(tuần|ngày|tháng)"))){const n=+m[1];from=today;to=m[2]==="tuần"?addD(today,n*7-1):m[2]==="ngày"?addD(today,n-1):new Date(today.getFullYear(),today.getMonth()+n,today.getDate()-1);hasDateRange=true}
 }
 if(!hasDateRange){
  if(cut(B("hôm nay")))single=today;
  else if(cut(B("ngày\\s+kia|ngày\\s+mốt|mốt")))single=addD(today,2);
  else if(cut(B("ngày\\s+mai|mai")))single=addD(today,1);
  else if(m=cut(B("(?:ngày\\s+)?(\\d{1,2})\\s*(?:tháng|/)\\s*(\\d{1,2})"))){const y=today.getFullYear();let t=new Date(y,+m[2]-1,+m[1]);if(t<today)t=new Date(y+1,+m[2]-1,+m[1]);single=t}
  else if(m=cut(B("tháng\\s+(\\d{1,2})"))){const mo=+m[1],y=today.getFullYear();let f=new Date(y,mo-1,1),t=eom(y,mo);if(t<today){f=new Date(y+1,mo-1,1);t=eom(y+1,mo)}from=f;to=t;hasDateRange=true}
  else if(m=cut(B("ngày\\s+(\\d{1,2})"))){let t=new Date(today.getFullYear(),today.getMonth(),+m[1]);if(t<today)t=new Date(today.getFullYear(),today.getMonth()+1,+m[1]);single=t}
 }
 // tuần sau + một thứ duy nhất => ngày cụ thể của tuần sau
 if(!single&&!hasDateRange&&days&&days.length===1&&!weekly&&!recKw&&cut(B("tuần\\s+sau|tuần\\s+tới"))){const dow=today.getDay(),toMon=((8-dow)%7)||7;single=addD(today,toMon+((days[0]+6)%7))}
 // ---- 5. Chốt ngày
 const anyDays=days&&days.length;
 if(!single&&!from&&anyDays&&days.length===1&&!weekly&&!recKw){const t=(days[0]-today.getDay()+7)%7;single=addD(today,t)}
 if(single){from=single;to=single;if(!anyDays||days.length!==1||days[0]!==single.getDay())days=[single.getDay()]}
 else if(!from){
  if(anyDays||weekly){from=today;to=addD(today,90);notes.push("Bạn chưa nói ngày kết thúc nên mình tạm đặt 3 tháng, bạn có thể sửa")}
  else if(hasRange||start){from=today;to=today;days=[today.getDay()];notes.push("Bạn chưa nói ngày nên mình đặt là hôm nay")}
 }
 if(from&&!days){days=weekly?[from.getDay()]:[0,1,2,3,4,5,6];if(hasDateRange)notes.push("Bạn chưa nói lặp vào thứ nào nên mình đặt mọi ngày, hãy bỏ tick những ngày không học")}
 if(from&&from<today&&!single){from=today;notes.push("Bắt đầu tính từ hôm nay ("+dm(today)+")")}
 if(from&&to&&to<from)to=from;
 // ---- 6. Địa điểm & tiêu đề
 let place="";
 {const re=B("(?:ở\\s+trên|tại|ở|trên)\\s+(.+)$"),r=re.exec(low);if(r){place=orig.slice(r.index+r[0].length-r[1].length,r.index+r[0].length).replace(/\s+/g," ").trim();cut(re)}}
 let title=orig.replace(/\s+/g," ").trim();
 title=title.replace(new RegExp("^(?:(?:hãy|xin|vui lòng)\\s+)?(?:thêm|tạo|lên lịch|đặt lịch|nhắc)(?:\\s+(?:cho tôi|giúp tôi|giúp mình))?(?:\\s+(?:một|1))?(?:\\s+(?:lịch|việc|công việc))?(?![\\p{L}\\p{N}])\\s*","iu"),"");
 title=title.replace(new RegExp("^(?:tôi|mình|tớ)\\s+(?:có|phải|cần|sẽ|đi)(?![\\p{L}\\p{N}])\\s*","iu"),"").replace(new RegExp("^(?:tôi|mình|tớ)(?![\\p{L}\\p{N}])\\s*","iu"),"");
 const W="(?:vào lúc|vào|lúc|từ|đến|tới|trước|là|và|có|trong|mỗi|các)(?![\\p{L}\\p{N}])";
 title=title.replace(new RegExp("^(?:"+W+"|[.:\\-\\s])+","iu"),"").replace(new RegExp("(?:\\s+(?:vào lúc|vào|lúc|từ|đến|tới|trước|là|và|có|trong|mỗi|các)|[.:\\-\\s])+$","iu"),"").trim();
 place=place.replace(new RegExp("(?:\\s+(?:vào lúc|vào|lúc|từ|đến|tới|và|trong))+$","iu"),"").trim();
 const cap=s=>s?s.charAt(0).toLocaleUpperCase("vi")+s.slice(1):s;
 const isEvent=!!(from&&days&&(hasRange||recKw||hasDateRange||weekly||(days.length>1)));
 return{isEvent,title:cap(title),place:cap(place),start:start||"",end:end||"",days:days||[],from:from?fmt(from):"",to:to?fmt(to):"",remind,notes};
}
if(typeof module!=="undefined")module.exports={parseVoiceCommand,parseEventCommand,normalizeVnNumbers};

let recog=null,listening=false,voiceCtx=null,voiceCancel=false;
function endVoiceUI(){listening=false;if(voiceCtx&&voiceCtx.btn){voiceCtx.btn.classList.remove('listening');voiceCtx.btn.textContent=voiceCtx.idle}}
function stopVoice(cancel){if(cancel)voiceCancel=true;if(recog&&listening){try{recog.stop()}catch(e){}}endVoiceUI()}
function startVoice(ctx){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){ctx.status.textContent='Trình duyệt này chưa hỗ trợ nhận giọng nói. Bạn vẫn có thể gõ câu (hoặc đọc bằng micro trên bàn phím điện thoại) rồi bấm “✨ Điền” hoặc “✨ Thêm từ câu”.';return}
 if(listening){stopVoice(false);return}
 voiceCtx=ctx;voiceCancel=false;
 recog=new SR();recog.lang='vi-VN';recog.interimResults=true;recog.continuous=false;recog.maxAlternatives=1;
 let finalText='',interim='';
 recog.onstart=()=>{listening=true;ctx.btn.classList.add('listening');ctx.btn.textContent='■ Dừng';ctx.status.textContent=ctx.hint};
 recog.onresult=e=>{interim='';for(let i=e.resultIndex;i<e.results.length;i++){const tx=e.results[i][0].transcript;if(e.results[i].isFinal)finalText+=tx+' ';else interim+=tx}ctx.status.textContent='“'+(finalText+interim).trim()+'”'};
 recog.onerror=e=>{const msg={'not-allowed':'Bạn chưa cấp quyền micro cho trang này.','service-not-allowed':'Bạn chưa cấp quyền micro cho trang này.','no-speech':'Không nghe thấy giọng nói, thử lại nhé.','audio-capture':'Không tìm thấy micro.','network':'Nhận giọng nói cần kết nối mạng.'}[e.error]||'Không nhận được giọng nói ('+e.error+').';ctx.status.textContent=msg};
 recog.onend=()=>{endVoiceUI();const txt=(finalText.trim()||interim.trim());if(!voiceCancel&&txt)ctx.onText(txt)};
 try{recog.start()}catch(e){ctx.status.textContent='Không bật được micro, thử lại sau.'}
}
function applyVoice(text){
 const b=board(),team=b.type==='team',r=parseVoiceCommand(text,team?b.members.map(m=>m.id===user.email?{...m,name:m.name}:m):[]);
 const bits=[];
 if(r.title){$('taskTitle').value=r.title}
 if(r.due){$('taskDue').value=r.due;bits.push('Hạn '+fmtDue(r.due))}
 if(r.priority){$('taskPriority').value=r.priority;bits.push('Ưu tiên '+r.priority.toLowerCase())}
 if(team&&r.assignee){const id=r.assignee==='__me'?user.email:r.assignee;if([...$('taskAssignee').options].some(o=>o.value===id)){$('taskAssignee').value=id;bits.push('Phụ trách: '+(memberOf(b,id)||{}).name)}}
 if(r.remind!=null){const opts=[...$('taskRemind').options].map(o=>+o.value).filter(v=>v>0&&v<=r.remind);const v=opts.length?Math.max(...opts):15;$('taskRemind').value=String(v);bits.push('Nhắc trước '+(v>=1440?v/1440+' ngày':v>=60?v/60+' giờ':v+' phút'))}
 else if(r.due&&$('taskRemind').value==='0')$('taskRemind').value='1440';
 $('voiceStatus').textContent='“'+text+'”';
 $('voiceChip').textContent=bits.length?'Đã nhận diện: '+bits.join(' · ')+'. Kiểm tra lại rồi nhấn Lưu.':'Đã điền tên việc. Bạn có thể nói thêm hạn, ưu tiên… hoặc nhập tay.';
}
const taskVoice={btn:$('voiceBtn'),idle:'🎙 Nói',status:$('voiceStatus'),hint:'Đang nghe… hãy nói tên việc, hạn, ưu tiên, người phụ trách, hoặc cả một lịch lặp.',onText:t=>routeSpeech(t,'task')};
const weekVoice={btn:$('weekMic'),idle:'🎙 Nói lịch học',status:$('weekVoiceStatus'),hint:'Đang nghe… ví dụ: “học Toán từ 8 giờ đến 10 giờ sáng hàng ngày từ tháng 10 đến tháng 12”.',onText:t=>routeSpeech(t,'week')};
const evVoice={btn:$('evVoiceBtn'),idle:'🎙 Nói',status:$('evVoiceStatus'),hint:'Đang nghe… hãy nói lại cả câu để điền lại form.',onText:t=>routeSpeech(t,'event')};
$('voiceBtn').onclick=()=>startVoice(taskVoice);
$('parseBtn').onclick=()=>{const t=$('taskTitle').value.trim();if(!t){$('voiceStatus').textContent='Hãy gõ một câu vào ô tên, ví dụ: nộp báo cáo trước 8 giờ tối thứ sáu';return}routeSpeech(t,'task')};
$('quickForm').addEventListener('submit',e=>{e.preventDefault();const t=$('quickSentence').value.trim();if(!t)return;$('quickSentence').value='';routeSpeech(t,'week')});
$('weekMic').onclick=()=>startVoice(weekVoice);
$('evVoiceBtn').onclick=()=>startVoice(evVoice);
$('quickVoice').onclick=()=>{openTask();setTimeout(()=>startVoice(taskVoice),200)};
