import { useSizzle } from '../store';
import { Button, IconButton } from './controls';
import { theme } from '../theme';
import { useMediaQuery } from '../lib/useMediaQuery';
import { isNative } from '../lib/native';
import { useUnreadMessages } from '../data/queries';
import type { Tab } from '../types';
import { HomeIcon, NavPlusIcon, PersonIcon, SearchIcon, ShareIcon } from './icons';

const accent = theme.accent;

export function BottomNav() {
  const tab = useSizzle((s) => s.tab);
  const setTab = useSizzle((s) => s.setTab);
  const setShowUpload = useSizzle((s) => s.setShowUpload);
  const setMessagesOpen = useSizzle((s) => s.setMessagesOpen);
  const dmUnread = useUnreadMessages().data?.count ?? 0;
  const immersive = useSizzle((s) => s.immersive);
  // On the wide-screen desktop shell the left sidebar replaces the tab bar.
  const isDesktop = useMediaQuery('(min-width: 1024px)') && !isNative;
  if (isDesktop) return null;

  const navDark = tab === 'feed';
  // Light-mode idle uses --text-muted (~7:1) not --text-faint-2 (~3.7:1): the 10px
  // nav labels are small text and must clear WCAG AA 4.5:1.
  const navIdle = navDark ? 'rgba(255,255,255,.6)' : 'var(--text-muted)';
  const col = (active: boolean) => (active ? accent : navIdle);

  const go = (t: Tab) => () => setTab(t);

  return (
    <nav
      aria-label="Primary navigation"
      className="sz-bottom-nav"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        // 64px of tab-row content + room below it: 24px on web (no inset →
        // exactly the original 88px), or the real safe-area inset on native so
        // the row clears the home indicator WITHOUT inflating the whole bar
        // (88+34 = 122px buried the video scrubber and read as oversized).
        height: 'calc(64px + max(var(--sab, 0px), 24px))',
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
      <NavButton label="Home" active={tab === 'feed'} color={col(tab === 'feed')} onClick={go('feed')}>
        <HomeIcon size={25} fill={tab === 'feed' ? accent : 'none'} stroke={col(tab === 'feed')} strokeWidth={2} />
      </NavButton>

      <NavButton label="Discover" active={tab === 'discover'} color={col(tab === 'discover')} onClick={go('discover')}>
        <SearchIcon size={25} stroke={col(tab === 'discover')} strokeWidth={2} />
      </NavButton>

      <IconButton label="Create post" variant="primary" shape="square" size="md" className="sz-nav-create" onClick={() => setShowUpload(true)}>
        <NavPlusIcon size={24} stroke="#fff" strokeWidth={2.6} />
      </IconButton>

      <NavButton label="Messages" color={navIdle} onClick={() => setMessagesOpen(true)} badge={dmUnread > 0}>
        <ShareIcon size={23} stroke={navIdle} strokeWidth={1.9} />
      </NavButton>

      <NavButton label="Profile" active={tab === 'profile'} color={col(tab === 'profile')} onClick={go('profile')}>
        <PersonIcon size={23} stroke={col(tab === 'profile')} strokeWidth={2} />
      </NavButton>
    </nav>
  );
}

function NavButton({ label, color, active = false, onClick, badge, children }: { label: string; color: string; active?: boolean; onClick: () => void; badge?: boolean; children: React.ReactNode }) {
  return (
    <Button aria-current={active ? 'page' : undefined} aria-label={label} onClick={onClick} className="sz-nav-tab" style={{ color }}>
      <span style={{ position: 'relative', display: 'flex' }}>
        {children}
        {badge && <span style={{ position: 'absolute', top: -3, right: -4, width: 8, height: 8, borderRadius: '50%', background: accent }} />}
      </span>
      <span className="sz-nav-tab__label">{label}</span>
    </Button>
  );
}
