/* Cài đặt nhắc việc qua email (Sprint 5).
   Mỗi người bật/tắt và chọn mốc nhắc 30 và/hoặc 60 phút; cài đặt lưu ở bảng email_reminders trên Supabase.
   Việc gửi thư do Edge Function send-reminders làm (pg_cron gọi mỗi 5 phút), web chỉ lưu cài đặt và gửi email thử.
   Chỉ có ở bản đăng nhập Supabase. */
const emailOk=()=>typeof Store!=='undefined'&&Store.name==='supabase'&&!!Store.emailPrefs;
let emailBusy=false;
function emailMsg(t,bad){const m=$('emailRemMsg');m.textContent=t;m.style.color=bad?'#d64a5a':''}
function emailSetEnabled(on){['emailRemChk','emailLead30','emailLead60','emailTestBtn'].forEach(id=>{$(id).disabled=!on});$('emailRemOpts').style.opacity=on?'1':'.55'}
function emailErrText(e){
 const m=(e&&(e.message||e.code))||'lỗi';
 return /42P01|schema cache|does not exist|relation/i.test(m)?'Chưa chạy supabase/email_reminders.sql trên Supabase (xem supabase/README.md).':'Không lưu được: '+m;
}
async function refreshEmailRemUI(){
 if(!emailOk()){emailSetEnabled(false);$('emailRemChk').checked=false;$('emailLead30').checked=false;$('emailLead60').checked=false;emailMsg('Chỉ có ở bản đăng nhập Supabase. Chế độ chạy cục bộ không gửi được email.');return}
 emailSetEnabled(false);emailMsg('Đang tải cài đặt...');
 try{
  const p=await Store.emailPrefs.get(),leads=Array.isArray(p.leads)?p.leads:[30];
  $('emailRemChk').checked=!!p.enabled;$('emailLead30').checked=leads.includes(30);$('emailLead60').checked=leads.includes(60);
  emailSetEnabled(true);$('emailLead30').disabled=$('emailLead60').disabled=!p.enabled;
  emailMsg('Thư gửi tới email đăng nhập của bạn, trong khoảng 5 phút quanh mốc đã chọn. Chỉ nhắc việc có hạn kèm giờ và chưa xong (cả việc nhóm giao cho bạn).');
 }catch(e){emailSetEnabled(false);emailMsg(emailErrText(e),true)}
}
async function saveEmailPrefs(){
 if(!emailOk()||emailBusy)return;
 const on=$('emailRemChk').checked;
 if(on&&!$('emailLead30').checked&&!$('emailLead60').checked)$('emailLead30').checked=true;      // bật nhắc thì phải có ít nhất một mốc
 const leads=[30,60].filter(x=>$('emailLead'+x).checked);
 $('emailLead30').disabled=$('emailLead60').disabled=!on;
 emailBusy=true;
 try{await Store.emailPrefs.set({enabled:on,leads:leads.length?leads:[30]});showToast(on?'Đã bật email nhắc việc ('+leads.join(' và ')+' phút trước hạn)':'Đã tắt email nhắc việc')}
 catch(e){emailMsg(emailErrText(e),true);showToast('Chưa lưu được cài đặt email nhắc việc')}
 finally{emailBusy=false}
}
['emailRemChk','emailLead30','emailLead60'].forEach(id=>$(id).addEventListener('change',saveEmailPrefs));
$('emailTestBtn').onclick=async()=>{
 if(!emailOk())return;
 const b=$('emailTestBtn');b.disabled=true;emailMsg('Đang gửi email thử...');
 try{const r=await Store.emailTest();emailMsg('Đã gửi email thử tới '+(r&&r.email?r.email:'địa chỉ đăng nhập của bạn')+'. Nếu chưa thấy, hãy kiểm tra thư rác.')}
 catch(e){emailMsg((e&&e.message)||'Không gửi được email thử',true)}
 finally{b.disabled=false}
};
