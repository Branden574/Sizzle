-- Usernames: preserve the case the user typed (display "Branden", not "branden")
-- while keeping uniqueness case-insensitive, and make the availability lookup fast
-- (index-backed) instead of a sequential ilike scan.

-- Case-insensitive uniqueness (idempotent; first created in 20260621010000). This
-- is the index that guarantees no two accounts share a username, case aside.
create unique index if not exists profiles_handle_lower_key on public.profiles (lower(handle));

-- Signup trigger: keep the case the user chose (strip only invalid characters).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_handle text;
  want_handle text;
  final_handle text;
begin
  base_handle := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  if base_handle = '' then base_handle := 'cook'; end if;

  -- User-chosen username from signup metadata — keep case, strip only invalid chars.
  want_handle := regexp_replace(coalesce(new.raw_user_meta_data ->> 'handle', ''), '[^A-Za-z0-9_]', '', 'g');

  if length(want_handle) >= 3 then
    final_handle := left(want_handle, 30);
  else
    final_handle := base_handle || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;

  insert into public.profiles (id, handle, display_name, phone, role)
  values (
    new.id,
    final_handle,
    coalesce(new.raw_user_meta_data ->> 'display_name', initcap(base_handle)),
    new.raw_user_meta_data ->> 'phone',
    case when lower(new.email) = 'branden574@gmail.com' then 'admin' else 'user' end
  );
  return new;
end;
$$;

-- Fast username-availability check: an equality on lower(handle) uses the
-- profiles_handle_lower_key index (O(log n)), unlike ilike which can't.
create or replace function public.handle_available(h text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where lower(handle) = lower(btrim(h)));
$$;
revoke execute on function public.handle_available(text) from public;
grant execute on function public.handle_available(text) to anon, authenticated, service_role;
