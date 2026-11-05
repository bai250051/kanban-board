/* Dữ liệu, đăng nhập và lớp Store (chọn kho lưu trữ: cục bộ hoặc máy chủ) */
const Store=(typeof KANBAN_CONFIG!=='undefined'&&KANBAN_CONFIG.backend==='supabase'&&typeof SupabaseStore!=='undefined')?SupabaseStore:LocalStore;
const FileStore=Store.files;
const AUTH_ERR={exists:'Email này đã được đăng ký.',invalid:'Email hoặc mật khẩu không đúng.',failed:'Không kết nối được máy chủ, hãy thử lại.',confirm:'Hãy mở email để xác nhận tài khoản rồi đăng nhập.',weak:'Mật khẩu quá yếu, hãy dùng ít nhất 6 ký tự.',profile:'Đăng nhập được nhưng chưa đọc được hồ sơ tài khoản. Hãy kiểm tra đã chạy schema.sql trong Supabase chưa.'};
/* ---------- Dữ liệu ---------- */
function ck(arr){return arr.map((x,i)=>({id:'c'+i+uid(),text:x[0],done:!!x[1]}))}
function seedDb(u){
 const me={id:u.email,name:u.name,email:u.email,color:''};
 const T=(title,desc,status,priority,assignee,due,remind,tag,list)=>({id:uid(),title,desc,status,priority,assignee,due,remind,tag,checklist:ck(list||[])});
 const team={id:'b_team_'+uid(),name:'Đồ án phần mềm',desc:'Theo dõi tiến độ đồ án của cả nhóm theo từng sprint.',type:'team',owner:u.email,members:[me,{id:'m_hung',name:'Lê Văn Hưng',color:'green'},{id:'m_trang',name:'Nguyễn Thu Trang',color:'orange'},{id:'m_bao',name:'Phạm Gia Bảo',color:'blue'}],tasks:[
  T('Thiết kế giao diện trang đăng nhập','Hoàn thiện màn hình đăng nhập và đăng ký.','todo','Cao',u.email,dtOffset(2,17,0),1440,'Thiết kế',[['Vẽ wireframe',true],['Chọn màu chủ đạo',true],['Làm bản mockup',false],['Gửi nhóm duyệt',false]]),
  T('Viết báo cáo khảo sát người dùng','Tổng hợp kết quả Google Form và 3 chân dung người dùng.','doing','Trung bình','m_trang',dtOffset(3,20,0),1440,'Báo cáo',[['Tổng hợp 18 phản hồi',true],['Vẽ biểu đồ',false],['Viết nhận xét',false]]),
  T('Chuẩn bị slide thuyết trình Sprint 1','Slide có ảnh, phân tích mô hình và số tầng.','doing','Cao','m_hung',dtOffset(1,21,0),180,'Slide',[['Chụp ảnh demo',true],['Viết phần kiến trúc',false]]),
  T('Cài đặt môi trường VS Code','Tạo project và chạy thử bản demo.','done','Thấp','m_bao',dtOffset(-2,18,0),0,'Công việc',[['Cài VS Code',true],['Tạo thư mục dự án',true]])]};
 const T0=parseDay(vnToday()),sdt=n=>ymd(addDay(T0,n));
 const SPN=[['Sprint 1 — Nền tảng','Thiết kế giao diện, đăng ký/đăng nhập, tạo bảng và thẻ cơ bản.'],['Sprint 2 — Thẻ công việc và kéo thả','Kéo thả thẻ, mô tả, hạn nộp, checklist.'],['Sprint 3 — Làm việc nhóm','Mời thành viên bằng link, gán người phụ trách.'],['Sprint 4 — Phân loại và trao đổi','Nhãn màu, mức ưu tiên, bình luận, @nhắc tên.'],['Sprint 5 — Nhắc nhở','Nhắc deadline, thông báo thay đổi, đính kèm file.'],['Sprint 6 — Theo dõi và hoàn thiện','Lọc, tìm kiếm, thống kê, hướng dẫn, kiểm thử.']];
 team.sprints=SPN.map((x,i)=>({id:uid(),name:x[0],goal:x[1],start:sdt(-6+14*i),end:sdt(7+14*i)}));
 const tk=team.tasks;tk[0].sprint=team.sprints[0].id;tk[1].sprint=team.sprints[0].id;tk[2].sprint=team.sprints[1].id;tk[3].sprint=team.sprints[0].id;const ago=h=>new Date(Date.now()-h*3600000).toISOString();
 tk[0].comments=[{id:uid(),authorId:'m_hung',authorName:'Lê Văn Hưng',text:'@'+u.name+' mình đã gửi wireframe, bạn xem giúp nhé!',mentions:[u.email],ts:ago(2)},{id:uid(),authorId:'m_trang',authorName:'Nguyễn Thu Trang',text:'Màu chủ đạo dùng tím như bản demo nha cả nhóm.',mentions:[],ts:ago(5)}];
 tk[3].doneAt=ago(50);
 const personal={id:'b_personal_'+uid(),name:'Kế hoạch cá nhân',desc:'Việc học và việc riêng của mình.',type:'personal',owner:u.email,members:[me],tasks:[
  T('Ôn tập giữa kỳ','Xem lại slide và bài tập các chương.','todo','Cao',u.email,dtOffset(1,19,0),1440,'Học tập',[['Chương 1',true],['Chương 2',false],['Chương 3',false]]),
  T('Dọn góc học tập','','todo','Thấp',u.email,'',0,'',[])]};
 const demo=Store.name==='local';
 return{boards:demo?[personal,team]:[personal],current:demo?team.id:personal.id,seen:{},fired:{}};
}
async function loadDb(){
 const d0=await Store.load(user);let d=d0;
 if(!d||!Array.isArray(d.boards)||!d.boards.length)d=seedDb(user);
 d.seen=d.seen||{};d.fired=d.fired||{};d.ack=d.ack||{};d.boards.forEach(normalizeBoard);if(!d.boards.some(b=>b.id===d.current))d.current=d.boards[0].id;return d;
}
let saveTimer=null,quotaWarned=0;
function save(){if(!user||!db)return;clearTimeout(saveTimer);saveTimer=setTimeout(flushSave,300)}
function flushSave(){
 clearTimeout(saveTimer);saveTimer=null;if(!user||!db)return;
 const fail=()=>{if(Date.now()-quotaWarned>8000){quotaWarned=Date.now();showToast('Không lưu được thay đổi mới (bộ nhớ đầy hoặc mất kết nối). Hãy xóa bớt dữ liệu cũ hoặc thử lại.')}};
 try{const r=Store.save(user,db);if(r&&r.catch)r.catch(fail)}catch(e){fail()}
}
window.addEventListener('beforeunload',flushSave);document.addEventListener('visibilitychange',()=>{if(document.hidden)flushSave()});
const COL_COLORS=['#8a93a8','#f0a43c','#53b99a','#6759e8','#e0607a','#4a9de0'];
const defaultColumns=()=>[{id:'todo',name:'Cần làm',color:COL_COLORS[0]},{id:'doing',name:'Đang làm',color:COL_COLORS[1]},{id:'done',name:'Hoàn thành',color:COL_COLORS[2],done:true}];
function cols(b){if(!Array.isArray(b.columns)||b.columns.length<2)b.columns=defaultColumns();return b.columns}
const colOf=(b,id)=>cols(b).find(c=>c.id===id);
const isDone=(b,t)=>{const c=colOf(b,t.status);return !!(c&&c.done)};
function setStatus(b,t,status){const was=isDone(b,t);t.status=status;const now=isDone(b,t);if(now&&!was)t.doneAt=new Date().toISOString();if(!now)delete t.doneAt}
function normalizeBoard(b){cols(b);b.tasks=b.tasks||[];b.events=b.events||[];b.sprints=b.sprints||[];b.view=b.view||'columns';b.sprintSel=b.sprintSel||'all';b.collapsed=b.collapsed||{};const sids=b.sprints.map(x=>x.id);const ids=b.columns.map(c=>c.id);b.tasks.forEach(t=>{if(!ids.includes(t.status))t.status=ids[0];t.comments=t.comments||[];t.sprint=sids.includes(t.sprint)?t.sprint:'';t.attachments=t.attachments||[];t.checklist=t.checklist||[]})}
const board=()=>db.boards.find(b=>b.id===db.current)||db.boards[0];
const memberOf=(b,id)=>b.members.find(m=>m.id===id);

/* ---------- Xác thực ---------- */
let authMode='login';
function setAuthMode(m){authMode=m;const reg=m==='register';$('loginTab').classList.toggle('active',!reg);$('registerTab').classList.toggle('active',reg);$('nameField').style.display=reg?'grid':'none';$('authTitle').textContent=reg?'Tạo tài khoản mới':'Chào mừng trở lại!';$('authLead').textContent=reg?'Chỉ mất một phút để bắt đầu quản lý công việc.':'Đăng nhập để tiếp tục quản lý công việc của bạn.';$('authSubmit').textContent=reg?'Tạo tài khoản':'Đăng nhập vào bảng';$('authError').textContent=''}
function showLogin(){$('loginScreen').classList.add('show')}
async function enterApp(u){
 user=u;$('loginScreen').classList.remove('show');
 try{db=await loadDb()}catch(e){user=null;db=null;showToast('Không tải được dữ liệu, hãy thử lại.');showLogin();return false}
 document.querySelector('.avatar').textContent=initials(u.name);document.querySelector('.profile-name').textContent=u.name;
 filters.q='';filters.assignee='all';filters.priority='all';filters.tag='all';filters.sprint='all';$('searchInput').value='';
 render();checkReminders();
 migrateFiles().then(gcFiles);setTimeout(maybeRollover,700);
 if(typeof startSync==='function')startSync();
 if(pendingJoin){openJoin(pendingJoin)}else maybeGuide();
 return true;
}
$('loginTab').onclick=()=>setAuthMode('login');$('registerTab').onclick=()=>setAuthMode('register');
$('authForm').addEventListener('submit',async e=>{
 e.preventDefault();const email=$('authEmail').value.trim().toLowerCase(),pw=$('authPassword').value,name=$('authName').value.trim(),btn=$('authSubmit');
 if(authMode==='register'&&!name){$('authError').textContent='Vui lòng nhập họ và tên.';return}
 btn.disabled=true;
 try{
  const r=authMode==='register'?await Store.register({name,email,password:pw}):await Store.login({email,password:pw});
  if(r.error){$('authError').textContent=(AUTH_ERR[r.error]||AUTH_ERR.failed)+((r.error==='failed'||r.error==='profile')&&r.detail?' ['+r.detail+']':'');return}
  if(await enterApp(r.user))$('authForm').reset();else $('authError').textContent=AUTH_ERR.failed;
 }catch(err){$('authError').textContent=AUTH_ERR.failed+(err&&err.message?' ['+err.message+']':'')}
 finally{btn.disabled=false}
});
$('logoutBtn').onclick=()=>{flushSave();if(typeof stopSync==='function')stopSync();Store.logout();user=null;db=null;closeModals();$('notificationPanel').classList.remove('open');document.title='Kanban Board';showLogin()};
