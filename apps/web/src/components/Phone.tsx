import type { ReactNode } from 'react';
import { theme } from '../theme';

/** The 393×852 device frame with bezel, inset highlight and drop shadow. */
export function Phone({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'relative',
        width: theme.phoneW,
        height: theme.phoneH,
        borderRadius: 54,
        background: '#0c0a09',
        boxShadow: '0 2px 0 2px #2c2521 inset, 0 40px 90px -20px rgba(0,0,0,.7), 0 0 0 12px #1c1714',
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
