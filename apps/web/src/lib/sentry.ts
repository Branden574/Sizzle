/**
 * Minimal, dependency-free Sentry capture for the browser. Posts an event
 * envelope to the ingest endpoint derived from VITE_SENTRY_DSN. No-op when the
 * DSN is unset, so the app runs unchanged without it.
 */
const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

function parseDsn(dsn: string): { url: string; publicKey: string } | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, '');
    if (!u.username || !projectId) return null;
    return { url: `${u.protocol}//${u.host}/api/${projectId}/envelope/`, publicKey: u.username };
  } catch {
    return null;
  }
}

/**
 * Suppress reporting from a locally-served build.
 *
 * `npm run build` bakes VITE_SENTRY_DSN into the bundle, so serving dist/ from localhost — or
 * running a Playwright reproduction against it — posts real events into the production `sizzle`
 * project, indistinguishable from a user's crash. That has already happened once: a deliberate
 * stale-chunk test raised a "SIZZLE-3 TypeError" alert that looked like a live incident.
 *
 * Native is exempt: Capacitor serves the app from capacitor://localhost (iOS) and
 * http://localhost (Android), so hostname alone would silence every real device crash. Those
 * are checked via Capacitor's own platform flag rather than the hostname.
 */
function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  // A real native install must keep reporting even though it serves from "localhost".
  if (/^capacitor:$/i.test(location.protocol)) return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (w.Capacitor?.isNativePlatform?.()) return false;
  return /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/i.test(location.hostname);
}

const endpoint = DSN && !isLocalDevHost() ? parseDsn(DSN) : null;

/** Report an exception to Sentry (best-effort; never throws). */
export function captureException(err: unknown, extra?: Record<string, unknown>): void {
  if (!endpoint) return;
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const ts = new Date().toISOString();
    const event = {
      event_id: eventId,
      timestamp: ts,
      platform: 'javascript',
      level: 'error',
      exception: { values: [{ type: e.name, value: e.message }] },
      // origin+pathname only — never the hash/query, which on the web OAuth
      // implicit flow briefly carries #access_token=…&refresh_token=… (would ship a
      // live session token to Sentry if an error fired before it's stripped).
      extra: { ...extra, stack: e.stack, url: location.origin + location.pathname },
    };
    const body = `${JSON.stringify({ event_id: eventId, sent_at: ts })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
    void fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-sentry-envelope',
        'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${endpoint.publicKey}, sentry_client=sizzle-web/1.0`,
      },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never throw from logging */
  }
}

/** Install global handlers (call once at startup). No-op without a DSN. */
export function initSentry(): void {
  if (!endpoint) return;
  window.addEventListener('error', (ev) => captureException(ev.error ?? ev.message, { kind: 'window.onerror' }));
  window.addEventListener('unhandledrejection', (ev) => captureException(ev.reason, { kind: 'unhandledrejection' }));
}
