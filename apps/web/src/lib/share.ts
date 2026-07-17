import { useSizzle } from '../store';

/**
 * Present the native OS share sheet, pausing feed/viewer video while it's up.
 * The iOS share sheet presents OVER the WKWebView without firing a visibility
 * change, so a playing <video> keeps blaring audio underneath. We flip the
 * global `sharing` flag (folded into feed + viewer suppression) for the lifetime
 * of the share promise, so the clip pauses and resumes when the sheet closes.
 *
 * Returns 'shared' on completion, 'dismissed' on cancel, 'unavailable' when the
 * Web Share API isn't present (caller falls back to copy-link).
 */
export type ShareOutcome = 'shared' | 'dismissed' | 'unavailable';
export async function nativeShare(data: ShareData): Promise<ShareOutcome> {
  if (typeof navigator === 'undefined' || !navigator.share) return 'unavailable';
  const setSharing = useSizzle.getState().setSharing;
  setSharing(true);
  try {
    await navigator.share(data);
    return 'shared';
  } catch {
    return 'dismissed';
  } finally {
    setSharing(false);
  }
}

/**
 * Shareable deep links. On native, `location.origin` is `capacitor://localhost`,
 * so links must be built from the canonical public origin instead. Boot + native
 * `appUrlOpen` both parse `/r/:id` back out via `parseRecipeDeepLink`.
 */
export const SITE_ORIGIN =
  (import.meta.env.VITE_SITE_ORIGIN as string | undefined)?.replace(/\/$/, '') || 'https://getsizzle.app';

/** Canonical link to a recipe (opens the app / feed to that recipe). */
export const recipeShareUrl = (id: string): string => `${SITE_ORIGIN}/r/${id}`;

/** Canonical link to a profile (opens the app to that cook). */
export const cookShareUrl = (handle: string): string => `${SITE_ORIGIN}/u/${handle}`;

/** Canonical link to a public board. */
export const boardShareUrl = (id: string): string => `${SITE_ORIGIN}/b/${id}`;

/** Extract a board id from a `/b/:id` path or `?b=:id` query. */
export function parseBoardDeepLink(input: string): string | null {
  try {
    const u = new URL(input, SITE_ORIGIN);
    const m = u.pathname.match(/^\/b\/([0-9a-fA-F-]{36})\/?$/);
    if (m) return m[1];
    const q = u.searchParams.get('b');
    if (q && /^[0-9a-fA-F-]{36}$/.test(q)) return q;
    return null;
  } catch {
    const m = input.match(/^\/b\/([0-9a-fA-F-]{36})\/?$/);
    return m ? m[1] : null;
  }
}

const HANDLE = /^[A-Za-z0-9_]{3,30}$/;

/** Extract a cook handle from a `/u/:handle` path, a `?u=:handle` query (the SEO
 *  profile page's "open in app" CTA), or a full URL — or null if it isn't one. */
export function parseCookDeepLink(input: string): string | null {
  try {
    const u = new URL(input, SITE_ORIGIN);
    const m = u.pathname.match(/^\/u\/([A-Za-z0-9_]{3,30})\/?$/);
    if (m) return m[1];
    const q = u.searchParams.get('u');
    if (q && HANDLE.test(q)) return q;
    return null;
  } catch {
    const m = input.match(/^\/u\/([A-Za-z0-9_]{3,30})\/?$/);
    return m ? m[1] : null;
  }
}

const UUID = /^[0-9a-fA-F-]{36}$/;

/** Extract a recipe id from a `/r/:id` path, a `?r=:id` query (the SEO page's
 *  "open in app" CTA links here so the crawlable page can hand off to the SPA),
 *  or a full URL — or null if it isn't one. */
export function parseRecipeDeepLink(input: string): string | null {
  try {
    const u = new URL(input, SITE_ORIGIN);
    const m = u.pathname.match(/^\/r\/([0-9a-fA-F-]{36})\/?$/);
    if (m) return m[1];
    const q = u.searchParams.get('r');
    if (q && UUID.test(q)) return q;
    return null;
  } catch {
    const m = input.match(/^\/r\/([0-9a-fA-F-]{36})\/?$/);
    return m ? m[1] : null;
  }
}
