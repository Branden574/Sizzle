import { useSizzle } from '../../store';
import { Button, DismissBackdrop } from '../controls';
import { useSwipeDismiss } from '../../lib/useSwipeDismiss';
import { showCreatorMoney } from '../../lib/native';

type PhaseStatus = 'shipped' | 'current' | 'planned';
interface Phase {
  n: number;
  title: string;
  tagline: string;
  status: PhaseStatus;
  points: string[];
}

/** The product roadmap shown to creators + users. Phase 5 is creator monetization. */
const PHASES: Phase[] = [
  {
    n: 1,
    title: 'Watch & Cook',
    tagline: 'The foundation — a full-screen feed of real recipes you watch, then cook.',
    status: 'shipped',
    points: ['Vertical recipe-video feed', 'Profiles, follows & saves', 'Search, downloads & offline'],
  },
  {
    n: 2,
    title: 'Get Social',
    tagline: 'Recipes spread — talk, share, and discover through the community.',
    status: 'shipped',
    points: ['Comments, replies & likes', 'Reposts to friends', 'Hashtags, trending & notifications'],
  },
  {
    n: 3,
    title: 'Creator Tools',
    tagline: 'Powerful tools to make, organize, and grow great food content.',
    status: 'current',
    points: ['Verification badges', 'Food reviews, Cook Mode & in-app recorder', 'Collections, shopping list & serving scaler', 'Safety, moderation & admin tools'],
  },
  {
    n: 4,
    title: 'Community',
    tagline: 'Go deeper with your audience — build a community around your kitchen.',
    status: 'planned',
    points: ['Creator communities & group chats', 'Live cooking & weekly challenges', 'Brand collabs'],
  },
  {
    n: 5,
    title: 'Get Paid',
    tagline: 'Creators earn — your recipes make money, with a transparent 90/10 split.',
    status: 'shipped',
    points: ['Fan subscriptions (monthly support)', 'Sell premium recipes you price', 'One-off support (tips)', 'Transparent payouts — you keep 90%'],
  },
];

const STATUS_META: Record<PhaseStatus, { label: string; color: string; bg: string }> = {
  shipped: { label: 'Shipped', color: '#2c8a4a', bg: 'rgba(44,138,74,.14)' },
  current: { label: "You're here", color: 'var(--accent)', bg: 'rgba(255,90,54,.15)' },
  planned: { label: 'Planned', color: 'var(--text-faint)', bg: 'var(--surface-2)' },
};

export function RoadmapSheet() {
  const open = useSizzle((s) => s.showRoadmap);
  const setOpen = useSizzle((s) => s.setShowRoadmap);
  const swipe = useSwipeDismiss(() => setOpen(false));
  if (!open) return null;
  const close = () => setOpen(false);
  // The "Get Paid" phase promotes in-app monetization — drop it on native
  // (payments live on the web there; Apple 3.1.1 / Play Billing).
  const phases = showCreatorMoney ? PHASES : PHASES.filter((p) => p.n !== 5);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 94 }}>
      <DismissBackdrop onDismiss={close} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 56, background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column', ...swipe.sheetStyle }}>
        <div {...swipe.handlers} style={{ textAlign: 'center', padding: '16px 0 10px', position: 'relative', flex: 'none' , ...swipe.handlers.style}}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <Button onClick={close} style={{ position: 'absolute', right: 18, top: 14, background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Done</Button>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: 'var(--text)', marginTop: 8 }}>Where Sizzle is headed</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-faint)', marginTop: 3, padding: '0 30px' }}>{showCreatorMoney ? 'Five phases from launch to creators getting paid.' : 'How Sizzle is growing, phase by phase.'}</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 22px 36px' }}>
          {phases.map((p, i) => {
            const meta = STATUS_META[p.status];
            const isLast = i === phases.length - 1;
            const isCurrent = p.status === 'current';
            const isPaid = p.n === 5;
            return (
              <div key={p.n} style={{ display: 'flex', gap: 14, position: 'relative' }}>
                {/* timeline rail */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none', width: 36 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: p.status === 'planned' ? 'var(--text-faint)' : '#fff', background: p.status === 'shipped' ? '#2c8a4a' : isCurrent ? 'var(--accent)' : 'var(--surface-2)', border: isCurrent ? '3px solid rgba(255,90,54,.3)' : 'none', boxShadow: isCurrent ? '0 0 0 4px rgba(255,90,54,.12)' : 'none' }}>
                    {p.status === 'shipped' ? '✓' : p.n}
                  </div>
                  {!isLast && <div style={{ width: 2, flex: 1, background: 'var(--line)', minHeight: 18, margin: '4px 0' }} />}
                </div>

                {/* phase card */}
                <div style={{ flex: 1, marginBottom: 18, background: isPaid ? 'linear-gradient(135deg, rgba(255,90,54,.10), var(--surface))' : 'var(--surface)', border: `1px solid ${isCurrent || isPaid ? 'rgba(255,90,54,.35)' : 'var(--line)'}`, borderRadius: 18, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--text-faint-2)' }}>Phase {p.n}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: meta.color, background: meta.bg, padding: '3px 9px', borderRadius: 20 }}>{meta.label}</span>
                    {isPaid && <span style={{ fontSize: 13 }}>💸</span>}
                  </div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 23, color: 'var(--text)', marginTop: 4 }}>{p.title}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 4 }}>{p.tagline}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
                    {p.points.map((pt) => (
                      <div key={pt} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                        <span style={{ color: p.status === 'shipped' ? '#2c8a4a' : 'var(--accent)', fontSize: 13, marginTop: 1, flex: 'none' }}>{p.status === 'shipped' ? '✓' : '○'}</span>
                        <span style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.45 }}>{pt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint-2)', padding: '0 16px 8px', lineHeight: 1.5 }}>
            Timelines may shift as we build with the community. Have ideas for what creators need? Tell us in Settings → Contact support.
          </div>
        </div>
      </div>
    </div>
  );
}
