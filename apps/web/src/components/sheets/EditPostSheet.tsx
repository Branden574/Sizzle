import { useEffect, useState, type CSSProperties } from 'react';
import { PLATFORM_FEE_PCT } from '@sizzle/shared';
import { useEditRecipe, useMonetizationStatus, useRecipe, useSetRecipePrice, useSetRecipeVisibility } from '../../data/queries';
import { useSizzle } from '../../store';
import { theme } from '../../theme';

const accent = theme.accent;

const field: CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1.5px solid var(--line-2)',
  borderRadius: 14,
  color: 'var(--text)',
  fontFamily: "'Hanken Grotesk'",
  fontSize: 15,
  padding: '13px 14px',
  outline: 'none',
};
const labelStyle: CSSProperties = { display: 'block', color: 'var(--text-soft)', fontSize: 12, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', margin: '0 0 7px 2px' };

/** Edit a published post's text — caption, recipe fields, rating (video is immutable). */
export function EditPostSheet() {
  const editPostFor = useSizzle((s) => s.editPostFor);
  const setEditPostFor = useSizzle((s) => s.setEditPostFor);
  const { data: r } = useRecipe(editPostFor);
  const edit = useEditRecipe();
  const setRecipePrice = useSetRecipePrice();
  const setRecipeVisibility = useSetRecipeVisibility();
  const monetize = useMonetizationStatus(!!editPostFor);
  const canMonetize = monetize.data?.status === 'active';

  const [title, setTitle] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [time, setTime] = useState('');
  const [servings, setServings] = useState('');
  const [caption, setCaption] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [steps, setSteps] = useState('');
  const [rating, setRating] = useState(0);
  const [premium, setPremium] = useState(false);
  const [price, setPrice] = useState('');
  const [subOnly, setSubOnly] = useState(false);
  const [ready, setReady] = useState(false);

  // Pre-fill from the recipe once it loads (keyed on id so switching posts re-fills).
  useEffect(() => {
    if (!r) return;
    setTitle(r.title);
    setCuisine(r.cuisine);
    setTime(String(r.timeMinutes || ''));
    setServings(String(r.servings || ''));
    setCaption(r.caption ?? '');
    setIngredients(r.ingredients.join('\n'));
    setSteps(r.steps.join('\n'));
    setRating(r.rating ?? 0);
    setPremium(r.price != null);
    setPrice(r.price != null ? (r.price / 100).toFixed(2) : '');
    setSubOnly(r.visibility === 'subscribers');
    setReady(true);
  }, [r?.id]);

  if (!editPostFor) return null;
  const close = () => setEditPostFor(null);
  const isReview = r?.postType === 'review';
  const canSave = !!r && title.trim().length > 0 && !edit.isPending;

  // The premium price lives on a separate "controls" endpoint. Compute the
  // desired value: only paid when this creator can monetize, it's a real recipe,
  // premium is on, and the entered price is at least $1 (else clear it).
  const desiredPriceCents = (): number | null => {
    if (isReview || !canMonetize || !premium) return null;
    const n = Math.round(parseFloat(price) * 100);
    return Number.isFinite(n) && n >= 100 ? Math.min(n, 50_000) : null;
  };

  const save = () => {
    if (!r || !canSave) return;
    const nextPrice = desiredPriceCents();
    // Persist the price only if it actually changed (avoids a needless PATCH).
    if (nextPrice !== (r.price ?? null)) {
      setRecipePrice.mutate({ recipeId: r.id, priceCents: nextPrice });
    }
    // Persist subscribers-only visibility if it changed.
    const nextVisibility = canMonetize && subOnly && !isReview ? 'subscribers' : 'public';
    if (nextVisibility !== (r.visibility ?? 'public')) {
      setRecipeVisibility.mutate({ recipeId: r.id, visibility: nextVisibility });
    }
    edit.mutate(
      {
        recipeId: r.id,
        title: title.trim(),
        cuisine: cuisine.trim() || 'Home',
        level: r.level || 'Easy',
        timeMinutes: isReview ? 0 : parseInt(time, 10) || 15,
        servings: isReview ? 1 : parseInt(servings, 10) || 2,
        caption: caption.trim() || undefined,
        ingredients: isReview ? [] : ingredients.split('\n').map((s) => s.trim()).filter(Boolean),
        steps: isReview ? [] : steps.split('\n').map((s) => s.trim()).filter(Boolean),
        rating: isReview && rating > 0 ? rating : undefined,
      },
      { onSuccess: () => setEditPostFor(null) },
    );
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 99, background: 'var(--bg)', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '56px 20px 14px', flex: 'none' }}>
        <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 16, fontWeight: 600 }}>Cancel</button>
        <div style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700 }}>Edit post</div>
        <button onClick={save} disabled={!canSave} style={{ background: 'none', border: 'none', cursor: canSave ? 'pointer' : 'default', color: canSave ? accent : 'var(--text-faint-2)', fontSize: 16, fontWeight: 800 }}>
          {edit.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>

      {!ready ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint-2)', fontSize: 15 }}>Loading…</div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>{isReview ? 'Dish or place' : 'Title'}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={field} />
            </div>

            {isReview && (
              <div>
                <label style={labelStyle}>Your rating</label>
                <StarPicker value={rating} onChange={setRating} />
              </div>
            )}

            <div>
              <label style={labelStyle}>{isReview ? 'Your review · add #hashtags' : 'Caption · add #hashtags'}</label>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={isReview ? 4 : 2} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: isReview ? 1 : 2 }}>
                <label style={labelStyle}>Cuisine</label>
                <input value={cuisine} onChange={(e) => setCuisine(e.target.value)} style={field} />
              </div>
              {!isReview && (
                <>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Time (min)</label>
                    <input value={time} onChange={(e) => setTime(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" style={field} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Serves</label>
                    <input value={servings} onChange={(e) => setServings(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" style={field} />
                  </div>
                </>
              )}
            </div>

            {!isReview && (
              <>
                <div>
                  <label style={labelStyle}>Ingredients · one per line</label>
                  <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={5} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} />
                </div>
                <div>
                  <label style={labelStyle}>Method · one step per line</label>
                  <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={5} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} />
                </div>

                {/* Premium: charge for the full recipe. Video, ingredients & steps
                    stay locked until a fan unlocks or subscribes. */}
                {canMonetize ? (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                      <div style={{ minWidth: 0, paddingRight: 12 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>Premium recipe</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2, lineHeight: 1.45 }}>Lock the video, ingredients &amp; steps behind a one-time price.</div>
                      </div>
                      <input type="checkbox" checked={premium} onChange={(e) => setPremium(e.target.checked)} style={{ width: 20, height: 20, accentColor: accent, flex: 'none', cursor: 'pointer' }} />
                    </label>
                    {premium && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '1.5px solid var(--line-2)', borderRadius: 12, padding: '0 12px' }}>
                          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-faint)' }}>$</span>
                          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, '').slice(0, 6))} inputMode="decimal" placeholder="3.99" style={{ flex: 1, height: 44, border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 800, outline: 'none', padding: '0 6px' }} />
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-faint-2)', marginTop: 8, lineHeight: 1.45 }}>
                          You keep {100 - PLATFORM_FEE_PCT}% of every unlock. Minimum $1.00.
                        </div>
                      </div>
                    )}
                    {/* Subscribers-only: an ongoing perk for monthly subscribers. */}
                    <div style={{ height: 1, background: 'var(--line)', margin: '14px 0' }} />
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                      <div style={{ minWidth: 0, paddingRight: 12 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>Subscribers only</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2, lineHeight: 1.45 }}>Only your monthly subscribers can watch — everyone else sees a locked teaser inviting them to subscribe.</div>
                      </div>
                      <input type="checkbox" checked={subOnly} onChange={(e) => setSubOnly(e.target.checked)} style={{ width: 20, height: 20, accentColor: accent, flex: 'none', cursor: 'pointer' }} />
                    </label>
                  </div>
                ) : (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.45 }}>
                    💰 Want to charge for this recipe? Set up payouts in <b style={{ color: 'var(--text)' }}>your insights</b> first — then you can make it premium.
                  </div>
                )}
              </>
            )}
            {(edit.isError || setRecipePrice.isError) && <div style={{ color: 'var(--danger-fg)', fontSize: 13.5, fontWeight: 600 }}>Couldn’t save — please try again.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Tap-to-set 1–5 star rating. */
function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        return (
          <button key={n} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(value === n ? 0 : n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 1 }}>
            <svg width={30} height={30} viewBox="0 0 24 24" fill={on ? '#ffb52e' : 'none'} stroke={on ? '#ffb52e' : 'var(--line-3)'} strokeWidth={1.6} strokeLinejoin="round">
              <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.8l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94L12 2.5z" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
