import { useEffect, useMemo, useRef, useState } from 'react';
import type { CookSummary } from '@sizzle/shared';
import { Button, DismissBackdrop } from '../controls';
import { useConversations, useFollowList, useMe, useRecipe, useSendRecipe, useShareRecipe } from '../../data/queries';
import { useSwipeDismiss } from '../../lib/useSwipeDismiss';
import { recipeShareUrl, nativeShare } from '../../lib/share';
import { canShareToInstagramStories, shareRecipeVideoToInstagramStories } from '../../lib/instagramStory';
import { useSizzle } from '../../store';

/**
 * Send-to-friend — the share action, upgraded. A DM'd recipe card is the
 * platform's strongest endorsement (Instagram ranks sends #1), so the share
 * arrow opens THIS: recent chats + people you follow, one tap to send, plus
 * the old copy-link / native-share paths at the bottom.
 */
export function SendToFriendSheet() {
  const target = useSizzle((s) => s.sendRecipeFor);
  const setSendRecipeFor = useSizzle((s) => s.setSendRecipeFor);
  const close = () => setSendRecipeFor(null);
  const swipe = useSwipeDismiss(close);

  const { data: me } = useMe();
  const { data: convos } = useConversations(!!target);
  const follows = useFollowList(target && me ? me.id : null, 'following');
  const send = useSendRecipe();
  const share = useShareRecipe();
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState(false);
  const [igStories, setIgStories] = useState(false);
  const [igBusy, setIgBusy] = useState(false);
  const [igPct, setIgPct] = useState(0);
  // The IG video prep polls the backend for up to ~90s. If the sheet is dismissed
  // mid-poll, cancel it so it neither launches Instagram after the user moved on nor
  // calls setState on the unmounted sheet.
  const igCancelled = useRef(false);
  useEffect(() => () => { igCancelled.current = true; }, []);
  // Recipe detail supplies the cover + creator handle for the Story card.
  const { data: detail } = useRecipe(target?.id ?? null);
  // Only show the Instagram tile where the native plugin is actually compiled + IG installed
  // (build 31+). On the launch build (30) the plugin call rejects → false → tile hidden.
  useEffect(() => {
    let cancelled = false;
    void canShareToInstagramStories().then((ok) => { if (!cancelled) setIgStories(ok); });
    return () => { cancelled = true; };
  }, []);

  // Recent chats first, then everyone you follow (deduped), filtered by search.
  const people = useMemo(() => {
    const seen = new Set<string>();
    const out: CookSummary[] = [];
    for (const cv of convos ?? []) {
      if (seen.has(cv.otherUser.id)) continue;
      seen.add(cv.otherUser.id);
      out.push(cv.otherUser);
    }
    for (const f of follows.data ?? []) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(f);
    }
    const needle = q.trim().toLowerCase();
    return needle ? out.filter((p) => p.name.toLowerCase().includes(needle) || p.handle.toLowerCase().includes(needle)) : out;
  }, [convos, follows.data, q]);

  if (!target) return null;

  const sendTo = (userId: string) => {
    if (sentTo.has(userId) || send.isPending) return;
    send.mutate(
      { toUserId: userId, recipeId: target.id },
      { onSuccess: () => setSentTo((prev) => new Set(prev).add(userId)) },
    );
  };

  const url = recipeShareUrl(target.id);
  const copyLink = () => {
    void navigator.clipboard?.writeText(url).catch(() => {});
    share.mutate(target.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const shareElsewhere = () => {
    void nativeShare({ title: target.title, url }).then((r) => {
      if (r === 'shared') share.mutate(target.id);
      else if (r === 'unavailable') copyLink();
    });
  };
  const shareToIgStories = () => {
    if (igBusy) return;
    igCancelled.current = false;
    setIgBusy(true);
    setIgPct(0);
    void shareRecipeVideoToInstagramStories({
      recipeId: target.id,
      posterUrl: detail?.video?.posterUrl ?? null,
      title: target.title,
      handle: detail?.cook?.handle ?? '',
      recipeUrl: url,
      onProgress: (pct) => { if (!igCancelled.current) setIgPct(pct); },
      isCancelled: () => igCancelled.current,
    }).then((res) => {
      if (igCancelled.current) return; // sheet dismissed mid-prep — don't touch state or count
      if (res) share.mutate(target.id);
      setIgBusy(false);
    });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 96 }}>
      <DismissBackdrop onDismiss={close} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '72%', background: 'var(--bg)', borderRadius: '26px 26px 0 0', display: 'flex', flexDirection: 'column', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', ...swipe.sheetStyle }}>
        <div {...swipe.handlers} style={{ padding: '14px 22px 10px', position: 'relative', ...swipe.handlers.style }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>Send “{target.title.length > 26 ? `${target.title.slice(0, 26)}…` : target.title}”</div>
        </div>

        <div style={{ padding: '0 18px 8px' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people…"
            style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13, padding: '10px 14px', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, color: 'var(--text)', outline: 'none' }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '2px 18px 10px' }}>
          {people.length === 0 && (
            <div style={{ padding: '26px 0', textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 14 }}>
              Follow some cooks to send them recipes.
            </div>
          )}
          {people.map((p) => {
            const done = sentTo.has(p.id);
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 2px' }}>
                <div style={{ width: 42, height: 42, flex: 'none', borderRadius: '50%', background: p.avatarColor, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 16, color: '#fff' }}>
                  {p.avatarUrl ? <img src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : p.init}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>@{p.handle}</div>
                </div>
                <Button
                  onClick={() => sendTo(p.id)}
                  aria-label={done ? `Sent to ${p.name}` : `Send to ${p.name}`}
                  style={{ flex: 'none', minWidth: 74, padding: '8px 16px', border: 'none', borderRadius: 999, background: done ? 'var(--surface-2)' : 'var(--accent,#ff5a36)', color: done ? 'var(--text-faint)' : '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 13, fontWeight: 800, cursor: done ? 'default' : 'pointer' }}
                >
                  {done ? 'Sent ✓' : 'Send'}
                </Button>
              </div>
            );
          })}
        </div>

        {igStories && (
          <div style={{ flex: 'none', padding: '10px 18px 0' }}>
            <Button onClick={shareToIgStories} disabled={igBusy} aria-label="Share to Instagram Stories" style={{ width: '100%', height: 46, borderRadius: 14, fontSize: 14, fontWeight: 800, border: 'none', color: '#fff', background: 'linear-gradient(90deg,#f9a825,#ff5a36,#d6249f,#8a3ab9)', opacity: igBusy ? 0.85 : 1 }}>
              {igBusy ? (igPct > 0 ? `Preparing video… ${igPct}%` : 'Preparing video…') : '📸 Share to Instagram Stories'}
            </Button>
          </div>
        )}
        <div style={{ flex: 'none', display: 'flex', gap: 10, padding: '10px 18px calc(16px + var(--sab, 0px))', borderTop: '1px solid var(--line)' }}>
          <Button onClick={copyLink} variant="tonal" style={{ flex: 1, height: 46, borderRadius: 14, fontSize: 14 }}>
            {copied ? '✓ Copied' : '🔗 Copy link'}
          </Button>
          <Button onClick={shareElsewhere} variant="tonal" style={{ flex: 1, height: 46, borderRadius: 14, fontSize: 14 }}>
            ↗ Share elsewhere
          </Button>
        </div>
      </div>
    </div>
  );
}
