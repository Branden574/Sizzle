-- Atomic failed-attempt counter for the admin passphrase lockout. Doing the
-- increment + locked_until in ONE statement closes the read-modify-write race
-- where parallel guesses all read the same stale fail_count and never trip the
-- lockout. Backoff: <5 free, then 30s,60s,120s… capped at 1h.
create or replace function public.admin_register_fail(uid uuid)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.admin_credentials
     set fail_count = fail_count + 1,
         locked_until = case
           when fail_count + 1 >= 5
             then now() + make_interval(secs => least(3600, (2 ^ ((fail_count + 1) - 5)) * 30))
           else null
         end
   where user_id = uid;
$$;
revoke execute on function public.admin_register_fail(uuid) from public, anon, authenticated;
grant execute on function public.admin_register_fail(uuid) to service_role;
