-- ============================================================================
-- Data integrity + indexing.
--
-- 1) Case-insensitive unique handles. The original `handle text not null unique`
--    is case-SENSITIVE, so "Chef" and "chef" could both exist. Add a functional
--    unique index on lower(handle) (stricter; subsumes the old constraint) which
--    also makes case-insensitive @handle lookups index-backed.
-- 2) Index the unindexed foreign keys so parent-row deletes/cascades (profile
--    purge, recipe removal) don't sequentially scan these child tables, and
--    common lookups stay fast.
-- ============================================================================
create unique index if not exists profiles_handle_lower_key on public.profiles (lower(handle));

-- Unindexed FKs (force seq scans on cascade today):
create index if not exists notifications_actor_idx        on public.notifications (actor_id);
create index if not exists notifications_recipe_idx       on public.notifications (recipe_id);
create index if not exists reports_reporter_idx           on public.reports (reporter_id);
create index if not exists reports_resolved_by_idx        on public.reports (resolved_by);
create index if not exists moderation_log_admin_idx       on public.moderation_log (admin_id);
create index if not exists moderation_log_target_user_idx on public.moderation_log (target_user_id);
create index if not exists moderation_log_target_recipe_idx on public.moderation_log (target_recipe_id);

-- Status filtering outside the published-feed partial index (admin/owner views):
create index if not exists recipes_status_idx on public.recipes (status);
