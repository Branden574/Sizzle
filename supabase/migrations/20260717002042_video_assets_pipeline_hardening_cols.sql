-- Columns supporting the 2026-07-16 video-pipeline hardening:
--   source_url         raw uploaded clip URL — lets the finalize cron re-ingest
--                      into Cloudflare after a /copy failure (instead of publishing
--                      raw HEVC), and lets deletion remove the source object.
--   last_polled_at     poll-collapse: the status endpoint + cron skip the live
--                      Cloudflare API call when the row was refreshed in the last
--                      few seconds, decoupling readiness from CF's account-wide
--                      1,200 req/5min budget (the #1 launch-night bottleneck).
--   moderation_attempts bounded fail-closed retry: when image moderation can't be
--                      reached we defer publish and retry; after a cap we publish +
--                      flag for admin review so a provider outage can't wedge a post.
alter table public.video_assets
  add column if not exists source_url text,
  add column if not exists last_polled_at timestamptz,
  add column if not exists moderation_attempts integer not null default 0;
