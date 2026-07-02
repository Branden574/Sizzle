-- Lifetime earnings totals over ALL succeeded tips (the dashboard was summing
-- only the newest 100, so 'You've earned' capped after tip #100).
create or replace function public.creator_earnings(uid uuid)
returns table (gross_cents bigint, fee_cents bigint, net_cents bigint, tip_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount_cents), 0)::bigint,
         coalesce(sum(fee_cents), 0)::bigint,
         coalesce(sum(net_cents), 0)::bigint,
         count(*)::bigint
  from public.tips
  where creator_id = uid and status = 'succeeded';
$$;
revoke execute on function public.creator_earnings(uuid) from public, anon, authenticated;
grant execute on function public.creator_earnings(uuid) to service_role;
