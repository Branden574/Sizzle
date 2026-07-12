-- Creator insights: trends over time + best-time-to-post. Both aggregate the
-- recipe_views we already log; no new instrumentation.

-- Daily views for the creator's posts over the last N days (fills gaps with 0).
create or replace function public.creator_view_trend(uid uuid, days int default 28)
  returns table (day date, views bigint)
  language sql stable security definer set search_path to ''
as $$
  with span as (
    select generate_series((current_date - (days - 1)), current_date, interval '1 day')::date as day
  )
  select s.day, count(v.id)::bigint as views
  from span s
  left join public.recipe_views v
    on v.created_at::date = s.day
   and v.recipe_id in (select id from public.recipes where cook_id = uid)
  group by s.day
  order by s.day;
$$;

-- Best time to post: views bucketed by day-of-week (0=Sun) × hour, last 60 days.
create or replace function public.creator_best_time(uid uuid)
  returns table (dow int, hour int, views bigint)
  language sql stable security definer set search_path to ''
as $$
  select extract(dow from v.created_at)::int as dow,
         extract(hour from v.created_at)::int as hour,
         count(*)::bigint as views
  from public.recipe_views v
  where v.recipe_id in (select id from public.recipes where cook_id = uid)
    and v.created_at > now() - interval '60 days'
  group by 1, 2
  order by views desc;
$$;
