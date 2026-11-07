-- =====================================================================
-- Kanban Board - cuộc họp nhóm: khung giờ bận (Sprint 5)
-- Cách chạy: Supabase > SQL Editor > New query > dán toàn bộ file này > Run.
-- Chạy SAU file schema.sql. Có thể chạy lại nhiều lần mà không hỏng dữ liệu.
--
-- Cuộc họp được lưu ngay trong dữ liệu của bảng nhóm (boards.data -> meetings) nên không cần bảng riêng.
-- File này chỉ thêm "khung giờ bận" để kiểm tra trùng lịch giữa các thành viên:
--  - Mỗi người tự đẩy lên danh sách khoảng giờ bận của mình (chỉ giờ bắt đầu, giờ kết thúc và loại:
--    lịch cố định / cuộc họp / việc đến hạn). KHÔNG kèm tên việc hay nội dung.
--  - Người khác không đọc được bảng này trực tiếp; chỉ gọi được hàm board_busy(bảng) và chỉ khi cùng là
--    thành viên của bảng đó, và chỉ thấy khung giờ của các thành viên trong bảng đó.
-- =====================================================================

create table if not exists public.busy_slots (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  slots      jsonb not null default '[]'::jsonb
             check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) <= 3000),
  updated_at timestamptz not null default now()
);

alter table public.busy_slots enable row level security;

drop policy if exists busy_own on public.busy_slots;
create policy busy_own on public.busy_slots for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Khung giờ bận của các thành viên trong một bảng nhóm (chỉ thành viên của bảng mới gọi được)
create or replace function public.board_busy(p_board text) returns table (user_id uuid, slots jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.user_id, s.slots, s.updated_at
    from public.busy_slots s
    join public.board_members m on m.user_id = s.user_id and m.board_id = p_board
   where public.is_board_member(p_board);
$$;

revoke all on public.busy_slots from anon, authenticated;
grant select, insert, update, delete on public.busy_slots to authenticated;
revoke all on function public.board_busy(text) from public, anon;
grant execute on function public.board_busy(text) to authenticated;
