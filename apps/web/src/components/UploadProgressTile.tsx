import { useUploadTask } from '../lib/uploadTask';
import { Button } from './controls';
import { theme } from '../theme';

/**
 * TikTok-style upload tile: after Post the composer closes instantly and this
 * small card sits top-left over the feed showing the cover + live progress,
 * flips to ✓ when the post is live, or shows the REAL failure reason with
 * Retry/Dismiss (no more silent bar-vanish). Renders nothing when idle.
 */
export function UploadProgressTile() {
  const status = useUploadTask((s) => s.status);
  const progress = useUploadTask((s) => s.progress);
  const coverUrl = useUploadTask((s) => s.coverUrl);
  const error = useUploadTask((s) => s.error);
  const canRetry = useUploadTask((s) => !!s.job);
  const retry = useUploadTask((s) => s.retry);
  const dismiss = useUploadTask((s) => s.dismiss);

  if (status === 'idle') return null;

  const busy = status === 'uploading' || status === 'publishing';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 58px)',
        left: 12,
        zIndex: 80, // over the feed, under full-screen sheets (90+)
        display: 'flex',
        alignItems: 'stretch',
        gap: 10,
        maxWidth: status === 'error' ? 'min(86vw, 340px)' : 64,
        animation: 'sz-fadeIn .25s ease',
        transition: 'max-width .25s ease',
      }}
    >
      {/* Cover thumbnail with progress overlay */}
      <div style={{ position: 'relative', width: 64, height: 84, flex: 'none', borderRadius: 12, overflow: 'hidden', background: '#1c1917', boxShadow: '0 8px 24px -6px rgba(0,0,0,.55)', border: '1px solid rgba(255,255,255,.14)' }}>
        {coverUrl && <img src={coverUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        {/* scrim */}
        <div style={{ position: 'absolute', inset: 0, background: status === 'error' ? 'rgba(0,0,0,.55)' : 'linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.5))' }} />
        {busy && (
          <div style={{ position: 'absolute', left: 6, right: 6, bottom: 6 }}>
            <div style={{ color: '#fff', fontSize: 11.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', textShadow: '0 1px 4px rgba(0,0,0,.7)', marginBottom: 3 }}>
              {status === 'publishing' ? '…' : `${progress}%`}
            </div>
            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,.25)', overflow: 'hidden' }}>
              <div
                className={status === 'publishing' ? 'sz-upload-indeterminate' : undefined}
                style={{ height: '100%', width: status === 'publishing' ? '40%' : `${Math.max(progress, 3)}%`, borderRadius: 2, background: `linear-gradient(90deg, ${theme.accent}, #ffb52e)`, transition: 'width .25s ease' }}
              />
            </div>
          </div>
        )}
        {status === 'done' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(34,197,94,.5)' }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
            </div>
          </div>
        )}
        {status === 'error' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', fontSize: 26, fontWeight: 900 }}>!</div>
        )}
      </div>

      {/* Error panel: the real reason + Retry/Dismiss */}
      {status === 'error' && (
        <div style={{ flex: 1, minWidth: 0, borderRadius: 12, background: 'rgba(20,12,10,.96)', border: '1px solid rgba(248,113,113,.35)', boxShadow: '0 8px 24px -6px rgba(0,0,0,.55)', padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ color: '#fecaca', fontSize: 12.5, fontWeight: 600, lineHeight: 1.35 }}>{error ?? 'Upload failed.'}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {canRetry && (
              <Button onClick={retry} style={{ flex: 'none', padding: '6px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg,${theme.accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 12.5, fontWeight: 800 }}>
                Retry
              </Button>
            )}
            <Button onClick={dismiss} style={{ flex: 'none', padding: '6px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,.2)', cursor: 'pointer', background: 'transparent', color: 'rgba(255,255,255,.75)', fontFamily: "'Hanken Grotesk'", fontSize: 12.5, fontWeight: 700 }}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
