import { useSizzle } from '../../store';
import { FlagIcon, GearIcon, RepostIcon } from '../icons';

/** Post "…" overflow menu: repost + report (everyone) + post controls (owner only). */
export function MoreSheet() {
  const moreFor = useSizzle((s) => s.moreFor);
  const isOwn = useSizzle((s) => s.moreIsOwn);
  const setMoreFor = useSizzle((s) => s.setMoreFor);
  const setReportFor = useSizzle((s) => s.setReportFor);
  const setRepostFor = useSizzle((s) => s.setRepostFor);
  const setSettingsFor = useSizzle((s) => s.setSettingsFor);

  if (!moreFor) return null;
  const close = () => setMoreFor(null);

  const rowStyle = { display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 16, cursor: 'pointer', textAlign: 'left' as const, width: '100%', marginBottom: 10 };
  const iconBox = { width: 42, height: 42, flex: 'none' as const, borderRadius: 13, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 92 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', paddingBottom: 30 }}>
        <div style={{ textAlign: 'center', padding: '16px 0 12px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
        </div>
        <div style={{ padding: '0 22px' }}>
          <button onClick={() => { setRepostFor(moreFor); setMoreFor(null); }} style={rowStyle}>
            <div style={iconBox}><RepostIcon size={20} stroke="var(--text)" /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>Repost</div>
              <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 2 }}>Share to friends who follow you back</div>
            </div>
          </button>
          {isOwn && (
            <button onClick={() => { setSettingsFor(moreFor); setMoreFor(null); }} style={rowStyle}>
              <div style={iconBox}><GearIcon size={20} stroke="var(--text-soft)" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>Post controls</div>
                <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 2 }}>Manage likes, comments &amp; counts</div>
              </div>
            </button>
          )}
          <button onClick={() => { setReportFor(moreFor); setMoreFor(null); }} style={rowStyle}>
            <div style={iconBox}><FlagIcon size={20} stroke="#d8521e" /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: '#d8521e' }}>Report post</div>
              <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 2 }}>Flag content that breaks the rules</div>
            </div>
          </button>
          <button onClick={close} style={{ width: '100%', height: 52, border: 'none', borderRadius: 16, background: 'var(--invert-bg)', color: 'var(--invert-fg)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
