-- Watch-ratio quality signal for For You ranking.
--
-- The strongest content-quality proxy is how much of a video people actually watch.
-- We denormalize an aggregate watch-ratio onto recipes (recomputed by a cron) rather
-- than aggregating recipe_views ⋈ video_assets live on every feed request.
--
--   avg_watch_ratio = avg over recent views of  min(1, dwell_ms / (duration_seconds*1000))
--   watch_ratio_n   = sample size behind that average (only trusted at >= 3)

alter table public.recipes
  add column if not exists avg_watch_ratio numeric,
  add column if not exists watch_ratio_n integer not null default 0;

-- The rollup scans recent views by time, joining each to its recipe's duration.
create index if not exists idx_recipe_views_created_at on public.recipe_views (created_at);

/**
 * refresh_watch_ratios(p_since) — recompute avg_watch_ratio for every recipe viewed
 * since p_since. Bounded by the created_at index; only recipes with >= 3 qualifying
 * views (real dwell + a known duration) are updated, so a single fluke view can't set
 * a ratio. Returns the number of recipes updated. Called by the internal cron.
 */
create or replace function public.refresh_watch_ratios(p_since timestamptz default now() - interval '30 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with agg as (
    select rv.recipe_id,
           avg(least(1.0, rv.dwell_ms::numeric / (va.duration_seconds * 1000.0))) as ratio,
           count(*) as cnt
    from recipe_views rv
    join recipes r on r.id = rv.recipe_id
    join video_assets va on va.id = r.video_asset_id
    where rv.created_at >= p_since
      and rv.dwell_ms is not null and rv.dwell_ms > 0
      and va.duration_seconds is not null and va.duration_seconds > 0
    group by rv.recipe_id
    having count(*) >= 3
  )
  update recipes r
     set avg_watch_ratio = round(agg.ratio, 4),
         watch_ratio_n   = agg.cnt
    from agg
   where agg.recipe_id = r.id
     and (r.avg_watch_ratio is distinct from round(agg.ratio, 4) or r.watch_ratio_n is distinct from agg.cnt);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Callable only by the service role (the cron); never exposed to anon/authenticated.
revoke all on function public.refresh_watch_ratios(timestamptz) from public, anon, authenticated;
