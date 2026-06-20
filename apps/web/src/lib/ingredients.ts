/**
 * Lightweight ingredient-line parser. Ingredients are stored as free text
 * ("2 globe eggplants", "3 tbsp white miso", "Salt to taste"); this splits a
 * line into a leading quantity + optional unit + name so the serving scaler and
 * shopping list can scale and aggregate amounts. Anything it can't parse (no
 * leading number) is returned with quantity=null and left untouched when scaled.
 */
export interface ParsedIngredient {
  raw: string;
  quantity: number | null;
  unit: string | null;
  name: string;
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

// Known measurement units (singular/plural/abbrev). First token after the
// quantity is treated as a unit only if it's in this set.
const UNITS = new Set([
  'tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tbs', 'tablespoon', 'tablespoons',
  'cup', 'cups', 'g', 'gram', 'grams', 'kg', 'mg', 'ml', 'l', 'litre', 'litres', 'liter', 'liters',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'clove', 'cloves', 'pinch', 'pinches', 'can', 'cans', 'slice', 'slices', 'sprig', 'sprigs',
  'stick', 'sticks', 'handful', 'handfuls', 'bunch', 'bunches', 'knob', 'knobs', 'dash', 'dashes',
  'cm', 'inch', 'inches', 'piece', 'pieces', 'packet', 'packets', 'jar', 'jars', 'block', 'blocks',
]);

/** Parse a single quantity token like "1", "1.5", "1/2", "1 1/2", "½", "1½". */
function parseQuantity(token: string): number | null {
  let t = token.trim();
  if (!t) return null;
  let total = 0;
  // leading unicode fraction or trailing unicode fraction on an integer (e.g. 1½)
  const lastChar = t[t.length - 1]!;
  if (UNICODE_FRACTIONS[lastChar] !== undefined) {
    total += UNICODE_FRACTIONS[lastChar]!;
    t = t.slice(0, -1).trim();
    if (!t) return total;
  }
  if (UNICODE_FRACTIONS[t] !== undefined) return total + UNICODE_FRACTIONS[t]!;
  // "1 1/2" → whole + fraction
  const parts = t.split(/\s+/);
  for (const p of parts) {
    if (p.includes('/')) {
      const [a, b] = p.split('/');
      const num = Number(a), den = Number(b);
      if (den) total += num / den;
      else return null;
    } else {
      const n = Number(p);
      if (Number.isNaN(n)) return null;
      total += n;
    }
  }
  return total;
}

const QTY_RE = /^((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d*\.\d+)|(?:\d+[½⅓⅔¼¾⅕⅖⅗⅘⅛⅜⅝⅞])|(?:\d+)|(?:[½⅓⅔¼¾⅕⅖⅗⅘⅛⅜⅝⅞]))\s*/;

export function parseIngredient(raw: string): ParsedIngredient {
  const trimmed = raw.trim();
  const m = trimmed.match(QTY_RE);
  if (!m) return { raw, quantity: null, unit: null, name: trimmed };
  let rest = trimmed.slice(m[0].length);
  // A range ("2-3 sprigs", "1 to 2 tbsp") would scale only the first bound and
  // mangle the rest — leave the whole line untouched instead.
  if (/^\s*[-–—]/.test(rest) || /^\s*to\s/i.test(rest)) {
    return { raw, quantity: null, unit: null, name: trimmed };
  }
  rest = rest.trim();
  const quantity = parseQuantity(m[1]!);
  let unit: string | null = null;
  const firstSpace = rest.search(/\s/);
  const firstToken = (firstSpace === -1 ? rest : rest.slice(0, firstSpace)).replace(/\.$/, '');
  if (UNITS.has(firstToken.toLowerCase())) {
    unit = firstToken;
    rest = firstSpace === -1 ? '' : rest.slice(firstSpace).trim();
  }
  return { raw, quantity, unit, name: rest };
}

/** Format a number as a friendly amount: 0.5 → "½", 1.5 → "1½", 0.33 → "⅓". */
export function formatQuantity(n: number): string {
  if (!Number.isFinite(n)) return '';
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  const fractions: [number, string][] = [
    [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.375, '⅜'], [0.5, '½'],
    [0.625, '⅝'], [2 / 3, '⅔'], [0.75, '¾'], [0.875, '⅞'],
  ];
  let glyph = '';
  for (const [val, g] of fractions) {
    if (Math.abs(frac - val) < 0.02) { glyph = g; break; }
  }
  if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph;
  if (Math.abs(frac) < 0.02) return String(whole);
  // fall back to a trimmed decimal
  return String(Math.round(n * 100) / 100);
}

/** Re-render an ingredient line at a scale factor (no-op when it has no quantity). */
export function scaleIngredient(raw: string, factor: number): string {
  const p = parseIngredient(raw);
  if (p.quantity == null) return raw;
  const qty = formatQuantity(p.quantity * factor);
  return [qty, p.unit, p.name].filter(Boolean).join(' ');
}
