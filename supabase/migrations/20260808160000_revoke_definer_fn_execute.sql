-- Security: the two media-cleanup SECURITY DEFINER trigger functions were
-- executable by anon + authenticated via PostgREST (/rest/v1/rpc/...) — flagged
-- by the Supabase security advisors (2026-08-08 security sweep). They are
-- trigger-invoked only; no client has any business calling them. Revoke all
-- public execution (default function grants include PUBLIC — revoke that too).
revoke execute on function public.enqueue_profile_media_sweep() from public, anon, authenticated;
revoke execute on function public.enqueue_video_asset_media_deletion() from public, anon, authenticated;
