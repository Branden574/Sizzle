import type { CSSProperties } from 'react';

/**
 * Inline CSS custom properties driving the `.sz-press` utility.
 * `press` is the active/pressed scale; `s` is the optional resting scale
 * (used by chips that grow when selected).
 */
export function pressVars(press: number, s?: number): CSSProperties {
  const vars: Record<string, string> = { '--press': String(press) };
  if (s !== undefined) vars['--s'] = String(s);
  return vars as CSSProperties;
}
