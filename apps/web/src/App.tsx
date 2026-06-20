import { useEffect, type CSSProperties } from 'react';
import { AppShell } from './components/AppShell';
import { Onboarding } from './components/Onboarding';
import { HomeIndicator, Phone } from './components/Phone';
import { Splash } from './components/Splash';
import { StatusBar } from './components/StatusBar';
import { CommentsSheet } from './components/sheets/CommentsSheet';
import { CookSheet } from './components/sheets/CookSheet';
import { RecipeSheet } from './components/sheets/RecipeSheet';
import { SettingsSheet } from './components/sheets/SettingsSheet';
import { UploadSheet } from './components/sheets/UploadSheet';
import { useAuth } from './auth/useAuth';
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

  const phase = useSizzle((s) => s.phase);
  const tab = useSizzle((s) => s.tab);
  const openRecipe = useSizzle((s) => s.openRecipe);
  const openCook = useSizzle((s) => s.openCook);
  const commentsFor = useSizzle((s) => s.commentsFor);
  const settingsFor = useSizzle((s) => s.settingsFor);
  const showUpload = useSizzle((s) => s.showUpload);

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
  else if (overlay || showComments || showSettings) lightStatus = true;
  else if (isOnboarding) lightStatus = true;
  else lightStatus = tab !== 'feed';

  const statusColor = lightStatus ? '#1b1512' : '#fff';
  const homeIndicator = lightStatus ? 'rgba(27,21,18,.22)' : 'rgba(255,255,255,.5)';

  return (
    <div className="sz-stage" style={stageVars}>
      <Phone>
        <StatusBar color={statusColor} />
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {authStatus === 'loading' && <Splash />}
          {authStatus !== 'loading' && isOnboarding && <Onboarding />}
          {authStatus !== 'loading' && isApp && <AppShell />}

          {showRecipe && <RecipeSheet />}
          {showComments && <CommentsSheet />}
          {showSettings && <SettingsSheet />}
          {showCook && <CookSheet />}
          {showUpload && <UploadSheet />}

          <HomeIndicator color={homeIndicator} />
        </div>
      </Phone>
    </div>
  );
}
