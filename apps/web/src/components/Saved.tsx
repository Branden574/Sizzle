import { useState } from 'react';
import { useSavedFeed } from '../data/queries';
import { listOffline } from '../lib/offline';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import { useSizzle } from '../store';
import { CheckIcon, DownloadIcon } from './icons';

export function Saved() {
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const { data } = useSavedFeed();
  const online = useOnlineStatus();
  const [filter, setFilter] = useState<'all' | 'offline'>('all');

  // Offline, fall back to the locally cached (downloaded) recipes.
  const items = online ? data?.items ?? [] : listOffline();
  const savedCount = items.length;
  const downloadCount = items.filter((r) => r.viewer.downloaded).length;
  const shown = filter === 'offline' ? items.filter((r) => r.viewer.downloaded) : items;
  const savedEmpty = savedCount === 0;

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#faf3ea', overflowY: 'auto', animation: 'sz-fadeIn .35s' }}>
      <div style={{ padding: '62px 22px 8px' }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 38, color: '#1b1512' }}>Saved</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            onClick={() => setFilter('all')}
            style={{ padding: '9px 15px', borderRadius: 13, border: filter === 'all' ? 'none' : '1px solid #ece1d4', background: filter === 'all' ? '#1b1512' : '#fff', color: filter === 'all' ? '#fff' : '#5c5048', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            All {savedCount}
          </button>
          <button
            onClick={() => setFilter('offline')}
            style={{ padding: '9px 15px', borderRadius: 13, border: filter === 'offline' ? 'none' : '1px solid #ece1d4', background: filter === 'offline' ? '#1b1512' : '#fff', color: filter === 'offline' ? '#fff' : '#5c5048', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <DownloadIcon size={14} stroke={filter === 'offline' ? '#fff' : '#5c5048'} strokeWidth={2.2} />
            Offline {downloadCount}
          </button>
        </div>
      </div>

      {savedEmpty && (
        <div style={{ padding: '80px 40px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: '#1b1512' }}>Nothing saved yet</div>
          <p style={{ color: '#8a7c70', fontSize: 15, marginTop: 8 }}>Tap the bookmark on any recipe to keep it here.</p>
        </div>
      )}
      {!savedEmpty && shown.length === 0 && (
        <div style={{ padding: '60px 40px', textAlign: 'center', color: '#8a7c70', fontSize: 15 }}>No offline recipes yet — tap the download icon on a recipe.</div>
      )}

      <div style={{ padding: '16px 18px 110px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {shown.map((r) => (
          <button
            key={r.id}
            onClick={() => setOpenRecipe(r.id)}
            style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 20, overflow: 'hidden', position: 'relative', height: 200, background: r.bg, textAlign: 'left' }}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.72))' }} />
            {r.viewer.downloaded && (
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
        ))}
      </div>
    </div>
  );
}
