# Sizzle Email System — Complete Build Spec

Distilled verbatim from the four sources of truth:

- **Board 01** `Sizzle Email Reset.dc.html` — password reset (4 modes), close-ups, resilience states, motion spec, developer handoff
- **Board 02** `Sizzle Email System.dc.html` — color, typography, spacing, buttons, alerts, modules, icons, animation concepts, engineering notes
- **Board 03** `Sizzle Email Templates.dc.html` — the 11 other templates
- `assets/README.txt` — brand asset variants

Machine-readable tokens: `partials/tokens.css.md` (and the earlier `partials/tokens.md`). Shared shell: `partials/base-skeleton.html`.
Every hex / px / radius / letter-spacing below is quoted VERBATIM from the boards — do not approximate or "improve".

---

## 1. Engineering ground rules (non-negotiable)

- `<html lang="en">`; **600px hybrid table layout**; `role="presentation"` on EVERY layout table; MSO ghost tables + VML conditionals for Outlook; `x-apple-disable-message-reformatting`.
- **Single column stacks at ≤480px** via media query (+ fluid fallback). **All spacing is CELL PADDING — never margins on tables** (text elements use `margin:0` inside padded cells).
- **Hidden preheader span** (~80 chars, distinct per template, padded with `&zwnj;&nbsp;`) before any visible content. **No JavaScript anywhere.**
- **Bulletproof CTA:** VML roundrect for Outlook + padded `<a>` for everyone else. Min tap height **52px** (pad 16/24), radius **13px**. Gradient via CSS where supported, flat `#E2331C` bgcolor fallback.
- **Dark mode:** `<meta name="color-scheme" content="light dark">` (+ `supported-color-schemes`) and `@media (prefers-color-scheme: dark)`. **Bookends stay `#0C0A09` in BOTH modes.** Body card `#FFFFFF → #14100D` on `#050404`; ink `#1B1512 → #F5EFE6`. **Never pure `#000`/`#FFF` body text** (Gmail inversion artifacts). Test Gmail auto-invert against the transparent-PNG marks.
- **Fonts:** Instrument Serif → Georgia serif stack (headlines); Hanken Grotesk → `'Helvetica Neue',Helvetica,Arial` (body); Menlo/Consolas mono (codes + URLs). Web fonts via `@import` guarded so Outlook ignores them (`<!--[if !mso]><!-->…<!--<![endif]-->`; an `[if mso]` block forces Helvetica/Georgia/Consolas). **No text baked into images.**
- **Images:** brand marks from `https://getsizzle.app/email/<file>.png` (absolute URLs), **@2x with explicit `width`/`height` HTML attributes and alt text**. Inline SVGs on the boards ship as @2x PNGs (SVG unsupported in Gmail/Outlook).
- **Hero art:** each hero is an `<img>` slot at `https://getsizzle.app/email/hero-<template>.png` — static @2x first frame per the motion spec ("**first frame is the finished composition**"). APNG/GIF upgrades later swap bytes at the same URL; the HTML never changes.
- **Accessibility:** body ≥14.5px; contrast ≥4.5:1 (board-verified: violet `#6C4BB8` on white = 6.2:1; `#5C5248` on white = 7.4:1); tap targets ≥44px; semantic `<h1>`/`<p>`; **state = icon + label + color, never color alone**; logical reading order; descriptive CTA labels; `lang` per locale.
- **Weight budget:** ≤102 KB HTML per email, ≤600 KB with images.
- **Plain-text twins** (`txt/<template>.txt`): mirror content order, 70-col wrapped, every URL on its own line.

---

## 2. Design tokens (full table, with usage)

### 2.1 Font stacks

| Role | Stack | Usage |
|---|---|---|
| Serif | `'Instrument Serif',Georgia,serif` | H1s, wordmark, milestone numbers, payout amount, step numerals — always weight 400 |
| Sans | `'Hanken Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif` | everything else (400/500/600/700/800) |
| Mono | `ui-monospace,Menlo,Consolas,monospace` | header tag, card labels, verification codes, fallback URLs, badge kickers, durations |

Google Fonts: `Instrument+Serif:ital@0;1` + `Hanken+Grotesk:wght@400;500;600;700;800`.

### 2.2 Type scale

| Style | Spec (desktop · mobile) | Color light / dark | Usage |
|---|---|---|---|
| Eyebrow | 11 / 800 / +.22em caps · 10.5 mobile | family accent | "ACCOUNT SECURITY", "MILESTONE UNLOCKED"… |
| Hero H1 | Instrument Serif **33 / 1.15** · 28 / 1.16 mobile | `#1B1512` / `#F5EFE6` | standard headline (reset, verify, 100K-views) |
| Hero H1 · celebration | 36 / 1.12 | same | welcome, 1K club, creator-approved |
| Hero H1 · variants | 34/1.13 (eligible) · 32/1.15 (new-login, almost-eligible) · 29/1.18 (digest, policy) | same | |
| Section heading | 20 / 800 / 1.3 | ink | "What happens next" |
| Body | 15 / 1.65 · 14.5 / 1.6 mobile | `#5C5248` / `#B3A698` | max-width 420–470 per template |
| Supporting | 13.5 / 1.6 (also 13 / 1.6) | `#8A7C70` both | expiry lines, escape-hatch copy |
| Button | 16 / 800 (letter-spacing .01em on reset CTA) · paired/secondary 15 / 800–700 | white on ember · `#1B1512` on gold | |
| Header tag | mono 10 / .18em caps · 9 / .16em mobile | `#8A7C70` (gold families `#FFD23A`) | right side of header bookend |
| Card label | mono 10 / .16em caps (mobile 9.5) | `#8A7C70` | "REQUEST DETAILS", "FIRST STEPS", "WHAT YOU UNLOCK" |
| Verification code | mono / 600 / .22em — Board 02 ramp says 34/.18em; module close-up 36/.22em; verify-email comp **30/.22em** (`padding-left:.22em` to optically center) | ink | see Ambiguity #2 |
| Milestone number | Instrument Serif 96 / 1 gradient (ramp) — comps: 124 (1K), 88 (100K), 74 (share card), 56 (payout $) | gradient / `#F5EFE6` (payout) | ships inside hero image in email |
| Stat number | 28 / 800 + caption 12 (ramp) — tiles in comps: 19–22 / 800 + caption 9.5–10.5 / .1em | ink / `#F5EFE6` | |
| Legal | 11.5 / 1.7 (compact comps 11 / 1.7) | `#6C5F56` on bookend | footer why-line + address |
| Footer links | 12.5 (compact 12) | `#B3A698` | |
| Fallback URL | mono 12 | `#6C4BB8` / `#B79BF0` | `word-break:break-all` |
| Store badge | kicker mono 8.5 / .1em `#8A7C70` + name 13 / 700 `#F5EFE6` | | bordered-text badges |

### 2.3 Surfaces

| Token | Light | Dark | Usage |
|---|---|---|---|
| Page | `#F5EFE6` | `#050404` | behind the card |
| Card | `#FFFFFF` | `#14100D` | email body |
| Sunken / elevated card | `#FAF4EA` | `#1D1712` | detail cards, code blocks, alerts |
| Border | `#EDE3D3` | `rgba(255,255,255,.08)` swatch ("WHITE 8%"); applied comps use `.07` (tiles `.06`) | 1px everywhere |
| Ink | `#1B1512` | `#F5EFE6` | headlines, strong values |
| Secondary | `#5C5248` | `#B3A698` | body copy |
| Muted | `#8A7C70` | `#8A7C70` | labels, meta — unchanged across modes |
| Bookend | `#0C0A09` | `#0C0A09` | header + footer, **never changes** |
| Legal text | `#6C5F56` | `#6C5F56` | on bookend |

### 2.4 Accents & semantics

| Token | Value | Usage |
|---|---|---|
| Primary ember CTA | `linear-gradient(100deg,#FF8A2C,#FF5320 55%,#E2331C)` · flat fallback `#E2331C` · **mode-invariant** | primary buttons, heroes only — never behind body text |
| CTA hover (web view only) | darkens 6% → `#F07A20,#E84616 55%,#C42B14`; lifts 1px; shadow `0 12px 30px -10px rgba(226,51,28,.65)`; 120ms ease-out | |
| CTA pressed | `#E06E1C,#D63E12 55%,#B02510`; returns +1px; shadow `0 5px 14px -8px rgba(226,51,28,.6)` | |
| Flame gold | `#FFD23A` · on light surfaces `#C79A3B` | milestone/creator family |
| Hot magenta | `#E02F80` — accents only | like icon, gradient tails |
| Security violet | light `#6C4BB8` / dark `#9D7FE0` · hero stroke `#7E5BC2` · dark button text `#B79BF0`, border `rgba(157,127,224,.6)` | security family |
| Success | light `#2E9E6B` / dark `#4CC38A` · deep label `#1F7A50` | payouts, checks, deltas |
| Warning | light `#C77E14` / dark `#F0A93C` · deep label `#9C6210` | almost-eligible, payment needed |
| Error | light `#C42B14` / dark `#FF6A4D` · deep label `#A32310` | removals, blocked sign-ins, "never share" |
| Creator gold gradient | `#FFD23A→#FF8A2C` — **program family only** | progress fills, hairline |
| Creator gold CTA | `linear-gradient(100deg,#FFD23A,#FF8A2C 60%,#FF5320)` · **text `#1B1512`** · shadow `0 10px 30px -10px rgba(255,210,58,.45)` · flat fallback `#FF8A2C` | apply / set-up-monetization |
| Text link | light `#C2451F` 700 / dark `#FF7A4A` | "Contact Sizzle Support" |
| Secondary outline (dark brand) | text `#FF9A6B`, border 1.5px `rgba(255,122,74,.65)` | "Discover creators", "View my analytics" |
| Milestone number gradient | `linear-gradient(120deg,#FFD23A,#FF5320 55%,#E02F80)` (100K comp: 60% stop) | background-clip:text — email: baked in hero |
| Hairline · flame animated | `linear-gradient(90deg,#FFD23A,#FF7A2A,#FF5320,#E02F80,#8A1C66,#FFD23A)` size 200% | 8s shimmer loop |
| Hairline · flame static | `linear-gradient(90deg,#FFD23A,#FF7A2A,#FF5320,#E02F80,#8A1C66)` · flat `#FF5320` | CSS fallback |
| Hairline · creator gold | `linear-gradient(90deg,#FFD23A,#FF8A2C,#FFD23A)` · flat `#FF8A2C` | creator family |
| Hairline · policy | solid `#3A322B` | content-removed only |
| Avatar fallback (ember) | `radial-gradient(120% 120% at 30% 25%, #FFB27A, #E2331C)` + white 800 initial | no photo |
| Avatar fallback (violet) | `radial-gradient(120% 120% at 30% 25%, #B79BF0, #36103F)` | |
| Avatar gradient ring | `linear-gradient(135deg,#FFD23A,#FF5320,#E02F80)` 2px pad | milestone profile card |
| Creator badge ring | `linear-gradient(135deg,#FFD23A,#FF8A2C 55%,#E2331C)` over `#0C0A09` disc | badge module |

**Gradient rules:** ember gradient on CTAs and heroes only — never behind body text. **One celebration gradient per email, max.**

### 2.5 Spacing (handoff card, verbatim)

| Measure | Value |
|---|---|
| Email width | **600px** · breakpoint **480px** (mobile comps at 375) |
| Outer gutter | **20px** |
| Header padding | **18 / 32** (mobile 16 / 22) |
| Body padding desktop | **44px** (digest 36/40 · policy 40/44) |
| Body padding mobile | **30 / 22** |
| Between sections | **26–34px** |
| Heading → body | **14px** |
| Body → CTA | **28px** |
| Card internal padding | **22 / 24** (mobile 18) |
| Footer padding | **26 / 32** (Board-03 compact comps 20/32 — see Ambiguity #3) |
| Hairline | **3px** |

### 2.6 Radii & borders

| Element | Value |
|---|---|
| Email card | **24px** (20 mobile) |
| Inner card / alert | 16px (mobile 14) |
| Button | **13px** |
| Code block | 14px |
| Chip / pill | 999px |
| Thumbnail | 12px (small 10) |
| Avatar | 50% |
| Fallback-URL block / small escape btn | 10px |
| Icon tile (policy) | 14px |
| Border weight | **1px** (outline buttons 1.5px · paired big outlines 2px) |

### 2.7 Elevation (decorative only — clients may drop)

- Card shadow: `0 24px 60px -30px rgba(27,21,18,.3)` · dark `0 24px 60px -30px rgba(255,83,32,.16)` (gold family: `0 24px 70px -30px rgba(255,210,58,.18)`, approved `0 28px 80px -30px rgba(255,210,58,.22)`)
- CTA glow: `0 10px 26px -10px rgba(226,51,28,.55)` · dark `0 10px 30px -10px rgba(255,83,32,.5)` · gold `0 10px 30px -10px rgba(255,210,58,.45)`
- Hero halos are radial-gradient divs **baked into exported assets, never CSS filters**.

### 2.8 Buttons

| Variant | Spec |
|---|---|
| Primary ember | gradient §2.4, white 16/800, pad 16/24 (+20px line-height = 52px), radius 13, VML `arcsize 25%`, flat `#E2331C`, max total width 380 (digest 360), full-width ≤480 |
| Primary gold | gold gradient, **ink `#1B1512` text**, flat `#FF8A2C` |
| Secondary outline | 1.5px border, pad 13/24 (12/18 in system sheet; small escape-hatch pad 9/14 radius 10), colors per family |
| Solid neutral | bg `#1B1512` white text ("This was me", "Appeal this decision"); dark-mode remap → bg `#F5EFE6` ink text |
| Paired 50/50 | gap 12; solid 15/800 pad 15/18 + outline 2px pad 13/18 |
| Text link | underlined `#C2451F` 14.5/700 |

Padding-built, never fixed height — long localized strings (German/Finnish) wrap to two lines and stay tappable. Long emails: `word-break:break-all`.

### 2.9 Alerts (radius 16, pad 16/20, icon 20px/1.8 stroke, title 14.5/800, body 13.5/1.55; tints ≤9% alpha)

| State | Light: tint / border / title | Dark: tint / border / title |
|---|---|---|
| Success | `rgba(46,158,107,.09)` / `.3` / `#1F7A50` | `rgba(76,195,138,.09)` / `.3` / `#4CC38A` |
| Warning | `rgba(199,126,20,.09)` / `.35` / `#9C6210` | `rgba(240,169,60,.09)` / `.3` / `#F0A93C` |
| Error | `rgba(196,43,20,.08)` / `.32` / `#A32310` | `rgba(255,106,77,.09)` / `.3` / `#FF6A4D` |
| Security | `rgba(108,75,184,.08)` / `.3` / `#5A3DA0` | `rgba(157,127,224,.09)` / `.3` / `#B79BF0` |
| Neutral | `#FAF4EA` / `#EDE3D3` / `#1B1512` | `#1D1712` / `rgba(255,255,255,.07)` / `#F5EFE6` |

### 2.10 Icons & modules

- **Icons:** 20px grid, 1.8px round stroke, warm-neutral ink `#5C5248`; semantic color only when carrying state; exported PNG @2x. Set: clock, shield, lock, check, alert, chart, play, follower, like (`#E02F80`), comment.
- **Code block:** sunken card radius 14, code mono 600 with `padding-left:.22em`; under it clock + "Expires in 10 minutes · **never share this code**" (`#A32310`).
- **Progress bar:** track 8–9px `rgba(255,255,255,.08–.09)` (bgcolor fallback `#2F2A25`) radius 999; fill `linear-gradient(90deg,#FFD23A,#FF8A2C)` (generic module: `#FFD23A,#FF5320`).
- **Eligibility chips:** pill 11.5/800/.06em pad 5/12 — ELIGIBLE `#4CC38A`/`rgba(76,195,138,.12)`/border `.35`; ALMOST ELIGIBLE `#F0A93C`; NOT YET ELIGIBLE `#B3A698`/`rgba(255,255,255,.07)`/border `.18`; UNDER REVIEW `#B79BF0`. **Chips state facts only — "almost" never implies approval.**
- **Avatar:** 46px; fallback ember-tint initial; long handles truncate one-line ellipsis; no display name → @handle.
- **Milestone share card:** `#0C0A09` r18, halo `rgba(255,83,32,.25)`, mark 30, number 74 gradient, "FOLLOWERS" 12/800/.2em `#B3A698`, handle 14/700, date 12 `#8A7C70`.
- **Creator badge:** L 104 (inset-4 disc `#0C0A09`, mark 34, outer ring 1px `rgba(255,210,58,.35)` at −7; label "SIZZLE CREATOR" 10.5/800/.22em `#FFD23A`) · S 44 (inset 2, mark 16).
- **Stat tiles:** dark `#1D1712`/border `.06` · light `#FAF4EA`/`#EDE3D3`; r12 pad 14/8; number 19–22/800; caption 9.5–10.5/.1em `#8A7C70`.
- **Analytics bars:** 6–7 bars gap 6–7, radius 3–4 top, ramp `rgba(255,122,42,.35→.8)`, peak `linear-gradient(180deg,#FFD23A,#FF5320)`, axis 10–10.5 `#8A7C70` (email: server-rendered `{{chart_image_url}}`, axis labels live text).
- **Content preview:** thumb 104×74 r12 (export "THUMBNAIL 208×148 @2x"), play disc 26 `rgba(12,10,9,.75)`, duration chip mono 9.
- **Profile row:** avatar 54 gradient ring, name 15/800 + @handle `#8A7C70` 500, "View" pill `#1B1512` white 13/800 pad 9/16.
- **Divider:** 1px `#EDE3D3` flanking 14px mark @ .75 opacity.
- **App banner:** `#0C0A09` r14 pad 18/20; `sizzle-icon-180.png` 40px r10; "Sizzle is better in the app" 13.5/800; "Get the app" pill `#F5EFE6` ink 12.5/800.
- **Support line:** "Need help? **Contact Sizzle Support**" — "real humans, usually within a day."

---

## 3. Shared skeleton (every template)

Order: preheader → header → hairline → body card → footer.

1. **Header** — bookend `#0C0A09` pad 18/32 (16/22 mobile). Left: `sizzle-mark-flat-512.png` 22×28 (artwork 4:5; mobile 20) + "Sizzle" Instrument Serif 20 `#FFFFFF` (18 mobile). Right: mono tag 10/.18em (9/.16em mobile) — text/color per template.
2. **Hairline** — 3px, per family (§2.4); animated-GIF upgrade slot, static CSS gradient is the sanctioned fallback.
3. **Body card** — `#FFFFFF`/`#14100D`, radius 24 (20 mobile), pad 44 (30/22 mobile); centered except detail cards/digest/policy (left).
4. **Footer** — bookend pad 26/32 (mobile 20/22, centered). `sizzle-mark-white-512.png` 15×19 @ .9 (13 mobile) + "Sizzle" serif 16 `#F5EFE6` (15). Links 12.5 `#B3A698`: Help Center · Privacy · Terms · Support (+ per-template extras). **App Store + Google Play bordered-text badges** (border `1px rgba(255,255,255,.22)` r9 pad 7/14; "DOWNLOAD ON THE"/"GET IT ON" mono 8.5/.1em `#8A7C70`; name 13/700 `#F5EFE6`) — text, never images (official artwork swap is a production decision). Then the **"why you got this" line — ALWAYS present** — 11.5/1.7 `#6C5F56`, and `Sizzle Inc · 1550 Vine Street, Los Angeles, CA 90028 · © 2026 Sizzle Inc.`
   Footer is **identical in light and dark** — the charcoal bookend is the brand constant. White silhouette mark for small sizes. No unsubscribe on required security email.

**Detail-card pattern:** sunken card r16 pad 22/24; mono label; 2-col grid label 100px (76 mobile) col-gap 16 row-gap 10, 13.5px, values 600. Location is **city-level only, always tagged "(approximate)"**. The escape hatch ("Secure my account") lives WITH the evidence, in security violet, so it never competes with the ember CTA.

---

## 4. Dark-mode value map (`@media (prefers-color-scheme: dark)`)

| Element | Light → Dark |
|---|---|
| Page | `#F5EFE6` → `#050404` |
| Card | `#FFFFFF` → `#14100D` |
| Sunken card | `#FAF4EA` → `#1D1712` |
| Border | `#EDE3D3` → `rgba(255,255,255,.07)` |
| Ink | `#1B1512` → `#F5EFE6` |
| Body | `#5C5248` → `#B3A698` |
| Muted `#8A7C70` | unchanged |
| Violet accent | `#6C4BB8` → `#9D7FE0` · outline btn `#B79BF0` / `rgba(157,127,224,.6)` · fallback URL `#B79BF0` |
| Hero shield | stroke `#7E5BC2`→`#9D7FE0` · fill `rgba(126,91,194,.09)`→`rgba(157,127,224,.12)` · halo `rgba(126,91,194,.30)`→`rgba(157,127,224,.26)` |
| Support link | `#C2451F` → `#FF7A4A` |
| Gold on surface | `#C79A3B` → `#FFD23A` |
| Success / Warning / Error | `#2E9E6B→#4CC38A` · `#C77E14→#F0A93C` · `#C42B14→#FF6A4D` |
| Solid `#1B1512` buttons | → bg `#F5EFE6` / ink text (System dark-neutral pairing) |
| CTA gradient + white label | unchanged (one asset, both themes) |
| CTA shadow | `rgba(226,51,28,.55)` → `rgba(255,83,32,.5)` |
| Card shadow | ink 30% → `rgba(255,83,32,.16)` |
| Bookends / footer | unchanged `#0C0A09` |

Dark-native templates (welcome, milestones, creator family, payout) are designed on `#14100D` and ship dark in both OS modes; adaptive templates (reset, verify, new-login, weekly, policy) are light-base + this map.

---

## 5. Motion & export spec

Email = no JS, unreliable CSS. Everything ships as **APNG (GIF fallback), frame 1 fully composed** — Outlook and reduced-motion clients hold frame 1; nothing looks broken or half-loaded. Security: restrained (quiet motions only — halo, embers, hairline; "no confetti, no flashing"). Milestones: celebratory. **Loops never faster than 2.5s (reset board: ≥2.8s), never flashing/strobing.**

| Asset | Motion | Timing / loop | Delivery | Static fallback | Reduced motion |
|---|---|---|---|---|---|
| Shield halo (reset) | violet glow eases 45%→85% opacity, scale 1→1.07 | 3.2s · ease · ∞ | **APNG 300×340 @2x · ≤180 KB** · GIF fallback | frame 1 = mid-glow, fully composed | static PNG variant |
| Embers (reset) | 3 sparks drift up 11px, fade, staggered 0.6s | 2.8s · ease-out · ∞ | baked into shield APNG (one asset) | sparks at rest positions | omitted |
| Header hairline | flame gradient slides one full cycle, seamless | 8s · linear · ∞ | **GIF 1200×6 · ≤35 KB** | static CSS gradient (zero-cost) | static CSS gradient |
| CTA hover | web view only: darkens 6%, lifts 1px; pressed +1px, shadow tightens | 120ms · ease-out | CSS in supported clients | no hover | color change only |
| Logo glow (welcome, verified) | halo breathes 45→85% | 3.6s · ease · ∞ | **APNG 480×420 @2x · ≤220 KB** | mid-glow frame | static PNG |
| Flame flicker (streaks, hot content) | ±1.2° sway, 0.98–1.04 scale | 2.6s · ∞ | **APNG 320×400 · ≤160 KB** | upright frame | omit |
| Check draw (verified, payout, success) | stroke draws 0.9s, holds 1.5s | plays **3×** then stops (GIF loop=3) | **APNG 240×240 · ≤90 KB** | complete check | complete check |
| Ember confetti (**milestones only**) | ≤12 brand-color sparks fall + rotate, sparse | 3s · ∞ | **APNG 600×400 · ≤350 KB** | sparks mid-air | static number, no particles |
| Number counter (view milestones) | rolls last ~15% of range, eases to rest, holds | plays **once** (GIF loop=1) | **400×140 · ≤120 KB** | final number | final number |

---

## 6. Hero slots (per template)

Slugs below match the shipped files. Sizes are display px (file is @2x).

| Template | Hero file | Display | Composition | Alt |
|---|---|---|---|---|
| password-reset | `hero-password-reset.png` | 150×170 stage (art 94×106, halo 150) | violet shield (stroke `#7E5BC2` 3px, fill `rgba(126,91,194,.09)`) + pulse waveform gradient `#FFD23A→#FF7A2A 55%→#E02F80` 3.4px round + 3 embers `#FF9A3A`; violet halo | "Shield with Sizzle pulse" |
| verify-email | `hero-verify-email.png` | 130×130 (art 92, halo 130) | violet circle stroke `#7E5BC2` 2.2 + gradient check `#FF8A2C→#E02F80` 3px | "Gradient check mark drawing inside a violet ring" |
| welcome | `hero-welcome.png` | 190×190 (mark 104, halo 190) | full-colour glow mark (`sizzle-mark-512`) on warm halo `rgba(255,83,32,.3)→rgba(224,47,128,.14) 55%` | "The Sizzle flame in a warm glow" |
| new-login | `hero-new-login.png` | 130×104 (art 96×76, halo 124) | violet laptop (rect stroke `#7E5BC2` 3, rx6 + base line) with pulse `#FF7A2A` | "A new device showing the Sizzle pulse" |
| milestone-1k-followers | `hero-milestone-1k-followers.png` | 220×190 (numeral 124, halo 220 `rgba(255,83,32,.32)`) | "1K" serif gradient `120deg #FFD23A→#FF5320 55%→#E02F80` + embers | "1K in flame-gradient numerals with drifting embers" |
| milestone-100k-views | `hero-milestone-100k-views.png` | 200×160 (numeral 88 + "VIEWS" 12/800/.26em `#B3A698`, halo 200) | "100K" gradient (60% stop) | "100K VIEWS in flame-gradient numerals" |
| creator-almost-eligible | `hero-creator-almost-eligible.png` | 96×96 | gold progress ring: track `rgba(255,255,255,.09)` 7px; arc gold gradient round-cap (comp: 79% = dasharray 264 offset 55.4) — **percent stays live text** (dynamic values never bake into assets) | "Gold progress ring" |
| creator-eligible | `hero-creator-eligible.png` | 134×134 (badge 118, halo 200 `rgba(255,210,58,.24)`) | gold badge ring `135deg #FFD23A→#FF8A2C 55%→#E2331C`, inset-5 disc `#0C0A09`, mark 40, outer ring `rgba(255,210,58,.4)` at −8 | "Gold Sizzle Creator badge" |
| creator-approved | `hero-creator-approved.png` | 168×168 (badge 132, halo 230) | badge + mono "CREATOR" 7.5/.22em `#FFD23A`, double rings (`.45` at −9, `.18` at −18) + gold confetti | "Gold Sizzle Creator badge with a double ring and drifting embers" |
| weekly-summary | — (no hero) | — | digest opens with eyebrow + H1 + stat tiles | — |
| payout-completed | `hero-payout-completed.png` | 132×110 (art 92, halo 132 green `rgba(76,195,138,.2)`) | green circle stroke `#4CC38A` 2.2, fill `rgba(76,195,138,.08)` + check `#4CC38A` 3px | "Green check mark for a completed payout" |
| content-removed | `hero-content-removed.png` | 24×24 inside 52px static tile (`#FAF4EA`/`#EDE3D3` r14) | minus-circle `#C42B14` — **no halo, no motion, ever** | "Removed video" |

Images-blocked resilience (Board 01): wordmark, headline, CTA and details survive with zero images; alt text describes the hero; gradient CTA falls back to flat Heat red.

---

## 7. Per-template spec

Global variables on every template: `{{help_url}} {{privacy_url}} {{terms_url}} {{support_url}} {{appstore_url}} {{play_url}}`.
Subject lines are NOT defined on the boards — the values below are the kit's proposals (aligned with each template's baked `<title>`); confirm before wiring the mailer. Preheaders below are the ones already baked into the HTML. Body copy is verbatim from the boards.

### 7.1 `password-reset` — Board 01, the reference implementation
- **Subject:** Reset your Sizzle password
- **Preheader:** "Reset your Sizzle password — this secure link expires in {{expiry_minutes}} minutes."
- Header tag `ACCOUNT SECURITY` `#8A7C70` · flame hairline (animated on comp) · accent security violet · adaptive light/dark.
- Blocks: hero shield → eyebrow `ACCOUNT SECURITY` (`#6C4BB8`/`#9D7FE0`) → H1 33 **"Reset your Sizzle password"** → body max-430: "We received a request to reset the password for **{{email}}**. Select the button below to choose a new one — it takes about a minute." → CTA **"Reset password"** (max-width 380) → clock row 13: "This secure link expires in **{{expiry_minutes}} minutes**." → REQUEST DETAILS card: Device `{{device}}` · Location `{{location}}` "(approximate)" · Time `{{time}}`; divider; "Wasn't you? Your password is still safe — lock things down in one tap." + violet outline **"Secure my account"** (1.5px, pad 9/14, r10; mobile full-width pad 11/14) → 13px: "If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged." → "Button not working? Paste this link into your browser:" + mono URL block (r10 pad 12/14, `{{action_url}}`, `word-break:break-all`) → "Need help? **Contact Sizzle Support**".
- Mobile copy tightens: "…choose a new one." / "Expires in 30 minutes." / "Didn't request this? You can safely ignore this email — your password stays unchanged."
- Footer why: "You received this email because a password reset was requested for your Sizzle account." **No unsubscribe.**
- Vars: `{{email}} {{action_url}} {{expiry_minutes}} {{device}} {{location}} {{time}} {{secure_url}}`
- Motion: shield halo + embers + hairline (§5 rows 1–3).

### 7.2 `verify-email`
- **Subject:** Confirm your email · **Preheader:** "Confirm {{email}} to finish creating your Sizzle account — your code is inside."
- Header tag `ACCOUNT SECURITY` · flame hairline · violet accent · adaptive. Body pad 42/44.
- Blocks: hero check-circle (110 stage) → eyebrow `ONE LAST STEP` `#6C4BB8` → H1 33 **"Confirm your email"** → body max-420: "You're seconds away from your first Sizzle. Confirm **{{email}}** so we know it's really you." → CTA **"Verify my email"** → "Or enter this code in the app:" 12.5 `#8A7C70` → code block max-300 pad 16 r14 (`{{code}}` mono 30/.22em/600, `padding-left:.22em`) → clock row: "Code expires in 10 minutes · **never share it**" (`#A32310`) → "Didn't create a Sizzle account? Ignore this email and the account won't be activated."
- Footer links: Help Center · Privacy · Terms. Why: "Sent because this address was used to create a Sizzle account." **No unsubscribe.**
- Vars: `{{email}} {{action_url}} {{code}} {{expiry_minutes}}` · Motion: check draw (loop 3×) + hairline.

### 7.3 `welcome`
- **Subject:** Welcome to Sizzle · **Preheader:** "You're in, {{name}} — set up your profile and meet your first creators."
- Dark-native comp. Header tag `WELCOME` `#8A7C70` · flame hairline · ember accent. Body pad 46/44.
- Blocks: hero glow-mark 104 (150 stage) → eyebrow `YOU'RE IN` `#FF9A3A` → H1 36/1.12 **"Welcome to Sizzle, {{name}}"** → body max-430: "Sixty-second videos from creators who actually make things. Watch, remix, and when you're ready — hit record." → CTA **"Set up my profile"** → secondary outline **"Discover creators"** (12 below, pad 13/24, `#FF9A6B`/`rgba(255,122,74,.65)`) → FIRST STEPS card (left; 3 rows: 26px circles, serif numerals 14; tints 1 `rgba(255,138,44,.15)`/`#FF9A3A` · 2 `rgba(255,83,32,.15)`/`#FF7A4A` · 3 `rgba(224,47,128,.15)`/`#FF5A9A`; copy 14 `#F5EFE6`: "Add a photo and bio — profiles with faces get 4× more follows" / "Follow 5 creators to tune your feed" / "Post your first Sizzle — 60 seconds, no pressure").
- Footer links + Notification settings. Why: "Sent because you created a Sizzle account." **No unsubscribe.**
- Vars: `{{name}} {{action_url}} {{secondary_url}} {{settings_url}}` · Motion: logo glow APNG (3.6s) + hairline.

### 7.4 `new-login`
- **Subject:** Was this you? New sign-in to your Sizzle account · **Preheader:** "New sign-in to your Sizzle account from {{device}} near {{location}} — was this you?"
- Header tag `ACCOUNT SECURITY` · flame hairline (comp shows static) · violet · adaptive. Body 42/44.
- Blocks: hero laptop-pulse (104 stage) → eyebrow `NEW SIGN-IN` `#6C4BB8` → H1 32 **"Was this you?"** → body max-430: "Your Sizzle account was just opened on a device we haven't seen before. If this was you, you're all set — no action needed." → SIGN-IN DETAILS card (Device "Safari on iPhone 16"→`{{device}}` · Location + "(approximate)" · Time) → paired buttons: solid `#1B1512` **"This was me"** + violet 2px outline **"Secure my account"** → 13px: "“Secure my account” signs out all devices and walks you through a password change — takes under two minutes."
- Footer why: "Security alerts can't be turned off — they keep your account safe." **No unsubscribe.**
- Vars: `{{device}} {{location}} {{time}} {{confirm_url}} {{secure_url}}` · Motion: quiet halo only (3.4s).

### 7.5 `milestone-1k-followers` (pattern for follower milestones — "100 followers gets a card, 1K gets confetti, 1M gets the full gold treatment"; celebration gradient once per email)
- **Subject:** Welcome to the 1K club · **Preheader:** "1,000 people now follow {{handle}} on Sizzle — welcome to the 1K club."
- Dark-native. Header tag `MILESTONE` **`#FFD23A`** · flame hairline animated · confetti overlay (5 sparks 5–7px: `#FFD23A` `#FF7A2A` `#E02F80` `#FFD23A` `#FF5320`, squares r2 + dots).
- Blocks: hero "1K" 124 gradient (170 stage) → eyebrow `MILESTONE UNLOCKED` `#FFD23A` → H1 36/1.12 **"Welcome to the 1K club"** → body: "Your Sizzle community is growing. One thousand people have chosen to follow your journey — and they're watching." → profile card (avatar 56 gradient ring; `{{handle}}` 15.5/800; "{{follower_count}} followers · reached {{date}}"; right "+{{monthly_gain}}" 20/800 `#4CC38A` / "THIS MONTH" 10.5/.1em) → CTA **"Share the milestone"** → secondary **"View my analytics"** → 13px max-400: "At 10K followers you unlock the Creator Program — monetization, analytics and priority support. **See creator tools →**" (`#FF9A6B`).
- Footer + Notification settings. Why: "Milestone emails are on — manage them in notification settings." **`{{unsubscribe_url}}` REQUIRED + List-Unsubscribe headers.**
- Vars: `{{handle}} {{avatar_url}} {{follower_count}} {{monthly_gain}} {{date}} {{action_url}} {{analytics_url}} {{creator_tools_url}} {{settings_url}} {{unsubscribe_url}}` · Motion: ember confetti APNG + glow + hairline.

### 7.6 `milestone-100k-views` (pattern for view milestones)
- **Subject:** Your video just crossed 100K views · **Preheader:** "“{{video_title}}” just crossed 100,000 views — see the full breakdown."
- Dark-native. Header tag `MILESTONE` `#FFD23A` · flame hairline animated.
- Blocks: hero "100K / VIEWS" (130 stage) → H1 33 `{{headline}}` (comp: **"Your ramen video is on fire"**) → body: "“Midnight ramen, but make it fancy” just crossed 100,000 views — your biggest Sizzle yet." → video card (thumb 110×78 r12, play disc `rgba(255,83,32,.9)` 28, duration chip; title 14.5/700; "posted {{post_date}} · {{days_to_milestone}} days to 100K") → 4 stat tiles 19/800 (VIEWS · LIKES · SHARES · COMMENTS) → analytics-bars card (`{{chart_image_url}}`; axis "JUL 12 / VIEWS PER DAY · PEAK JUL 15 / JUL 16" 10 live text) → CTA **"View full analytics"** → Creator-Program nudge card (amber `rgba(240,169,60,.07)`/border `.3` r16 pad 20/24: "Creator Program · almost eligible" 14.5/800 `#F0A93C` + "{{eligibility_pct}}%" pill; gold bar 8px; "Qualified views: done ✓ · 1,580 more followers to go. Eligibility is confirmed by review once thresholds are met." 12.5).
- Footer = milestone footer. **`{{unsubscribe_url}}` REQUIRED + List-Unsubscribe.**
- Vars: `{{headline}} {{video_title}} {{view_count}} {{thumbnail_url}} {{post_date}} {{days_to_milestone}} {{views}} {{likes}} {{shares}} {{comments}} {{chart_image_url}} {{chart_alt}} {{chart_start}} {{chart_peak}} {{chart_end}} {{action_url}} {{eligibility_pct}} {{followers_needed}} {{settings_url}} {{unsubscribe_url}}` · Motion: glow + optional number counter (loop 1) + hairline.

### 7.7 `creator-almost-eligible`
- **Subject:** The Creator Program is within reach · **Preheader:** "You're {{overall_pct}}% of the way to the Sizzle Creator Program — here's exactly what's left."
- Dark-native gold family. Header tag `CREATOR PROGRAM` `#FFD23A` · **gold hairline** (`#FFD23A,#FF8A2C,#FFD23A`).
- Blocks: progress ring 96 (track `rgba(255,255,255,.09)` 7px; gold arc; "{{overall_pct}}%" 24/800 + "OVERALL" 9/.14em — percent live text) → eyebrow `ALMOST THERE` `#F0A93C` → H1 32 **"The Creator Program is within reach"** → body: "You're closer than most creators ever get, {{name}}. Here's exactly what's left." → progress card (`#1D1712` r16 pad 22/24 gap 18): bar "Followers — 8,420 / 10,000" (84%) + bar "Qualified views · 90 days — 74,300 / 100,000" (74%); divider; checklist 13.5: ✓ `#4CC38A` "Account in good standing" · ✓ "Two-factor authentication on" · dashed pending "1,580 more followers" · "25,700 more qualified views" → CTA **"Track my progress"** → 12.5 centered: "Meeting the thresholds unlocks the application — final eligibility is confirmed during review."
- Footer links: Program terms · Help Center · Notification settings. Why: "Creator Program updates are on for your account." Unsubscribe: not mandated (see Ambiguity #7).
- Vars: `{{name}} {{overall_pct}} {{followers}} {{followers_target}} {{followers_pct}} {{qualified_views}} {{views_target}} {{views_pct}} {{followers_needed}} {{views_needed}} {{action_url}} {{program_terms_url}} {{settings_url}}` · Motion: none specified — static.

### 7.8 `creator-eligible`
- **Subject:** You've earned your shot · **Preheader:** "You've hit every threshold — the Sizzle Creator Program application is open for your account."
- Dark-native gold. Card border `rgba(255,210,58,.18)`, shadow `0 24px 70px -30px rgba(255,210,58,.18)` · gold hairline.
- Blocks: hero badge 118 (halo `rgba(255,210,58,.24)`) → eyebrow `YOU QUALIFY` `#FFD23A` → H1 34/1.13 **"You've earned your shot, {{name}}"** → body max-440: "You've hit every threshold for the Sizzle Creator Program. The application is now open for your account." → 3 stat tiles ("10,112 / FOLLOWERS ✓" · "128K / QUAL. VIEWS ✓" · "Good / STANDING ✓" — captions `#4CC38A`) → WHAT YOU UNLOCK card (label `#FFD23A`; 4 rows 14 with 6px square dots `#FFD23A #FF8A2C #FF5320 #E02F80`: "Monetization — ad revenue share and viewer gifts" / "Creator analytics with audience breakdowns" / "The gold creator badge, everywhere you appear" / "Priority support from the creator team") → **gold CTA "Apply to the Creator Program"** (ink text) → 12.5: "Applications are reviewed within 5 business days. Applying doesn't guarantee acceptance — **eligibility terms**." (`#FFD23A`).
- Footer: Program terms · Help Center · Notification settings; why "Creator Program updates are on for your account."
- Vars: `{{name}} {{followers}} {{qualified_views}} {{action_url}} {{program_terms_url}} {{settings_url}}` · Motion: gold halo glow + gold hairline.

### 7.9 `creator-approved`
- **Subject:** You're a Sizzle Creator · **Preheader:** "Application approved — your creator badge is live and monetization is switched on."
- Dark-native gold. Border `rgba(255,210,58,.22)`, shadow `0 28px 80px -30px rgba(255,210,58,.22)` · gold confetti (gold/orange only: `#FFD23A` `#FF8A2C`). Body pad 46/44.
- Blocks: hero badge 132 + "CREATOR" label + double rings (halo 230) → eyebrow `APPLICATION APPROVED` `#FFD23A` → H1 36/1.12 **"You're a Sizzle Creator"** → body max-440: "Your badge is live and monetization is switched on. Three quick setups and your first payout cycle starts today." → setup card (3 rows, 28px circles, serif numerals 15, tints `rgba(255,210,58,.14)`/`#FFD23A` · `rgba(255,138,44,.14)`/`#FF9A3A` · `rgba(255,83,32,.14)`/`#FF7A4A`; tasks 14: "Connect your payout method" / "Complete tax information" / "Tour your earnings dashboard"; time chips 11/800/.06em `#F0A93C`: "2 MIN / 5 MIN / 3 MIN") → **gold CTA "Set up monetization"** (ink text) → gold outline secondary **"Browse creator resources"** (`#FFD23A`, border `rgba(255,210,58,.5)`).
- Footer links: Program terms · Creator handbook · Help Center. Why: "Sent because your Creator Program application was approved." **No unsubscribe.**
- Vars: `{{action_url}} {{resources_url}} {{program_terms_url}} {{handbook_url}}` · Motion: gold confetti + glow (3.2s) + gold hairline.

### 7.10 `weekly-summary`
- **Subject:** Your week on Sizzle: {{headline}} · **Preheader:** "Your week on Sizzle: {{views_total}} views · +{{followers_new}} followers · {{likes_total}} likes."
- Light adaptive **digest**: left-aligned, body pad **36/40**. Header tag `WEEKLY RECAP` `#8A7C70` · flame hairline (comp static).
- Blocks: eyebrow `{{week_range}}` (comp "JULY 9 – 16") `#C2451F` → H1 29/1.18 `{{headline}}` (comp **"Your best week since May"**) → 3 stat tiles (`#FAF4EA`, 21/800, captions VIEWS/FOLLOWERS/LIKES, deltas "▲ 64%" 11/800 `#2E9E6B`) → TOP SIZZLE THIS WEEK card (thumb 92×64 r10; title 14/700; "102K views · 8.4K likes · 964 comments" 12.5) → 3 highlight rows 13.5 (avatar 30 violet-fallback "**@julesmakes** and 11 other creators followed you" · like-disc `rgba(224,47,128,.12)` "Your comment replies earned **2.1K likes**" · chart-disc `rgba(255,138,44,.14)` stroke `#C2451F` "You're in the **top 4%** of food creators this week") → CTA **"Open my analytics"** (max 360, 15/800, pad 15/24, shadow `.5`).
- Footer links: **"Weekly recap: on" · "Unsubscribe" · Help Center**. Why: "Digest of your creator activity — one email, once a week." **`{{unsubscribe_url}}` REQUIRED + List-Unsubscribe.**
- Vars: `{{week_range}} {{headline}} {{views_total}} {{views_delta}} {{followers_new}} {{followers_delta}} {{likes_total}} {{likes_delta}} {{thumbnail_url}} {{video_title}} {{video_views}} {{video_likes}} {{video_comments}} {{friend_avatar_url}} {{top_follower}} {{other_follower_count}} {{reply_likes}} {{rank_pct}} {{category}} {{action_url}} {{settings_url}} {{unsubscribe_url}}` · Motion: none in email (szBar is a web-view reference only).

### 7.11 `payout-completed`
- **Subject:** Payout completed — {{amount}} is on the way · **Preheader:** "{{amount}} is on the way to your bank — payout {{reference}} completed."
- Dark-native. Header tag `CREATOR EARNINGS` `#8A7C70` · flame hairline (comp static).
- Blocks: hero green check (110 stage) → eyebrow `PAYOUT COMPLETED` `#4CC38A` → amount **Instrument Serif 56/1 `#F5EFE6`** `{{amount}}` (comp "$1,284.50") → body max-420: "Your June earnings are on the way. Most banks post Sizzle payouts within 1–2 business days." → PAYOUT DETAILS card (grid label 130px: Earning period "June 1 – June 30, 2026" · Method "Bank transfer ····4821" · Initiated "July 15, 2026" · Reference mono 12.5 "SZ-PAY-88214-06") → CTA **"View earnings breakdown"** → 12.5: "Amounts shown before local taxes. Statements for your records live in **Earnings → Documents**." (`#FF9A6B`).
- Footer links: Payout settings · Tax center · Help Center. Why: "Transactional receipt — required for your records." **No unsubscribe.**
- Vars: `{{amount}} {{period}} {{earning_period}} {{method}} {{initiated_date}} {{reference}} {{action_url}} {{documents_url}} {{payout_settings_url}} {{tax_center_url}}` · Motion: check draw (loop 3×) + quiet green halo (3.6s).

### 7.12 `content-removed`
- **Subject:** A video was removed from your profile · **Preheader:** "A video was removed from your profile — here's what happened and how to appeal."
- Light adaptive, **respectful**: left-aligned, **no hero art, no motion, hairline solid `#3A322B`**. Header tag `POLICY UPDATE` `#8A7C70`. Body pad 40/44.
- Blocks: icon tile 52 (r14, `#FAF4EA`/`#EDE3D3`, minus-circle `#C42B14` 24) → H1 29/1.18 **"A video was removed from your profile"** → body max-470: "After a review, we removed one of your Sizzles for violating our Community Guidelines. We know this isn't the email you wanted — here's exactly what happened and what you can do." → removal card (thumb 76×54 + `rgba(255,255,255,.55)` overlay/hidden icon; "“{{video_title}}”" 14/700; "Posted {{post_date}} · removed {{removed_date}}" 12.5; divider; grid 110px: Policy `{{policy}}` (comp "Harassment & bullying") · What happens `{{consequence}}` (comp "The video is hidden from everyone. No strike was applied to your account this time.")) → paired buttons: solid `#1B1512` **"Appeal this decision"** + 2px `#1B1512` outline **"Read the policy"** → 12.5: "Appeals are reviewed by a person, usually within 48 hours. If we got it wrong, the video is restored and this notice is wiped from your record. Questions? **Contact Sizzle Support**."
- Footer links: Community Guidelines · Help Center. Why: "Policy notices can't be turned off." **No unsubscribe.**
- Vars: `{{video_title}} {{thumbnail_url}} {{post_date}} {{removed_date}} {{policy}} {{consequence}} {{appeal_url}} {{policy_url}} {{guidelines_url}}`

---

## 8. Unsubscribe matrix

| Templates | `{{unsubscribe_url}}` + List-Unsubscribe |
|---|---|
| password-reset · verify-email · new-login | **Never** — security ("Security alerts can't be turned off") |
| welcome · creator-approved · payout-completed · content-removed | No (transactional / policy); Notification-settings link where shown |
| **milestone-1k-followers · milestone-100k-views · weekly-summary** | **REQUIRED**: footer link + `List-Unsubscribe: <{{unsubscribe_url}}>, <mailto:unsubscribe@getsizzle.app?subject={{template}}>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` |
| creator-almost-eligible · creator-eligible | Not mandated by the brief; recommended (promotional nudges). Decide once, apply to both. |

---

## 9. Ambiguities — builders must NOT guess (confirm with Branden)

1. **Subject lines & preheaders are not on the boards.** §7 values are kit proposals (preheaders already baked in the HTML); confirm before mailer wiring.
2. **Verification-code size conflict:** Board 02 ramp `mono 34 / +0.18em` vs module close-up 36/.22em vs verify-email comp **30/.22em**. Kit uses the template value (30/.22em); confirm.
3. **Footer variants:** Board 01 canonical footer = pad 26/32, store badges, full street address. Board-03 comps use a compact footer (pad 20/32, no badges, "Sizzle Inc · Los Angeles, CA · © 2026"). Brief mandates badges + physical address ALWAYS → all 12 built with the Board-01 footer; flagged in case compact was intentional for digests.
4. **Dark border alpha:** swatch says WHITE 8% (`.08`), applied comps use `.07` (tiles `.06`). Kit follows the comps (`.07`).
5. **Hairline animation coverage:** reset/verify/welcome/milestones/creator comps animate it; new-login/weekly/payout comps show it static; content-removed is solid `#3A322B`. Built as animated-upgradeable slot + static CSS everywhere except content-removed (always solid). Confirm the static ones weren't intentional restraint.
6. **Dynamic data in imagery:** the almost-eligible ring % and the 100K-views bar chart are per-send data. Kit decision: percent = live text under a generic ring; chart = server-rendered `{{chart_image_url}}` with live-text axis labels. Both need a rendering pipeline that doesn't exist yet.
7. **Creator-progress unsubscribe** (see §8 last row) — brief only mandates milestones + weekly summary.
8. **Welcome exists only in dark on the boards.** Light values would need derivation via §4 (inverse); kit ships it dark-native. Confirm.
9. **Hero filename ↔ slug mapping:** convention `hero-<template>.png` with the shipped slugs (`hero-password-reset.png` already exists in `apps/web/public/email/`). The remaining 9 hero PNGs are **not generated yet** — asset generation is a separate pass; the `<img>` src contract above is fixed.
10. **Milestone prestige tiers:** "100 followers gets a card, 1K gets confetti, 1M gets the full gold treatment" — only 1K/100K comps exist; other tiers need design sign-off.
11. **Store badges:** bordered text now; Board 01 says they "swap to official artwork in production" — official badge art carries its own usage rules.
12. **new-login "This was me"** has no defined backend behavior (`{{confirm_url}}` contract needed).
13. **Physical address** "1550 Vine Street, Los Angeles, CA 90028" — verify it's the real registered address before production (CAN-SPAM).
14. **Sender/from names, and which template Supabase Auth actions map to** (`supabase/recovery.html` exists for the recovery action) — outside the boards.

---

## 10. File map

```
emails/
  password-reset.html   verify-email.html   welcome.html   new-login.html
  milestone-1k-followers.html   milestone-100k-views.html
  creator-almost-eligible.html  creator-eligible.html  creator-approved.html
  weekly-summary.html   payout-completed.html   content-removed.html
  txt/<slug>.txt              plain-text twins (70-col, URLs on own lines)
  partials/base-skeleton.html shared shell
  partials/tokens.md          token tables (narrative)
  partials/tokens.css.md      machine-readable name:value token list
  supabase/recovery.html      Supabase Auth recovery-action variant
  SPEC.md · README.md
```

Brand marks served from `https://getsizzle.app/email/` (copies in `apps/web/public/email/`): `sizzle-mark-flat-512.png` (header, any bg), `sizzle-mark-white-512.png` (footer silhouette), `sizzle-mark-512.png` (welcome hero glow variant). Asset pack: artwork ratio 4:5 (viewBox 240×300); gradient sweep flame gold `#FFD23A` → orange `#FF7A2A` → red `#E2331C` → white-hot `#FFFFFF` → magenta `#E02F80` → violet `#36103F`; glow versions use SVG blur — use flat for UI.
