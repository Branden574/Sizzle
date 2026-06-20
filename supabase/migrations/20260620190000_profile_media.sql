-- ============================================================================
-- Profile media (avatar/banner image uploads) + signup fields (phone).
-- ============================================================================
alter table public.profiles add column phone text;
alter table public.profiles add column banner_url text;

-- Recreate the signup trigger to also capture display_name + phone from metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_handle text;
begin
  base_handle := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  if base_handle = '' then base_handle := 'cook'; end if;

  insert into public.profiles (id, handle, display_name, phone)
  values (
    new.id,
    base_handle || substr(replace(new.id::text, '-', ''), 1, 4),
    coalesce(new.raw_user_meta_data ->> 'display_name', initcap(base_handle)),
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$;

-- ── Storage buckets for avatars + banners (public read; owner-scoped writes) ──
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('banners', 'banners', true)
on conflict (id) do nothing;

create policy "profile_media_read" on storage.objects
  for select to anon, authenticated using (bucket_id in ('avatars', 'banners'));
create policy "profile_media_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('avatars', 'banners') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "profile_media_update_own" on storage.objects
  for update to authenticated
  using (bucket_id in ('avatars', 'banners') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "profile_media_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id in ('avatars', 'banners') and (storage.foldername(name))[1] = (select auth.uid())::text);
