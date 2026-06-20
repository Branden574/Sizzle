/** 48200 → "48.2k", 203000 → "203k", 4100000 → "4.1M". Mirrors the prototype's labels. */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 100 ? trim1(k) : Math.round(k)}k`;
  }
  return `${trim1(n / 1_000_000)}M`;
}

function trim1(x: number): string {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
