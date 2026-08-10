// Source entry for the Vercel function. scripts/build-vercel.mjs esbuild-bundles
// this into one self-contained file under .vercel/output. Local dev uses
// src/index.ts (@hono/node-server).
//
// App creation is deferred to the first request and wrapped in try/catch, so any
// startup failure (bad env, throwing module init) is surfaced as a readable JSON
// 500 instead of an opaque FUNCTION_INVOCATION_FAILED.
import { getRequestListener } from '@hono/node-server';

let appFetch: ((req: Request) => Response | Promise<Response>) | null = null;
let initError: string | null = null;

async function ensureApp(): Promise<void> {
  if (appFetch || initError) return;
  try {
    const { createApp } = await import('../src/app');
    const app = createApp();
    appFetch = (req) => app.fetch(req);
  } catch (err) {
    initError = err instanceof Error ? String(err.stack || err.message) : String(err);
    // Log the full detail to the server (Vercel function logs) only. It is never
    // returned to the client — leaking the stack trace / internal paths to an
    // external caller is information exposure (CWE-209).
    console.error('[api_init_failed]', initError);
  }
}

export default getRequestListener(async (request) => {
  await ensureApp();
  if (appFetch) return appFetch(request);
  // Init failed. The detail was logged server-side (see ensureApp); return a
  // generic message so no stack trace or internal path is exposed to callers.
  return new Response(JSON.stringify({ error: 'api_init_failed' }), {
    status: 500,
    headers: { 'content-type': 'application/json' },
  });
});
