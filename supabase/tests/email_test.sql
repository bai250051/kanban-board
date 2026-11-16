\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
-- Chạy sau stub.sql, schema.sql, storage.sql, meetings.sql, email_reminders.sql
insert into auth.users (id, email, raw_user_meta_data) values
 ('e1000000-0000-0000-0000-00000000000a', 'ea@x.com', '{"name":"An"}'),
 ('e1000000-0000-0000-0000-00000000000b', 'eb@x.com', '{"name":"Bình"}'),
 ('e1000000-0000-0000-0000-00000000000c', 'ec@x.com', '{"name":"Chi"}'),
 ('e1000000-0000-0000-0000-00000000000d', null,        '{"name":"Dũng"}');

-- ===== An cài đặt cho chính mình =====
set role authenticated; select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-00000000000a', false);
insert into public.email_reminders (user_id, enabled, leads) values ('e1000000-0000-0000-0000-00000000000a', true, '{30}');
update public.email_reminders set leads = '{30,60}' where user_id = 'e1000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select leads from public.email_reminders where user_id = 'e1000000-0000-0000-0000-00000000000a') = '{30,60}', 'sửa mốc nhắc';
  raise notice 'PASS người dùng tạo và sửa được cài đặt nhắc email của chính mình';
end $$;
reset role;

-- Bình, Chi, Dũng (Dũng không có email)
set role authenticated; select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-00000000000b', false);
insert into public.email_reminders (user_id, enabled, leads) values ('e1000000-0000-0000-0000-00000000000b', true, '{30}');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-00000000000c', false);
insert into public.email_reminders (user_id, enabled, leads) values ('e1000000-0000-0000-0000-00000000000c', false, '{60}');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-00000000000d', false);
insert into public.email_reminders (user_id, enabled, leads) values ('e1000000-0000-0000-0000-00000000000d', true, '{30}');
reset role;

-- ===== Riêng tư và ràng buộc (Bình) =====
set role authenticated; select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-00000000000b', false);
do $$ declare ok boolean; begin
  assert (select count(*) from public.email_reminders) = 1, 'chỉ thấy dòng của mình';
  update public.email_reminders set enabled = false where user_id = 'e1000000-0000-0000-0000-00000000000a';
  assert not found, 'không sửa được của người khác';
  raise notice 'PASS không đọc, không sửa được cài đặt của người khác';
  ok := false; begin insert into public.email_reminders (user_id, enabled, leads) values ('e1000000-0000-0000-0000-00000000000c', true, '{30}'); exception when others then ok := true; end;
  assert ok, 'không ghi hộ người khác';
  raise notice 'PASS không tạo cài đặt thay người khác';
  ok := false; begin update public.email_reminders set leads = '{45}' where user_id = 'e1000000-0000-0000-0000-00000000000b'; exception when others then ok := true; end;
  assert ok, 'từ chối mốc 45';
  ok := false; begin update public.email_reminders set leads = '{}' where user_id = 'e1000000-0000-0000-0000-00000000000b'; exception when others then ok := true; end;
  assert ok, 'từ chối danh sách rỗng';
  ok := false; begin update public.email_reminders set leads = '{30,30,60}' where user_id = 'e1000000-0000-0000-0000-00000000000b'; exception when others then ok := true; end;
  assert ok, 'từ chối quá hai mốc';
  update public.email_reminders set leads = '{30,60}' where user_id = 'e1000000-0000-0000-0000-00000000000b';
  raise notice 'PASS chỉ nhận mốc 30 và/hoặc 60 phút, tối đa hai mốc';
end $$;
-- nhật ký và hàm danh sách người nhận không dùng được với người dùng thường
do $$ declare ok boolean; begin
  ok := false; begin perform * from public.email_reminder_log; exception when others then ok := true; end;
  assert ok, 'không đọc được nhật ký';
  ok := false; begin insert into public.email_reminder_log (user_id, task_key, due, lead) values ('e1000000-0000-0000-0000-00000000000b', 'x', 'y', 30); exception when others then ok := true; end;
  assert ok, 'không ghi được nhật ký';
  raise notice 'PASS người dùng thường không đọc hay ghi được nhật ký thư đã gửi';
  ok := false; begin perform * from public.reminder_targets(); exception when others then ok := true; end;
  assert ok, 'không gọi được hàm danh sách người nhận';
  raise notice 'PASS người dùng thường không gọi được hàm danh sách người nhận';
end $$;
reset role;
set role anon;
do $$ declare ok boolean; begin
  ok := false; begin perform * from public.reminder_targets(); exception when others then ok := true; end;
  assert ok, 'anon không gọi được';
  ok := false; begin perform * from public.email_reminders; exception when others then ok := true; end;
  assert ok, 'anon không đọc được';
  raise notice 'PASS người chưa đăng nhập không dùng được';
end $$;
reset role;

-- ===== service_role (Edge Function) =====
set role service_role;
do $$ begin
  assert (select count(*) from public.reminder_targets()) = 2, 'chỉ người đã bật và có email';
  assert (select leads from public.reminder_targets() where email = 'eb@x.com') = '{30,60}', 'kèm mốc nhắc';
  assert (select name from public.reminder_targets() where email = 'ea@x.com') = 'An', 'kèm tên';
  assert not exists (select 1 from public.reminder_targets() where email = 'ec@x.com'), 'bỏ người đã tắt';
  raise notice 'PASS hàm danh sách người nhận chỉ trả người đã bật nhắc và có email, kèm mốc nhắc và tên';
  insert into public.email_reminder_log (user_id, task_key, due, lead) values ('e1000000-0000-0000-0000-00000000000a', 'p:t1', '2026-11-12T10:00', 30);
  insert into public.email_reminder_log (user_id, task_key, due, lead) values ('e1000000-0000-0000-0000-00000000000a', 'p:t1', '2026-11-12T10:00', 30) on conflict do nothing;
  assert (select count(*) from public.email_reminder_log) = 1, 'không ghi trùng';
  insert into public.email_reminder_log (user_id, task_key, due, lead) values ('e1000000-0000-0000-0000-00000000000a', 'p:t1', '2026-11-12T11:00', 30);
  assert (select count(*) from public.email_reminder_log) = 2, 'đổi hạn thì tính là thư mới';
  raise notice 'PASS nhật ký không ghi trùng; đổi hạn thì được nhắc lại';
end $$;
reset role;
-- ===== Xóa tài khoản =====
delete from auth.users where id = 'e1000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from public.email_reminders where user_id = 'e1000000-0000-0000-0000-00000000000a') = 0, 'xóa cài đặt';
  assert (select count(*) from public.email_reminder_log where user_id = 'e1000000-0000-0000-0000-00000000000a') = 0, 'xóa nhật ký';
  raise notice 'PASS xóa tài khoản kéo theo xóa cài đặt và nhật ký nhắc email';
end $$;
