import { useCollections, useCollectionRecipes, useDeleteCollection, useRenameCollection, useSetCollectionPublic, useToggleCollectionRecipe } from '../../data/queries';
import { boardShareUrl, nativeShare } from '../../lib/share';
import { Button } from '../controls';
import { useSizzle } from '../../store';
import { ChevronLeftIcon } from '../icons';
import { PosterImg } from '../PosterImg';

export function CollectionSheet() {
  const openCollection = useSizzle((s) => s.openCollection);
  const setOpenCollection = useSizzle((s) => s.setOpenCollection);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const { data, isLoading } = useCollectionRecipes(openCollection?.id ?? null);
  const del = useDeleteCollection();
  const rename = useRenameCollection();
  const removeRecipe = useToggleCollectionRecipe();
  const setPublic = useSetCollectionPublic();
  const { data: allCollections } = useCollections();
  const isPublic = allCollections?.find((col) => col.id === openCollection?.id)?.isPublic ?? false;

  if (!openCollection) return null;
  const close = () => setOpenCollection(null);
  const items = data?.items ?? [];

  const onDelete = () => {
    if (!confirm(`Delete the “${openCollection.name}” collection? The recipes stay saved.`)) return;
    del.mutate(openCollection.id, { onSuccess: close });
  };

  const onRename = () => {
    const next = prompt('Rename collection', openCollection.name)?.trim();
    if (!next || next === openCollection.name) return;
    rename.mutate({ id: openCollection.id, name: next }, {
      onSuccess: () => setOpenCollection({ ...openCollection, name: next }),
    });
  };

  const onRemove = (recipeId: string) => {
    removeRecipe.mutate({ collectionId: openCollection.id, recipeId, inCollection: true });
  };

  const onShareBoard = () => {
    const url = boardShareUrl(openCollection.id);
    void nativeShare({ title: `${openCollection.name} · Sizzle`, url }).then((r) => {
      if (r === 'unavailable') void navigator.clipboard?.writeText(url).catch(() => {});
    });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 86, background: 'var(--bg)', overflowY: 'auto', animation: 'sz-slideUp .35s cubic-bezier(.16,1,.3,1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '54px 16px 8px', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2 }}>
        <Button onClick={close} aria-label="Back" style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ChevronLeftIcon size={22} stroke="var(--text)" strokeWidth={2.2} />
        </Button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button onClick={onRename} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 14.5, fontWeight: 700 }}>Rename</Button>
          <Button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d8521e', fontSize: 14.5, fontWeight: 700 }}>Delete</Button>
        </div>
      </div>

      <div style={{ padding: '4px 22px 6px' }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 34, color: 'var(--text)' }}>{openCollection.name}</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-faint)', marginTop: 2 }}>{items.length} recipe{items.length === 1 ? '' : 's'}</div>

        {/* Public board: shareable at /b/:id — Pinterest's core loop. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '10px 14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>{isPublic ? '🌍 Public board' : '🔒 Private collection'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 1 }}>{isPublic ? 'Anyone with the link can browse it' : 'Only you can see this'}</div>
          </div>
          {isPublic && (
            <Button onClick={onShareBoard} style={{ flex: 'none', border: 'none', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text)', padding: '8px 13px', fontFamily: "'Hanken Grotesk'", fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>Share</Button>
          )}
          <Button
            onClick={() => { if (!setPublic.isPending) setPublic.mutate({ id: openCollection.id, isPublic: !isPublic }); }}
            aria-pressed={isPublic}
            style={{ flex: 'none', border: 'none', borderRadius: 999, background: isPublic ? 'var(--accent,#ff5a36)' : 'var(--surface-2)', color: isPublic ? '#fff' : 'var(--text)', padding: '8px 15px', fontFamily: "'Hanken Grotesk'", fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
          >
            {isPublic ? 'Make private' : 'Make public'}
          </Button>
        </div>
      </div>

      {!isLoading && items.length === 0 && (
        <div style={{ padding: '60px 40px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 15 }}>
          This collection is empty.<br />Open a recipe and tap “Save to collection”.
        </div>
      )}

      <div style={{ padding: '14px 18px 110px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {items.map((r) => (
          <div key={r.id} style={{ position: 'relative' }}>
            <Button
              onClick={() => setOpenRecipe(r.id)}
              style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 20, overflow: 'hidden', position: 'relative', height: 200, width: '100%', background: r.bg, textAlign: 'left', display: 'block' }}
            >
              {(r.images[0] || r.video?.posterUrl) && <PosterImg src={r.images[0] || r.video?.posterUrl || ''} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,.72))' }} />
              <div style={{ position: 'absolute', left: 13, right: 13, bottom: 12 }}>
                <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 11.5, fontWeight: 600 }}>{r.cuisine} · {r.time}</div>
                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20, lineHeight: 1.05, color: '#fff', marginTop: 3 }}>{r.title}</div>
              </div>
            </Button>
            <Button
              onClick={() => onRemove(r.id)}
              aria-label={`Remove ${r.title} from collection`}
              title="Remove from collection"
              style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', color: '#fff', fontSize: 17, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ×
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
