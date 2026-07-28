import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../controls';
import { useQueryClient } from '@tanstack/react-query';
import { useRequireAuth } from '../../auth/useRequireAuth';
import { useDeleteConversation, useSendMessage, useThread } from '../../data/queries';
import { syncBadge } from '../../lib/badge';
import { useSizzle } from '../../store';
import { theme } from '../../theme';
import { ChevronLeftIcon, ShareIcon, TrashIcon } from '../icons';
import { AvatarImg } from '../AvatarImg';

const accent = theme.accent;

/** A 1:1 chat thread. */
export function ThreadSheet() {
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const threadWith = useSizzle((s) => s.threadWith);
  const setThreadWith = useSizzle((s) => s.setThreadWith);
  const setOpenCook = useSizzle((s) => s.setOpenCook);
  const requireAuth = useRequireAuth();

  const { data: thread, isLoading, isPlaceholderData, isFetchedAfterMount } = useThread(threadWith);
  const send = useSendMessage(threadWith ?? '');
  const deleteConv = useDeleteConversation();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const msgs = thread?.messages ?? [];
  // Receipt for the last message the viewer sent: "Read" once the other side's
  // last-read time has caught up to it, otherwise "Delivered" (it's on the server).
  const lastMine = [...msgs].reverse().find((m) => m.fromMe);
  const readByOther =
    !!lastMine && !!thread?.otherLastReadAt && new Date(thread.otherLastReadAt).getTime() >= new Date(lastMine.createdAt).getTime();
  // Keep the newest message in view as the thread grows / loads. useLAYOUTEffect on
  // purpose: useEffect runs after paint, so the list flashed ONE FRAME at the top
  // (oldest messages) before snapping to the bottom — this scrolls before paint.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length, threadWith]);

  // Opening a thread marks it read server-side — refresh the inbox + unread badge
  // immediately so they don't linger as unread until their slow poll.
  useEffect(() => {
    if (!thread) return;
    void qc.invalidateQueries({ queryKey: ['messages-unread'] });
    void qc.invalidateQueries({ queryKey: ['conversations'] });
  }, [thread?.conversationId, qc]);

  // DMs feed the app-icon badge, and they're push-only (no notifications row), so
  // without this a DM you just read leaves the badge lit.
  //
  // Deliberately NOT keyed on conversationId: that's constant for as long as the
  // thread is open, so it would miss the two cases that matter. `isFetchedAfterMount`
  // waits for the SERVER round-trip that actually marks the thread read — keying off
  // cached data would sync the badge before the read landed and never re-fire.
  // `lastIncomingId` catches a message arriving while you're already reading, which
  // the 4s poll marks read without conversationId ever changing.
  const lastIncomingId = [...msgs].reverse().find((m) => !m.fromMe)?.id ?? null;
  useEffect(() => {
    if (!isFetchedAfterMount) return;
    void syncBadge();
  }, [isFetchedAfterMount, lastIncomingId]);

  if (!threadWith) return null;
  const other = thread?.otherUser;
  const close = () => setThreadWith(null);
  const openProfile = () => { if (other) { setThreadWith(null); setOpenCook(other.id); } };
  const removeChat = () => {
    if (!threadWith || deleteConv.isPending) return;
    if (typeof window !== 'undefined' && !window.confirm(`Delete this conversation with ${other?.name ?? 'them'}? It's removed from your inbox — they keep their copy.`)) return;
    deleteConv.mutate(threadWith, { onSuccess: () => setThreadWith(null) });
  };

  const submit = () => {
    if (!requireAuth()) return;
    const text = draft.trim();
    if (!text || send.isPending) return;
    setDraft('');
    send.mutate(text, { onError: () => setDraft(text) });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 92, background: 'var(--bg)', display: 'flex', flexDirection: 'column', animation: 'sz-slideUp .35s cubic-bezier(.16,1,.3,1)' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '52px 16px 12px', borderBottom: '1px solid var(--line)' }}>
        <Button onClick={close} aria-label="Back" style={{ width: 36, height: 36, flex: 'none', borderRadius: '50%', border: 'none', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ChevronLeftIcon size={20} stroke="var(--text)" strokeWidth={2.2} />
        </Button>
        <Button onClick={openProfile} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
          <div style={{ width: 38, height: 38, flex: 'none', borderRadius: '50%', background: other?.avatarColor ?? 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 16, color: '#fff', overflow: 'hidden' }}>
            {other?.avatarUrl ? <AvatarImg src={other.avatarUrl} px={38} /> : other?.init ?? ''}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{other?.name ?? 'Loading…'}</div>
        </Button>
        <Button onClick={removeChat} aria-label="Delete conversation" disabled={!thread?.conversationId} style={{ width: 36, height: 36, flex: 'none', borderRadius: '50%', border: 'none', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: thread?.conversationId ? 'pointer' : 'default', opacity: thread?.conversationId ? 1 : 0.4 }}>
          <TrashIcon size={18} />
        </Button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Placeholder data (header seeded from the inbox) still means the MESSAGES are
            loading — never flash "No messages yet" over a thread that just hasn't landed. */}
        {(isLoading || isPlaceholderData) && msgs.length === 0 && <div style={{ color: 'var(--text-faint-2)', fontSize: 14, textAlign: 'center', marginTop: 20 }}>Loading…</div>}
        {!isLoading && !isPlaceholderData && msgs.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 14.5, margin: 'auto', padding: '0 30px' }}>
            No messages yet. Say hi to {other?.name ?? 'them'} 👋
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id}>
            {/* Send-to-friend: a recipe card bubble — tap to open the recipe. */}
            {m.recipe && (
              <div style={{ display: 'flex', justifyContent: m.fromMe ? 'flex-end' : 'flex-start', marginBottom: m.text ? 4 : 0 }}>
                <Button
                  onClick={() => setOpenRecipe(m.recipe!.id)}
                  style={{ width: 190, border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden', padding: 0, cursor: 'pointer', background: 'var(--surface)', textAlign: 'left', display: 'block' }}
                >
                  <div style={{ height: 130, background: m.recipe.bg, position: 'relative' }}>
                    {m.recipe.poster && <img src={m.recipe.poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />}
                  </div>
                  <div style={{ padding: '9px 12px 11px' }}>
                    <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 16.5, lineHeight: 1.1, color: 'var(--text)' }}>{m.recipe.title}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-faint)', marginTop: 3 }}>@{m.recipe.cookHandle} · Sizzle</div>
                  </div>
                </Button>
              </div>
            )}
            {m.text && (
            <div style={{ display: 'flex', justifyContent: m.fromMe ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '76%', padding: '9px 14px', borderRadius: m.fromMe ? '18px 18px 5px 18px' : '18px 18px 18px 5px', background: m.fromMe ? accent : 'var(--surface)', color: m.fromMe ? '#fff' : 'var(--text)', border: m.fromMe ? 'none' : '1px solid var(--line)', fontSize: 15, lineHeight: 1.4, wordBreak: 'break-word' }}>
                {m.text}
              </div>
            </div>
            )}
            {lastMine && m.id === lastMine.id && (
              <div style={{ fontSize: 11, color: 'var(--text-faint-2)', marginTop: 3, textAlign: 'right', paddingRight: 4 }}>
                {readByOther ? 'Read' : 'Delivered'}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ flex: 'none', borderTop: '1px solid var(--line)', background: 'var(--surface)', padding: '12px 16px', paddingBottom: 'var(--kb-pad, 28px)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }}
          onFocus={() => { window.setTimeout(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, 250); }}
          placeholder="Message…"
          maxLength={2000}
          style={{ flex: 1, height: 44, border: '1.5px solid var(--line)', borderRadius: 22, padding: '0 16px', fontFamily: "'Hanken Grotesk'", fontSize: 15, color: 'var(--text)', outline: 'none', background: 'var(--bg-soft)' }}
        />
        <Button onClick={submit} aria-label="Send" style={{ width: 44, height: 44, flex: 'none', border: 'none', borderRadius: '50%', background: draft.trim() ? accent : 'var(--track)', cursor: draft.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShareIcon size={20} stroke="#fff" strokeWidth={1.9} />
        </Button>
      </div>
    </div>
  );
}
