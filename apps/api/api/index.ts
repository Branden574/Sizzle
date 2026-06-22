// Vercel serverless entry for the Sizzle API. Local dev still uses
// src/index.ts (@hono/node-server); this wraps the same Hono app for Vercel.
//
// The app is created lazily inside a try/catch so a startup error (bad env, a
// throwing module init) is surfaced as a readable JSON 500 instead of an opaque
// FUNCTION_INVOCATION_FAILED crash.
import { Hono } from 'hono';
import { handle } from 'hono/vercel';

export const config = { runtime: 'nodejs' };

let ready: Promise<(...args: unknown[]) => unknown> | null = null;

async function init() {
  try {
    const { createApp } = await import('../src/app');
    return handle(createApp()) as unknown as (...args: unknown[]) => unknown;
  } catch (err) {
    const detail = err instanceof Error ? String(err.stack || err.message) : String(err);
    const fallback = new Hono();
    fallback.all('*', (c) => c.json({ error: 'api_init_failed', detail }, 500));
    return handle(fallback) as unknown as (...args: unknown[]) => unknown;
  }
}

export default async function handler(...args: unknown[]) {
  ready ??= init();
  const h = await ready;
  return h(...args);
}
