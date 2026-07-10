-- Audit fixes (2026-07-10): close the same class of Data-API leak the recipe
-- lockdown (20260701090000) closed, but for profiles + comments, and make the
-- save toggle atomic.

-- CRITICAL — profiles was world-readable at the COLUMN level: anon/authenticated
-- had SELECT on every column, so anyone with the public anon key could read the
-- whole user base's phone, country/region, ban-appeal text, ban reasons,
-- scheduled-deletion dates, admin role, boost, notif prefs, tastes and Stripe
-- account id straight from PostgREST. Replace the table-wide grant with a
-- column-scoped grant that exposes only genuinely-public profile fields; the
-- service-role API keeps full access (GET /me now reads via service role).
revoke select on public.profiles from anon, authenticated;
grant select (
  id, handle, display_name, bio, avatar_url, avatar_color, banner_url,
  is_cook, follower_count, following_count, total_likes, created_at,
  verified_tier, monetization_status, sub_price_cents,
  instagram_url, tiktok_url, x_url, facebook_url, discord_url, youtube_url, website_url
) on public.profiles to anon, authenticated;

-- MEDIUM — comments were world-readable via the anon key, defeating owner
-- comment-hiding (shadow-moderation), block filtering, and unpublished/removed
-- recipe gating that the API enforces. The app reads comments only through the
-- service-role API, so drop direct anon/authenticated reads entirely.
drop policy if exists comments_select_all on public.comments;
revoke select on public.comments from anon, authenticated;

-- LOW — atomic save toggle. The old read-modify-write in the API could inflate
-- save_count under a double-submit (both requests read "not saved", both bump
-- the counter). Mirror toggle_reaction: one advisory-locked upsert/delete that
-- adjusts the counter by the real row change. Returns the new saved state.
create or replace function public.toggle_save(p_user uuid, p_recipe uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  existed boolean;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text), hashtext(p_recipe::text));

  select true into existed from public.saves
    where user_id = p_user and recipe_id = p_recipe;

  if existed then
    delete from public.saves where user_id = p_user and recipe_id = p_recipe;
    update public.recipes set save_count = greatest(0, save_count - 1) where id = p_recipe;
    return false;
  else
    insert into public.saves (user_id, recipe_id) values (p_user, p_recipe)
      on conflict (user_id, recipe_id) do nothing;
    update public.recipes set save_count = greatest(0, save_count + 1) where id = p_recipe;
    return true;
  end if;
end;
$$;
