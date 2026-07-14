-- SECURITY (defense-in-depth): profiles still granted broad INSERT/UPDATE to anon
-- and INSERT to authenticated on ALL columns. Inert today (RLS has no INSERT policy
-- and no anon UPDATE policy) but a footgun the moment such a policy is added.
-- Signup inserts run through the SECURITY DEFINER handle_new_user trigger; profile
-- edits go through the API (service_role). So no client INSERT grant is needed.
revoke insert, update on public.profiles from anon;
revoke insert on public.profiles from authenticated;
alter function public.guard_profile_privileged() set search_path = '';
