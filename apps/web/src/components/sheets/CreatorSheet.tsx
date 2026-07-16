import { useState } from 'react';
import { Button, DismissBackdrop } from '../controls';
import { useSwipeDismiss } from '../../lib/useSwipeDismiss';
import { CREATOR_FOLLOWER_REQ, CREATOR_VIEW_REQ } from '@sizzle/shared';
import { openExternal } from '../../lib/native';
import { useMe, useMonetizationStatus, useStartOnboarding } from '../../data/queries';
import { useSizzle } from '../../store';
import { formatCount } from '../../lib/format';
import { CloseIcon } from '../icons';

/**
 * Creator hub — the 3-state path from Regular → Creator:
 *   regular    → progress toward eligibility (followers + views bars)
 *   eligible   → accept terms + "Become a Creator" (starts payout setup)
 *   pending    → finishing payout setup (continue / waiting on Stripe)
 *   active     → you're a Creator: total views + dashboard link
 *   suspended  → under review
 * Activation REQUIRES finishing payout setup (server-enforced); this UI just
 * drives the flow.
 */
export function CreatorSheet() {
  const setShowCreator = useSizzle((s) => s.setShowCreator);
  const setShowAnalytics = useSizzle((s) => s.setShowAnalytics);
  const me = useMe().data;
  const payout = useMonetizationStatus(true).data;
  const onboard = useStartOnboarding();
  const [accepted, setAccepted] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const close = () => setShowCreator(false);
  const swipe = useSwipeDismiss(close);

  const status = me?.creatorStatus ?? 'regular';
  const elig = me?.creatorEligibility;
  const openDashboard = () => { close(); setShowAnalytics(true); };

  // Start (or resume) payout onboarding. Stripe's hosted onboarding opens in an
  // in-app browser sheet on native (never the app's own WebView — that would
  // strand the user on Stripe). When they close it, useMonetizationStatus is
  // already polling every 8s while `pending`, so the tier flips to active on its own.
  const becomeCreator = async () => {
    setErr(null);
    try {
      const res = await onboard.mutateAsync({ acceptTerms: true });
      if (res.url) await openExternal(res.url);
      // Mock / already-active: status flips via the invalidated /me + /monetize.
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start setup — please try again.');
    }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 92 }}>
      <DismissBackdrop onDismiss={close} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column', ...swipe.sheetStyle }}>
        <div {...swipe.handlers} style={{ padding: '14px 22px 12px', borderBottom: '1px solid var(--line)', position: 'relative', ...swipe.handlers.style }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>Creator</div>
          <Button onClick={close} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', cursor: 'pointer' }}>
            <CloseIcon size={22} stroke="var(--text-faint)" strokeWidth={2.2} />
          </Button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 32px' }}>
          {/* ── ACTIVE ── */}
          {status === 'active' ? (
            <>
              <Hero icon="✨" title="You're a Sizzle Creator" sub="Your Creator account is active. Track your reach and earnings in the dashboard." />
              <div style={{ display: 'flex', gap: 12, margin: '18px 0' }}>
                <Metric value={formatCount(me?.counts.views ?? 0)} label="Total views" />
                <Metric value={formatCount(me?.counts.followers ?? 0)} label="Followers" />
              </div>
              <Button variant="primary" fullWidth onClick={openDashboard} style={{ marginTop: 4 }}>Open Creator dashboard</Button>
              {/* An active Creator without finished payouts is a real state (admin
                  grant, or an abandoned Stripe form — its links expire in ~5 min).
                  Give them a working way back, not a dead pointer to the dashboard. */}
              {payout?.status !== 'active' ? (
                <>
                  {err && <div style={{ marginTop: 12 }}><ErrText text={err} /></div>}
                  <Button fullWidth onClick={becomeCreator} disabled={onboard.isPending} variant="outline" style={{ marginTop: 10 }}>
                    {onboard.isPending ? 'Opening…' : payout?.status === 'pending' ? 'Continue payout setup' : 'Set up payouts'}
                  </Button>
                  <div style={{ fontSize: 12, color: 'var(--text-faint-2)', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
                    You won't receive earnings until payouts are set up.
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-faint-2)', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>Payouts are set up.</div>
              )}
            </>
          ) : status === 'suspended' ? (
            <Hero icon="⏸️" title="Creator account under review" sub="Your Creator status is paused while we review your account. You'll be notified when it's restored." />
          ) : status === 'pending' ? (
            <>
              <Hero icon="⏳" title="Finishing your setup" sub="Complete payout setup to activate your Creator account. It only takes a minute." />
              {err && <ErrText text={err} />}
              <Button variant="primary" fullWidth onClick={becomeCreator} disabled={onboard.isPending} style={{ marginTop: 16 }}>
                {onboard.isPending ? 'Opening…' : 'Continue payout setup'}
              </Button>
            </>
          ) : status === 'eligible' ? (
            <>
              <Hero icon="🎉" title="You're eligible!" sub="You've hit the bar to become a Sizzle Creator. Set up payouts to unlock earning and Creator tools." />
              <Perks />
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '16px 2px', cursor: 'pointer' }}>
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ width: 18, height: 18, marginTop: 1, accentColor: 'var(--accent,#ff5a36)' }} />
                <span style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.5 }}>I agree to the Sizzle Creator Terms and understand the split on earnings: card processing comes off the top, then Sizzle keeps {String(pctFee())}% of the rest.</span>
              </label>
              {err && <ErrText text={err} />}
              <Button variant="primary" fullWidth onClick={becomeCreator} disabled={!accepted || onboard.isPending}>
                {onboard.isPending ? 'Opening…' : 'Become a Creator'}
              </Button>
            </>
          ) : (
            /* ── REGULAR: progress toward eligibility ── */
            <>
              <Hero icon="🚀" title="Become a Creator" sub="Grow your audience to unlock Creator tools, analytics, and earning. You need both:" />
              <Progress label="Followers" value={elig?.followers ?? me?.counts.followers ?? 0} req={elig?.followersReq ?? CREATOR_FOLLOWER_REQ} />
              <Progress label="Total views" value={elig?.views ?? me?.counts.views ?? 0} req={elig?.viewsReq ?? CREATOR_VIEW_REQ} />
              <Perks />
              <div style={{ fontSize: 12.5, color: 'var(--text-faint-2)', textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}>
                Keep posting and sharing — you'll be notified the moment you're eligible.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Sizzle's share (% of the post-processing amount) for the terms line — kept in one place. */
function pctFee(): number { return 10; }

function Hero({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 46 }}>{icon}</div>
      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 27, color: 'var(--text)', marginTop: 6 }}>{title}</div>
      <div style={{ fontSize: 14.5, color: 'var(--text-faint)', margin: '8px auto 0', maxWidth: 340, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

function Progress({ label, value, req }: { label: string; value: number; req: number }) {
  const pct = Math.min(100, Math.round((value / req) * 100));
  const done = value >= req;
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 16px', marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{done ? '✅ ' : ''}{label}</span>
        <span style={{ fontSize: 12.5, color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>{formatCount(value)} / {formatCount(req)}</span>
      </div>
      <div style={{ height: 9, background: 'var(--track)', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: done ? '#1f9d55' : 'linear-gradient(90deg,var(--accent,#ff5a36),#e23a18)', borderRadius: 5, transition: 'width .4s' }} />
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function Perks() {
  const perks = [
    ['📊', 'Creator analytics — views, watch-time, and reach'],
    ['💸', 'Earn from tips, subscriptions, and premium recipes'],
    ['⭐', 'A Creator badge on your profile'],
  ];
  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {perks.map(([icon, text]) => (
        <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20, width: 26, textAlign: 'center' }}>{icon}</span>
          <span style={{ fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.4 }}>{text}</span>
        </div>
      ))}
    </div>
  );
}

function ErrText({ text }: { text: string }) {
  return <div style={{ fontSize: 12.5, fontWeight: 600, color: '#d8521e', background: 'rgba(216,82,30,.1)', borderRadius: 10, padding: '9px 12px', margin: '4px 0 12px' }}>{text}</div>;
}
