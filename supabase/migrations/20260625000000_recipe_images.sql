-- Photo recipe posts: an ordered list of image URLs rendered as a swipeable
-- carousel in the feed. A recipe is a photo post when image_urls is non-empty
-- (video_asset_id is then null). Video posts keep image_urls = '{}'.
alter table public.recipes
  add column if not exists image_urls text[] not null default '{}';
