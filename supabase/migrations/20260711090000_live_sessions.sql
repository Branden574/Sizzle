-- Creator feature: live cooking sessions. A creator goes live; fans watch in real
-- time. Mock provider returns a sample HLS playback URL (same mock pattern as the
-- video stream provider); real Cloudflare Stream Live Inputs wire up behind keys.
create table if not exists public.live_sessions (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references public.profiles (id) on delete cascade,
  title        text not null,
  status       text not null default 'live' check (status in ('live', 'ended')),
  playback_url text,
  viewer_count int  not null default 0,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz
);
-- At most one live session per creator at a time.
create unique index if not exists live_sessions_one_live_per_creator on public.live_sessions (creator_id) where status = 'live';
create index if not exists live_sessions_live_idx on public.live_sessions (started_at desc) where status = 'live';

alter table public.live_sessions enable row level security;
revoke all on public.live_sessions from anon, authenticated;
