-- Decrement OTHER users' denormalized counters for the rows a user is about to
-- lose to ON DELETE CASCADE (account deletion / expired-ban purge). Without this,
-- deleting an account left every cook they followed / liked / commented on / saved
-- with permanently inflated follower_count / total_likes / like_count /
-- comment_count / save_count. Only touches surviving recipes (cook_id <> uid);
-- the deleted user's own rows and counters vanish with their profile.
create or replace function public.cleanup_user_counters(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles p set follower_count = greatest(0, p.follower_count - 1)
    from follows f where f.follower_id = uid and f.cook_id = p.id;
  update profiles p set following_count = greatest(0, p.following_count - 1)
    from follows f where f.cook_id = uid and f.follower_id = p.id;
  update recipes r set like_count = greatest(0, r.like_count - 1)
    from reactions x where x.user_id = uid and x.kind = 'like' and x.recipe_id = r.id and r.cook_id <> uid;
  update recipes r set dislike_count = greatest(0, r.dislike_count - 1)
    from reactions x where x.user_id = uid and x.kind = 'dislike' and x.recipe_id = r.id and r.cook_id <> uid;
  update profiles p set total_likes = greatest(0, p.total_likes - agg.n)
    from (
      select r.cook_id, count(*)::int as n
      from reactions x join recipes r on r.id = x.recipe_id
      where x.user_id = uid and x.kind = 'like' and r.cook_id <> uid
      group by r.cook_id
    ) agg where p.id = agg.cook_id;
  update recipes r set comment_count = greatest(0, r.comment_count - agg.n)
    from (
      select c.recipe_id, count(*)::int as n
      from comments c join recipes r2 on r2.id = c.recipe_id
      where c.author_id = uid and r2.cook_id <> uid
      group by c.recipe_id
    ) agg where r.id = agg.recipe_id;
  update recipes r set save_count = greatest(0, r.save_count - 1)
    from saves s where s.user_id = uid and s.recipe_id = r.id and r.cook_id <> uid;
end;
$$;
revoke execute on function public.cleanup_user_counters(uuid) from public, anon, authenticated;
grant execute on function public.cleanup_user_counters(uuid) to service_role;

-- Reconcile counters for each expiring account before the cascade delete.
create or replace function public.purge_expired_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  rec record;
begin
  for rec in
    select u.id
    from auth.users u
    join public.profiles p on p.id = u.id
    where p.banned = true and p.delete_at is not null and p.delete_at < now()
  loop
    perform public.cleanup_user_counters(rec.id);
    delete from auth.users where id = rec.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.purge_expired_accounts() from public, anon, authenticated;
grant execute on function public.purge_expired_accounts() to service_role;
