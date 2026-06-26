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
import { moderateText } from '../services/moderation';
import type { AppEnv } from '../types';

export const messages = new Hono<AppEnv>();

/** A 1:1 conversation is stored once, keyed on the ordered pair (user_a < user_b). */
const canonical = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

interface ConvRow {
  id: string;
  user_a: string;
  user_b: string;
  a_last_read_at: string;
  b_last_read_at: string;
  last_message_at: string | null;
  last_message_text: string | null;
  last_message_sender_id: string | null;
}

const isUnread = (r: ConvRow, viewer: string): boolean => {
  const myLastRead = r.user_a === viewer ? r.a_last_read_at : r.b_last_read_at;
  return !!r.last_message_at && r.last_message_at > myLastRead && r.last_message_sender_id !== viewer;
};

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
    // Hide conversations with a blocked or banned counterparty.
    if (!other || blocked.has(otherId) || other.banned) continue;
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
  const userId = c.get('userId')!;
  const { data: rows } = await supabaseAdmin
    .from('conversations')
    .select('id, user_a, user_b, a_last_read_at, b_last_read_at, last_message_at, last_message_text, last_message_sender_id')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .not('last_message_at', 'is', null);
  const unread = ((rows ?? []) as ConvRow[]).filter((r) => isUnread(r, userId));
  if (unread.length === 0) return c.json({ count: 0 });

  const blocked = await loadBlockedIds(supabaseAdmin, userId);
  const otherIds = [...new Set(unread.map((r) => (r.user_a === userId ? r.user_b : r.user_a)))];
  const { data: profiles } = await supabaseAdmin.from('profiles').select('id, banned').in('id', otherIds);
  const banned = new Set((profiles ?? []).filter((p) => p.banned).map((p) => p.id as string));
  const count = unread.filter((r) => {
    const other = r.user_a === userId ? r.user_b : r.user_a;
    return !blocked.has(other) && !banned.has(other);
  }).length;
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
  if (conv) {
    const { data: rows } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(300);
    msgs = (rows ?? []).map((m) => ({
      id: m.id as string,
      fromMe: m.sender_id === userId,
      text: m.text as string,
      createdAt: m.created_at as string,
      time: relativeTime(new Date(m.created_at as string)),
    }));
    // Opening the thread marks the viewer's side read.
    const col = userId === a ? 'a_last_read_at' : 'b_last_read_at';
    await supabaseAdmin.from('conversations').update({ [col]: new Date().toISOString() }).eq('id', conv.id);
  }

  return c.json<ThreadDTO>({ conversationId: conv?.id ?? '', otherUser: cookSummary(other as ProfileRow), messages: msgs });
});

const sendSchema = z.object({ text: z.string().trim().min(1).max(2000) });

/** POST /messages/with/:userId {text} — send a message (creates the conversation). */
messages.post('/with/:userId', requireAuth, requireNotBanned, rateLimit({ windowMs: 60_000, max: 60, name: 'dm' }), async (c) => {
  const userId = c.get('userId')!;
  const otherId = assertUuid(c.req.param('userId'), 'user');
  if (otherId === userId) throw badRequest('You cannot message yourself');
  const parsed = sendSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Message text required');
  const mod = moderateText(parsed.data.text);
  if (!mod.ok) throw badRequest(mod.reason!);

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
    .insert({ conversation_id: conv.id, sender_id: userId, text: parsed.data.text })
    .select('*')
    .single();
  if (error || !msg) throw dbFail(error?.message ?? 'Could not send message');

  // Bump the denormalized summary + mark the sender's own side read.
  const senderCol = userId === a ? 'a_last_read_at' : 'b_last_read_at';
  await supabaseAdmin
    .from('conversations')
    .update({ last_message_at: now, last_message_text: parsed.data.text, last_message_sender_id: userId, [senderCol]: now })
    .eq('id', conv.id);

  return c.json<MessageDTO>(
    { id: msg.id as string, fromMe: true, text: msg.text as string, createdAt: msg.created_at as string, time: relativeTime(new Date(msg.created_at as string)) },
    201,
  );
});
