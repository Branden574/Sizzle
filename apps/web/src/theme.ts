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
  accent: '#ff5a36',
  saffron: '#f4a52c',

  // Surfaces
  cream: '#faf3ea',
  creamSoft: '#faf6f0',
  feedBlack: '#0c0a09',

  // Ink
  ink: '#1b1512',
  ink2: '#3a322c',
  muted: '#5c5048',
  muted2: '#6c5f56',
  muted3: '#8a7c70',
  muted4: '#a99c90',
  muted5: '#b3a698',

  // Hairlines / borders
  line: '#ece1d4',
  line2: '#e3d6c8',
  line3: '#e0d4c6',
  line4: '#e6dacb',
  line5: '#f3ebe0',
  line6: '#f0e7da',
  track: '#d8cbbb',

  // Phone metrics
  phoneW: 393,
  phoneH: 852,
} as const;

export type Theme = typeof theme;
