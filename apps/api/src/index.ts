import { serve } from '@hono/node-server';
import { createApp } from './app';
import { env } from './env';

const app = createApp();

// Bind all interfaces so native apps / emulators / devices on the LAN can reach it.
serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
   
  console.log(`✓ Sizzle API listening on http://0.0.0.0:${info.port}  (video: ${env.VIDEO_PROVIDER})`);
});
