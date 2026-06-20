-- ============================================================================
-- SECURITY: lock down which profile columns an authenticated user may write.
--
-- profiles_update_self RLS only checks row ownership (column-blind), and the
-- privileged-field guard trigger was bypassable via trigger ordering (the guard
-- runs before the follower-milestone trigger, so writing your own
-- follower_count let the milestone trigger grant you a verified badge). Column
-- GRANTs are the robust fix: enumerate the editable columns and revoke the rest.
-- Service-role (the API) is unaffected and still moves counters/role/verification.
-- ============================================================================
revoke update on public.profiles from authenticated;
grant update (display_name, handle, bio, avatar_url, banner_url, phone, tastes)
  on public.profiles to authenticated;
