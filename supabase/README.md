# Dùng Supabase cho Sprint 5

Thư mục này chứa cấu trúc dữ liệu cho máy chủ. Web mặc định lưu trong trình duyệt (`backend: 'local'` trong `js/config.js`). Làm theo các bước dưới đây để chuyển sang máy chủ.

## Việc cần làm (mất khoảng 15 phút)

1. **Tạo tài khoản** tại supabase.com (đăng nhập bằng GitHub cho nhanh).
2. **New project**: đặt tên `kanban-board`, chọn gói **Free**, vùng gần Việt Nam (ví dụ Singapore). Đặt và **tự lưu lại mật khẩu cơ sở dữ liệu**.
3. Mở **SQL Editor → New query**, dán toàn bộ nội dung `schema.sql`, bấm **Run**. Sau đó làm tương tự với `storage.sql` (lưu file đính kèm) và `meetings.sql` (khung giờ bận để báo trùng lịch họp; chỉ cần nếu dùng tính năng cuộc họp, chạy lại nhiều lần không hại).
4. Vào **Authentication → Providers → Email**: bật đăng nhập bằng email. Khi chạy thử, bạn có thể tắt mục xác nhận email (Confirm email) để đăng ký xong dùng được ngay; dịch vụ gửi email mặc định của Supabase có thể bị giới hạn số thư.
5. Vào **Project Settings → API** và lấy hai giá trị:
   - **Project URL** (dạng `https://xxxx.supabase.co`)
   - **anon public key** (khóa công khai, được phép đặt trong web)

6. **Bật chế độ máy chủ:** mở `js/config.js`, sửa dòng đầu thành (dán Project URL và anon public key của bạn, giữ nguyên dòng thứ hai bên dưới):
   ```js
   const KANBAN_CONFIG={backend:'supabase',supabaseUrl:'https://xxxx.supabase.co',supabaseAnonKey:'<anon public key>',pollMs:20000};
   ```
   Rồi tải `js/config.js` lên GitHub. Từ lúc đó web dùng đăng nhập thật, lưu dữ liệu trên máy chủ và mời bằng mã số thành viên. Muốn quay lại chế độ cũ, đổi `backend` về `'local'`.
7. **Chuyển dữ liệu cũ lên máy chủ:** ở web cũ vào **Cài đặt → Xuất dữ liệu (.json)**, đăng ký tài khoản mới ở web máy chủ, rồi **Cài đặt → Nhập dữ liệu** chọn file đó. Các bảng nhóm cũ sẽ trở thành bảng nhóm thật của bạn trên máy chủ (thành viên giả trong bản demo sẽ không còn; hãy mời người thật bằng mã số).

## Cách dùng sau khi bật
- Mã số thành viên của bạn nằm dưới tên ở góc phải và trong **Cài đặt**.
- Trưởng nhóm mở bảng nhóm, bấm **Mời thành viên**, nhập mã số của người cần mời. Người được mời mở web, bấm chuông thông báo và chọn **Chấp nhận**.
- Thay đổi của các thành viên được cập nhật cho nhau sau tối đa vài chục giây (hoặc tức thì nếu Realtime hoạt động). Hai người sửa cùng lúc thì web tự gộp theo từng thẻ.

## Quan trọng về bảo mật
- **Không bao giờ** đưa khóa `service_role` hay mật khẩu cơ sở dữ liệu vào web hoặc GitHub, cũng không gửi cho ai (kể cả nhờ trợ giúp). Chỉ dùng **anon public key**.
- Quyền truy cập được bảo vệ bằng Row Level Security trong `schema.sql`: người ngoài nhóm không thấy bảng, hồ sơ, file của nhóm.

## Lưu ý dự án gói miễn phí
Dự án bị tạm dừng nếu một tuần không hoạt động. Dữ liệu vẫn còn nhưng web ngừng chạy cho đến khi bạn bấm bật lại trong bảng điều khiển. Hãy kiểm tra trước ngày demo.

## Cấu trúc dữ liệu
| Bảng | Nội dung |
|---|---|
| `profiles` | Hồ sơ và **mã số thành viên** (`member_no`: tăng dần từ 1, chỉ gồm số, không sửa được) |
| `user_data` | Dữ liệu riêng của từng người (bảng cá nhân, điểm, cài đặt) |
| `boards` | Bảng nhóm dùng chung (mỗi bảng một dòng, kèm `version` để phát hiện hai người sửa cùng lúc) |
| `board_members` | Thành viên của bảng nhóm (chủ bảng hoặc thành viên) |
| `invitations` | Lời mời vào nhóm bằng mã số; người nhận phải chấp nhận |
| `lookup_log` | Nhật ký tra cứu mã số để giới hạn 30 lần mỗi 10 phút |
| `busy_slots` | Khung giờ bận của từng người (chỉ giờ bắt đầu, kết thúc và loại, không kèm tên việc), chỉ chủ của dòng đọc và ghi trực tiếp; thành viên cùng nhóm đọc qua hàm `board_busy` |

Cuộc họp không có bảng riêng: mỗi cuộc họp nằm trong dữ liệu của bảng nhóm (`boards.data`), nên đi theo cơ chế đồng bộ và gộp theo mã như thẻ việc.

Hàm cho web gọi: `find_member_by_no`, `send_invitation`, `respond_invitation`, `cancel_invitation`, `board_busy` (chỉ thành viên của bảng gọi được, và chỉ trả khung giờ của thành viên bảng đó).

## Cuộc họp và báo trùng lịch
- Ở bảng nhóm bấm **🤝 Cuộc họp → Tạo cuộc họp**, chọn ngày, giờ, thời lượng, người tham gia. Web báo ai đang trùng lịch cố định hoặc cuộc họp khác, ghi chú việc đến hạn cùng ngày, và gợi ý giờ mọi người đều trống. Cuộc họp hiện trong dòng **Lịch cố định** của bảng cá nhân người được mời, có nhắc trước 30 phút và xuất được ra file `.ics`.
- Bảng cá nhân của mỗi người là dữ liệu riêng, nên **mỗi máy tự đẩy khung giờ bận của chính mình** lên `busy_slots` (6 tuần tới) mỗi khi dữ liệu đổi. Vì vậy lịch của người khác chỉ mới như lần cuối họ mở web; web ghi rõ khi dữ liệu cũ hơn 3 ngày hoặc chưa có.
- Người dùng có thể tắt chia sẻ trong **Cài đặt → Lịch họp nhóm**.
- Việc chỉ có hạn (chưa có thời lượng) không tính là trùng, chỉ nhắc nhẹ nếu hạn nằm trong giờ họp.

## Họp trực tuyến ngay trong web (JaaS)
Nút **📹 Vào họp** (trong cuộc họp, danh sách cuộc họp và thẻ họp ở bảng cá nhân) mở khung họp có cam, mic, chia sẻ màn hình và chat ngay trong trang. Web nhúng **JaaS** (Jitsi as a Service của 8x8) bằng Jitsi IFrame API. JaaS bắt buộc mỗi người vào phòng phải có một "vé" (JWT) ký bằng khóa riêng, nên khóa này đặt ở một Edge Function (`functions/jaas-token`), không bao giờ nằm trong code web.

Cách bật (làm một lần):
1. Đăng ký tài khoản JaaS (trang `jaas.8x8.vc`), lấy **AppID** (dạng `vpaas-magic-cookie-...`). Điều kiện miễn phí hiện hành xem ngay trên trang đăng ký (thời điểm viết: miễn phí cho tối đa 25 người dùng hoạt động).
2. Trong JaaS console, mục **API Keys**, tạo cặp khóa, tải **khóa riêng** về và ghi lại **Key ID**. Đặt `KID` = `AppID/KeyID` (ví dụ `vpaas-magic-cookie-abc.../4f4910`).
3. Khóa riêng phải ở dạng PKCS#8 (dòng đầu là `-----BEGIN PRIVATE KEY-----`). Nếu dòng đầu là `-----BEGIN RSA PRIVATE KEY-----` thì đổi bằng: `openssl pkcs8 -topk8 -nocrypt -in khoa.pk -out khoa8.pem`.
4. Cài Supabase CLI, đăng nhập và liên kết dự án (`supabase login`, `supabase link --project-ref <mã dự án>`), rồi chạy:
   ```
   supabase secrets set JAAS_KID="vpaas-magic-cookie-.../4f4910"
   supabase secrets set JAAS_PRIVATE_KEY="$(cat khoa8.pem)"
   supabase functions deploy jaas-token
   ```
   (Cách khác không cần CLI: Dashboard, mục Edge Functions, tạo hàm `jaas-token` bằng trình soạn thảo, dán nội dung `functions/jaas-token/index.ts`, rồi thêm hai secret ở trang Secrets. `SUPABASE_URL` và `SUPABASE_ANON_KEY` được Supabase tự cấp cho hàm.)
5. Tải lại web, mở một cuộc họp có giờ trong vòng 15 phút tới, bấm **Vào họp**.

Quy tắc hàm cấp vé: chỉ cấp cho thành viên đã đăng nhập của bảng nhóm, có tên trong danh sách tham gia, trong khung từ 15 phút trước giờ bắt đầu đến 2 giờ sau giờ kết thúc, và vé chỉ dùng được cho đúng phòng của cuộc họp đó. Người tạo cuộc họp và chủ bảng là điều hành viên. Ghi hình và phát trực tiếp bị tắt.

Lưu ý: hình và tiếng đi qua máy chủ của 8x8 (JaaS), không đi qua Supabase. Cần mạng truy cập được `8x8.vc`; trình chặn quảng cáo hoặc mạng trường có thể chặn. Chế độ chạy cục bộ (không đăng nhập Supabase) không họp trực tuyến được.

## Đã kiểm thử
Thư mục `tests/` có bài kiểm thử chạy trên PostgreSQL thường (có giả lập phần xác thực và kho file của Supabase): 23 kiểm tra về mã số thành viên, phân quyền, lời mời, giới hạn tra cứu, file đính kèm và 11 kiểm tra về khung giờ bận (`meetings_test.sql`: ai đọc được gì, không sửa hộ người khác, không lộ sang nhóm khác). Ngoài ra web đã được thử với hai và ba người dùng khác nhau trên một máy chủ giả dùng chính PostgREST và các quy tắc này (đăng ký, mời bằng mã số, chấp nhận, đồng bộ, gộp khi sửa cùng lúc, file đính kèm, gỡ thành viên, chuyển dữ liệu cũ lên). Đây là kiểm thử cục bộ, **chưa chạy trên Supabase thật** (đặc biệt phần Realtime), nên nếu có lỗi hãy gửi nguyên văn thông báo lỗi và mô tả bước làm.
