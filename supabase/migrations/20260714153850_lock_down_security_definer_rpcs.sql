-- SECURITY: SECURITY DEFINER functions were callable via PostgREST RPC
-- (/rest/v1/rpc/<fn>) by the public anon key and any signed-in user — exposing
-- ANY creator's private revenue/analytics (creator_*), goal tampering (bump_goal),
-- cross-user save IDOR + count skew (toggle_save uses a passed p_user, not
-- auth.uid()), and rate-limit/counter pokes. They are only called by the API via
-- service_role and by DB triggers; the client makes zero direct .rpc() calls.
-- Postgres grants function EXECUTE to PUBLIC by default, so revoke from PUBLIC and
-- re-grant only service_role. Matches the already-correct toggle_comment_like.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.toggle_save(uuid, uuid)',
    'public.bump_goal(uuid, integer)',
    'public.bump_cook_count()',
    'public.apply_verification_milestone()',
    'public.creator_revenue_by_post(uuid)',
    'public.creator_view_stats(uuid)',
    'public.creator_top_supporters(uuid)',
    'public.creator_unlock_funnel(uuid)',
    'public.creator_view_trend(uuid, integer)',
    'public.creator_best_time(uuid)',
    'public.increment_send(uuid)',
    'public.increment_share(uuid)',
    'public.rate_limit_hit(text, integer, integer)',
    'public.handle_available(text)',
    'public.handle_new_user()'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
