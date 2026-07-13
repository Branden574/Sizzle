import type { ReactNode } from 'react';

/**
 * The device surface. On web it's the 393×852 mockup with bezel/shadow; on native
 * (`bare`) it fills the screen with no fake frame (the real device IS the frame).
 * Sized via the --app-w/--app-h CSS vars set on .sz-stage.
 */
export function Phone({ children, bare = false, desktop = false }: { children: ReactNode; bare?: boolean; desktop?: boolean }) {
  // bare = native (real device is the frame). desktop = a clean rounded app
  // panel (no skeuomorphic phone bezel) for the wide-screen desktop shell.
  const radius = bare ? 0 : desktop ? 34 : 54;
  const boxShadow = bare
    ? 'none'
    : desktop
      ? '0 30px 80px -24px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.06)'
      : '0 2px 0 2px #2c2521 inset, 0 40px 90px -20px rgba(0,0,0,.7), 0 0 0 12px #1c1714';
  return (
    <div
      className="sz-phone"
      style={{
        position: 'relative',
        width: 'var(--app-w)',
        height: 'var(--app-h)',
        borderRadius: radius,
        background: 'var(--bg)',
        boxShadow,
        overflow: 'hidden',
        flex: 'none',
      }}
    >
      {children}
    </div>
  );
}

/** Bottom home indicator pill. */
export function HomeIndicator({ color }: { color: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 9,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 130,
        height: 5,
        borderRadius: 3,
        background: color,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    />
  );
}
