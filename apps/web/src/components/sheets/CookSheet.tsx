import { useState } from 'react';
import { useCook, useMe, useToggleBlock, useToggleFollow, useToggleMute } from '../../data/queries';
import { useRequireAuth } from '../../auth/useRequireAuth';
import { useSizzle } from '../../store';
import { VerifiedBadge } from '../VerifiedBadge';
import { SocialLinks } from '../SocialLinks';
import { theme } from '../../theme';
import { formatCount } from '../../lib/format';
import { ChevronLeftIcon, DotsIcon } from '../icons';
import { pressVars } from '../ui';

const accent = theme.accent;

export function CookSheet() {
  const openCook = useSizzle((s) => s.openCook);
  const setOpenCook = useSizzle((s) => s.setOpenCook);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const setFollowList = useSizzle((s) => s.setFollowList);
  const setThreadWith = useSizzle((s) => s.setThreadWith);
  const setReportFor = useSizzle((s) => s.setReportFor);
  const setTipFor = useSizzle((s) => s.setTipFor);
  const requireAuth = useRequireAuth();
  const follow = useToggleFollow();
  const block = useToggleBlock();
  const mute = useToggleMute();
  const { data: me } = useMe();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: ck, isLoading } = useCook(openCook);

  if (!openCook) return null;
  const close = () => setOpenCook(null);
  const isOwn = !!me && me.id === openCook;

  const onBlock = () => {
    setMenuOpen(false);
    if (!requireAuth() || !ck) return;
    if (!ck.viewer.blocked && typeof window !== 'undefined' && !window.confirm(`Block @${ck.handle}? They won't be able to find your profile or content, and you won't see theirs.`)) return;
    block.mutate({ cookId: ck.id, blocked: ck.viewer.blocked });
  };
  const onMute = () => {
    setMenuOpen(false);
    if (!requireAuth() || !ck) return;
    mute.mutate({ cookId: ck.id, muted: ck.viewer.muted });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 85, background: 'var(--bg)', overflowY: 'auto', animation: 'sz-slideUp .42s cubic-bezier(.16,1,.3,1)' }}>
      <div style={{ height: 170, background: ck?.bannerUrl ? `url(${ck.bannerUrl}) center/cover no-repeat` : ck?.avatarColor ?? 'linear-gradient(135deg,#3a2a22,#1b1512)', position: 'relative' }}>
        {!ck?.bannerUrl && <div style={{ position: 'absolute', inset: 0, opacity: 0.12, background: 'repeating-linear-gradient(115deg,#000 0 2px, transparent 2px 7px)' }} />}
        <button onClick={close} style={{ position: 'absolute', top: 54, left: 18, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ChevronLeftIcon size={20} stroke="#fff" strokeWidth={2.2} />
        </button>
        {ck && !isOwn && (
          <button onClick={() => setMenuOpen((o) => !o)} aria-label="More" style={{ position: 'absolute', top: 54, right: 18, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <DotsIcon size={20} />
          </button>
        )}
      </div>

      {menuOpen && ck && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 5 }} />
          <div style={{ position: 'absolute', top: 98, right: 18, zIndex: 6, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', minWidth: 200, boxShadow: '0 12px 34px -10px rgba(0,0,0,.5)' }}>
            <button onClick={onMute} style={menuRow}>{ck.viewer.muted ? 'Unmute' : 'Mute'} <span style={menuHint}>{ck.viewer.muted ? 'show their posts again' : "hide their posts from your feed"}</span></button>
            <div style={{ height: 1, background: 'var(--line)' }} />
            <button onClick={() => { setMenuOpen(false); setReportFor({ type: 'profile', id: ck.id, name: ck.name }); }} style={{ ...menuRow, color: '#e0573a' }}>Report <span style={menuHint}>flag this profile for review</span></button>
            <div style={{ height: 1, background: 'var(--line)' }} />
            <button onClick={onBlock} style={{ ...menuRow, color: '#e0573a' }}>{ck.viewer.blocked ? 'Unblock' : 'Block'} <span style={menuHint}>{ck.viewer.blocked ? '' : 'hide each other everywhere'}</span></button>
          </div>
        </>
      )}

      {!ck ? (
        <div style={{ padding: '60px 22px', textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 15 }}>{isLoading ? 'Loading…' : 'Cook not found'}</div>
      ) : ck.viewer.blocked ? (
        <div style={{ padding: '0 22px 60px', marginTop: -44, position: 'relative', zIndex: 1 }}>
          <div style={{ width: 88, height: 88, borderRadius: 28, background: ck.avatarColor, border: '4px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 36, color: '#fff', overflow: 'hidden', opacity: 0.6 }}>{ck.init}</div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: 'var(--text)', marginTop: 12 }}>{ck.name}</div>
          <div style={{ color: 'var(--text-faint)', fontSize: 14.5 }}>@{ck.handle}</div>
          <div style={{ marginTop: 26, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>You blocked @{ck.handle}</div>
            <p style={{ fontSize: 13.5, color: 'var(--text-faint)', lineHeight: 1.5, margin: '8px 0 16px' }}>They can't find your profile or content, and you won't see theirs anywhere on Sizzle.</p>
            <button onClick={onBlock} className="sz-press" style={{ ...pressVars(0.95), padding: '12px 28px', borderRadius: 14, border: '1.5px solid var(--line-2)', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Unblock</button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 22px 60px', marginTop: -44, position: 'relative', zIndex: 1 }}>
          <div style={{ width: 88, height: 88, borderRadius: 28, background: ck.avatarUrl ? `url(${ck.avatarUrl}) center/cover` : ck.avatarColor, border: '4px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 36, color: '#fff', overflow: 'hidden' }}>{ck.avatarUrl ? '' : ck.init}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: 'var(--text)' }}>{ck.name}</span>
                <VerifiedBadge tier={ck.verifiedTier} size={20} />
                {ck.viewer.muted && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint-2)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 8 }}>Muted</span>}
              </div>
              <div style={{ color: 'var(--text-faint)', fontSize: 14.5 }}>@{ck.handle}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {ck.acceptsTips && (
                <button
                  onClick={() => { if (requireAuth()) setTipFor({ creatorId: ck.id, name: ck.name }); }}
                  className="sz-press"
                  title="Send a tip"
                  style={{ ...pressVars(0.94), padding: '12px 16px', borderRadius: 15, border: '1.5px solid var(--line-2)', background: 'var(--surface)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'transform .2s cubic-bezier(.34,1.56,.64,1)' }}
                >
                  💝 Tip
                </button>
              )}
              <button
                onClick={() => { if (requireAuth()) setThreadWith(ck.id); }}
                className="sz-press"
                style={{ ...pressVars(0.94), padding: '12px 18px', borderRadius: 15, border: '1.5px solid var(--line-2)', background: 'var(--surface)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'transform .2s cubic-bezier(.34,1.56,.64,1)' }}
              >
                Message
              </button>
              <button
                onClick={() => {
                  if (!requireAuth()) return;
                  follow.mutate({ cookId: ck.id, following: ck.viewer.following });
                }}
                className="sz-press"
                style={{ ...pressVars(0.94), padding: '12px 24px', borderRadius: 15, border: `1.5px solid ${ck.viewer.following ? 'var(--invert-bg)' : accent}`, background: ck.viewer.following ? 'var(--invert-bg)' : accent, color: ck.viewer.following ? 'var(--invert-fg)' : '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'transform .2s cubic-bezier(.34,1.56,.64,1)' }}
              >
                {ck.viewer.following ? 'Following' : 'Follow'}
              </button>
            </div>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.5, margin: '14px 0 0' }}>{ck.bio}</p>
          <SocialLinks links={ck.links} size={34} />

          <div style={{ display: 'flex', marginTop: 18, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }}>
            <CookStat value={formatCount(ck.counts.followers)} label="Followers" border onClick={() => setFollowList({ id: ck.id, mode: 'followers', name: ck.name })} />
            <CookStat value={formatCount(ck.counts.following)} label="Following" border onClick={() => setFollowList({ id: ck.id, mode: 'following', name: ck.name })} />
            <CookStat value={formatCount(ck.counts.likes)} label="Likes" border />
            <CookStat value={String(ck.counts.recipes)} label="Recipes" />
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '24px 0 12px' }}>Recipes</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {ck.recipes.map((d) => (
              <button
                key={d.id}
                onClick={() => setOpenRecipe(d.id)}
                style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 18, overflow: 'hidden', position: 'relative', height: 180, background: d.bg, textAlign: 'left' }}
              >
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 42%, rgba(0,0,0,.72))' }} />
                {d.removed ? (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,14,12,.78)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#ff8a6b' }}>Video removed</div>
                    {d.removalReason && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)', marginTop: 4 }}>{d.removalReason}</div>}
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 8 }}>{d.appealStatus === 'pending' ? 'Appeal under review' : d.appealStatus === 'denied' ? 'Appeal denied' : 'Tap to appeal'}</div>
                  </div>
                ) : d.autoHidden ? (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,14,12,.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#f0c674' }}>Under review</div>
                    <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)', marginTop: 4 }}>Hidden while we review reports</div>
                  </div>
                ) : null}
                <div style={{ position: 'absolute', left: 12, right: 12, bottom: 11 }}>
                  <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 11, fontWeight: 600 }}>{d.time}</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 18, lineHeight: 1.05, color: '#fff', marginTop: 2 }}>{d.title}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const menuRow = { display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-start', gap: 2, width: '100%', background: 'none', border: 'none', padding: '13px 16px', cursor: 'pointer', textAlign: 'left' as const, fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, color: 'var(--text)' };
const menuHint = { fontSize: 12, fontWeight: 500, color: 'var(--text-faint-2)' };

function CookStat({ value, label, border, onClick }: { value: string; label: string; border?: boolean; onClick?: () => void }) {
  const style = { flex: 1, padding: '14px 8px', textAlign: 'center' as const, borderRight: border ? '1px solid var(--line)' : undefined };
  const inner = (
    <>
      <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{label}</div>
    </>
  );
  if (!onClick) return <div style={style}>{inner}</div>;
  return <button onClick={onClick} style={{ ...style, background: 'none', border: 'none', borderRight: style.borderRight, cursor: 'pointer' }}>{inner}</button>;
}
