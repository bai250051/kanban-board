/* Sao lưu và khôi phục dữ liệu bằng file .json */
const BACKUP_APP='kanban-board',BACKUP_VER=1,BACKUP_BIG=80*1048576;
const blobToDataUrl=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(b)});
const dataUrlToBlob=async u=>(await fetch(u)).blob();
async function exportBackup(){
 if(!user||!db)return;
 const btn=$('exportJson');btn.disabled=true;
 try{
  flushSave();
  const data=JSON.parse(JSON.stringify(db)),files={};
  const atts=[];data.boards.forEach(b=>b.tasks.forEach(t=>(t.attachments||[]).forEach(a=>{if(a.idb)atts.push(a)})));
  const total=atts.reduce((s,a)=>s+(a.size||0),0);
  let withFiles=true,nFiles=0,skipped=0;
  if(total>BACKUP_BIG&&!confirm('Các file đính kèm nặng khoảng '+fmtSize(total)+'. Xuất kèm file có thể mất nhiều thời gian và bộ nhớ.\n\nBấm OK để xuất kèm file, bấm Hủy để chỉ xuất dữ liệu (không có nội dung file).'))withFiles=false;
  if(withFiles)for(const a of atts){const bl=await fileBlob(a);if(bl){files[a.id]={name:a.name,type:a.type||bl.type||'',dataUrl:await blobToDataUrl(bl)};nFiles++}else skipped++}
  const out={app:BACKUP_APP,version:BACKUP_VER,exportedAt:new Date().toISOString(),user:{name:user.name,email:user.email},data,files};
  const url=URL.createObjectURL(new Blob([JSON.stringify(out)],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download='kanban-backup-'+vnToday()+'.json';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},800);
  const nT=data.boards.reduce((s,b)=>s+b.tasks.length,0);
  showToast('Đã xuất '+data.boards.length+' bảng, '+nT+' thẻ'+(nFiles?', '+nFiles+' file đính kèm':'')+(withFiles?'':' (không kèm file)')+(skipped?' · '+skipped+' file không đọc được':''));
 }catch(e){showToast('Xuất dữ liệu không thành công')}
 finally{btn.disabled=false}
}
function backupError(o){
 if(!o||typeof o!=='object'||o.app!==BACKUP_APP)return 'Đây không phải file sao lưu của Kanban Board.';
 if(!(o.version>=1&&o.version<=BACKUP_VER))return 'File sao lưu có phiên bản mới hơn, hãy cập nhật web trước khi nhập.';
 const d=o.data;if(!d||!Array.isArray(d.boards)||!d.boards.length)return 'File không có bảng nào để nhập.';
 for(const b of d.boards){
  if(!b||typeof b.id!=='string'||typeof b.name!=='string'||!['personal','team'].includes(b.type)||!Array.isArray(b.tasks))return 'Dữ liệu bảng trong file không hợp lệ.';
  for(const t of b.tasks)if(!t||typeof t.id!=='string'||typeof t.title!=='string')return 'Dữ liệu thẻ trong file không hợp lệ.';
 }
 return '';
}
async function importBackup(file){
 if(!user||!db)return;
 try{
  if(file.size>300*1048576){showToast('File quá lớn để nhập');return}
  let o;try{o=JSON.parse(await file.text())}catch(e){showToast('Không đọc được file: không phải JSON hợp lệ');return}
  const err=backupError(o);if(err){showToast(err);return}
  const nB=o.data.boards.length,nT=o.data.boards.reduce((s,b)=>s+b.tasks.length,0),nF=Object.keys(o.files||{}).length;
  const when=o.exportedAt?new Date(o.exportedAt).toLocaleString('vi-VN',{timeZone:VN_TZ}):'không rõ';
  if(!confirm('Nhập bản sao lưu gồm '+nB+' bảng, '+nT+' thẻ, '+nF+' file (xuất lúc '+when+')?\n\nToàn bộ dữ liệu hiện tại của tài khoản này sẽ bị thay thế. Nếu muốn giữ lại, hãy xuất một bản sao lưu trước.'+(Store.name==='supabase'?'\n\nLưu ý: dữ liệu được lưu trên máy chủ; bảng nhóm bạn là chủ mà không có trong file này sẽ bị xóa khỏi máy chủ.':'')))return;
  let raw=JSON.stringify(o.data);const old=o.user&&o.user.email;
  if(old&&old!==user.email)raw=raw.split(JSON.stringify(old)).join(JSON.stringify(user.email));
  let restored=0;
  for(const id of Object.keys(o.files||{})){const f=o.files[id];if(!f||typeof f.dataUrl!=='string'||!f.dataUrl.startsWith('data:'))continue;try{await FileStore.put(id,await dataUrlToBlob(f.dataUrl));restored++}catch(e){}}
  clearTimeout(saveTimer);saveTimer=null;
  await Store.save(user,JSON.parse(raw));
  db=await loadDb();viewMode='board';zoomDay=null;
  closeModals();render();renderGrades();
  showToast('Đã nhập '+nB+' bảng, '+nT+' thẻ'+(restored?', '+restored+' file đính kèm':''));
 }catch(e){console.error('Nhập dữ liệu lỗi:',e&&(e.message||e));showToast('Nhập dữ liệu không thành công'+(e&&e.message?': '+e.message:''))}
}
$('exportJson').onclick=exportBackup;
$('importJsonBtn').onclick=()=>$('importJson').click();
$('importJson').addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';if(f)importBackup(f)});
