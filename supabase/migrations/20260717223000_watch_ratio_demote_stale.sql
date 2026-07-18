-- Fix: the first version of refresh_watch_ratios only UPDATEd recipes that currently have
-- >= 3 qualifying views in the trailing window. A recipe that went viral and then went cold
-- kept its old avg_watch_ratio forever — a permanent For You boost from stale data. This
-- replacement (1) recomputes for every recipe with recent views, nulling those that fell
-- below 3 samples, and (2) nulls any recipe that still carries a ratio but has no qualifying
-- views left in the window at all. No temp table, so it's safe to call repeatedly.

create or replace function public.refresh_watch_ratios(p_since timestamptz default now() - interval '30 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n1 integer;
  n2 integer;
begin
  -- 1. Recipes with recent views: set the ratio when we have >= 3 samples, else clear it.
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
  )
  update recipes r
     set avg_watch_ratio = case when agg.cnt >= 3 then round(agg.ratio, 4) else null end,
         watch_ratio_n   = case when agg.cnt >= 3 then agg.cnt else 0 end
    from agg
   where agg.recipe_id = r.id
     and (r.avg_watch_ratio is distinct from (case when agg.cnt >= 3 then round(agg.ratio, 4) else null end)
          or r.watch_ratio_n is distinct from (case when agg.cnt >= 3 then agg.cnt else 0 end));
  get diagnostics n1 = row_count;

  -- 2. Recipes that still carry a stale ratio but have NO qualifying views left in the window.
  --    Scoped to watch_ratio_n > 0 (a small set), so the correlated check is cheap.
  update recipes r
     set avg_watch_ratio = null, watch_ratio_n = 0
   where r.watch_ratio_n > 0
     and not exists (
       select 1
       from recipe_views rv
       join video_assets va on va.id = r.video_asset_id
       where rv.recipe_id = r.id
         and rv.created_at >= p_since
         and rv.dwell_ms is not null and rv.dwell_ms > 0
         and va.duration_seconds is not null and va.duration_seconds > 0
     );
  get diagnostics n2 = row_count;

  return n1 + n2;
end;
$$;

revoke all on function public.refresh_watch_ratios(timestamptz) from public, anon, authenticated;
