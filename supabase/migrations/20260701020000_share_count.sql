-- Atomic share-count bump. The share_count was displayed on every card but never
-- incremented (no endpoint existed). POST /recipes/:id/share calls this.
create or replace function public.increment_share(rid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.recipes set share_count = share_count + 1 where id = rid;
$$;
revoke execute on function public.increment_share(uuid) from public, anon;
grant execute on function public.increment_share(uuid) to authenticated, service_role;
