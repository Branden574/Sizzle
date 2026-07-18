-- Related hashtags via co-occurrence: other (safe) hashtags that appear on the same posts as
-- the given one, ranked by how often they co-occur. Powers the hashtag detail page's "related".
create or replace function public.related_hashtags(p_hashtag uuid, p_limit int default 6)
returns table(normalized_name text)
language sql stable security definer set search_path = public as $$
  select h.normalized_name
  from content_hashtags a
  join content_hashtags b on b.recipe_id = a.recipe_id and b.hashtag_id <> a.hashtag_id
  join hashtags h on h.id = b.hashtag_id
  where a.hashtag_id = p_hashtag
    and h.status = 'active' and not h.is_blocked and not h.is_sensitive
  group by h.normalized_name
  order by count(*) desc
  limit p_limit;
$$;
revoke all on function public.related_hashtags(uuid, int) from public, anon, authenticated;
grant execute on function public.related_hashtags(uuid, int) to service_role;
