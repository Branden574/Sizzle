/**
 * Heuristic taste matching — the cold-start front-half of the Phase 4 ranking
 * design (docs/recommendation-algorithm.md). Maps a viewer's onboarding taste
 * picks to creators/recipes by keyword overlap. A learned model replaces this
 * in Phase 4; the interface (score a text blob against tastes) stays the same.
 */

/** Keyword signals per onboarding taste label, matched against lowercased text. */
const TASTE_SIGNALS: Record<string, string[]> = {
  Japanese: ['japanese', 'miso', 'mirin', 'sake', 'tokyo', 'omelette'],
  Italian: ['italian', 'pasta', 'burrata', 'parmesan', 'basil'],
  Mexican: ['mexican', 'taco', 'tortilla', 'salsa', 'ancho'],
  Vegetarian: ['vegetarian', 'eggplant', 'burrata', 'toast', 'tofu', 'chickpea'],
  Spicy: ['spicy', 'chili', 'harissa', 'heat', 'sichuan', 'chaat', 'sweat'],
  Mediterranean: ['mediterranean', 'olive', 'burrata', 'harissa', 'saffron', 'heirloom'],
  'Quick & easy': ['quick', 'easy', 'weeknight', 'fast', 'fridge', '15-min', 'min'],
  Baking: ['bake', 'bakes', 'baker', 'cake', 'buns', 'cardamom', 'pistachio', 'butter'],
  'High protein': ['protein', 'chicken', 'rib', 'beef', 'seafood'],
  Korean: ['korean', 'gochujang', 'kimchi'],
  'Comfort food': ['comfort', 'noodles', 'buns', 'cake', 'stew'],
  Vegan: ['vegan', 'tofu'],
  Seafood: ['seafood', 'saffron', 'fish', 'coastal'],
  'Street food': ['street', 'chaat', 'puri', 'taco', 'noodles'],
  'Low effort': ['low effort', 'easy', 'quick', 'fridge', 'fast'],
  Indian: ['indian', 'chaat', 'puri', 'pani', 'tamarind', 'sev'],
};

/** Returns the subset of `tastes` whose signals appear in `text`. */
export function matchTastes(text: string, tastes: string[]): string[] {
  const blob = text.toLowerCase();
  return tastes.filter((t) => (TASTE_SIGNALS[t] ?? [t.toLowerCase()]).some((kw) => blob.includes(kw)));
}

/** Match score = number of selected tastes whose signals appear in `text`. */
export function tasteScore(text: string, tastes: string[]): number {
  return matchTastes(text, tastes).length;
}
