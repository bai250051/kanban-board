// Edge Function: cấp "vé vào phòng" (JWT) cho cuộc họp trực tuyến JaaS (Jitsi as a Service của 8x8).
// Web gọi hàm này khi người dùng bấm "Vào họp". Khóa riêng JaaS chỉ nằm ở đây (secret), không bao giờ nằm trong code web.
//
// Hàm chỉ cấp vé khi:
//  - người gọi đã đăng nhập và là thành viên của bảng nhóm (đọc được bảng theo quy tắc RLS),
//  - cuộc họp có trong bảng và người gọi nằm trong danh sách tham gia,
//  - đang trong khung giờ cho phép vào: từ 15 phút trước giờ bắt đầu đến 2 giờ sau giờ kết thúc.
// Vé chỉ có giá trị cho đúng phòng của cuộc họp đó. Người tạo cuộc họp và chủ bảng là điều hành viên (moderator).
//
// Secret cần đặt (xem supabase/README.md): JAAS_KID (dạng "vpaas-magic-cookie-.../abc123") và JAAS_PRIVATE_KEY (PKCS#8 PEM).
import { SignJWT, importPKCS8 } from "https://esm.sh/jose@5.9.6";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export const JOIN_BEFORE_MIN = 15;
export const JOIN_AFTER_END_MIN = 120;
const clean = (s: string) => String(s).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);

export async function handle(
  req: Request,
  env: (k: string) => string | undefined,
  mkClient: (url: string, key: string, opts: unknown) => any,
  nowMs: () => number = () => Date.now(),
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Chỉ nhận yêu cầu POST" }, 405);

  const kid = env("JAAS_KID"), pem = env("JAAS_PRIVATE_KEY");
  if (!kid || !pem || !kid.includes("/")) {
    return json({ error: "Máy chủ chưa cấu hình JaaS (thiếu JAAS_KID hoặc JAAS_PRIVATE_KEY)" }, 500);
  }
  const appId = kid.split("/")[0];

  const auth = req.headers.get("Authorization") || "";
  if (!auth) return json({ error: "Chưa đăng nhập" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Dữ liệu gửi lên không hợp lệ" }, 400); }
  const boardId = body && body.boardId, meetingId = body && body.meetingId;
  if (typeof boardId !== "string" || typeof meetingId !== "string") {
    return json({ error: "Thiếu mã bảng hoặc mã cuộc họp" }, 400);
  }

  const sb = mkClient(env("SUPABASE_URL") || "", env("SUPABASE_ANON_KEY") || "", { global: { headers: { Authorization: auth } } });
  const { data: ud, error: ue } = await sb.auth.getUser();
  if (ue || !ud || !ud.user) return json({ error: "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại" }, 401);
  const uid: string = ud.user.id;

  // Đọc bảng theo quyền của chính người gọi: không phải thành viên thì không thấy dòng nào
  const { data: row, error: be } = await sb.from("boards").select("owner_id,data").eq("id", boardId).maybeSingle();
  if (be || !row) return json({ error: "Bạn không thuộc bảng nhóm này" }, 403);
  const m = ((row.data && row.data.meetings) || []).find((x: any) => x && x.id === meetingId);
  if (!m) return json({ error: "Không tìm thấy cuộc họp (có thể đã bị xóa)" }, 404);
  if (!(m.att || []).includes(uid)) return json({ error: "Bạn không có trong danh sách tham gia cuộc họp này" }, 403);

  // Giờ trong dữ liệu là giờ Việt Nam (UTC+7)
  const start = Date.parse(String(m.start) + ":00+07:00");
  if (isNaN(start)) return json({ error: "Cuộc họp có giờ bắt đầu không hợp lệ" }, 400);
  const end = start + (Number(m.dur) || 60) * 60000, now = nowMs();
  if (now < start - JOIN_BEFORE_MIN * 60000) {
    return json({ error: "Chưa đến giờ vào họp (mở từ " + JOIN_BEFORE_MIN + " phút trước giờ bắt đầu)", code: "early", opensAt: new Date(start - JOIN_BEFORE_MIN * 60000).toISOString() }, 403);
  }
  if (now > end + JOIN_AFTER_END_MIN * 60000) return json({ error: "Cuộc họp đã kết thúc", code: "over" }, 403);

  const { data: pr } = await sb.from("profiles").select("display_name").eq("id", uid).maybeSingle();
  const name = (pr && pr.display_name) || "Thành viên";
  const moderator = m.by === uid || row.owner_id === uid;
  const room = "kb-" + clean(boardId) + "-" + clean(meetingId);

  let key: unknown;
  try { key = await importPKCS8(pem.replace(/\\n/g, "\n"), "RS256"); }
  catch { return json({ error: "Không đọc được khóa riêng JaaS. Cần định dạng PKCS#8 (bắt đầu bằng -----BEGIN PRIVATE KEY-----)" }, 500); }

  const iat = Math.floor(now / 1000);
  const exp = Math.floor(Math.min(end + JOIN_AFTER_END_MIN * 60000, now + 4 * 3600000) / 1000);
  const jwt = await new SignJWT({
    aud: "jitsi", iss: "chat", sub: appId, room,
    context: {
      user: { id: uid, name, avatar: "", email: "", moderator: moderator ? "true" : "false" },
      features: { livestreaming: false, recording: false, transcription: false, "outbound-call": false, "sip-outbound-call": false, "file-upload": false },
      room: { regex: false },
    },
  }).setProtectedHeader({ alg: "RS256", kid, typ: "JWT" }).setNotBefore(iat - 30).setExpirationTime(exp).sign(key as any);

  return json({ jwt, appId, domain: "8x8.vc", room: appId + "/" + room, name, moderator });
}

// deno-lint-ignore no-explicit-any
const D: any = (globalThis as any).Deno;
if (D && D.serve) D.serve((req: Request) => handle(req, (k) => D.env.get(k), createClient as any));
