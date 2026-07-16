# Sizzle Email — Design Tokens Reference

Every value below is transcribed **verbatim** from the design boards
(`Sizzle Email Reset.dc.html`, `Sizzle Email System.dc.html`,
`Sizzle Email Templates.dc.html`). Do not approximate or "improve".

## Surfaces

| Token | Light | Dark |
|---|---|---|
| Page background | `#F5EFE6` | `#050404` |
| Email card | `#FFFFFF` | `#14100D` |
| Sunken card / alert | `#FAF4EA` | `#1D1712` |
| Card border | `#EDE3D3` | `rgba(255,255,255,.07)` (elevated tiles: `rgba(255,255,255,.06)`) |
| Bookend (header + footer) | `#0C0A09` | `#0C0A09` — **identical in both modes** |

## Text

| Token | Light | Dark |
|---|---|---|
| Ink (headlines, strong) | `#1B1512` | `#F5EFE6` |
| Secondary body | `#5C5248` | `#B3A698` |
| Muted / labels | `#8A7C70` | `#8A7C70` |
| Footer links | `#B3A698` | `#B3A698` |
| Legal (on bookend) | `#6C5F56` | `#6C5F56` |

Never pure `#000` or `#FFF` body text (Gmail inversion artifacts).

## Accents & semantics (light / dark pairs)

| Token | Light | Dark |
|---|---|---|
| Primary ember gradient | `linear-gradient(100deg,#FF8A2C,#FF5320 55%,#E2331C)` · flat `#E2331C` | same (mode-invariant) |
| Flame gold | `#FFD23A` (on light surfaces: `#C79A3B`) | `#FFD23A` |
| Hot magenta (accents only) | `#E02F80` | `#E02F80` |
| Security violet | `#6C4BB8` | `#9D7FE0` (button text `#B79BF0`, border `rgba(157,127,224,.6)`) |
| Success | `#2E9E6B` | `#4CC38A` |
| Warning | `#C77E14` | `#F0A93C` |
| Error | `#C42B14` | `#FF6A4D` |
| Creator gold gradient (program family only) | `#FFD23A→#FF8A2C` | same |
| Support / text link | `#C2451F` | `#FF7A4A` |
| Secondary outline (dark) | text `#FF9A6B`, border `rgba(255,122,74,.65)` | — |

Gradient rules: ember gradient on CTAs and heroes only — never behind body
text. One celebration gradient per email, max.

## Hairline (3px, under header)

| Variant | CSS | Flat `bgcolor` fallback |
|---|---|---|
| Flame (default) | `linear-gradient(90deg,#FFD23A,#FF7A2A,#FF5320,#E02F80,#8A1C66)` | `#FF5320` |
| Creator gold | `linear-gradient(90deg,#FFD23A,#FF8A2C,#FFD23A)` | `#FF8A2C` |
| Policy / muted | solid `#3A322B` | `#3A322B` |

## Typography

Webfonts via guarded `@import` (Outlook ignores). No text baked into images.

| Role | Spec | Fallback |
|---|---|---|
| Hero H1 | Instrument Serif 33/1.15 (mobile 28/1.16); welcome/milestone 36/1.12; digest/policy 29/1.18 | Georgia, serif |
| Section heading | Hanken Grotesk 20/800/1.3 | 'Helvetica Neue', Helvetica, Arial |
| Body | Hanken Grotesk 15/1.65 | same |
| Supporting | 13–13.5/1.6 · `#8A7C70` | same |
| Eyebrow | 11/800 · letter-spacing `.22em` · caps | same |
| Button | 16/800 (secondary 15/700) | same |
| Header tag | mono 10 · `.18em` | Menlo/Consolas |
| Mono labels (REQUEST DETAILS…) | mono 10 · `.16em` | Menlo/Consolas |
| Verification code | mono 30–36 · `.22em` · 600 | Menlo/Consolas |
| URL block | mono 12 · violet | Menlo/Consolas |
| Milestone number | Instrument Serif 74–124 · gradient text (ships as hero image in email) | — |
| Stat number | 19–28/800 + caption 9.5–12 `.1em` | — |
| Legal | 11.5/1.7 | — |

## Spacing scale

| | px |
|---|---|
| Email width | 600 · mobile breakpoint 480 |
| Outer gutter | 20 |
| Header padding | 18/32 (mobile 16/22) |
| Body padding | 44 desktop · 30/22 mobile (digest 36/40, policy 40/44) |
| Footer padding | 26/32/28 (mobile 20/22/24) |
| Between sections | 26–34 |
| Heading → body | 14 |
| Body → CTA | 28 |
| Card internal padding | 22/24 |
| Hairline | 3 |

## Radii & borders

| | px |
|---|---|
| Email card | 24 (20 mobile) |
| Inner card / alert | 16 |
| Button | 13 (small violet outline: 10) |
| Code block | 14 |
| Chip / pill | 999 |
| Thumbnail | 12 (small 10) |
| Avatar | 50% |
| Border weight | 1 (outline buttons 1.5; paired big outlines 2) |

## Elevation (decorative only — clients may drop it)

- Card shadow light: `0 24px 60px -30px rgba(27,21,18,.3)`
- Card shadow dark: `0 24px 60px -30px rgba(255,83,32,.16)`
- CTA glow light: `0 10px 26px -10px rgba(226,51,28,.55)`
- CTA glow dark: `0 10px 30px -10px rgba(255,83,32,.5)`
- Gold CTA glow: `0 10px 30px -10px rgba(255,210,58,.45)`
- Hero halos are baked into exported assets, never CSS filters.

## Buttons

- Primary: bulletproof VML roundrect (`arcsize 25%`) + padded `<a>`;
  padding 16/24 + 20px line-height = **52px min tap height**; radius 13;
  total width 380 (board is border-box → `<a>` content max-width 332);
  full-width under 480px.
- Ember flat fallback `#E2331C`; creator-gold flat fallback `#FF8A2C`
  (ink `#1B1512` text needs the lighter flat).
- Secondary outline: 1.5px, pad 13/24 (small violet: 1.5px, pad 9/14, r10).
- Paired 50/50 buttons: solid `#1B1512`/white + 2px outline; dark remap:
  solid → bg `#F5EFE6`/ink text, outline → `#F5EFE6` text /
  `rgba(255,255,255,.35)` border (System-board dark neutral).
- Hover (web views only): gradient darkens 6%, lifts 1px, 120ms ease-out.

## Alert tints

Fills stay ≤9% alpha so text contrast holds. State = icon + label + color,
never color alone.

## Eligibility chips (pill, 11.5/800 `.06em`, pad 5/12)

| State | Color / tint |
|---|---|
| ELIGIBLE | `#4CC38A` on `rgba(76,195,138,.12)`, border `.35` |
| ALMOST ELIGIBLE | `#F0A93C` on `rgba(240,169,60,.12)`, border `.35` |
| NOT YET ELIGIBLE | `#B3A698` on `rgba(255,255,255,.07)`, border `.18` |
| UNDER REVIEW | `#B79BF0` on `rgba(157,127,224,.12)`, border `.35` |

Chips state facts only — "almost" never implies approval.

## Progress bars

Track `rgba(255,255,255,.08)` (bgcolor fallback `#2F2A25`), height 8–9,
radius 999; fill `linear-gradient(90deg,#FFD23A,#FF8A2C)` (flat `#FF8A2C`).
