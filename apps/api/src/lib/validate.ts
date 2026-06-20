import { notFound } from './errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** Reject malformed ids early (as not-found) instead of letting Postgres 500. */
export function assertUuid(id: string, label = 'resource'): string {
  if (!isUuid(id)) throw notFound(`${label[0]!.toUpperCase()}${label.slice(1)} not found`);
  return id;
}
