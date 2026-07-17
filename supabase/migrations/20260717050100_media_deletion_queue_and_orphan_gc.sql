-- MEDIA LIFECYCLE (2026-07-16 architecture audit, fixes C1 + H2):
-- Deleting an account (DELETE /me or the ban purge) cascade-deleted video_assets
-- rows WITHOUT tearing down the Cloudflare Stream asset or the Supabase Storage
-- blobs — deleted users' videos stayed live and playable forever, with no record
-- left to ever reconcile them. And a partially-failed post left a transcoded
-- Cloudflare asset with no recipe and no GC.
--
-- Mechanism: a BEFORE DELETE trigger on video_assets snapshots the media refs
-- into pending_media_deletions, so EVERY deletion path (account cascade, ban
-- purge, recipe delete, orphan GC, admin) is covered by one queue. The finalize
-- cron drains it (Cloudflare delete + storage remove need HTTP, which SQL can't
-- do). Account deletion also enqueues a storage-prefix sweep for the user's
-- whole folder (covers photo posts / avatars / banners not tracked by assets).

-- 1) The queue. Service-role only — clients must never see or touch it.
create table if not exists public.pending_media_deletions (
  id uuid primary key default gen_random_uuid(),
  provider text,
  provider_uid text,
  source_url text,
  mp4_url text,
  poster_url text,
  storage_prefix text, -- user folder to sweep across buckets (account deletion)
  reason text not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.pending_media_deletions enable row level security;
revoke all on public.pending_media_deletions from anon, authenticated;
create index if not exists pending_media_deletions_created_idx
  on public.pending_media_deletions (created_at);

-- 2) Snapshot media refs whenever a video_assets row is deleted, BEFORE the row
--    (and with it the only copy of provider_uid) is gone.
create or replace function public.enqueue_video_asset_media_deletion()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if old.provider_uid is not null or old.source_url is not null
     or old.mp4_url is not null or old.poster_url is not null then
    insert into public.pending_media_deletions
      (provider, provider_uid, source_url, mp4_url, poster_url, reason)
    values
      (old.provider, old.provider_uid, old.source_url, old.mp4_url, old.poster_url, 'asset_row_deleted');
  end if;
  return old;
end;
$$;

drop trigger if exists video_assets_enqueue_media_deletion on public.video_assets;
create trigger video_assets_enqueue_media_deletion
  before delete on public.video_assets
  for each row execute function public.enqueue_video_asset_media_deletion();

-- 3) Ban purge: enqueue the user's whole storage folder before deleting the auth
--    user (the video_assets cascade then fires the trigger for Cloudflare UIDs).
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
    insert into public.pending_media_deletions (storage_prefix, reason)
    values (rec.id::text, 'ban_purge');
    delete from auth.users where id = rec.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 4) Orphan GC: delete video_assets older than the cutoff that no recipe (draft,
--    scheduled, or published) references — the trigger enqueues their media. Runs
--    from the finalize cron with a bounded batch.
create or replace function public.gc_orphan_video_assets(cutoff timestamptz, max_rows integer)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  n integer := 0;
begin
  with victims as (
    select va.id
    from public.video_assets va
    where va.created_at < cutoff
      and not exists (select 1 from public.recipes r where r.video_asset_id = va.id)
    order by va.created_at
    limit max_rows
  )
  delete from public.video_assets va
  using victims v
  where va.id = v.id;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.gc_orphan_video_assets(timestamptz, integer) from public, anon, authenticated;
