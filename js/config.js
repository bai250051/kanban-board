/* Cấu hình kho dữ liệu.
   backend: 'local'    = lưu trong trình duyệt (mặc định)
            'supabase' = lưu trên máy chủ Supabase (điền supabaseUrl và supabaseAnonKey; cần nạp js/store-supabase.js) */
const KANBAN_CONFIG={backend:'supabase',supabaseUrl:'https://mtyxxzzxwbjbygqamegz.supabase.co',supabaseAnonKey:'sb_publishable_EYGrObFee2h--8_01gSTfg_gzdrsC1-',pollMs:20000};
if(KANBAN_CONFIG.backend==='supabase')document.write('<script src="js/vendor/supabase.js"><\/script><script src="js/store-supabase.js"><\/script>');