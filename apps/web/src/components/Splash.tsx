/** Brief launch screen shown while the initial session is resolved. */
export function Splash() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(130% 100% at 30% 10%, #ff8a4d 0%, #e23a18 45%, #7a1f0c 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, opacity: 0.12, background: 'repeating-linear-gradient(115deg,#000 0 2px, transparent 2px 7px)' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <img src="/brand/sizzle-mark-white.svg" alt="" width={66} height={82} style={{ display: 'block' }} />
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 56, color: '#fff', letterSpacing: '.5px' }}>Sizzle</div>
      </div>
    </div>
  );
}
