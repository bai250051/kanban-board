Kiểm thử cho `schema.sql` (tùy chọn, dành cho người biết PostgreSQL).
Trên một cơ sở dữ liệu PostgreSQL trống, chạy lần lượt: `stub.sql` (giả lập auth và storage), `../schema.sql`, `../storage.sql`, `test.sql`.
Mỗi kiểm tra đạt in ra dòng `PASS`; có lỗi thì dừng và báo nguyên nhân.
