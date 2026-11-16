-- =====================================================================
-- Kanban Board - nhắc việc qua email (Sprint 5)
-- Cách chạy: Supabase > SQL Editor > New query > dán toàn bộ file này > Run.
-- Chạy SAU schema.sql. Có thể chạy lại nhiều lần mà không hỏng dữ liệu.
--
-- Cách hoạt động: mỗi người bật nhắc email trong Cài đặt (bảng email_reminders). Cứ 5 phút, pg_cron gọi Edge Function
-- send-reminders; hàm đọc các việc sắp đến hạn của những người đã bật và gửi email qua SMTP. Bảng email_reminder_log ghi nhớ
-- thư đã gửi để không gửi lặp. Phần lên lịch (pg_cron) nằm ở cuối file, cần bật pg_cron và pg_net trước.
-- =====================================================================

-- Cài đặt của từng người: bật/tắt và nhắc trước bao nhiêu phút (30 và/hoặc 60)
create table if not exists public.email_reminders (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  enabled    boolean not null default false,
  leads      int[] not null default '{30}'
             check (cardinality(leads) between 1 and 2 and leads <@ array[30, 60]),
  updated_at timestamptz not null default now()
);
alter table public.email_reminders enable row level security;
drop policy if exists email_reminders_own on public.email_reminders;
create policy email_reminders_own on public.email_reminders for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Nhật ký thư đã gửi (chỉ máy chủ ghi và đọc; người dùng không truy cập được)
create table if not exists public.email_reminder_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_key text not null,
  due      text not null,
  lead     int  not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, task_key, due, lead)
);
create index if not exists email_reminder_log_sent_at on public.email_reminder_log (sent_at);
alter table public.email_reminder_log enable row level security;

-- Danh sách người đã bật nhắc kèm email đăng nhập (chỉ service_role gọi được)
create or replace function public.reminder_targets() returns table (user_id uuid, email text, name text, leads int[])
language sql stable security definer set search_path = public as $$
  select e.user_id, u.email::text, p.display_name, e.leads
    from public.email_reminders e
    join auth.users u on u.id = e.user_id
    join public.profiles p on p.id = e.user_id
   where e.enabled and u.email is not null and u.email <> '';
$$;

revoke all on public.email_reminders, public.email_reminder_log from anon, authenticated;
grant select, insert, update, delete on public.email_reminders to authenticated;
revoke all on function public.reminder_targets() from public, anon, authenticated;
grant execute on function public.reminder_targets() to service_role;
grant select, insert, update, delete on public.email_reminders, public.email_reminder_log to service_role;

-- ---------------------------------------------------------------------
-- LÊN LỊCH (làm sau khi đã deploy hàm send-reminders và đặt secret CRON_SECRET)
-- 1) Database > Extensions: bật pg_cron và pg_net.
-- 2) Thay <MÃ_DỰ_ÁN> (phần trước .supabase.co) và <CRON_SECRET> (đúng giá trị đã đặt trong Secrets) rồi chạy hai lệnh dưới
--    (bỏ dấu -- ở đầu dòng). Chạy lại lệnh cron.schedule với cùng tên sẽ cập nhật lịch cũ.
--
-- select cron.schedule('kanban-email-reminders', '*/5 * * * *', $job$
--   select net.http_post(
--     url     := 'https://<MÃ_DỰ_ÁN>.supabase.co/functions/v1/send-reminders',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
--     body    := '{}'::jsonb);
-- $job$);
--
-- select cron.schedule('kanban-email-log-cleanup', '0 3 * * *',
--   $job$ delete from public.email_reminder_log where sent_at < now() - interval '30 days' $job$);
--
-- Xem lịch sử chạy: select * from cron.job_run_details order by start_time desc limit 10;
-- Gỡ lịch:          select cron.unschedule('kanban-email-reminders');
-- ---------------------------------------------------------------------
