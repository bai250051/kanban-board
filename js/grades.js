/* Học tập: tính điểm, quy đổi thang 4 */
/* ---------- Học tập: tính điểm ---------- */
let viewMode='board';
function applyView(){const g=viewMode==='grades';$('boardView').hidden=g;$('gradesView').hidden=!g;$('navGrades').classList.toggle('selected',g)}
const DEFAULT_GRADE_COLS=[['Điểm chuyên cần',10],['Điểm tự học',10],['Điểm TB các bài tập',20],['Điểm giữa kỳ',20],['Điểm cuối kỳ',40]];
const newCourse=n=>({id:uid(),name:'Môn học '+n,scale:10,target:'',tmode:'10',assume:'',targetCol:null,columns:DEFAULT_GRADE_COLS.map(([name,weight])=>({id:uid(),name,weight,score:''}))});
function ensureGrades(){db.grades=db.grades||{courses:[]};if(!db.grades.courses.length)db.grades.courses.push(newCourse(1));return db.grades}
function parseScores(str){
 const t=String(str==null?'':str).trim();if(!t)return[];
 const parts=t.replace(/(\d),(\d)/g,'$1.$2').split(/[\s;,]+/).filter(Boolean),nums=parts.map(Number);
 return nums.some(n=>!isFinite(n))?null:nums;
}
function gradeVal(col,scale){const n=parseScores(col.score);if(n===null||n.some(x=>x<0||x>scale))return{bad:true};if(!n.length)return{empty:true};return{avg:n.reduce((a,x)=>a+x,0)/n.length,count:n.length}}
const ceil2=x=>Math.ceil(x*100-1e-9)/100,fnum=x=>String(Math.round(x*100)/100);
const gp=x=>Number(x).toFixed(Number.isInteger(Number(x)*10)?1:2);
const DEFAULT_SCALE=()=>[{min:9,letter:'A+',gpa:4},{min:8.5,letter:'A',gpa:4},{min:8,letter:'B+',gpa:3.5},{min:7,letter:'B',gpa:3},{min:6.5,letter:'C+',gpa:2.5},{min:5.5,letter:'C',gpa:2},{min:5,letter:'D+',gpa:1.5},{min:4,letter:'D',gpa:1},{min:0,letter:'F',gpa:0}];
function gscale(){if(!Array.isArray(db.gradeScale)||!db.gradeScale.length)db.gradeScale=DEFAULT_SCALE();if(db.gradeRound===undefined)db.gradeRound=true;return db.gradeScale.slice().sort((a,b)=>b.min-a.min)}
function toGrade(score,scale){
 const s10=score/(+scale>0?+scale:10)*10,r=db.gradeRound!==false?Math.round(s10*10+1e-9)/10:s10,sc=gscale();
 const g=sc.find(x=>r>=x.min-1e-9)||sc[sc.length-1];return{...g,s10,r,rounded:db.gradeRound!==false&&Math.abs(r-s10)>1e-9};
}
const gradeChip=g=>'<span class="gchip g-'+(g.gpa>=3.5?'hi':g.gpa>=2?'mid':g.gpa>0?'lo':'f')+'" title="'+esc(g.rounded?'Quy đổi từ '+fnum(g.s10)+' (làm tròn '+fnum(g.r)+')':'Quy đổi từ '+fnum(g.s10))+'">'+esc(g.letter)+' · '+gp(g.gpa)+'/4</span>';
function calcCourse(c){
 const scale=+c.scale>0?+c.scale:10,cols=c.columns,out={scale};
 const w=x=>(+x.weight>0?+x.weight:0);out.W=cols.reduce((a,x)=>a+w(x),0);
 const vals=cols.map(x=>gradeVal(x,scale));out.bad=cols.filter((x,i)=>vals[i].bad).map(x=>x.name);
 if(!cols.length||out.W<=0){out.err='Hãy nhập trọng số (%) cho ít nhất một đầu điểm.';return out}
 if(out.bad.length){out.err='Điểm ở cột “'+out.bad.join('”, “')+'” chưa hợp lệ (phải là số từ 0 đến '+scale+').';return out}
 let ti=cols.findIndex(x=>x.id===c.targetCol&&w(x)>0);out.explicit=ti>=0;
 if(ti<0){for(let i=cols.length-1;i>=0;i--){if(vals[i].empty&&w(cols[i])>0){ti=i;break}}}
 let sKnown=0,wKnown=0,wOther=0;
 cols.forEach((x,i)=>{if(i===ti)return;if(vals[i].empty)wOther+=w(x);else{sKnown+=vals[i].avg*w(x);wKnown+=w(x)}});
 out.cur=sKnown/out.W;out.known=wKnown;out.hasOther=wOther>0;
 if(ti<0){out.final=sKnown/out.W;out.complete=true}
 else{
  const wT=w(cols[ti]);out.target=cols[ti].name;out.targetIgnored=!vals[ti].empty;
  out.max=(sKnown+scale*(wOther+wT))/out.W;out.min=sKnown/out.W;
  const T=targetInfo(c).T;
  if(isFinite(T)){
   out.T=T;
   let a=parseFloat(String(c.assume).replace(',','.'));
   if(!isFinite(a)||a<0)a=wKnown>0?sKnown/wKnown:T;a=Math.min(a,scale);out.assume=a;
   out.need=(T*out.W-sKnown-a*wOther)/wT;
   if(wOther>0)out.needBest=(T*out.W-sKnown-scale*wOther)/wT;
  }
 }
 return out;
}
/* Điểm mong muốn: nhập theo thang 10 hoặc thang 4 (thang 4 đổi ngược về thang 10 theo bảng quy đổi) */
function targetInfo(c){
 const scale=+c.scale>0?+c.scale:10,raw=parseFloat(String(c.target).replace(',','.')),mode=c.tmode==='4'?4:10;
 if(!isFinite(raw))return{mode,T:NaN,hint:''};
 if(mode===10){
  if(raw<0||raw>scale)return{mode,T:raw,hint:''};
  const g=toGrade(raw,scale);return{mode,T:raw,hint:'= '+g.letter+' · '+gp(g.gpa)+'/4 (thang 4)'};
 }
 const sc=gscale(),ok=sc.filter(x=>+x.gpa>=raw-1e-9);
 if(raw<0||!ok.length){const mx=Math.max(...sc.map(x=>+x.gpa));return{mode,T:NaN,bad:true,hint:'Thang 4 trong bảng quy đổi chỉ có từ 0 đến '+gp(mx)+'.'}}
 const g=ok.reduce((a,x)=>+x.min<+a.min?x:a,ok[0]),exact=sc.some(x=>Math.abs(+x.gpa-raw)<1e-9),T=+g.min/10*scale;
 return{mode,T,hint:(exact?'':'Không có mức đúng '+gp(raw)+', lấy mức gần nhất bên trên. ')+gp(g.gpa)+' = '+g.letter+' ⇒ cần tổng kết ≥ '+gp(g.min)+(scale!==10?'/10 (= '+fnum(T)+'/'+scale+')':'')};
}
function kpiDual(cls,ico,title,score,sc,sub){
 const g=toGrade(score,sc),tip=g.rounded?'Quy đổi từ '+fnum(g.s10)+' (làm tròn '+fnum(g.r)+')':'Quy đổi từ '+fnum(g.s10);
 return '<div class="big-kpi '+cls+'"><div class="kpi-title"><span class="kpi-ico">'+ico+'</span>'+title+'</div><div class="dual"><div class="d10"><b>'+fnum(score)+'</b><em>/'+sc+'</em></div><div class="d4" title="'+esc(tip)+'"><b>'+gp(g.gpa)+'</b><em>/4 · '+esc(g.letter)+'</em></div></div><span class="kpi-sub">'+sub+'</span></div>';
}
function courseOutHtml(c,r){
 if(r.err)return '<div class="course-err">'+esc(r.err)+'</div>';
 const sc=r.scale;let h='<div class="kpi-row">';
 const kpi=(cls,ico,title,val,sub,extra)=>'<div class="big-kpi '+cls+'"><div class="kpi-title"><span class="kpi-ico">'+ico+'</span>'+title+'</div><b>'+val+'</b><span class="kpi-sub">'+sub+'</span>'+(extra||'')+'</div>';
 if(r.complete){
  const T=targetInfo(c).T;
  h+=kpiDual('cur','🏁','Điểm tổng kết',r.final,sc,'Đã đủ các đầu điểm');
  if(isFinite(T))h+=kpi(r.final>=T-1e-9?'ok':'bad','🎯',r.final>=T-1e-9?'Đã đạt mục tiêu':'Chưa đạt mục tiêu',r.final>=T-1e-9?'Đạt':'Chưa','So với mục tiêu '+fnum(T));
  return h+'</div>';
 }
 h+=kpi('cur','📊','Điểm hiện có',fnum(r.cur),'Từ các cột đã nhập, đã nhân trọng số');
 h+=kpiDual('max','🔝','Tổng kết tối đa',r.max,sc,'Nếu các cột chưa có đều được '+sc);
 if(r.need!=null){
  const need=Math.max(0,ceil2(r.need)),cls=r.need<=0?'ok':r.need>sc+1e-9?'bad':'need';
  h+=kpi(cls,'🎯','Cần ở “'+esc(r.target)+'”',r.need>sc+1e-9?'—':(r.need<=0?'0':'≥ '+fnum(need)),'Để điểm tổng kết đạt '+fnum(r.T)+(c.tmode==='4'?' (thang 4: '+gp(parseFloat(String(c.target).replace(',','.')))+')':''));
 }
 h+='</div>';
 if(r.need!=null){
  let cls,msg;const ratio=r.need/sc;
  if(r.need<=0){cls='easy';msg='Bạn đã chắc chắn đạt mục tiêu '+fnum(r.T)+', kể cả khi “'+esc(r.target)+'” được 0 điểm'+(r.hasOther?' (và các cột khác theo giả định '+fnum(r.assume)+')':'')+'.'}
  else if(r.need>sc+1e-9){cls='no';msg='Không khả thi: cần '+fnum(ceil2(r.need))+' trong khi tối đa chỉ là '+sc+'. Điểm tổng kết cao nhất bạn có thể đạt là '+fnum(r.max)+'.'}
  else if(ratio<=0.5){cls='easy';msg='Dễ: chỉ cần khoảng '+fnum(Math.round(ratio*100))+'% số điểm tối đa của “'+esc(r.target)+'”.'}
  else if(ratio<=0.75){cls='mid';msg='Vừa sức: cần ở mức khá ('+fnum(Math.round(ratio*100))+'% số điểm tối đa).'}
  else if(ratio<=0.9){cls='hard';msg='Khó: cần '+fnum(Math.round(ratio*100))+'% số điểm tối đa, nên dành nhiều thời gian ôn.'}
  else{cls='hard';msg='Rất khó: cần '+fnum(Math.round(ratio*100))+'% số điểm tối đa của “'+esc(r.target)+'”.'}
  h+='<div class="verdict '+cls+'">'+msg+'</div>';
  if(r.hasOther&&r.needBest!=null)h+='<div class="verdict info">Còn các cột trống khác: tôi giả định chúng đạt '+fnum(r.assume)+'. Nếu chúng đều được '+sc+' thì “'+esc(r.target)+'” chỉ cần ≥ '+fnum(Math.max(0,ceil2(r.needBest)))+'.</div>';
  if(r.targetIgnored)h+='<div class="verdict info">Điểm bạn đã nhập ở “'+esc(r.target)+'” được bỏ qua khi tính, vì cột này đang được chọn làm cột cần tính (🎯).</div>';
 }else h+='<div class="verdict info">Nhập “Điểm tổng kết mong muốn” để biết cần bao nhiêu điểm ở “'+esc(r.target)+'”.</div>';
 return h;
}
function updateCourseUI(el){
 const c=db.grades.courses.find(x=>x.id===el.dataset.id);if(!c)return;const r=calcCourse(c);
 el.querySelector('.calc-out').innerHTML=courseOutHtml(c,r);
 const warn=el.querySelector('.course-warn');const off=Math.abs(r.W-100)>0.01&&r.W>0;warn.hidden=!off;if(off)warn.textContent='⚠ Tổng trọng số hiện là '+fnum(r.W)+'% (nên bằng 100%). Kết quả được chuẩn hóa theo tổng '+fnum(r.W)+'%.';
 el.querySelector('.gt-wsum').textContent='Tổng trọng số = '+fnum(r.W)+'%';
 const fc=el.querySelector('.gt-final-cell');if(r.complete){const g=toGrade(r.final,r.scale);fc.innerHTML=fnum(r.final)+'<small class="fc-grade">'+esc(g.letter)+' · '+gp(g.gpa)+'/4</small>'}else fc.textContent='-';
 const hint=el.querySelector('.target-hint');if(hint)hint.textContent=targetInfo(c).hint;fc.title=r.complete?'Điểm tổng kết':'Chưa đủ điểm các đầu điểm';
 el.querySelectorAll('.gt-score').forEach((inp,i)=>{const col=c.columns[i];const v=gradeVal(col,r.scale);inp.classList.toggle('bad',!!v.bad);inp.classList.toggle('skip',!!(r.target&&col.name===r.target&&!v.empty&&!v.bad))});
}
function renderGrades(){
 ensureGrades();const box=$('courseList');box.innerHTML='';
 db.grades.courses.forEach(c=>{
  const el=document.createElement('section');el.className='course';el.dataset.id=c.id;
  const r=calcCourse(c),tgtName=r.target;
  el.innerHTML='<div class="course-head"><input class="course-name" maxlength="60" value="'+esc(c.name)+'" aria-label="Tên môn"><label class="course-scale-wrap">Thang điểm <input class="course-scale" type="number" min="1" max="1000" step="any" value="'+esc(c.scale)+'"></label><button class="btn btn-light" data-act="addcol" type="button">＋ Đầu điểm</button><button class="btn btn-danger" data-act="delcourse" type="button" title="Xóa môn này">🗑 Xóa môn</button></div>'+
  '<div class="grade-scroll"><table class="grade-table"><thead><tr>'+c.columns.map(col=>'<th><div class="gt-name"><input class="gt-cname" data-col="'+col.id+'" maxlength="40" value="'+esc(col.name)+'" aria-label="Tên đầu điểm"><button type="button" class="gt-x" data-act="delcol" data-col="'+col.id+'" title="Xóa đầu điểm" aria-label="Xóa đầu điểm">×</button></div><div class="gt-w"><input class="gt-cw" data-col="'+col.id+'" type="number" min="0" max="100" step="any" value="'+esc(col.weight)+'" aria-label="Trọng số (%)">%<button type="button" class="gt-target'+(tgtName===col.name?' on':'')+'" data-act="target" data-col="'+col.id+'" title="Tính điểm cần ở đầu điểm này" aria-label="Chọn đầu điểm cần tính">🎯</button></div></th>').join('')+'<th class="gt-final">Điểm tổng kết<small class="gt-wsum"></small></th></tr></thead><tbody><tr>'+c.columns.map(col=>'<td><input class="gt-score" data-col="'+col.id+'" inputmode="decimal" placeholder="-" value="'+esc(col.score)+'" aria-label="Điểm"></td>').join('')+'<td class="gt-final-cell">-</td></tr></tbody></table></div>'+
  '<div class="course-warn" hidden></div><div class="course-calc"><div class="calc-in"><label>Điểm tổng kết mong muốn<span class="tmode-row"><input class="course-target" inputmode="decimal" placeholder="'+(c.tmode==='4'?'Ví dụ: 3.0':'Ví dụ: 6')+'" value="'+esc(c.target)+'"><span class="seg tmode" role="group" aria-label="Nhập theo thang nào"><button type="button" data-act="tmode" data-m="10" class="'+(c.tmode==='4'?'':'on')+'" title="Nhập theo thang 10">10</button><button type="button" data-act="tmode" data-m="4" class="'+(c.tmode==='4'?'on':'')+'" title="Nhập theo thang 4">4</button></span></span><small class="target-hint"></small></label><label>Hoặc chọn mục tiêu theo điểm chữ<select class="target-grade"><option value="">Chọn hạng…</option>'+gscale().map(g=>'<option value="'+g.min+'">'+esc(g.letter)+' · từ '+fnum(g.min)+' ('+gp(g.gpa)+'/4)</option>').join('')+'</select></label><label>Giả định các cột trống khác<input class="course-assume" inputmode="decimal" placeholder="Để trống: lấy trung bình các cột đã có" value="'+esc(c.assume)+'"></label><small>Nhiều điểm trong một ô: cách nhau bằng dấu cách hoặc dấu ; (ví dụ <b>7 8,5 6</b>), ô sẽ lấy trung bình. Dấu phẩy dùng làm số thập phân (7,5). Nhấn 🎯 để chọn đầu điểm cần tính, mặc định là đầu điểm trống ngoài cùng bên phải.</small></div><div class="calc-out"></div></div>'+
  '<div class="calc-actions" style="padding:0 18px 18px"><button class="btn btn-light" type="button" data-act="studytask">＋ Tạo thẻ ôn thi từ kết quả</button></div>';
  box.appendChild(el);updateCourseUI(el);
 });
}
$('courseList').addEventListener('input',e=>{
 const el=e.target.closest('.course');if(!el)return;const c=db.grades.courses.find(x=>x.id===el.dataset.id);if(!c)return;
 const t=e.target,col=t.dataset.col&&c.columns.find(x=>x.id===t.dataset.col);
 if(t.classList.contains('course-name'))c.name=t.value;
 else if(t.classList.contains('course-scale'))c.scale=t.value;
 else if(t.classList.contains('course-target'))c.target=t.value;
 else if(t.classList.contains('course-assume'))c.assume=t.value;
 else if(t.classList.contains('gt-cname')&&col)col.name=t.value;
 else if(t.classList.contains('gt-cw')&&col)col.weight=t.value;
 else if(t.classList.contains('gt-score')&&col)col.score=t.value;
 else return;
 updateCourseUI(el);save();
});
$('courseList').addEventListener('change',e=>{
 const t=e.target;if(!t.classList.contains('target-grade')||!t.value)return;
 const el=t.closest('.course'),c=db.grades.courses.find(x=>x.id===el.dataset.id);if(!c)return;
 const sc=+c.scale>0?+c.scale:10;c.target=fnum(parseFloat(t.value)/10*sc);
 if(c.tmode==='4'){c.tmode='10';save();renderGrades();showToast('Đã chuyển ô mong muốn sang thang 10 để giữ đúng hạng chữ đã chọn');return}
 el.querySelector('.course-target').value=c.target;t.value='';updateCourseUI(el);save();
});
$('courseList').addEventListener('click',e=>{
 const btn=e.target.closest('[data-act]');if(!btn)return;const el=btn.closest('.course'),c=db.grades.courses.find(x=>x.id===el.dataset.id);if(!c)return;
 const act=btn.dataset.act;
 if(act==='addcol'){const nc={id:uid(),name:'Đầu điểm mới',weight:0,score:''};c.columns.splice(Math.max(c.columns.length-1,0),0,nc);save();renderGrades();const inp=$('courseList').querySelector('.gt-cname[data-col="'+nc.id+'"]');if(inp){inp.focus();inp.select()}}
 else if(act==='delcol'){if(c.columns.length<=1){showToast('Cần giữ lại ít nhất một đầu điểm');return}pushUndo();c.columns=c.columns.filter(x=>x.id!==btn.dataset.col);if(c.targetCol===btn.dataset.col)c.targetCol=null;save();renderGrades();showToast('Đã xóa đầu điểm',true)}
 else if(act==='target'){c.targetCol=c.targetCol===btn.dataset.col?null:btn.dataset.col;save();renderGrades()}
 else if(act==='tmode'){
  const m=btn.dataset.m==='4'?'4':'10';if((c.tmode==='4'?'4':'10')===m)return;
  const sc=+c.scale>0?+c.scale:10,cur=targetInfo(c);
  if(isFinite(cur.T)&&cur.T>=0&&cur.T<=sc)c.target=m==='4'?gp(toGrade(cur.T,sc).gpa):fnum(cur.T);else c.target='';
  c.tmode=m;save();renderGrades();const ti=$('courseList').querySelector('.course[data-id="'+c.id+'"] .course-target');if(ti)ti.focus();
 }
 else if(act==='delcourse'){pushUndo();db.grades.courses=db.grades.courses.filter(x=>x.id!==c.id);save();renderGrades();showToast('Đã xóa môn “'+c.name+'”',true)}
 else if(act==='studytask'){
  const r=calcCourse(c);if(r.err||r.need==null){showToast('Hãy nhập điểm mong muốn để tạo thẻ có con số cụ thể');return}
  const pb=personalBoard();if(!pb){showToast('Cần có một bảng cá nhân để tạo thẻ');return}
  viewMode='board';db.current=pb.id;zoomDay=null;render();openTask(null,null,null);
  const need=Math.max(0,ceil2(r.need));
  $('taskTitle').value='Ôn thi '+r.target.toLowerCase()+': '+c.name+(r.need>0&&r.need<=r.scale?' (cần ≥ '+fnum(need)+')':'');
  $('taskDesc').value='Mục tiêu tổng kết '+fnum(r.T)+'. '+(r.need>r.scale?'Hiện không khả thi (tối đa '+fnum(r.max)+').':'Cần ≥ '+fnum(need)+'/'+r.scale+' ở '+r.target+'.');
 }
});
let draftScale=[];
function renderScaleRows(){
 const tb=$('scaleRows');tb.innerHTML='';
 draftScale.forEach((r,i)=>{
  const tr=document.createElement('tr');
  tr.innerHTML='<td><input type="number" class="sc-min" step="any" min="0" max="100" value="'+esc(r.min)+'" aria-label="Từ điểm"></td><td><input class="sc-letter" maxlength="4" value="'+esc(r.letter)+'" aria-label="Điểm chữ"></td><td><input type="number" class="sc-gpa" step="any" min="0" max="5" value="'+esc(r.gpa)+'" aria-label="Thang 4"></td><td><button type="button" class="gt-x" aria-label="Xóa dòng" title="Xóa dòng">×</button></td>';
  tr.querySelector('.sc-min').oninput=e=>{r.min=e.target.value};tr.querySelector('.sc-letter').oninput=e=>{r.letter=e.target.value};tr.querySelector('.sc-gpa').oninput=e=>{r.gpa=e.target.value};
  tr.querySelector('.gt-x').onclick=()=>{draftScale.splice(i,1);renderScaleRows()};
  tb.appendChild(tr);
 });
}
function openScale(){gscale();draftScale=db.gradeScale.slice().sort((a,b)=>b.min-a.min).map(x=>({...x}));$('scaleRound').checked=db.gradeRound!==false;renderScaleRows();openModal('scaleModal')}
$('scaleBtn').onclick=openScale;
$('scaleAdd').onclick=()=>{draftScale.push({min:'',letter:'',gpa:''});renderScaleRows();const ins=$('scaleRows').querySelectorAll('.sc-min');ins[ins.length-1].focus()};
$('scaleReset').onclick=()=>{draftScale=DEFAULT_SCALE();renderScaleRows()};
$('scaleForm').addEventListener('submit',e=>{
 e.preventDefault();
 const rows=draftScale.map(r=>({min:parseFloat(r.min),letter:String(r.letter).trim(),gpa:parseFloat(r.gpa)}));
 if(!rows.length||rows.some(r=>!isFinite(r.min)||!isFinite(r.gpa)||!r.letter||r.min<0||r.gpa<0)){showToast('Mỗi dòng cần đủ điểm, điểm chữ và thang 4 hợp lệ');return}
 if(!rows.some(r=>r.min===0)){showToast('Cần một dòng bắt đầu từ 0 (ví dụ F = 0)');return}
 if(new Set(rows.map(r=>r.min)).size!==rows.length){showToast('Hai dòng không được có cùng mốc điểm');return}
 pushUndo();db.gradeScale=rows.sort((a,b)=>b.min-a.min);db.gradeRound=$('scaleRound').checked;save();closeModals();renderGrades();showToast('Đã lưu bảng quy đổi',true);
});
function openGrades(){viewMode='grades';$('sidebar').classList.remove('open');renderGrades();render();window.scrollTo(0,0)}
$('navGrades').onclick=openGrades;
$('addCourseBtn').onclick=()=>{ensureGrades();db.grades.courses.push(newCourse(db.grades.courses.length+1));save();renderGrades();const cs=$('courseList').querySelectorAll('.course');cs[cs.length-1].scrollIntoView({behavior:'smooth',block:'start'})};
