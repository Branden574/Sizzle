import { Hono } from 'hono';
import { supabaseAdmin } from '../lib/supabase';
import { env } from '../env';
import type { AppEnv } from '../types';

export const seo = new Hono<AppEnv>();

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Serialize an object for embedding in a `<script type="application/ld+json">`
 * block. HTML-escaping doesn't apply inside a raw-text <script>, so a `</script>`
 * (or a `<!--`) sitting in a bio/title/name would otherwise break out of the
 * block — classic stored XSS. Escaping `<` to the JS `<` unicode escape
 * keeps the JSON valid while making a closing tag impossible.
 */
const jsonLdScript = (obj: unknown): string =>
  JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

/** The site's default share image — a real, hosted 1200×630 card. Used whenever a
 *  recipe/profile/board has no poster of its own. (Must exist: getsizzle.app/og-image.png.) */
const OG_FALLBACK = () => `${env.APP_ORIGIN}/og-image.png`;

/**
 * Read an image's pixel dimensions + mime straight from its header bytes.
 * Supports the formats posters/avatars actually use (JPEG, PNG, WebP, GIF).
 * Returns null if the bytes aren't a recognized header.
 */
function readImageDims(b: Buffer): { width: number; height: number; type: string } | null {
  // PNG
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), type: 'image/png' };
  }
  // GIF
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { width: b.readUInt16LE(6), height: b.readUInt16LE(8), type: 'image/gif' };
  }
  // WebP (RIFF....WEBP)
  if (b.length >= 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = b.toString('ascii', 12, 16);
    if (fmt === 'VP8X') {
      const w = 1 + ((b[24]! | (b[25]! << 8) | (b[26]! << 16)) & 0xffffff);
      const h = 1 + ((b[27]! | (b[28]! << 8) | (b[29]! << 16)) & 0xffffff);
      return { width: w, height: h, type: 'image/webp' };
    }
    if (fmt === 'VP8 ') {
      return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, type: 'image/webp' };
    }
    if (fmt === 'VP8L') {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, type: 'image/webp' };
    }
    return null;
  }
  // JPEG — walk the segment markers to the Start-Of-Frame that carries the dimensions.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7), type: 'image/jpeg' };
      }
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if (len < 2) break;
      i += 2 + len;
    }
  }
  return null;
}

/**
 * Best-effort probe of an image's dimensions. Crawlers (Facebook, iMessage's
 * LinkPresentation, WhatsApp) can't render the preview card on the FIRST scrape
 * without og:image:width/height — they queue the image for an async re-fetch and
 * meanwhile show only the site icon/title, no thumbnail. Supplying the dimensions
 * up front is what makes the thumbnail appear immediately. Times out fast and
 * returns null on any failure, so a slow/broken image never blocks the page.
 */
async function probeImageSize(url: string): Promise<{ width: number; height: number; type: string } | null> {
  if (url === OG_FALLBACK()) return { width: 1200, height: 630, type: 'image/png' }; // known, skip the fetch
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    // redirect:'error' — our storage/CDN serves the image with a 200 directly, so refusing to
    // follow redirects costs nothing and blocks a stored URL that 3xx-bounces to an internal
    // address. The abort timer below stays armed through the BODY read (not just the headers),
    // and we stop after ~192KB, so a slow/trickling or Range-ignoring host can neither hang the
    // crawler-facing page nor balloon memory.
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'error', headers: { Range: 'bytes=0-131071' } });
    if ((!res.ok && res.status !== 206) || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    const CAP = 192 * 1024;
    while (total < CAP) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
    void reader.cancel().catch(() => {});
    return readImageDims(Buffer.concat(chunks));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The full og:image tag block (image + secure_url + width/height/type when known),
 *  so the preview renders on the first crawl instead of after an async re-scrape. */
async function ogImageTags(imageUrl: string): Promise<string> {
  const dims = await probeImageSize(imageUrl);
  const secure = imageUrl.startsWith('https:') ? `\n<meta property="og:image:secure_url" content="${esc(imageUrl)}">` : '';
  const size = dims
    ? `\n<meta property="og:image:width" content="${dims.width}">\n<meta property="og:image:height" content="${dims.height}">\n<meta property="og:image:type" content="${dims.type}">`
    : '';
  return `<meta property="og:image" content="${esc(imageUrl)}">${secure}${size}`;
}

/**
 * GET /r/:id — a crawlable, server-rendered recipe page. Turns every post into an
 * evergreen Google / Pinterest funnel: Open Graph + Twitter cards so links unfurl
 * as rich previews, and schema.org/Recipe JSON-LD so search engines index the dish.
 * Free recipes expose the full method; premium / subscribers-only ones tease the
 * ingredients and gate the steps behind "open in the app". Bots and humans both get
 * HTML; the human CTA deep-links into the native app / marketing site.
 */
seo.get('/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.html(page404(), 404);

  const { data: r } = await supabaseAdmin
    .from('recipes')
    .select('id, title, caption, cuisine, tags, image_urls, video_asset_id, cook_id, price_cents, visibility, status, servings, time_minutes, auto_hidden')
    .eq('id', id)
    .maybeSingle();
  // auto_hidden is moderation state: content pulled pending review must vanish
  // from the public web too, not just the in-app feed.
  if (!r || r.status !== 'published' || r.auto_hidden) return c.html(page404(), 404);

  const [{ data: cook }, { data: video }, { data: ings }] = await Promise.all([
    supabaseAdmin.from('profiles').select('display_name, handle, avatar_url, private').eq('id', r.cook_id).maybeSingle(),
    r.video_asset_id ? supabaseAdmin.from('video_assets').select('poster_url').eq('id', r.video_asset_id).maybeSingle() : Promise.resolve({ data: null }),
    supabaseAdmin.from('recipe_ingredients').select('text').eq('recipe_id', id).order('position', { ascending: true }),
  ]);
  // A private account's posts are follower-only — nothing to crawl or unfurl.
  if (cook?.private) return c.html(page404(), 404);
  const { data: steps } = await supabaseAdmin.from('recipe_steps').select('text').eq('recipe_id', id).order('position', { ascending: true });

  const gated = r.price_cents != null || r.visibility === 'subscribers';
  const title = (r.title as string) || 'A recipe on Sizzle';
  const cookName = (cook?.display_name as string) || 'a Sizzle cook';
  const poster = (video?.poster_url as string) || (Array.isArray(r.image_urls) && r.image_urls[0]) || OG_FALLBACK();
  const desc = (r.caption as string) || `${title} by ${cookName} — watch it, then actually cook it on Sizzle.`;
  const ingredients = (ings ?? []).map((i) => i.text as string);
  const stepList = gated ? [] : (steps ?? []).map((s) => s.text as string);
  const url = `${env.APP_ORIGIN}/r/${id}`;
  const appLink = `${env.APP_ORIGIN}/?r=${id}`; // marketing/app deep link into this recipe
  const ogImage = await ogImageTags(poster);

  // schema.org/Recipe — free recipes expose full ingredients + steps for rich results;
  // gated recipes only advertise the dish (name/image/author) and tease ingredients.
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: title,
    image: [poster],
    description: desc,
    author: { '@type': 'Person', name: cookName },
    recipeCuisine: r.cuisine || undefined,
    recipeYield: r.servings ? `${r.servings} servings` : undefined,
    totalTime: r.time_minutes ? `PT${r.time_minutes}M` : undefined,
    recipeIngredient: gated ? ingredients.slice(0, 3) : ingredients,
    recipeInstructions: stepList.map((text, i) => ({ '@type': 'HowToStep', position: i + 1, text })),
  };

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="apple-touch-icon" sizes="180x180" href="${env.APP_ORIGIN}/apple-touch-icon.png"><link rel="icon" href="${env.APP_ORIGIN}/favicon.ico">
<title>${esc(title)} · Sizzle</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${ogImage}
<meta property="og:image:alt" content="${esc(title)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="Sizzle">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(poster)}">
<script type="application/ld+json">${jsonLdScript(jsonLd)}</script>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#0c0a09;color:#faf3ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5}
  .wrap{max-width:680px;margin:0 auto;padding:24px 20px 64px}
  .hero{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:20px;background:#1a1613}
  h1{font-size:30px;margin:20px 0 6px;font-weight:800}
  .by{color:#b8a99b;font-size:15px;margin-bottom:20px}
  .cta{display:block;text-align:center;background:linear-gradient(135deg,#ff5a36,#e23a18);color:#fff;text-decoration:none;font-weight:800;padding:15px;border-radius:16px;margin:22px 0;font-size:16px}
  h2{font-size:20px;margin:26px 0 10px}
  ul,ol{padding-left:22px}li{margin:6px 0}
  .gate{background:#1a1613;border:1px solid #2a2320;border-radius:16px;padding:20px;text-align:center;margin-top:20px}
  .tag{color:#ff5a36;font-size:13px}
</style>
</head><body><div class="wrap">
  <img class="hero" src="${esc(poster)}" alt="${esc(title)}">
  <h1>${esc(title)}</h1>
  <div class="by">by ${esc(cookName)}${cook?.handle ? ` · @${esc(cook.handle as string)}` : ''}</div>
  <a class="cta" href="${esc(appLink)}">▶ Watch &amp; cook it in the Sizzle app</a>
  <p>${esc(desc)}</p>
  ${ingredients.length ? `<h2>Ingredients</h2><ul>${(gated ? ingredients.slice(0, 3) : ingredients).map((i) => `<li>${esc(i)}</li>`).join('')}${gated && ingredients.length > 3 ? '<li>…and more, in the app</li>' : ''}</ul>` : ''}
  ${stepList.length ? `<h2>Method</h2><ol>${stepList.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
  ${gated ? `<div class="gate"><strong>${r.visibility === 'subscribers' ? 'Subscribers-only recipe' : 'Premium recipe'}</strong><p>${r.visibility === 'subscribers' ? `Subscribe to ${esc(cookName)}` : 'Unlock the full recipe'} in the app for the video, ingredients &amp; steps.</p><a class="cta" href="${esc(appLink)}">Open in Sizzle</a></div>` : ''}
  <p class="tag">${(r.tags as string[] | null ?? []).map((t) => `#${esc(t)}`).join(' ')}</p>
</div></body></html>`;

  c.header('Cache-Control', 'public, max-age=600, s-maxage=3600');
  return c.html(html);
});

function page404(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="apple-touch-icon" sizes="180x180" href="${env.APP_ORIGIN}/apple-touch-icon.png"><link rel="icon" href="${env.APP_ORIGIN}/favicon.ico"><title>Recipe not found · Sizzle</title><meta name="robots" content="noindex"><style>body{margin:0;background:#0c0a09;color:#faf3ea;font-family:-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}a{color:#ff5a36}</style></head><body><div><h1>Recipe not found</h1><p>It may be private or removed. <a href="${env.APP_ORIGIN}">Explore Sizzle</a></p></div></body></html>`;
}

/**
 * GET /u/:handle — a crawlable, server-rendered profile page for shared profile
 * links. Public profiles unfurl with the cook's name/bio/avatar and their latest
 * dishes; private profiles render a minimal "this account is private" card
 * (noindex) so the link still lands somewhere sensible without leaking content.
 */
export const seoProfile = new Hono<AppEnv>();

seoProfile.get('/:handle', async (c) => {
  const handle = (c.req.param('handle') ?? '').trim().replace(/[^A-Za-z0-9_]/g, '');
  if (handle.length < 3 || handle.length > 30) return c.html(page404(), 404);

  const { data: p } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, handle, bio, avatar_url, banner_url, follower_count, private, banned')
    .ilike('handle', handle.replace(/_/g, '\\_'))
    .maybeSingle();
  if (!p || p.banned) return c.html(page404(), 404);

  const name = (p.display_name as string) || `@${p.handle}`;
  const url = `${env.APP_ORIGIN}/u/${p.handle}`;
  const appLink = `${env.APP_ORIGIN}/?u=${p.handle}`;
  const avatar = (p.avatar_url as string) || OG_FALLBACK();
  const ogImage = await ogImageTags(avatar);

  if (p.private) {
    const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="apple-touch-icon" sizes="180x180" href="${env.APP_ORIGIN}/apple-touch-icon.png"><link rel="icon" href="${env.APP_ORIGIN}/favicon.ico">
<title>${esc(name)} (@${esc(p.handle as string)}) · Sizzle</title>
<meta name="robots" content="noindex">
<meta property="og:type" content="profile">
<meta property="og:title" content="${esc(name)} on Sizzle">
<meta property="og:description" content="This account is private — follow ${esc(name)} on Sizzle to see their recipes.">
${ogImage}
<meta property="og:url" content="${esc(url)}">
<style>body{margin:0;background:#0c0a09;color:#faf3ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:20px}img{width:96px;height:96px;border-radius:28px;object-fit:cover}a{display:inline-block;background:linear-gradient(135deg,#ff5a36,#e23a18);color:#fff;text-decoration:none;font-weight:800;padding:14px 26px;border-radius:16px;margin-top:18px}</style>
</head><body><div>
  <img src="${esc(avatar)}" alt="${esc(name)}">
  <h1 style="margin:14px 0 2px">${esc(name)}</h1>
  <div style="color:#b8a99b">@${esc(p.handle as string)}</div>
  <p style="color:#b8a99b">🔒 This account is private. Request to follow in the app.</p>
  <a href="${esc(appLink)}">Open in Sizzle</a>
</div></body></html>`;
    c.header('Cache-Control', 'public, max-age=600');
    return c.html(html);
  }

  const { data: recipes } = await supabaseAdmin
    .from('recipes')
    .select('id, title, image_urls, video_asset_id')
    .eq('cook_id', p.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(6);
  const vidIds = (recipes ?? []).map((r) => r.video_asset_id).filter(Boolean) as string[];
  const posters = new Map<string, string>();
  if (vidIds.length) {
    const { data: vids } = await supabaseAdmin.from('video_assets').select('id, poster_url').in('id', vidIds);
    for (const v of vids ?? []) if (v.poster_url) posters.set(v.id as string, v.poster_url as string);
  }
  const dishes = (recipes ?? []).map((r) => ({
    id: r.id as string,
    title: (r.title as string) || 'A recipe',
    img: (r.video_asset_id && posters.get(r.video_asset_id as string)) || (Array.isArray(r.image_urls) && (r.image_urls[0] as string)) || '',
  }));

  const desc = (p.bio as string) || `${name} cooks on Sizzle — watch their recipes, then actually cook them.`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: { '@type': 'Person', name, alternateName: `@${p.handle}`, description: desc, image: avatar, url },
  };

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="apple-touch-icon" sizes="180x180" href="${env.APP_ORIGIN}/apple-touch-icon.png"><link rel="icon" href="${env.APP_ORIGIN}/favicon.ico">
<title>${esc(name)} (@${esc(p.handle as string)}) · Sizzle</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${esc(name)} on Sizzle">
<meta property="og:description" content="${esc(desc)}">
${ogImage}
<meta property="og:image:alt" content="${esc(name)} on Sizzle">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="Sizzle">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(name)} on Sizzle">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(avatar)}">
<script type="application/ld+json">${jsonLdScript(jsonLd)}</script>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#0c0a09;color:#faf3ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5}
  .wrap{max-width:680px;margin:0 auto;padding:24px 20px 64px;text-align:center}
  .avatar{width:104px;height:104px;border-radius:30px;object-fit:cover;background:#1a1613}
  h1{font-size:28px;margin:14px 0 2px;font-weight:800}
  .by{color:#b8a99b;font-size:15px}
  .bio{color:#d9cabb;margin:12px auto;max-width:480px}
  .cta{display:block;text-align:center;background:linear-gradient(135deg,#ff5a36,#e23a18);color:#fff;text-decoration:none;font-weight:800;padding:15px;border-radius:16px;margin:22px 0;font-size:16px}
  .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px}
  .grid a{display:block;position:relative;border-radius:14px;overflow:hidden;aspect-ratio:3/4;background:#1a1613}
  .grid img{width:100%;height:100%;object-fit:cover}
  .grid span{position:absolute;left:8px;right:8px;bottom:7px;color:#fff;font-size:12px;font-weight:700;text-shadow:0 1px 6px rgba(0,0,0,.8);text-align:left}
</style>
</head><body><div class="wrap">
  <img class="avatar" src="${esc(avatar)}" alt="${esc(name)}">
  <h1>${esc(name)}</h1>
  <div class="by">@${esc(p.handle as string)} · ${Number(p.follower_count ?? 0).toLocaleString()} followers</div>
  ${p.bio ? `<p class="bio">${esc(p.bio as string)}</p>` : ''}
  <a class="cta" href="${esc(appLink)}">Follow ${esc(name)} on Sizzle</a>
  ${dishes.length ? `<div class="grid">${dishes.map((d) => `<a href="${env.APP_ORIGIN}/r/${d.id}">${d.img ? `<img src="${esc(d.img)}" alt="${esc(d.title)}" loading="lazy">` : ''}<span>${esc(d.title)}</span></a>`).join('')}</div>` : ''}
</div></body></html>`;

  c.header('Cache-Control', 'public, max-age=600, s-maxage=3600');
  return c.html(html);
});

/**
 * GET /b/:id — crawlable public-board page (Pinterest-style shareable list).
 * Reuses the recipe-page OG pattern; private/unknown boards 404.
 */
export const seoBoard = new Hono<AppEnv>();

seoBoard.get('/:id', async (c) => {
  const id = (c.req.param('id') ?? '').trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return c.html(page404(), 404);

  const { data: col } = await supabaseAdmin.from('collections').select('id, name, user_id, is_public').eq('id', id).maybeSingle();
  if (!col || !col.is_public) return c.html(page404(), 404);
  const { data: owner } = await supabaseAdmin.from('profiles').select('display_name, handle, banned').eq('id', col.user_id).maybeSingle();
  if (!owner || owner.banned) return c.html(page404(), 404);

  const { data: items } = await supabaseAdmin.from('collection_recipes').select('recipe_id').eq('collection_id', id).limit(24);
  const rids = (items ?? []).map((r) => r.recipe_id as string);
  const { data: recs } = rids.length
    ? await supabaseAdmin.from('recipes').select('id, title, image_urls, video_asset_id, status').in('id', rids).eq('status', 'published')
    : { data: [] as Record<string, unknown>[] };
  const vidIds = (recs ?? []).map((r) => r.video_asset_id).filter(Boolean) as string[];
  const posters = new Map<string, string>();
  if (vidIds.length) {
    const { data: vids } = await supabaseAdmin.from('video_assets').select('id, poster_url').in('id', vidIds);
    for (const v of vids ?? []) if (v.poster_url) posters.set(v.id as string, v.poster_url as string);
  }
  const dishes = (recs ?? []).map((r) => ({
    id: r.id as string,
    title: (r.title as string) || 'A recipe',
    img: (r.video_asset_id && posters.get(r.video_asset_id as string)) || ((r.image_urls as string[] | null)?.[0] ?? ''),
  }));

  const ownerName = (owner.display_name as string) || `@${owner.handle}`;
  const url = `${env.APP_ORIGIN}/b/${col.id}`;
  const appLink = `${env.APP_ORIGIN}/?b=${col.id}`;
  const title = `${col.name} — a board by ${ownerName} · Sizzle`;
  const desc = `${dishes.length} recipe${dishes.length === 1 ? '' : 's'} curated by ${ownerName} on Sizzle.`;
  const hero = dishes.find((d) => d.img)?.img || OG_FALLBACK();
  const ogImage = await ogImageTags(hero);

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="apple-touch-icon" sizes="180x180" href="${env.APP_ORIGIN}/apple-touch-icon.png"><link rel="icon" href="${env.APP_ORIGIN}/favicon.ico">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(col.name as string)}">
<meta property="og:description" content="${esc(desc)}">
${ogImage}
<meta property="og:image:alt" content="${esc(col.name as string)}">
<meta property="og:url" content="${esc(url)}">
<link rel="canonical" href="${esc(url)}">
<style>body{margin:0;background:#0c0a09;color:#faf3ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:28px 20px 60px;max-width:760px;margin-inline:auto}h1{font-size:30px;margin:0}a.cta{display:inline-block;background:linear-gradient(135deg,#ff5a36,#e23a18);color:#fff;text-decoration:none;font-weight:800;padding:13px 24px;border-radius:14px;margin:18px 0 26px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}.card{position:relative;border-radius:14px;overflow:hidden;aspect-ratio:3/4;background:#241c17}.card img{width:100%;height:100%;object-fit:cover}.card span{position:absolute;left:10px;right:10px;bottom:9px;font-size:14px;font-weight:700;text-shadow:0 1px 4px rgba(0,0,0,.8)}</style>
</head><body>
  <div style="color:#b8a99b;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">A board by ${esc(ownerName)}</div>
  <h1>${esc(col.name as string)}</h1>
  <a class="cta" href="${esc(appLink)}">Open in Sizzle</a>
  <div class="grid">${dishes.map((d) => `<a class="card" href="${esc(`${env.APP_ORIGIN}/r/${d.id}`)}">${d.img ? `<img src="${esc(d.img)}" alt="${esc(d.title)}" loading="lazy">` : ''}<span>${esc(d.title)}</span></a>`).join('')}</div>
</body></html>`;
  c.header('Cache-Control', 'public, max-age=300');
  return c.html(html);
});
