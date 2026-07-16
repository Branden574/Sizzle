/**
 * TikTok-style instant self-playback: after you post a video, the ORIGINAL file
 * is still on the device — so the feed/viewer/sheet play that local copy
 * immediately instead of showing "Processing…" while Cloudflare transcodes.
 * Session-scoped by design (a refresh falls back to the normal processing
 * state); entries are keyed by recipe id the moment the post is created.
 */
const clips = new Map<string, string>();

/** Remember the just-posted clip's object URL under its new recipe id. */
export function rememberLocalClip(recipeId: string, objectUrl: string): void {
  clips.set(recipeId, objectUrl);
}

/** The local object URL for a recipe's clip, if this session posted it. */
export function getLocalClip(recipeId: string): string | null {
  return clips.get(recipeId) ?? null;
}

/** Drop a clip (e.g. the remote HLS is ready and playing, or the post was deleted). */
export function releaseLocalClip(recipeId: string): void {
  const url = clips.get(recipeId);
  if (url) URL.revokeObjectURL(url);
  clips.delete(recipeId);
}
