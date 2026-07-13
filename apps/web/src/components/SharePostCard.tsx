import { useState } from 'react';
import { Button, DismissBackdrop } from './controls';
import { useShareRecipe } from '../data/queries';
import { recipeShareUrl } from '../lib/share';
import { useSizzle } from '../store';

/**
 * Share Everywhere — the post-publish moment. Every creator publish is
 * zero-cost off-platform acquisition: the /r/:id link unfurls into a full
 * OG + schema.org recipe page, so one tap here seeds X/WhatsApp/Pinterest
 * with a card that funnels straight back into the app.
 */
export function SharePostCard() {
  const target = useSizzle((s) => s.shareAfterPost);
  const setShareAfterPost = useSizzle((s) => s.setShareAfterPost);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const share = useShareRecipe();
  const [copied, setCopied] = useState(false);

  if (!target) return null;
  const close = () => setShareAfterPost(null);
  const url = recipeShareUrl(target.id);

  const copyLink = () => {
    void navigator.clipboard?.writeText(url).catch(() => {});
    share.mutate(target.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const nativeShare = () => {
    if (navigator.share) void navigator.share({ title: `${target.title} · Sizzle`, url }).then(() => share.mutate(target.id)).catch(() => {});
    else copyLink();
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 98 }}>
      <DismissBackdrop onDismiss={close} />
      <div style={{ position: 'absolute', left: 18, right: 18, bottom: 'calc(24px + var(--sab, 0px))', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 24, padding: '22px 20px', animation: 'sz-slideUp .38s cubic-bezier(.16,1,.3,1)', boxShadow: '0 24px 60px rgba(0,0,0,.4)' }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 28, color: 'var(--text)' }}>Posted! 🎉</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-faint)', marginTop: 4, lineHeight: 1.5 }}>
          “{target.title}” is live. Share the link — it unfurls into a full recipe card everywhere.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13, padding: '10px 13px' }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
          <Button onClick={copyLink} style={{ flex: 'none', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 800, color: 'var(--accent,#ff5a36)' }}>
            {copied ? '✓ Copied' : 'Copy'}
          </Button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <Button onClick={() => { close(); setOpenRecipe(target.id); }} variant="tonal" style={{ flex: 1, height: 48, borderRadius: 14, fontSize: 14 }}>
            View post
          </Button>
          <Button onClick={nativeShare} variant="primary" style={{ flex: 1, height: 48, borderRadius: 14, fontSize: 14.5 }}>
            ↗ Share it
          </Button>
        </div>
      </div>
    </div>
  );
}
