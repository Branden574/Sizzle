import { useConversations } from '../../data/queries';
import { useSizzle } from '../../store';
import { CloseIcon } from '../icons';

/** The DM inbox: a list of conversations, newest activity first. */
export function MessagesSheet() {
  const setMessagesOpen = useSizzle((s) => s.setMessagesOpen);
  const setThreadWith = useSizzle((s) => s.setThreadWith);
  const { data: convos, isLoading } = useConversations(true);
  const list = convos ?? [];
  const close = () => setMessagesOpen(false);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 90 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '82%', background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 22px 12px', borderBottom: '1px solid var(--line)', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>Messages</div>
          <button onClick={close} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', cursor: 'pointer' }}>
            <CloseIcon size={22} stroke="var(--text-faint)" strokeWidth={2.2} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 24px' }}>
          {isLoading && <div style={{ color: 'var(--text-faint-2)', fontSize: 14, padding: 16 }}>Loading…</div>}
          {!isLoading && list.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 15, padding: '54px 30px' }}>
              No messages yet. Open someone's profile and tap <b>Message</b> to start a chat.
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
        </div>
      </div>
    </div>
  );
}
