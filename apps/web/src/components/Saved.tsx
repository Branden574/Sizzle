import { useSavedFeed } from '../data/queries';
import { useSizzle } from '../store';
import { CheckIcon, DownloadIcon } from './icons';

export function Saved() {
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const downloads = useSizzle((s) => s.downloads);
  const { data } = useSavedFeed();

  const items = data?.items ?? [];
  const savedCount = items.length;
  // Offline/download is a Phase 3 feature; tracked locally for now.
  const downloadCount = items.filter((r) => downloads[r.id]).length;
  const savedEmpty = savedCount === 0;

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#faf3ea', overflowY: 'auto', animation: 'sz-fadeIn .35s' }}>
      <div style={{ padding: '62px 22px 8px' }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 38, color: '#1b1512' }}>Saved</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <div style={{ padding: '9px 15px', borderRadius: 13, background: '#1b1512', color: '#fff', fontSize: 14, fontWeight: 700 }}>All {savedCount}</div>
          <div style={{ padding: '9px 15px', borderRadius: 13, background: '#fff', border: '1px solid #ece1d4', color: '#5c5048', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <DownloadIcon size={14} stroke="#5c5048" strokeWidth={2.2} />
            Offline {downloadCount}
          </div>
        </div>
      </div>

      {savedEmpty && (
        <div style={{ padding: '80px 40px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: '#1b1512' }}>Nothing saved yet</div>
          <p style={{ color: '#8a7c70', fontSize: 15, marginTop: 8 }}>Tap the bookmark on any recipe to keep it here.</p>
        </div>
      )}

      <div style={{ padding: '16px 18px 110px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {items.map((r) => {
          const downloaded = !!downloads[r.id];
          return (
            <button
              key={r.id}
              onClick={() => setOpenRecipe(r.id)}
              style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 20, overflow: 'hidden', position: 'relative', height: 200, background: r.bg, textAlign: 'left' }}
            >
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.72))' }} />
              {downloaded && (
                <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)', padding: '5px 9px', borderRadius: 10 }}>
                  <CheckIcon size={13} stroke="#6ee29a" strokeWidth={2.6} />
                  <span style={{ color: '#6ee29a', fontSize: 11, fontWeight: 700 }}>Offline</span>
                </div>
              )}
              <div style={{ position: 'absolute', left: 13, right: 13, bottom: 12 }}>
                <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 11.5, fontWeight: 600 }}>{r.cuisine} · {r.time}</div>
                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20, lineHeight: 1.05, color: '#fff', marginTop: 3 }}>{r.title}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
