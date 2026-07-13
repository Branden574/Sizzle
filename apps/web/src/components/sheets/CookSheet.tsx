import { useState } from 'react';
import { Button, DismissBackdrop } from '../controls';
import { useBuyProduct, useCancelSubscription, useCook, useCookProducts, useCookLive, useCookTiers, useMe, useSubscribe, useToggleBlock, useToggleFollow, useToggleMute } from '../../data/queries';
import { useRequireAuth } from '../../auth/useRequireAuth';
import { isNative, showMonetization } from '../../lib/native';
import { useSizzle } from '../../store';
import { VerifiedBadge } from '../VerifiedBadge';
import { SocialLinks } from '../SocialLinks';
import { VideoPlayer } from '../VideoPlayer';
import { theme } from '../../theme';
import { formatCount } from '../../lib/format';
import { cookShareUrl } from '../../lib/share';
import { ChevronLeftIcon, DotsIcon, ShareIcon } from '../icons';
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
  const cancelSub = useCancelSubscription();
  const { data: me } = useMe();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: ck, isLoading } = useCook(openCook);

  if (!openCook) return null;
  const close = () => setOpenCook(null);
  // openCook may be a handle (profile share links), so compare against the
  // resolved profile id, not the raw route param.
  const isOwn = !!me && !!ck && me.id === ck.id;
  // Private account, viewed by a non-follower: limited profile, no content.
  const privateLocked = !!ck && ck.isPrivate && !isOwn && !ck.viewer.following;

  // Native share sheet where available, otherwise copy the link to the clipboard.
  const onShare = () => {
    if (!ck) return;
    const url = cookShareUrl(ck.handle);
    if (navigator.share) void navigator.share({ title: `${ck.name} on Sizzle`, url }).catch(() => {});
    else void navigator.clipboard?.writeText(url).catch(() => {});
  };

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
        <Button onClick={close} aria-label="Back" style={{ position: 'absolute', top: 54, left: 18, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ChevronLeftIcon size={20} stroke="#fff" strokeWidth={2.2} />
        </Button>
        {ck && (
          <Button onClick={onShare} aria-label="Share profile" style={{ position: 'absolute', top: 54, right: isOwn ? 18 : 64, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ShareIcon size={19} stroke="#fff" strokeWidth={2} />
          </Button>
        )}
        {ck && !isOwn && (
          <Button onClick={() => setMenuOpen((o) => !o)} aria-label="More" style={{ position: 'absolute', top: 54, right: 18, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <DotsIcon size={20} />
          </Button>
        )}
      </div>

      {menuOpen && ck && (
        <>
          <DismissBackdrop onDismiss={() => setMenuOpen(false)} style={{ zIndex: 5, background: 'transparent' }} />
          <div style={{ position: 'absolute', top: 98, right: 18, zIndex: 6, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', minWidth: 200, boxShadow: '0 12px 34px -10px rgba(0,0,0,.5)' }}>
            <Button onClick={onMute} style={menuRow}>{ck.viewer.muted ? 'Unmute' : 'Mute'} <span style={menuHint}>{ck.viewer.muted ? 'show their posts again' : "hide their posts from your feed"}</span></Button>
            <div style={{ height: 1, background: 'var(--line)' }} />
            <Button onClick={() => { setMenuOpen(false); setReportFor({ type: 'profile', id: ck.id, name: ck.name }); }} style={{ ...menuRow, color: '#e0573a' }}>Report <span style={menuHint}>flag this profile for review</span></Button>
            <div style={{ height: 1, background: 'var(--line)' }} />
            <Button onClick={onBlock} style={{ ...menuRow, color: '#e0573a' }}>{ck.viewer.blocked ? 'Unblock' : 'Block'} <span style={menuHint}>{ck.viewer.blocked ? '' : 'hide each other everywhere'}</span></Button>
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
            <Button onClick={onBlock} className="sz-press" style={{ ...pressVars(0.95), padding: '12px 28px', borderRadius: 14, border: '1.5px solid var(--line-2)', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Unblock</Button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 22px 60px', marginTop: -44, position: 'relative', zIndex: 1 }}>
          <div style={{ width: 88, height: 88, borderRadius: 28, background: ck.avatarUrl ? `url(${ck.avatarUrl}) center/cover` : ck.avatarColor, border: '4px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 36, color: '#fff', overflow: 'hidden' }}>{ck.avatarUrl ? '' : ck.init}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Badge flows inline with the name so it hugs the last word even when
                  the name wraps to two lines (instead of floating in the gap). */}
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, lineHeight: 1.1, color: 'var(--text)' }}>
                {ck.name}
                <span style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 6, position: 'relative', top: -2 }}>
                  <VerifiedBadge tier={ck.verifiedTier} size={20} />
                </span>
                {ck.viewer.muted && <span style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 8, fontFamily: "'Hanken Grotesk'", fontSize: 11, fontWeight: 700, color: 'var(--text-faint-2)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 8 }}>Muted</span>}
              </div>
              <div style={{ color: 'var(--text-faint)', fontSize: 14.5, marginTop: 2 }}>@{ck.handle}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {showMonetization && ck.acceptsTips && (
                <Button
                  onClick={() => { if (requireAuth()) setTipFor({ creatorId: ck.id, name: ck.name }); }}
                  className="sz-press"
                  title="Send a tip"
                  style={{ ...pressVars(0.94), padding: '9px 14px', minHeight: 38, borderRadius: 15, border: '1.5px solid var(--line-2)', background: 'var(--surface)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'transform .2s cubic-bezier(.34,1.56,.64,1)' }}
                >
                  💝 Support
                </Button>
              )}
              <Button
                onClick={() => { if (requireAuth()) setThreadWith(ck.id); }}
                className="sz-press"
                style={{ ...pressVars(0.94), padding: '9px 16px', minHeight: 38, borderRadius: 15, border: '1.5px solid var(--line-2)', background: 'var(--surface)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'transform .2s cubic-bezier(.34,1.56,.64,1)' }}
              >
                Message
              </Button>
              <Button
                onClick={() => {
                  if (!requireAuth()) return;
                  if (follow.isPending) return; // one toggle in flight at a time
                  follow.mutate({ cookId: ck.id, following: ck.viewer.following, requested: ck.viewer.requested });
                }}
                aria-pressed={ck.viewer.following || ck.viewer.requested}
                aria-busy={follow.isPending || undefined}
                className="sz-press"
                style={{ ...pressVars(0.94), padding: '9px 22px', minHeight: 38, borderRadius: 15, border: `1.5px solid ${ck.viewer.following || ck.viewer.requested ? 'var(--invert-bg)' : accent}`, background: ck.viewer.following || ck.viewer.requested ? 'var(--invert-bg)' : accent, color: ck.viewer.following || ck.viewer.requested ? 'var(--invert-fg)' : '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: follow.isPending ? 0.72 : 1, transition: 'transform .2s cubic-bezier(.34,1.56,.64,1)' }}
              >
                {ck.viewer.following ? 'Following' : ck.viewer.requested ? 'Requested' : ck.isPrivate ? 'Request' : 'Follow'}
              </Button>
            </div>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.5, margin: '14px 0 0' }}>{ck.bio}</p>
          <SocialLinks links={ck.links} size={34} />
          {!privateLocked && <LiveBanner cookId={ck.id} name={ck.name} />}

          {!privateLocked && showMonetization && !isOwn && ck.subPriceCents != null && (
            ck.viewer.subscribed ? (
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: '12px 16px' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', flex: 1 }}>⭐ Subscribed · unlocks {ck.name}'s premium recipes</span>
                <Button onClick={() => { if (window.confirm(`Cancel your subscription to ${ck.name}? You keep access until the month ends.`)) cancelSub.mutate(ck.id); }} disabled={cancelSub.isPending} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontFamily: "'Hanken Grotesk'", fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>Cancel</Button>
              </div>
            ) : (
              <SubscribeTiers cookId={ck.id} basePriceCents={ck.subPriceCents} />
            )
          )}

          {!privateLocked && showMonetization && !isOwn && <ProductShelf cookId={ck.id} />}

          {!privateLocked && showMonetization && ck.goal && ck.goal.targetCents > 0 && (
            <div style={{ marginTop: 16, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: '13px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>🎯 {ck.goal.label}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>${(ck.goal.raisedCents / 100).toFixed(0)} / ${(ck.goal.targetCents / 100).toFixed(0)}</span>
              </div>
              <div style={{ height: 9, background: 'var(--track)', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, Math.round((ck.goal.raisedCents / ck.goal.targetCents) * 100))}%`, height: '100%', background: `linear-gradient(90deg,${accent},#e23a18)`, borderRadius: 5, transition: 'width .4s' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', marginTop: 18, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }}>
            {/* A private account's follower/following lists open only for accepted followers. */}
            <CookStat value={formatCount(ck.counts.followers)} label="Followers" border onClick={privateLocked ? undefined : () => setFollowList({ id: ck.id, mode: 'followers', name: ck.name })} />
            <CookStat value={formatCount(ck.counts.following)} label="Following" border onClick={privateLocked ? undefined : () => setFollowList({ id: ck.id, mode: 'following', name: ck.name })} />
            <CookStat value={formatCount(ck.counts.likes)} label="Likes" border />
            <CookStat value={String(ck.counts.recipes)} label="Recipes" />
          </div>

          {privateLocked ? (
            <div style={{ marginTop: 24, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '26px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 30 }}>🔒</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginTop: 6 }}>This account is private</div>
              <div style={{ fontSize: 13.5, color: 'var(--text-faint)', marginTop: 4, lineHeight: 1.5 }}>
                {ck.viewer.requested
                  ? `Your follow request is pending — you'll see ${ck.name}'s recipes once they accept.`
                  : `Request to follow ${ck.name} to see their recipes.`}
              </div>
            </div>
          ) : (
          <>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '24px 0 12px' }}>Recipes</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {ck.recipes.map((d) => (
              <Button
                key={d.id}
                onClick={() => setOpenRecipe(d.id)}
                style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 18, overflow: 'hidden', position: 'relative', height: 180, background: d.images && d.images.length > 0 ? `center/cover no-repeat url(${d.images[0]})` : d.bg, textAlign: 'left' }}
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
              </Button>
            ))}
          </div>
          </>
          )}
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
  return <Button onClick={onClick} style={{ ...style, background: 'none', border: 'none', borderRight: style.borderRight, cursor: 'pointer' }}>{inner}</Button>;
}

/** A creator's digital products, with buy / download. */
function ProductShelf({ cookId }: { cookId: string }) {
  const requireAuth = useRequireAuth();
  const { data: products } = useCookProducts(cookId);
  const buy = useBuyProduct(cookId);
  if (!products || products.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text-faint-2)', margin: '0 2px 8px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Shop</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {products.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '11px 14px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
              {p.description && <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>}
            </div>
            {p.owned ? (
              p.fileUrl
                ? <Button onClick={() => window.open(p.fileUrl!, '_blank', 'noopener')} style={{ flex: 'none', height: 38, padding: '0 16px', border: 'none', borderRadius: 12, background: 'var(--invert-bg)', color: 'var(--invert-fg)', fontFamily: "'Hanken Grotesk'", fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}>Download</Button>
                : <span style={{ flex: 'none', fontSize: 13, fontWeight: 800, color: '#1f9d55' }}>✓ Owned</span>
            ) : (
              <Button onClick={() => { if (requireAuth()) buy.mutate(p.id); }} disabled={buy.isPending} style={{ flex: 'none', height: 38, padding: '0 16px', border: 'none', borderRadius: 12, background: `linear-gradient(135deg,${accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 13.5, fontWeight: 800, cursor: 'pointer', opacity: buy.isPending ? 0.7 : 1 }}>
                {`Buy · $${(p.priceCents / 100).toFixed(2)}`}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Subscribe UI — a tier picker when the creator offers tiers, else the flat price. */
function SubscribeTiers({ cookId, basePriceCents }: { cookId: string; basePriceCents: number }) {
  const requireAuth = useRequireAuth();
  const subscribe = useSubscribe();
  const { data: tiers } = useCookTiers(cookId);
  const go = (tierId?: string) => { if (requireAuth()) subscribe.mutate({ creatorId: cookId, tierId }); };
  if (tiers && tiers.length > 0) {
    return (
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tiers.map((t) => (
          <Button key={t.id} onClick={() => go(t.id)} disabled={subscribe.isPending} className="sz-press" style={{ ...pressVars(0.98), textAlign: 'left', border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: '13px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{t.name}</div>
              {t.perks && <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>{t.perks}</div>}
            </div>
            <div style={{ flex: 'none', padding: '7px 14px', borderRadius: 12, background: `linear-gradient(135deg,${accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 14, fontWeight: 800 }}>${(t.priceCents / 100).toFixed(2)}/mo</div>
          </Button>
        ))}
      </div>
    );
  }
  return (
    <Button onClick={() => go()} disabled={subscribe.isPending} className="sz-press" style={{ ...pressVars(0.97), width: '100%', marginTop: 16, height: 50, borderRadius: 15, border: 'none', background: `linear-gradient(135deg,${accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15.5, fontWeight: 800, cursor: 'pointer' }}>
      {subscribe.isPending ? 'Starting…' : `⭐ Subscribe · $${(basePriceCents / 100).toFixed(2)}/mo`}
    </Button>
  );
}

/** Live banner + player shown on a creator's profile while they're live. */
function LiveBanner({ cookId, name }: { cookId: string; name: string }) {
  // Mock-provider gate: no fake livestreams in the native review build.
  if (isNative) return null;
  const { data: live } = useCookLive(cookId);
  if (!live) return null;
  return (
    <div style={{ marginTop: 18, borderRadius: 18, overflow: 'hidden', border: '2px solid #e0143c', position: 'relative' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '9/16', maxHeight: 380, background: '#000' }}>
        {live.playbackUrl && <VideoPlayer src={live.playbackUrl} active immersive={false} />}
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 30, display: 'flex', alignItems: 'center', gap: 6, background: '#e0143c', color: '#fff', padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 900, letterSpacing: '.04em' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} /> LIVE
        </div>
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 30, background: 'rgba(0,0,0,.5)', color: '#fff', padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>{formatCount(live.viewers)} watching</div>
      </div>
      <div style={{ padding: '10px 14px', background: 'var(--surface)' }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>{live.title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>{name} is cooking live now</div>
      </div>
    </div>
  );
}
