import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Don't trigger HMR reloads when `tsc -b` / `vite build` write these.
    watch: { ignored: ['**/*.tsbuildinfo', '**/dist/**'] },
  },
});
