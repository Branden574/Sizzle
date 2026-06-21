-- ============================================================================
-- Profile social links — shown as chips on the profile + cook sheet. Discrete
-- nullable columns (not jsonb) so they slot into the column-level write
-- allow-list, which is this codebase's security boundary for self-edits.
-- ============================================================================
alter table public.profiles
  add column if not exists instagram_url text,
  add column if not exists tiktok_url    text,
  add column if not exists x_url         text,
  add column if not exists facebook_url  text,
  add column if not exists discord_url   text,
  add column if not exists youtube_url   text,
  add column if not exists website_url   text;

-- Re-issue the authenticated UPDATE allow-list (from 20260620250000) including
-- the new link columns. Column grants are additive, but re-listing the full set
-- keeps the writable surface self-documenting in one place.
grant update (display_name, handle, bio, avatar_url, banner_url, phone, tastes,
  instagram_url, tiktok_url, x_url, facebook_url, discord_url, youtube_url, website_url)
  on public.profiles to authenticated;
