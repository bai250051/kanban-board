// Edge Function: gửi email nhắc việc trước hạn khoảng 30 hoặc 60 phút.
// Hai cách gọi:
//  1) pg_cron gọi mỗi 5 phút kèm header x-cron-secret (= secret CRON_SECRET): quét việc của mọi người đã bật nhắc và gửi thư.
//  2) Web gọi với phiên đăng nhập của người dùng và body {"test":true}: gửi một email thử tới chính người đó.
// Phải deploy với "Verify JWT" TẮT (pg_cron không có JWT). Hàm tự kiểm tra bí mật cron hoặc phiên đăng nhập.
//
// Secret cần đặt: SMTP_USER, SMTP_PASS (mật khẩu ứng dụng Gmail), CRON_SECRET, APP_URL.
// Tùy chọn: SMTP_HOST (mặc định smtp.gmail.com), SMTP_PORT (mặc định 465), SMTP_FROM.
import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export const ALLOWED_LEADS = [30, 60];
export const MAX_PER_RUN = 40;           // số thư tối đa mỗi lần chạy, phần còn lại để lần sau
export interface Item { key: string; title: string; due: string; ts: number; board: string }
export interface Target { user_id: string; email: string; name: string; leads: number[] }
export interface Deps {
  env: (k: string) => string | undefined;
  now: () => number;
  sendMail: (m: { to: string; subject: string; text: string; html: string }) => Promise<void>;
  db: {
    targets(): Promise<Target[]>;
    userData(ids: string[]): Promise<Record<string, any>>;
    memberBoards(ids: string[]): Promise<Record<string, { id: string; name: string; data: any }[]>>;
    sentKeys(ids: string[], now: number): Promise<Set<string>>;
    logSent(rows: { user_id: string; task_key: string; due: string; lead: number }[]): Promise<void>;
    userFromJwt(jwt: string): Promise<{ id: string; email: string } | null>;
    recentTest(userId: string, now: number): Promise<boolean>;
  };
}

// ---------- logic thuần (dễ kiểm thử) ----------
export function isDoneTask(board: any, t: any): boolean {
  const cols = Array.isArray(board.columns) && board.columns.length >= 2
    ? board.columns : [{ id: "todo" }, { id: "doing" }, { id: "done", done: true }];
  const c = cols.find((x: any) => x.id === t.status);
  return !!(c && c.done);
}
const vnTs = (due: string) => Date.parse(String(due).slice(0, 16) + ":00+07:00");   // giờ trong dữ liệu là giờ Việt Nam

// Gom các việc có hạn kèm giờ, chưa xong của một người. Thẻ cá nhân liên kết với việc nhóm và chính việc nhóm dùng chung một khóa nên chỉ nhắc một lần.
export function collectItems(userId: string, personal: any[], team: { id: string; name: string; data: any }[]): Item[] {
  const items: Item[] = [], linked = new Set<string>();
  const hasTime = (t: any) => typeof t.due === "string" && t.due.length >= 16 && !isNaN(vnTs(t.due));
  for (const b of personal) {
    if (!b || b.type === "team") continue;
    for (const t of b.tasks || []) {
      if (!t) continue;
      const lk = t.link && !t.link.lost ? "team:" + t.link.boardId + ":" + t.link.taskId : null;
      if (lk) linked.add(lk);
      if (isDoneTask(b, t) || !hasTime(t)) continue;
      items.push({ key: lk || "p:" + t.id, title: String(t.title || "Công việc"), due: t.due.slice(0, 16), ts: vnTs(t.due), board: lk ? (t.link.boardName || b.name) : String(b.name || "Cá nhân") });
    }
  }
  for (const b of team) {
    const d = b.data || {};
    for (const t of d.tasks || []) {
      if (!t || t.assignee !== userId) continue;
      const key = "team:" + b.id + ":" + t.id;
      if (linked.has(key) || isDoneTask(d, t) || !hasTime(t)) continue;
      items.push({ key, title: String(t.title || "Công việc"), due: t.due.slice(0, 16), ts: vnTs(t.due), board: String(b.name || "Nhóm") });
    }
  }
  return items;
}

// Chọn mốc nhắc: mốc nhỏ nhất mà thời gian còn lại không vượt quá. Ví dụ mốc 30 và 60, còn 50 phút thì nhắc mốc 60; còn 20 phút thì chỉ nhắc mốc 30.
export function pickLead(leads: number[], remainMs: number): number | null {
  if (remainMs <= 0) return null;
  for (const L of [...leads].sort((a, b) => a - b)) if (remainMs <= L * 60000) return L;
  return null;
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
export function fmtDue(due: string): string { const [d, t] = due.split("T"); const [y, m, day] = d.split("-"); return `${t} ngày ${day}/${m}/${y}`; }
export function render(item: Item, remainMs: number, appUrl: string) {
  const mins = Math.max(1, Math.round(remainMs / 60000));
  const subject = `⏰ Sắp đến hạn: ${item.title} (còn khoảng ${mins} phút)`;
  const text = `Công việc “${item.title}” sắp đến hạn.\nHạn: ${fmtDue(item.due)} (giờ Việt Nam), còn khoảng ${mins} phút.\nBảng: ${item.board}\n${appUrl ? "Mở ứng dụng: " + appUrl + "\n" : ""}\nBạn nhận email này vì đã bật nhắc việc qua email. Tắt trong Cài đặt của ứng dụng.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1b1b3a"><h2 style="margin:0 0 12px;color:#6759e8">⏰ Sắp đến hạn</h2><p style="font-size:16px;margin:0 0 8px"><b>${esc(item.title)}</b></p><p style="margin:0 0 4px">Hạn: <b>${esc(fmtDue(item.due))}</b> (giờ Việt Nam)</p><p style="margin:0 0 4px">Còn khoảng <b>${mins} phút</b></p><p style="margin:0 0 16px;color:#5d607a">Bảng: ${esc(item.board)}</p>${appUrl ? `<p><a href="${esc(appUrl)}" style="background:#6759e8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Mở ứng dụng</a></p>` : ""}<p style="font-size:12px;color:#8a8da5">Bạn nhận email này vì đã bật nhắc việc qua email. Tắt trong Cài đặt của ứng dụng.</p></div>`;
  return { subject, text, html };
}
const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, (_m, a, b) => a + "***" + b);
function same(a: string, b: string) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

export async function handle(req: Request, d: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Chỉ nhận yêu cầu POST" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const hdr = req.headers.get("x-cron-secret");
  if (hdr) {
    const secret = d.env("CRON_SECRET");
    if (!secret) return json({ error: "Máy chủ chưa đặt CRON_SECRET" }, 500);
    if (!same(hdr, secret)) return json({ error: "Sai mã bí mật" }, 401);
    return await runCron(d);
  }
  const auth = req.headers.get("Authorization") || "";
  if (body && body.test === true && auth) return await runTest(d, auth);
  return json({ error: "Không có quyền" }, 401);
}

async function runTest(d: Deps, auth: string): Promise<Response> {
  const u = await d.db.userFromJwt(auth.replace(/^Bearer\s+/i, ""));
  if (!u || !u.email) return json({ error: "Phiên đăng nhập hết hạn, hãy đăng nhập lại" }, 401);
  const now = d.now();
  if (await d.db.recentTest(u.id, now)) return json({ error: "Vừa gửi email thử xong, hãy đợi khoảng một phút rồi thử lại" }, 429);
  const appUrl = d.env("APP_URL") || "";
  try {
    await d.sendMail({ to: u.email, subject: "✅ Email thử từ Kanban Board", text: "Đây là email thử. Khi bật nhắc việc qua email, bạn sẽ nhận thư như vậy trước hạn công việc 30 hoặc 60 phút." + (appUrl ? "\n" + appUrl : ""), html: `<div style="font-family:Arial,sans-serif"><h3 style="color:#6759e8">✅ Email thử từ Kanban Board</h3><p>Khi bật nhắc việc qua email, bạn sẽ nhận thư như vậy trước hạn công việc 30 hoặc 60 phút.</p></div>` });
  } catch (e) { return json({ error: "Gửi email thất bại: " + ((e as Error).message || e) }, 502); }
  await d.db.logSent([{ user_id: u.id, task_key: "test", due: new Date(now).toISOString(), lead: 0 }]);
  return json({ ok: true, email: maskEmail(u.email) });
}

async function runCron(d: Deps): Promise<Response> {
  const now = d.now(), appUrl = d.env("APP_URL") || "";
  const targets = await d.db.targets();
  if (!targets.length) return json({ sent: 0, users: 0, errors: [] });
  const ids = targets.map((t) => t.user_id);
  const [udata, boards, sent] = await Promise.all([d.db.userData(ids), d.db.memberBoards(ids), d.db.sentKeys(ids, now)]);
  let count = 0; const errors: string[] = [];
  outer: for (const t of targets) {
    const leads = (t.leads || [30]).filter((x) => ALLOWED_LEADS.includes(x));
    if (!leads.length) continue;
    const personal = ((udata[t.user_id] || {}).boards || []) as any[];
    for (const item of collectItems(t.user_id, personal, boards[t.user_id] || [])) {
      const remain = item.ts - now, L = pickLead(leads, remain);
      if (L == null || sent.has(`${t.user_id}|${item.key}|${item.due}|${L}`)) continue;
      if (count >= MAX_PER_RUN) break outer;
      try {
        await d.sendMail({ to: t.email, ...render(item, remain, appUrl) });
        await d.db.logSent([{ user_id: t.user_id, task_key: item.key, due: item.due, lead: L }]);
        sent.add(`${t.user_id}|${item.key}|${item.due}|${L}`); count++;
      } catch (e) { errors.push(maskEmail(t.email) + ": " + ((e as Error).message || String(e))); }   // chưa ghi nhật ký nên lần chạy sau sẽ thử lại
    }
  }
  return json({ sent: count, users: targets.length, errors });
}

// ---------- phần chạy thật trên Supabase ----------
function serviceKey(env: (k: string) => string | undefined): string {
  const legacy = env("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { const o = JSON.parse(env("SUPABASE_SECRET_KEYS") || "{}"); return o["default"] || (Object.values(o)[0] as string) || ""; } catch { return ""; }
}
function realDeps(): Deps {
  const env = (k: string) => (globalThis as any).Deno.env.get(k) as string | undefined;
  const sb: any = createClient(env("SUPABASE_URL") || "", serviceKey(env), { auth: { persistSession: false } });
  const must = (r: any) => { if (r.error) throw r.error; return r.data; };
  return {
    env, now: () => Date.now(),
    async sendMail(m) {
      const host = env("SMTP_HOST") || "smtp.gmail.com", port = Number(env("SMTP_PORT") || 465);
      const user = env("SMTP_USER") || "", pass = (env("SMTP_PASS") || "").replace(/\s+/g, "");
      if (!user || !pass) throw new Error("Chưa đặt SMTP_USER hoặc SMTP_PASS");
      const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } } });
      try { await client.send({ from: env("SMTP_FROM") || `Kanban Board <${user}>`, to: m.to, subject: m.subject, content: m.text, html: m.html }); }
      finally { try { await client.close(); } catch { /* bỏ qua */ } }
    },
    db: {
      async targets() { return (must(await sb.rpc("reminder_targets")) || []) as Target[]; },
      async userData(ids) { const o: Record<string, any> = {}; for (const r of must(await sb.from("user_data").select("user_id,data").in("user_id", ids)) || []) o[r.user_id] = r.data; return o; },
      async memberBoards(ids) {
        const o: Record<string, any[]> = {};
        const mem = must(await sb.from("board_members").select("board_id,user_id").in("user_id", ids)) || [];
        const bids = [...new Set(mem.map((m: any) => m.board_id))];
        if (!bids.length) return o;
        const rows = must(await sb.from("boards").select("id,name,data").in("id", bids)) || [], by: Record<string, any> = {};
        for (const b of rows) by[b.id] = b;
        for (const m of mem) if (by[m.board_id]) (o[m.user_id] = o[m.user_id] || []).push(by[m.board_id]);
        return o;
      },
      async sentKeys(ids, now) {
        const since = new Date(now - 3 * 86400000).toISOString(), s = new Set<string>();
        for (const r of must(await sb.from("email_reminder_log").select("user_id,task_key,due,lead").in("user_id", ids).gt("sent_at", since)) || []) s.add(`${r.user_id}|${r.task_key}|${r.due}|${r.lead}`);
        return s;
      },
      async logSent(rows) { must(await sb.from("email_reminder_log").upsert(rows, { onConflict: "user_id,task_key,due,lead", ignoreDuplicates: true })); },
      async userFromJwt(jwt) { const r = await sb.auth.getUser(jwt); return r.error || !r.data || !r.data.user ? null : { id: r.data.user.id, email: r.data.user.email || "" }; },
      async recentTest(userId, now) {
        const since = new Date(now - 60000).toISOString();
        const r = must(await sb.from("email_reminder_log").select("user_id").eq("user_id", userId).eq("task_key", "test").gt("sent_at", since).limit(1));
        return !!(r && r.length);
      },
    },
  };
}
const D: any = (globalThis as any).Deno;
if (D && D.serve) { const deps = realDeps(); D.serve((req: Request) => handle(req, deps)); }
