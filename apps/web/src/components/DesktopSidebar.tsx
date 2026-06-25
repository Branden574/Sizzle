import { useSizzle } from '../store';
import { theme } from '../theme';
import type { Tab } from '../types';
import { BookmarkIcon, HomeIcon, NavPlusIcon, PersonIcon, SearchIcon } from './icons';

const accent = theme.accent;

/**
 * Desktop-only left rail. On wide screens the app keeps its phone-width column
 * (vertical video doesn't want to stretch, and every sheet is sized to the
 * frame), and this sidebar provides primary navigation in place of the bottom
 * tab bar — the same pattern tiktok.com / instagram.com use on the web. It
 * drives the exact same store state as BottomNav.
 */
export function DesktopSidebar() {
  const tab = useSizzle((s) => s.tab);
  const setTab = useSizzle((s) => s.setTab);
  const setShowUpload = useSizzle((s) => s.setShowUpload);

  const items: { key: Tab; label: string; icon: (active: boolean) => React.ReactNode }[] = [
    { key: 'feed', label: 'Home', icon: (a) => <HomeIcon size={24} fill={a ? accent : 'none'} stroke={a ? accent : 'currentColor'} strokeWidth={2} /> },
    { key: 'discover', label: 'Discover', icon: (a) => <SearchIcon size={24} stroke={a ? accent : 'currentColor'} strokeWidth={2} /> },
    { key: 'saved', label: 'Saved', icon: (a) => <BookmarkIcon size={24} fill={a ? accent : 'none'} stroke={a ? accent : 'currentColor'} strokeWidth={2} /> },
    { key: 'profile', label: 'Profile', icon: (a) => <PersonIcon size={24} stroke={a ? accent : 'currentColor'} strokeWidth={2} /> },
  ];

  return (
    <nav
      style={{
        width: 232,
        flex: 'none',
        height: 'var(--app-h)',
        maxHeight: '100%',
        background: 'rgba(255,255,255,.045)',
        border: '1px solid rgba(255,255,255,.08)',
        borderRadius: 28,
        backdropFilter: 'blur(20px)',
        padding: '26px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        color: 'rgba(255,255,255,.62)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'Instrument Serif', serif", fontSize: 30, color: '#fff', padding: '0 12px 18px', letterSpacing: '.3px' }}>
        <img src="/brand/sizzle-mark-flat.svg" alt="" width={26} height={33} style={{ display: 'block' }} />
        Sizzle
      </div>

      {items.map((it) => {
        const active = tab === it.key;
        return (
          <button
            key={it.key}
            onClick={() => setTab(it.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              width: '100%',
              padding: '12px 14px',
              borderRadius: 14,
              border: 'none',
              cursor: 'pointer',
              background: active ? 'rgba(255,255,255,.08)' : 'transparent',
              color: active ? '#fff' : 'rgba(255,255,255,.62)',
              fontFamily: "'Hanken Grotesk'",
              fontSize: 16,
              fontWeight: 700,
              transition: 'background .15s ease, color .15s ease',
            }}
          >
            <span style={{ display: 'flex', width: 24, height: 24 }}>{it.icon(active)}</span>
            {it.label}
          </button>
        );
      })}

      <button
        onClick={() => setShowUpload(true)}
        style={{
          marginTop: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          width: '100%',
          padding: '13px 14px',
          borderRadius: 14,
          border: 'none',
          cursor: 'pointer',
          background: `linear-gradient(135deg, ${accent}, #e23a18)`,
          color: '#fff',
          fontFamily: "'Hanken Grotesk'",
          fontSize: 16,
          fontWeight: 700,
          boxShadow: '0 8px 20px -6px rgba(226,58,24,.6)',
        }}
      >
        <NavPlusIcon size={22} stroke="#fff" strokeWidth={2.6} />
        Post a recipe
      </button>

      <div style={{ flex: 1 }} />
      <div style={{ padding: '0 12px', fontSize: 12, color: 'rgba(255,255,255,.3)' }}>Sizzle · web</div>
    </nav>
  );
}
