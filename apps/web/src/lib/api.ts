import type { ApiErrorBody } from '@sizzle/shared';
import { webEnv } from './env';
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* Admin second factor: the unlock token minted by POST /admin/unlock. Held in
 * memory + sessionStorage (per-tab, cleared on tab close) and auto-attached to
 * every /admin request as the x-admin-unlock header. The raw admin passphrase is
 * NEVER stored — only this short-lived token. */
const ADMIN_TOKEN_KEY = 'sz-admin-unlock';
let adminUnlockToken: string | null = (() => {
  try { return sessionStorage.getItem(ADMIN_TOKEN_KEY); } catch { return null; }
})();

export function setAdminUnlockToken(token: string | null): void {
  adminUnlockToken = token;
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch { /* sessionStorage unavailable — memory-only is fine */ }
}

export function hasAdminUnlockToken(): boolean {
  return !!adminUnlockToken;
}

/** x-admin-unlock header for /admin/* requests when unlocked. */
function adminHeader(path: string): Record<string, string> {
  return path.startsWith('/admin/') && adminUnlockToken ? { 'x-admin-unlock': adminUnlockToken } : {};
}

async function toError(res: Response): Promise<ApiError> {
  let code = 'http_error';
  let message = res.statusText || `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as ApiErrorBody;
    if (body?.error) {
      code = body.error.code;
      message = body.error.message;
    }
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(res.status, code, message);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${webEnv.apiUrl}${path}`, { headers: { ...(await authHeaders()), ...adminHeader(path) } });
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<T>;
}

export async function apiSend<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${webEnv.apiUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()), ...adminHeader(path) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<T>;
}
