import { Hono } from 'hono';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { notImplemented } from '../lib/errors';
import type { AppEnv } from '../types';

export const recipes = new Hono<AppEnv>();

// TODO(phase1-data): full recipe detail with ingredients/steps + viewer state.
recipes.get('/:id', optionalAuth, () => {
  throw notImplemented('GET /recipes/:id — Phase 1 data slice');
});

// TODO(phase1-data): create recipe metadata after a video upload is registered.
recipes.post('/', requireAuth, () => {
  throw notImplemented('POST /recipes — Phase 1 data slice');
});

// TODO(phase1-data): reactions (like/dislike are mutually exclusive) + save.
recipes.post('/:id/like', requireAuth, () => {
  throw notImplemented('POST /recipes/:id/like — Phase 1 data slice');
});
recipes.post('/:id/dislike', requireAuth, () => {
  throw notImplemented('POST /recipes/:id/dislike — Phase 1 data slice');
});
recipes.post('/:id/save', requireAuth, () => {
  throw notImplemented('POST /recipes/:id/save — Phase 1 data slice');
});
