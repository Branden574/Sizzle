-- ============================================================================
-- Phase 5 hardening — atomic like/dislike toggle. Replaces the API-side
-- read-modify-write (which had a TOCTOU race that could inflate counters) with
-- a single transactional function serialized per (user, recipe).
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
begin
  if p_kind not in ('like', 'dislike') then
    raise exception 'invalid reaction kind';
  end if;

  -- serialize concurrent toggles for the same (user, recipe) pair
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
   where id = p_recipe;

  return result;
end;
$$;

revoke execute on function public.toggle_reaction(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_reaction(uuid, uuid, text) to service_role;
