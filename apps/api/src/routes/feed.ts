import { Hono } from 'hono';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { notImplemented } from '../lib/errors';
import type { AppEnv } from '../types';

export const feed = new Hono<AppEnv>();

// TODO(phase1-data): For You = recent + popular; viewer state hydrated when authed.
feed.get('/for-you', optionalAuth, () => {
  throw notImplemented('GET /feed/for-you — Phase 1 data slice');
});

// TODO(phase1-data): recipes from cooks the viewer follows.
feed.get('/following', requireAuth, () => {
  throw notImplemented('GET /feed/following — Phase 1 data slice');
});
