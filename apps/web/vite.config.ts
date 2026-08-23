import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Static marketing/legal pages that live in public/<route>/index.html and are
// served at clean routes in production (Vercel serves the files directly). In
// dev, Vite's SPA fallback would otherwise return the app for these paths, so
// this plugin serves the real files — keeping the preview faithful to prod.
const STATIC_ROUTES = ['privacy', 'terms', 'cookie-policy', 'contact'];
const publicDir = fileURLToPath(new URL('./public', import.meta.url));

function staticPages() {
  return {
    name: 'sizzle-static-pages',
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0].replace(/\/+$/, '');
        const name = path.replace(/^\//, '');
        if (STATIC_ROUTES.includes(name)) {
          try {
            const html = readFileSync(`${publicDir}/${name}/index.html`, 'utf8');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);
            return;
          } catch {
            /* fall through to default handling */
          }
        }
        next();
      });
    },
  };
}

// Build-time app version (from package.json) — the web/fallback shown in Settings.
// On native the live OTA bundle version + native build are read at runtime.
const APP_VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

/**
 * Emit `dist/version.json` so a deploy can be verified from the SERVED surface.
 *
 * The API already answers this via `/health`'s `commit` field; the frontend had no
 * equivalent, so `scripts/verify-deploy.mjs` could only ask Vercel's API whether a
 * deployment carrying HEAD's SHA reached READY — never whether getsizzle.app is
 * actually serving that build (TD-8). This closes that: the file is written by the
 * build itself, so whatever is served came from whatever was built.
 *
 * The app never imports it — it is a static artifact for tooling, so it carries no
 * runtime risk. Nothing secret goes in: the commit SHA is already public on /health.
 *
 * `commit` is null when no CI/Vercel SHA is in the environment (a plain local build,
 * or an archive CLI deploy). verify-deploy reports that case rather than failing on
 * it — see its web branch.
 */
function versionManifest() {
  return {
    name: 'sizzle-version-manifest',
    generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(
          {
            version: APP_VERSION,
            commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
            builtAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [staticPages(), versionManifest(), react()],
  server: {
    // Don't trigger HMR reloads when `tsc -b` / `vite build` write these.
    watch: { ignored: ['**/*.tsbuildinfo', '**/dist/**'] },
  },
  build: {
    // Split long-lived vendor code into its own cacheable chunks so app changes
    // don't bust the whole bundle, and the initial payload is smaller. Match by
    // module path (not bare package name) — firebase has no root entry to resolve.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
          if (/node_modules\/(@tanstack|zustand|@supabase)\//.test(id)) return 'vendor-data';
          if (id.includes('node_modules/hls.js')) return 'vendor-media';
          if (/node_modules\/(gsap|@gsap|lenis)\//.test(id)) return 'vendor-anim';
          if (/node_modules\/(firebase|@firebase|@capacitor-firebase)\//.test(id)) return 'vendor-firebase';
          return undefined;
        },
      },
    },
  },
});
