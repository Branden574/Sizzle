# Sizzle

> Watch it. Then cook it.

A full-screen, TikTok-style video feed of real recipes from real home cooks — swipe, save, cook. This is a faithful, production-grade implementation of the **Sizzle** design prototype (`Sizzle.dc.html`), rebuilt in React + TypeScript.

## Stack

- **React 18** + **TypeScript**
- **Vite** for dev/build
- **Zustand** for the shared UI state machine

The original prototype was a single-file HTML/CSS/JS mock built with Claude Design's `x-dc` template engine and a `DCLogic` class component. This repo recreates the same pixel output as a real, componentized app. The design files live under `_handoff/` for reference.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
npm run typecheck
```

## What's inside

The whole experience lives inside a 393×852 device frame.

**Onboarding** (4 steps) → hero, taste-chip picker, follow-some-cooks, account.

**App** with a bottom tab bar:

- **Feed** — full-screen snap-scrolling recipe cards with a For You / Following toggle, like/dislike, comments, save, share, and a per-post creator-controls menu.
- **Discover** — search + trending chips + a masonry grid.
- **Upload** — a "film your dish" capture sheet.
- **Saved** — saved + offline recipes.
- **Profile** — your stats and saved grid.

**Sheets** — recipe detail (ingredients + method), comments (with live add), creator post-controls, and full cook profiles.

## Project layout

```
src/
  App.tsx                 # phone shell + layer/chrome orchestration
  store.ts                # Zustand state machine (mirrors the prototype's state)
  theme.ts                # design tokens (accent, saffron, surfaces, ink, metrics)
  data.ts                 # cooks, recipes, comments, taste/trend definitions
  types.ts
  components/
    Phone.tsx  StatusBar.tsx
    Onboarding.tsx
    Feed.tsx  Discover.tsx  Saved.tsx  Profile.tsx  BottomNav.tsx  AppShell.tsx
    icons.tsx             # all SVG iconography (single source of path data)
    ui.ts                 # pressVars() helper for the .sz-press active-scale utility
    sheets/
      RecipeSheet.tsx  CommentsSheet.tsx  SettingsSheet.tsx  CookSheet.tsx  UploadSheet.tsx
```

## Theming

`accent` (`#ff5a36`) and `saffron` (`#f4a52c`) were configurable color props in the original design. They're defined in [`src/theme.ts`](src/theme.ts) and surfaced as the `--accent` / `--saffron` CSS custom properties on the phone root — change them in one place to retint the whole app.

To boot straight into the app (skipping onboarding) during development, flip `START_IN_APP` in [`src/store.ts`](src/store.ts).
