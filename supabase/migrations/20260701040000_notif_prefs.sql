-- Per-type push preferences. Missing keys default to on (opted in). Only the
-- social types are user-controllable; account/moderation pushes always send.
alter table public.profiles add column if not exists notif_prefs jsonb not null default '{}'::jsonb;
