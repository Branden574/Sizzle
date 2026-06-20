import { Hono } from 'hono';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { notImplemented } from '../lib/errors';
import type { AppEnv } from '../types';

export const cooks = new Hono<AppEnv>();

// TODO(phase1-data): cook profile — bio, counts, recipe grid, viewer.following.
cooks.get('/:id', optionalAuth, () => {
  throw notImplemented('GET /cooks/:id — Phase 1 data slice');
});

// TODO(phase1-data): follow / unfollow.
cooks.post('/:id/follow', requireAuth, () => {
  throw notImplemented('POST /cooks/:id/follow — Phase 1 data slice');
});
cooks.delete('/:id/follow', requireAuth, () => {
  throw notImplemented('DELETE /cooks/:id/follow — Phase 1 data slice');
});
