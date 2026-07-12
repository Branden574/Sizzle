import { useState } from 'react';
import { Button, DismissBackdrop } from '../controls';
import { useSwipeDismiss } from '../../lib/useSwipeDismiss';
import { useRequireAuth } from '../../auth/useRequireAuth';
import { useToggleRepost } from '../../data/queries';
import { useSizzle } from '../../store';
import { theme } from '../../theme';
import { RepostIcon } from '../icons';

const accent = theme.accent;

export function RepostSheet() {
  const repostFor = useSizzle((s) => s.repostFor);
  const setRepostFor = useSizzle((s) => s.setRepostFor);
  const requireAuth = useRequireAuth();
  const repost = useToggleRepost();
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);

  const swipe = useSwipeDismiss(() => setRepostFor(null));
  if (!repostFor) return null;
  const close = () => { setRepostFor(null); setComment(''); setDone(false); };

  const submit = () => {
    if (!requireAuth()) return;
    if (repost.isPending) return;
    repost.mutate({ recipeId: repostFor, reposted: false, comment: comment.trim() || undefined }, { onSuccess: () => setDone(true) });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 94 }}>
      <DismissBackdrop onDismiss={close} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', paddingBottom: 30, ...swipe.sheetStyle }}>
        <div {...swipe.handlers} style={{ textAlign: 'center', padding: '16px 0 6px', position: 'relative' , ...swipe.handlers.style}}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 }}>
            <RepostIcon size={20} stroke="var(--text)" />
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{done ? 'Reposted' : 'Repost'}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 2 }}>{done ? 'Friends who follow you back will see it.' : 'Add a note (optional). Only mutual friends see it.'}</div>
        </div>

        <div style={{ padding: '12px 22px 0' }}>
          {done ? (
            <Button onClick={close} style={{ width: '100%', height: 52, border: 'none', borderRadius: 16, background: 'var(--invert-bg)', color: 'var(--invert-fg)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Done</Button>
          ) : (
            <>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Say something about this…"
                style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 14, padding: '12px 14px', fontFamily: "'Hanken Grotesk'", fontSize: 15, color: 'var(--text)', outline: 'none', background: 'var(--surface)', resize: 'vertical', lineHeight: 1.5, marginBottom: 12 }}
              />
              {repost.isError && <div style={{ color: '#d8521e', fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Couldn't repost — please try again.</div>}
              <Button onClick={submit} disabled={repost.isPending} style={{ width: '100%', height: 52, border: 'none', borderRadius: 16, background: accent, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: repost.isPending ? 0.6 : 1 }}>
                {repost.isPending ? 'Reposting…' : 'Repost'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
