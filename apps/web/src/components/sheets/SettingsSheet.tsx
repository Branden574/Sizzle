import type { ReactNode } from 'react';
import { useSizzle } from '../../store';
import { theme } from '../../theme';
import type { PostSettings } from '../../types';
import { SettingCommentIcon, SettingCountsIcon, SettingHeartIcon } from '../icons';

const accent = theme.accent;

interface RowDef {
  key: keyof PostSettings;
  title: string;
  sub: string;
  icon: ReactNode;
}

const ROWS: RowDef[] = [
  { key: 'likesOff', title: 'Like & dislike button', sub: 'Let people react to this recipe', icon: <SettingHeartIcon /> },
  { key: 'commentsOff', title: 'Commenting', sub: 'Allow people to comment', icon: <SettingCommentIcon /> },
  { key: 'hideCount', title: 'Show counts', sub: 'Display like and dislike totals', icon: <SettingCountsIcon /> },
];

export function SettingsSheet() {
  const settingsFor = useSizzle((s) => s.settingsFor);
  const postSettings = useSizzle((s) => s.postSettings);
  const togglePostSetting = useSizzle((s) => s.togglePostSetting);
  const setSettingsFor = useSizzle((s) => s.setSettingsFor);

  if (!settingsFor) return null;

  // Creator controls are local-only for now (not yet persisted server-side).
  const flags = postSettings[settingsFor] || {};
  const close = () => setSettingsFor(null);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 92 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#faf3ea', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', paddingBottom: 30 }}>
        <div style={{ textAlign: 'center', padding: '16px 0 6px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: '#d8cbbb' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1b1512', marginTop: 6 }}>Post controls</div>
          <div style={{ fontSize: 13, color: '#8a7c70', marginTop: 2 }}>Who can react &amp; comment</div>
        </div>

        <div style={{ padding: '12px 22px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ROWS.map((row) => {
            const on = !flags[row.key]; // ON = feature enabled (flag is false)
            return (
              <button
                key={row.key}
                onClick={() => togglePostSetting(settingsFor, row.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #ece1d4', borderRadius: 18, padding: 16, cursor: 'pointer', textAlign: 'left', marginBottom: 10 }}
              >
                <div style={{ width: 42, height: 42, flex: 'none', borderRadius: 13, background: '#f5ede2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{row.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700, color: '#1b1512' }}>{row.title}</div>
                  <div style={{ fontSize: 13, color: '#8a7c70', marginTop: 2 }}>{row.sub}</div>
                </div>
                <div style={{ width: 50, height: 30, flex: 'none', borderRadius: 16, background: on ? accent : '#d8cbbb', position: 'relative', transition: 'background .25s' }}>
                  <div style={{ position: 'absolute', top: 3, width: 24, height: 24, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .25s cubic-bezier(.34,1.56,.64,1)', left: on ? 23 : 3 }} />
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ padding: '6px 22px 0' }}>
          <button onClick={close} style={{ width: '100%', height: 52, border: 'none', borderRadius: 16, background: '#1b1512', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Done</button>
        </div>
      </div>
    </div>
  );
}
