# Sizzle Email — Machine-Readable Tokens

`name: value` pairs, verbatim from the design boards. Builders consume these directly; do not approximate.

## Fonts

```
font-serif: 'Instrument Serif',Georgia,serif
font-sans: 'Hanken Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif
font-mono: ui-monospace,Menlo,Consolas,monospace
font-import: https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap
```

## Surfaces — light

```
surface-page: #F5EFE6
surface-card: #FFFFFF
surface-sunken: #FAF4EA
border: #EDE3D3
text-ink: #1B1512
text-secondary: #5C5248
text-muted: #8A7C70
surface-bookend: #0C0A09
```

## Surfaces — dark

```
dark-surface-page: #050404
dark-surface-card: #14100D
dark-surface-elevated: #1D1712
dark-border: rgba(255,255,255,.07)          /* system swatch: rgba(255,255,255,.08) "WHITE 8%"; applied comps .07 */
dark-border-tile: rgba(255,255,255,.06)
dark-text-ink: #F5EFE6
dark-text-secondary: #B3A698
dark-text-muted: #8A7C70
dark-surface-bookend: #0C0A09
```

## Bookend (both modes)

```
bookend-bg: #0C0A09
bookend-wordmark: #FFFFFF                    /* header */
bookend-footer-wordmark: #F5EFE6
bookend-link: #B3A698
bookend-legal: #6C5F56
bookend-tag: #8A7C70
bookend-tag-gold: #FFD23A                    /* MILESTONE / CREATOR PROGRAM */
badge-border: rgba(255,255,255,.22)
```

## Accents

```
cta-gradient: linear-gradient(100deg,#FF8A2C,#FF5320 55%,#E2331C)
cta-flat: #E2331C
cta-text: #FFFFFF
cta-hover-gradient: linear-gradient(100deg,#F07A20,#E84616 55%,#C42B14)
cta-pressed-gradient: linear-gradient(100deg,#E06E1C,#D63E12 55%,#B02510)
cta-gold-gradient: linear-gradient(100deg,#FFD23A,#FF8A2C 60%,#FF5320)
cta-gold-flat: #FF8A2C
cta-gold-text: #1B1512
flame-gold: #FFD23A
flame-gold-on-light: #C79A3B
hot-magenta: #E02F80
security-violet: #6C4BB8
security-violet-dark: #9D7FE0
security-violet-stroke: #7E5BC2
security-violet-dark-btn-text: #B79BF0
security-violet-dark-btn-border: rgba(157,127,224,.6)
success: #2E9E6B
success-dark: #4CC38A
success-deep: #1F7A50
warning: #C77E14
warning-dark: #F0A93C
warning-deep: #9C6210
error: #C42B14
error-dark: #FF6A4D
error-deep: #A32310
creator-gold-gradient: linear-gradient(90deg,#FFD23A,#FF8A2C)
link: #C2451F
link-dark: #FF7A4A
outline-dark-text: #FF9A6B
outline-dark-border: rgba(255,122,74,.65)
gold-outline-text: #FFD23A
gold-outline-border: rgba(255,210,58,.5)
milestone-number-gradient: linear-gradient(120deg,#FFD23A,#FF5320 55%,#E02F80)
```

## Hairline (3px)

```
hairline-height: 3px
hairline-flame-animated: linear-gradient(90deg,#FFD23A,#FF7A2A,#FF5320,#E02F80,#8A1C66,#FFD23A)   /* background-size 200% 100%, 8s linear infinite */
hairline-flame-static: linear-gradient(90deg,#FFD23A,#FF7A2A,#FF5320,#E02F80,#8A1C66)
hairline-flame-flat: #FF5320
hairline-gold: linear-gradient(90deg,#FFD23A,#FF8A2C,#FFD23A)
hairline-gold-flat: #FF8A2C
hairline-policy: #3A322B
```

## Hero (reset family)

```
hero-shield-stroke: #7E5BC2
hero-shield-fill: rgba(126,91,194,.09)
hero-halo: rgba(126,91,194,.30)
hero-shield-stroke-dark: #9D7FE0
hero-shield-fill-dark: rgba(157,127,224,.12)
hero-halo-dark: rgba(157,127,224,.26)
hero-pulse-gradient: linear-gradient stops #FFD23A 0, #FF7A2A .55, #E02F80 1
hero-ember: #FF9A3A
hero-halo-warm: radial-gradient(circle, rgba(255,83,32,.3), rgba(224,47,128,.14) 55%, transparent 70%)
hero-halo-gold: rgba(255,210,58,.24)
hero-halo-green: rgba(76,195,138,.2)
```

## Typography sizes

```
eyebrow: 11px / 800 / letter-spacing .22em / uppercase        (mobile 10.5px)
h1: 33px / 1.15 / serif 400                                   (mobile 28px / 1.16)
h1-celebration: 36px / 1.12
h1-eligible: 34px / 1.13
h1-newlogin: 32px / 1.15
h1-digest: 29px / 1.18
section-heading: 20px / 800 / 1.3
body: 15px / 1.65                                             (mobile 14.5px / 1.6)
supporting: 13.5px / 1.6
supporting-sm: 13px / 1.6
button: 16px / 800 / letter-spacing .01em
button-secondary: 15px / 700
header-tag: mono 10px / letter-spacing .18em                  (mobile 9px / .16em)
card-label: mono 10px / letter-spacing .16em                  (mobile 9.5px)
code: mono 30px / letter-spacing .22em / 600 / padding-left .22em   (system ramp: 34px / .18em; module: 36px / .22em)
milestone-number: serif 96px / 1                              (comps: 124 · 88 · 74; payout amount 56)
stat-number: 28px / 800 + caption 12px                        (tiles: 19-22px / 800 + caption 9.5-10.5px / .1em)
legal: 11.5px / 1.7
footer-link: 12.5px                                           (compact 12px)
url-block: mono 12px
badge-kicker: mono 8.5px / .1em
badge-name: 13px / 700
chip: 11.5px / 800 / .06em
```

## Spacing

```
email-width: 600px
breakpoint: 480px
outer-gutter: 20px
header-pad: 18px 32px           (mobile 16px 22px)
body-pad: 44px                  (mobile 30px 22px; digest 36px 40px; policy 40px 44px)
footer-pad: 26px 32px 28px      (mobile 20px 22px 24px)
section-gap: 26-34px
heading-to-body: 14px
body-to-cta: 28px
card-pad: 22px 24px             (mobile 18px)
hairline: 3px
```

## Radii & borders

```
radius-card: 24px               (mobile 20px)
radius-inner: 16px              (mobile 14px)
radius-button: 13px
radius-code: 14px
radius-chip: 999px
radius-thumb: 12px              (small 10px)
radius-avatar: 50%
radius-url-block: 10px
radius-icon-tile: 14px
border-width: 1px
border-width-outline-btn: 1.5px
border-width-paired-outline: 2px
```

## Elevation

```
shadow-card: 0 24px 60px -30px rgba(27,21,18,.3)
shadow-card-dark: 0 24px 60px -30px rgba(255,83,32,.16)
shadow-card-gold: 0 24px 70px -30px rgba(255,210,58,.18)
shadow-card-gold-approved: 0 28px 80px -30px rgba(255,210,58,.22)
shadow-cta: 0 10px 26px -10px rgba(226,51,28,.55)
shadow-cta-dark: 0 10px 30px -10px rgba(255,83,32,.5)
shadow-cta-hover: 0 12px 30px -10px rgba(226,51,28,.65)
shadow-cta-pressed: 0 5px 14px -8px rgba(226,51,28,.6)
shadow-cta-gold: 0 10px 30px -10px rgba(255,210,58,.45)
```

## Buttons

```
cta-min-height: 52px            (padding-built: 16px 24px + 20px line-height)
cta-max-width: 380px            (digest 360px; full-width <=480px)
btn-secondary-pad: 13px 24px    (system sheet 12px 18px)
btn-escape-pad: 9px 14px        (radius 10px; mobile full-width 11px 14px)
btn-paired-solid-pad: 15px 18px
btn-paired-outline-pad: 13px 18px
btn-solid-neutral-bg: #1B1512
btn-solid-neutral-dark-bg: #F5EFE6
vml-arcsize: 25%
```

## Alerts (tint / border / title — light, then dark)

```
alert-success: rgba(46,158,107,.09) / rgba(46,158,107,.3) / #1F7A50
alert-warning: rgba(199,126,20,.09) / rgba(199,126,20,.35) / #9C6210
alert-error: rgba(196,43,20,.08) / rgba(196,43,20,.32) / #A32310
alert-security: rgba(108,75,184,.08) / rgba(108,75,184,.3) / #5A3DA0
alert-neutral: #FAF4EA / #EDE3D3 / #1B1512
dark-alert-success: rgba(76,195,138,.09) / rgba(76,195,138,.3) / #4CC38A
dark-alert-warning: rgba(240,169,60,.09) / rgba(240,169,60,.3) / #F0A93C
dark-alert-error: rgba(255,106,77,.09) / rgba(255,106,77,.3) / #FF6A4D
dark-alert-security: rgba(157,127,224,.09) / rgba(157,127,224,.3) / #B79BF0
alert-radius: 16px
alert-pad: 16px 20px
alert-icon: 20px / 1.8px stroke
alert-title: 14.5px / 800
alert-body: 13.5px / 1.55
```

## Chips (pill, 11.5/800/.06em, pad 5px 12px)

```
chip-eligible: #4CC38A / rgba(76,195,138,.12) / border rgba(76,195,138,.35)
chip-almost: #F0A93C / rgba(240,169,60,.12) / border rgba(240,169,60,.35)
chip-notyet: #B3A698 / rgba(255,255,255,.07) / border rgba(255,255,255,.18)
chip-review: #B79BF0 / rgba(157,127,224,.12) / border rgba(157,127,224,.35)
```

## Progress

```
progress-track: rgba(255,255,255,.08)        (bgcolor fallback #2F2A25)
progress-track-height: 8px                   (module 9px)
progress-fill: linear-gradient(90deg,#FFD23A,#FF8A2C)   (generic module: #FFD23A,#FF5320; flat #FF8A2C)
progress-ring-track: rgba(255,255,255,.09) / 7px
progress-ring-size: 96px
```

## Avatars & badges

```
avatar-fallback-ember: radial-gradient(120% 120% at 30% 25%, #FFB27A, #E2331C)
avatar-fallback-violet: radial-gradient(120% 120% at 30% 25%, #B79BF0, #36103F)
avatar-ring: linear-gradient(135deg,#FFD23A,#FF5320,#E02F80)   (2px pad)
creator-badge-ring: linear-gradient(135deg,#FFD23A,#FF8A2C 55%,#E2331C)
creator-badge-disc: #0C0A09
creator-badge-outer-ring: rgba(255,210,58,.35)                  (approved: .45 at -9px, .18 at -18px)
creator-badge-label: SIZZLE CREATOR / 10.5px / 800 / .22em / #FFD23A
```

## Icons

```
icon-grid: 20px
icon-stroke: 1.8px round
icon-ink: #5C5248
icon-like: #E02F80
icon-export: PNG @2x
```

## Motion budgets (APNG first, GIF fallback; frame 1 = finished composition)

```
motion-shield-halo: 3.2s ease infinite / APNG 300x340 @2x <=180KB
motion-embers: 2.8s ease-out infinite / baked into shield APNG
motion-hairline: 8s linear infinite / GIF 1200x6 <=35KB
motion-cta-hover: 120ms ease-out (web views only)
motion-logo-glow: 3.6s ease infinite / APNG 480x420 @2x <=220KB
motion-flame-flicker: 2.6s infinite / APNG 320x400 <=160KB
motion-check-draw: 0.9s draw + 1.5s hold / plays 3x (GIF loop=3) / APNG 240x240 <=90KB
motion-ember-confetti: 3s infinite / <=12 particles / APNG 600x400 <=350KB (milestones only)
motion-number-counter: plays once (GIF loop=1) / 400x140 <=120KB
motion-min-loop: 2.5s (security >=2.8s), no flashing
```

## Weight budget

```
html-max: 102KB
total-max: 600KB (with images)
```

## Brand assets (https://getsizzle.app/email/)

```
mark-header: sizzle-mark-flat-512.png        (22x28 display, 4:5, any bg)
mark-footer: sizzle-mark-white-512.png       (15x19 display, opacity .9)
mark-glow: sizzle-mark-512.png               (welcome hero, dark bg)
app-icon: sizzle-icon-180.png                (40px, radius 10)
brand-gradient-sweep: #FFD23A -> #FF7A2A -> #E2331C -> #FFFFFF -> #E02F80 -> #36103F
footer-address: Sizzle Inc · 1550 Vine Street, Los Angeles, CA 90028 · © 2026 Sizzle Inc.
```
