/* Kho dữ liệu cục bộ: localStorage (tài khoản, dữ liệu bảng) và IndexedDB (file đính kèm).
   Mọi nơi khác trong web chỉ gọi qua đối tượng Store (xem storage.js). Kho mới (máy chủ) cần có cùng các hàm:
     name
     session()                       -> user | null          (phiên đăng nhập đang giữ)
     register({name,email,password}) -> {user} | {error}      error: 'exists' | 'invalid'
     login({email,password})         -> {user} | {error}      error: 'invalid'
     logout()
     load(user)                      -> dữ liệu thô | null
     save(user,data)                 -> ghi dữ liệu (có thể ném lỗi hoặc trả Promise lỗi)
     files.put/get/del/keys          -> file đính kèm
     fileIdsInUse()                  -> Set id file còn được tham chiếu (để dọn file thừa) */
const LocalStore=(()=>{
 const users=()=>{try{return JSON.parse(localStorage.getItem(KEY_USERS)||'{}')}catch(e){return{}}};
 const setUsers=u=>localStorage.setItem(KEY_USERS,JSON.stringify(u));
 const files=(()=>{
  let dbp=null;
  const open=()=>dbp||(dbp=new Promise((res,rej)=>{try{const r=indexedDB.open('kanban_files',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}}));
  const tx=async(mode,fn)=>{const d=await open();return new Promise((res,rej)=>{const t=d.transaction('files',mode),rq=fn(t.objectStore('files'));t.oncomplete=()=>res(rq&&rq.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})};
  return{put:(k,v)=>tx('readwrite',s=>s.put(v,k)),get:k=>tx('readonly',s=>s.get(k)),del:k=>tx('readwrite',s=>s.delete(k)),keys:()=>tx('readonly',s=>s.getAllKeys())};
 })();
 return{
  name:'local',
  async session(){const email=localStorage.getItem(KEY_SESSION);return(email&&users()[email])||null},
  async register({name,email,password}){
   const all=users();if(all[email])return{error:'exists'};
   all[email]={name,email,password};setUsers(all);localStorage.setItem(KEY_SESSION,email);return{user:all[email]};
  },
  async login({email,password}){
   const u=users()[email];if(!u||u.password!==password)return{error:'invalid'};
   localStorage.setItem(KEY_SESSION,email);return{user:u};
  },
  async logout(){localStorage.removeItem(KEY_SESSION)},
  async load(user){try{return JSON.parse(localStorage.getItem(dataKey(user.email))||'null')}catch(e){return null}},
  save(user,data){localStorage.setItem(dataKey(user.email),JSON.stringify(data))},
  files,
  busy:{   // khung giờ bận: ở chế độ cục bộ chỉ có dữ liệu của các tài khoản trên cùng trình duyệt
   async push(slots){const e=localStorage.getItem(KEY_SESSION);if(e)localStorage.setItem('kanban_busy_'+e,JSON.stringify({slots,updated_at:new Date().toISOString()}))},
   async board(boardId,memberIds){const o={};(memberIds||[]).forEach(id=>{try{const r=JSON.parse(localStorage.getItem('kanban_busy_'+id)||'null');if(r)o[id]=r}catch(e){}});return o}
  },
  async fileIdsInUse(){
   const keep=new Set();
   for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('kanban_s2_data_')){try{JSON.parse(localStorage.getItem(k)).boards.forEach(bb=>(bb.tasks||[]).forEach(t=>(t.attachments||[]).forEach(a=>keep.add(a.id))))}catch(e){}}}
   return keep;
  }
 };
})();
