import { useSizzle } from '../store';
import { theme } from '../theme';
import type { Tab } from '../types';
import { BookmarkIcon, HomeIcon, NavPlusIcon, PersonIcon, SearchIcon } from './icons';

const accent = theme.accent;

export function BottomNav() {
  const tab = useSizzle((s) => s.tab);
  const setTab = useSizzle((s) => s.setTab);
  const setShowUpload = useSizzle((s) => s.setShowUpload);
  const immersive = useSizzle((s) => s.immersive);

  const navDark = tab === 'feed';
  const navIdle = navDark ? 'rgba(255,255,255,.5)' : 'var(--text-faint-2)';
  const col = (active: boolean) => (active ? accent : navIdle);

  const go = (t: Tab) => () => setTab(t);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 88,
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-around',
        padding: '12px 16px 0',
        background: navDark ? 'rgba(12,10,9,.82)' : 'var(--nav-bg)',
        borderTop: `1px solid ${navDark ? 'rgba(255,255,255,.08)' : 'var(--line)'}`,
        backdropFilter: 'blur(20px)',
        // Hold-to-hide: slide the nav off-screen in immersive mode.
        transform: immersive ? 'translateY(100%)' : 'translateY(0)',
        opacity: immersive ? 0 : 1,
        pointerEvents: immersive ? 'none' : 'auto',
        transition: 'transform .3s cubic-bezier(.16,1,.3,1), opacity .25s ease',
      }}
    >
      <NavButton label="Home" color={col(tab === 'feed')} onClick={go('feed')}>
        <HomeIcon size={25} fill={tab === 'feed' ? accent : 'none'} stroke={col(tab === 'feed')} strokeWidth={2} />
      </NavButton>

      <NavButton label="Discover" color={col(tab === 'discover')} onClick={go('discover')}>
        <SearchIcon size={25} stroke={col(tab === 'discover')} strokeWidth={2} />
      </NavButton>

      <button onClick={() => setShowUpload(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginTop: -2, padding: 0 }}>
        <div style={{ width: 50, height: 36, borderRadius: 13, background: `linear-gradient(135deg,${accent},#e23a18)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px -4px rgba(226,58,24,.6)' }}>
          <NavPlusIcon size={24} stroke="#fff" strokeWidth={2.6} />
        </div>
      </button>

      <NavButton label="Saved" color={col(tab === 'saved')} onClick={go('saved')}>
        <BookmarkIcon size={25} fill={tab === 'saved' ? accent : 'none'} stroke={col(tab === 'saved')} strokeWidth={2} />
      </NavButton>

      <NavButton label="Profile" color={col(tab === 'profile')} onClick={go('profile')}>
        <PersonIcon size={25} stroke={col(tab === 'profile')} strokeWidth={2} />
      </NavButton>
    </div>
  );
}

function NavButton({ label, color, onClick, children }: { label: string; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 52, padding: 0 }}>
      {children}
      <span style={{ fontSize: 10.5, fontWeight: 700, color }}>{label}</span>
    </button>
  );
}
