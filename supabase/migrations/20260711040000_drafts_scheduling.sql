-- Creator feature #5: drafts + scheduled publishing. status already allowed
-- 'draft'; add 'scheduled' + a scheduled_at time. A cron flips due rows to
-- published. The feed already filters status='published', so draft/scheduled
-- rows stay hidden from everyone but their owner automatically.
alter table public.recipes drop constraint if exists recipes_status_check;
alter table public.recipes
  add constraint recipes_status_check check (status in ('draft', 'scheduled', 'published', 'removed'));
alter table public.recipes add column if not exists scheduled_at timestamptz;
create index if not exists recipes_scheduled_idx on public.recipes (scheduled_at) where status = 'scheduled';
