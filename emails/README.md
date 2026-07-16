# Sizzle Email Templates

Production HTML email kit built from the Sizzle Email Design System boards
(01 Password Reset · 02 System · 03 Templates). 12 templates, each with a
plain-text twin, sharing one 600px hybrid-table skeleton.

## Layout

```
emails/
├── <template>.html          production HTML (handlebars placeholders)
├── txt/<template>.txt       plain-text part (same content order, 70-col, URLs on own lines)
├── partials/
│   ├── base-skeleton.html   the shared shell (head/header/hairline/body-slot/footer)
│   └── tokens.md            every color/type/spacing/radius token, verbatim from the boards
├── SPEC.md                  distilled spec: inventory, variables, hero/motion tables, rules
└── README.md                this file
```

Templates: `password-reset` · `verify-email` · `welcome` · `new-login` ·
`milestone-1k-followers` · `milestone-100k-views` ·
`creator-almost-eligible` · `creator-eligible` · `creator-approved` ·
`weekly-summary` · `payout-completed` · `content-removed`

## Using a template

1. Render the `.html` with any mustache/handlebars engine — all variables
   are `{{snake_case}}` and listed per-template in `SPEC.md §4`.
2. Send the matching `txt/` file as the `text/plain` alternative part.
3. Subject ≈ the `<title>`; the hidden preheader is already in the HTML.
4. For `milestone-*` and `weekly-summary`, set the `List-Unsubscribe` +
   `List-Unsubscribe-Post` headers (exact values in `SPEC.md §1`). Never add
   unsubscribe to the security/policy/receipt templates.

## Assets (must exist before sending)

All imagery is absolute from `https://getsizzle.app/email/`:
brand marks (`sizzle-mark-flat-512.png`, `sizzle-mark-white-512.png`),
five small icons, and one static @2x `hero-<template>.png` per template
(sizes + alt text + APNG/GIF motion upgrade paths in `SPEC.md §3`).
Asset generation is a separate pass — the `<img>` `src` never changes when a
hero is upgraded from static PNG to APNG, because frame 1 is the finished
composition.

## Engineering guarantees (verified)

- 600px hybrid table layout; `role="presentation"` on every layout table;
  MSO/VML conditionals (ghost table, `v:roundrect` CTAs, font fallbacks).
- Single-column stack at ≤480px; verified at 375px with zero horizontal
  overflow; all spacing is cell padding.
- Bulletproof CTAs: 52px tap height, radius 13, gradient over flat
  `#E2331C` (`#FF8A2C` for gold) fallback.
- Dark mode: `color-scheme` metas + `prefers-color-scheme` overrides on the
  adaptive templates; Creator/milestone/welcome/payout templates are
  dark-native by design. Bookends `#0C0A09` in both modes, everywhere.
- No JavaScript, no text baked into images, hidden per-template preheaders,
  `lang="en"`.

## Editing

Don't hand-edit shared chrome in one file only — the skeleton
(`partials/base-skeleton.html`) is the reference for the shared parts; keep
all 12 templates in lockstep and re-check values against
`partials/tokens.md` / the design boards before changing anything.

## Pre-send test checklist

- [ ] Litmus/Email on Acid: Outlook 2016+ (VML button, ghost table), Gmail
      web + app (dark-mode inversion on transparent marks), Apple Mail
      (dark), Outlook.com.
- [ ] Images blocked: headline/CTA/details all readable, alt text sensible.
- [ ] 375px device: single column, full-width CTAs, no sideways scroll.
- [ ] Long email address / German button strings: wraps, never overflows.
- [ ] HTML ≤102 KB (Gmail clips beyond); with images ≤600 KB.
