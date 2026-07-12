# Store assets

## screenshots/

Five App-Store / Play listing screenshots at **1290×2796 (6.9")** — the size App
Store Connect accepts for the primary iPhone slot (Play accepts the same PNGs).

| File | Screen |
|---|---|
| `01-feed.png` | Vertical recipe feed (Smoked Short Rib Tacos, live-fire) |
| `02-profile.png` | Creator profile — banner, avatar, recipe grid |
| `03-recipe-review.png` | Recipe / food-review detail with rating |
| `04-insights.png` | Creator analytics (views, retention, funnel) |
| `05-discover.png` | Discover — trending tags + recipe grid |

### How they were made
Captured on the iPhone 17 Pro Simulator against the local seeded backend, with a
clean status bar (`xcrun simctl status_bar … override`). The food photos, creator
avatars, and banners are **AI-generated demo content** (nano-banana / Higgsfield),
uploaded to local Supabase Storage and referenced from the seed rows
(`profiles.avatar_url` / `banner_url`, `recipes.image_urls`,
`video_assets.poster_url`). They represent the real app UI with realistic content —
replace with real creator content before/at launch.

Native capture was 1206×2622 (6.3"); resized to 1290×2796 (aspect ratio differs by
<0.3%, imperceptible). For maximum crispness you can re-capture on an iPhone 16/17
Pro Max Simulator (natively 1290×2796 / 1320×2868).

### Notes
- These images live in **local** Storage only — they won't survive a `db:reset`
  and aren't on production. To make the demo content permanent, host the images
  durably and set the URLs in the seed script.
- For screenshots, the demo recipes' playable video URLs were nulled so the recipe
  hero shows the food-photo poster instead of the placeholder test video; real
  recipe videos would replace both.
