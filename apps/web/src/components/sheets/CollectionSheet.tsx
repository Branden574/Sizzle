import { useCollectionRecipes, useDeleteCollection } from '../../data/queries';
import { useSizzle } from '../../store';
import { ChevronLeftIcon } from '../icons';

export function CollectionSheet() {
  const openCollection = useSizzle((s) => s.openCollection);
  const setOpenCollection = useSizzle((s) => s.setOpenCollection);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const { data, isLoading } = useCollectionRecipes(openCollection?.id ?? null);
  const del = useDeleteCollection();

  if (!openCollection) return null;
  const close = () => setOpenCollection(null);
  const items = data?.items ?? [];

  const onDelete = () => {
    if (!confirm(`Delete the “${openCollection.name}” collection? The recipes stay saved.`)) return;
    del.mutate(openCollection.id, { onSuccess: close });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 86, background: 'var(--bg)', overflowY: 'auto', animation: 'sz-slideUp .35s cubic-bezier(.16,1,.3,1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '54px 16px 8px', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2 }}>
        <button onClick={close} style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ChevronLeftIcon size={22} stroke="var(--text)" strokeWidth={2.2} />
        </button>
        <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d8521e', fontSize: 14.5, fontWeight: 700 }}>Delete</button>
      </div>

      <div style={{ padding: '4px 22px 6px' }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 34, color: 'var(--text)' }}>{openCollection.name}</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-faint)', marginTop: 2 }}>{items.length} recipe{items.length === 1 ? '' : 's'}</div>
      </div>

      {!isLoading && items.length === 0 && (
        <div style={{ padding: '60px 40px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 15 }}>
          This collection is empty.<br />Open a recipe and tap “Save to collection”.
        </div>
      )}

      <div style={{ padding: '14px 18px 110px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {items.map((r) => (
          <button
            key={r.id}
            onClick={() => setOpenRecipe(r.id)}
            style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 20, overflow: 'hidden', position: 'relative', height: 200, background: r.bg, textAlign: 'left' }}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.72))' }} />
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
