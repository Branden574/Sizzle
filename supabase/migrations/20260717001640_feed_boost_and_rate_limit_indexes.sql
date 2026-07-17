-- Two small indexes for hot paths flagged by the 2026-07-16 scale audit.

-- 1. feed.ts runs `from('profiles').select('id, boost').gt('boost', 0)` on EVERY
--    authed For You request. With no index this is a full profiles seq scan.
--    Partial index over the tiny boosted set → index-only scan.
create index if not exists profiles_boosted_idx
  on public.profiles (id, boost)
  where boost > 0;

-- 2. rate_limit_hit() prunes old windows with
--    `delete from rate_limits where window_start < (now - 86400)` on ~0.5% of
--    every rate-limited request. The PK is (bucket, window_start); a
--    window_start-only predicate can't use it, so this is a full seq scan of a
--    table that grows with traffic. Index the prune predicate.
create index if not exists rate_limits_window_start_idx
  on public.rate_limits (window_start);
