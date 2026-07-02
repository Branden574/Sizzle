import { useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '../../auth/useAuth';
import { useSizzle, type FeedKindPref, type ThemePref, type UnitPref } from '../../store';
import { clearOffline } from '../../lib/offline';
import { apiGet, apiSend } from '../../lib/api';
import { queryClient, useBlockedList, useMe, useToggleBlock, useUpdateNotifPref } from '../../data/queries';
import { enablePush, disablePush } from '../../lib/push';
import { biometricAvailability, biometricVerify, clearBiometricToken } from '../../lib/biometric';
import { isNative } from '../../lib/native';
import { PlayIcon, SpeakerIcon } from '../icons';

const APP_VERSION = '1.0.0';
const SUPPORT_EMAIL = 'support@sizzle.app';

function SectionLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--text-faint-2)', margin: '16px 2px 10px' }}>{children}</div>;
}

function ToggleRow({ title, sub, icon, on, onToggle }: { title: string; sub: string; icon: ReactNode; on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 16, cursor: 'pointer', textAlign: 'left', marginBottom: 10, width: '100%' }}
    >
      <div style={{ width: 42, height: 42, flex: 'none', borderRadius: 13, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ width: 50, height: 30, flex: 'none', borderRadius: 16, background: on ? 'var(--accent)' : 'var(--track)', position: 'relative', transition: 'background .25s' }}>
        <div style={{ position: 'absolute', top: 3, width: 24, height: 24, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .25s cubic-bezier(.34,1.56,.64,1)', left: on ? 23 : 3 }} />
      </div>
    </button>
  );
}

function RowButton({ label, hint, danger, onClick }: { label: string; hint?: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', cursor: 'pointer', marginBottom: 10 }}
    >
      <span style={{ fontSize: 15.5, fontWeight: 700, color: danger ? '#d8521e' : 'var(--text)' }}>{label}</span>
      {hint && <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>{hint}</span>}
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', gap: 5, padding: 5, borderRadius: 16, background: 'var(--surface-2)', border: '1px solid var(--line)', marginBottom: 10 }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'Hanken Grotesk'",
              fontSize: 14,
              fontWeight: 700,
              transition: 'all .2s ease',
              background: on ? 'var(--surface)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--text-faint)',
              boxShadow: on ? '0 2px 8px -4px rgba(0,0,0,.3)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const LEGAL_COPY: Record<'terms' | 'privacy', { title: string; body: string }> = {
  terms: {
    title: 'Terms of Service',
    body: 'Welcome to Sizzle. By using the app you agree to post only content you have the rights to share, to follow our community guidelines, and to use Sizzle lawfully. Recipes and videos you upload remain yours; you grant Sizzle a licence to display them in the app. We may remove content or suspend accounts that violate these terms. Sizzle is provided "as is" without warranties. These demo terms are a placeholder for a full legal agreement.',
  },
  privacy: {
    title: 'Privacy Policy',
    body: 'Your privacy matters. Sizzle stores the account details you provide (name, handle, email, optional phone and links) and the content you create. We use this to operate the app — showing your recipes, ranking your feed, and powering follows and notifications. We do not sell your personal data. You can edit your profile or permanently delete your account and all its content at any time from Settings. This demo policy is a placeholder for a full privacy statement.',
  },
};

export function AppSettingsSheet() {
  const open = useSizzle((s) => s.showAppSettings);
  const setOpen = useSizzle((s) => s.setShowAppSettings);
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
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);

  const me = useMe();
  const [pushLocal, setPushLocal] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const pushOn = pushLocal ?? me.data?.pushEnabled ?? true;
  const updatePref = useUpdateNotifPref();

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
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch {
      setPushLocal(!next); // revert on failure
    } finally {
      setPushBusy(false);
    }
  };

  // Biometric app-lock (native only).
  const biometricLock = useSizzle((s) => s.biometricLock);
  const setBiometricLock = useSizzle((s) => s.setBiometricLock);
  const setAppUnlocked = useSizzle((s) => s.setAppUnlocked);
  const stashBiometricToken = useAuth((s) => s.stashBiometricToken);
  const [bio, setBio] = useState<{ available: boolean; label: string }>({ available: false, label: 'biometrics' });
  const [bioBusy, setBioBusy] = useState(false);
  useEffect(() => { void biometricAvailability().then(setBio); }, []);

  const toggleBiometric = async () => {
    if (bioBusy || !bio.available) return;
    if (biometricLock) {
      setBiometricLock(false);
      await clearBiometricToken();
      return;
    }
    // Turning ON: require one successful biometric check first, then keep the
    // current session unlocked so we don't immediately lock the user out.
    setBioBusy(true);
    const ok = await biometricVerify(`Enable ${bio.label} unlock`);
    setBioBusy(false);
    if (!ok) return;
    setBiometricLock(true);
    setAppUnlocked(true);
    await stashBiometricToken();
  };

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

  const [exportBusy, setExportBusy] = useState(false);
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
  // "Delete <their username>" — guards against an accidental double-tap.
  const delPhrase = me.data?.handle ? `Delete ${me.data.handle}` : null;
  const delReady = !!delPhrase && delConfirm.trim() === delPhrase && !delBusy;

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

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 93 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'var(--scrim)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 70, background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ textAlign: 'center', padding: '16px 0 6px', position: 'relative', flex: 'none' }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{legal ? LEGAL_COPY[legal].title : showBlocked ? 'Blocked accounts' : 'Settings'}</div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 2 }}>{legal ? 'Sizzle' : showBlocked ? "People you've blocked" : 'Appearance, recipes, playback & account'}</div>
        </div>

        {legal ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 22px 30px' }}>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-2)' }}>{LEGAL_COPY[legal].body}</p>
            <button onClick={() => setLegal(null)} style={{ width: '100%', height: 50, marginTop: 18, border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Back to settings</button>
          </div>
        ) : showBlocked ? (
          <BlockedAccounts onBack={() => setShowBlocked(false)} />
        ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 22px 30px' }}>
          <SectionLabel>Appearance</SectionLabel>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 2px 8px' }}>Theme · System follows your device</div>
          <Segmented<ThemePref>
            value={themePref}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
          <ToggleRow
            title="Reduce motion"
            sub="Minimize animations and transitions"
            icon={<span style={{ fontSize: 20 }}>🌀</span>}
            on={reduceMotion}
            onToggle={() => setReduceMotion(!reduceMotion)}
          />

          <SectionLabel>Recipes</SectionLabel>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 2px 8px' }}>Measurement units · converts ingredient amounts</div>
          <Segmented<UnitPref>
            value={units}
            onChange={setUnits}
            options={[
              { value: 'original', label: 'Original' },
              { value: 'metric', label: 'Metric' },
              { value: 'imperial', label: 'Imperial' },
            ]}
          />

          <SectionLabel>Playback</SectionLabel>
          <ToggleRow
            title="Autoplay videos"
            sub="Play recipes automatically as you scroll"
            icon={<PlayIcon size={20} fill="var(--text-soft)" />}
            on={autoplay}
            onToggle={toggleAutoplay}
          />
          <ToggleRow
            title="Start with sound"
            sub="Unmute videos by default"
            icon={<SpeakerIcon size={20} stroke="var(--text-soft)" />}
            on={!muted}
            onToggle={toggleMuted}
          />
          <ToggleRow
            title="Data saver"
            sub="Don't autoplay — tap a video to play and save data"
            icon={<span style={{ fontSize: 19 }}>📶</span>}
            on={dataSaver}
            onToggle={() => setDataSaver(!dataSaver)}
          />

          <SectionLabel>Notifications</SectionLabel>
          <ToggleRow
            title="Push notifications"
            sub="The master switch for all push alerts"
            icon={<span style={{ fontSize: 20 }}>🔔</span>}
            on={pushOn}
            onToggle={() => void togglePush()}
          />
          {pushOn && ([
            { key: 'likes', title: 'Likes', sub: 'When someone likes your recipe', icon: '❤️' },
            { key: 'comments', title: 'Comments', sub: 'When someone comments on your recipe', icon: '💬' },
            { key: 'follows', title: 'New followers', sub: 'When someone follows you', icon: '👤' },
            { key: 'reposts', title: 'Reposts', sub: 'When someone reposts your recipe', icon: '🔁' },
            { key: 'messages', title: 'Messages', sub: 'When you get a direct message', icon: '✉️' },
            { key: 'tips', title: 'Tips', sub: 'When someone tips you', icon: '💝' },
          ] as const).map((row) => (
            <ToggleRow
              key={row.key}
              title={row.title}
              sub={row.sub}
              icon={<span style={{ fontSize: 20 }}>{row.icon}</span>}
              on={me.data?.notifPrefs?.[row.key] !== false}
              onToggle={() => updatePref.mutate({ key: row.key, enabled: me.data?.notifPrefs?.[row.key] === false })}
            />
          ))}

          <SectionLabel>Security</SectionLabel>
          <ToggleRow
            title={`Unlock with ${bio.available ? bio.label : 'Face ID / Touch ID'}`}
            sub={bio.available ? 'Require it each time you open Sizzle' : isNative ? 'Not set up on this device' : 'Available in the Sizzle app'}
            icon={<span style={{ fontSize: 20, opacity: bio.available ? 1 : 0.5 }}>🔒</span>}
            on={biometricLock}
            onToggle={() => void toggleBiometric()}
          />

          <SectionLabel>Feed</SectionLabel>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 2px 8px' }}>Which feed opens first</div>
          <Segmented<FeedKindPref>
            value={defaultFeed}
            onChange={setDefaultFeed}
            options={[
              { value: 'foryou', label: 'For You' },
              { value: 'following', label: 'Following' },
            ]}
          />

          <SectionLabel>Storage</SectionLabel>
          <RowButton label="Clear downloaded recipes" hint="Free up space" onClick={() => clearOffline()} />
          <RowButton label="Clear cache" hint={cacheCleared ? '✓ Cleared' : 'Reload fresh data'} onClick={() => { queryClient.clear(); setCacheCleared(true); window.setTimeout(() => setCacheCleared(false), 1800); }} />

          <SectionLabel>Privacy &amp; safety</SectionLabel>
          <RowButton label="Blocked accounts" hint="Manage who you've blocked" onClick={() => setShowBlocked(true)} />

          <SectionLabel>Account</SectionLabel>
          {pwOpen ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 14, marginBottom: 10 }}>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="New password (10+ characters)"
                style={{ width: '100%', height: 46, border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--surface-2)', padding: '0 14px', fontFamily: "'Hanken Grotesk'", fontSize: 15, color: 'var(--text)', outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => { setPwOpen(false); setPw(''); setPwMsg(null); }} style={{ flex: 1, height: 44, border: '1px solid var(--line-2)', borderRadius: 12, background: 'transparent', color: 'var(--text-faint)', fontWeight: 700, fontFamily: "'Hanken Grotesk'", fontSize: 14, cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => void changePassword()} disabled={pw.length < 10 || pwBusy} style={{ flex: 1, height: 44, border: 'none', borderRadius: 12, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontFamily: "'Hanken Grotesk'", fontSize: 14, cursor: pw.length >= 10 ? 'pointer' : 'default', opacity: pw.length >= 10 && !pwBusy ? 1 : 0.5 }}>{pwBusy ? 'Saving…' : 'Update'}</button>
              </div>
            </div>
          ) : (
            <RowButton label="Change password" hint="" onClick={() => { setPwMsg(null); setPwOpen(true); }} />
          )}
          {pwMsg && <div style={{ fontSize: 13, color: pwMsg.includes('updated') ? '#2c8a4a' : '#d8521e', fontWeight: 600, margin: '-4px 2px 10px' }}>{pwMsg}</div>}

          <RowButton label={exportBusy ? 'Preparing…' : 'Download my data'} hint="A JSON copy of your account (GDPR)" onClick={() => void exportData()} />

          <button
            onClick={() => { void signOut(); close(); }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52, border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', color: 'var(--accent)', fontFamily: "'Hanken Grotesk'", fontSize: 15.5, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}
          >
            Log out
          </button>

          {delStep ? (
            <div style={{ background: 'var(--surface)', border: '1px solid #f2c8bb', borderRadius: 18, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: '#d8521e' }}>Delete your account?</div>
              <div style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 10px' }}>This permanently removes your profile, recipes, and all your data. This can't be undone.</div>
              <div style={{ fontSize: 13, color: 'var(--text-faint)', margin: '0 0 6px' }}>
                To confirm, type <b style={{ color: 'var(--text)' }}>{delPhrase ?? 'Delete …'}</b>
              </div>
              <input
                value={delConfirm}
                onChange={(e) => setDelConfirm(e.target.value)}
                placeholder={delPhrase ?? 'Delete username'}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                style={{ width: '100%', height: 46, border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--surface-2)', padding: '0 14px', fontFamily: "'Hanken Grotesk'", fontSize: 15, color: 'var(--text)', outline: 'none', marginBottom: 10 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setDelStep(false); setDelConfirm(''); }} style={{ flex: 1, height: 46, border: '1px solid var(--line-2)', borderRadius: 12, background: 'transparent', color: 'var(--text)', fontWeight: 700, fontFamily: "'Hanken Grotesk'", fontSize: 14.5, cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => void deleteAccount()} disabled={!delReady} style={{ flex: 1, height: 46, border: 'none', borderRadius: 12, background: '#d8521e', color: '#fff', fontWeight: 700, fontFamily: "'Hanken Grotesk'", fontSize: 14.5, cursor: delReady ? 'pointer' : 'default', opacity: delReady ? 1 : 0.5 }}>{delBusy ? 'Deleting…' : 'Delete everything'}</button>
              </div>
            </div>
          ) : (
            <RowButton label="Delete account" danger hint="Permanent" onClick={() => { setDelConfirm(''); setDelStep(true); }} />
          )}

          <SectionLabel>About &amp; Legal</SectionLabel>
          <RowButton label="🚀 Roadmap" hint="What's next →" onClick={() => { setShowRoadmap(true); close(); }} />
          <RowButton label="Terms of Service" onClick={() => setLegal('terms')} />
          <RowButton label="Privacy Policy" onClick={() => setLegal('privacy')} />
          <RowButton label="Contact support" hint={SUPPORT_EMAIL} onClick={() => { window.location.href = `mailto:${SUPPORT_EMAIL}`; }} />

          <div style={{ textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 12.5, margin: '6px 0 14px' }}>Sizzle v{APP_VERSION}</div>

          <button onClick={close} style={{ width: '100%', height: 52, border: 'none', borderRadius: 16, background: 'var(--text)', color: 'var(--bg)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Done</button>
        </div>
        )}
      </div>
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
              {u.avatarUrl ? <img src={u.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : u.init}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>@{u.handle}</div>
            </div>
            <button
              onClick={() => block.mutate({ cookId: u.id, blocked: true })}
              style={{ flex: 'none', padding: '9px 16px', borderRadius: 12, border: '1.5px solid var(--line-2)', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
            >
              Unblock
            </button>
          </div>
        ))
      )}
      <button onClick={onBack} style={{ width: '100%', height: 50, marginTop: 8, border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Back to settings</button>
    </div>
  );
}
