# Dùng Supabase cho Sprint 5

Thư mục này chứa cấu trúc dữ liệu cho máy chủ. Web mặc định lưu trong trình duyệt (`backend: 'local'` trong `js/config.js`). Làm theo các bước dưới đây để chuyển sang máy chủ.

## Việc cần làm (mất khoảng 15 phút)

1. **Tạo tài khoản** tại supabase.com (đăng nhập bằng GitHub cho nhanh).
2. **New project**: đặt tên `kanban-board`, chọn gói **Free**, vùng gần Việt Nam (ví dụ Singapore). Đặt và **tự lưu lại mật khẩu cơ sở dữ liệu**.
3. Mở **SQL Editor → New query**, dán toàn bộ nội dung `schema.sql`, bấm **Run**. Sau đó làm tương tự với `storage.sql`.
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

Hàm cho web gọi: `find_member_by_no`, `send_invitation`, `respond_invitation`, `cancel_invitation`.

## Đã kiểm thử
Thư mục `tests/` có bài kiểm thử chạy trên PostgreSQL thường (có giả lập phần xác thực và kho file của Supabase): 23 kiểm tra về mã số thành viên, phân quyền, lời mời, giới hạn tra cứu, file đính kèm. Ngoài ra web đã được thử với hai và ba người dùng khác nhau trên một máy chủ giả dùng chính PostgREST và các quy tắc này (đăng ký, mời bằng mã số, chấp nhận, đồng bộ, gộp khi sửa cùng lúc, file đính kèm, gỡ thành viên, chuyển dữ liệu cũ lên). Đây là kiểm thử cục bộ, **chưa chạy trên Supabase thật** (đặc biệt phần Realtime), nên nếu có lỗi hãy gửi nguyên văn thông báo lỗi và mô tả bước làm.
