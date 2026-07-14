import { useBootProgress } from '../lib/bootProgress';

/**
 * The single launch loading screen — dark, with the Sizzle wordmark and a real
 * progress bar + percentage that reflects how far the app is through booting.
 * Used for BOTH the auth-resolve wait and the first feed load so the two phases
 * read as one continuous load (and match the native launch screen + the
 * index.html boot splash, so there's no orange flash between them).
 */
export function LoadingScreen() {
  const p = useBootProgress();
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--bg, #0e0c0b)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, animation: 'sz-breathe 1.9s ease-in-out infinite' }}>
        <div
          style={{
            fontFamily: "'Instrument Serif',serif",
            fontSize: 52,
            lineHeight: 1,
            letterSpacing: '.5px',
            backgroundImage: 'linear-gradient(135deg, var(--accent, #ff5a1f), var(--saffron, #f4a52c))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Sizzle
        </div>
        <div style={{ fontSize: 11, letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--text-faint-2, rgba(150,140,130,.7))' }}>Watch it · Cook it</div>
      </div>
      <div style={{ width: 176, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
        <div style={{ width: '100%', height: 4, borderRadius: 3, background: 'var(--track, rgba(150,140,130,.2))', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${p}%`, borderRadius: 3, background: 'linear-gradient(90deg, var(--accent, #ff5a1f), var(--saffron, #f4a52c))', transition: 'width .2s ease-out' }} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint-2, rgba(150,140,130,.8))', fontVariantNumeric: 'tabular-nums' }}>{p}%</div>
      </div>
    </div>
  );
}

/** Brief launch screen shown while the initial session is resolved. */
export function Splash() {
  return <LoadingScreen />;
}
