-- Admin passphrase: a second factor gating every admin action, on top of the
-- role check. Design hardened per adversarial review:
--   * Secrets live in DEDICATED tables, never on the PostgREST-exposed profiles
--     table (which has a documented column-leak history). RLS is ENABLED with
--     ZERO policies => deny-all to anon/authenticated; only the service role
--     (supabaseAdmin, bypasses RLS) ever reads them. `revoke all` is belt-and-
--     suspenders on top of the RLS deny.
--   * scrypt runs ONCE, at /admin/unlock — never per mutation (that would be a
--     self-inflicted CPU-DoS on serverless). Unlock mints a short-lived opaque
--     token; per-mutation checks are a single indexed lookup of its SHA-256.
--   * Brute force is bounded by a DB-atomic lockout (fail_count + locked_until)
--     checked BEFORE scrypt, so failed guesses can't be used as a CPU oracle.

-- One credential row per admin (the scrypt hash is self-describing: it carries
-- its own params + salt). fail_count/locked_until drive the lockout.
create table if not exists public.admin_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  pass_hash text not null,
  fail_count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.admin_credentials enable row level security;
-- No policies at all => PostgREST/anon/authenticated get nothing. Only service_role reads.
revoke all on public.admin_credentials from anon, authenticated;

-- Live unlock sessions. We store ONLY sha256(token); the raw token is returned
-- to the client once and held in memory. Short TTL bounds replay; deleting a
-- user's rows on passphrase change gives instant revocation.
create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_sha256 text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_sessions_lookup on public.admin_sessions (user_id, token_sha256);
create index if not exists admin_sessions_expires on public.admin_sessions (expires_at);
alter table public.admin_sessions enable row level security;
revoke all on public.admin_sessions from anon, authenticated;
