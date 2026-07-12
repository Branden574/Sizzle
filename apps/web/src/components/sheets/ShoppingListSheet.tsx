import { useSizzle } from '../../store';
import { Button, DismissBackdrop } from '../controls';
import { useSwipeDismiss } from '../../lib/useSwipeDismiss';
import { useShopping, type ShoppingItem } from '../../lib/shopping';
import { CloseIcon } from '../icons';

export function ShoppingListSheet() {
  const open = useSizzle((s) => s.showShopping);
  const setOpen = useSizzle((s) => s.setShowShopping);
  const items = useShopping((s) => s.items);
  const toggle = useShopping((s) => s.toggle);
  const remove = useShopping((s) => s.remove);
  const clearChecked = useShopping((s) => s.clearChecked);
  const clearAll = useShopping((s) => s.clearAll);

  const swipe = useSwipeDismiss(() => setOpen(false));
  if (!open) return null;
  const close = () => setOpen(false);

  // Group by recipe (loose items under "Other").
  const groups = new Map<string, { title: string; items: ShoppingItem[] }>();
  for (const it of items) {
    const key = it.recipeId ?? '_other';
    if (!groups.has(key)) groups.set(key, { title: it.recipeTitle ?? 'Other', items: [] });
    groups.get(key)!.items.push(it);
  }
  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 92 }}>
      <DismissBackdrop onDismiss={close} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 70, background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column', ...swipe.sheetStyle }}>
        <div {...swipe.handlers} style={{ padding: '16px 22px 12px', borderBottom: '1px solid var(--line)', position: 'relative', flex: 'none' , ...swipe.handlers.style}}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Shopping list</div>
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{items.length} item{items.length === 1 ? '' : 's'}{checkedCount > 0 ? ` · ${checkedCount} checked` : ''}</div>
            </div>
            <Button onClick={close} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <CloseIcon size={20} stroke="var(--text-faint)" strokeWidth={2.2} />
            </Button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 22px 24px' }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 15, marginTop: 50 }}>
              Your list is empty.<br />Open a recipe and tap “Add to shopping list”.
            </div>
          ) : (
            [...groups.values()].map((g, gi) => (
              <div key={gi} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase', color: 'var(--text-faint-2)', margin: '0 2px 8px' }}>{g.title}</div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
                  {g.items.map((it) => (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
                      <Button onClick={() => toggle(it.id)} style={{ width: 24, height: 24, flex: 'none', borderRadius: 7, border: `2px solid ${it.checked ? 'var(--accent)' : 'var(--line-2)'}`, background: it.checked ? 'var(--accent)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                        {it.checked && <span style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>✓</span>}
                      </Button>
                      <Button onClick={() => toggle(it.id)} aria-pressed={it.checked} style={{ flex: 1, textAlign: 'left', fontSize: 15.5, color: it.checked ? 'var(--text-faint-2)' : 'var(--text-2)', textDecoration: it.checked ? 'line-through' : 'none', cursor: 'pointer' }}>{it.text}</Button>
                      <Button onClick={() => remove(it.id)} aria-label="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint-2)', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>×</Button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div style={{ flex: 'none', padding: '12px 22px 30px', borderTop: '1px solid var(--line)', display: 'flex', gap: 10 }}>
            <Button onClick={clearChecked} disabled={checkedCount === 0} style={{ flex: 1, height: 48, borderRadius: 14, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: checkedCount ? 'pointer' : 'default', opacity: checkedCount ? 1 : 0.5 }}>Clear checked</Button>
            <Button onClick={clearAll} style={{ flex: 1, height: 48, borderRadius: 14, border: 'none', background: 'var(--invert-bg)', color: 'var(--invert-fg)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Clear all</Button>
          </div>
        )}
      </div>
    </div>
  );
}
