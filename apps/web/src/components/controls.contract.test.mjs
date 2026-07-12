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
