import type { Context } from 'hono';
import type { ApiErrorBody } from '@sizzle/shared';
import { captureException } from './sentry';

/** A typed, client-safe error with an HTTP status and stable code. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Not allowed') => new AppError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found') => new AppError(404, 'not_found', msg);
export const dbFail = (msg: string, details?: unknown) => new AppError(500, 'db_error', msg, details);

/** Central error handler — turns any thrown value into an ApiErrorBody. */
export async function onError(err: unknown, c: Context): Promise<Response> {
  if (err instanceof AppError) {
    // Never leak internal (5xx) detail to clients — log it, report it, return a
    // generic message. Expected 4xx client errors are not reported.
    if (err.status >= 500) {
      console.error(`[${err.code}]`, err.message, err.details ?? '');
      await captureException(err, { code: err.code, path: c.req.path, details: err.details });
      const body: ApiErrorBody = { error: { code: err.code, message: 'Something went wrong' } };
      return c.json(body, err.status as 500);
    }
    const body: ApiErrorBody = { error: { code: err.code, message: err.message, details: err.details } };
    return c.json(body, err.status as 400);
  }
  console.error('Unhandled error:', err);
  await captureException(err, { path: c.req.path });
  const body: ApiErrorBody = { error: { code: 'internal_error', message: 'Something went wrong' } };
  return c.json(body, 500);
}
