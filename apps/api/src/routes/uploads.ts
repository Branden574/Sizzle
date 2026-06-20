import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { notImplemented } from '../lib/errors';
import type { AppEnv } from '../types';

export const uploads = new Hono<AppEnv>();

// TODO(phase1-data): create a direct upload ticket via the stream provider,
// persist a pending video_asset, return DirectUploadTicket.
uploads.post('/video', requireAuth, () => {
  throw notImplemented('POST /uploads/video — Phase 1 data slice');
});

// TODO(phase1-data): Cloudflare Stream webhook → mark asset ready (hls/poster).
uploads.post('/webhook/cloudflare-stream', () => {
  throw notImplemented('POST /uploads/webhook/cloudflare-stream — Phase 1 data slice');
});
