-- Block: mutual invisibility. The blocker and the blocked can't see each other's
-- content or profiles, can't follow/comment/DM. One row per (blocker, blocked).
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
-- Reverse lookup: "who blocked me" (for the both-directions hidden set).
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- Mute: one-directional + silent. The muter stops seeing the muted user's posts
-- in their feed; no unfollow, the muted user is never told.
create table if not exists public.user_mutes (
  muter_id uuid not null references public.profiles(id) on delete cascade,
  muted_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

alter table public.user_blocks enable row level security;
alter table public.user_mutes enable row level security;
-- All access is through the service-role API; no direct client policies (deny by default).
