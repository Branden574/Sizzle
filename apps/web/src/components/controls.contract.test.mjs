import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '..');
const controlsPath = path.join(here, 'controls.tsx');
const cssPath = path.join(srcRoot, 'index.css');

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  }));
  return nested.flat();
}

test('exports the complete public control architecture', async () => {
  const source = await readFile(controlsPath, 'utf8');
  for (const name of ['Button', 'IconButton', 'GlassButton', 'LoadingButton', 'ReactionButton', 'FollowButton', 'FloatingActionButton', 'ButtonGroup', 'SegmentedControl', 'FilterChip', 'DismissBackdrop']) {
    assert.match(source, new RegExp(`export (?:const|function) ${name}\\b`), `${name} must remain public`);
  }
  assert.match(source, /aria-busy=\{busy \|\| undefined\}/);
  assert.match(source, /aria-pressed=/);
  assert.match(source, /sz-button__measure/);
});

test('all product buttons go through the shared primitive', async () => {
  const files = (await filesUnder(srcRoot)).filter((file) => file.endsWith('.tsx') && file !== controlsPath);
  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (/<button(?:\s|>)/.test(source)) offenders.push(path.relative(srcRoot, file));
  }
  assert.deepEqual(offenders, []);
});

test('no non-semantic click targets remain', async () => {
  const files = (await filesUnder(srcRoot)).filter((file) => file.endsWith('.tsx'));
  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (/<(?:div|span|article|img)[^>]*onClick=|role=["']button["']/.test(source)) offenders.push(path.relative(srcRoot, file));
  }
  assert.deepEqual(offenders, []);
});

test('semantic tokens and preference fallbacks remain complete', async () => {
  const css = await readFile(cssPath, 'utf8');
  for (const token of [
    '--button-primary-bg', '--button-primary-fg', '--button-primary-hover', '--button-primary-pressed',
    '--button-tonal-bg', '--button-glass-bg', '--button-glass-border', '--button-danger-bg',
    '--button-success-bg', '--button-disabled-bg', '--button-focus-ring', '--button-touch-target',
    '--button-radius-standard', '--button-label-font', '--button-motion-press', '--button-elevation-floating',
    '--button-blur-standard',
  ]) assert.match(css, new RegExp(`${token}:`), `${token} is missing`);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /prefers-reduced-transparency: reduce/);
  assert.match(css, /prefers-contrast: more/);
  assert.match(css, /@supports not \(\(backdrop-filter:/);
});

test('glow CTA stays decorative, restrained, and preference-aware', async () => {
  const glow = await readFile(path.join(here, 'glow.tsx'), 'utf8');
  const css = await readFile(cssPath, 'utf8');
  // The halo is decorative: hidden from AT, never interactive, behind the button.
  assert.match(glow, /sz-glow__halo" aria-hidden="true"/);
  assert.match(css, /\.sz-glow__halo[\s\S]*?pointer-events: none/);
  assert.match(css, /\.sz-glow \{[^}]*isolation: isolate/);
  // Reduced motion and disabled/loading freeze the halo (JS guard + CSS backstop).
  assert.match(glow, /prefers-reduced-motion: reduce/);
  assert.match(glow, /reduceMotion \|\| inert \? 'static'/);
  assert.match(css, /\.sz-glow\[data-inert\] \.sz-glow__halo \{ opacity: [.\d]+; animation: none; \}/);
  // Sizzle ember palette, not a generic rainbow; blur is an inline filter (no
  // dynamically-generated class names).
  assert.match(glow, /SIZZLE_GLOW_COLORS = \[\s*'var\(--accent/);
  assert.match(glow, /filter: `blur\(\$\{blurPx\}px\)`/);
  // The forwarded ref reaches the real button primitive.
  assert.match(glow, /<Button \{\.\.\.props\} ref=\{ref\}/);
});

test('compact controls keep honest 44px touch targets', async () => {
  const css = await readFile(cssPath, 'utf8');
  // Visible chrome may shrink below 44px only alongside the ::after hit extension.
  assert.match(css, /\.sz-icon-button::after,\s*\n\.sz-filter-chip::after,\s*\n\.sz-follow--compact::after/);
  assert.match(css, /inset: min\(0px, calc\(\(100% - var\(--button-touch-target\)\) \/ 2\)\)/);
  // Buttons opt out of implicit form submission unless a caller passes type="submit".
  const source = await readFile(controlsPath, 'utf8');
  assert.match(source, /type=\{type \?\? 'button'\}/);
  // Busy buttons stay focusable (aria-disabled, not hard-disabled).
  assert.match(source, /aria-disabled=\{unavailable \|\| undefined\}/);
});
