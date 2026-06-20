import { useAuth } from '../auth/useAuth';
import { useRequireAuth } from '../auth/useRequireAuth';
import { useMe, useNotifications, useSavedFeed } from '../data/queries';
import { useSizzle } from '../store';
import { BellIcon, GearIcon } from './icons';

const BANNER = 'radial-gradient(120% 120% at 70% 0%, var(--saffron,#f4a52c), var(--accent,#ff5a36) 60%, #c23a1a)';

export function Profile() {
  const authed = useAuth((s) => s.status === 'authed');
  const signOut = useAuth((s) => s.signOut);
  const requireAuth = useRequireAuth();
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);

  const setShowEditProfile = useSizzle((s) => s.setShowEditProfile);
  const setShowNotifications = useSizzle((s) => s.setShowNotifications);

  const { data: me } = useMe();
  const { data: saved } = useSavedFeed();
  const { data: notifications } = useNotifications();
  const savedItems = saved?.items ?? [];
  const unread = (notifications ?? []).filter((n) => !n.read).length;

  if (!authed) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: '#faf3ea', animation: 'sz-fadeIn .35s' }}>
        <div style={{ height: 150, background: BANNER, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.12, background: 'repeating-linear-gradient(115deg,#000 0 2px, transparent 2px 7px)' }} />
        </div>
        <div style={{ padding: '60px 30px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: '#1b1512' }}>You're browsing as a guest</div>
          <p style={{ color: '#8a7c70', fontSize: 15, margin: '10px 0 24px' }}>Create an account to keep your saves, downloads, and the cooks you follow.</p>
          <button onClick={() => requireAuth()} style={{ height: 52, padding: '0 28px', border: 'none', borderRadius: 16, background: '#1b1512', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#faf3ea', overflowY: 'auto', animation: 'sz-fadeIn .35s' }}>
      <div style={{ height: 150, background: BANNER, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.12, background: 'repeating-linear-gradient(115deg,#000 0 2px, transparent 2px 7px)' }} />
      </div>
      <div style={{ padding: '0 22px 110px', marginTop: -44 }}>
        <div style={{ width: 88, height: 88, borderRadius: 28, background: 'linear-gradient(135deg,#3a2a22,#1b1512)', border: '4px solid #faf3ea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 34, color: '#fff' }}>{me?.init ?? '·'}</div>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: '#1b1512', marginTop: 12 }}>{me?.name ?? 'Loading…'}</div>
        <div style={{ color: '#8a7c70', fontSize: 14.5 }}>
          {me ? `@${me.handle} · ${me.bio || 'Home cook in training'}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 22, marginTop: 18 }}>
          <Stat value={String(me?.counts.following ?? 0)} label="Following" />
          <Stat value={String(me?.counts.followers ?? 0)} label="Followers" />
          <Stat value={String(me?.counts.saved ?? 0)} label="Saved" />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={() => setShowEditProfile(true)} style={{ flex: 1, height: 48, border: 'none', borderRadius: 14, background: '#1b1512', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Edit profile</button>
          <button
            onClick={() => setShowNotifications(true)}
            title="Notifications"
            style={{ position: 'relative', width: 48, height: 48, border: '1.5px solid #e3d6c8', borderRadius: 14, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <BellIcon size={20} stroke="#5c5048" />
            {unread > 0 && <div style={{ position: 'absolute', top: 9, right: 9, width: 9, height: 9, borderRadius: '50%', background: 'var(--accent,#ff5a36)', border: '2px solid #fff' }} />}
          </button>
          <button
            onClick={() => void signOut()}
            title="Sign out"
            style={{ width: 48, height: 48, border: '1.5px solid #e3d6c8', borderRadius: 14, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <GearIcon size={20} stroke="#5c5048" />
          </button>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1b1512', margin: '26px 0 12px' }}>Your saved recipes</div>
        {savedItems.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', background: '#fff', border: '1px dashed #e3d6c8', borderRadius: 20, color: '#a99c90', fontSize: 14 }}>Recipes you save will collect here.</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {savedItems.map((r) => (
            <button
              key={r.id}
              onClick={() => setOpenRecipe(r.id)}
              style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 14, overflow: 'hidden', position: 'relative', aspectRatio: '3 / 4', background: r.bg }}
            >
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 45%, rgba(0,0,0,.7))' }} />
              <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, fontFamily: "'Instrument Serif',serif", fontSize: 14, lineHeight: 1.05, color: '#fff' }}>{r.title}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 21, fontWeight: 800, color: '#1b1512', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 13, color: '#8a7c70' }}>{label}</div>
    </div>
  );
}
