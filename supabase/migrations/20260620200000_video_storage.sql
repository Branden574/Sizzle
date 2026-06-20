-- ============================================================================
-- Real video: a direct MP4 url on assets + a 'videos' storage bucket so users
-- upload an actual clip that plays back (mock provider still supplies an HLS
-- sample for seeded recipes).
-- ============================================================================
alter table public.video_assets add column mp4_url text;

insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do nothing;

create policy "videos_read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'videos');
create policy "videos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "videos_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "videos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
