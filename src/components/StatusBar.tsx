import { BatteryIcon, SignalIcon, WifiIcon } from './icons';

/** iOS-style status bar overlay (9:41, signal, wifi, battery). */
export function StatusBar({ color }: { color: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 52,
        zIndex: 60,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: '0 30px 8px',
        pointerEvents: 'none',
        color,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.3px', fontVariantNumeric: 'tabular-nums' }}>9:41</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <SignalIcon color="currentColor" />
        <WifiIcon color="currentColor" />
        <BatteryIcon color="currentColor" />
      </div>
    </div>
  );
}
