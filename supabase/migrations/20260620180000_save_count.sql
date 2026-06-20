-- ============================================================================
-- Denormalized save count on recipes (so the Save action shows a number too).
-- ============================================================================
alter table public.recipes add column save_count integer not null default 0;

create or replace function public.adjust_save_count(rid uuid, delta int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.recipes set save_count = greatest(0, save_count + delta) where id = rid;
$$;
revoke execute on function public.adjust_save_count(uuid, int) from public, anon, authenticated;
grant execute on function public.adjust_save_count(uuid, int) to service_role;
