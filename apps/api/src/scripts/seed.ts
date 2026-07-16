/**
 * Seed realistic sample cooks + recipes.
 *
 * Source of truth is the front-end's mock dataset (`apps/web/src/data.ts`) so
 * seeded content matches what the UI was designed around. Idempotent: it first
 * removes any previously seeded users (which cascades to their content).
 *
 * Run: `npm run seed` (from repo root) or `npm run seed -w @sizzle/api`.
 */
import { baseComments, cooks as mockCooks, recipes as mockRecipes } from '../../../web/src/data';
import { supabaseAdmin } from '../lib/supabase';
import { parseHashtags } from '../services/hashtags';

const TAG_POOL = ['quickdinner', 'weeknight', 'comfortfood', 'mealprep', 'spicy', 'vegetarian', 'dessert', 'highprotein', 'easyrecipe', 'dinnerideas'];

const SEED_DOMAIN = '@sizzle.dev';
const SEED_PASSWORD = 'sizzle-demo-1234';
const SAMPLE_HLS = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

function parseMinutes(s: string): number {
  const str = String(s).toLowerCase();
  const m = str.match(/([\d.]+)/);
  const n = m ? parseFloat(m[1]!) : 0;
  return str.includes('hr') || str.includes('hour') ? Math.round(n * 60) : Math.round(n);
}

async function clearExistingSeed() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const seeded = data.users.filter((u) => u.email?.endsWith(SEED_DOMAIN));
  for (const u of seeded) await supabaseAdmin.auth.admin.deleteUser(u.id);
  if (seeded.length) console.log(`• cleared ${seeded.length} previously seeded user(s)`);
}

async function main() {
  console.log('Seeding Sizzle…');
  await clearExistingSeed();

  // 1) Cooks → auth users + enriched profiles.
  const cookId = new Map<string, string>(); // mock id -> profile uuid
  for (const c of mockCooks) {
    const email = `${c.id}${SEED_DOMAIN}`;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: c.name },
    });
    if (error || !data.user) throw error ?? new Error(`Failed to create ${email}`);
    const id = data.user.id;
    cookId.set(c.id, id);

    // Engagement counters are deliberately left at their zero defaults: the mock
    // dataset's follower/like totals are illustrative, and a seeded account must
    // never carry engagement it did not earn. They're recomputed at the end from
    // the rows this script actually inserts.
    const { error: pErr } = await supabaseAdmin
      .from('profiles')
      .update({
        handle: c.handle.replace(/^@/, ''),
        display_name: c.name,
        bio: c.bio,
        avatar_color: c.bg,
        is_cook: true,
      })
      .eq('id', id);
    if (pErr) throw pErr;
  }
  console.log(`• ${mockCooks.length} cooks`);

  // Demo moderation/verification state: one admin + verified creators so the
  // admin dashboard and badges have data locally. (The real admin —
  // branden574@gmail.com — is granted admin automatically on signup.)
  const grant = async (mockId: string, patch: Record<string, unknown>) => {
    const id = cookId.get(mockId);
    if (id) await supabaseAdmin.from('profiles').update(patch).eq('id', id);
  };
  await grant('mina', { role: 'admin' });
  await grant('theo', { verified_tier: 'blue' });
  await grant('lila', { verified_tier: 'gold' });
  // Demo social links so the profile/cook link-chips have content.
  await grant('theo', { instagram_url: 'https://instagram.com/theocooks', tiktok_url: 'https://tiktok.com/@theocooks', x_url: 'https://x.com/theocooks', youtube_url: 'https://youtube.com/@theocooks', website_url: 'https://theocooks.com' });
  await grant('lila', { instagram_url: 'https://instagram.com/lilamoreno', tiktok_url: 'https://tiktok.com/@lilamoreno', website_url: 'https://lilamoreno.kitchen' });
  await grant('mina', { instagram_url: 'https://instagram.com/minapark', youtube_url: 'https://youtube.com/@minapark', discord_url: 'https://discord.gg/minacooks' });
  console.log('• 1 admin (mina) · 2 verified creators (theo=blue, lila=gold) · demo social links');

  // 2) Recipes → video asset (ready/mock) + recipe + ordered ingredients/steps.
  let recipeCount = 0;
  const now = Date.now();
  for (let i = 0; i < mockRecipes.length; i++) {
    const r = mockRecipes[i]!;
    const owner = cookId.get(r.cook);
    if (!owner) {
      console.warn(`  ! skipping ${r.id}: unknown cook ${r.cook}`);
      continue;
    }

    const { data: asset, error: vErr } = await supabaseAdmin
      .from('video_assets')
      .insert({
        owner_id: owner,
        provider: 'mock',
        provider_uid: `seed_${r.id}`,
        status: 'ready',
        hls_url: SAMPLE_HLS,
        poster_url: null,
        duration_seconds: 30,
      })
      .select('id')
      .single();
    if (vErr || !asset) throw vErr ?? new Error('video asset insert failed');

    // Synthesize a caption with hashtags so search / hashtag-feeds / trending /
    // ranking-affinity have realistic, overlapping tags in dev.
    const cuisineTag = r.cuisine.toLowerCase().replace(/[^a-z0-9]/g, '');
    const poolA = TAG_POOL[i % TAG_POOL.length]!;
    const poolB = TAG_POOL[(i * 3 + 1) % TAG_POOL.length]!;
    // Make ~1 in 5 posts a foodie review so the Review badge / rating UI has data.
    const isReview = i % 5 === 4;
    const rating = isReview ? (3 + (i % 3)) : null; // 3–5 stars
    const caption = isReview
      ? `${r.title} — honestly some of the best ${r.cuisine} I've had. Worth the trip. #${cuisineTag} #foodie #review`
      : `${r.title} — making this on repeat 🔥 #${cuisineTag} #homecooking #${poolA} #${poolB}`;
    const tags = parseHashtags(caption, r.title);

    const { data: recipe, error: rErr } = await supabaseAdmin
      .from('recipes')
      .insert({
        cook_id: owner,
        title: r.title,
        cuisine: r.cuisine,
        time_minutes: isReview ? 0 : parseMinutes(r.time),
        servings: isReview ? 1 : r.servings,
        level: r.level,
        bg: r.bg,
        video_asset_id: asset.id,
        caption,
        tags,
        post_type: isReview ? 'review' : 'recipe',
        rating,
        status: 'published',
        // stagger timestamps so array order = feed order (newest first)
        created_at: new Date(now - i * 3_600_000).toISOString(),
      })
      .select('id')
      .single();
    if (rErr || !recipe) throw rErr ?? new Error('recipe insert failed');

    if (!isReview && r.ingredients.length) {
      await supabaseAdmin
        .from('recipe_ingredients')
        .insert(r.ingredients.map((text, pos) => ({ recipe_id: recipe.id, position: pos, text })));
    }
    if (!isReview && r.steps.length) {
      await supabaseAdmin
        .from('recipe_steps')
        .insert(r.steps.map((text, pos) => ({ recipe_id: recipe.id, position: pos, text })));
    }

    // A few comments per recipe, authored by other cooks (so authors are real).
    const others = mockCooks.filter((c) => c.id !== r.cook);
    const comments = baseComments.slice(0, 3).map((b, j) => ({
      recipe_id: recipe.id,
      author_id: cookId.get(others[j % others.length]!.id)!,
      text: b.text,
      created_at: new Date(now - i * 3_600_000 - (j + 1) * 600_000).toISOString(),
    }));
    // Inserting directly bypasses the RPC that maintains comment_count, so set it
    // from the rows we actually wrote.
    if (comments.length) {
      await supabaseAdmin.from('comments').insert(comments);
      await supabaseAdmin.from('recipes').update({ comment_count: comments.length }).eq('id', recipe.id);
    }

    recipeCount++;
  }
  console.log(`• ${recipeCount} recipes`);

  // Cross-follows so the followers/following lists have real content. The graph
  // is ASYMMETRIC on purpose: each cook follows the next 3 cooks (mod n), so a
  // cook's "following" set ({i+1,i+2,i+3}) differs from its "followers" set
  // ({i+2,i+3,i+4}) — the two lists are no longer identical — while the overlap
  // ({i+2,i+3}) still yields mutual-follow pairs for the repost feature to demo.
  // Insert directly so we don't double-count via the RPC, then recompute every
  // counter from the rows actually inserted — a seeded profile's followers/likes
  // must be earned from real rows, never a headline number.
  const ids = [...cookId.values()];
  const n = ids.length;
  const followRows = ids.flatMap((a, i) =>
    [1, 2, 3]
      .map((step) => ids[(i + step) % n]!)
      .filter((b) => b !== a)
      .map((b) => ({ follower_id: a, cook_id: b })),
  );
  if (followRows.length) await supabaseAdmin.from('follows').upsert(followRows, { onConflict: 'follower_id,cook_id', ignoreDuplicates: true });
  for (const id of ids) {
    const { count: followingCount } = await supabaseAdmin.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', id);
    const { count: followerCount } = await supabaseAdmin.from('follows').select('*', { count: 'exact', head: true }).eq('cook_id', id);
    const { data: recs } = await supabaseAdmin.from('recipes').select('like_count').eq('cook_id', id);
    const totalLikes = (recs ?? []).reduce((n, r) => n + (r.like_count as number), 0);
    await supabaseAdmin.from('profiles').update({ follower_count: followerCount ?? 0, following_count: followingCount ?? 0, total_likes: totalLikes }).eq('id', id);
  }
  console.log('• cross-follows + counters');
  console.log('✓ Seed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
