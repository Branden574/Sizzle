import { useSizzle } from '../../store';
import { theme } from '../../theme';
import { CameraIcon } from '../icons';

const accent = theme.accent;

export function UploadSheet() {
  const setShowUpload = useSizzle((s) => s.setShowUpload);
  const close = () => setShowUpload(false);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 90, background: '#0c0a09', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '56px 20px 14px' }}>
        <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 16, fontWeight: 600 }}>Cancel</button>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>New recipe</div>
        <div style={{ width: 48 }} />
      </div>
      <div style={{ flex: 1, margin: '6px 20px', borderRadius: 28, border: '2px dashed rgba(255,255,255,.2)', background: 'radial-gradient(120% 80% at 50% 20%, #2a201a, #100c0a)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <div style={{ width: 78, height: 78, borderRadius: '50%', background: `linear-gradient(135deg,${accent},#e23a18)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 30px -6px rgba(226,58,24,.6)' }}>
          <CameraIcon size={34} stroke="#fff" strokeWidth={1.8} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: '#fff' }}>Film your dish</div>
          <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 14, margin: '8px 24px 0', maxWidth: 260 }}>Record a 15–60s video, add steps and ingredients, and post to your followers.</p>
        </div>
      </div>
      <div style={{ padding: '16px 20px 36px', display: 'flex', gap: 12 }}>
        <button style={{ flex: 1, height: 56, border: '1.5px solid rgba(255,255,255,.2)', borderRadius: 17, background: 'none', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Upload</button>
        <button style={{ flex: 2, height: 56, border: 'none', borderRadius: 17, background: `linear-gradient(135deg,${accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff' }} />
          Record
        </button>
      </div>
    </div>
  );
}
