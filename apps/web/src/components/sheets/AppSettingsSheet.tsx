import type { ReactNode } from 'react';
import { useAuth } from '../../auth/useAuth';
import { useSizzle, type FeedKindPref, type ThemePref } from '../../store';
import { clearOffline } from '../../lib/offline';
import { PlayIcon, SpeakerIcon } from '../icons';

const APP_VERSION = '1.0.0';

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
  const signOut = useAuth((s) => s.signOut);

  if (!open) return null;
  const close = () => setOpen(false);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 93 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'var(--scrim)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 70, background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ textAlign: 'center', padding: '16px 0 6px', position: 'relative', flex: 'none' }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>Settings</div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 2 }}>Appearance, playback &amp; account</div>
        </div>

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
          <button
            onClick={() => { clearOffline(); }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', cursor: 'pointer', marginBottom: 10 }}
          >
            <span style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>Clear downloaded recipes</span>
            <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>Free up space</span>
          </button>

          <SectionLabel>Account</SectionLabel>
          <button
            onClick={() => { void signOut(); close(); }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52, border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', color: 'var(--accent)', fontFamily: "'Hanken Grotesk'", fontSize: 15.5, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}
          >
            Log out
          </button>

          <div style={{ textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 12.5, margin: '6px 0 14px' }}>Sizzle v{APP_VERSION}</div>

          <button onClick={close} style={{ width: '100%', height: 52, border: 'none', borderRadius: 16, background: 'var(--text)', color: 'var(--bg)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Done</button>
        </div>
      </div>
    </div>
  );
}
