import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from '../controls';
import { isPremiumPriceTier, type RecipeDetail } from '@sizzle/shared';
import { PremiumPriceFields } from '../PremiumPriceFields';
import { useEditRecipe, useMe, useMonetizationStatus, useRecipe, useSetRecipePoster, useSetRecipePrice, useSetRecipeVisibility } from '../../data/queries';
import { uploadRecipeImage } from '../../lib/storage';
import { showCreatorMoney } from '../../lib/native';
import { buildMacros, MacroInput } from './UploadSheet';
import { useSizzle } from '../../store';
import { theme } from '../../theme';
import { HashtagCaptionField } from '../HashtagCaptionField';

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
  const [calories, setCalories] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [fatG, setFatG] = useState('');
  const [rating, setRating] = useState(0);
  const [premium, setPremium] = useState(false);
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [priceErr, setPriceErr] = useState(false);
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
    setCalories(r.macros?.calories != null ? String(r.macros.calories) : '');
    setProteinG(r.macros?.proteinG != null ? String(r.macros.proteinG) : '');
    setCarbsG(r.macros?.carbsG != null ? String(r.macros.carbsG) : '');
    setFatG(r.macros?.fatG != null ? String(r.macros.fatG) : '');
    setRating(r.rating ?? 0);
    setPremium(r.price != null);
    setPriceCents(r.price ?? null);
    setSubOnly(r.visibility === 'subscribers');
    setReady(true);
  }, [r?.id]);

  if (!editPostFor) return null;
  const close = () => setEditPostFor(null);
  const isReview = r?.postType === 'review';
  const canSave = !!r && title.trim().length > 0 && !edit.isPending;

  // The premium price lives on a separate "controls" endpoint. A price applies
  // only when this creator can monetize, it's a real recipe, and premium is on.
  // Making the post free again is ONLY the explicit premium toggle — a
  // below-floor number blocks the save with an inline error instead of quietly
  // clearing the price and publishing the recipe free.
  const priceWanted = !isReview && canMonetize && premium;
  const priceValid = isPremiumPriceTier(priceCents);

  const save = () => {
    if (!r || !canSave) return;
    if (priceWanted && !priceValid) {
      setPriceErr(true);
      return;
    }
    // Only touch pricing/visibility once the monetization status is KNOWN. If the
    // status query is still loading or errored, canMonetize reads false — deriving
    // nextPrice=null from that would silently strip the price AND unprotect the
    // premium video on an ordinary caption edit. Unknown = leave price untouched.
    if (monetize.isSuccess) {
      const nextPrice = priceWanted ? priceCents : null;
      if (nextPrice !== (r.price ?? null)) {
        setRecipePrice.mutate({ recipeId: r.id, priceCents: nextPrice });
      }
      const nextVisibility = canMonetize && subOnly && !isReview ? 'subscribers' : 'public';
      if (nextVisibility !== (r.visibility ?? 'public')) {
        setRecipeVisibility.mutate({ recipeId: r.id, visibility: nextVisibility });
      }
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
        macros: isReview ? undefined : buildMacros(calories, proteinG, carbsG, fatG),
        rating: isReview && rating > 0 ? rating : undefined,
      },
      { onSuccess: () => setEditPostFor(null) },
    );
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 99, background: 'var(--bg)', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '56px 20px 14px', flex: 'none' }}>
        <Button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 16, fontWeight: 600 }}>Cancel</Button>
        <div style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700 }}>Edit post</div>
        <Button onClick={save} disabled={!canSave} style={{ background: 'none', border: 'none', cursor: canSave ? 'pointer' : 'default', color: canSave ? accent : 'var(--text-faint-2)', fontSize: 16, fontWeight: 800 }}>
          {edit.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {!ready ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint-2)', fontSize: 15 }}>Loading…</div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {r?.video && <PosterEditor recipe={r} />}
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
              <HashtagCaptionField value={caption} onChange={setCaption} rows={isReview ? 4 : 2} placeholder="" style={field} />
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

                <div>
                  <label style={labelStyle}>Nutrition per serving · optional</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <MacroInput label="Cal" value={calories} onChange={setCalories} placeholder="520" fieldStyle={field} mutedColor="var(--text-faint)" />
                    <MacroInput label="Protein" value={proteinG} onChange={setProteinG} placeholder="32" unit="g" fieldStyle={field} mutedColor="var(--text-faint)" />
                    <MacroInput label="Carbs" value={carbsG} onChange={setCarbsG} placeholder="48" unit="g" fieldStyle={field} mutedColor="var(--text-faint)" />
                    <MacroInput label="Fat" value={fatG} onChange={setFatG} placeholder="18" unit="g" fieldStyle={field} mutedColor="var(--text-faint)" />
                  </div>
                </div>

                {/* Premium / subscribers-only pricing — the same tier picker used at
                    upload. Only a monetization-active creator can set a price (the
                    component shows a payouts nudge otherwise). */}
                {showCreatorMoney && (
                  <PremiumPriceFields
                    value={{ premium, priceCents, subOnly }}
                    onChange={(v) => { setPremium(v.premium); setPriceCents(v.priceCents); setSubOnly(v.subOnly); setPriceErr(false); }}
                    canMonetize={canMonetize}
                    priceErr={priceErr}
                  />
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
          <Button key={n} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(value === n ? 0 : n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 1 }}>
            <svg width={30} height={30} viewBox="0 0 24 24" fill={on ? '#ffb52e' : 'none'} stroke={on ? '#ffb52e' : 'var(--line-3)'} strokeWidth={1.6} strokeLinejoin="round">
              <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.8l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94L12 2.5z" />
            </svg>
          </Button>
        );
      })}
    </div>
  );
}

/** Cover-still picker for a video post — the thumbnail is the biggest tap-through
 *  lever, and the video itself is immutable, so this lets the creator swap the poster. */
function PosterEditor({ recipe }: { recipe: RecipeDetail }) {
  const { data: me } = useMe();
  const setPoster = useSetRecipePoster();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPick = async (file: File | undefined) => {
    if (!file || !me) return;
    setBusy(true);
    setErr(null);
    try {
      const url = await uploadRecipeImage(me.id, file);
      await setPoster.mutateAsync({ recipeId: recipe.id, posterUrl: url });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update the cover');
    } finally {
      setBusy(false);
    }
  };

  const poster = recipe.video?.posterUrl;
  return (
    <div>
      <label style={labelStyle}>Cover image</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 60, height: 78, borderRadius: 12, flex: 'none', background: poster ? `url(${poster}) center/cover` : 'var(--surface-2)', border: '1px solid var(--line)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            style={{ height: 40, padding: '0 16px', border: '1.5px solid var(--line-2)', borderRadius: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Uploading…' : poster ? 'Change cover' : 'Upload cover'}
          </Button>
          <div style={{ fontSize: 12, color: 'var(--text-faint-2)', marginTop: 6, lineHeight: 1.4 }}>A great thumbnail lifts views. JPG/PNG.</div>
          {err && <div style={{ color: 'var(--danger-fg)', fontSize: 12.5, marginTop: 4 }}>{err}</div>}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files?.[0])} />
    </div>
  );
}
