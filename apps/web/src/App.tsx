import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Button } from './components/controls';
// Lazy — the authenticated app + admin console are never rendered for logged-out
// web visitors (who see the marketing site), so keep them out of the entry chunk.
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const AppShell = lazy(() => import('./components/AppShell').then((m) => ({ default: m.AppShell })));
const ButtonShowcase = lazy(() => import('./components/ButtonShowcase').then((m) => ({ default: m.ButtonShowcase })));
import { ChooseUsername } from './components/ChooseUsername';
import { BannedScreen } from './components/BannedScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
// Lazy — the landing pulls in GSAP/ScrollTrigger/Lenis (~195KB); only anon web
// visitors ever render it, so keep it out of the main app/native bundle.
const Marketing = lazy(() => import('./components/Marketing').then((m) => ({ default: m.Marketing })));
import { Onboarding } from './components/Onboarding';
import { HomeIndicator, Phone } from './components/Phone';
import { ResetPasswordScreen } from './components/ResetPasswordScreen';
import { Splash } from './components/Splash';
import { VideoViewer } from './components/VideoViewer';
import { AppSettingsSheet } from './components/sheets/AppSettingsSheet';
import { AnalyticsSheet } from './components/sheets/AnalyticsSheet';
import { TipSheet } from './components/sheets/TipSheet';
import { RoadmapSheet } from './components/sheets/RoadmapSheet';
import { CollectionPickerSheet } from './components/sheets/CollectionPickerSheet';
import { CollectionSheet } from './components/sheets/CollectionSheet';
import { CommentsSheet } from './components/sheets/CommentsSheet';
import { CookModeSheet } from './components/sheets/CookModeSheet';
import { CookSheet } from './components/sheets/CookSheet';
import { EditPostSheet } from './components/sheets/EditPostSheet';
import { EditProfileSheet } from './components/sheets/EditProfileSheet';
import { FollowListSheet } from './components/sheets/FollowListSheet';
import { HashtagSheet } from './components/sheets/HashtagSheet';
import { MoreSheet } from './components/sheets/MoreSheet';
import { NotificationsSheet } from './components/sheets/NotificationsSheet';
import { MessagesSheet } from './components/sheets/MessagesSheet';
import { SendToFriendSheet } from './components/sheets/SendToFriendSheet';
import { BoardSheet } from './components/sheets/BoardSheet';
import { SharePostCard } from './components/SharePostCard';
import { ThreadSheet } from './components/sheets/ThreadSheet';
import { RecipeSheet } from './components/sheets/RecipeSheet';
import { ReportSheet } from './components/sheets/ReportSheet';
import { RepostSheet } from './components/sheets/RepostSheet';
import { ShoppingListSheet } from './components/sheets/ShoppingListSheet';
import { SettingsSheet } from './components/sheets/SettingsSheet';
import { UploadSheet } from './components/sheets/UploadSheet';
import { CreateSheet } from './components/sheets/CreateSheet';
import { useAuth } from './auth/useAuth';
import { queryClient } from './data/queries';
import { apiSend } from './lib/api';
import { useOnlineStatus } from './lib/useOnlineStatus';
import { isNative } from './lib/native';
import { syncPushRegistration, disablePush } from './lib/push';
import { biometricAvailability, consumeBiometricPromptResume } from './lib/biometric';
import { BiometricLock } from './components/BiometricLock';
import { DesktopSidebar } from './components/DesktopSidebar';
import { useMediaQuery } from './lib/useMediaQuery';
import { parseBoardDeepLink, parseCookDeepLink, parseRecipeDeepLink } from './lib/share';
import { handleOAuthCallback } from './lib/nativeOAuth';
import { App as CapApp } from '@capacitor/app';
import { useSizzle } from './store';

/** Resolve the System/Light/Dark preference to a concrete scheme, tracking the
 *  OS setting live when on 'system'. */
function useResolvedScheme(): 'light' | 'dark' {
  const pref = useSizzle((s) => s.theme);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return pref === 'dark' || (pref === 'system' && systemDark) ? 'dark' : 'light';
}

/** Close the topmost open overlay — every sheet/modal is Zustand state, layered
 *  by z-index, so we close the deepest one first. Returns true if it closed one.
 *  Shared by the Android hardware Back button and the Escape key. */
function closeTopmostOverlay(): boolean {
  const s = useSizzle.getState();
  const overlays: Array<[unknown, () => void]> = [
    [s.tipFor, () => s.setTipFor(null)],
    [s.reportFor, () => s.setReportFor(null)],
    [s.moreFor, () => s.setMoreFor(null)],
    [s.repostFor, () => s.setRepostFor(null)],
    [s.collectionPickerFor, () => s.setCollectionPickerFor(null)],
    [s.cookFor, () => s.setCookFor(null)],
    [s.followList, () => s.setFollowList(null)],
    [s.editPostFor, () => s.setEditPostFor(null)],
    [s.showShopping, () => s.setShowShopping(false)],
    [s.commentsFor, () => s.setCommentsFor(null)],
    [s.settingsFor, () => s.setSettingsFor(null)],
    [s.openCollection, () => s.setOpenCollection(null)],
    [s.openTag, () => s.setOpenTag(null)],
    [s.sendRecipeFor, () => s.setSendRecipeFor(null)],
    [s.shareAfterPost, () => s.setShareAfterPost(null)],
    [s.openBoard, () => s.setOpenBoard(null)],
    [s.threadWith, () => s.setThreadWith(null)],
    [s.messagesOpen, () => s.setMessagesOpen(false)],
    [s.showNotifications, () => s.setShowNotifications(false)],
    [s.showAnalytics, () => s.setShowAnalytics(false)],
    [s.showRoadmap, () => s.setShowRoadmap(false)],
    [s.showAdmin, () => s.setShowAdmin(false)],
    [s.showEditProfile, () => s.setShowEditProfile(false)],
    [s.showAppSettings, () => s.setShowAppSettings(false)],
    [s.showCreate, () => s.setShowCreate(false)],
    [s.showUpload, () => s.setShowUpload(false)],
    [s.viewer, () => s.setViewer(null)],
    [s.openCook, () => s.setOpenCook(null)],
    [s.openRecipe, () => s.setOpenRecipe(null)],
  ];
  const hit = overlays.find(([open]) => !!open);
  if (hit) { hit[1](); return true; }
  return false;
}

export default function App() {
  const authStatus = useAuth((s) => s.status);
  const recovery = useAuth((s) => s.recovery);
  const banned = useAuth((s) => !!s.profile?.banned);
  // Social sign-ups land with an auto-derived handle — make them pick one before
  // the app shell (so onboarding isn't silently skipped).
  const needsUsername = useAuth((s) => !!s.profile?.needsUsername);
  const initAuth = useAuth((s) => s.init);
  const setMode = useAuth((s) => s.setMode);
  const setPhase = useSizzle((s) => s.setPhase);
  const setOnbStep = useSizzle((s) => s.setOnbStep);
  const resetToOnboarding = useSizzle((s) => s.resetToOnboarding);
  // Web only: show the marketing landing until a visitor enters the app (Get
  // started / Log in). Native users go straight into the app.
  const [webEntered, setWebEntered] = useState(false);

  // Decide the initial session once, then keep phase in sync with auth.
  useEffect(() => initAuth(), [initAuth]);
  useEffect(() => {
    // An account is required to use the app — only authed users reach the app shell.
    if (authStatus === 'authed') setPhase('app');
    else if (authStatus === 'anon' || authStatus === 'guest') {
      resetToOnboarding();
      setWebEntered(false); // back to the marketing site on sign-out
      // Wipe all cached user data (profile, saved/liked, DMs, notifications) so
      // the next account on a shared device never sees the previous user's data.
      queryClient.clear();
    }
  }, [authStatus, setPhase, resetToOnboarding]);

  const enterApp = (mode: 'signup' | 'login') => {
    setMode(mode);
    setOnbStep(mode === 'login' ? 3 : 1); // login → account step; signup → tastes
    setWebEntered(true);
  };

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

  // Native push: when signed in, silently refresh this device's FCM token if the
  // user already granted permission (the opt-in prompt lives in Settings). On
  // sign-out, drop the token so a logged-out device stops receiving pushes.
  useEffect(() => {
    if (authStatus === 'authed') void syncPushRegistration();
    else if (authStatus === 'anon' || authStatus === 'guest') void disablePush();
  }, [authStatus]);

  // ── Biometric app-lock (opt-in) ────────────────────────────────────────────
  const biometricLock = useSizzle((s) => s.biometricLock);
  const appUnlocked = useSizzle((s) => s.appUnlocked);
  const setAppUnlocked = useSizzle((s) => s.setAppUnlocked);
  const stashBiometricToken = useAuth((s) => s.stashBiometricToken);
  const restoreWithBiometric = useAuth((s) => s.restoreWithBiometric);
  const [bioLabel, setBioLabel] = useState('biometrics');
  const [bioRestoreTried, setBioRestoreTried] = useState(false);

  // Resolve the device's biometry label; fail OPEN if biometrics aren't usable
  // (e.g. disabled at the OS level) so the user is never trapped behind a lock
  // they can't pass.
  useEffect(() => {
    if (!isNative || !biometricLock) return;
    void biometricAvailability().then(({ available, label }) => {
      if (available) setBioLabel(label);
      else setAppUnlocked(true);
    });
  }, [biometricLock, setAppUnlocked]);

  // Re-lock when the app returns from the background (true app-lock behaviour).
  useEffect(() => {
    if (!isNative) return;
    const handle = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      // Consume the resume the biometric prompt itself fires (one-shot, no
      // wall clock — a timed cooldown looped on devices with slow event
      // delivery). Only a resume NOT caused by a prompt re-locks.
      const promptResume = consumeBiometricPromptResume();
      if (useSizzle.getState().biometricLock && !promptResume) setAppUnlocked(false);
    });
    return () => { void handle.then((l) => l.remove()); };
  }, [setAppUnlocked]);

  // ── Shareable deep links (/r/:id recipes, /u/:handle profiles) ─────────────
  // Open the shared content immediately if signed in; otherwise remember it and
  // open it once the user authenticates.
  const pendingRecipe = useRef<string | null>(null);
  const pendingCook = useRef<string | null>(null);
  const pendingBoard = useRef<string | null>(null);
  const openSharedRecipe = (id: string) => {
    if (useAuth.getState().status === 'authed') useSizzle.getState().setOpenRecipe(id);
    else pendingRecipe.current = id;
  };
  const openSharedCook = (handle: string) => {
    // The cooks API accepts a handle wherever an id goes; CookSheet re-reads ck.id.
    if (useAuth.getState().status === 'authed') useSizzle.getState().setOpenCook(handle);
    else pendingCook.current = handle;
  };
  const openSharedBoard = (id: string) => {
    if (useAuth.getState().status === 'authed') useSizzle.getState().setOpenBoard(id);
    else pendingBoard.current = id;
  };
  // Parse the URL the app booted with (web share links), then clean it.
  useEffect(() => {
    const path = window.location.pathname + window.location.search;
    const id = parseRecipeDeepLink(path);
    const cook = id ? null : parseCookDeepLink(path);
    const board = id || cook ? null : parseBoardDeepLink(path);
    if (!id && !cook && !board) return;
    window.history.replaceState(null, '', '/');
    if (id) openSharedRecipe(id);
    else if (cook) openSharedCook(cook);
    else if (board) openSharedBoard(board);
  }, []);
  // Native: links that launch/foreground the app (universal link / custom scheme).
  useEffect(() => {
    if (!isNative) return;
    const handle = CapApp.addListener('appUrlOpen', async ({ url }) => {
      // OAuth PKCE return (Google/Apple) — exchange the code, then stop.
      if (await handleOAuthCallback(url)) return;
      const id = parseRecipeDeepLink(url);
      if (id) { openSharedRecipe(id); return; }
      const cook = parseCookDeepLink(url);
      if (cook) { openSharedCook(cook); return; }
      const board = parseBoardDeepLink(url);
      if (board) openSharedBoard(board);
    });
    return () => { void handle.then((l) => l.remove()); };
  }, []);
  // Flush pending shared content once the user is authed.
  useEffect(() => {
    if (authStatus !== 'authed') return;
    if (pendingRecipe.current) {
      const id = pendingRecipe.current;
      pendingRecipe.current = null;
      useSizzle.getState().setOpenRecipe(id);
    }
    if (pendingCook.current) {
      const cook = pendingCook.current;
      pendingCook.current = null;
      useSizzle.getState().setOpenCook(cook);
    }
    if (pendingBoard.current) {
      const board = pendingBoard.current;
      pendingBoard.current = null;
      useSizzle.getState().setOpenBoard(board);
    }
  }, [authStatus]);

  // Android hardware/gesture Back: close the topmost open sheet/overlay instead of
  // exiting the app (every overlay is Zustand state with no WebView history to pop,
  // so the default back would background the app and lose the user's place). Only
  // quit from the root feed with nothing open; from another tab, go to the feed.
  useEffect(() => {
    if (!isNative) return;
    const handle = CapApp.addListener('backButton', () => {
      if (closeTopmostOverlay()) return;
      const s = useSizzle.getState();
      if (s.tab !== 'feed') { s.setTab('feed'); return; }
      void CapApp.exitApp();
    });
    return () => { void handle.then((l) => l.remove()); };
  }, []);

  // Desktop/web accessibility: Escape closes the topmost open sheet/modal (same
  // z-index order as the Android Back button), so keyboard users aren't trapped.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeTopmostOverlay()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Keep the keychain refresh token fresh while the lock is on, and re-lock for
  // the next sign-in once the user logs out.
  useEffect(() => {
    if (authStatus === 'authed') {
      if (isNative && biometricLock) void stashBiometricToken();
    } else if (authStatus === 'anon' || authStatus === 'guest') {
      setAppUnlocked(false);
    }
  }, [authStatus, biometricLock, stashBiometricToken, setAppUnlocked]);

  // Faster re-login: if the saved session is gone but the user enabled biometric
  // unlock, restore it from the keychain token instead of asking for a password.
  useEffect(() => {
    if (!isNative || bioRestoreTried || !biometricLock || authStatus !== 'anon') return;
    setBioRestoreTried(true);
    void restoreWithBiometric().then((ok) => { if (ok) setAppUnlocked(true); });
  }, [authStatus, biometricLock, bioRestoreTried, restoreWithBiometric, setAppUnlocked]);

  const phase = useSizzle((s) => s.phase);
  const tab = useSizzle((s) => s.tab);
  const openRecipe = useSizzle((s) => s.openRecipe);
  const viewer = useSizzle((s) => s.viewer);
  const openCook = useSizzle((s) => s.openCook);
  const commentsFor = useSizzle((s) => s.commentsFor);
  const settingsFor = useSizzle((s) => s.settingsFor);
  const showUpload = useSizzle((s) => s.showUpload);
  const showNotifications = useSizzle((s) => s.showNotifications);
  const messagesOpen = useSizzle((s) => s.messagesOpen);
  const sendRecipeFor = useSizzle((s) => s.sendRecipeFor);
  const openBoard = useSizzle((s) => s.openBoard);
  const shareAfterPost = useSizzle((s) => s.shareAfterPost);
  const threadWith = useSizzle((s) => s.threadWith);
  const showEditProfile = useSizzle((s) => s.showEditProfile);
  const showAppSettings = useSizzle((s) => s.showAppSettings);
  const showAnalytics = useSizzle((s) => s.showAnalytics);
  const tipFor = useSizzle((s) => s.tipFor);
  const showRoadmap = useSizzle((s) => s.showRoadmap);
  const showAdmin = useSizzle((s) => s.showAdmin);
  const moreFor = useSizzle((s) => s.moreFor);
  const reportFor = useSizzle((s) => s.reportFor);
  const repostFor = useSizzle((s) => s.repostFor);
  const editPostFor = useSizzle((s) => s.editPostFor);
  const cookFor = useSizzle((s) => s.cookFor);
  const showShopping = useSizzle((s) => s.showShopping);
  const collectionPickerFor = useSizzle((s) => s.collectionPickerFor);
  const openCollection = useSizzle((s) => s.openCollection);
  const openTag = useSizzle((s) => s.openTag);
  const followList = useSizzle((s) => s.followList);
  const reduceMotion = useSizzle((s) => s.reduceMotion);
  const scheme = useResolvedScheme();
  const isDark = scheme === 'dark';
  const online = useOnlineStatus();

  // Keep the mobile browser chrome in step with the frontmost surface: the feed is
  // always dark (full-bleed video), but every other tab follows the theme — so in
  // light mode the browser chrome must go light too, not stay near-black.
  useEffect(() => {
    const color = tab !== 'feed' && !isDark ? '#faf3ea' : '#0c0a09';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, [isDark, tab]);

  const isOnboarding = phase === 'onboarding';
  const isApp = phase === 'app';
  const showRecipe = !!openRecipe;
  const showCook = !!openCook;
  const showComments = !!commentsFor;
  const showSettings = !!settingsFor;

  // Status-bar tint + home-indicator color depend on what's frontmost.
  const overlay = showRecipe || showCook;
  let lightStatus: boolean;
  if (showUpload || cookFor) lightStatus = false;
  else if (recovery || overlay || showComments || showSettings || showNotifications || showEditProfile || showAppSettings || showRoadmap || showAdmin || showShopping || !!collectionPickerFor || !!openCollection || !!moreFor || !!reportFor || !!repostFor || !!openTag || !!followList) lightStatus = true;
  else if (isOnboarding) lightStatus = true;
  else lightStatus = tab !== 'feed';

  // On a light surface in light mode the status glyphs are dark ink; on the
  // (always-dark) feed, or anywhere in dark mode, they're light.
  const darkGlyphs = lightStatus && !isDark;
  const homeIndicator = darkGlyphs ? 'rgba(27,21,18,.22)' : 'rgba(255,255,255,.5)';

  // Wide-screen web: present the app as a desktop shell (left sidebar + the
  // phone-width app column) instead of a lone floating phone. Never on native.
  const isDesktop = useMediaQuery('(min-width: 1024px)') && !isNative;
  // Phone-sized web browser: render full-screen like native (no centered
  // mockup) so the bottom nav + every sheet fit on a real phone screen.
  const isMobileWeb = useMediaQuery('(max-width: 760px)') && !isNative;

  // Web front door: show the marketing site to logged-out visitors until they
  // choose Get started / Log in. Native + authed + password-recovery skip it.
  const showMarketing = !isNative && (authStatus === 'anon' || authStatus === 'guest') && !recovery && !webEntered;
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('showcase') === 'buttons') {
    return <Suspense fallback={null}><ButtonShowcase /></Suspense>;
  }
  if (showMarketing) {
    return (
      <div className="sz-stage marketing" data-theme={scheme}>
        <Suspense fallback={<div style={{ position: 'absolute', inset: 0, background: '#0f0b08' }} />}>
          <Marketing onGetStarted={() => enterApp('signup')} onLogin={() => enterApp('login')} />
        </Suspense>
      </div>
    );
  }

  return (
    <div className={`sz-stage${isNative ? ' native' : ''}${isMobileWeb ? ' fill' : ''}${isDesktop ? ' desktop' : ''}${reduceMotion ? ' sz-reduce-motion' : ''}`} data-theme={scheme}>
      {isDesktop && <DesktopSidebar />}
      <Phone bare={isNative || isMobileWeb} desktop={isDesktop}>
        {/* The fake "9:41" iOS status bar was web-mockup chrome — removed so the
            real app (web + native) doesn't show a fake clock/battery. */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {!online && (
            <div style={{ position: 'absolute', top: 54, left: '50%', transform: 'translateX(-50%)', zIndex: 55, background: 'rgba(27,21,18,.92)', color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 20, backdropFilter: 'blur(8px)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              You're offline · showing downloads
            </div>
          )}
          {authStatus === 'loading' && <Splash />}
          {authStatus !== 'loading' && isOnboarding && (
            <ErrorBoundary fallback={<CrashFallback />}>
              <Onboarding />
            </ErrorBoundary>
          )}
          {authStatus !== 'loading' && isApp && (
            <ErrorBoundary fallback={<CrashFallback />}>
              {needsUsername ? <ChooseUsername /> : <Suspense fallback={<Splash />}><AppShell /></Suspense>}
            </ErrorBoundary>
          )}

          {viewer && <VideoViewer />}
          {showRecipe && <RecipeSheet />}
          {showComments && <CommentsSheet />}
          {showSettings && <SettingsSheet />}
          {showCook && <CookSheet />}
          {showUpload && <UploadSheet />}
          <CreateSheet />
          {showNotifications && <NotificationsSheet />}
          {messagesOpen && <MessagesSheet />}
          {sendRecipeFor && <SendToFriendSheet />}
          {openBoard && <BoardSheet />}
          {shareAfterPost && <SharePostCard />}
          {threadWith && <ThreadSheet />}
          {showEditProfile && <EditProfileSheet />}
          {showAppSettings && <AppSettingsSheet />}
          {showAnalytics && <AnalyticsSheet />}
          {tipFor && <TipSheet />}
          {showRoadmap && <RoadmapSheet />}
          {moreFor && <MoreSheet />}
          {reportFor && <ReportSheet />}
          {repostFor && <RepostSheet />}
          {editPostFor && <EditPostSheet />}
          {followList && <FollowListSheet />}
          {openTag && <HashtagSheet />}
          {cookFor && <CookModeSheet />}
          {showShopping && <ShoppingListSheet />}
          {openCollection && <CollectionSheet />}
          {collectionPickerFor && <CollectionPickerSheet />}
          {showAdmin && <Suspense fallback={null}><AdminDashboard /></Suspense>}

          {recovery && <ResetPasswordScreen />}
          {banned && authStatus === 'authed' && <BannedScreen />}

          {isNative && biometricLock && authStatus === 'authed' && !appUnlocked && !recovery && (
            <BiometricLock label={bioLabel} onUnlock={() => setAppUnlocked(true)} />
          )}

          {!isNative && !isMobileWeb && <HomeIndicator color={homeIndicator} />}
        </div>
      </Phone>
    </div>
  );
}

function CrashFallback() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#faf3ea', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 30, textAlign: 'center' }}>
      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: '#1b1512' }}>Something went wrong</div>
      <p style={{ color: '#8a7c70', fontSize: 15, margin: '10px 0 22px' }}>Give it a refresh and you'll be right back.</p>
      <Button onClick={() => location.reload()} style={{ height: 50, padding: '0 26px', border: 'none', borderRadius: 16, background: '#1b1512', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Reload</Button>
    </div>
  );
}
