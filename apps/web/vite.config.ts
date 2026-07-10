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

// https://vite.dev/config/
export default defineConfig({
  plugins: [staticPages(), react()],
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
