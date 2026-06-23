-- Device push-notification tokens. One row per (user, device token); a token is
-- globally unique (it identifies a device install), so re-registering upserts.
-- Inserts/reads happen server-side via the service role; RLS is on with no
-- public policies so only trusted server code touches it.
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null default 'ios',
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

-- Only trusted server code (service role) touches this table; RLS-on with no
-- policies blocks anon/authenticated regardless of grants. Grant the service
-- role DML explicitly so the table works without relying on environment default
-- privileges (hosted Supabase sets these automatically; a bare local stack may
-- not).
grant select, insert, update, delete on public.push_tokens to service_role;

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- Per-user master switch for push (mirrors the in-app Settings toggle).
alter table public.profiles
  add column if not exists push_enabled boolean not null default true;

-- push_enabled is a user-owned preference, so add it to the authenticated
-- column-level UPDATE allow-list (see 20260620250000_profile_column_lock — only
-- enumerated columns are writable; role/verification/counters stay server-only).
-- GRANT is additive, so this doesn't disturb the existing allow-list.
grant update (push_enabled) on public.profiles to authenticated;
