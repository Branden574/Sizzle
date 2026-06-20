import { useSizzle } from '../store';
import { BottomNav } from './BottomNav';
import { Discover } from './Discover';
import { Feed } from './Feed';
import { Profile } from './Profile';
import { Saved } from './Saved';

/** The signed-in app: the active tab plus the persistent bottom nav. */
export function AppShell() {
  const tab = useSizzle((s) => s.tab);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {tab === 'feed' && <Feed />}
      {tab === 'discover' && <Discover />}
      {tab === 'saved' && <Saved />}
      {tab === 'profile' && <Profile />}
      <BottomNav />
    </div>
  );
}
