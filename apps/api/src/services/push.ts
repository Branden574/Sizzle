import { createSign } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabase';
import { env } from '../env';
import { unreadBadgeCount } from './unread';
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

/**
 * Why push may not be delivering. Surfaced in /health because this failure is
 * SILENT by design: a malformed FCM_SERVICE_ACCOUNT makes every send a no-op
 * while notification rows keep appearing in-app, so the app looks healthy and
 * nobody notices until someone checks the logs. That happened — a stray
 * character past the end of the JSON disabled push entirely.
 */
export function pushStatus(): 'ok' | 'invalid_service_account' | 'not_configured' {
  if (!env.FCM_SERVICE_ACCOUNT) return 'not_configured';
  return account() ? 'ok' : 'invalid_service_account';
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

/** Human-facing copy for each notification kind. `who` is the actor's name;
 *  `amount` is a pre-formatted currency string (e.g. "$5.00") for earning kinds. */
function copyFor(type: NotificationKind, who: string, amount?: string | null): { title: string; body: string } {
  switch (type) {
    case 'follow':
      return { title: 'New follower', body: `${who} started following you` };
    case 'like':
      return { title: 'New like', body: `${who} liked your recipe` };
    case 'comment':
      return { title: 'New comment', body: `${who} commented on your recipe` };
    case 'comment_like':
      return { title: 'New like', body: `${who} liked your comment` };
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
    case 'tip':
      return { title: 'You got a tip! 🎉', body: amount ? `${who} sent you ${amount}` : `${who} sent you a tip` };
    case 'follow_request':
      return { title: 'Follow request', body: `${who} requested to follow you` };
    case 'follow_accepted':
      return { title: 'Follow request accepted', body: `${who} accepted your follow request` };
    case 'creator_progress':
      return { title: "You're growing! 📈", body: "You're getting close to Creator eligibility" };
    case 'creator_eligible':
      return { title: "You're Creator-eligible! 🎉", body: 'You can now become a Sizzle Creator and start earning' };
    case 'creator_activated':
      return { title: "You're a Sizzle Creator! ✨", body: 'Your Creator account is active — payouts are set up' };
    case 'creator_payout_incomplete':
      return { title: 'Finish your payout setup', body: 'Complete payout setup to activate your Creator account' };
    case 'payout_first':
      return { title: 'Your first payout is on the way 💸', body: 'Your earnings are heading to your bank' };
    case 'payout_paid':
      return { title: 'Payout sent 💸', body: 'Your creator earnings were paid out' };
    case 'creator_monthly_summary':
      return { title: 'Your month on Sizzle', body: 'Your creator earnings summary is ready' };
    default:
      return { title: 'Sizzle', body: 'You have a new notification' };
  }
}

async function deleteToken(token: string): Promise<void> {
  await supabaseAdmin.from('push_tokens').delete().eq('token', token);
}

/**
 * The badge to stamp on an outgoing push: everything currently awaiting the user.
 *
 * `aps.badge` SETS an absolute value — APNs has no increment — so this must be
 * the true total, not a flag. It used to be a hardcoded `1`, which pinned the
 * badge at "1" for the life of the install because nothing ever sent a lower
 * number.
 *
 * Fails open to 1, NEVER 0: if the count query breaks we degrade to the old
 * "something is waiting" lamp. Returning 0 on an error would silently erase a
 * badge the user genuinely needed to see.
 */
async function badgeFor(userId: string): Promise<number> {
  try {
    return await unreadBadgeCount(userId);
  } catch (err) {
    console.error('[push] badge count failed, falling back to 1:', (err as Error).message);
    return 1;
  }
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
  amountCents?: number | null;
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
    const prefKey = ({ like: 'likes', comment_like: 'likes', comment: 'comments', follow: 'follows', follow_request: 'follows', follow_accepted: 'follows', repost: 'reposts', message: 'messages', tip: 'tips' } as const)[opts.type as 'like' | 'comment_like' | 'comment' | 'follow' | 'follow_request' | 'follow_accepted' | 'repost' | 'message' | 'tip'];
    if (prefKey && (profile?.notif_prefs as Record<string, boolean> | undefined)?.[prefKey] === false) return;

    const { data: tokens } = await supabaseAdmin.from('push_tokens').select('token').eq('user_id', opts.userId);
    if (!tokens || tokens.length === 0) return;

    // Actor's display name for the copy, and the badge total. Run together —
    // the badge count is two reads, and serialising them would show up as
    // latency on every push. notify.ts writes the notifications row BEFORE
    // calling us, so the count already includes the event being announced.
    const [actorRes, badge] = await Promise.all([
      opts.actorId
        ? supabaseAdmin.from('profiles').select('display_name, handle').eq('id', opts.actorId).single()
        : Promise.resolve({ data: null }),
      badgeFor(opts.userId),
    ]);
    const actor = actorRes.data as { display_name?: string; handle?: string } | null;
    const who = actor?.display_name || (actor?.handle ? `@${actor.handle}` : 'Someone');
    // Pre-formatted here so copyFor stays presentation-only.
    const amount = typeof opts.amountCents === 'number' ? `$${(opts.amountCents / 100).toFixed(2)}` : null;
    const { title, body } = copyFor(opts.type, who, amount);

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
          apns: { payload: { aps: { sound: 'default', badge } } },
          // `notificationCount` is the FCM v1 schema's spelling (proto3 JSON would
          // likely also take notification_count, but a rejected payload comes back
          // as INVALID_ARGUMENT — see the prune path below for why that must not
          // be left to chance). Drives the launcher badge on Android.
          android: { notification: { sound: 'default', notificationCount: badge }, priority: 'high' as const },
        };
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${oauth}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          // Prune ONLY on proof the token is dead (404 / UNREGISTERED).
          //
          // INVALID_ARGUMENT used to prune here too, and that was dangerous: FCM
          // returns it for a MALFORMED PAYLOAD, not a dead token. One bad field
          // in the message we build would have silently deleted the token of
          // every user the push touched — unrecoverable without them
          // reinstalling — and the symptom (push goes quiet) looks nothing like
          // the cause. A payload bug is our bug; it must never cost a user their
          // registration. Loud log instead.
          if (res.status === 404 || /UNREGISTERED/i.test(text)) {
            await deleteToken(token);
          } else if (/INVALID_ARGUMENT/i.test(text)) {
            console.error('[push] FCM rejected the payload (token kept — fix the message shape):', res.status, text);
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

/**
 * Send a one-off push with explicit copy to a user's devices (used by the
 * save-to-cook nudge cron). Honors the master push toggle; category prefs
 * don't apply (nudges are their own thing, capped at one per recipe ever).
 */
export async function sendDirectPush(opts: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<boolean> {
  const acct = account();
  if (!acct) return false;
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('push_enabled')
      .eq('id', opts.userId)
      .single();
    if (profile && profile.push_enabled === false) return false;

    const { data: tokens } = await supabaseAdmin.from('push_tokens').select('token').eq('user_id', opts.userId);
    if (!tokens || tokens.length === 0) return false;

    const oauth = await accessToken(acct);
    if (!oauth) return false;
    const url = `https://fcm.googleapis.com/v1/projects/${acct.project_id}/messages:send`;
    await Promise.all(
      tokens.map(async ({ token }) => {
        const message = {
          token,
          notification: { title: opts.title, body: opts.body },
          data: opts.data ?? {},
          apns: { payload: { aps: { sound: 'default' } } },
          android: { notification: { sound: 'default' }, priority: 'high' as const },
        };
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${oauth}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          // Same reasoning as sendPushForNotification: only a dead token gets
          // pruned. INVALID_ARGUMENT means WE sent a bad payload.
          if (res.status === 404 || /UNREGISTERED/i.test(text)) await deleteToken(token);
          else console.error('[push] direct send failed:', res.status, text);
        }
      }),
    );
    return true;
  } catch (err) {
    console.error('[push] sendDirectPush error:', (err as Error).message);
    return false;
  }
}
