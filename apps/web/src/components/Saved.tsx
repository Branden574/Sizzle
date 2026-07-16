import { useState } from 'react';
import { Button, FilterChip } from './controls';
import { useCollections, useSavedFeed } from '../data/queries';
import { listOffline } from '../lib/offline';
import { useShopping } from '../lib/shopping';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import { useSizzle } from '../store';
import { CheckIcon, DownloadIcon } from './icons';
import { PosterImg } from './PosterImg';

export function Saved() {
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const setShowShopping = useSizzle((s) => s.setShowShopping);
  const setOpenCollection = useSizzle((s) => s.setOpenCollection);
  const shoppingCount = useShopping((s) => s.items.length);
  const { data: collections } = useCollections();
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
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', overflowY: 'auto', animation: 'sz-fadeIn .35s' }}>
      <div style={{ padding: '62px 22px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 38, color: 'var(--text)' }}>Saved</div>
          <Button
            onClick={() => setShowShopping(true)}
            variant="outline"
            size="sm"
          >
            🛒 List{shoppingCount > 0 ? ` · ${shoppingCount}` : ''}
          </Button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <FilterChip
            onClick={() => setFilter('all')}
            selected={filter === 'all'}
            count={savedCount}
          >
            All
          </FilterChip>
          <FilterChip
            onClick={() => setFilter('offline')}
            selected={filter === 'offline'}
            count={downloadCount}
          >
            <DownloadIcon size={14} stroke={filter === 'offline' ? 'var(--invert-fg)' : 'var(--text-muted)'} strokeWidth={2.2} />
            Offline
          </FilterChip>
        </div>
      </div>

      {(collections ?? []).length > 0 && (
        <div style={{ padding: '4px 0 4px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase', color: 'var(--text-faint-2)', padding: '0 22px 8px' }}>Collections</div>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 22px 4px' }}>
            {(collections ?? []).map((col) => (
              <Button
                key={col.id}
                onClick={() => setOpenCollection({ id: col.id, name: col.name })}
                style={{ flex: 'none', width: 124, border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 124, height: 92, borderRadius: 16, background: col.coverBg ?? 'var(--surface-2)', border: '1px solid var(--line)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, background: col.coverBg ? 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,.4))' : 'none' }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{col.count} recipe{col.count === 1 ? '' : 's'}</div>
              </Button>
            ))}
          </div>
        </div>
      )}

      {savedEmpty && (
        <div style={{ padding: '80px 40px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: 'var(--text)' }}>Nothing saved yet</div>
          <p style={{ color: 'var(--text-faint)', fontSize: 15, marginTop: 8 }}>Tap the bookmark on any recipe to keep it here.</p>
        </div>
      )}
      {!savedEmpty && shown.length === 0 && (
        <div style={{ padding: '60px 40px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 15 }}>No offline recipes yet — tap the download icon on a recipe.</div>
      )}

      <div style={{ padding: '16px 18px 110px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {shown.map((r) => (
          <Button
            key={r.id}
            onClick={() => setOpenRecipe(r.id)}
            style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 20, overflow: 'hidden', position: 'relative', height: 200, background: r.bg, textAlign: 'left' }}
          >
            {(r.images[0] || r.video?.posterUrl) && <PosterImg src={r.images[0] || r.video?.posterUrl || ''} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
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
          </Button>
        ))}
      </div>
    </div>
  );
}
