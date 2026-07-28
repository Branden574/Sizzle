import { useEffect, useState, type ReactNode } from 'react';
import { Button, DismissBackdrop, SegmentedControl } from '../controls';
import { useSwipeDismiss } from '../../lib/useSwipeDismiss';
import { useAuth } from '../../auth/useAuth';
import { useSizzle, type FeedKindPref, type ThemePref, type UnitPref } from '../../store';
import { clearOffline } from '../../lib/offline';
import { apiGet, apiSend } from '../../lib/api';
import { queryClient, useBlockedList, useMe, useSubmitSupportTicket, useToggleBlock, useUpdateNotifPref, useUpdateProfile } from '../../data/queries';
import { enablePush, disablePush } from '../../lib/push';
import { clearBadge, syncBadge } from '../../lib/badge';
import { clearPasscode } from '../../lib/applock';
import { PasscodeSetup } from '../PasscodeLock';
import { showCreatorMoney } from '../../lib/native';
import { PlayIcon, SpeakerIcon } from '../icons';
import type { MeProfile } from '@sizzle/shared';
import { AvatarImg } from '../AvatarImg';

const APP_VERSION = __APP_VERSION__; // build-time (web / fallback)
const SUPPORT_EMAIL = 'support@getsizzle.app';

/**
 * Live version string: the OTA bundle version (what JS is actually running, via
 * Capgo) + the native app version and build number. Falls back to the build-time
 * version on web. Best-effort — never throws.
 */
async function resolveVersionLabel(): Promise<string> {
  let ota = '';
  let nativeVer = '';
  let build = '';
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    const cur = await CapacitorUpdater.current();
    const v = cur?.bundle?.version;
    // On the BUILTIN bundle the updater reports the native version ("1.0"), not
    // a JS bundle version — only trust x.y.z-shaped values, else fall back to
    // the build-time version baked into this JS.
    if (v && v !== 'builtin' && v.split('.').length >= 3) ota = v;
  } catch { /* web or plugin absent */ }
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    nativeVer = info?.version ?? '';
    build = info?.build ?? '';
  } catch { /* web */ }
  // e.g. "1.0.49 · v1.0 (23)"  (OTA bundle · App Store version (build))
  const otaPart = ota || APP_VERSION;
  const nativePart = nativeVer ? ` · v${nativeVer}${build ? ` (${build})` : ''}` : '';
  return `${otaPart}${nativePart}`;
}

/** 38px rounded icon tile that leads every row. */
function IconChip({ children, dim }: { children: ReactNode; dim?: boolean }) {
  return <div style={{ width: 38, height: 38, flex: 'none', borderRadius: 11, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.5 : 1 }}>{children}</div>;
}

/** A rounded card that groups related rows with hairline dividers between them. */
function Group({ children }: { children: ReactNode }) {
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }}>
      {items.map((child, i) => (
        <div key={i}>
          {i > 0 && <div style={{ height: 1, background: 'var(--line)', marginLeft: 67 }} />}
          {child}
        </div>
      ))}
    </div>
  );
}

function Chevron() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" style={{ flex: 'none' }}>
      <path d="M1 1l6 6-6 6" stroke="var(--text-faint-2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A flush toggle row inside a Group. */
function ToggleRow({ title, sub, icon, on, onToggle, dim }: { title: string; sub: string; icon: ReactNode; on: boolean; onToggle: () => void; dim?: boolean }) {
  return (
    <Button
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'transparent', border: 'none', borderRadius: 0, padding: '12px 16px', textAlign: 'left', width: '100%' }}
    >
      <IconChip dim={dim}>{icon}</IconChip>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
      </div>
      <div style={{ width: 48, height: 29, flex: 'none', borderRadius: 15, background: on ? 'var(--accent)' : 'var(--track)', position: 'relative', transition: 'background .25s' }}>
        <div style={{ position: 'absolute', top: 3, width: 23, height: 23, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .25s cubic-bezier(.34,1.56,.64,1)', left: on ? 22 : 3 }} />
      </div>
    </Button>
  );
}

/** A flush tappable row inside a Group (icon · label · optional hint · chevron). */
function LinkRow({ icon, label, hint, danger, onClick }: { icon: ReactNode; label: string; hint?: string; danger?: boolean; onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 16px', width: '100%', background: 'transparent', border: 'none', borderRadius: 0, textAlign: 'left' }}
    >
      <IconChip>{icon}</IconChip>
      <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: danger ? 'var(--button-danger-fg)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {hint && <span style={{ fontSize: 12.5, color: 'var(--text-faint)', flex: 'none', maxWidth: '42%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</span>}
      <Chevron />
    </Button>
  );
}

/** Compact identity header at the top of the sheet. */
function AccountHeader({ me }: { me: MeProfile }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 14, marginBottom: 4 }}>
      <div style={{ width: 52, height: 52, flex: 'none', borderRadius: '50%', background: me.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 22, color: '#fff', overflow: 'hidden' }}>
        {me.avatarUrl ? <AvatarImg src={me.avatarUrl} px={56} /> : me.init}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.name}</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-faint)' }}>@{me.handle}</div>
      </div>
    </div>
  );
}

const LEGAL_COPY: Record<'terms' | 'privacy', { title: string; body: string }> = {
  terms: {
    title: 'Terms of Service',
    body: 'Welcome to Sizzle. By using the app you agree to post only content you have the rights to share, to follow our community guidelines, and to use Sizzle lawfully. Recipes and videos you upload remain yours; you grant Sizzle a licence to display them in the app. We may remove content or suspend accounts that violate these terms. Sizzle is provided "as is" without warranties. The full Terms of Service at getsizzle.app/terms are the binding version.',
  },
  privacy: {
    title: 'Privacy Policy',
    body: 'Your privacy matters. Sizzle stores the account details you provide (name, handle, email, optional phone and links) and the content you create. We use this to operate the app — showing your recipes, ranking your feed, and powering follows and notifications. We do not sell your personal data. You can edit your profile or permanently delete your account and all its content at any time from Settings. The full Privacy Policy at getsizzle.app/privacy is the binding version.',
  },
};

/** The tap-in categories on the settings home. */
type SectionKey = 'appearance' | 'playback' | 'feed' | 'notifications' | 'privacy' | 'storage' | 'account' | 'about';
const SECTION_ORDER: SectionKey[] = ['appearance', 'playback', 'feed', 'notifications', 'privacy', 'storage', 'account', 'about'];
const SECTION_META: Record<SectionKey, { title: string; sub: string; icon: string }> = {
  appearance: { title: 'Appearance', sub: 'Theme, dark mode & motion', icon: '🎨' },
  playback: { title: 'Playback', sub: 'Autoplay, sound & data saver', icon: '▶️' },
  feed: { title: 'Recipes & feed', sub: 'Measurement units & your default feed', icon: '🍳' },
  notifications: { title: 'Notifications', sub: 'Choose which push alerts you get', icon: '🔔' },
  privacy: { title: 'Privacy & safety', sub: 'Private account, app lock & blocked accounts', icon: '🔐' },
  storage: { title: 'Storage', sub: 'Downloaded recipes & cache', icon: '💾' },
  account: { title: 'Account', sub: 'Password, your data & account deletion', icon: '👤' },
  about: { title: 'About', sub: 'Roadmap, legal & support', icon: 'ℹ️' },
};

/** X-style two-line menu row: title with its description underneath. */
function MenuRow({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', width: '100%', background: 'transparent', border: 'none', borderRadius: 0, textAlign: 'left' }}
    >
      <IconChip>{icon}</IconChip>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {/* whiteSpace:'normal' undoes `.sz-button`'s nowrap, which inherits down here
            and otherwise stops this two-line sub from ever wrapping. */}
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2, lineHeight: 1.35, whiteSpace: 'normal' }}>{sub}</div>
      </div>
      <Chevron />
    </Button>
  );
}

/** Small label above a control inside a section. */
function FieldLabel({ children, top }: { children: ReactNode; top?: number }) {
  return <div style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: `${top ?? 0}px 4px 6px` }}>{children}</div>;
}

export function AppSettingsSheet() {
  const open = useSizzle((s) => s.showAppSettings);
  const setOpen = useSizzle((s) => s.setShowAppSettings);
  const setShowCreator = useSizzle((s) => s.setShowCreator);
  const autoplay = useSizzle((s) => s.autoplay);
  const toggleAutoplay = useSizzle((s) => s.toggleAutoplay);
  const muted = useSizzle((s) => s.muted);
  const toggleMuted = useSizzle((s) => s.toggleMuted);
  const themePref = useSizzle((s) => s.theme);
  const setTheme = useSizzle((s) => s.setTheme);
  const reduceMotion = useSizzle((s) => s.reduceMotion);
  const setReduceMotion = useSizzle((s) => s.setReduceMotion);
  const defaultFeed = useSizzle((s) => s.defaultFeed);
  const setDefaultFeed = useSizzle((s) => s.setDefaultFeed);
  const units = useSizzle((s) => s.units);
  const setUnits = useSizzle((s) => s.setUnits);
  const dataSaver = useSizzle((s) => s.dataSaver);
  const setDataSaver = useSizzle((s) => s.setDataSaver);
  const signOut = useAuth((s) => s.signOut);
  const updatePassword = useAuth((s) => s.updatePassword);
  const setShowRoadmap = useSizzle((s) => s.setShowRoadmap);

  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [delStep, setDelStep] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delConfirm, setDelConfirm] = useState('');
  const [cacheCleared, setCacheCleared] = useState(false);
  const [versionLabel, setVersionLabel] = useState<string>(APP_VERSION);
  useEffect(() => { void resolveVersionLabel().then(setVersionLabel); }, []);
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);
  const [section, setSection] = useState<SectionKey | null>(null);
  // Help & feedback (in-app support ticket): report a problem or request a feature.
  const [fbOpen, setFbOpen] = useState(false);
  const [fbType, setFbType] = useState<'problem' | 'feature'>('problem');
  const [fbMsg, setFbMsg] = useState('');
  const [fbDone, setFbDone] = useState(false);
  const submitTicket = useSubmitSupportTicket();

  const me = useMe();
  const [pushLocal, setPushLocal] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const pushOn = pushLocal ?? me.data?.pushEnabled ?? true;
  const updatePref = useUpdateNotifPref();
  const updateProfile = useUpdateProfile();

  const togglePush = async () => {
    if (pushBusy) return;
    const next = !pushOn;
    setPushBusy(true);
    setPushLocal(next);
    try {
      await apiSend('POST', '/me/push-enabled', { enabled: next });
      // On a device, also (de)register this install's token. enablePush() prompts
      // for OS permission the first time; on the web build both are no-ops.
      if (next) await enablePush();
      else await disablePush();
      // Keep the app-icon badge honest with the switch: turning push off must
      // take the badge down with it (the OS badge permission survives, so a
      // stale count would otherwise sit on the icon), and turning it back on
      // restores the real count.
      if (next) void syncBadge();
      else await clearBadge();
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch {
      setPushLocal(!next); // revert on failure
    } finally {
      setPushBusy(false);
    }
  };

  // App-lock passcode (4 digits; replaced the biometric lock).
  const appLockEnabled = useSizzle((s) => s.appLockEnabled);
  const setAppLockEnabled = useSizzle((s) => s.setAppLockEnabled);
  const setAppUnlocked = useSizzle((s) => s.setAppUnlocked);
  // 'enable' = set a new passcode; 'disable'/'change' first verify the current one.
  const [passcodeFlow, setPasscodeFlow] = useState<null | 'enable' | 'disable' | 'change-verify' | 'change-set'>(null);

  const onPasscodeDone = async (ok: boolean) => {
    const flow = passcodeFlow;
    if (!ok) { setPasscodeFlow(null); return; }
    if (flow === 'enable') {
      setAppLockEnabled(true);
      setAppUnlocked(true); // don't lock the session that just set it up
      setPasscodeFlow(null);
    } else if (flow === 'disable') {
      await clearPasscode();
      setAppLockEnabled(false);
      setPasscodeFlow(null);
    } else if (flow === 'change-verify') {
      setPasscodeFlow('change-set'); // verified — now set the new code
    } else if (flow === 'change-set') {
      setAppUnlocked(true);
      setPasscodeFlow(null);
    } else {
      setPasscodeFlow(null);
    }
  };

  // All hooks must run before the early return below (Rules of Hooks).
  const [exportBusy, setExportBusy] = useState(false);
  const swipe = useSwipeDismiss(() => setOpen(false));
  if (!open) return null;
  const close = () => setOpen(false);

  const changePassword = async () => {
    if (pw.length < 10 || pwBusy) return;
    setPwBusy(true);
    setPwMsg(null);
    const ok = await updatePassword(pw);
    setPwBusy(false);
    if (ok) { setPwMsg('Password updated.'); setPw(''); setPwOpen(false); }
    else setPwMsg('Could not update password — try again.');
  };
  const exportData = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const data = await apiGet<unknown>('/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sizzle-data.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore — surfaced by the button re-enabling */
    } finally {
      setExportBusy(false);
    }
  };

  // Deleting is irreversible, so require the user to type the exact phrase
  // "Delete <their username>" — guards against an accidental double-tap. Falls
  // back to a fixed phrase so a failed profile fetch can never make account
  // deletion impossible (App Store 5.1.1(v) requires it to always work).
  const delPhrase = me.data?.handle ? `Delete ${me.data.handle}` : 'Delete my account';
  const delReady = delConfirm.trim() === delPhrase && !delBusy;

  const deleteAccount = async () => {
    if (!delReady) return;
    setDelBusy(true);
    try {
      await apiSend('DELETE', '/me');
      await signOut();
      close();
    } catch {
      setDelBusy(false);
    }
  };

  const notifRows = [
    { key: 'likes', title: 'Likes', sub: 'When someone likes your recipe', icon: '❤️' },
    { key: 'comments', title: 'Comments', sub: 'When someone comments on your recipe', icon: '💬' },
    { key: 'follows', title: 'New followers', sub: 'When someone follows you', icon: '👤' },
    { key: 'reposts', title: 'Reposts', sub: 'When someone reposts your recipe', icon: '🔁' },
    { key: 'messages', title: 'Messages', sub: 'When you get a direct message', icon: '✉️' },
    // Money surfaces stay web-only on native (Guideline 3.1.x hardening).
    ...(showCreatorMoney ? [{ key: 'tips' as const, title: 'Tips', sub: 'When someone tips you', icon: '💝' }] : []),
  ] as const;

  // Header + back-navigation: legal / blocked are opened from within a section,
  // so backing out of them returns to that section, and backing out of a section
  // returns to the top-level menu.
  const atSub = !!legal || showBlocked || section !== null;
  const headerTitle = legal ? LEGAL_COPY[legal].title : showBlocked ? 'Blocked accounts' : section ? SECTION_META[section].title : 'Settings';
  const headerSub = legal ? 'Sizzle' : showBlocked ? "People you've blocked" : section ? SECTION_META[section].sub : 'Preferences, privacy & account';
  const goBack = () => {
    if (legal) { setLegal(null); return; }
    if (showBlocked) { setShowBlocked(false); return; }
    // Leaving a section: disarm any half-open sub-flows so re-entering the
    // section never shows a stale password form or an armed delete confirm.
    setPwOpen(false); setPw(''); setPwMsg(null);
    setDelStep(false); setDelConfirm('');
    setFbOpen(false); setFbMsg(''); setFbDone(false);
    setSection(null);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 93 }}>
      <DismissBackdrop onDismiss={close} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 70, background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column', ...swipe.sheetStyle }}>
        <div {...swipe.handlers} style={{ textAlign: 'center', padding: '16px 0 6px', position: 'relative', flex: 'none', ...swipe.handlers.style }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          {atSub && (
            <Button onClick={goBack} aria-label="Back" style={{ position: 'absolute', left: 6, top: 12, width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 12, cursor: 'pointer', padding: 0, zIndex: 2 }}>
              <svg width="11" height="18" viewBox="0 0 11 18" fill="none"><path d="M9 1 2 9l7 8" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Button>
          )}
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{headerTitle}</div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 2 }}>{headerSub}</div>
        </div>

        {legal ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 22px 30px' }}>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-2)' }}>{LEGAL_COPY[legal].body}</p>
            <Button onClick={() => setLegal(null)} style={{ width: '100%', height: 50, marginTop: 18, border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Back</Button>
          </div>
        ) : showBlocked ? (
          <BlockedAccounts onBack={() => setShowBlocked(false)} />
        ) : section === null ? (
          /* ── Top-level category menu ─────────────────────────────────────── */
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 20px 30px' }}>
            {me.data && <AccountHeader me={me.data} />}
            <div style={{ height: 8 }} />
            <Group>
              <MenuRow
                icon={<span style={{ fontSize: 18 }}>⭐</span>}
                title="Creator Tools"
                sub={me.data?.creatorStatus === 'active' ? 'Your Creator dashboard & earnings' : me.data?.creatorStatus === 'eligible' ? "You're eligible — become a Creator" : 'Analytics, earning & eligibility'}
                onClick={() => { setShowCreator(true); close(); }}
              />
            </Group>
            <div style={{ height: 12 }} />
            <Group>
              {SECTION_ORDER.map((k) => (
                <MenuRow
                  key={k}
                  icon={<span style={{ fontSize: 18 }}>{SECTION_META[k].icon}</span>}
                  title={SECTION_META[k].title}
                  sub={SECTION_META[k].sub}
                  onClick={() => setSection(k)}
                />
              ))}
            </Group>

            <div style={{ height: 14 }} />
            <Button
              onClick={() => { void signOut(); close(); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52, border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', color: 'var(--accent)', fontFamily: "'Hanken Grotesk'", fontSize: 15.5, fontWeight: 700, cursor: 'pointer' }}
            >
              Log out
            </Button>
            <div style={{ textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 12.5, margin: '16px 0 14px' }}>Sizzle {versionLabel}</div>
            <Button variant="primary" size="lg" fullWidth onClick={close}>Done</Button>
          </div>
        ) : (
          /* ── Section detail ──────────────────────────────────────────────── */
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 30px' }}>
            {section === 'appearance' && (
              <>
                <FieldLabel>Theme</FieldLabel>
                <SegmentedControl<ThemePref>
                  label="Theme"
                  value={themePref}
                  onChange={setTheme}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                />
                <div style={{ height: 14 }} />
                <Group>
                  <ToggleRow
                    title="Reduce motion"
                    sub="Minimize animations and transitions"
                    icon={<span style={{ fontSize: 19 }}>🌀</span>}
                    on={reduceMotion}
                    onToggle={() => setReduceMotion(!reduceMotion)}
                  />
                </Group>
              </>
            )}

            {section === 'playback' && (
              <Group>
                <ToggleRow
                  title="Autoplay videos"
                  sub="Play recipes automatically as you scroll"
                  icon={<PlayIcon size={19} fill="var(--text-soft)" />}
                  on={autoplay}
                  onToggle={toggleAutoplay}
                />
                <ToggleRow
                  title="Start with sound"
                  sub="Unmute videos by default"
                  icon={<SpeakerIcon size={19} stroke="var(--text-soft)" />}
                  on={!muted}
                  onToggle={toggleMuted}
                />
                <ToggleRow
                  title="Data saver"
                  sub="Don't autoplay — tap a video to play"
                  icon={<span style={{ fontSize: 18 }}>📶</span>}
                  on={dataSaver}
                  onToggle={() => setDataSaver(!dataSaver)}
                />
              </Group>
            )}

            {section === 'feed' && (
              <>
                <FieldLabel>Measurement units</FieldLabel>
                <SegmentedControl<UnitPref>
                  label="Measurement units"
                  value={units}
                  onChange={setUnits}
                  options={[
                    { value: 'original', label: 'Original' },
                    { value: 'metric', label: 'Metric' },
                    { value: 'imperial', label: 'Imperial' },
                  ]}
                />
                <FieldLabel top={14}>Feed that opens first</FieldLabel>
                <SegmentedControl<FeedKindPref>
                  label="Default feed"
                  value={defaultFeed}
                  onChange={setDefaultFeed}
                  options={[
                    { value: 'foryou', label: 'For You' },
                    { value: 'following', label: 'Following' },
                  ]}
                />
              </>
            )}

            {section === 'notifications' && (
              <Group>
                <ToggleRow
                  title="Push notifications"
                  sub="The master switch for all push alerts"
                  icon={<span style={{ fontSize: 19 }}>🔔</span>}
                  on={pushOn}
                  onToggle={() => void togglePush()}
                />
                {pushOn && notifRows.map((row) => (
                  <ToggleRow
                    key={row.key}
                    title={row.title}
                    sub={row.sub}
                    icon={<span style={{ fontSize: 19 }}>{row.icon}</span>}
                    on={me.data?.notifPrefs?.[row.key] !== false}
                    onToggle={() => updatePref.mutate({ key: row.key, enabled: me.data?.notifPrefs?.[row.key] === false })}
                  />
                ))}
              </Group>
            )}

            {section === 'privacy' && (
              <Group>
                <ToggleRow
                  title="Private account"
                  sub={me.data?.private ? 'Only approved followers see your recipes' : 'Anyone can see your recipes and follow you'}
                  icon={<span style={{ fontSize: 19 }}>🔐</span>}
                  on={me.data?.private ?? false}
                  onToggle={() => updateProfile.mutate({ private: !(me.data?.private ?? false) })}
                />
                <ToggleRow
                  title="App lock passcode"
                  sub={appLockEnabled ? 'A 4-digit code is required to open Sizzle' : 'Require a 4-digit code to open Sizzle'}
                  icon={<span style={{ fontSize: 19 }}>🔒</span>}
                  on={appLockEnabled}
                  onToggle={() => setPasscodeFlow(appLockEnabled ? 'disable' : 'enable')}
                />
                {appLockEnabled && (
                  <LinkRow icon={<span style={{ fontSize: 18 }}>🔢</span>} label="Change passcode" onClick={() => setPasscodeFlow('change-verify')} />
                )}
                <LinkRow icon={<span style={{ fontSize: 18 }}>🚫</span>} label="Blocked accounts" hint="Manage list" onClick={() => setShowBlocked(true)} />
              </Group>
            )}

            {section === 'storage' && (
              <Group>
                <LinkRow icon={<span style={{ fontSize: 18 }}>💾</span>} label="Clear downloaded recipes" hint="Free up space" onClick={() => clearOffline()} />
                <LinkRow icon={<span style={{ fontSize: 18 }}>♻️</span>} label="Clear cache" hint={cacheCleared ? '✓ Cleared' : 'Reload fresh'} onClick={() => { queryClient.clear(); setCacheCleared(true); window.setTimeout(() => setCacheCleared(false), 1800); }} />
              </Group>
            )}

            {section === 'account' && (
              <>
                <Group>
                  {!pwOpen && <LinkRow icon={<span style={{ fontSize: 18 }}>🔑</span>} label="Change password" onClick={() => { setPwMsg(null); setPwOpen(true); }} />}
                  <LinkRow icon={<span style={{ fontSize: 18 }}>📦</span>} label={exportBusy ? 'Preparing…' : 'Download my data'} hint="JSON (GDPR)" onClick={() => void exportData()} />
                </Group>
                {pwOpen && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 14, marginTop: 10 }}>
                    <input
                      type="password"
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                      placeholder="New password (10+ characters)"
                      style={{ width: '100%', height: 46, border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--surface-2)', padding: '0 14px', fontFamily: "'Hanken Grotesk'", fontSize: 15, color: 'var(--text)', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <Button variant="outline" onClick={() => { setPwOpen(false); setPw(''); setPwMsg(null); }} style={{ flex: 1 }}>Cancel</Button>
                      <Button variant="primary" onClick={() => void changePassword()} disabled={pw.length < 10} loading={pwBusy} loadingLabel="Saving…" style={{ flex: 1 }}>Update</Button>
                    </div>
                  </div>
                )}
                {pwMsg && <div style={{ fontSize: 13, color: pwMsg.includes('updated') ? 'var(--button-success-fg)' : 'var(--button-danger-fg)', fontWeight: 600, margin: '8px 4px 0' }}>{pwMsg}</div>}

                <div style={{ height: 12 }} />
                {delStep ? (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--button-danger-fg)', borderRadius: 18, padding: 16 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--button-danger-fg)' }}>Delete your account?</div>
                    <div style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 10px' }}>This permanently removes your profile, recipes, and all your data. This can't be undone.</div>
                    <div style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 0 6px' }}>
                      To confirm, type <b style={{ color: 'var(--text)' }}>{delPhrase}</b>
                    </div>
                    <input
                      value={delConfirm}
                      onChange={(e) => setDelConfirm(e.target.value)}
                      placeholder={delPhrase}
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      style={{ width: '100%', height: 46, border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--surface-2)', padding: '0 14px', fontFamily: "'Hanken Grotesk'", fontSize: 15, color: 'var(--text)', outline: 'none', marginBottom: 10 }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button variant="outline" onClick={() => { setDelStep(false); setDelConfirm(''); }} style={{ flex: 1 }}>Cancel</Button>
                      <Button variant="danger" onClick={() => void deleteAccount()} disabled={!delReady} loading={delBusy} loadingLabel="Deleting…" style={{ flex: 1 }}>Delete everything</Button>
                    </div>
                  </div>
                ) : (
                  <Group>
                    <LinkRow icon={<span style={{ fontSize: 18 }}>🗑️</span>} label="Delete account" danger hint="Permanent" onClick={() => { setDelConfirm(''); setDelStep(true); }} />
                  </Group>
                )}
              </>
            )}

            {section === 'about' && (
              <>
                <Group>
                  {!fbOpen && <LinkRow icon={<span style={{ fontSize: 18 }}>💬</span>} label="Help & feedback" hint="Report or request" onClick={() => { setFbDone(false); setFbMsg(''); setFbOpen(true); }} />}
                  <LinkRow icon={<span style={{ fontSize: 18 }}>🚀</span>} label="Roadmap" hint="What's next" onClick={() => { setShowRoadmap(true); close(); }} />
                  <LinkRow icon={<span style={{ fontSize: 18 }}>📄</span>} label="Terms of Service" onClick={() => setLegal('terms')} />
                  <LinkRow icon={<span style={{ fontSize: 18 }}>🛡️</span>} label="Privacy Policy" onClick={() => setLegal('privacy')} />
                  <LinkRow icon={<span style={{ fontSize: 18 }}>✉️</span>} label="Email support" hint="support@getsizzle.app" onClick={() => { window.location.href = `mailto:${SUPPORT_EMAIL}`; }} />
                </Group>
                {fbOpen && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 14, marginTop: 10 }}>
                    {fbDone ? (
                      <>
                        <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--button-success-fg)' }}>Thanks — we got it.</div>
                        <div style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 12px' }}>We read every note and will follow up by email if we need more.</div>
                        <Button variant="outline" fullWidth onClick={() => { setFbOpen(false); setFbMsg(''); setFbDone(false); }}>Done</Button>
                      </>
                    ) : (
                      <>
                        <SegmentedControl<'problem' | 'feature'>
                          label="Feedback type"
                          value={fbType}
                          onChange={setFbType}
                          options={[
                            { value: 'problem', label: 'Report a problem' },
                            { value: 'feature', label: 'Request a feature' },
                          ]}
                        />
                        <textarea
                          value={fbMsg}
                          onChange={(e) => setFbMsg(e.target.value.slice(0, 5000))}
                          placeholder={fbType === 'problem' ? 'What went wrong? Steps to reproduce help a lot.' : "What would you love Sizzle to do?"}
                          rows={4}
                          style={{ width: '100%', marginTop: 10, border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--surface-2)', padding: '11px 14px', fontFamily: "'Hanken Grotesk'", fontSize: 15, color: 'var(--text)', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <Button variant="outline" onClick={() => { setFbOpen(false); setFbMsg(''); }} style={{ flex: 1 }}>Cancel</Button>
                          <Button
                            variant="primary"
                            disabled={fbMsg.trim().length === 0}
                            loading={submitTicket.isPending}
                            loadingLabel="Sending…"
                            onClick={() => submitTicket.mutate(
                              { type: fbType, message: fbMsg.trim() },
                              { onSuccess: () => setFbDone(true) },
                            )}
                            style={{ flex: 1 }}
                          >
                            Send
                          </Button>
                        </div>
                        {submitTicket.isError && (
                          <div style={{ fontSize: 12.5, color: 'var(--button-danger-fg)', marginTop: 8 }}>
                            Couldn't send — please email support@getsizzle.app.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            <div style={{ height: 20 }} />
            <Button variant="primary" size="lg" fullWidth onClick={close}>Done</Button>
          </div>
        )}
      </div>

      {passcodeFlow && (
        <PasscodeSetup
          mode={passcodeFlow === 'enable' || passcodeFlow === 'change-set' ? 'set' : 'verify'}
          title={passcodeFlow === 'change-set' ? 'Set your new passcode' : undefined}
          onDone={(ok) => void onPasscodeDone(ok)}
        />
      )}
    </div>
  );
}

/** Settings → Blocked accounts: the people you've blocked, each with an Unblock. */
function BlockedAccounts({ onBack }: { onBack: () => void }) {
  const { data: list, isLoading } = useBlockedList();
  const block = useToggleBlock();
  const blocked = list ?? [];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 22px 30px' }}>
      {isLoading ? (
        <div style={{ color: 'var(--text-faint-2)', fontSize: 14, padding: '20px 0' }}>Loading…</div>
      ) : blocked.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-faint)' }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>No blocked accounts</div>
          <p style={{ fontSize: 13.5, marginTop: 6 }}>Anyone you block from their profile shows up here.</p>
        </div>
      ) : (
        blocked.map((u) => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 12, marginBottom: 10 }}>
            <div style={{ width: 44, height: 44, flex: 'none', borderRadius: 13, background: u.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 17, color: '#fff', overflow: 'hidden' }}>
              {u.avatarUrl ? <AvatarImg src={u.avatarUrl} px={42} /> : u.init}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>@{u.handle}</div>
            </div>
            <Button
              onClick={() => block.mutate({ cookId: u.id, blocked: true })}
              style={{ flex: 'none', padding: '9px 16px', borderRadius: 12, border: '1.5px solid var(--line-2)', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
            >
              Unblock
            </Button>
          </div>
        ))
      )}
      <Button onClick={onBack} style={{ width: '100%', height: 50, marginTop: 8, border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Back</Button>
    </div>
  );
}
