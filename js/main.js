/* Thống kê, hướng dẫn người mới, bộ lọc và khởi động */
/* ---------- Thống kê ---------- */
function barRows(rows,max){return rows.map(r=>'<div class="bar-row"><span class="bar-label" title="'+esc(r.label)+'">'+esc(r.label)+'</span><div class="bar-track"><span style="width:'+(max?Math.round(r.value/max*100):0)+'%;background:'+(r.color||'var(--purple)')+'"></span></div><span class="bar-val">'+r.value+(r.note?' <small>'+esc(r.note)+'</small>':'')+'</span></div>').join('')}
function buildStats(b){
 const now=Date.now(),tasks=b.tasks,total=tasks.length,done=tasks.filter(t=>isDone(b,t)),open=tasks.filter(t=>!isDone(b,t));
 const late=open.filter(t=>t.due&&dueTs(t.due)<now),nodue=open.filter(t=>!t.due);
 const pct=total?Math.round(done.length/total*100):0;
 let h='<div class="kpis"><div class="kpi"><b>'+total+'</b><span>Tổng công việc</span></div><div class="kpi"><b>'+pct+'%</b><span>Đã hoàn thành ('+done.length+'/'+total+')</span></div><div class="kpi'+(late.length?' bad':'')+'"><b>'+late.length+'</b><span>Quá hạn chưa xong</span></div><div class="kpi"><b>'+nodue.length+'</b><span>Chưa đặt hạn</span></div>';
 if(b.type==='personal'){let mins=0;for(let i=0;i<7;i++){const day=ymd(addDay(weekStart,i));occurrencesOn(b,day).forEach(e=>{const[a1,a2]=e.start.split(':').map(Number),[b1,b2]=e.end.split(':').map(Number);mins+=(b1*60+b2)-(a1*60+a2)})}h+='<div class="kpi"><b>'+(Math.round(mins/6)/10)+'h</b><span>Lịch cố định tuần đang xem</span></div>'}
 h+='</div>';
 const byCol=cols(b).map(c=>({label:c.name,value:tasks.filter(t=>t.status===c.id).length,color:c.color}));
 h+='<div class="st-sec"><h3>Công việc theo cột</h3>'+barRows(byCol,Math.max(1,...byCol.map(r=>r.value)))+'</div>';
 const pr=[['Cao','#d65363'],['Trung bình','#f0a43c'],['Thấp','#53b99a']].map(([p,c])=>({label:'Ưu tiên '+p.toLowerCase(),value:tasks.filter(t=>t.priority===p).length,color:c,note:tasks.filter(t=>t.priority===p&&isDone(b,t)).length+' xong'}));
 h+='<div class="st-sec"><h3>Theo mức ưu tiên</h3>'+barRows(pr,Math.max(1,...pr.map(r=>r.value)))+'</div>';
 const today=parseDay(vnToday()),days=[...Array(7)].map((_,i)=>addDay(today,i-6)),counts=days.map(d=>done.filter(t=>t.doneAt&&ymd(new Date(t.doneAt))===ymd(d)).length),mx=Math.max(1,...counts);
 h+='<div class="st-sec"><h3>Hoàn thành trong 7 ngày gần đây</h3><div class="day-bars">'+days.map((d,i)=>'<div class="day-bar'+(i===6?' today':'')+'"><span class="db-val">'+counts[i]+'</span><div class="db-fill" style="height:'+Math.round(counts[i]/mx*92)+'px"></div><span class="db-label">'+(i===6?'Hôm nay':dayShort(d))+'<br>'+dm(d)+'</span></div>').join('')+'</div></div>';
 if(b.type==='team'&&b.sprints.length){const rows=b.sprints.map(sp=>{const ss=sprintStat(b,sp.id);return'<div class="bar-row"><span class="bar-label" title="'+esc(sp.name)+'">'+esc(sp.name)+'</span><div class="bar-track"><span style="width:'+ss.pct+'%;background:#53b99a"></span></div><span class="bar-val">'+ss.dn+'/'+ss.n+' <small>'+ss.pct+'%</small></span></div>'}).join('');h+='<div class="st-sec"><h3>Tiến độ theo sprint</h3>'+rows+'</div>'}
 if(b.type==='team'){
  const mem=b.members.map(m=>{const mine=tasks.filter(t=>t.assignee===m.id);return{m,all:mine.length,dn:mine.filter(t=>isDone(b,t)).length,lt:mine.filter(t=>!isDone(b,t)&&t.due&&dueTs(t.due)<now).length}});
  const un=tasks.filter(t=>!t.assignee).length,mxm=Math.max(1,un,...mem.map(x=>x.all));
  h+='<div class="st-sec"><h3>Theo người phụ trách</h3>'+mem.map(x=>'<div class="bar-row"><span class="bar-label" title="'+esc(x.m.name)+'">'+esc(x.m.name)+'</span><div class="bar-track"><span style="width:'+Math.round(x.dn/mxm*100)+'%;background:#53b99a"></span><span style="width:'+Math.round((x.all-x.dn)/mxm*100)+'%;background:var(--purple);border-radius:0 8px 8px 0"></span></div><span class="bar-val">'+x.dn+'/'+x.all+(x.lt?' <small style="color:#d65363">'+x.lt+' trễ</small>':'')+'</span></div>').join('')+(un?'<div class="bar-row"><span class="bar-label">Chưa giao</span><div class="bar-track"><span style="width:'+Math.round(un/mxm*100)+'%;background:#a3abbb"></span></div><span class="bar-val">'+un+'</span></div>':'')+'<div class="legend"><span><i style="background:#53b99a"></i>Đã xong</span><span><i style="background:var(--purple)"></i>Chưa xong</span></div></div>';
 }else{
  const tg={};tasks.forEach(t=>{const k=t.tag||'Không nhãn';(tg[k]=tg[k]||{n:0,c:t.tagColor||'#8a93a8'}).n++});
  const rows=Object.entries(tg).map(([k,v])=>({label:k,value:v.n,color:v.c})).sort((x,y)=>y.value-x.value).slice(0,6);
  if(rows.length)h+='<div class="st-sec"><h3>Theo nhãn</h3>'+barRows(rows,Math.max(1,...rows.map(r=>r.value)))+'</div>';
 }
 return h;
}
function openStats(){const b=board();$('statsTitle').textContent='Thống kê · '+b.name;$('statsBody').innerHTML=buildStats(b);openModal('statsModal')}
$('statsBtn').onclick=openStats;

/* ---------- Hướng dẫn người mới ---------- */
const GUIDE=[
 {i:'👋',t:'Chào mừng đến với Kanban Board',p:'Bảng được chia làm hai không gian riêng biệt, nhìn ở thanh bên trái:',l:['<b>Cá nhân</b>: kế hoạch riêng của bạn, hiển thị dạng thời khóa biểu tuần.','<b>Làm nhóm</b>: có thành viên, người phụ trách và bình luận.','Nhấn <b>＋</b> cạnh tên mục để tạo bảng mới.']},
 {i:'🗂️',t:'Tạo và quản lý công việc',p:'Nhấn <b>Tạo công việc</b> hoặc dấu ＋ trên mỗi cột. Mỗi thẻ có thể có:',l:['Hạn (ngày giờ) và mức ưu tiên, nhắc trước hạn.','Checklist, tick được ngay trên thẻ.','Nhãn có màu, tệp đính kèm, bình luận.','Kéo thả thẻ giữa các cột. Nút <b>⚙ Cột</b> cho phép thêm, đổi tên, đổi màu cột.']},
 {i:'🎙️',t:'Nói thay vì gõ',p:'Nhấn nút micro (🎙) trên thanh trên cùng rồi nói một câu, ví dụ:',l:['<span class="ex">“Nộp báo cáo chương 2 trước 8 giờ tối thứ sáu, ưu tiên cao”</span>','<span class="ex">“Tôi có tiết học môn Toán từ 8 giờ sáng đến 10 giờ sáng hàng ngày từ tháng 10 đến tháng 12”</span>','Câu có giờ bắt đầu – kết thúc hoặc “hàng ngày” sẽ thành lịch cố định. Hệ thống luôn hỏi xác nhận trước khi lưu. Cần Chrome hoặc Edge.']},
 {i:'📅',t:'Thời khóa biểu tuần',p:'Ở bảng cá nhân, mỗi cột là một ngày, mỗi hàng là một trạng thái.',l:['Nhấn tên <b>thứ</b> để phóng to ngày đó. Ngày hôm nay luôn được làm to hơn.','Kéo thẻ sang ô khác để đổi ngày và trạng thái cùng lúc.','Dải <b>Lịch cố định</b> chứa các buổi lặp lại (tiết học, ca làm). Có thể nghỉ riêng một buổi.']},
 {i:'👥',t:'Làm việc nhóm',p:'Ở bảng nhóm, bấm <b>Mời thành viên</b> để lấy liên kết.',l:['Gắn <b>người phụ trách</b> cho từng thẻ và lọc theo từng người.','Chuyển nhanh giữa <b>Bảng chung</b>, <b>Theo sprint</b> (tiến độ từng sprint) và <b>Theo người</b> (đầu việc của từng thành viên) ở thanh công cụ.','Trong bình luận, gõ <b>@</b> để nhắc tên. Người được nhắc sẽ thấy ở chuông thông báo.','Bản demo chưa có máy chủ: liên kết mời chỉ sao chép bảng tại thời điểm mời, chưa đồng bộ thời gian thực.']},
 {i:'🔔',t:'Nhắc hạn, thống kê, giao diện',p:'Một vài tiện ích đáng thử:',l:['Chuông thông báo gom việc quá hạn, sắp đến hạn và các lần được nhắc tên.','<b>📊 Thống kê</b> cho biết tiến độ, việc quá hạn, khối lượng của từng thành viên.','<b>Học tập → Tính điểm</b>: nhập trọng số và điểm các đầu điểm, web cho biết cần bao nhiêu điểm ở bài cuối để đạt tổng kết mong muốn.','<b>⚙ Cài đặt</b> để đổi giao diện sáng hoặc tối.']}
];
let guideIdx=0;
function renderGuide(){
 const g=GUIDE[guideIdx];
 $('guideStep').innerHTML='<div class="guide-hero">'+g.i+'</div><h3>'+g.t+'</h3><p>'+g.p+'</p><ul>'+g.l.map(x=>'<li>'+x+'</li>').join('')+'</ul>';
 $('guideDots').innerHTML=GUIDE.map((_,i)=>'<i class="'+(i===guideIdx?'on':'')+'"></i>').join('');
 $('guidePrev').style.visibility=guideIdx?'visible':'hidden';
 $('guideNext').textContent=guideIdx===GUIDE.length-1?'Bắt đầu dùng ✓':'Tiếp ›';
 $('guideSkip').hidden=guideIdx===GUIDE.length-1;
}
function openGuide(i=0){guideIdx=i;renderGuide();openModal('guideModal')}
$('guidePrev').onclick=()=>{if(guideIdx>0){guideIdx--;renderGuide()}};
$('guideNext').onclick=()=>{if(guideIdx<GUIDE.length-1){guideIdx++;renderGuide()}else closeModals()};
function maybeGuide(){if(db&&!db.onboarded){db.onboarded=true;save();openGuide(0)}}

/* ---------- Bộ lọc, trợ giúp, khởi động ---------- */
$('searchInput').addEventListener('input',e=>{filters.q=e.target.value.trim();const b=board();renderBoard(b)});
$('assigneeFilter').onchange=e=>{filters.assignee=e.target.value;renderBoard(board())};
$('tagFilter').onchange=e=>{filters.tag=e.target.value;renderBoard(board())};
$('sprintFilter').onchange=e=>{filters.sprint=e.target.value;renderBoard(board())};
document.querySelectorAll('#viewSeg button').forEach(btn=>btn.onclick=()=>{const b=board();if(b.view===btn.dataset.view)return;b.view=btn.dataset.view;render()});
$('priorityFilter').onchange=e=>{filters.priority=e.target.value;renderBoard(board())};
$('clearFilters').onclick=()=>{filters.q='';filters.assignee='all';filters.priority='all';filters.tag='all';filters.sprint='all';$('searchInput').value='';$('priorityFilter').value='all';render()};
$('mobileMenu').onclick=()=>$('sidebar').classList.toggle('open');
$('helpBtn').onclick=()=>openGuide(0);$('quickGuide').onclick=()=>{$('sidebar').classList.remove('open');openGuide(0)};

window.addEventListener('scroll',()=>document.querySelector('.topbar').classList.toggle('scrolled',window.scrollY>4),{passive:true});
pendingJoin=parseJoinHash();
if(pendingJoin){const ban=$('inviteBanner');ban.hidden=false;ban.textContent='Bạn được mời vào nhóm “'+pendingJoin.name+'”. Đăng nhập hoặc tạo tài khoản để tham gia.'}
function removeSplash(now){const sp=$('splash');if(!sp)return;if(now){sp.remove();return}sp.classList.add('hide');setTimeout(()=>sp.remove(),800)}
function runSplash(done){
 const sp=$('splash');if(!sp){done();return}
 const reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 let finished=false;const timers=[];
 const st=$('splashStatus');
 if(!reduce)[[900,'Đang tải bảng công việc…'],[1800,'Sẵn sàng!']].forEach(([t,m])=>timers.push(setTimeout(()=>{st.textContent=m},t)));
 const onKey=e=>{if(e.key==='Escape'||e.key==='Enter')finish()};
 function finish(){if(finished)return;finished=true;timers.forEach(clearTimeout);document.removeEventListener('keydown',onKey);done();removeSplash()}
 timers.push(setTimeout(finish,reduce?500:2700));
 $('splashSkip').onclick=finish;document.addEventListener('keydown',onKey);
}
(function init(){const email=localStorage.getItem(KEY_SESSION),u=email&&getUsers()[email];if(u){enterApp(u);runSplash(function(){})}else{setAuthMode(pendingJoin?'register':'login');runSplash(showLogin)}})();


/* ---------- Chuyển cảnh mượt khi chọn mục ---------- */
(function(){
 const replay=(el,cls)=>{if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);clearTimeout(el._pt);el._pt=setTimeout(()=>el.classList.remove(cls),1000)};
 const keys=()=>{if(!db)return[null,null];let b=null;try{b=board()}catch(e){}return[viewMode+'|'+db.current,((b&&b.view)||'')+'|'+(zoomDay||'')]};
 let [k1,k2]=keys();
 const _render=render,_rs=renderSidebar;
 render=function(){
  const [n1,n2]=keys();
  const pageChanged=k1!==null&&n1!==null&&n1!==k1,partChanged=!pageChanged&&k2!==null&&n2!==null&&n2!==k2;
  k1=n1;k2=n2;
  const r=_render.apply(this,arguments);
  if(pageChanged)replay(viewMode==='grades'?$('gradesView'):$('boardView'),'page-in');
  else if(partChanged)replay(document.querySelector('#boardView .board-panel'),'part-in');
  return r;
 };
 const selKeyNow=()=>document.querySelector('.sidebar .side-board.selected')?(viewMode+'|'+(db&&db.current)):null;
 let selKey=selKeyNow();
 renderSidebar=function(){
  const r=_rs.apply(this,arguments);
  const key=selKeyNow();
  if(key&&selKey!==null&&key!==selKey)replay(document.querySelector('.sidebar .side-board.selected'),'sel-anim');
  selKey=key;return r;
 };
})();
