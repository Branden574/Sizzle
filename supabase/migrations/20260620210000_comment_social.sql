-- ============================================================================
-- Comment social: per-comment likes + single-level replies + denormalized
-- counts. Mirrors the reactions / toggle_reaction pattern.
-- ============================================================================
alter table public.comments add column parent_id uuid references public.comments (id) on delete cascade;
alter table public.comments add column reply_count integer not null default 0;
create index comments_parent_idx on public.comments (parent_id, created_at);

create table public.comment_likes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  comment_id uuid not null references public.comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);
create index comment_likes_comment_idx on public.comment_likes (comment_id);

alter table public.comment_likes enable row level security;
-- Private per user; the API reads liked-state via the service role.
create policy comment_likes_all_self on public.comment_likes
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, delete on public.comment_likes to authenticated;

-- Atomic like toggle, serialized per (user, comment). Returns the new liked state.
create or replace function public.toggle_comment_like(p_user uuid, p_comment uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
  liked    boolean;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text), hashtext(p_comment::text));

  select user_id into existing from public.comment_likes where user_id = p_user and comment_id = p_comment;

  if existing is not null then
    delete from public.comment_likes where user_id = p_user and comment_id = p_comment;
    update public.comments set like_count = greatest(0, like_count - 1) where id = p_comment;
    liked := false;
  else
    insert into public.comment_likes (user_id, comment_id) values (p_user, p_comment) on conflict do nothing;
    update public.comments set like_count = greatest(0, like_count + 1) where id = p_comment;
    liked := true;
  end if;

  return liked;
end;
$$;
revoke execute on function public.toggle_comment_like(uuid, uuid) from public, anon, authenticated;
grant execute on function public.toggle_comment_like(uuid, uuid) to service_role;

-- Denormalized reply counter on the parent comment.
create or replace function public.adjust_comment_reply_count(cid uuid, delta int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.comments set reply_count = greatest(0, reply_count + delta) where id = cid;
$$;
revoke execute on function public.adjust_comment_reply_count(uuid, int) from public, anon, authenticated;
grant execute on function public.adjust_comment_reply_count(uuid, int) to service_role;
