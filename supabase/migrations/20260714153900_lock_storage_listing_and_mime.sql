-- SECURITY (storage):
-- 1) videos_read / profile_media_read granted broad SELECT to anon, enabling
--    storage list() enumeration of every user's folder (UUID) + object keys,
--    exposing private-account media and moderated/removed clips. Public buckets
--    serve via /object/public/<key> without a SELECT policy, and the client never
--    calls list(), so dropping them stops enumeration with no functional impact.
drop policy if exists videos_read on storage.objects;
drop policy if exists profile_media_read on storage.objects;

-- 2) Buckets had no MIME/size limits (text/html phishing on *.supabase.co + DoS).
--    Media-only wildcards block text/html while keeping all image/video uploads
--    (incl. iOS HEIC) working; cap sizes.
update storage.buckets set allowed_mime_types = array['image/*'],           file_size_limit = 15728640   where id in ('avatars','banners');
update storage.buckets set allowed_mime_types = array['video/*','image/*'], file_size_limit = 2147483648 where id = 'videos';
