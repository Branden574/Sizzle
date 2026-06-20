import { baseComments } from '../../data';
import { useSizzle } from '../../store';
import { theme } from '../../theme';
import { CloseIcon, HeartIcon, ShareIcon } from '../icons';

const accent = theme.accent;

// NOTE: comments are local-only until Phase 2 (server-backed comments).
export function CommentsSheet() {
  const commentsFor = useSizzle((s) => s.commentsFor);
  const commentMap = useSizzle((s) => s.comments);
  const draft = useSizzle((s) => s.draft);
  const setDraft = useSizzle((s) => s.setDraft);
  const sendComment = useSizzle((s) => s.sendComment);
  const setCommentsFor = useSizzle((s) => s.setCommentsFor);

  if (!commentsFor) return null;

  const activeComments = [...(commentMap[commentsFor] || []), ...baseComments];
  const sendBg = draft.trim() ? accent : '#d8cbbb';

  const close = () => {
    setCommentsFor(null);
    setDraft('');
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 88 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '74%', background: '#faf3ea', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 22px 12px', borderBottom: '1px solid #ece1d4', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: '#d8cbbb' }} />
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: '#1b1512', marginTop: 6 }}>{activeComments.length} comments</div>
          <button onClick={close} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', cursor: 'pointer' }}>
            <CloseIcon size={22} stroke="#8a7c70" strokeWidth={2.2} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {activeComments.map((cm, i) => (
            <div key={i} style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 38, height: 38, flex: 'none', borderRadius: '50%', background: cm.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 16, color: '#fff' }}>{cm.init}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1b1512' }}>{cm.name}</span>
                  <span style={{ fontSize: 12, color: '#a99c90' }}>{cm.time}</span>
                </div>
                <div style={{ fontSize: 14.5, color: '#3a322c', lineHeight: 1.45, marginTop: 3 }}>{cm.text}</div>
                <div style={{ fontSize: 12.5, color: '#a99c90', fontWeight: 600, marginTop: 5 }}>Reply</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 3 }}>
                <HeartIcon width={16} height={16} stroke="#bcae9f" strokeWidth={1.8} />
                <span style={{ fontSize: 11, color: '#a99c90' }}>{cm.likes}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 18px 28px', borderTop: '1px solid #ece1d4', background: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, flex: 'none', borderRadius: '50%', background: 'linear-gradient(135deg,#3a2a22,#1b1512)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 15, color: '#fff' }}>A</div>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendComment();
            }}
            placeholder="Add a comment…"
            style={{ flex: 1, height: 42, border: '1.5px solid #ece1d4', borderRadius: 14, padding: '0 14px', fontFamily: "'Hanken Grotesk'", fontSize: 15, color: '#1b1512', outline: 'none', background: '#faf6f0' }}
          />
          <button onClick={sendComment} style={{ width: 42, height: 42, flex: 'none', border: 'none', borderRadius: 13, background: sendBg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShareIcon size={20} stroke="#fff" strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </div>
  );
}
