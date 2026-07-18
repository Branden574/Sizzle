import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CookProfile } from '@sizzle/shared';
import { useSizzle } from '../store';
import { useAuth } from '../auth/useAuth';
import { keys } from '../data/queries';
import { apiGet } from '../lib/api';
import { BottomNav } from './BottomNav';
import { Discover } from './Discover';
import { Feed } from './Feed';
import { Profile } from './Profile';
import { Saved } from './Saved';

/** The signed-in app: the active tab plus the persistent bottom nav. */
export function AppShell() {
  const tab = useSizzle((s) => s.tab);
  const qc = useQueryClient();
  const myId = useAuth((s) => s.user?.id ?? null);

  // Preload the signed-in user's own profile (+ post grid) in the background so the Profile tab
  // paints instantly the first time it's opened this session — Profile is only mounted while its
  // tab is active, so without this its /cooks/:id fetch wouldn't start until the tab is tapped.
  // Fire-and-forget, deduped with the tab's own useCook, and never blocks the feed.
  useEffect(() => {
    if (!myId || tab === 'profile') return;
    // staleTime so switching between non-profile tabs doesn't re-fetch — this only needs to warm
    // the cache once; the Profile tab's own query still background-refreshes on open.
    void qc.prefetchQuery({ queryKey: keys.cook(myId), queryFn: () => apiGet<CookProfile>(`/cooks/${myId}`), staleTime: 60_000 });
  }, [myId, tab, qc]);

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
