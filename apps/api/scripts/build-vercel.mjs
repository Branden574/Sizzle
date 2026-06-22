// Build the API for Vercel using the Build Output API. We esbuild-bundle the
// Hono app into ONE self-contained ESM file (deps inlined), so Vercel's Node
// loader never has to resolve relative/workspace imports at runtime — which is
// what broke the zero-config @vercel/node build.
import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const OUT = '.vercel/output';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/functions/api.func`, { recursive: true });
mkdirSync(`${OUT}/static`, { recursive: true });

await build({
  entryPoints: ['api/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: `${OUT}/functions/api.func/index.mjs`,
  // Some bundled CJS deps call require() at runtime; provide it under ESM.
  banner: { js: "import{createRequire as ___cr}from'module';const require=___cr(import.meta.url);" },
  logLevel: 'info',
});

writeFileSync(
  `${OUT}/functions/api.func/.vc-config.json`,
  JSON.stringify({ runtime: 'nodejs20.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false }),
);

writeFileSync(`${OUT}/static/index.html`, '<!doctype html><meta charset="utf-8"><title>Sizzle API</title>Sizzle API');

writeFileSync(
  `${OUT}/config.json`,
  JSON.stringify({
    version: 3,
    routes: [
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/api' },
    ],
  }),
);

console.log('✓ Built .vercel/output (function: api.func)');
