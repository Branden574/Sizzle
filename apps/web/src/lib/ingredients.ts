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

/* ── Unit conversion (Original / Metric / Imperial) ─────────────────────── */

export type UnitSystem = 'original' | 'metric' | 'imperial';

type Dim = 'mass' | 'vol' | 'len';
interface UnitDef { dim: Dim; base: number; system: 'metric' | 'imperial' }

// Each known unit spelling → its dimension, value in a base unit (g / ml / cm),
// and which system it belongs to.
const UNIT_DEFS: Record<string, UnitDef> = {
  mg: { dim: 'mass', base: 0.001, system: 'metric' },
  g: { dim: 'mass', base: 1, system: 'metric' }, gram: { dim: 'mass', base: 1, system: 'metric' }, grams: { dim: 'mass', base: 1, system: 'metric' },
  kg: { dim: 'mass', base: 1000, system: 'metric' },
  oz: { dim: 'mass', base: 28.3495, system: 'imperial' }, ounce: { dim: 'mass', base: 28.3495, system: 'imperial' }, ounces: { dim: 'mass', base: 28.3495, system: 'imperial' },
  lb: { dim: 'mass', base: 453.592, system: 'imperial' }, lbs: { dim: 'mass', base: 453.592, system: 'imperial' }, pound: { dim: 'mass', base: 453.592, system: 'imperial' }, pounds: { dim: 'mass', base: 453.592, system: 'imperial' },
  ml: { dim: 'vol', base: 1, system: 'metric' },
  l: { dim: 'vol', base: 1000, system: 'metric' }, litre: { dim: 'vol', base: 1000, system: 'metric' }, litres: { dim: 'vol', base: 1000, system: 'metric' }, liter: { dim: 'vol', base: 1000, system: 'metric' }, liters: { dim: 'vol', base: 1000, system: 'metric' },
  tsp: { dim: 'vol', base: 4.92892, system: 'imperial' }, teaspoon: { dim: 'vol', base: 4.92892, system: 'imperial' }, teaspoons: { dim: 'vol', base: 4.92892, system: 'imperial' },
  tbsp: { dim: 'vol', base: 14.7868, system: 'imperial' }, tbs: { dim: 'vol', base: 14.7868, system: 'imperial' }, tablespoon: { dim: 'vol', base: 14.7868, system: 'imperial' }, tablespoons: { dim: 'vol', base: 14.7868, system: 'imperial' },
  cup: { dim: 'vol', base: 236.588, system: 'imperial' }, cups: { dim: 'vol', base: 236.588, system: 'imperial' },
  cm: { dim: 'len', base: 1, system: 'metric' },
  inch: { dim: 'len', base: 2.54, system: 'imperial' }, inches: { dim: 'len', base: 2.54, system: 'imperial' },
};

/** Pick the output unit + quantity for a base amount in the target system. */
function pickUnit(dim: Dim, base: number, system: 'metric' | 'imperial'): { quantity: number; unit: string } {
  if (dim === 'mass') {
    if (system === 'metric') return base >= 1000 ? { quantity: base / 1000, unit: 'kg' } : { quantity: base, unit: 'g' };
    return base >= 453.592 ? { quantity: base / 453.592, unit: 'lb' } : { quantity: base / 28.3495, unit: 'oz' };
  }
  if (dim === 'vol') {
    if (system === 'metric') return base >= 1000 ? { quantity: base / 1000, unit: 'l' } : { quantity: base, unit: 'ml' };
    if (base >= 236.588) return { quantity: base / 236.588, unit: 'cup' };
    if (base >= 14.7868) return { quantity: base / 14.7868, unit: 'tbsp' };
    return { quantity: base / 4.92892, unit: 'tsp' };
  }
  return system === 'metric' ? { quantity: base, unit: 'cm' } : { quantity: base / 2.54, unit: 'inch' };
}

/** Convert a quantity+unit into the target system, or null if not convertible / already native. */
export function convertUnit(quantity: number, unit: string | null, system: 'metric' | 'imperial'): { quantity: number; unit: string } | null {
  if (!unit) return null;
  const def = UNIT_DEFS[unit.toLowerCase()];
  if (!def || def.system === system) return null; // unknown or already in target system
  return pickUnit(def.dim, quantity * def.base, system);
}

/** Format a converted amount: metric units round to whole/nice numbers, imperial uses fractions. */
function formatAmount(n: number, unit: string): string {
  if (unit === 'kg' || unit === 'l') return String(Math.round(n * 10) / 10);
  if (['ml', 'g', 'mg', 'cm'].includes(unit)) {
    if (n >= 20) return String(Math.round(n / 5) * 5);
    if (n >= 1) return String(Math.round(n));
    return String(Math.round(n * 10) / 10);
  }
  return formatQuantity(n); // imperial → friendly fractions (½, ¼…)
}

/**
 * Re-render an ingredient line at a scale factor, optionally converting units to
 * the metric/imperial system. No-op for lines without a parseable quantity.
 */
export function scaleIngredient(raw: string, factor: number, units: UnitSystem = 'original'): string {
  const p = parseIngredient(raw);
  if (p.quantity == null) return raw;
  const scaled = p.quantity * factor;
  if (units !== 'original' && p.unit) {
    const conv = convertUnit(scaled, p.unit, units);
    if (conv) return [formatAmount(conv.quantity, conv.unit), conv.unit, p.name].filter(Boolean).join(' ');
  }
  return [formatQuantity(scaled), p.unit, p.name].filter(Boolean).join(' ');
}
