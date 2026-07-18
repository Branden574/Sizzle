-- Hashtag/discovery system — Phase 2: relational data foundation.
--
-- ADDITIVE. The live app keeps reading recipes.tags (text[]); these tables are new and
-- backfilled from it, so nothing in review breaks. They power autocomplete, follow/mute,
-- velocity-based trend detection, creator analytics, and moderation.
--
-- SECURITY: everything is deny-by-default RLS (API/service-role mediated — the client never
-- does supabase.from on these). The ONE public read is `hashtags` (active, non-blocked canonical
-- rows: names + counts) so tag pages / search / autocomplete can resolve tags. Metrics, trend
-- snapshots, content links, and user preferences are all API-only. Matches the tips/unlocks model.

-- 1. Canonical hashtag record.
create table if not exists public.hashtags (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null unique,        -- canonical key (services/hashtags.ts normalizeTag)
  display_name text not null,                  -- first-seen casing, for display
  slug text not null unique,                   -- == normalized_name (already URL-safe)
  description text,
  category text,                               -- cuisine/ingredient/event/… (null until classified)
  language text,
  status text not null default 'active'
    check (status in ('active','blocked','sensitive','limited','merged','review')),
  is_verified boolean not null default false,
  is_featured boolean not null default false,
  is_sensitive boolean not null default false,
  is_blocked boolean not null default false,
  merged_into uuid references public.hashtags(id) on delete set null,
  post_count integer not null default 0,       -- denormalized: published, non-hidden posts
  creator_count integer not null default 0,    -- denormalized: distinct cooks
  first_used_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_hashtags_name_prefix on public.hashtags (normalized_name text_pattern_ops);
create index if not exists idx_hashtags_featured on public.hashtags (is_featured) where is_featured;

-- 2. Content ↔ hashtag association (one row per (recipe, hashtag)).
create table if not exists public.content_hashtags (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  hashtag_id uuid not null references public.hashtags(id) on delete cascade,
  cook_id uuid not null,
  position integer,
  source text not null default 'caption',
  created_at timestamptz not null default now(),
  primary key (recipe_id, hashtag_id)
);
create index if not exists idx_content_hashtags_hashtag on public.content_hashtags (hashtag_id, created_at desc);
create index if not exists idx_content_hashtags_cook on public.content_hashtags (hashtag_id, cook_id);

-- 3. Aggregated metrics per rolling time window (fed by the trend cron).
create table if not exists public.hashtag_metrics (
  hashtag_id uuid not null references public.hashtags(id) on delete cascade,
  time_window text not null,                         -- '1h' | '6h' | '24h' | '7d'
  qualified_views bigint not null default 0,
  unique_viewers bigint not null default 0,
  posts_created integer not null default 0,
  unique_creators integer not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  reposts bigint not null default 0,
  saves bigint not null default 0,
  not_interested integer not null default 0,
  reports integer not null default 0,
  trend_score numeric not null default 0,
  quality_score numeric not null default 0,
  fraud_adjusted_score numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (hashtag_id, time_window)
);

-- 4. User ↔ hashtag preference (follow / mute / not-interested).
create table if not exists public.user_hashtag_preferences (
  user_id uuid not null,
  hashtag_id uuid not null references public.hashtags(id) on delete cascade,
  state text not null check (state in ('following','interested','neutral','not_interested','muted','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, hashtag_id)
);
create index if not exists idx_user_hashtag_prefs_user on public.user_hashtag_preferences (user_id, state);

-- 5. Historical trend snapshots (audit + rank-movement charts).
create table if not exists public.hashtag_trend_snapshots (
  id bigint generated always as identity primary key,
  hashtag_id uuid not null references public.hashtags(id) on delete cascade,
  time_window text not null,
  scope text not null default 'global',         -- 'global' | 'region:<code>' | 'category:<name>'
  trend_score numeric not null,
  rank integer,
  ranking_version text not null,
  metrics jsonb,
  computed_at timestamptz not null default now()
);
create index if not exists idx_trend_snapshots_lookup on public.hashtag_trend_snapshots (scope, window, computed_at desc);

-- RLS: deny-by-default everywhere; the only client-readable surface is safe hashtag metadata.
alter table public.hashtags enable row level security;
alter table public.content_hashtags enable row level security;
alter table public.hashtag_metrics enable row level security;
alter table public.user_hashtag_preferences enable row level security;
alter table public.hashtag_trend_snapshots enable row level security;

drop policy if exists hashtags_public_read on public.hashtags;
create policy hashtags_public_read on public.hashtags for select
  to anon, authenticated using (status = 'active' and not is_blocked);
-- No other client policies: content_hashtags, hashtag_metrics, user_hashtag_preferences, and
-- hashtag_trend_snapshots are API/service-role only (client reads them through the Hono API).

-- Backfill from the existing recipes.tags text[] (published, non-hidden).
insert into public.hashtags (normalized_name, display_name, slug, first_used_at, last_used_at)
select tag, tag, tag, min(r.created_at), max(r.created_at)
from public.recipes r, unnest(r.tags) as tag
where r.status = 'published' and coalesce(r.auto_hidden, false) = false
group by tag
on conflict (normalized_name) do nothing;

insert into public.content_hashtags (recipe_id, hashtag_id, cook_id, source)
select r.id, h.id, r.cook_id, 'caption'
from public.recipes r
cross join unnest(r.tags) as tag
join public.hashtags h on h.normalized_name = tag
where r.status = 'published' and coalesce(r.auto_hidden, false) = false
on conflict (recipe_id, hashtag_id) do nothing;

update public.hashtags h set post_count = sub.posts, creator_count = sub.creators
from (select hashtag_id, count(*) as posts, count(distinct cook_id) as creators
      from public.content_hashtags group by hashtag_id) sub
where sub.hashtag_id = h.id;
