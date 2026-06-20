import { serve } from '@hono/node-server';
import { createApp } from './app';
import { env } from './env';

const app = createApp();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`✓ Sizzle API listening on http://localhost:${info.port}  (video: ${env.VIDEO_PROVIDER})`);
});
