/**
 * Minimal, dependency-free Sentry capture. Posts an event envelope straight to
 * the Sentry ingest endpoint derived from SENTRY_DSN. No-op when the DSN is
 * unset, so the app runs unchanged without it. (Upgradeable to @sentry/node
 * later for breadcrumbs / auto-instrumentation; this covers exception capture.)
 */
import { env } from '../env';

interface Endpoint {
  url: string;
  publicKey: string;
}

function parseDsn(dsn: string): Endpoint | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, '');
    if (!u.username || !projectId) return null;
    return { url: `${u.protocol}//${u.host}/api/${projectId}/envelope/`, publicKey: u.username };
  } catch {
    return null;
  }
}

const endpoint = env.SENTRY_DSN ? parseDsn(env.SENTRY_DSN) : null;
export const sentryConfigured = !!endpoint;

/** Report an exception to Sentry (best-effort; never throws). */
export async function captureException(err: unknown, extra?: Record<string, unknown>): Promise<void> {
  if (!endpoint) return;
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const ts = new Date().toISOString();
    const event = {
      event_id: eventId,
      timestamp: ts,
      platform: 'node',
      level: 'error',
      server_name: 'sizzle-api',
      exception: { values: [{ type: e.name, value: e.message }] },
      extra: { ...extra, stack: e.stack },
    };
    const body = `${JSON.stringify({ event_id: eventId, sent_at: ts })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000); // never hang the error path
    await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-sentry-envelope',
        'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${endpoint.publicKey}, sentry_client=sizzle-api/1.0`,
      },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
  } catch {
    /* monitoring must never break the request path */
  }
}
