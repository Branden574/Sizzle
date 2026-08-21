/**
 * Classification of every `public` table the migrations declare, from the point of view of
 * an anonymous (logged-out) PostgREST caller.
 *
 * Split out of `anon-boundary-probe.mjs` so two consumers can share one list:
 *   - the probe itself, which checks the classification against PRODUCTION, and
 *   - `tests/invariants/security-invariants.test.mjs`, which checks in CI that the
 *     classification still COVERS the schema. Without that second check the probe silently
 *     stops being a boundary test the moment a migration adds a table: before 2026-08-21 it
 *     named 22 tables while the migrations declared 49, so 26 tables were never probed at all.
 *
 * Every table created in `supabase/migrations` must appear in exactly one bucket below.
 * A new migration therefore FAILS CI until its table is classified — that forced decision is
 * the point. Classify by reading the table's grants/policies in its migration, not by running
 * the probe and copying whatever production happens to answer.
 *
 * Adding a table to ANON_READABLE_BY_DESIGN weakens what the probe asserts, so it needs a
 * cited policy and, where the policy is conditional, a filter check in `ANON_READABLE_FILTERS`.
 */

/**
 * Anon must receive ZERO rows. Either the SELECT grant is revoked (`401 42501`) or RLS
 * denies every row (`200 rows=0`).
 *
 * Caveat that applies to the `200 rows=0` members: an empty table passes for the wrong
 * reason. That weak pass is inherent to a black-box probe and is why this file is not a
 * substitute for the SQL grant-matrix assertion TD-7 asks for.
 */
export const NO_ROWS_FOR_ANON = [
  // money / entitlements
  'tips', 'iap_transactions', 'payouts', 'subscriptions', 'recipe_unlocks', 'product_purchases',
  // admin / moderation / ops
  'admin_credentials', 'admin_sessions', 'moderation_log', 'reports', 'cron_runs',
  'pending_media_deletions', 'rate_limits', 'save_nudges',
  // private user data
  'push_tokens', 'support_requests', 'messages', 'conversations', 'user_blocks', 'user_mutes',
  'notifications', 'follows', 'follow_requests', 'user_hashtag_preferences',
  // paywalled content (owner-only direct read since 20260701090000; comments locked 20260701100000)
  'recipes', 'recipe_steps', 'recipe_ingredients', 'video_assets', 'comments',
  // creator surfaces — served through the API, never read directly by a logged-out browser
  'creator_products', 'creator_reviews', 'creator_tiers', 'live_sessions',
  // per-user library / engagement
  'collections', 'collection_recipes', 'saves', 'downloads', 'reposts', 'reactions', 'comment_likes',
  // analytics / derived hashtag data (the public read is on `hashtags` only)
  'content_hashtags', 'hashtag_metrics', 'hashtag_trend_snapshots',
  'recipe_impressions', 'recipe_views', 'cook_events', 'cook_logs',
];

/**
 * Anon may read rows here — deliberately, with a cited policy.
 *
 * `hashtags`: `hashtags_public_read` (20260718120000, tightened by 20260718122000) grants
 * `select` to anon/authenticated `using (status = 'active' and not is_blocked and not
 * is_sensitive)`. Public hashtag discovery is a shipped feature, so rows are expected — but
 * the moderation half of that predicate is a real boundary, checked below.
 */
export const ANON_READABLE_BY_DESIGN = ['hashtags'];

/**
 * For conditionally-readable tables: PostgREST filters anon must never be able to satisfy.
 * Each entry asserts that `GET <table>?<query>` returns no rows, which tests the policy's
 * predicate live rather than trusting that the migration is still the deployed policy.
 */
export const ANON_READABLE_FILTERS = {
  hashtags: [
    { query: 'is_blocked=eq.true', why: 'blocked hashtags must stay invisible to anon' },
    { query: 'is_sensitive=eq.true', why: 'sensitive hashtags must stay invisible to anon' },
    { query: 'status=neq.active', why: 'non-active hashtags must stay invisible to anon' },
  ],
};

/**
 * `profiles` is neither all-or-nothing: it is column-scoped (20260701100000 + 20260712000000).
 * Public columns are world-readable; PII columns must be denied at the COLUMN level.
 */
export const PROFILES_TABLE = 'profiles';
export const PROFILES_PUBLIC_COLS = 'id,handle';
export const PROFILES_PII_COLS = [
  'phone', 'role', 'banned', 'banned_reason', 'country', 'region', 'stripe_account_id',
  'tastes', 'notif_prefs', 'ban_appeal_text', 'delete_at', 'boost',
];

/**
 * SECURITY DEFINER function whose EXECUTE was revoked from anon/authenticated
 * (20260701070000 / 20260808160000).
 */
export const DENIED_RPC = {
  name: 'creator_earnings',
  body: { uid: '00000000-0000-0000-0000-000000000000' },
};

/** Every table the classification knows about — the set CI compares against the migrations. */
export const CLASSIFIED_TABLES = [...NO_ROWS_FOR_ANON, ...ANON_READABLE_BY_DESIGN, PROFILES_TABLE];
