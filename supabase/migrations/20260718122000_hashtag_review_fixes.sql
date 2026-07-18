-- Adversarial-review fixes for the hashtag system (idempotent):
--  1. Public read policy also excludes is_sensitive, so the RLS boundary matches the API filters
--     and doesn't depend on app code always pairing is_sensitive with a non-active status.
--  2. The trend engine excludes premium (priced) + subscribers-only posts — revenue must not drive
--     public trends.
-- (The originating migration files are also corrected for fresh applies; this re-applies the same
--  changes to already-migrated databases. Both statements are safe to run repeatedly.)

drop policy if exists hashtags_public_read on public.hashtags;
create policy hashtags_public_read on public.hashtags for select
  to anon, authenticated using (status = 'active' and not is_blocked and not is_sensitive);

create or replace function public.refresh_hashtag_trends()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with base as (
    select ch.hashtag_id, r.created_at, r.cook_id,
           r.like_count, r.save_count, r.share_count, r.comment_count, r.view_count
    from content_hashtags ch
    join recipes r on r.id = ch.recipe_id
    where r.status = 'published' and coalesce(r.auto_hidden, false) = false
      and r.price_cents is null and (r.visibility is null or r.visibility <> 'subscribers')
  ),
  agg as (
    select b.hashtag_id,
      count(*) filter (where b.created_at >= now() - interval '24 hours') as posts_24h,
      count(distinct b.cook_id) filter (where b.created_at >= now() - interval '24 hours') as creators_24h,
      coalesce(sum(b.like_count + 2*b.save_count + b.share_count + b.comment_count)
               filter (where b.created_at >= now() - interval '24 hours'), 0) as eng_24h,
      coalesce(sum(b.view_count) filter (where b.created_at >= now() - interval '24 hours'), 0) as views_24h,
      count(*) filter (where b.created_at >= now() - interval '7 days') as posts_7d,
      count(distinct b.cook_id) filter (where b.created_at >= now() - interval '7 days') as creators_7d,
      count(*) filter (where b.created_at < now() - interval '24 hours'
                       and b.created_at >= now() - interval '8 days') as posts_prev7d
    from base b group by b.hashtag_id
  )
  insert into hashtag_metrics (hashtag_id, time_window, posts_created, unique_creators,
                               qualified_views, likes, trend_score, fraud_adjusted_score, updated_at)
  select a.hashtag_id, '24h', a.posts_24h, a.creators_24h, a.views_24h, a.eng_24h,
    round(
      (a.eng_24h + a.posts_24h * 3.0) * least(a.creators_24h, 20) / 20.0
      * (case when a.posts_prev7d > 0 then least(3.0, a.posts_24h::numeric / (a.posts_prev7d / 7.0 + 0.5)) else 1.0 end)
      / (1 + greatest(0, a.posts_24h - a.creators_24h) * 0.5)
    , 3),
    round(least(a.creators_24h, 20) / 20.0, 3), now()
  from agg a
  union all
  select a.hashtag_id, '7d', a.posts_7d, a.creators_7d, 0, 0,
    round(a.posts_7d * least(a.creators_7d, 20) / 20.0, 3), 0, now()
  from agg a
  on conflict (hashtag_id, time_window) do update set
    posts_created = excluded.posts_created, unique_creators = excluded.unique_creators,
    qualified_views = excluded.qualified_views, likes = excluded.likes,
    trend_score = excluded.trend_score, fraud_adjusted_score = excluded.fraud_adjusted_score, updated_at = now();
  get diagnostics n = row_count;

  insert into hashtag_trend_snapshots (hashtag_id, time_window, scope, trend_score, rank, ranking_version)
  select hashtag_id, '24h', 'global', trend_score,
         row_number() over (order by trend_score desc), 'v1'
  from hashtag_metrics where time_window = '24h' and trend_score > 0
  order by trend_score desc limit 50;
  return n;
end $$;
revoke all on function public.refresh_hashtag_trends() from public, anon, authenticated;
