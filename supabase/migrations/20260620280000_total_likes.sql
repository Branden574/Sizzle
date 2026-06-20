-- ============================================================================
-- profiles.total_likes (the cook's lifetime "likes" on their profile) was read
-- but never maintained on the live like path — frozen at its seed value (0 for
-- real cooks). Recreate toggle_reaction to also move the recipe owner's
-- total_likes, and backfill from current recipe like_counts.
-- ============================================================================
create or replace function public.toggle_reaction(p_user uuid, p_recipe uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev      text;
  like_d    int := 0;
  dislike_d int := 0;
  result    text;
  owner     uuid;
begin
  if p_kind not in ('like', 'dislike') then
    raise exception 'invalid reaction kind';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user::text), hashtext(p_recipe::text));

  select kind into prev from public.reactions where user_id = p_user and recipe_id = p_recipe;

  if prev = p_kind then
    delete from public.reactions where user_id = p_user and recipe_id = p_recipe;
    if p_kind = 'like' then like_d := -1; else dislike_d := -1; end if;
    result := null;
  else
    insert into public.reactions (user_id, recipe_id, kind)
      values (p_user, p_recipe, p_kind)
      on conflict (user_id, recipe_id) do update set kind = excluded.kind;
    if p_kind = 'like' then
      like_d := 1;
      if prev = 'dislike' then dislike_d := -1; end if;
    else
      dislike_d := 1;
      if prev = 'like' then like_d := -1; end if;
    end if;
    result := p_kind;
  end if;

  update public.recipes
     set like_count    = greatest(0, like_count + like_d),
         dislike_count = greatest(0, dislike_count + dislike_d)
   where id = p_recipe
   returning cook_id into owner;

  if like_d <> 0 and owner is not null then
    update public.profiles set total_likes = greatest(0, total_likes + like_d) where id = owner;
  end if;

  return result;
end;
$$;
revoke execute on function public.toggle_reaction(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_reaction(uuid, uuid, text) to service_role;

-- Backfill: lifetime likes = sum of the cook's recipes' current like_counts.
update public.profiles p
   set total_likes = coalesce((select sum(r.like_count) from public.recipes r where r.cook_id = p.id), 0);
