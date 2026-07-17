-- Event-table retention. recipe_views + recipe_impressions grow unboundedly
-- (~25-50M rows/month projected at target DAU) with no rollup or TTL, and the
-- ranker only ever reads the newest ~200 rows per user — so old rows are pure
-- storage/DB-size cost. Prune nightly. Views kept 90d (creator analytics window),
-- impressions kept 30d (recommender only needs recent seen-state).

create or replace function public.purge_old_engagement_events()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_views bigint;
  v_impr  bigint;
begin
  delete from public.recipe_views       where created_at < now() - interval '90 days';
  get diagnostics v_views = row_count;
  delete from public.recipe_impressions where served_at  < now() - interval '30 days';
  get diagnostics v_impr = row_count;
  return jsonb_build_object('views_deleted', v_views, 'impressions_deleted', v_impr);
end;
$$;

revoke execute on function public.purge_old_engagement_events() from public, anon, authenticated;
grant execute on function public.purge_old_engagement_events() to service_role;

-- Nightly at 03:30 UTC (offset from the account-purge job).
select cron.schedule('sizzle-purge-engagement', '30 3 * * *', $$select public.purge_old_engagement_events();$$);
