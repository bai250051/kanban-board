/* Tiện ích dùng chung, định dạng giờ 12/24, bộ chọn giờ AM/PM */
const $=id=>document.getElementById(id);
const COLORS=['','green','orange','blue'];
const KEY_USERS='kanban_sprint1_users',KEY_SESSION='kanban_sprint1_session',dataKey=e=>'kanban_s2_data_'+e;
let user=null,db=null,editId=null,draftChecklist=[],toastTimer,pendingJoin=null,taskDeleteArmed=false,boardDeleteArmed=false,newBoardDefault='personal';
const filters={q:'',assignee:'all',priority:'all',tag:'all',sprint:'all'};
const TAG_COLORS=['','#6759e8','#d98526','#1c9b72','#d65363','#3b82d6','#c05bb8','#6b7280'];
let draftTagColor='';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const dtLocal=d=>ymd(d)+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
function dtOffset(days,h=23,m=59){const d=new Date();d.setDate(d.getDate()+days);d.setHours(h,m,0,0);return dtLocal(d)}
function dueTs(s){if(!s)return NaN;return new Date(s.length===10?s+'T23:59':s).getTime()}
/* ---------- Giờ: định dạng 12/24 giờ và bộ chọn giờ ---------- */
const TF_KEY='kanban_timefmt';
let timeFmt=(()=>{try{return localStorage.getItem(TF_KEY)==='24'?'24':'12'}catch(e){return'12'}})();
function fmtT(hm){
 const m=/^(\d{1,2}):(\d{2})/.exec(hm||'');if(!m)return hm||'';
 const h=+m[1];if(timeFmt==='24')return pad(h)+':'+m[2];
 return (h%12||12)+':'+m[2]+' '+(h>=12?'PM':'AM');
}
function fmtDue(s){const d=new Date(s.length===10?s+'T23:59':s);return pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+fmtT(pad(d.getHours())+':'+pad(d.getMinutes()))}
const tpList=[];
function tpNorm(v){const m=/^(\d{1,2}):(\d{2})/.exec(String(v==null?'':v));if(!m)return'';const h=+m[1],mi=+m[2];return h>23||mi>59?'':pad(h)+':'+pad(mi)}
/* Gắn bộ chọn giờ (giờ, phút, AM/PM) vào ô ẩn inp. inp.value luôn là 'HH:MM' (24 giờ) hoặc '' */
function tpInit(inp,host){
 host.innerHTML='<select class="tp-h" aria-label="Giờ"></select><span class="tp-sep">:</span><select class="tp-m" aria-label="Phút"></select><select class="tp-ap" aria-label="AM hoặc PM"></select>';
 const sh=host.querySelector('.tp-h'),sm=host.querySelector('.tp-m'),sa=host.querySelector('.tp-ap');
 sh.id=inp.id+'H';sm.id=inp.id+'M';sa.id=inp.id+'AP';
 const lab=document.querySelector('label[for="'+inp.id+'"]');if(lab)lab.htmlFor=sh.id;
 let val='';
 const opt=(v,x)=>'<option value="'+v+'">'+x+'</option>';
 function paint(){
  if(!val){sh.value='';sm.value='';sa.value='';return}
  const h=+val.slice(0,2),m=+val.slice(3,5);
  if(timeFmt==='12'){sh.value=String(h%12||12);sa.value=h>=12?'PM':'AM'}else{sh.value=String(h);sa.value=''}
  sm.value=String(m);
 }
 function build(){
  const h12=timeFmt==='12';let o=opt('','--');
  if(h12)for(let h=1;h<=12;h++)o+=opt(h,h);else for(let h=0;h<24;h++)o+=opt(h,pad(h));
  sh.innerHTML=o;
  if(!sm.options.length){let q=opt('','--');for(let i=0;i<60;i++)q+=opt(i,pad(i));sm.innerHTML=q}
  sa.innerHTML=opt('','--')+opt('AM','AM')+opt('PM','PM');sa.hidden=!h12;paint();
 }
 function fromUI(){
  if(!sh.value&&!sm.value&&!sa.value)return'';
  let h=sh.value===''?8:+sh.value;const m=sm.value===''?0:+sm.value;
  if(timeFmt==='12')h=(h%12)+((sa.value||'AM')==='PM'?12:0);
  return pad(h)+':'+pad(m);
 }
 [sh,sm,sa].forEach(s=>s.addEventListener('input',e=>{
  e.stopPropagation();
  val=(e.target===sh&&sh.value==='')?'':fromUI();paint();
  inp.dispatchEvent(new Event('input',{bubbles:true}));
 }));
 Object.defineProperty(inp,'value',{get(){return val},set(v){val=tpNorm(v);paint()},configurable:true});
 tpList.push({build});build();
}
/* Hạn của thẻ: ô ngày + bộ chọn giờ, gộp thành 'YYYY-MM-DDTHH:MM' (hoặc chỉ ngày nếu để trống giờ) */
function dueInit(){
 const hid=$('taskDue'),dIn=$('taskDueD'),tIn=$('taskDueT');tpInit(tIn,$('taskDueTp'));
 Object.defineProperty(hid,'value',{
  get(){const d=dIn.value;return d?(tIn.value?d+'T'+tIn.value:d):''},
  set(v){v=String(v||'');dIn.value=/^\d{4}-\d{2}-\d{2}/.test(v)?v.slice(0,10):'';tIn.value=v.length>10?v.slice(11,16):''},
  configurable:true});
 dIn.addEventListener('input',()=>{if(dIn.value&&!tIn.value)tIn.value='23:59'});
 $('taskDueClear').onclick=()=>{dIn.value='';tIn.value=''};
}
function initials(n){const p=String(n||'?').trim().split(/\s+/);return p.length>1?(p[0][0]+p[p.length-1][0]).toUpperCase():p[0].slice(0,2).toUpperCase()}
const lastName=n=>String(n||'').trim().split(/\s+/).pop();
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
