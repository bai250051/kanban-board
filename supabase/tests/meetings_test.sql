\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
-- Chạy sau stub.sql, schema.sql, storage.sql, meetings.sql (độc lập với test.sql: dùng người dùng và bảng riêng)
insert into auth.users (id, email, raw_user_meta_data) values
 ('d1000000-0000-0000-0000-00000000000a', 'ma@x.com', '{"name":"Mai"}'),
 ('d1000000-0000-0000-0000-00000000000b', 'mb@x.com', '{"name":"Minh"}'),
 ('d1000000-0000-0000-0000-00000000000c', 'mc@x.com', '{"name":"Mộc"}'),
 ('d1000000-0000-0000-0000-00000000000d', 'md@x.com', '{"name":"Mạnh"}');

select member_no as no_a from public.profiles where id = 'd1000000-0000-0000-0000-00000000000a' \gset
select member_no as no_b from public.profiles where id = 'd1000000-0000-0000-0000-00000000000b' \gset
-- Mai tạo nhóm G1; Mộc tạo nhóm G2 và mời Mai sau; Minh vào G1 bằng lời mời (đi qua hàm thật)
set role authenticated; select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-00000000000a', false);
insert into public.boards (id, owner_id, name, data) values ('g1', 'd1000000-0000-0000-0000-00000000000a', 'Nhóm G1', '{"meetings":[]}');
select public.send_invitation('g1', :no_b) is not null as invited_b;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-00000000000b', false);
select public.respond_invitation((select id from public.my_pending_invitations() limit 1), true);
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-00000000000c', false);
insert into public.boards (id, owner_id, name, data) values ('g2', 'd1000000-0000-0000-0000-00000000000c', 'Nhóm G2', '{}');
reset role;

-- ===== Mai đẩy khung giờ bận của mình =====
set role authenticated; select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-00000000000a', false);
insert into public.busy_slots (user_id, slots) values ('d1000000-0000-0000-0000-00000000000a', '[{"s":"2026-11-09T08:00","e":"2026-11-09T10:00","k":"f"}]');
update public.busy_slots set slots = '[{"s":"2026-11-09T08:00","e":"2026-11-09T10:00","k":"f"},{"s":"2026-11-10T09:00","e":"2026-11-10T09:00","k":"d"}]' where user_id = 'd1000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select jsonb_array_length(slots) from public.busy_slots where user_id = 'd1000000-0000-0000-0000-00000000000a') = 2, 'sửa khung giờ của mình';
  assert (select count(*) from public.board_busy('g1')) = 1, 'Mai thấy khung giờ của chính mình qua hàm';
  raise notice 'PASS ghi và sửa khung giờ bận của chính mình';
end $$;
reset role;

-- ===== Minh (cùng nhóm G1) =====
set role authenticated; select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-00000000000b', false);
insert into public.busy_slots (user_id, slots) values ('d1000000-0000-0000-0000-00000000000b', '[{"s":"2026-11-09T14:00","e":"2026-11-09T15:00","k":"m","r":"x"}]');
do $$ declare ok boolean; begin
  assert (select count(*) from public.board_busy('g1')) = 2, 'Minh thấy khung giờ của cả Mai và mình';
  assert (select slots -> 0 ->> 'k' from public.board_busy('g1') where user_id = 'd1000000-0000-0000-0000-00000000000a') = 'f', 'đọc đúng nội dung';
  raise notice 'PASS thành viên cùng nhóm đọc được khung giờ của nhau qua hàm board_busy';
  assert (select count(*) from public.busy_slots) = 1, 'đọc bảng trực tiếp chỉ thấy dòng của mình';
  raise notice 'PASS không đọc trực tiếp bảng khung giờ của người khác';
  ok := false; begin update public.busy_slots set slots = '[]' where user_id = 'd1000000-0000-0000-0000-00000000000a'; if not found then ok := true; end if; exception when others then ok := true; end;
  assert ok, 'không sửa được khung giờ của Mai';
  assert (select jsonb_array_length(slots) from public.board_busy('g1') where user_id = 'd1000000-0000-0000-0000-00000000000a') = 2, 'dữ liệu Mai còn nguyên';
  ok := false; begin insert into public.busy_slots (user_id, slots) values ('d1000000-0000-0000-0000-00000000000d', '[]'); exception when others then ok := true; end;
  assert ok, 'không ghi thay người khác';
  ok := false; begin delete from public.busy_slots where user_id = 'd1000000-0000-0000-0000-00000000000a'; if not found then ok := true; end if; exception when others then ok := true; end;
  assert ok, 'không xóa được dòng người khác';
  raise notice 'PASS không sửa, ghi thay hoặc xóa khung giờ của người khác';
  ok := false; begin update public.busy_slots set slots = '{"a":1}' where user_id = 'd1000000-0000-0000-0000-00000000000b'; exception when others then ok := true; end;
  assert ok, 'từ chối dữ liệu không phải mảng';
  ok := false; begin update public.busy_slots set slots = (select jsonb_agg('{"s":"x"}'::jsonb) from generate_series(1, 3001)) where user_id = 'd1000000-0000-0000-0000-00000000000b'; exception when others then ok := true; end;
  assert ok, 'từ chối quá 3000 khung giờ';
  raise notice 'PASS giới hạn định dạng và số lượng khung giờ';
end $$;
reset role;

-- ===== Mộc (nhóm khác) không thấy gì của G1; Mạnh (chưa vào nhóm nào) không thấy gì =====
set role authenticated; select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-00000000000c', false);
do $$ begin
  assert (select count(*) from public.board_busy('g1')) = 0, 'Mộc không đọc được khung giờ của G1';
  assert (select count(*) from public.board_busy('g2')) = 0, 'G2 chưa có khung giờ nào (chỉ Mộc, chưa đẩy)';
  raise notice 'PASS người ngoài nhóm không đọc được khung giờ bận của nhóm';
end $$;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-00000000000d', false);
do $$ begin
  assert (select count(*) from public.board_busy('g1')) = 0 and (select count(*) from public.board_busy('g2')) = 0, 'Mạnh không thấy gì';
  raise notice 'PASS người chưa vào nhóm nào không đọc được gì';
end $$;
reset role;

-- ===== Người ở nhiều nhóm chỉ lộ khung giờ qua nhóm mà người đọc cùng tham gia =====
-- Mai vào G2 thật sự (Mộc mời, Mai chấp nhận); Minh vẫn ở G1 thôi
set role authenticated; select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-00000000000c', false);
select public.send_invitation('g2', :no_a) is not null as invited_a;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-00000000000a', false);
select public.respond_invitation((select id from public.my_pending_invitations() limit 1), true);
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-00000000000c', false);
do $$ begin
  assert (select count(*) from public.board_busy('g2')) = 1, 'Mộc thấy khung giờ của Mai (đã cùng nhóm G2)';
  assert (select count(*) from public.board_busy('g1')) = 0, 'Mộc vẫn không đọc G1';
  raise notice 'PASS cùng nhóm nào thì đọc qua nhóm đó; không lộ sang nhóm khác';
end $$;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert (select count(*) from public.board_busy('g2')) = 0, 'Minh không đọc G2';
  raise notice 'PASS thành viên G1 không đọc được G2';
end $$;
reset role;

-- ===== Ẩn danh không dùng được =====
set role anon;
do $$ declare ok boolean; begin
  ok := false; begin perform * from public.board_busy('g1'); exception when others then ok := true; end;
  assert ok, 'ẩn danh không gọi được hàm';
  ok := false; begin perform * from public.busy_slots; exception when others then ok := true; end;
  assert ok, 'ẩn danh không đọc được bảng';
  raise notice 'PASS người chưa đăng nhập không dùng được';
end $$;
reset role;

-- ===== Xóa tài khoản thì xóa khung giờ =====
delete from auth.users where id = 'd1000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from public.busy_slots where user_id = 'd1000000-0000-0000-0000-00000000000b') = 0, 'xóa theo tài khoản';
  raise notice 'PASS xóa tài khoản kéo theo xóa khung giờ bận';
end $$;
