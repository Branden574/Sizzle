-- ============================================================================
-- Admin + verification + bans.
--   * profiles gain role / verified_tier / banned
--   * privileged fields are writable only by the service role (API admin path)
--   * follower milestones auto-grant a blue (100k) / gold (1M) badge + notify admins
-- ============================================================================
alter table public.profiles add column role text not null default 'user' check (role in ('user', 'admin'));
alter table public.profiles add column verified_tier text check (verified_tier in ('blue', 'gold'));
alter table public.profiles add column banned boolean not null default false;
alter table public.profiles add column banned_at timestamptz;
alter table public.profiles add column banned_reason text;

create index profiles_role_idx on public.profiles (role) where role = 'admin';

-- Bootstrap admin: this account becomes an admin automatically on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_handle text;
begin
  base_handle := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  if base_handle = '' then base_handle := 'cook'; end if;

  insert into public.profiles (id, handle, display_name, phone, role)
  values (
    new.id,
    base_handle || substr(replace(new.id::text, '-', ''), 1, 4),
    coalesce(new.raw_user_meta_data ->> 'display_name', initcap(base_handle)),
    new.raw_user_meta_data ->> 'phone',
    case when lower(new.email) = 'branden574@gmail.com' then 'admin' else 'user' end
  );
  return new;
end;
$$;

-- Guard: ordinary users (authenticated/anon JWT roles) cannot grant themselves a
-- badge, admin role, or unban themselves. Service role (API admin) + postgres
-- (migrations/seed) bypass this.
create or replace function public.guard_profile_privileged()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.role is distinct from old.role
       or new.verified_tier is distinct from old.verified_tier
       or new.banned is distinct from old.banned
     ) then
    raise exception 'cannot modify privileged profile fields';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_privileged before update on public.profiles
  for each row execute function public.guard_profile_privileged();

-- Widen notification kinds for verification/milestone alerts to admins.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'like', 'comment', 'verified'));

-- Follower milestone → sticky badge (blue at 100k, gold at 1M) + notify admins.
create or replace function public.apply_verification_milestone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_tier text;
begin
  if new.follower_count = old.follower_count then
    return new;
  end if;

  new_tier := case
    when new.follower_count >= 1000000 then 'gold'
    when new.follower_count >= 100000 then 'blue'
    else null
  end;

  -- Only ever upgrade (none → blue → gold); badges are sticky.
  if new_tier is not null and (old.verified_tier is null or (old.verified_tier = 'blue' and new_tier = 'gold')) then
    new.verified_tier := new_tier;
    insert into public.notifications (user_id, type, actor_id)
      select id, 'verified', new.id from public.profiles where role = 'admin';
  end if;

  return new;
end;
$$;
create trigger profiles_verification before update of follower_count on public.profiles
  for each row execute function public.apply_verification_milestone();
