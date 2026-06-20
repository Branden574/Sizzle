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

const SEED_DOMAIN = '@sizzle.dev';
const SEED_PASSWORD = 'sizzle-demo-1234';
const SAMPLE_HLS = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

function parseCount(s: string): number {
  const m = String(s).trim().match(/^([\d.]+)\s*([kKmM]?)$/);
  if (!m) return 0;
  const n = parseFloat(m[1]!);
  const suffix = (m[2] ?? '').toLowerCase();
  const mult = suffix === 'm' ? 1_000_000 : suffix === 'k' ? 1_000 : 1;
  return Math.round(n * mult);
}

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

    const { error: pErr } = await supabaseAdmin
      .from('profiles')
      .update({
        handle: c.handle.replace(/^@/, ''),
        display_name: c.name,
        bio: c.bio,
        avatar_color: c.bg,
        is_cook: true,
        follower_count: parseCount(c.followers),
        following_count: parseCount(c.following),
        total_likes: parseCount(c.likes),
      })
      .eq('id', id);
    if (pErr) throw pErr;
  }
  console.log(`• ${mockCooks.length} cooks`);

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

    const { data: recipe, error: rErr } = await supabaseAdmin
      .from('recipes')
      .insert({
        cook_id: owner,
        title: r.title,
        cuisine: r.cuisine,
        time_minutes: parseMinutes(r.time),
        servings: r.servings,
        level: r.level,
        bg: r.bg,
        video_asset_id: asset.id,
        status: 'published',
        like_count: parseCount(r.likeCount),
        dislike_count: parseCount(r.dislikeCount),
        comment_count: parseCount(r.commentCount),
        share_count: parseCount(r.shareCount),
        // stagger timestamps so array order = feed order (newest first)
        created_at: new Date(now - i * 3_600_000).toISOString(),
      })
      .select('id')
      .single();
    if (rErr || !recipe) throw rErr ?? new Error('recipe insert failed');

    if (r.ingredients.length) {
      await supabaseAdmin
        .from('recipe_ingredients')
        .insert(r.ingredients.map((text, pos) => ({ recipe_id: recipe.id, position: pos, text })));
    }
    if (r.steps.length) {
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
    if (comments.length) await supabaseAdmin.from('comments').insert(comments);

    recipeCount++;
  }
  console.log(`• ${recipeCount} recipes`);
  console.log('✓ Seed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
