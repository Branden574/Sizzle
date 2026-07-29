/**
 * Transactional email via Resend. No-op when RESEND_API_KEY is unset (the app
 * runs fine without it), so this ships safely and lights up the moment a key is
 * added. Best-effort — failures are logged, never thrown into the request path.
 */
import { env } from '../env';
import { supabaseAdmin } from '../lib/supabase';

export const emailConfigured = !!env.RESEND_API_KEY;

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  if (!env.RESEND_API_KEY || !opts.to) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: opts.to, subject: opts.subject, html: opts.html }),
    });
  } catch (e) {
    console.error('email send failed:', (e as Error).message);
  }
}

/** Look up a user's auth email (emails live in auth.users, not profiles). */
export async function userEmail(userId: string): Promise<string | null> {
  if (!env.RESEND_API_KEY) return null; // skip the lookup when we can't send anyway
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Escape a value for interpolation into email HTML.
 *
 * Every template below embeds moderation context — a recipe title, a removal reason — and a
 * recipe title is fully user-controlled. Unescaped, a title containing markup lands as live
 * HTML in the recipient's mail client: at minimum broken layout, at worst an attacker-authored
 * link inside a message that is unmistakably from Sizzle. Mail clients strip <script>, so this
 * is not XSS in the browser sense; it is a phishing surface in a trusted envelope.
 *
 * Exported so services/reports.ts uses this one instead of its own copy.
 */
export const escapeHtml = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const wrap = (body: string) =>
  `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1b1512">
     <div style="font-size:22px;font-weight:700;margin-bottom:16px">Sizzle</div>${body}
     <p style="color:#8a7c70;font-size:12px;margin-top:28px">You're receiving this because you have a Sizzle account.</p>
   </div>`;

/** Email templates for the account-moderation lifecycle. */
export const emails = {
  banned: (reason: string | null, deleteAt: string | null) =>
    wrap(
      `<p style="font-size:16px;line-height:1.5">Your Sizzle account has been suspended${reason ? ` for: <b>${escapeHtml(reason)}</b>` : ''}.</p>
       ${deleteAt ? `<p style="font-size:14px;color:#8a7c70">If you don't appeal, the account and its data will be permanently deleted on ${new Date(deleteAt).toLocaleDateString()}.</p>` : ''}
       <p style="font-size:14px">You can appeal from the app — open Sizzle and follow the prompts on the suspension screen.</p>`,
    ),
  removed: (title: string | null, reason: string | null) =>
    wrap(
      `<p style="font-size:16px;line-height:1.5">Your post${title ? ` “${escapeHtml(title)}”` : ''} was removed${reason ? ` for: <b>${escapeHtml(reason)}</b>` : ''}.</p>
       <p style="font-size:14px">If you think this was a mistake, you can appeal it from the post in the app.</p>`,
    ),
  restored: (title: string | null) =>
    wrap(`<p style="font-size:16px;line-height:1.5">Good news — your post${title ? ` “${escapeHtml(title)}”` : ''} has been restored and is live again.</p>`),
};
