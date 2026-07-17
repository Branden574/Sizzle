import { Hono } from 'hono';
import { supabaseAdmin } from '../lib/supabase';
import { sendDirectPush } from '../services/push';
import { finalizeProviderAsset, deleteAssetMedia } from '../services/videoFinalize';
import { env } from '../env';
import type { AppEnv } from '../types';

export const internal = new Hono<AppEnv>();

// Fail CLOSED: every /internal/* route (Vercel Cron targets) requires the
// CRON_SECRET bearer. Previously each route only checked `if (env.CRON_SECRET)`,
// so a missing/unconfigured secret left these world-reachable — an anon GET could
// force-publish scheduled posts or fan out push nudges. Now an absent secret
// rejects everything. (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.)
internal.use('*', async (c, next) => {
  const expected = env.CRON_SECRET;
  if (!expected || c.req.header('authorization') !== `Bearer ${expected}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});

/**
 * GET /internal/finalize-videos — Vercel Cron target (every minute). SERVER-SIDE
 * backstop that drives Cloudflare assets to ready + moderates their thumbnail,
 * independent of the client. Posting no longer blocks on transcoding, so a user
 * can record → post → land on their profile → background the app before the clip
 * finishes transcoding; WKWebView then suspends the composer's foreground poll.
 * We skip Stream webhooks, so without this cron such a post would be stuck
 * `pending` forever — unplayable AND never thumbnail-moderated. This sweep closes
 * that gap (and covers clips whose transcode exceeds the client poll's cap).
 */
internal.get('/finalize-videos', async (c) => {
  if (env.CRON_SECRET) {
    const auth = c.req.header('authorization');
    if (auth !== `Bearer ${env.CRON_SECRET}`) return c.json({ error: 'unauthorized' }, 401);
  }
  const now = Date.now();
  const twoHoursAgo = new Date(now - 2 * 3_600_000).toISOString();
  const sixHoursAgo = new Date(now - 6 * 3_600_000).toISOString();
  // Still-in-flight Cloudflare assets, rechecked for up to 6h (a long 4K/30-min
  // transcode legitimately outruns the old 2h window). No provider_uid filter — a
  // /copy-failed row (provider_uid null, source_url set) is picked up here and the
  // finalizer re-ingests it. Batch-capped, oldest-first so nothing starves.
  const { data: pending } = await supabaseAdmin
    .from('video_assets')
    .select('id, provider_uid')
    .eq('provider', 'cloudflare')
    .in('status', ['pending', 'uploading', 'processing'])
    .gte('created_at', sixHoursAgo)
    .order('created_at', { ascending: true })
    .limit(40);

  let ready = 0;
  let errored = 0;
  let processing = 0;
  let failed = 0;
  if (pending && pending.length) {
    const results = await Promise.all(
      pending.map((a) =>
        finalizeProviderAsset(a.id as string, (a.provider_uid as string) ?? '').catch((err) => {
          // Was `.catch(() => null)` — a swallowed failure made a stuck video
          // undebuggable. Surface it (Sentry once configured) and count it.
          console.error('[finalize-cron] finalize failed', { assetId: a.id, err: String(err) });
          return null;
        }),
      ),
    );
    for (const r of results) {
      if (!r) { failed += 1; continue; }
      if (r.status === 'ready') ready += 1;
      else if (r.status === 'error') errored += 1;
      else processing += 1;
    }
  }

  // Abandon ONLY dead upload slots: pending/uploading with no bytes after 2h
  // (composer opened, upload never completed). Do NOT force-error 'processing'
  // assets on the 2h timer — those ARE transcoding, and a CF backlog >2h would
  // otherwise permanently brick healthy published posts. 'processing' gets a much
  // longer 6h backstop (a real transcode never takes that long → genuinely stuck).
  const { data: staleUploads } = await supabaseAdmin
    .from('video_assets')
    .update({ status: 'error' })
    .eq('provider', 'cloudflare')
    .in('status', ['pending', 'uploading'])
    .lt('created_at', twoHoursAgo)
    .select('id');
  const { data: staleProcessing } = await supabaseAdmin
    .from('video_assets')
    .update({ status: 'error' })
    .eq('provider', 'cloudflare')
    .eq('status', 'processing')
    .lt('created_at', sixHoursAgo)
    .select('id');
  const abandoned = (staleUploads?.length ?? 0) + (staleProcessing?.length ?? 0);
  if (abandoned > 0) console.error('[finalize-cron] abandoned stale assets', { uploads: staleUploads?.length ?? 0, processing: staleProcessing?.length ?? 0 });

  // ORPHAN GC: assets no recipe references (partial-failure leftovers — upload
  // succeeded but recipe-create failed/was killed) get deleted after 6h; the
  // video_assets BEFORE DELETE trigger enqueues their media into
  // pending_media_deletions, drained below. 6h > the 2h upload-abandon window,
  // so nothing legitimately in flight is ever collected.
  let orphansCollected = 0;
  try {
    const { data: gc } = await supabaseAdmin.rpc('gc_orphan_video_assets', { cutoff: sixHoursAgo, max_rows: 50 });
    orphansCollected = (gc as number) ?? 0;
    if (orphansCollected > 0) console.error('[finalize-cron] orphan assets collected', { count: orphansCollected });
  } catch (err) {
    console.error('[finalize-cron] orphan GC failed', { err: String(err) });
  }

  // DRAIN the media-deletion queue (account deletes, ban purges, recipe deletes,
  // orphan GC all enqueue here). Time-budgeted so the whole cron stays inside the
  // 30s function cap: finalize+GC above are bounded, and the drain gets what's
  // left of ~12s. A row is removed only once its media is verifiably gone.
  const drained = await drainMediaDeletions(12_000);

  return c.json({ checked: pending?.length ?? 0, ready, errored, processing, failed, abandoned, orphansCollected, ...drained });
});

/** Buckets swept for a deleted account's storage prefix. */
const SWEEP_BUCKETS = ['videos', 'avatars', 'banners'] as const;

/**
 * Drain pending media deletions: Cloudflare asset + tracked storage objects via
 * deleteAssetMedia, and/or a whole user-folder sweep (storage_prefix).
 *
 * Review-hardened semantics:
 *  - TIME-BUDGETED, not row-counted: rows process until `budgetMs` elapses so a
 *    worst-case run (each Cloudflare delete can block ~10s) can never blow the
 *    30s serverless cap, while a healthy run drains far more than a fixed batch.
 *  - PRIORITY: account_delete / ban_purge rows first (GDPR clock), then FIFO —
 *    a recipe-delete flood can't head-of-line-block an account erasure.
 *  - attempts++ ONLY on real errors. Pagination progress (a >100-object folder
 *    sweeping page by page) keeps the row WITHOUT burning retry budget, so big
 *    accounts can't park half-erased at attempts=10.
 *  - deleteAssetMedia returns success honestly (it used to swallow Cloudflare/
 *    storage failures) — a failed delete keeps the row and retries.
 *  - Rows parked at attempts>=10 are surfaced every run (count + loud log).
 */
async function drainMediaDeletions(budgetMs: number): Promise<{ mediaDeleted: number; mediaRetried: number; mediaParked: number }> {
  const started = Date.now();
  const { data: rows } = await supabaseAdmin
    .from('pending_media_deletions')
    .select('*')
    .lt('attempts', 10)
    .order('created_at', { ascending: true })
    .limit(40);
  // GDPR-priority: whole-account sweeps jump the queue.
  const ordered = [...(rows ?? [])].sort((a, b) => {
    const pa = a.reason === 'account_delete' || a.reason === 'ban_purge' ? 0 : 1;
    const pb = b.reason === 'account_delete' || b.reason === 'ban_purge' ? 0 : 1;
    return pa - pb;
  });
  let mediaDeleted = 0;
  let mediaRetried = 0;
  for (const row of ordered) {
    if (Date.now() - started > budgetMs) break; // leave the rest for the next minute
    let errored = false; // real failure → burn an attempt
    let fullyDone = true; // pagination remainder → keep row, no attempt burned
    try {
      if (row.provider_uid || row.source_url || row.mp4_url || row.poster_url) {
        const ok = await deleteAssetMedia({
          provider: row.provider as string | null,
          provider_uid: row.provider_uid as string | null,
          source_url: row.source_url as string | null,
          mp4_url: row.mp4_url as string | null,
          poster_url: row.poster_url as string | null,
        });
        if (!ok) errored = true;
      }
      if (row.storage_prefix) {
        for (const bucket of SWEEP_BUCKETS) {
          const { data: objects, error } = await supabaseAdmin.storage
            .from(bucket)
            .list(row.storage_prefix as string, { limit: 100 });
          if (error) { errored = true; continue; }
          if (objects && objects.length) {
            const paths = objects.map((o) => `${row.storage_prefix}/${o.name}`);
            const { error: rmErr } = await supabaseAdmin.storage.from(bucket).remove(paths);
            if (rmErr) errored = true;
            // A full page means there may be more — normal progress, re-sweep next run.
            else if (objects.length === 100) fullyDone = false;
          }
        }
      }
    } catch (err) {
      console.error('[finalize-cron] media deletion failed', { id: row.id, reason: row.reason, err: String(err) });
      errored = true;
    }
    if (!errored && fullyDone) {
      await supabaseAdmin.from('pending_media_deletions').delete().eq('id', row.id as string);
      mediaDeleted += 1;
    } else if (errored) {
      await supabaseAdmin.from('pending_media_deletions').update({ attempts: (row.attempts as number) + 1 }).eq('id', row.id as string);
      mediaRetried += 1;
    }
    // !errored && !fullyDone → pagination progress: row untouched, sweep continues.
  }
  // Parked rows (attempts exhausted) must stay VISIBLE — they represent media we
  // promised to delete and haven't. Surfaced every run until manually reconciled.
  const { count: mediaParked } = await supabaseAdmin
    .from('pending_media_deletions')
    .select('id', { count: 'exact', head: true })
    .gte('attempts', 10);
  if (mediaParked && mediaParked > 0) {
    console.error('[finalize-cron] PARKED media deletions need manual reconciliation', { count: mediaParked });
  }
  return { mediaDeleted, mediaRetried, mediaParked: mediaParked ?? 0 };
}

/**
 * GET /internal/publish-scheduled — Vercel Cron target (every minute). Flips any
 * scheduled recipe whose time has arrived to published. Vercel Cron sends
 * `Authorization: Bearer ${CRON_SECRET}`; we reject anything else when the secret
 * is configured. (In local dev with no secret set, it's open — fine locally.)
 */
internal.get('/publish-scheduled', async (c) => {
  if (env.CRON_SECRET) {
    const auth = c.req.header('authorization');
    if (auth !== `Bearer ${env.CRON_SECRET}`) return c.json({ error: 'unauthorized' }, 401);
  }
  const now = new Date().toISOString();
  const { data: due } = await supabaseAdmin
    .from('recipes')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(200);
  const ids = (due ?? []).map((r) => r.id as string);
  if (ids.length) {
    await supabaseAdmin.from('recipes').update({ status: 'published', scheduled_at: null }).in('id', ids);
  }
  return c.json({ published: ids.length });
});

/**
 * GET /internal/save-nudges — Vercel Cron target (daily, around dinner-planning
 * time). Instagram's ranking data says saves are the strongest intent signal —
 * but a save that never becomes a cook is a dead end. This finds saves that are
 * 7-21 days old with NO cook_finish by that user for that recipe, and sends one
 * push: "You saved X — cook it tonight?" deep-linking the recipe. The
 * save_nudges table caps it at ONE nudge per user+recipe, ever — a gentle tap,
 * not a drip campaign.
 */
internal.get('/save-nudges', async (c) => {
  if (env.CRON_SECRET) {
    const auth = c.req.header('authorization');
    if (auth !== `Bearer ${env.CRON_SECRET}`) return c.json({ error: 'unauthorized' }, 401);
  }
  const now = Date.now();
  const from = new Date(now - 21 * 86_400_000).toISOString();
  const to = new Date(now - 7 * 86_400_000).toISOString();

  const { data: saves } = await supabaseAdmin
    .from('saves')
    .select('user_id, recipe_id, created_at')
    .gte('created_at', from)
    .lte('created_at', to)
    .limit(500);
  if (!saves || saves.length === 0) return c.json({ nudged: 0 });

  const userIds = [...new Set(saves.map((s) => s.user_id as string))];
  const recipeIds = [...new Set(saves.map((s) => s.recipe_id as string))];

  // One round trip each: who already cooked what, who was already nudged, and
  // the recipe titles (published only — no nudges to removed/private drafts).
  const [{ data: finishes }, { data: nudged }, { data: recipes }] = await Promise.all([
    supabaseAdmin.from('cook_events').select('user_id, recipe_id').eq('kind', 'cook_finish').in('user_id', userIds).in('recipe_id', recipeIds),
    supabaseAdmin.from('save_nudges').select('user_id, recipe_id').in('user_id', userIds).in('recipe_id', recipeIds),
    supabaseAdmin.from('recipes').select('id, title, status').in('id', recipeIds),
  ]);
  const cooked = new Set((finishes ?? []).map((f) => `${f.user_id}:${f.recipe_id}`));
  const already = new Set((nudged ?? []).map((n) => `${n.user_id}:${n.recipe_id}`));
  const titleById = new Map((recipes ?? []).filter((r) => r.status === 'published').map((r) => [r.id as string, r.title as string]));

  // At most one nudge per user per run — nobody wants three dinner pings.
  const perUser = new Set<string>();
  let sent = 0;
  for (const s of saves) {
    const key = `${s.user_id}:${s.recipe_id}`;
    if (cooked.has(key) || already.has(key) || perUser.has(s.user_id as string)) continue;
    const title = titleById.get(s.recipe_id as string);
    if (!title) continue;
    const ok = await sendDirectPush({
      userId: s.user_id as string,
      title: 'Cook it tonight? 🍳',
      body: `You saved “${title}” a while back — tonight's the night.`,
      data: { type: 'save_nudge', recipeId: s.recipe_id as string },
    });
    // Record the nudge even when the user has no push tokens — the save was
    // considered; re-considering it daily forever buys nothing.
    await supabaseAdmin.from('save_nudges').upsert({ user_id: s.user_id, recipe_id: s.recipe_id }, { onConflict: 'user_id,recipe_id' });
    perUser.add(s.user_id as string);
    if (ok) sent += 1;
  }
  return c.json({ nudged: sent, considered: saves.length });
});
