import type { RecipeDetail } from '@sizzle/shared';

/**
 * Offline recipe cache. The server tracks *which* recipes are downloaded; the
 * recipe content (ingredients/steps/metadata + poster) is cached here so it's
 * readable with no network. (True offline video playback needs the real
 * Cloudflare MP4 + Cache API — tracked as a follow-up; the poster is cached.)
 */
const KEY = (id: string) => `sz_offline_${id}`;
const INDEX = 'sz_offline_index';

function readIndex(): string[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX) || '[]');
  } catch {
    return [];
  }
}
function writeIndex(ids: string[]) {
  localStorage.setItem(INDEX, JSON.stringify([...new Set(ids)]));
}

export function saveOffline(recipe: RecipeDetail) {
  try {
    localStorage.setItem(KEY(recipe.id), JSON.stringify(recipe));
    writeIndex([recipe.id, ...readIndex()]);
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

export function getOffline(id: string | null): RecipeDetail | null {
  if (!id) return null;
  try {
    const v = localStorage.getItem(KEY(id));
    return v ? (JSON.parse(v) as RecipeDetail) : null;
  } catch {
    return null;
  }
}

export function removeOffline(id: string) {
  try {
    localStorage.removeItem(KEY(id));
    writeIndex(readIndex().filter((x) => x !== id));
  } catch {
    /* ignore */
  }
}

export function listOffline(): RecipeDetail[] {
  return readIndex()
    .map((id) => getOffline(id))
    .filter((r): r is RecipeDetail => !!r);
}

/** Drop every cached recipe (Settings → Clear downloaded recipes). */
export function clearOffline() {
  try {
    for (const id of readIndex()) localStorage.removeItem(KEY(id));
    localStorage.removeItem(INDEX);
  } catch {
    /* ignore */
  }
}
