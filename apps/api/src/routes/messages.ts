import { Hono } from 'hono';
import { z } from 'zod';
import type { ConversationDTO, MessageDTO, ThreadDTO } from '@sizzle/shared';
import { requireAuth, requireNotBanned } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { supabaseAdmin } from '../lib/supabase';
import { badRequest, dbFail, notFound } from '../lib/errors';
import { assertUuid } from '../lib/validate';
import { relativeTime } from '../lib/format';
import { cookSummary, loadBlockedIds, type ProfileRow } from '../mappers';
import { moderate } from '../services/moderation';
import { sendPushForNotification } from '../services/push';
import { clearedHidden, isUnread, unreadConversationCount, type ConvRow } from '../services/unread';
import type { AppEnv } from '../types';

export const messages = new Hono<AppEnv>();

/** A 1:1 conversation is stored once, keyed on the ordered pair (user_a < user_b). */
const canonical = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

// ConvRow / isUnread / clearedHidden now live in services/unread.ts so the inbox,
// GET /messages/unread-count and the app-icon badge share ONE definition of
// "unread" — two implementations would drift, and a badge that disagrees with the
// inbox is exactly the bug that sends users hunting for a message that isn't there.

/** GET /messages — the viewer's conversation inbox (newest activity first). */
messages.get('/', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const { data: rows } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .not('last_message_at', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(100);
  const list = (rows ?? []) as ConvRow[];
  if (list.length === 0) return c.json<ConversationDTO[]>([]);

  const otherIds = list.map((r) => (r.user_a === userId ? r.user_b : r.user_a));
  const blocked = await loadBlockedIds(supabaseAdmin, userId);
  const { data: profiles } = await supabaseAdmin.from('profiles').select('*').in('id', otherIds);
  const pMap = new Map<string, ProfileRow>((profiles ?? []).map((p) => [p.id as string, p as ProfileRow]));

  const out: ConversationDTO[] = [];
  for (const r of list) {
    const otherId = r.user_a === userId ? r.user_b : r.user_a;
    const other = pMap.get(otherId);
    // Hide conversations with a blocked/banned counterparty, or ones the viewer deleted.
    if (!other || blocked.has(otherId) || other.banned || clearedHidden(r, userId)) continue;
    out.push({
      id: r.id,
      otherUser: cookSummary(other),
      lastText: r.last_message_text,
      lastAt: r.last_message_at,
      lastTime: r.last_message_at ? relativeTime(new Date(r.last_message_at)) : '',
      lastFromMe: r.last_message_sender_id === userId,
      unread: isUnread(r, userId),
    });
  }
  return c.json(out);
});

/** GET /messages/unread-count — conversations with at least one unread message
 *  (excluding blocked + banned counterparties, exactly like the inbox, so the
 *  badge can never outlive a hidden conversation). */
messages.get('/unread-count', requireAuth, async (c) => {
  const count = await unreadConversationCount(c.get('userId')!);
  return c.json({ count });
});

/** GET /messages/with/:userId — the thread with another user; marks it read. */
messages.get('/with/:userId', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const otherId = assertUuid(c.req.param('userId'), 'user');
  if (otherId === userId) throw badRequest('You cannot message yourself');

  const blocked = await loadBlockedIds(supabaseAdmin, userId);
  if (blocked.has(otherId)) throw notFound('User not found');
  const { data: other } = await supabaseAdmin.from('profiles').select('*').eq('id', otherId).maybeSingle();
  if (!other || (other as ProfileRow).banned) throw notFound('User not found'); // banned users are scrubbed everywhere

  const [a, b] = canonical(userId, otherId);
  const { data: conv } = await supabaseAdmin.from('conversations').select('*').eq('user_a', a).eq('user_b', b).maybeSingle();

  let msgs: MessageDTO[] = [];
  let otherLastReadAt: string | null = null;
  if (conv) {
    // The other side's read point drives the sender's Delivered/Read receipt.
    otherLastReadAt = (userId === a ? conv.b_last_read_at : conv.a_last_read_at) as string;
    // If the viewer deleted this thread, only show messages newer than that.
    const myCleared = (userId === a ? conv.a_cleared_at : conv.b_cleared_at) as string | null;
    // Take the NEWEST 300 (order desc + limit), then flip back to oldest→newest
    // for display. Ordering ascending with a limit returned the OLDEST 300, so
    // long threads hid every recent message on reload.
    let q = supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(300);
    if (myCleared) q = q.gt('created_at', myCleared);
    const { data: rows } = await q;
    // Batch-embed recipe cards for send-to-friend messages.
    const recipeIds = [...new Set((rows ?? []).map((m) => m.recipe_id as string | null).filter((x): x is string => !!x))];
    const embeds = new Map<string, NonNullable<MessageDTO['recipe']>>();
    if (recipeIds.length) {
      const { data: recs } = await supabaseAdmin.from('recipes').select('id, title, bg, image_urls, video_asset_id, status, cook_id').in('id', recipeIds);
      const vidIds = (recs ?? []).map((r) => r.video_asset_id).filter((x): x is string => !!x);
      const { data: vids } = vidIds.length ? await supabaseAdmin.from('video_assets').select('id, poster_url').in('id', vidIds) : { data: [] as Record<string, unknown>[] };
      const posters = new Map((vids ?? []).map((v) => [v.id as string, (v.poster_url as string) ?? null]));
      const cookIds = [...new Set((recs ?? []).map((r) => r.cook_id as string))];
      const { data: cooks } = cookIds.length ? await supabaseAdmin.from('profiles').select('id, handle').in('id', cookIds) : { data: [] as Record<string, unknown>[] };
      const handles = new Map((cooks ?? []).map((p) => [p.id as string, p.handle as string]));
      for (const r of recs ?? []) {
        if (r.status !== 'published') continue; // unpublished since sending — card disappears, text stays
        embeds.set(r.id as string, {
          id: r.id as string,
          title: r.title as string,
          poster: (r.video_asset_id && posters.get(r.video_asset_id as string)) || ((r.image_urls as string[] | null)?.[0] ?? null),
          bg: r.bg as string,
          cookHandle: handles.get(r.cook_id as string) ?? '',
        });
      }
    }
    msgs = (rows ?? []).slice().reverse().map((m) => ({
      id: m.id as string,
      fromMe: m.sender_id === userId,
      text: m.text as string,
      createdAt: m.created_at as string,
      time: relativeTime(new Date(m.created_at as string)),
      recipe: m.recipe_id ? embeds.get(m.recipe_id as string) ?? null : null,
    }));
    // Opening the thread marks the viewer's side read.
    const col = userId === a ? 'a_last_read_at' : 'b_last_read_at';
    await supabaseAdmin.from('conversations').update({ [col]: new Date().toISOString() }).eq('id', conv.id);
  }

  return c.json<ThreadDTO>({ conversationId: conv?.id ?? '', otherUser: cookSummary(other as ProfileRow), messages: msgs, otherLastReadAt });
});

/** Small embed for a single just-sent recipe card. */
async function recipeCardEmbed(recipeId: string): Promise<MessageDTO['recipe']> {
  const { data: r } = await supabaseAdmin.from('recipes').select('id, title, bg, image_urls, video_asset_id, cook_id').eq('id', recipeId).maybeSingle();
  if (!r) return null;
  let poster: string | null = (r.image_urls as string[] | null)?.[0] ?? null;
  if (r.video_asset_id) {
    const { data: v } = await supabaseAdmin.from('video_assets').select('poster_url').eq('id', r.video_asset_id).maybeSingle();
    poster = (v?.poster_url as string) ?? poster;
  }
  const { data: p } = await supabaseAdmin.from('profiles').select('handle').eq('id', r.cook_id).maybeSingle();
  return { id: r.id as string, title: r.title as string, poster, bg: r.bg as string, cookHandle: (p?.handle as string) ?? '' };
}

const sendSchema = z.object({
  text: z.string().trim().max(2000).default(''),
  /** Send-to-friend: attach a recipe card. Text becomes optional. */
  recipeId: z.string().uuid().optional(),
}).refine((v) => v.text.length > 0 || !!v.recipeId, { message: 'Message text required' });

/** POST /messages/with/:userId {text} — send a message (creates the conversation). */
messages.post('/with/:userId', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 60, name: 'dm' }), async (c) => {
  const userId = c.get('userId')!;
  const otherId = assertUuid(c.req.param('userId'), 'user');
  if (otherId === userId) throw badRequest('You cannot message yourself');
  const parsed = sendSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Message text required');
  if (parsed.data.text) {
    const mod = await moderate(parsed.data.text);
    if (!mod.ok) throw badRequest(mod.reason!);
  }

  // Send-to-friend: the recipe must be real, published, and not premium-locked
  // media the sender is leaking — the card carries only public metadata, so
  // published is the right gate.
  let sendRecipe: { id: string; title: string } | null = null;
  if (parsed.data.recipeId) {
    const { data: r } = await supabaseAdmin.from('recipes').select('id, title, status').eq('id', parsed.data.recipeId).maybeSingle();
    if (!r || r.status !== 'published') throw notFound('Recipe not found');
    sendRecipe = { id: r.id as string, title: r.title as string };
  }

  // Can't message someone you've blocked or who has blocked you.
  const blocked = await loadBlockedIds(supabaseAdmin, userId);
  if (blocked.has(otherId)) throw notFound('User not found');
  const { data: other } = await supabaseAdmin.from('profiles').select('id, banned').eq('id', otherId).maybeSingle();
  if (!other || other.banned) throw notFound('User not found'); // can't message a banned account

  const [a, b] = canonical(userId, otherId);
  // Get-or-create the conversation for this pair.
  await supabaseAdmin.from('conversations').upsert({ user_a: a, user_b: b }, { onConflict: 'user_a,user_b', ignoreDuplicates: true });
  const { data: conv } = await supabaseAdmin.from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
  if (!conv) throw dbFail('Could not open conversation');

  const now = new Date().toISOString();
  const { data: msg, error } = await supabaseAdmin
    .from('messages')
    .insert({ conversation_id: conv.id, sender_id: userId, text: parsed.data.text, recipe_id: sendRecipe?.id ?? null })
    .select('*')
    .single();
  if (error || !msg) throw dbFail(error?.message ?? 'Could not send message');

  // Sends-per-reach: a DM send is the strongest personal endorsement — count it.
  if (sendRecipe) await supabaseAdmin.rpc('increment_send', { rid: sendRecipe.id });

  // Bump the denormalized summary + mark the sender's own side read. Sending also
  // un-deletes the thread for the sender (if they'd cleared it before).
  const senderCol = userId === a ? 'a_last_read_at' : 'b_last_read_at';
  const senderClearedCol = userId === a ? 'a_cleared_at' : 'b_cleared_at';
  await supabaseAdmin
    .from('conversations')
    .update({ last_message_at: now, last_message_text: parsed.data.text || (sendRecipe ? `🍳 ${sendRecipe.title}` : ''), last_message_sender_id: userId, [senderCol]: now, [senderClearedCol]: null })
    .eq('id', conv.id);

  // Push the recipient (best-effort, respects their prefs). DMs live in their own
  // inbox with unread badges, so this is push-only — no activity-feed row.
  await sendPushForNotification({ userId: otherId, type: 'message', actorId: userId }).catch(() => {});

  return c.json<MessageDTO>(
    { id: msg.id as string, fromMe: true, text: msg.text as string, createdAt: msg.created_at as string, time: relativeTime(new Date(msg.created_at as string)), recipe: sendRecipe ? await recipeCardEmbed(sendRecipe.id) : null },
    201,
  );
});

/** DELETE /messages/with/:userId — delete the conversation from the viewer's
 *  inbox only (sets their *_cleared_at). The other person's copy is untouched;
 *  the thread returns for the viewer if the other side messages again. */
messages.delete('/with/:userId', requireAuth, async (c) => {
  const userId = c.get('userId')!;
  const otherId = assertUuid(c.req.param('userId'), 'user');
  if (otherId === userId) throw badRequest('You cannot message yourself');

  const [a, b] = canonical(userId, otherId);
  const { data: conv } = await supabaseAdmin.from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
  if (conv) {
    const now = new Date().toISOString();
    const clearedCol = userId === a ? 'a_cleared_at' : 'b_cleared_at';
    const readCol = userId === a ? 'a_last_read_at' : 'b_last_read_at';
    await supabaseAdmin.from('conversations').update({ [clearedCol]: now, [readCol]: now }).eq('id', conv.id);
  }
  return c.json({ ok: true });
});
