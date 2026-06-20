import { useEffect, type CSSProperties } from 'react';
import { AppShell } from './components/AppShell';
import { Onboarding } from './components/Onboarding';
import { HomeIndicator, Phone } from './components/Phone';
import { Splash } from './components/Splash';
import { StatusBar } from './components/StatusBar';
import { CommentsSheet } from './components/sheets/CommentsSheet';
import { CookSheet } from './components/sheets/CookSheet';
import { EditProfileSheet } from './components/sheets/EditProfileSheet';
import { NotificationsSheet } from './components/sheets/NotificationsSheet';
import { RecipeSheet } from './components/sheets/RecipeSheet';
import { SettingsSheet } from './components/sheets/SettingsSheet';
import { UploadSheet } from './components/sheets/UploadSheet';
import { useAuth } from './auth/useAuth';
import { queryClient } from './data/queries';
import { apiSend } from './lib/api';
import { useOnlineStatus } from './lib/useOnlineStatus';
import { useSizzle } from './store';
import { theme } from './theme';

const stageVars = { '--accent': theme.accent, '--saffron': theme.saffron } as CSSProperties;

export default function App() {
  const authStatus = useAuth((s) => s.status);
  const initAuth = useAuth((s) => s.init);
  const setPhase = useSizzle((s) => s.setPhase);
  const resetToOnboarding = useSizzle((s) => s.resetToOnboarding);

  // Decide the initial session once, then keep phase in sync with auth.
  useEffect(() => initAuth(), [initAuth]);
  useEffect(() => {
    if (authStatus === 'authed' || authStatus === 'guest') setPhase('app');
    else if (authStatus === 'anon') resetToOnboarding();
  }, [authStatus, setPhase, resetToOnboarding]);

  // On first auth, replay onboarding choices: persist taste picks and follow
  // the cooks selected during onboarding (real cook ids from /cooks/suggested).
  useEffect(() => {
    if (authStatus !== 'authed') return;
    const { tastes, followed } = useSizzle.getState();
    const picked = Object.entries(tastes).filter(([, v]) => v).map(([k]) => k);
    const cookIds = Object.entries(followed).filter(([, v]) => v).map(([k]) => k);
    if (!picked.length && !cookIds.length) return;
    void (async () => {
      if (picked.length) await apiSend('POST', '/me/tastes', { tastes: picked }).catch(() => {});
      await Promise.all(cookIds.map((id) => apiSend('POST', `/cooks/${id}/follow`).catch(() => {})));
      // reflect the new taste boost + follows in the feed/profile
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    })();
  }, [authStatus]);

  const phase = useSizzle((s) => s.phase);
  const tab = useSizzle((s) => s.tab);
  const openRecipe = useSizzle((s) => s.openRecipe);
  const openCook = useSizzle((s) => s.openCook);
  const commentsFor = useSizzle((s) => s.commentsFor);
  const settingsFor = useSizzle((s) => s.settingsFor);
  const showUpload = useSizzle((s) => s.showUpload);
  const showNotifications = useSizzle((s) => s.showNotifications);
  const showEditProfile = useSizzle((s) => s.showEditProfile);
  const online = useOnlineStatus();

  const isOnboarding = phase === 'onboarding';
  const isApp = phase === 'app';
  const showRecipe = !!openRecipe;
  const showCook = !!openCook;
  const showComments = !!commentsFor;
  const showSettings = !!settingsFor;

  // Status-bar tint + home-indicator color depend on what's frontmost.
  const overlay = showRecipe || showCook;
  let lightStatus: boolean;
  if (showUpload) lightStatus = false;
  else if (overlay || showComments || showSettings || showNotifications || showEditProfile) lightStatus = true;
  else if (isOnboarding) lightStatus = true;
  else lightStatus = tab !== 'feed';

  const statusColor = lightStatus ? '#1b1512' : '#fff';
  const homeIndicator = lightStatus ? 'rgba(27,21,18,.22)' : 'rgba(255,255,255,.5)';

  return (
    <div className="sz-stage" style={stageVars}>
      <Phone>
        <StatusBar color={statusColor} />
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {!online && (
            <div style={{ position: 'absolute', top: 54, left: '50%', transform: 'translateX(-50%)', zIndex: 55, background: 'rgba(27,21,18,.92)', color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 20, backdropFilter: 'blur(8px)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              You're offline · showing downloads
            </div>
          )}
          {authStatus === 'loading' && <Splash />}
          {authStatus !== 'loading' && isOnboarding && <Onboarding />}
          {authStatus !== 'loading' && isApp && <AppShell />}

          {showRecipe && <RecipeSheet />}
          {showComments && <CommentsSheet />}
          {showSettings && <SettingsSheet />}
          {showCook && <CookSheet />}
          {showUpload && <UploadSheet />}
          {showNotifications && <NotificationsSheet />}
          {showEditProfile && <EditProfileSheet />}

          <HomeIndicator color={homeIndicator} />
        </div>
      </Phone>
    </div>
  );
}
