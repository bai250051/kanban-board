# Kanban Board

Ứng dụng web quản lý công việc và thời gian biểu dạng Kanban, có làm việc nhóm đồng bộ thời gian thực, đặt lịch và họp trực tuyến. Đồ án học phần **Công nghệ phần mềm**, Trường Đại học CMC.

**Dùng thử:** https://bai250051.github.io/kanban-board/

![Giao diện bảng tuần](docs/images/week.png)

## Tính năng chính
- Bảng Kanban cá nhân: kéo thả thẻ giữa các cột, tùy chỉnh cột, hoàn tác (Ctrl+Z)
- Thời khóa biểu tuần, đặt hạn ngày giờ, lịch lặp hàng tuần
- Thêm việc nhanh bằng một câu hoặc giọng nói (luôn có bước xác nhận)
- Làm việc nhóm: mời thành viên bằng mã số, giao việc, xem theo sprint và theo người
- Đồng bộ thời gian thực (Supabase Realtime), gộp thay đổi ba bên khi xung đột
- Đặt lịch họp, xem khung giờ bận của thành viên, họp trực tuyến ngay trong web (JaaS)
- Công cụ tính điểm môn học, file đính kèm, sao lưu và khôi phục dữ liệu JSON
- Hai chế độ: **cục bộ** (không cần tài khoản, dữ liệu ở trình duyệt) và **có tài khoản** (Supabase)

## Công nghệ
| Thành phần | Công nghệ |
|---|---|
| Giao diện | HTML, CSS, JavaScript thuần |
| Lưu trữ cục bộ | localStorage, IndexedDB |
| Backend | Supabase: Auth, PostgreSQL + RLS, Realtime, Storage, Edge Function |
| Họp trực tuyến | JaaS (8x8) |
| Triển khai | GitHub Pages |

## Chạy thử cục bộ
1. Tải mã nguồn: `git clone https://github.com/bai250051/kanban-board.git`
2. Mở file `index.html` bằng trình duyệt. Ứng dụng chạy ngay ở chế độ cục bộ.

## Cấu hình chế độ có tài khoản (Supabase)
1. Tạo dự án trên [supabase.com](https://supabase.com).
2. Vào **SQL Editor**, chạy lần lượt các file trong thư mục `supabase/` [[ghi đúng thứ tự tên file]].
3. Điền `Project URL` và khóa `anon` vào file cấu hình trong `js/` [[ghi tên file]].
4. Với họp trực tuyến: tạo Edge Function `jaas-token` và đặt khóa JaaS trong **secrets** của Supabase. **Không** đưa khóa riêng vào repo.

## Cấu trúc thư mục
```
├─ index.html        Trang chính
├─ css/              Giao diện
├─ js/               Mã nguồn theo tính năng (board, tasks, grades, meetings, sync, team, ...)
├─ supabase/         SQL, phân quyền RLS, Edge Function
└─ docs/             Báo cáo, slide, test case
```

## Nhóm thực hiện
| Thành viên | Vai trò | Phần phụ trách |
|---|---|---|
| [[Họ tên 1]] | [[...]] | [[...]] |
| [[Họ tên 2]] | [[...]] | [[...]] |
| [[Họ tên 3]] | [[...]] | [[...]] |

Giảng viên hướng dẫn: [[Họ tên]]

## Quy trình làm việc
- Làm việc theo **6 sprint** Scrum; mỗi sprint có Milestone, Issue và Project board
- Nhánh `main` luôn chạy được; mỗi việc làm trên nhánh `feature/...` hoặc `fix/...` rồi gửi Pull Request, có người review
- Quy ước commit: `feat:`, `fix:`, `docs:`, `test:`, `chore:`
- Mỗi sprint có Release kèm tag (xem mục [Releases](../../releases))

## Kiểm thử
211 test case, 18 module: 207 đạt, 4 lỗi ghi nhận (BUG-02 và BUG-04 đã sửa). Chi tiết trong `docs/`.

## Hạn chế đã biết
- Chế độ cục bộ lưu mật khẩu không mã hóa (BUG-01), chỉ dùng để demo
- Kéo thả đôi khi thả thẻ xuống cuối cột (BUG-03)
- Chưa có tích hợp liên tục (CI) và chưa kiểm thử bảo mật tự động

## Tài liệu
- [Báo cáo cuối](docs/Bao_cao_Kanban_Board.docx)
- [Test case và báo cáo kiểm thử](docs/)
