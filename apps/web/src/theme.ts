/**
 * Sizzle design tokens.
 *
 * `accent` and `saffron` were exposed as configurable color props in the
 * original design (defaults below). They drive CTA fills, active states and
 * the warm radial washes throughout the app, and are surfaced as CSS custom
 * properties (`--accent`, `--saffron`) on the phone root so nested components
 * can reference them directly.
 */
export const theme = {
  accent: 'var(--accent, #ff5a36)',
  saffron: 'var(--saffron, #f4a52c)',

  // Surfaces
  cream: 'var(--bg, #faf3ea)',
  creamSoft: 'var(--bg-soft, #faf6f0)',
  feedBlack: 'var(--feed-bg, #0c0a09)',

  // Ink
  ink: 'var(--text, #1b1512)',
  ink2: 'var(--text-2, #3a322c)',
  muted: 'var(--text-muted, #5c5048)',
  muted2: 'var(--text-soft, #6c5f56)',
  muted3: 'var(--text-faint, #8a7c70)',
  muted4: 'var(--text-faint-2, #a99c90)',
  muted5: 'var(--text-faint-2, #b3a698)',

  // Hairlines / borders
  line: 'var(--line, #ece1d4)',
  line2: 'var(--line-2, #e3d6c8)',
  line3: 'var(--line-3, #e0d4c6)',
  line4: 'var(--line-2, #e6dacb)',
  line5: 'var(--line, #f3ebe0)',
  line6: 'var(--line, #f0e7da)',
  track: 'var(--track, #d8cbbb)',

  // Phone metrics
  phoneW: 393,
  phoneH: 852,
} as const;

export type Theme = typeof theme;
