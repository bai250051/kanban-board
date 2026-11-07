/* Kho dữ liệu trên máy chủ Supabase: đăng nhập thật, lưu dữ liệu theo tài khoản, bảng nhóm dùng chung,
   mời bằng mã số thành viên, file đính kèm, đồng bộ giữa các thành viên.
   Cùng giao diện với LocalStore (xem store-local.js). Cấu trúc bảng: supabase/schema.sql.
   Bảng cá nhân, điểm, cài đặt nằm trong user_data; mỗi bảng nhóm là một dòng trong boards. */
const SupabaseStore=(()=>{
 const cfg=KANBAN_CONFIG;
 const sb=supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'kanban_sb_auth'}});
 const J=x=>JSON.stringify(x);
 const clone=x=>JSON.parse(J(x));
 const UI_KEYS=['view','sprintSel','collapsed'];          // trạng thái xem của từng người, không dùng chung
 let me=null;                                             // {id,name,member_no,email}
 const known=new Map();                                   // boardId -> {version,json}: bản đã đồng bộ lần cuối
 let lastRootJson='',membersSig='',invitesSig='';
 let channel=null,pollTimer=null,refreshing=null;
 const must=r=>{if(r.error)throw r.error;return r.data};

 /* ----- người dùng ----- */
 async function toUser(au){
  const p=must(await sb.from('profiles').select('id,member_no,display_name').eq('id',au.id).single());
  me={id:au.id,name:p.display_name,member_no:p.member_no,email:au.id,realEmail:au.email};   // email: mã định danh dùng trong dữ liệu (không lộ email thật cho nhóm)
  return me;
 }
 const authError=e=>{
  const m=((e&&(e.code||''))+' '+(e&&e.message||'')).toLowerCase();
  if(m.includes('database error'))return'profile';
  if(m.includes('already')||m.includes('exists'))return'exists';
  if(m.includes('invalid')&&m.includes('credential'))return'invalid';
  if(m.includes('not_confirmed')||m.includes('not confirmed'))return'confirm';
  if(m.includes('weak')||m.includes('password'))return'weak';
  return'failed';
 };

 /* ----- tách và ghép dữ liệu ----- */
 const strip=b=>{const o=clone(b);delete o.members;delete o.owner;UI_KEYS.forEach(k=>delete o[k]);o.type='team';return o};
 function rebuild(row,mems,profs,prev,ui){
  const b=clone(row.data);b.id=row.id;b.name=row.name;b.type='team';
  const rows=(mems||[]).filter(m=>m.board_id===row.id);
  const old=new Map(((prev&&prev.members)||[]).map(m=>[m.id,m]));
  b.members=rows.map(m=>{const p=profs.get(m.user_id)||{};return{id:m.user_id,name:p.display_name||'Thành viên',member_no:p.member_no,color:(old.get(m.user_id)||{}).color||''}});
  const ow=rows.find(m=>m.role==='owner');b.owner=ow?ow.user_id:row.owner_id;
  Object.assign(b,(prev&&pick(prev))||{},ui||{});
  return b;
 }
 const pick=b=>{const o={};UI_KEYS.forEach(k=>{if(b[k]!==undefined)o[k]=b[k]});return o};
 async function fetchMembers(boardIds){
  if(!boardIds.length)return{mems:[],profs:new Map()};
  const mems=must(await sb.from('board_members').select('board_id,user_id,role').in('board_id',boardIds));
  const ids=[...new Set(mems.map(m=>m.user_id))];
  const profs=new Map(must(await sb.from('profiles').select('id,member_no,display_name').in('id',ids)).map(p=>[p.id,p]));
  return{mems,profs};
 }
 /* Gộp ba bên: base (lần đồng bộ trước), mine (bản trên máy), theirs (bản máy chủ).
    Phần ai đổi thì lấy; cả hai cùng đổi thì ưu tiên bản máy chủ. Việc (thẻ) được gộp theo mã. */
 function mergeList(baseArr,mineArr,theirsArr){
  const idx=a=>new Map((a||[]).map(x=>[x.id,x])),B=idx(baseArr),M=idx(mineArr),T=idx(theirsArr);
  const pickItem=id=>{
   const b=B.get(id),m=M.get(id),t=T.get(id),jb=b&&J(b);
   if(m&&t)return J(m)===jb?t:(J(t)===jb?m:t);
   if(m&&!t)return !b?m:(J(m)===jb?null:m);
   if(!m&&t)return !b?t:(J(t)===jb?null:t);
   return null;
  };
  const order=[...(theirsArr||[]).map(x=>x.id),...(mineArr||[]).map(x=>x.id).filter(id=>!T.has(id))];
  return order.map(pickItem).filter(Boolean);
 }
 function merge3(base,mine,theirs){
  const out={},keys=new Set([...Object.keys(mine),...Object.keys(theirs),...Object.keys(base||{})]);
  for(const k of keys){
   if(k==='tasks'||k==='meetings')continue;
   const b=base?J(base[k]):undefined,m=J(mine[k]),t=J(theirs[k]);
   const v=m===b?theirs[k]:(t===b?mine[k]:theirs[k]);
   if(v!==undefined)out[k]=v;
  }
  out.tasks=mergeList(base&&base.tasks,mine.tasks,theirs.tasks);
  out.meetings=mergeList(base&&base.meetings,mine.meetings,theirs.meetings);   // cuộc họp gộp theo mã như thẻ việc
  return out;
 }

 /* ----- tải dữ liệu ----- */
 async function load(user){
  const ud=must(await sb.from('user_data').select('data').eq('user_id',me.id).maybeSingle());
  const rows=must(await sb.from('boards').select('id,owner_id,name,data,version').order('name'));
  known.clear();membersSig='';invitesSig='';
  if(!ud&&!rows.length){lastRootJson='';return null}
  const root=ud?clone(ud.data):{};
  const ui=root.boardUi||{};delete root.boardUi;
  const {mems,profs}=await fetchMembers(rows.map(r=>r.id));
  const teams=rows.map(r=>{known.set(r.id,{version:r.version,json:J(strip(rebuild(r,mems,profs)))});return rebuild(r,mems,profs,null,ui[r.id])});
  root.boards=[...(root.boards||[]).filter(b=>b.type!=='team'),...teams];
  lastRootJson=J(splitRoot(root).root);
  membersSig=sigMembers(mems);
  return root;
 }
 function splitRoot(db){
  const team=db.boards.filter(b=>b.type==='team'),personal=db.boards.filter(b=>b.type!=='team');
  const boardUi={};team.forEach(b=>{boardUi[b.id]=pick(b)});
  return{team,root:{...db,boards:personal,boardUi}};
 }
 const sigMembers=m=>m.map(x=>x.board_id+':'+x.user_id+':'+x.role).sort().join('|');

 /* ----- lưu dữ liệu ----- */
 let saving=null,pending=null;
 function save(user,db){
  pending=clone(db);
  if(saving)return saving;
  saving=(async()=>{try{while(pending){const s=pending;pending=null;await doSave(s)}}finally{saving=null}})();
  return saving;
 }
 async function doSave(snap){
  const {team,root}=splitRoot(snap);
  for(const b of team){
   const mine=strip(b),json=J(mine),k=known.get(b.id);
   if(!k){
    const r=must(await sb.from('boards').insert({id:b.id,owner_id:me.id,name:b.name,data:mine}).select('version').single());
    known.set(b.id,{version:r.version,json});
   }else if(k.json!==json){
    const rs=must(await sb.from('boards').update({name:b.name,data:mine}).eq('id',b.id).eq('version',k.version).select('version'));
    if(rs.length){known.set(b.id,{version:rs[0].version,json});continue}
    await resolveConflict(b);                      // có người sửa trước: gộp rồi lưu lại
   }
  }
  const ids=new Set(team.map(b=>b.id));
  for(const [id] of [...known]){
   if(ids.has(id))continue;                         // bảng không còn trên máy: chủ bảng thì xóa, thành viên thì rời nhóm
   const own=must(await sb.from('board_members').select('role').eq('board_id',id).eq('user_id',me.id).maybeSingle());
   if(own&&own.role==='owner')must(await sb.from('boards').delete().eq('id',id));
   else if(own)must(await sb.from('board_members').delete().eq('board_id',id).eq('user_id',me.id));
   known.delete(id);
  }
  const rj=J(root);
  if(rj!==lastRootJson){must(await sb.from('user_data').upsert({user_id:me.id,data:root},{onConflict:'user_id'}));lastRootJson=rj}
 }
 async function resolveConflict(local){
  const row=must(await sb.from('boards').select('id,owner_id,name,data,version').eq('id',local.id).maybeSingle());
  if(!row){known.delete(local.id);emit({type:'removed',boardId:local.id,name:local.name});return}
  const merged=await mergeInto(local,row),mine=strip(merged),k=known.get(local.id);
  if(k.json!==J(mine)){
   const rs=must(await sb.from('boards').update({name:merged.name,data:mine}).eq('id',local.id).eq('version',k.version).select('version'));
   if(rs.length)known.set(local.id,{version:rs[0].version,json:J(mine)});
  }
 }
 /* Gộp bản máy chủ (row) vào bản trên máy (local). Cập nhật mốc đồng bộ và báo cho giao diện gộp vào bản đang mở (apply). */
 async function mergeInto(local,row){
  const k=known.get(row.id),base=k?JSON.parse(k.json):null;
  const {mems,profs}=await fetchMembers([row.id]);
  const apply=live=>{
   const theirs=rebuild(row,mems,profs,live);
   const merged=live?Object.assign(merge3(base,strip(live),strip(theirs)),{id:row.id,type:'team'}):strip(theirs);
   return rebuild({...row,data:merged,name:merged.name||row.name},mems,profs,live);
  };
  known.set(row.id,{version:row.version,json:J(strip(rebuild(row,mems,profs)))});
  emit({type:'board',id:row.id,apply});
  return apply(local);
 }

 /* ----- đồng bộ giữa các thành viên: kiểm tra thay đổi từ máy chủ ----- */
 const listeners=[];
 function emit(evt){if(SupabaseStore_onRemote)SupabaseStore_onRemote(evt);listeners.forEach(f=>f(evt))}
 let SupabaseStore_onRemote=null;
 async function refresh(){
  if(!me||saving)return;
  if(refreshing)return refreshing;
  refreshing=(async()=>{
   try{
    const rows=must(await sb.from('boards').select('id,version'));
    const have=new Set(rows.map(r=>r.id));
    for(const [id,k] of [...known]){if(!have.has(id)){known.delete(id);emit({type:'removed',boardId:id})}}
    const changed=rows.filter(r=>{const k=known.get(r.id);return !k||r.version>k.version});
    if(changed.length){
     const full=must(await sb.from('boards').select('id,owner_id,name,data,version').in('id',changed.map(r=>r.id)));
     for(const row of full){
      if(!known.has(row.id)){   // bảng mới (vừa được nhận vào nhóm)
       const {mems,profs}=await fetchMembers([row.id]);const b=rebuild(row,mems,profs);
       known.set(row.id,{version:row.version,json:J(strip(b))});emit({type:'board',id:row.id,apply:()=>b,isNew:true});
      }else await mergeInto(currentLocal(row.id),row);
     }
    }
    const mems=must(await sb.from('board_members').select('board_id,user_id,role'));
    const sig=sigMembers(mems);
    if(sig!==membersSig){const first=membersSig==='';membersSig=sig;if(!first){const {mems:m2,profs}=await fetchMembers([...have]);emit({type:'members',mems:m2,profs})}}
    const inv=must(await sb.rpc('my_pending_invitations'));
    const isig=inv.map(i=>i.id).join(',');
    if(isig!==invitesSig){invitesSig=isig;emit({type:'invites',list:inv})}
   }catch(e){/* mất kết nối: lần sau thử lại */}
   finally{refreshing=null}
  })();
  return refreshing;
 }
 let currentLocal=()=>null;
 function subscribe(getLocalBoard){
  currentLocal=getLocalBoard;unsubscribe();
  const poke=()=>refresh();
  try{
   channel=sb.channel('kanban-'+me.id)
    .on('postgres_changes',{event:'*',schema:'public',table:'boards'},poke)
    .on('postgres_changes',{event:'*',schema:'public',table:'board_members'},poke)
    .on('postgres_changes',{event:'*',schema:'public',table:'invitations'},poke)
    .subscribe();
  }catch(e){channel=null}
  pollTimer=setInterval(()=>{if(!document.hidden)refresh()},cfg.pollMs||20000);
  refresh();
 }
 function unsubscribe(){clearInterval(pollTimer);pollTimer=null;if(channel){try{sb.removeChannel(channel)}catch(e){}channel=null}}

 /* ----- file đính kèm ----- */
 const path=(scope,key)=>scope+'/'+key;
 const files={
  async put(key,blob,scope){must(await sb.storage.from('attachments').upload(path(scope||me.id,key),blob,{upsert:true,contentType:blob.type||'application/octet-stream'}))},
  async get(key,scope){const r=await sb.storage.from('attachments').download(path(scope||me.id,key));return r.error?undefined:r.data},
  async del(key,scope){await sb.storage.from('attachments').remove([path(scope||me.id,key)])},
  async keys(){return[]}
 };

 /* ----- lời mời bằng mã số thành viên ----- */
 const rpcErr=e=>({error:(e&&e.message)||'Không thực hiện được'});
 const invites={
  async find(no){const r=await sb.rpc('find_member_by_no',{p_no:no});return r.error?rpcErr(r.error):{member:(r.data||[])[0]||null}},
  async send(boardId,no){const r=await sb.rpc('send_invitation',{p_board:boardId,p_member_no:no});return r.error?rpcErr(r.error):{id:r.data}},
  async respond(id,accept){const r=await sb.rpc('respond_invitation',{p_id:id,p_accept:accept});if(r.error)return rpcErr(r.error);await refresh();return{}},
  async cancel(id){const r=await sb.rpc('cancel_invitation',{p_id:id});return r.error?rpcErr(r.error):{}},
  async mine(){const r=await sb.rpc('my_pending_invitations');return r.error?[]:(r.data||[])},
  async ofBoard(boardId){const r=await sb.rpc('board_pending_invitations',{p_board:boardId});return r.error?[]:(r.data||[])}
 };
 /* ----- khung giờ bận (để kiểm tra trùng lịch họp; chỉ giờ, không kèm nội dung) ----- */
 const busy={
  async push(slots){must(await sb.from('busy_slots').upsert({user_id:me.id,slots,updated_at:new Date().toISOString()},{onConflict:'user_id'}))},
  async board(boardId){const r=await sb.rpc('board_busy',{p_board:boardId});if(r.error)throw r.error;const o={};(r.data||[]).forEach(x=>{o[x.user_id]={slots:x.slots||[],updated_at:x.updated_at}});return o}
 };
 /* ----- họp trực tuyến: xin "vé vào phòng" JaaS từ Edge Function jaas-token (khóa ký nằm ở máy chủ) ----- */
 async function meetToken(boardId,meetingId){
  const r=await sb.functions.invoke('jaas-token',{body:{boardId,meetingId}});
  if(r.error){
   let msg='Không xin được quyền vào họp. Kiểm tra mạng rồi thử lại.';
   try{const res=r.error.context;if(res){const j=await res.json();msg=j.error||j.message||msg;if(res.status===404&&!j.error)msg='Chưa triển khai hàm jaas-token trên Supabase (xem supabase/README.md)'}}catch(e){}
   throw new Error(msg);
  }
  return r.data;
 }
 async function removeMember(boardId,userId){must(await sb.from('board_members').delete().eq('board_id',boardId).eq('user_id',userId));await refresh()}

 return{
  name:'supabase',
  get me(){return me},
  async session(){const {data}=await sb.auth.getSession();if(!data.session)return null;return await toUser(data.session.user)},
  async register({name,email,password}){
   const {data,error}=await sb.auth.signUp({email,password,options:{data:{name}}});
   if(error)return{error:authError(error),detail:error.message||error.code};
   if(data.user&&data.user.identities&&data.user.identities.length===0)return{error:'exists'};
   if(!data.session)return{error:'confirm'};
   try{return{user:await toUser(data.session.user)}}catch(e){return{error:'profile',detail:(e&&(e.message||e.code))||String(e)}}
  },
  async login({email,password}){
   const {data,error}=await sb.auth.signInWithPassword({email,password});
   if(error)return{error:authError(error),detail:error.message||error.code};
   try{return{user:await toUser(data.user)}}catch(e){return{error:'profile',detail:(e&&(e.message||e.code))||String(e)}}
  },
  async logout(){unsubscribe();known.clear();lastRootJson='';me=null;await sb.auth.signOut()},
  load,save,files,
  async fileIdsInUse(){return null},
  invites,busy,meetToken,removeMember,subscribe,unsubscribe,refresh,
  idle(){return saving?saving.catch(()=>{}):Promise.resolve()},
  set onRemote(f){SupabaseStore_onRemote=f},
  _merge3:merge3
 };
})();
