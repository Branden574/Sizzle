import { Hono } from 'hono';
import { supabaseAdmin } from '../lib/supabase';
import { env } from '../env';
import type { AppEnv } from '../types';

export const seo = new Hono<AppEnv>();

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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
    .select('id, title, caption, cuisine, tags, image_urls, video_asset_id, cook_id, price_cents, visibility, status, servings, time_minutes')
    .eq('id', id)
    .maybeSingle();
  if (!r || r.status !== 'published') return c.html(page404(), 404);

  const [{ data: cook }, { data: video }, { data: ings }] = await Promise.all([
    supabaseAdmin.from('profiles').select('display_name, handle, avatar_url').eq('id', r.cook_id).maybeSingle(),
    r.video_asset_id ? supabaseAdmin.from('video_assets').select('poster_url').eq('id', r.video_asset_id).maybeSingle() : Promise.resolve({ data: null }),
    supabaseAdmin.from('recipe_ingredients').select('text').eq('recipe_id', id).order('position', { ascending: true }),
  ]);
  const { data: steps } = await supabaseAdmin.from('recipe_steps').select('text').eq('recipe_id', id).order('position', { ascending: true });

  const gated = r.price_cents != null || r.visibility === 'subscribers';
  const title = (r.title as string) || 'A recipe on Sizzle';
  const cookName = (cook?.display_name as string) || 'a Sizzle cook';
  const poster = (video?.poster_url as string) || (Array.isArray(r.image_urls) && r.image_urls[0]) || `${env.APP_ORIGIN}/og-default.jpg`;
  const desc = (r.caption as string) || `${title} by ${cookName} — watch it, then actually cook it on Sizzle.`;
  const ingredients = (ings ?? []).map((i) => i.text as string);
  const stepList = gated ? [] : (steps ?? []).map((s) => s.text as string);
  const url = `${env.APP_ORIGIN}/r/${id}`;
  const appLink = `${env.APP_ORIGIN}/?r=${id}`; // marketing/app deep link into this recipe

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
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Sizzle</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(poster)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="Sizzle">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(poster)}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Recipe not found · Sizzle</title><meta name="robots" content="noindex"><style>body{margin:0;background:#0c0a09;color:#faf3ea;font-family:-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}a{color:#ff5a36}</style></head><body><div><h1>Recipe not found</h1><p>It may be private or removed. <a href="${env.APP_ORIGIN}">Explore Sizzle</a></p></div></body></html>`;
}
