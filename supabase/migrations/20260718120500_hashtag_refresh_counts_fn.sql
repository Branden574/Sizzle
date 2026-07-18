-- Recompute the denormalized post_count/creator_count for a set of hashtags from
-- content_hashtags ⋈ published, non-hidden recipes. Called by the API after a post's
-- hashtags change (dual-write). Service-role only.
create or replace function public.refresh_hashtag_counts(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.hashtags h
     set post_count = coalesce(c.posts, 0),
         creator_count = coalesce(c.creators, 0),
         updated_at = now()
  from unnest(p_ids) as id
  left join (
    select ch.hashtag_id, count(*) as posts, count(distinct ch.cook_id) as creators
    from content_hashtags ch
    join recipes r on r.id = ch.recipe_id
    where r.status = 'published' and coalesce(r.auto_hidden, false) = false
    group by ch.hashtag_id
  ) c on c.hashtag_id = id
  where h.id = id;
end $$;
revoke all on function public.refresh_hashtag_counts(uuid[]) from public, anon, authenticated;
