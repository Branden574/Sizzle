-- MEDIUM — the API's rate limiter was an in-memory Map, which resets on every
-- Vercel serverless cold start, so limits barely applied (worst for the
-- unauthenticated /support intake). Back it with a durable Postgres counter.

create table if not exists public.rate_limits (
  bucket       text   not null,           -- "<name>:<userId-or-ip>"
  window_start bigint not null,           -- epoch seconds at the window boundary
  count        int    not null default 0,
  primary key (bucket, window_start)
);

-- Service-role only (the API calls the RPC below via service role). Deny anon.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Atomic fixed-window hit: bumps the current window's counter and returns whether
-- the request is still within p_max. SECURITY DEFINER so it runs regardless of RLS.
create or replace function public.rate_limit_hit(p_key text, p_window_seconds int, p_max int)
  returns boolean
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  w bigint := (floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)::bigint;
  c int;
begin
  insert into public.rate_limits (bucket, window_start, count)
    values (p_key, w, 1)
  on conflict (bucket, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into c;

  -- Opportunistic, cheap cleanup of windows older than a day (~0.5% of calls).
  if random() < 0.005 then
    delete from public.rate_limits
      where window_start < (extract(epoch from now())::bigint - 86400);
  end if;

  return c <= p_max;
end;
$$;
