-- =====================================================================
-- Kanban Board - cấu trúc dữ liệu cho Supabase (Sprint 5)
-- Cách chạy: Supabase > SQL Editor > New query > dán toàn bộ file này > Run.
-- Chạy file storage.sql sau file này (nếu muốn lưu file đính kèm).
-- =====================================================================

-- 1. Hồ sơ người dùng. member_no là MÃ SỐ THÀNH VIÊN: tăng dần từ 1, chỉ gồm số,
--    do cơ sở dữ liệu tự cấp, không sửa được. Dùng để mời vào nhóm.
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  member_no    bigint generated always as identity (start with 1) unique not null,
  display_name text not null default 'Thành viên',
  created_at   timestamptz not null default now()
);

-- Tự tạo hồ sơ (và cấp mã số) khi có tài khoản mới
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
                   nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
                   'Thành viên'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Dữ liệu riêng của từng người: bảng cá nhân, điểm, cài đặt... (mỗi người một dòng)
create table public.user_data (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  version    integer not null default 1,
  updated_at timestamptz not null default now()
);

-- 3. Bảng nhóm (dùng chung): mỗi bảng một dòng, gồm cột, thẻ, sprint, cuộc họp...
create table public.boards (
  id         text primary key,
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  data       jsonb not null default '{}'::jsonb,
  version    integer not null default 1,
  updated_at timestamptz not null default now()
);

-- 4. Thành viên của bảng nhóm
create table public.board_members (
  board_id  text not null references public.boards(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (board_id, user_id)
);
create index board_members_user_idx on public.board_members (user_id);

-- 5. Lời mời vào nhóm (người nhận phải chấp nhận mới vào nhóm)
create table public.invitations (
  id           bigint generated always as identity primary key,
  board_id     text not null references public.boards(id) on delete cascade,
  from_user    uuid not null references public.profiles(id) on delete cascade,
  to_user      uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);
create unique index invitations_one_pending on public.invitations (board_id, to_user) where status = 'pending';
create index invitations_to_idx on public.invitations (to_user, status);

-- 6. Nhật ký tra cứu mã số (để giới hạn số lần, chống dò mã hàng loạt)
create table public.lookup_log (
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index lookup_log_idx on public.lookup_log (user_id, at);

-- ---------------------------------------------------------------------
-- Hàm hỗ trợ kiểm tra quyền (chạy với quyền chủ để tránh lặp vô hạn khi áp quy tắc)
-- ---------------------------------------------------------------------
create function public.is_board_member(p_board text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.board_members m where m.board_id = p_board and m.user_id = auth.uid());
$$;

create function public.is_board_owner(p_board text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.board_members m
                 where m.board_id = p_board and m.user_id = auth.uid() and m.role = 'owner');
$$;

create function public.shares_board_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.board_members a join public.board_members b on a.board_id = b.board_id
                 where a.user_id = auth.uid() and b.user_id = p_user);
$$;

-- Người tạo bảng tự thành chủ bảng
create function public.boards_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.board_members (board_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger boards_after_insert after insert on public.boards
  for each row execute function public.boards_after_insert();

-- Mỗi lần sửa: tăng version (để phát hiện hai người sửa cùng lúc); bảng nhóm không cho đổi chủ
create function public.boards_bump() returns trigger
language plpgsql as $$
begin
  if new.owner_id <> old.owner_id then raise exception 'Không được đổi chủ bảng'; end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
create trigger boards_bump before update on public.boards for each row execute function public.boards_bump();

create function public.user_data_bump() returns trigger
language plpgsql as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
create trigger user_data_bump before update on public.user_data for each row execute function public.user_data_bump();

-- ---------------------------------------------------------------------
-- Quy tắc truy cập (Row Level Security): chỉ người có quyền mới thấy dữ liệu
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.user_data     enable row level security;
alter table public.boards        enable row level security;
alter table public.board_members enable row level security;
alter table public.invitations   enable row level security;
alter table public.lookup_log    enable row level security;   -- không có quy tắc nào: người dùng không đọc được

-- Hồ sơ: chỉ thấy mình và những người cùng nhóm; chỉ sửa được tên hiển thị của mình
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_board_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Dữ liệu riêng: chỉ chủ của nó
create policy user_data_all on public.user_data for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Bảng nhóm: thành viên xem và sửa; ai cũng tạo được bảng của mình; chỉ chủ bảng xóa
-- (owner_id = auth.uid() cần thiết để INSERT ... RETURNING đọc lại được dòng vừa tạo, vì tư cách thành viên chỉ được thêm sau đó bởi trigger)
create policy boards_select on public.boards for select to authenticated using (owner_id = auth.uid() or public.is_board_member(id));
create policy boards_insert on public.boards for insert to authenticated with check (owner_id = auth.uid());
create policy boards_update on public.boards for update to authenticated
  using (public.is_board_member(id)) with check (public.is_board_member(id));
create policy boards_delete on public.boards for delete to authenticated using (public.is_board_owner(id));

-- Thành viên: xem danh sách của nhóm mình; thêm chỉ qua lời mời; chủ bảng gỡ được thành viên, thành viên tự rời được
create policy members_select on public.board_members for select to authenticated
  using (user_id = auth.uid() or public.is_board_member(board_id));
create policy members_delete on public.board_members for delete to authenticated
  using (role <> 'owner' and (user_id = auth.uid() or public.is_board_owner(board_id)));

-- Lời mời: chỉ người gửi và người nhận xem được; gửi và trả lời chỉ qua hàm bên dưới
create policy invitations_select on public.invitations for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

-- ---------------------------------------------------------------------
-- Hàm cho web gọi (rpc)
-- ---------------------------------------------------------------------
-- Tra cứu bằng mã số: chỉ trả về mã số và tên hiển thị (không lộ email), tối đa 30 lần mỗi 10 phút
create function public.find_member_by_no(p_no bigint) returns table (member_no bigint, display_name text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Chưa đăng nhập' using errcode = '28000'; end if;
  delete from public.lookup_log where at < now() - interval '1 day';
  if (select count(*) from public.lookup_log l where l.user_id = v_uid and l.at > now() - interval '10 minutes') >= 30 then
    raise exception 'Tra cứu quá nhiều lần, hãy thử lại sau ít phút' using errcode = 'P0001';
  end if;
  insert into public.lookup_log (user_id) values (v_uid);
  return query select p.member_no, p.display_name from public.profiles p where p.member_no = p_no;
end $$;

-- Mời một người vào bảng bằng mã số (chỉ chủ bảng được mời)
create function public.send_invitation(p_board text, p_member_no bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_to uuid; v_id bigint;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập' using errcode = '28000'; end if;
  if not public.is_board_owner(p_board) then raise exception 'Chỉ chủ bảng mới được mời thành viên' using errcode = '42501'; end if;
  delete from public.lookup_log where at < now() - interval '1 day';
  if (select count(*) from public.lookup_log l where l.user_id = v_uid and l.at > now() - interval '10 minutes') >= 30 then
    raise exception 'Thao tác quá nhiều lần, hãy thử lại sau ít phút' using errcode = 'P0001';
  end if;
  insert into public.lookup_log (user_id) values (v_uid);
  select id into v_to from public.profiles where member_no = p_member_no;
  if v_to is null then raise exception 'Không tìm thấy mã số này' using errcode = 'P0002'; end if;
  if v_to = v_uid then raise exception 'Không thể mời chính mình' using errcode = 'P0001'; end if;
  if exists (select 1 from public.board_members where board_id = p_board and user_id = v_to) then
    raise exception 'Người này đã là thành viên' using errcode = 'P0001';
  end if;
  begin
    insert into public.invitations (board_id, from_user, to_user) values (p_board, v_uid, v_to) returning id into v_id;
  exception when unique_violation then
    raise exception 'Đã mời người này, đang chờ phản hồi' using errcode = 'P0001';
  end;
  return v_id;
end $$;

-- Người nhận chấp nhận hoặc từ chối lời mời
create function public.respond_invitation(p_id bigint, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_inv public.invitations;
begin
  select * into v_inv from public.invitations where id = p_id and to_user = auth.uid() and status = 'pending' for update;
  if not found then raise exception 'Không có lời mời này' using errcode = 'P0002'; end if;
  if p_accept then
    insert into public.board_members (board_id, user_id, role) values (v_inv.board_id, v_inv.to_user, 'member')
      on conflict do nothing;
    update public.invitations set status = 'accepted', responded_at = now() where id = p_id;
  else
    update public.invitations set status = 'declined', responded_at = now() where id = p_id;
  end if;
end $$;

-- Người gửi thu hồi lời mời đang chờ
create function public.cancel_invitation(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.invitations set status = 'cancelled', responded_at = now()
   where id = p_id and from_user = auth.uid() and status = 'pending';
  if not found then raise exception 'Không có lời mời đang chờ này' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Quyền ở mức bảng (kết hợp với Row Level Security ở trên)
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon;
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.user_data, public.boards to authenticated;
grant select, delete on public.board_members to authenticated;
grant select on public.invitations to authenticated;
grant execute on function public.is_board_member(text), public.is_board_owner(text), public.shares_board_with(uuid),
                          public.find_member_by_no(bigint), public.send_invitation(text, bigint),
                          public.respond_invitation(bigint, boolean), public.cancel_invitation(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- Đồng bộ thời gian thực: web nhận thay đổi của bảng nhóm, thành viên và lời mời
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.boards, public.board_members, public.invitations;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Hàm xem lời mời (người nhận chưa là thành viên nên không đọc được bảng trực tiếp)
-- ---------------------------------------------------------------------
-- Lời mời đang chờ gửi tới tôi, kèm tên bảng và tên người mời
create function public.my_pending_invitations() returns table (id bigint, board_id text, board_name text, from_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.board_id, b.name, p.display_name, i.created_at
    from public.invitations i
    join public.boards b on b.id = i.board_id
    join public.profiles p on p.id = i.from_user
   where i.to_user = auth.uid() and i.status = 'pending'
   order by i.created_at desc;
$$;

-- Lời mời đang chờ của một bảng, dành cho chủ bảng
create function public.board_pending_invitations(p_board text) returns table (id bigint, member_no bigint, display_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, p.member_no, p.display_name, i.created_at
    from public.invitations i
    join public.profiles p on p.id = i.to_user
   where i.board_id = p_board and i.status = 'pending' and public.is_board_owner(p_board)
   order by i.created_at desc;
$$;

revoke all on function public.my_pending_invitations(), public.board_pending_invitations(text) from public, anon;
grant execute on function public.my_pending_invitations(), public.board_pending_invitations(text) to authenticated;
