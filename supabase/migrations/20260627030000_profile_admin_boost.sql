-- Admin "boost" lever: a per-creator ranking multiplier folded into the For You
-- score as one more signal (0 = none). Kept small/bounded so a boosted creator
-- rises naturally instead of pinning to the top. See apps/api/src/services/ranking.ts.
alter table public.profiles add column if not exists boost real not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_boost_range') then
    alter table public.profiles add constraint profiles_boost_range check (boost >= 0 and boost <= 3);
  end if;
end $$;
