import { useState } from 'react';
import type { CommentDTO } from '@sizzle/shared';
import { useRequireAuth } from '../../auth/useRequireAuth';
import { useAddComment, useComments, useMe, useRecipe, useToggleCommentLike } from '../../data/queries';
import { useSizzle } from '../../store';
import { theme } from '../../theme';
import { formatCount } from '../../lib/format';
import { CloseIcon, HeartIcon, ShareIcon } from '../icons';

const accent = theme.accent;

export function CommentsSheet() {
  const commentsFor = useSizzle((s) => s.commentsFor);
  const setCommentsFor = useSizzle((s) => s.setCommentsFor);
  const setOpenCook = useSizzle((s) => s.setOpenCook);
  const requireAuth = useRequireAuth();

  const { data: comments, isLoading } = useComments(commentsFor);
  const { data: recipe } = useRecipe(commentsFor);
  const { data: me } = useMe();
  const add = useAddComment(commentsFor ?? '');
  const likeComment = useToggleCommentLike(commentsFor ?? '');

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);

  if (!commentsFor) return null;

  const list = comments ?? [];
  const total = recipe?.counts.comments ?? list.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0);
  const sendBg = draft.trim() ? accent : 'var(--track)';
  const close = () => setCommentsFor(null);
  // Tap a commenter to open their profile (works for any user, cook or not).
  const onAuthor = (id: string) => { setCommentsFor(null); setOpenCook(id); };

  const send = () => {
    if (!requireAuth()) return;
    const text = draft.trim();
    if (!text || add.isPending) return;
    add.mutate(
      replyTo ? { text, parentId: replyTo.id } : text,
      { onSuccess: () => { setDraft(''); setReplyTo(null); } },
    );
  };

  const onLike = (id: string) => {
    if (!requireAuth()) return;
    likeComment.mutate(id);
  };
  const onReply = (parentId: string, name: string) => {
    if (!requireAuth()) return;
    setReplyTo({ id: parentId, name });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 98 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '74%', background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 22px 12px', borderBottom: '1px solid var(--line)', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{total > 0 ? `${formatCount(total)} comments` : 'Comments'}</div>
          <button onClick={close} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', cursor: 'pointer' }}>
            <CloseIcon size={22} stroke="var(--text-faint)" strokeWidth={2.2} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {isLoading && <div style={{ color: 'var(--text-faint-2)', fontSize: 14 }}>Loading comments…</div>}
          {!isLoading && list.length === 0 && <div style={{ color: 'var(--text-faint-2)', fontSize: 14, textAlign: 'center', marginTop: 30 }}>No comments yet — be the first.</div>}
          {list.map((cm) => (
            <CommentItem key={cm.id} cm={cm} onLike={onLike} onReply={onReply} onAuthor={onAuthor} />
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
          {replyTo && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 18px 0', fontSize: 12.5, color: 'var(--text-faint-2)', fontWeight: 600 }}>
              <span>Replying to {replyTo.name}</span>
              <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: accent, fontWeight: 700, fontSize: 12.5 }}>Cancel</button>
            </div>
          )}
          <div style={{ padding: '12px 18px 28px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, flex: 'none', borderRadius: '50%', background: 'linear-gradient(135deg,#3a2a22,#1b1512)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 15, color: '#fff', overflow: 'hidden' }}>
              {me?.avatarUrl ? <img src={me.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (me?.init ?? 'A')}
            </div>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder={replyTo ? 'Add a reply…' : 'Add a comment…'}
              style={{ flex: 1, height: 42, border: '1.5px solid var(--line)', borderRadius: 14, padding: '0 14px', fontFamily: "'Hanken Grotesk'", fontSize: 15, color: 'var(--text)', outline: 'none', background: 'var(--bg-soft)' }}
            />
            <button onClick={send} style={{ width: 42, height: 42, flex: 'none', border: 'none', borderRadius: 13, background: sendBg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShareIcon size={20} stroke="#fff" strokeWidth={1.9} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentItem({ cm, onLike, onReply, onAuthor, isReply }: { cm: CommentDTO; onLike: (id: string) => void; onReply: (parentId: string, name: string) => void; onAuthor: (id: string) => void; isReply?: boolean }) {
  const size = isReply ? 30 : 38;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div onClick={() => onAuthor(cm.authorId)} style={{ width: size, height: size, flex: 'none', borderRadius: '50%', background: cm.authorColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: isReply ? 13 : 16, color: '#fff', overflow: 'hidden', cursor: 'pointer' }}>
          {cm.authorAvatarUrl ? <img src={cm.authorAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : cm.authorInit}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span onClick={() => onAuthor(cm.authorId)} style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>{cm.authorName}</span>
            <span style={{ fontSize: 12, color: 'var(--text-faint-2)' }}>{cm.time}</span>
          </div>
          <div style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.45, marginTop: 3 }}>{cm.text}</div>
          <button
            onClick={() => onReply(cm.parentId ?? cm.id, cm.authorName)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, color: 'var(--text-faint-2)', fontWeight: 600, marginTop: 5 }}
          >
            Reply
          </button>
        </div>
        <button onClick={() => onLike(cm.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 3 }}>
          <HeartIcon width={16} height={16} fill={cm.likedByMe ? accent : 'none'} stroke={cm.likedByMe ? accent : '#bcae9f'} strokeWidth={1.8} />
          <span style={{ fontSize: 11, color: cm.likedByMe ? accent : 'var(--text-faint-2)' }}>{cm.likes > 0 ? formatCount(cm.likes) : ''}</span>
        </button>
      </div>

      {cm.replies && cm.replies.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 30 }}>
          {cm.replies.map((rp) => (
            <CommentItem key={rp.id} cm={rp} onLike={onLike} onReply={onReply} onAuthor={onAuthor} isReply />
          ))}
        </div>
      )}
    </div>
  );
}
