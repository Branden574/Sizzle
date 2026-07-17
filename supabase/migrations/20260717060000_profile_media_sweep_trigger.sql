-- REVIEW FIX (CRITICAL): DELETE /me enqueued the whole-account storage sweep
-- BEFORE auth.admin.deleteUser — if deleteUser then failed (GoTrue 5xx/timeout),
-- the queue row survived and the cron destroyed a still-live user's avatars,
-- banners, photo posts, and source clips within a minute. The enqueue must be
-- TRANSACTIONAL with the account deletion: a BEFORE DELETE trigger on profiles
-- fires inside the auth.users cascade — if the deletion rolls back, so does the
-- queue row. (Same pattern as the video_assets trigger.)

create or replace function public.enqueue_profile_media_sweep()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.pending_media_deletions (storage_prefix, reason)
  values (old.id::text, 'account_delete');
  return old;
end;
$$;

drop trigger if exists profiles_enqueue_media_sweep on public.profiles;
create trigger profiles_enqueue_media_sweep
  before delete on public.profiles
  for each row execute function public.enqueue_profile_media_sweep();

-- The ban purge's explicit enqueue is now redundant (the profiles trigger fires
-- inside its transaction too) — restore the function to its pre-queue shape.
create or replace function public.purge_expired_accounts()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  n integer := 0;
  rec record;
begin
  for rec in
    select u.id
    from auth.users u
    join public.profiles p on p.id = u.id
    where p.banned = true and p.delete_at is not null and p.delete_at < now()
  loop
    perform public.cleanup_user_counters(rec.id);
    delete from auth.users where id = rec.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
