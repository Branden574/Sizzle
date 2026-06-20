import { create } from 'zustand';

/**
 * Client-side shopping list, persisted to localStorage. Items can be added from
 * a recipe (carrying its title for grouping) and checked off / cleared.
 */
export interface ShoppingItem {
  id: string;
  text: string;
  checked: boolean;
  recipeId?: string;
  recipeTitle?: string;
}

const KEY = 'sz_shopping';

function load(): ShoppingItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ShoppingItem[]) : [];
  } catch {
    return [];
  }
}
function persist(items: ShoppingItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

const norm = (s: string) => s.trim().toLowerCase();

let idSeq = 0;
function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}_${idSeq++}`;
}

interface ShoppingState {
  items: ShoppingItem[];
  /** Add lines from a recipe; skips lines already on the list for that recipe. Returns how many were added. */
  add: (lines: string[], recipe?: { id: string; title: string }) => number;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  clearChecked: () => void;
  clearAll: () => void;
}

export const useShopping = create<ShoppingState>((set, get) => ({
  items: load(),
  add: (lines, recipe) => {
    const cleaned = lines.map((t) => t.trim()).filter(Boolean);
    if (!cleaned.length) return 0;
    const existing = get().items;
    let base = existing;
    let toAdd: string[];
    if (recipe) {
      // Re-adding a recipe replaces its previous lines (so changing the serving
      // scale and re-adding updates quantities instead of duplicating them).
      base = existing.filter((i) => i.recipeId !== recipe.id);
      const seen = new Set<string>();
      toAdd = cleaned.filter((t) => { const k = norm(t); if (seen.has(k)) return false; seen.add(k); return true; });
    } else {
      const seen = new Set(existing.map((i) => norm(i.text)));
      toAdd = cleaned.filter((t) => !seen.has(norm(t)));
    }
    const fresh = toAdd.map((text) => ({ id: newId(), text, checked: false, recipeId: recipe?.id, recipeTitle: recipe?.title }));
    const items = [...base, ...fresh];
    persist(items);
    set({ items });
    return fresh.length;
  },
  toggle: (id) => set((s) => { const items = s.items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)); persist(items); return { items }; }),
  remove: (id) => set((s) => { const items = s.items.filter((i) => i.id !== id); persist(items); return { items }; }),
  clearChecked: () => set((s) => { const items = s.items.filter((i) => !i.checked); persist(items); return { items }; }),
  clearAll: () => { persist([]); set({ items: [] }); },
}));
