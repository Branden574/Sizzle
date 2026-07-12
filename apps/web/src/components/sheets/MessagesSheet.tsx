import { useState } from 'react';
import { useSwipeDismiss } from '../../lib/useSwipeDismiss';
import { useConversations, useFollowList, useMe } from '../../data/queries';
import { useSizzle } from '../../store';
import { CloseIcon, SearchIcon } from '../icons';

/** The DM inbox: search people you follow to start a chat, plus the list of
 *  conversations (newest activity first). */
export function MessagesSheet() {
  const setMessagesOpen = useSizzle((s) => s.setMessagesOpen);
  const setThreadWith = useSizzle((s) => s.setThreadWith);
  const { data: convos, isLoading } = useConversations(true);
  const { data: me } = useMe();
  const { data: follows } = useFollowList(me?.id ?? null, 'following');
  const [q, setQ] = useState('');
  const list = convos ?? [];
  const close = () => setMessagesOpen(false);
  const swipe = useSwipeDismiss(() => setMessagesOpen(false));

  const query = q.trim().toLowerCase();
  // Instagram-style: typing searches the people you follow to start a new chat.
  const people = query
    ? (follows ?? []).filter((p) => p.name.toLowerCase().includes(query) || p.handle.toLowerCase().includes(query))
    : [];

  const open = (id: string) => {
    setQ('');
    setThreadWith(id);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 90 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '82%', background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column', ...swipe.sheetStyle }}>
        <div {...swipe.handlers} style={{ padding: '14px 22px 12px', borderBottom: '1px solid var(--line)', position: 'relative' , ...swipe.handlers.style}}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>Messages</div>
          <button onClick={close} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', cursor: 'pointer' }}>
            <CloseIcon size={22} stroke="var(--text-faint)" strokeWidth={2.2} />
          </button>
        </div>

        {/* Search people you follow */}
        <div style={{ padding: '12px 16px 8px', flex: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 42, padding: '0 14px', borderRadius: 13, background: 'var(--bg-soft)', border: '1px solid var(--line)' }}>
            <SearchIcon size={18} stroke="var(--text-faint)" strokeWidth={2} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people you follow…"
              style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, color: 'var(--text)' }}
            />
            {q && (
              <button onClick={() => setQ('')} aria-label="Clear" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <CloseIcon size={16} stroke="var(--text-faint)" strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 24px' }}>
          {/* SEARCH MODE — people you follow */}
          {query ? (
            people.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 14.5, padding: '40px 30px' }}>
                No one you follow matches “{q.trim()}”.
              </div>
            ) : (
              people.map((p) => (
                <button
                  key={p.id}
                  onClick={() => open(p.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', borderRadius: 14, padding: '10px', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ width: 46, height: 46, flex: 'none', borderRadius: '50%', background: p.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 18, color: '#fff', overflow: 'hidden' }}>
                    {p.avatarUrl ? <img src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : p.init}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 1 }}>@{p.handle}</div>
                  </div>
                </button>
              ))
            )
          ) : (
            <>
              {/* DEFAULT — conversation list */}
              {isLoading && <div style={{ color: 'var(--text-faint-2)', fontSize: 14, padding: 16 }}>Loading…</div>}
              {!isLoading && list.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 15, padding: '54px 30px' }}>
                  No messages yet. Search someone you follow above, or open their profile and tap <b>Message</b>.
                </div>
              )}
              {list.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setThreadWith(c.otherUser.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', borderRadius: 14, padding: '11px 10px', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ width: 52, height: 52, flex: 'none', borderRadius: '50%', background: c.otherUser.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 20, color: '#fff', overflow: 'hidden' }}>
                    {c.otherUser.avatarUrl ? <img src={c.otherUser.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : c.otherUser.init}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: c.unread ? 800 : 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.otherUser.name}</div>
                    <div style={{ fontSize: 13.5, color: c.unread ? 'var(--text)' : 'var(--text-faint)', fontWeight: c.unread ? 600 : 400, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.lastFromMe ? 'You: ' : ''}{c.lastText ?? 'Say hi 👋'}
                    </div>
                  </div>
                  <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-faint-2)' }}>{c.lastTime}</span>
                    {c.unread && <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent,#ff5a36)' }} />}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
