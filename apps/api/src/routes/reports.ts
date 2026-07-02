import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, requireNotBanned } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { badRequest } from '../lib/errors';
import { fileReport } from '../services/reports';
import type { AppEnv } from '../types';

export const reports = new Hono<AppEnv>();

const reportSchema = z.object({
  targetType: z.enum(['recipe', 'comment', 'profile']),
  targetId: z.string().uuid(),
  category: z.enum(['nudity', 'harassment', 'violence', 'spam', 'other']),
  reason: z.string().trim().max(500).optional(),
});

/** POST /reports — flag any user-generated target (recipe / comment / profile). */
reports.post('/', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 15, name: 'report' }), async (c) => {
  const userId = c.get('userId')!;
  const parsed = reportSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Invalid report');
  await fileReport({
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId,
    reporterId: userId,
    category: parsed.data.category,
    reason: parsed.data.reason,
  });
  return c.json({ ok: true });
});
