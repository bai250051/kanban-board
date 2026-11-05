\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
insert into auth.users (id, email, raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001', 'a@x.com', '{"name":"An"}'),
 ('bbbbbbbb-0000-0000-0000-000000000002', 'b@x.com', '{"name":"Bình"}'),
 ('cccccccc-0000-0000-0000-000000000003', 'c@x.com', '{}');
do $$ begin
  assert (select array_agg(member_no order by member_no) from public.profiles) = array[1,2,3]::bigint[], 'member_no';
  assert (select display_name from public.profiles where member_no = 3) = 'c', 'tên mặc định lấy từ email';
  raise notice 'PASS mã số thành viên tăng dần 1,2,3; tên hiển thị lấy từ đăng ký';
end $$;

-- ===== Đăng nhập là An =====
set role authenticated; select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.boards (id, owner_id, name, data) values ('b1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Nhóm 1', '{"cols":[]}') returning version;
do $$ begin
  assert (select count(*) from public.board_members where board_id = 'b1' and role = 'owner') = 1, 'chủ bảng tự thành thành viên';
  raise notice 'PASS tạo bảng nhóm: người tạo tự là chủ bảng';
end $$;
insert into public.user_data (user_id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', '{"grades":[1]}');
update public.user_data set data = '{"grades":[2]}' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin
  assert (select version from public.user_data) = 2 and (select data from public.user_data) = '{"grades":[2]}'::jsonb, 'sửa dữ liệu riêng tăng version';
  raise notice 'PASS sửa dữ liệu riêng: version tăng, nội dung được cập nhật';
end $$;
reset role;

-- ===== Bình: không thấy gì của An =====
set role authenticated; select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$ declare ok boolean; r record; begin
  assert (select count(*) from public.boards) = 0, 'Bình không thấy bảng của An';
  assert (select count(*) from public.profiles) = 1, 'Bình chỉ thấy hồ sơ của mình';
  assert (select count(*) from public.user_data) = 0, 'Bình không thấy dữ liệu riêng của An';
  raise notice 'PASS người ngoài nhóm không thấy bảng, hồ sơ người khác, dữ liệu riêng';
  ok := false; begin insert into public.boards (id, owner_id, name) values ('evil', 'aaaaaaaa-0000-0000-0000-000000000001', 'x'); exception when others then ok := true; end;
  assert ok, 'không được tạo bảng mạo danh chủ khác';
  ok := false; begin insert into public.user_data (user_id, data) values ('aaaaaaaa-0000-0000-0000-000000000001', '{}'); exception when others then ok := true; end;
  assert ok, 'không được ghi dữ liệu riêng của người khác';
  ok := false; begin insert into public.board_members (board_id, user_id, role) values ('b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'member'); exception when others then ok := true; end;
  assert ok, 'không được tự thêm mình vào nhóm';
  ok := false; begin insert into public.invitations (board_id, from_user, to_user) values ('b1', 'bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002'); exception when others then ok := true; end;
  assert ok, 'không được tự tạo lời mời';
  raise notice 'PASS không mạo danh, không tự vào nhóm, không tự tạo lời mời';
  select * into r from public.find_member_by_no(1);
  assert r.member_no = 1 and r.display_name = 'An', 'tra cứu mã số trả về tên hiển thị';
  assert (select count(*) from information_schema.columns where table_name = 'profiles' and column_name = 'email') = 0, 'hồ sơ không có email';
  raise notice 'PASS tra cứu mã số chỉ trả về mã số và tên hiển thị';
  ok := false; begin perform public.send_invitation('b1', 3); exception when sqlstate '42501' then ok := true; end;
  assert ok, 'người không phải chủ bảng không được mời';
  raise notice 'PASS chỉ chủ bảng mới được mời';
  ok := false; begin update public.profiles set member_no = 99 where id = 'bbbbbbbb-0000-0000-0000-000000000002'; exception when others then ok := true; end;
  assert ok, 'không được sửa mã số';
  update public.profiles set display_name = 'Bình mới' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  assert (select display_name from public.profiles) = 'Bình mới', 'sửa được tên của mình';
  raise notice 'PASS không sửa được mã số thành viên; sửa được tên hiển thị của mình';
end $$;
reset role;

-- ===== An mời Bình (mã số 2) =====
set role authenticated; select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$ declare ok boolean; begin
  perform public.send_invitation('b1', 2);
  ok := false; begin perform public.send_invitation('b1', 2); exception when sqlstate 'P0001' then ok := true; end;
  assert ok, 'không mời trùng';
  ok := false; begin perform public.send_invitation('b1', 1); exception when sqlstate 'P0001' then ok := true; end;
  assert ok, 'không tự mời mình';
  ok := false; begin perform public.send_invitation('b1', 777); exception when sqlstate 'P0002' then ok := true; end;
  assert ok, 'mã số không tồn tại';
  assert (select count(*) from public.board_pending_invitations('b1')) = 1 and (select member_no from public.board_pending_invitations('b1')) = 2, 'chủ bảng xem được lời mời đang chờ của bảng';
  raise notice 'PASS gửi lời mời: chặn mời trùng, tự mời, mã số không tồn tại';
end $$;
reset role;

-- ===== Cường không thấy lời mời; Bình thấy và chấp nhận =====
set role authenticated; select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
do $$ declare ok boolean; begin
  assert (select count(*) from public.invitations) = 0, 'Cường không thấy lời mời';
  assert (select count(*) from public.my_pending_invitations()) = 0, 'Cường không có lời mời nào';
  ok := false; begin perform public.respond_invitation(1, true); exception when sqlstate 'P0002' then ok := true; end;
  assert ok, 'người khác không trả lời thay được';
  raise notice 'PASS lời mời chỉ người gửi và người nhận thấy; người khác không trả lời thay';
end $$;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$ begin
  assert (select count(*) from public.invitations where status = 'pending') = 1, 'Bình thấy lời mời';
  assert (select count(*) from public.my_pending_invitations()) = 1 and (select board_name from public.my_pending_invitations()) = 'Nhóm 1' and (select from_name from public.my_pending_invitations()) = 'An', 'xem lời mời gửi tới tôi kèm tên bảng và người mời';
  assert (select count(*) from public.board_pending_invitations('b1')) = 0, 'thành viên thường không xem được lời mời đang chờ của bảng';
  assert (select count(*) from public.boards) = 0, 'chưa chấp nhận thì chưa thấy bảng';
  perform public.respond_invitation(1, true);
  assert (select count(*) from public.boards) = 1, 'chấp nhận xong thấy bảng';
  assert (select count(*) from public.profiles) = 2, 'thấy hồ sơ của người cùng nhóm';
  raise notice 'PASS chấp nhận lời mời thì mới vào nhóm và thấy bảng';
end $$;
-- Bình (thành viên) sửa dữ liệu bảng
update public.boards set data = '{"cols":["Cần làm"]}' where id = 'b1';
do $$ declare ok boolean; n int; begin
  assert (select version from public.boards where id = 'b1') = 2, 'version tăng';
  get diagnostics n = row_count;
  update public.boards set data = '{}' where id = 'b1' and version = 1; get diagnostics n = row_count;
  assert n = 0, 'sửa với version cũ không thành công (phát hiện xung đột)';
  ok := false; begin update public.boards set owner_id = 'bbbbbbbb-0000-0000-0000-000000000002' where id = 'b1'; exception when others then ok := true; end;
  assert ok, 'thành viên không đổi được chủ bảng';
  delete from public.boards where id = 'b1'; get diagnostics n = row_count;
  assert n = 0, 'thành viên không xóa được bảng';
  raise notice 'PASS thành viên sửa được bảng; phát hiện xung đột theo version; không đổi chủ, không xóa bảng';
end $$;
reset role;

-- ===== Cường (ngoài nhóm) không sửa được =====
set role authenticated; select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
do $$ declare n int; begin
  update public.boards set data = '{"hack":1}' where id = 'b1'; get diagnostics n = row_count;
  assert n = 0, 'người ngoài không sửa được bảng';
  assert (select count(*) from public.board_members) = 0, 'người ngoài không thấy danh sách thành viên';
  raise notice 'PASS người ngoài nhóm không sửa được bảng, không thấy thành viên';
end $$;
reset role;

-- ===== Kho file: thành viên được, người ngoài không =====
set role authenticated; select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into storage.objects (bucket_id, name, owner) values ('attachments', 'aaaaaaaa-0000-0000-0000-000000000001/f1', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into storage.objects (bucket_id, name, owner) values ('attachments', 'b1/f2', 'aaaaaaaa-0000-0000-0000-000000000001');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$ declare ok boolean; begin
  assert (select count(*) from storage.objects) = 1 and (select name from storage.objects) = 'b1/f2', 'thành viên chỉ thấy file của bảng nhóm, không thấy file riêng của An';
  ok := false; begin insert into storage.objects (bucket_id, name) values ('attachments', 'aaaaaaaa-0000-0000-0000-000000000001/hack'); exception when others then ok := true; end;
  assert ok, 'không tải file vào thư mục riêng của người khác';
  insert into storage.objects (bucket_id, name) values ('attachments', 'b1/f3');
  raise notice 'PASS file đính kèm: thành viên dùng được file của bảng nhóm, không đụng được file riêng của người khác';
end $$;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
do $$ declare ok boolean; begin
  assert (select count(*) from storage.objects) = 0, 'người ngoài không thấy file nào';
  ok := false; begin insert into storage.objects (bucket_id, name) values ('attachments', 'b1/f4'); exception when others then ok := true; end;
  assert ok, 'người ngoài không tải file vào bảng nhóm';
  raise notice 'PASS người ngoài nhóm không thấy và không tải file vào bảng nhóm';
end $$;
reset role;

-- ===== Chủ bảng gỡ thành viên; thành viên rời nhóm =====
set role authenticated; select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$ declare n int; begin
  delete from public.board_members where board_id = 'b1' and user_id = 'aaaaaaaa-0000-0000-0000-000000000001'; get diagnostics n = row_count;
  assert n = 0, 'không gỡ được chủ bảng';
  delete from public.board_members where board_id = 'b1' and user_id = 'bbbbbbbb-0000-0000-0000-000000000002'; get diagnostics n = row_count;
  assert n = 1, 'chủ bảng gỡ được thành viên';
  raise notice 'PASS chủ bảng gỡ được thành viên, không tự gỡ được chính mình';
end $$;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$ begin
  assert (select count(*) from public.boards) = 0 and (select count(*) from storage.objects) = 0, 'bị gỡ thì mất quyền xem bảng và file';
  raise notice 'PASS bị gỡ khỏi nhóm thì mất quyền xem bảng và file';
end $$;
reset role;
-- mời lại, chấp nhận rồi tự rời
set role authenticated; select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select public.send_invitation('b1', 2);
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$ declare n int; begin
  perform public.respond_invitation((select id from public.invitations where status = 'pending' and to_user = auth.uid()), true);
  assert (select count(*) from public.boards) = 1, 'vào lại nhóm';
  delete from public.board_members where board_id = 'b1' and user_id = 'bbbbbbbb-0000-0000-0000-000000000002'; get diagnostics n = row_count;
  assert n = 1, 'thành viên tự rời nhóm';
  raise notice 'PASS mời lại, chấp nhận, rồi tự rời nhóm';
end $$;
reset role;

-- ===== Từ chối và thu hồi lời mời =====
set role authenticated; select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select public.send_invitation('b1', 3);
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
do $$ begin
  perform public.respond_invitation((select id from public.invitations where status = 'pending' and to_user = auth.uid()), false);
  assert (select status from public.invitations where to_user = auth.uid() order by id desc limit 1) = 'declined', 'từ chối';
  assert (select count(*) from public.boards) = 0, 'từ chối thì không vào nhóm';
  raise notice 'PASS từ chối lời mời thì không vào nhóm';
end $$;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$ declare ok boolean; begin
  perform public.send_invitation('b1', 3);
  perform public.cancel_invitation((select id from public.invitations where from_user = auth.uid() and status = 'pending'));
  assert (select status from public.invitations where from_user = auth.uid() order by id desc limit 1) = 'cancelled', 'thu hồi';
  raise notice 'PASS người gửi thu hồi được lời mời đang chờ';
end $$;
reset role;

-- ===== Giới hạn tra cứu (chống dò mã hàng loạt) =====
set role authenticated; select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
do $$ declare ok boolean := false; i int; begin
  begin for i in 1..40 loop perform public.find_member_by_no(i); end loop; exception when sqlstate 'P0001' then ok := true; end;
  assert ok, 'tra cứu quá nhiều phải bị chặn';
  ok := false; begin perform count(*) from public.lookup_log; exception when insufficient_privilege then ok := true; end;
  assert ok, 'người dùng không đọc được nhật ký tra cứu';
  raise notice 'PASS giới hạn 30 lần tra cứu mỗi 10 phút; nhật ký tra cứu không đọc được';
end $$;
reset role;

-- ===== Người chưa đăng nhập (anon) =====
set role anon;
do $$ declare ok boolean; begin
  ok := false; begin perform count(*) from public.profiles; exception when insufficient_privilege then ok := true; end;
  assert ok, 'anon không đọc được hồ sơ';
  ok := false; begin perform public.find_member_by_no(1); exception when insufficient_privilege then ok := true; end;
  assert ok, 'anon không tra cứu được mã số';
  raise notice 'PASS người chưa đăng nhập không đọc được dữ liệu và không tra cứu được mã số';
end $$;
reset role;

-- ===== Xóa bảng: chỉ chủ; xóa kéo theo thành viên và lời mời =====
set role authenticated; select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
delete from public.boards where id = 'b1';
reset role;
do $$ begin
  assert (select count(*) from public.board_members) = 0 and (select count(*) from public.invitations) = 0, 'xóa bảng kéo theo dữ liệu liên quan';
  raise notice 'PASS chủ bảng xóa bảng thì thành viên và lời mời liên quan cũng bị xóa';
end $$;
