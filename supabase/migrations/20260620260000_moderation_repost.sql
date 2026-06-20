-- ============================================================================
-- Moderation lifecycle (removal reasons + appeals + restore), ban→delete
-- lifecycle (45-day timer + auto-purge), and the repost feature.
-- ============================================================================

-- ── Recipe removal + appeal ──────────────────────────────────────────────────
alter table public.recipes add column removal_reason text;
alter table public.recipes add column removed_at timestamptz;
alter table public.recipes add column appeal_status text not null default 'none'
  check (appeal_status in ('none', 'pending', 'denied'));
alter table public.recipes add column appeal_text text;
alter table public.recipes add column appealed_at timestamptz;

-- ── Ban → delete lifecycle ───────────────────────────────────────────────────
-- A ban is immediate (banned=true); the account is hard-wiped 45 days later
-- unless restored. delete_at drives both the admin countdown and the purge job.
alter table public.profiles add column delete_at timestamptz;
alter table public.profiles add column ban_appeal_text text;
alter table public.profiles add column ban_appeal_at timestamptz;
alter table public.profiles add column ban_appeal_status text not null default 'none'
  check (ban_appeal_status in ('none', 'pending', 'denied'));
-- Editable column lock (20260620250000) means we re-grant nothing here; ban
-- fields move only via the service role.

-- ── Reposts (TikTok-style; visibility enforced in the API by mutual-follow) ──
create table public.reposts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  comment    text check (comment is null or char_length(comment) <= 600),
  created_at timestamptz not null default now(),
  unique (user_id, recipe_id)
);
create index reposts_user_idx on public.reposts (user_id, created_at desc);
create index reposts_recipe_idx on public.reposts (recipe_id);

alter table public.reposts enable row level security;
create policy reposts_insert_self on public.reposts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy reposts_delete_own on public.reposts
  for delete to authenticated using (user_id = (select auth.uid()));
create policy reposts_select_own on public.reposts
  for select to authenticated using (user_id = (select auth.uid()));
grant select, insert, delete on public.reposts to authenticated;

-- ── Notification kinds: repost + moderation events ───────────────────────────
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'like', 'comment', 'verified', 'repost', 'removed', 'restored', 'banned'));

-- ── Auto-purge expired bans (full account wipe; cascades via profiles fk) ────
create or replace function public.purge_expired_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  with del as (
    delete from auth.users u
    using public.profiles p
    where p.id = u.id
      and p.banned = true
      and p.delete_at is not null
      and p.delete_at < now()
    returning u.id
  )
  select count(*) into n from del;
  return n;
end;
$$;
revoke execute on function public.purge_expired_accounts() from public, anon, authenticated;
grant execute on function public.purge_expired_accounts() to service_role;

-- Schedule a daily purge if pg_cron is available; otherwise it must be run
-- externally (or via the admin "run purge" action). Guarded so the migration
-- never fails when pg_cron isn't in shared_preload_libraries.
do $$
begin
  execute 'create extension if not exists pg_cron';
  perform cron.schedule('sizzle-purge-expired', '0 3 * * *', 'select public.purge_expired_accounts()');
exception when others then
  raise notice 'pg_cron unavailable (%); schedule purge_expired_accounts() externally', sqlerrm;
end $$;
