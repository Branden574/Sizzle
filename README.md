# Sizzle

> Watch it. Then cook it.

A full-screen, TikTok-style video feed of real recipes from real home cooks — swipe, save, cook. A mobile recipe app with a React front-end and a Node/Hono + Supabase backend.

## Monorepo layout

```
apps/
  web/       Vite + React + TypeScript client (Zustand state)
  api/       Hono + TypeScript API (auth, feeds, recipes, uploads)
packages/
  shared/    Shared API DTOs / contract types (@sizzle/shared)
supabase/    Postgres schema, migrations, local config
_handoff/    Original Sizzle.dc.html design prototype (visual source of truth)
```

## Quick start

Prereqs: **Node 20+** and **Docker Desktop running** (for local Supabase).

```bash
npm install

npm run db:start                  # start local Supabase + apply migrations
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
npm run dev:all                   # web :5173  +  api :8787
```

The `.env` defaults already match local Supabase, so no editing is needed for local dev. To skip Docker you can still run `npm run dev:web` — the UI loads fully; only auth calls will error.

### Useful scripts

| Script | What |
|--------|------|
| `npm run dev:all` | Run web + api together |
| `npm run dev:web` / `npm run dev:api` | Run one app |
| `npm run build` | Build web + api |
| `npm run typecheck` | Type-check both apps |
| `npm run db:start` / `db:stop` / `db:reset` | Local Supabase lifecycle |

## Status

Backend is being built phase-by-phase. **See [PROGRESS.md](PROGRESS.md)** for the roadmap, what's real vs. stubbed, and how to test the current slice. Right now: monorepo + API skeleton + DB schema + **real auth wired to onboarding** are in place; feeds/recipes/upload data wiring is the next slice.

## Stack

React 18 · TypeScript · Vite · Zustand · Hono · Supabase (Postgres/Auth/Storage) · Cloudflare Stream (video, behind an interface — mock by default).
