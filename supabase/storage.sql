-- =====================================================================
-- File đính kèm trên Supabase Storage (chạy SAU schema.sql)
-- Đường dẫn file: <mã người dùng>/<mã file> (bảng cá nhân) hoặc <mã bảng nhóm>/<mã file> (bảng nhóm)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)      -- tối đa 10 MB mỗi file, không công khai
on conflict (id) do update set file_size_limit = 10485760, public = false;

create policy attachments_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_board_member((storage.foldername(name))[1])));
create policy attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_board_member((storage.foldername(name))[1])));
create policy attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_board_member((storage.foldername(name))[1])));
