/**
 * Shareable deep links. On native, `location.origin` is `capacitor://localhost`,
 * so links must be built from the canonical public origin instead. Boot + native
 * `appUrlOpen` both parse `/r/:id` back out via `parseRecipeDeepLink`.
 */
export const SITE_ORIGIN =
  (import.meta.env.VITE_SITE_ORIGIN as string | undefined)?.replace(/\/$/, '') || 'https://getsizzle.app';

/** Canonical link to a recipe (opens the app / feed to that recipe). */
export const recipeShareUrl = (id: string): string => `${SITE_ORIGIN}/r/${id}`;

/** Extract a recipe id from a `/r/:id` path or full URL, or null if it isn't one. */
export function parseRecipeDeepLink(input: string): string | null {
  let path = input;
  try {
    path = new URL(input, SITE_ORIGIN).pathname;
  } catch {
    /* input was already a bare path */
  }
  const m = path.match(/^\/r\/([0-9a-fA-F-]{36})\/?$/);
  return m ? m[1] : null;
}
