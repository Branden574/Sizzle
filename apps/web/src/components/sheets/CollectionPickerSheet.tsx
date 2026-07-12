import { useState } from 'react';
import { useSwipeDismiss } from '../../lib/useSwipeDismiss';
import { useCollections, useCreateCollection, useToggleCollectionRecipe } from '../../data/queries';
import { useSizzle } from '../../store';
import { CheckIcon } from '../icons';

export function CollectionPickerSheet() {
  const recipeId = useSizzle((s) => s.collectionPickerFor);
  const setRecipeId = useSizzle((s) => s.setCollectionPickerFor);
  const { data: collections, isLoading } = useCollections(recipeId ?? undefined);
  const toggle = useToggleCollectionRecipe();
  const create = useCreateCollection();
  const [newName, setNewName] = useState('');

  const swipe = useSwipeDismiss(() => setRecipeId(null));
  if (!recipeId) return null;
  const close = () => { setRecipeId(null); setNewName(''); };

  const onCreate = () => {
    const name = newName.trim();
    if (!name || create.isPending) return;
    create.mutate(name, {
      onSuccess: (col) => {
        setNewName('');
        toggle.mutate({ collectionId: col.id, recipeId, inCollection: false });
      },
    });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 100 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'var(--scrim)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', paddingBottom: 30, maxHeight: '80%', display: 'flex', flexDirection: 'column', ...swipe.sheetStyle }}>
        <div {...swipe.handlers} style={{ textAlign: 'center', padding: '16px 0 8px', position: 'relative', flex: 'none' , ...swipe.handlers.style}}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginTop: 6 }}>Save to collection</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 20px 0' }}>
          {/* new collection */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onCreate(); }}
              placeholder="New collection name"
              maxLength={60}
              style={{ flex: 1, height: 46, border: '1.5px solid var(--line-2)', borderRadius: 13, padding: '0 14px', fontFamily: "'Hanken Grotesk'", fontSize: 15, color: 'var(--text)', outline: 'none', background: 'var(--surface)' }}
            />
            <button
              onClick={onCreate}
              disabled={!newName.trim() || create.isPending}
              style={{ flex: 'none', padding: '0 18px', height: 46, border: 'none', borderRadius: 13, background: 'var(--accent)', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, fontWeight: 700, cursor: newName.trim() ? 'pointer' : 'default', opacity: newName.trim() && !create.isPending ? 1 : 0.5 }}
            >
              Create
            </button>
          </div>

          {isLoading && <div style={{ color: 'var(--text-faint-2)', fontSize: 14, padding: '8px 2px' }}>Loading…</div>}
          {!isLoading && (collections ?? []).length === 0 && (
            <div style={{ color: 'var(--text-faint-2)', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>No collections yet — create one above.</div>
          )}
          {(collections ?? []).map((col) => {
            const inIt = !!col.hasRecipe;
            return (
              <button
                key={col.id}
                onClick={() => toggle.mutate({ collectionId: col.id, recipeId, inCollection: inIt })}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', background: 'none', border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 44, height: 44, flex: 'none', borderRadius: 12, background: col.coverBg ?? 'var(--surface-2)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>{col.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{col.count} recipe{col.count === 1 ? '' : 's'}</div>
                </div>
                <div style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', border: `2px solid ${inIt ? 'var(--accent)' : 'var(--line-2)'}`, background: inIt ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {inIt && <CheckIcon size={14} stroke="#fff" strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ padding: '14px 20px 0', flex: 'none' }}>
          <button onClick={close} style={{ width: '100%', height: 52, border: 'none', borderRadius: 16, background: 'var(--invert-bg)', color: 'var(--invert-fg)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Done</button>
        </div>
      </div>
    </div>
  );
}
