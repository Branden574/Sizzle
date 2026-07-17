-- P0.2: idempotency + integrity for the upload publish flow.
--
-- client_upload_id: one uuid minted per composer session, sent on BOTH
-- POST /uploads/video and POST /recipes. Lets a retried/double-tapped upload
-- resolve to the SAME asset (no duplicate Cloudflare upload) and the SAME recipe
-- (no duplicate published post).
alter table public.video_assets
  add column if not exists client_upload_id uuid;

-- A given (owner, client_upload_id) maps to exactly one asset — a retried
-- provision returns the existing row instead of minting a second Cloudflare upload.
create unique index if not exists video_assets_owner_client_upload_uidx
  on public.video_assets (owner_id, client_upload_id)
  where client_upload_id is not null;

-- One video asset backs at most one recipe. Blocks the duplicate-publish-on-retry
-- path AND the shared-asset data-loss path (deleting one recipe tearing down media
-- another still uses).
create unique index if not exists recipes_video_asset_uidx
  on public.recipes (video_asset_id)
  where video_asset_id is not null;

-- Supports the per-minute finalize cron + /health backlog query (cloudflare,
-- non-terminal, ordered by created_at).
create index if not exists video_assets_cf_pending_created_idx
  on public.video_assets (created_at)
  where provider = 'cloudflare' and status in ('pending', 'uploading', 'processing');
