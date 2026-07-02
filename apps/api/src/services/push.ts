import { createSign } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabase';
import { env } from '../env';
import type { NotificationKind } from '@sizzle/shared';

/**
 * Push delivery via Firebase Cloud Messaging HTTP v1.
 *
 * One delivery path for both platforms: the native app registers an FCM token
 * (iOS via the APNs↔FCM bridge, Android directly), we store it in `push_tokens`,
 * and here we POST to FCM. Everything is gated on `FCM_SERVICE_ACCOUNT`: when
 * that env var is absent the whole module is a no-op, so the API runs unchanged
 * until Branden pastes the Firebase service-account JSON. Notification *rows*
 * are always written (see notify.ts); this only adds the device ping on top.
 */

type ServiceAccount = { client_email: string; private_key: string; project_id: string };

let cachedAccount: ServiceAccount | null | undefined; // undefined = not yet parsed, null = not configured
function account(): ServiceAccount | null {
  if (cachedAccount !== undefined) return cachedAccount;
  const raw = env.FCM_SERVICE_ACCOUNT;
  if (!raw) {
    cachedAccount = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) throw new Error('missing fields');
    cachedAccount = parsed;
  } catch (err) {
    console.error('[push] FCM_SERVICE_ACCOUNT is set but not valid JSON — push disabled:', (err as Error).message);
    cachedAccount = null;
  }
  return cachedAccount;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Cache the OAuth2 access token (valid ~1h) so we mint a JWT at most once per hour.
let tokenCache: { value: string; expiresAt: number } | null = null;
async function accessToken(acct: ServiceAccount): Promise<string | null> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;

  const iat = Math.floor(Date.now() / 1000);
  const claims = {
    iss: acct.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  };
  const header = { alg: 'RS256', typ: 'JWT' };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(acct.private_key);
  const jwt = `${signingInput}.${b64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    console.error('[push] token exchange failed:', res.status, await res.text().catch(() => ''));
    return null;
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  tokenCache = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

/** Human-facing copy for each notification kind. `who` is the actor's name. */
function copyFor(type: NotificationKind, who: string): { title: string; body: string } {
  switch (type) {
    case 'follow':
      return { title: 'New follower', body: `${who} started following you` };
    case 'like':
      return { title: 'New like', body: `${who} liked your recipe` };
    case 'comment':
      return { title: 'New comment', body: `${who} commented on your recipe` };
    case 'repost':
      return { title: 'New repost', body: `${who} reposted your recipe` };
    case 'verified':
      return { title: "You're verified", body: 'Your creator account was verified' };
    case 'removed':
      return { title: 'Recipe removed', body: 'One of your recipes was removed by a moderator' };
    case 'restored':
      return { title: 'Recipe restored', body: 'A removed recipe was restored' };
    case 'banned':
      return { title: 'Account action', body: 'Your account status has changed' };
    case 'message':
      return { title: 'New message', body: `${who} sent you a message` };
    default:
      return { title: 'Sizzle', body: 'You have a new notification' };
  }
}

async function deleteToken(token: string): Promise<void> {
  await supabaseAdmin.from('push_tokens').delete().eq('token', token);
}

/**
 * Deliver a push for a freshly-recorded notification. Safe no-op when FCM isn't
 * configured, when the recipient turned push off, or when they have no devices.
 * Never throws — push is best-effort and must not break the request that
 * triggered the notification.
 */
export async function sendPushForNotification(opts: {
  userId: string;
  type: NotificationKind;
  actorId: string;
  recipeId?: string | null;
}): Promise<void> {
  const acct = account();
  if (!acct) return;

  try {
    // Recipient opted out (master switch, or this specific category)?
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('push_enabled, notif_prefs')
      .eq('id', opts.userId)
      .single();
    if (profile && profile.push_enabled === false) return;
    const prefKey = ({ like: 'likes', comment: 'comments', follow: 'follows', repost: 'reposts', message: 'messages' } as const)[opts.type as 'like' | 'comment' | 'follow' | 'repost' | 'message'];
    if (prefKey && (profile?.notif_prefs as Record<string, boolean> | undefined)?.[prefKey] === false) return;

    const { data: tokens } = await supabaseAdmin.from('push_tokens').select('token').eq('user_id', opts.userId);
    if (!tokens || tokens.length === 0) return;

    // Actor's display name for the copy.
    let who = 'Someone';
    if (opts.actorId) {
      const { data: actor } = await supabaseAdmin
        .from('profiles')
        .select('display_name, handle')
        .eq('id', opts.actorId)
        .single();
      who = actor?.display_name || (actor?.handle ? `@${actor.handle}` : 'Someone');
    }
    const { title, body } = copyFor(opts.type, who);

    const oauth = await accessToken(acct);
    if (!oauth) return;
    const url = `https://fcm.googleapis.com/v1/projects/${acct.project_id}/messages:send`;

    await Promise.all(
      tokens.map(async ({ token }) => {
        const message = {
          token,
          notification: { title, body },
          data: {
            type: opts.type,
            recipeId: opts.recipeId ?? '',
            actorId: opts.actorId ?? '',
          },
          apns: { payload: { aps: { sound: 'default', badge: 1 } } },
          android: { notification: { sound: 'default' }, priority: 'high' as const },
        };
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${oauth}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          // 404 / UNREGISTERED / invalid-argument → the token is dead; prune it
          // so we stop trying. Anything else we just log.
          if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(text)) {
            await deleteToken(token);
          } else {
            console.error('[push] send failed:', res.status, text);
          }
        }
      }),
    );
  } catch (err) {
    console.error('[push] sendPushForNotification error:', (err as Error).message);
  }
}
