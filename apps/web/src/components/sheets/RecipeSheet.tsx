import { useEffect, useRef, useState } from 'react';
import { Button, DismissBackdrop } from '../controls';
import { useRequireAuth } from '../../auth/useRequireAuth';
import { useAuth } from '../../auth/useAuth';
import { useAppealRecipe, useCookEvent, useCookLog, useDeleteRecipe, useDerivatives, useMe, useRecipe, useToggleDownload, useToggleSave, useUnlockRecipe } from '../../data/queries';
import { getOffline } from '../../lib/offline';
import { showMonetization } from '../../lib/native';
import { formatCount } from '../../lib/format';
import { scaleIngredient } from '../../lib/ingredients';
import { useShopping } from '../../lib/shopping';
import { useSizzle } from '../../store';
import { theme } from '../../theme';
import { BookmarkIcon, CloseIcon, CommentIcon, DownloadIcon, PencilIcon, PlayIcon, SpeakerIcon, SpeakerOffIcon, TrashIcon } from '../icons';
import { Hashtags } from '../Hashtags';
import { ImageCarousel } from '../ImageCarousel';
import { VerifiedBadge } from '../VerifiedBadge';
import { StarRow } from '../Stars';
import { MadeItPrompt } from '../MadeItPrompt';
import { pressVars } from '../ui';

const accent = theme.accent;

export function RecipeSheet() {
  const openRecipe = useSizzle((s) => s.openRecipe);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const setViewer = useSizzle((s) => s.setViewer);
  const setEditPostFor = useSizzle((s) => s.setEditPostFor);
  const setOpenCook = useSizzle((s) => s.setOpenCook);
  const setCommentsFor = useSizzle((s) => s.setCommentsFor);
  const setCookFor = useSizzle((s) => s.setCookFor);
  const setCollectionPickerFor = useSizzle((s) => s.setCollectionPickerFor);
  const requireAuth = useRequireAuth();
  const save = useToggleSave();
  const download = useToggleDownload();
  const unlock = useUnlockRecipe();
  const cookEvent = useCookEvent();
  const setUploadPrefill = useSizzle((s) => s.setUploadPrefill);
  const setShowUpload = useSizzle((s) => s.setShowUpload);
  const authed = useAuth((s) => s.status === 'authed');

  const { data, isLoading } = useRecipe(openRecipe);
  const derivatives = useDerivatives(openRecipe);
  const cookLog = useCookLog(openRecipe);
  // Remix diff: when this post was cooked from another recipe, fetch the origin
  // and show what changed (added/removed ingredients) — GitHub-fork style.
  const originDetail = useRecipe(data?.origin?.id ?? null);
  const [showMadeIt, setShowMadeIt] = useState(false);
  const { data: me } = useMe();
  const appeal = useAppealRecipe();
  const del = useDeleteRecipe();
  const [confirmDel, setConfirmDel] = useState(false);
  const [appealText, setAppealText] = useState('');
  const [scale, setScale] = useState(1);
  const [servesEdit, setServesEdit] = useState<string | null>(null);
  const units = useSizzle((s) => s.units);
  const [addedToList, setAddedToList] = useState(false);
  const addToShopping = useShopping((s) => s.add);
  // Offline fallback: if the fetch hasn't landed, use the locally cached copy.
  const r = data ?? getOffline(openRecipe);

  // Each recipe opens at its own base serving size (don't carry scale over).
  useEffect(() => { setScale(1); setServesEdit(null); }, [openRecipe]);

  if (!openRecipe) return null;
  const close = () => setOpenRecipe(null);
  const isOwner = !!r && !!me && r.cook.id === me.id;
  const isReview = r?.postType === 'review';
  // Prefer HLS (Cloudflare adaptive stream) over raw MP4 — same order as the feed.
  const headerVideo = r?.video?.hlsUrl || r?.video?.mp4Url || null;
  const headerImages = r?.images ?? [];
  const hasMedia = !!headerVideo || headerImages.length > 0;
  // Serving scaler: the recipe's own serving count is the baseline; the user can
  // type or step a target number of servings and every ingredient scales to it.
  const baseServes = r?.servings ?? 1;
  const serves = Math.max(1, Math.round(baseServes * scale));
  const setServes = (n: number) => setScale(Math.max(1, Math.min(100, Math.round(n))) / baseServes);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 97 }}>
      <DismissBackdrop onDismiss={close} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 44, background: 'var(--bg)', borderRadius: '30px 30px 0 0', overflow: 'hidden', animation: 'sz-slideUp .42s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', height: hasMedia ? 300 : 230, flex: 'none', background: r?.bg ?? 'linear-gradient(165deg,#2a160e,#b5471f)' }}>
          {headerVideo ? (
            <RecipeHeaderVideo src={headerVideo} poster={r?.video?.posterUrl} onExpand={() => { if (r) { setViewer({ items: [r], index: 0 }); setOpenRecipe(null); } }} />
          ) : headerImages.length > 0 ? (
            <ImageCarousel images={headerImages} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(70% 60% at 70% 20%, rgba(244,165,44,.5), transparent 70%)' }} />
          )}
          {/* fade the bottom into the sheet bg so the recipe title reads over it */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: hasMedia ? 'linear-gradient(180deg, rgba(0,0,0,.3) 0%, transparent 24%, transparent 64%, var(--bg))' : 'linear-gradient(180deg, transparent 50%, var(--bg))' }} />
          <Button onClick={close} style={{ position: 'absolute', top: 16, right: 16, zIndex: 6, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <CloseIcon size={20} stroke="#fff" strokeWidth={2.2} />
          </Button>
          {isOwner && (
            <Button onClick={() => setConfirmDel(true)} title="Delete post" aria-label="Delete post" style={{ position: 'absolute', top: 16, left: 16, zIndex: 6, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <TrashIcon size={19} stroke="#fff" strokeWidth={2} />
            </Button>
          )}
          {isOwner && (
            <Button onClick={() => { if (r) setEditPostFor(r.id); }} title="Edit post" aria-label="Edit post" style={{ position: 'absolute', top: 16, left: 62, zIndex: 6, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <PencilIcon size={18} stroke="#fff" strokeWidth={2} />
            </Button>
          )}
          <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 6, width: 42, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.6)' }} />
        </div>

        {!r ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint-2)', fontSize: 15 }}>
            {isLoading ? 'Loading recipe…' : 'Recipe not found'}
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 130px', marginTop: -46, position: 'relative', zIndex: 2 }}>
              {r.removed && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--line-2)', borderRadius: 16, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--danger-fg)' }}>This video was removed</div>
                  {r.removalReason && <div style={{ fontSize: 13, color: 'var(--text-soft)', marginTop: 3 }}>{r.removalReason}</div>}
                  {isOwner && r.appealStatus === 'none' && (
                    <div style={{ marginTop: 12 }}>
                      <textarea value={appealText} onChange={(e) => setAppealText(e.target.value)} rows={2} placeholder="Tell us why this should be restored…" style={{ width: '100%', border: '1.5px solid var(--line-2)', borderRadius: 12, padding: '10px 12px', fontFamily: "'Hanken Grotesk'", fontSize: 14, color: 'var(--text)', outline: 'none', background: 'var(--surface)', resize: 'vertical', lineHeight: 1.4 }} />
                      <Button
                        disabled={!appealText.trim() || appeal.isPending}
                        onClick={() => appeal.mutate({ recipeId: r.id, text: appealText.trim() })}
                        style={{ marginTop: 8, width: '100%', height: 44, border: 'none', borderRadius: 12, background: 'var(--invert-bg)', color: 'var(--invert-fg)', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, fontWeight: 700, cursor: appealText.trim() ? 'pointer' : 'default', opacity: appealText.trim() && !appeal.isPending ? 1 : 0.55 }}
                      >
                        {appeal.isPending ? 'Submitting…' : 'Submit appeal'}
                      </Button>
                    </div>
                  )}
                  {isOwner && r.appealStatus === 'pending' && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warn-fg)', marginTop: 10 }}>Appeal under review</div>}
                  {isOwner && r.appealStatus === 'denied' && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-soft)', marginTop: 10 }}>Appeal denied</div>}
                </div>
              )}
              {!r.removed && r.autoHidden && isOwner && (
                <div style={{ background: 'var(--warn-bg)', border: '1px solid var(--line)', borderRadius: 16, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--warn-fg)' }}>Under review</div>
                  <div style={{ fontSize: 13, color: 'var(--text-soft)', marginTop: 3 }}>This post was hidden automatically after multiple reports and is awaiting moderator review.</div>
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                {isReview && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff4dc', color: '#9a6b00', fontSize: 11.5, fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 9 }}>
                    <StarRow value={r.rating} size={12} />
                    Review
                  </span>
                )}
                <span style={{ display: 'inline-block', background: accent, color: '#fff', fontSize: 11.5, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', padding: '5px 11px', borderRadius: 9 }}>{r.cuisine}</span>
              </div>
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 38, lineHeight: 1.02, color: 'var(--text)', marginTop: 12 }}>{r.title}</div>
              <Button
                onClick={() => {
                  setOpenCook(r.cook.id);
                  setOpenRecipe(null);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: r.cook.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 17, color: '#fff' }}>{r.cook.init}</div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{r.cook.name}</span>
                    <VerifiedBadge tier={r.cook.verifiedTier} size={15} />
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-soft)' }}>@{r.cook.handle}</div>
                </div>
              </Button>
              {r.origin && originDetail.data && !isReview && (() => {
                const norm = (x: string) => x.trim().toLowerCase();
                const mine = new Set((r.ingredients ?? []).map(norm));
                const theirs = new Set((originDetail.data.ingredients ?? []).map(norm));
                const added = (r.ingredients ?? []).filter((x) => !theirs.has(norm(x))).slice(0, 5);
                const removed = (originDetail.data.ingredients ?? []).filter((x) => !mine.has(norm(x))).slice(0, 5);
                if (!added.length && !removed.length) return null;
                return (
                  <div style={{ marginTop: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '11px 14px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--text-faint)' }}>What changed from the original</div>
                    {added.map((x, i) => <div key={`a${i}`} style={{ fontSize: 13, marginTop: 4, color: '#1d6b3c' }}>+ {x}</div>)}
                    {removed.map((x, i) => <div key={`r${i}`} style={{ fontSize: 13, marginTop: 4, color: '#b8291b', textDecoration: 'line-through', textDecorationColor: 'rgba(184,41,27,.45)' }}>− {x}</div>)}
                  </div>
                );
              })()}
              {r.origin && (
                <Button
                  onClick={() => setOpenRecipe(r.origin!.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 12, padding: '7px 13px', border: '1px solid var(--line-2)', borderRadius: 999, background: 'var(--surface)', color: 'var(--text-muted)', fontFamily: "'Hanken Grotesk'", fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  🍳 Cooked from @{r.origin.cookHandle}'s “{r.origin.title.length > 32 ? `${r.origin.title.slice(0, 32)}…` : r.origin.title}”
                </Button>
              )}
              {r.hashtags.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <Hashtags tags={r.hashtags} size={14} />
                </div>
              )}
              {isReview ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 16px' }}>
                    <StarRow value={r.rating} size={22} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{r.rating ? `${r.rating} / 5` : 'No rating'}</span>
                  </div>
                  {r.caption && (
                    <>
                      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: 'var(--text)', margin: '26px 0 12px' }}>The review</div>
                      <div style={{ fontSize: 15.5, lineHeight: 1.6, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{r.caption}</div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <StatCard label="Time" value={r.time} />
                    <StatCard label="Serves" value={formatServes(r.servings * scale)} />
                    <StatCard label="Level" value={r.level} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '8px 8px 8px 14px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14 }}>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: 'var(--text-muted)' }}>
                      {r.counts.cooks > 0
                        ? `🍳 ${formatCount(r.counts.cooks)} ${r.counts.cooks === 1 ? 'person' : 'people'} cooked this`
                        : '🍳 Be the first to cook this'}
                    </span>
                    {!isOwner && (
                      <Button
                        onClick={() => { if (requireAuth()) setShowMadeIt(true); }}
                        style={{ flex: 'none', border: 'none', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text)', padding: '8px 13px', fontFamily: "'Hanken Grotesk'", fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
                      >
                        I made this
                      </Button>
                    )}
                  </div>

                  {(cookLog.data?.items.length ?? 0) > 0 && (
                    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '12px -24px 0', padding: '0 24px 4px' }}>
                      {cookLog.data!.items.map((e) => (
                        <div key={e.id} style={{ flex: 'none', width: e.photoUrl ? 150 : 190, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
                          {e.photoUrl && <img src={e.photoUrl} alt={`${e.author.name}'s dish`} style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} loading="lazy" />}
                          <div style={{ padding: '9px 11px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 20, height: 20, flex: 'none', borderRadius: '50%', background: e.author.avatarColor, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontFamily: "'Instrument Serif',serif" }}>
                                {e.author.avatarUrl ? <img src={e.author.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : e.author.init}
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.author.name}</span>
                              {e.rating != null && <span style={{ flex: 'none', fontSize: 11, color: '#f4a52c', fontWeight: 800 }}>{'★'.repeat(e.rating)}</span>}
                            </div>
                            {e.note && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.note}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {r.locked && r.subscribersOnly && (
                    <div style={{ marginTop: 22, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 20, textAlign: 'center' }}>
                      <div style={{ fontSize: 30 }}>🔒</div>
                      <div style={{ fontSize: 16.5, fontWeight: 800, color: 'var(--text)', marginTop: 6 }}>Subscribers only</div>
                      <div style={{ fontSize: 13.5, color: 'var(--text-faint)', margin: '4px 0 14px', lineHeight: 1.5 }}>
                        {showMonetization
                          ? `Subscribe to ${r.cook.name} to watch this — plus every subscriber-only post, video, ingredients & steps.`
                          : `This recipe is only available to ${r.cook.name}'s subscribers.`}
                      </div>
                      {showMonetization && (
                        <Button
                          onClick={() => { if (requireAuth()) setOpenCook(r.cook.id); }}
                          style={{ width: '100%', height: 50, border: 'none', borderRadius: 14, background: `linear-gradient(135deg,${accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15.5, fontWeight: 800, cursor: 'pointer' }}
                        >
                          Subscribe to {r.cook.name}
                        </Button>
                      )}
                    </div>
                  )}

                  {r.locked && !r.subscribersOnly && r.price != null && (
                    <div style={{ marginTop: 22, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 20, textAlign: 'center' }}>
                      <div style={{ fontSize: 30 }}>🔒</div>
                      <div style={{ fontSize: 16.5, fontWeight: 800, color: 'var(--text)', marginTop: 6 }}>Premium recipe</div>
                      <div style={{ fontSize: 13.5, color: 'var(--text-faint)', margin: '4px 0 14px', lineHeight: 1.5 }}>
                        {showMonetization
                          ? `Unlock ${r.cook.name}'s full recipe — video, ingredients & steps. ${r.cook.name} keeps 90%.`
                          : `This is one of ${r.cook.name}'s premium recipes.`}
                      </div>
                      {showMonetization && (
                        <Button
                          onClick={() => { if (requireAuth()) unlock.mutate(r.id); }}
                          disabled={unlock.isPending}
                          style={{ width: '100%', height: 50, border: 'none', borderRadius: 14, background: `linear-gradient(135deg,${accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15.5, fontWeight: 800, cursor: 'pointer' }}
                        >
                          {unlock.isPending ? 'Starting…' : `Unlock · $${(r.price / 100).toFixed(2)}`}
                        </Button>
                      )}
                      {showMonetization && r.cook.subPriceCents != null && (
                        <Button
                          onClick={() => setOpenCook(r.cook.id)}
                          style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--text-faint)', textDecoration: 'underline', padding: 0 }}
                        >
                          …or subscribe to {r.cook.name} for all their premium recipes
                        </Button>
                      )}
                    </div>
                  )}

                  {!r.locked && (
                  <>
                  {r.chefsNote && (
                    <div style={{ marginTop: 18, background: '#fff4dc', border: '1px solid #f0dfb8', borderRadius: 16, padding: '12px 15px' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.4px', textTransform: 'uppercase', color: '#9a6b00' }}>📌 Chef's note · {r.chefsNote.authorName}</div>
                      <div style={{ fontSize: 14, color: '#5a4a1f', lineHeight: 1.5, marginTop: 4 }}>{r.chefsNote.text}</div>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '26px 0 12px' }} data-locked-gate="ingredients">
                    <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: 'var(--text)' }}>Ingredients</div>
                    {/* Type or step a target serving count; ingredients scale to it. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-soft)' }}>Serves</span>
                      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
                        <Button onClick={() => { setServesEdit(null); setServes(serves - 1); }} disabled={serves <= 1} aria-label="Fewer servings" style={{ width: 36, height: 38, border: 'none', background: 'transparent', color: serves <= 1 ? 'var(--text-faint-2)' : 'var(--text)', fontSize: 22, fontWeight: 600, cursor: serves <= 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>−</Button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={servesEdit ?? String(serves)}
                          onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 3); setServesEdit(v); const n = parseInt(v, 10); if (Number.isFinite(n) && n >= 1) setServes(n); }}
                          onBlur={() => setServesEdit(null)}
                          onFocus={(e) => e.currentTarget.select()}
                          aria-label="Number of servings"
                          style={{ width: 42, height: 38, textAlign: 'center', border: 'none', borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 15.5, fontWeight: 800, outline: 'none', fontVariantNumeric: 'tabular-nums', padding: 0 }}
                        />
                        <Button onClick={() => { setServesEdit(null); setServes(serves + 1); }} disabled={serves >= 100} aria-label="More servings" style={{ width: 36, height: 38, border: 'none', background: 'transparent', color: serves >= 100 ? 'var(--text-faint-2)' : 'var(--text)', fontSize: 20, fontWeight: 600, cursor: serves >= 100 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>+</Button>
                      </div>
                    </div>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }}>
                    {r.ingredients.map((ing, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flex: 'none' }} />
                        <span style={{ fontSize: 15.5, color: 'var(--text-2)' }}>{scale === 1 && units === 'original' ? ing : scaleIngredient(ing, scale, units)}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                    <Button
                      onClick={() => {
                        const lines = scale === 1 && units === 'original' ? r.ingredients : r.ingredients.map((ing) => scaleIngredient(ing, scale, units));
                        addToShopping(lines, { id: r.id, title: r.title });
                        // Cook-intent signal: list-adds feed the ranker + creator analytics.
                        if (authed) cookEvent.mutate({ recipeId: r.id, kind: 'list_add' });
                        setAddedToList(true);
                        window.setTimeout(() => setAddedToList(false), 1800);
                      }}
                      className="sz-press"
                      style={{ ...pressVars(0.98), flex: 1, height: 50, border: '1.5px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', color: addedToList ? 'var(--accent)' : 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      {addedToList ? '✓ Added' : '🛒 Shopping list'}
                    </Button>
                    <Button
                      onClick={() => { if (!requireAuth()) return; setCollectionPickerFor(r.id); }}
                      className="sz-press"
                      style={{ ...pressVars(0.98), flex: 1, height: 50, border: '1.5px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      📁 Save to…
                    </Button>
                  </div>

                  {r.steps.length > 0 && (
                    <Button
                      onClick={() => setCookFor({ id: r.id, scale })}
                      className="sz-press"
                      style={{ ...pressVars(0.97), width: '100%', height: 54, marginTop: 12, border: 'none', borderRadius: 16, background: `linear-gradient(135deg, ${accent}, #e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, boxShadow: '0 8px 22px -8px rgba(226,58,24,.6)' }}
                    >
                      ▶ Start cooking
                    </Button>
                  )}

                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: 'var(--text)', margin: '26px 0 12px' }}>Method</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {r.steps.map((text, i) => (
                      <div key={i} style={{ display: 'flex', gap: 14 }}>
                        <div style={{ width: 32, height: 32, flex: 'none', borderRadius: 11, background: 'var(--invert-bg)', color: 'var(--invert-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 17 }}>{i + 1}</div>
                        <div style={{ fontSize: 15.5, lineHeight: 1.5, color: 'var(--text-2)', paddingTop: 4 }}>{text}</div>
                      </div>
                    ))}
                  </div>

                  {/* "Cook this": post your own take — the composer opens pre-filled
                      with this recipe's ingredients/steps and credits the original. */}
                  {!isOwner && (
                    <Button
                      onClick={() => {
                        if (!requireAuth()) return;
                        setUploadPrefill({
                          originRecipeId: r.id,
                          originTitle: r.title,
                          originHandle: r.cook.handle,
                          ingredients: r.ingredients.join('\n'),
                          steps: r.steps.join('\n'),
                        });
                        setOpenRecipe(null);
                        setShowUpload(true);
                      }}
                      className="sz-press"
                      style={{ ...pressVars(0.98), width: '100%', height: 50, marginTop: 18, border: '1.5px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', color: 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}
                    >
                      🍳 Cook this — post your take
                    </Button>
                  )}

                  {(derivatives.data?.total ?? 0) > 0 && (
                    <>
                      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: 'var(--text)', margin: '26px 0 12px' }}>
                        Cooked by {formatCount(derivatives.data!.total)} {derivatives.data!.total === 1 ? 'other' : 'others'}
                      </div>
                      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -24px', padding: '0 24px 6px' }}>
                        {derivatives.data!.items.map((d) => (
                          <Button
                            key={d.id}
                            onClick={() => setOpenRecipe(d.id)}
                            style={{ flex: 'none', width: 128, border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                          >
                            <div style={{ width: 128, height: 170, borderRadius: 14, overflow: 'hidden', background: d.bg, position: 'relative' }}>
                              {(d.video?.posterUrl || d.images[0]) && (
                                <img src={d.video?.posterUrl ?? d.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                              )}
                              <div style={{ position: 'absolute', left: 8, right: 8, bottom: 7, color: '#fff', fontFamily: "'Instrument Serif',serif", fontSize: 15, lineHeight: 1.15, textShadow: '0 1px 4px rgba(0,0,0,.7)' }}>{d.title}</div>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', marginTop: 5 }}>@{d.cook.handle}</div>
                          </Button>
                        ))}
                      </div>
                    </>
                  )}
                  </>
                  )}
                </>
              )}
            </div>

            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 4, padding: '14px 24px 30px', background: 'var(--bg)', display: 'flex', gap: 12 }}>
              {/* soft fade from the scrolling content into the solid action bar */}
              <div style={{ position: 'absolute', top: -24, left: 0, right: 0, height: 24, background: 'linear-gradient(180deg, transparent, var(--bg))', pointerEvents: 'none' }} />
              <Button
                onClick={() => {
                  if (!requireAuth()) return;
                  save.mutate(r.id);
                }}
                className="sz-press"
                style={{ ...pressVars(0.97), flex: 1, height: 56, border: 'none', borderRadius: 17, background: r.viewer.saved ? 'var(--surface)' : 'var(--invert-bg)', color: r.viewer.saved ? 'var(--text)' : 'var(--invert-fg)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, transition: 'transform .2s' }}
              >
                <BookmarkIcon size={19} fill={r.viewer.saved ? accent : 'var(--invert-fg)'} stroke={r.viewer.saved ? accent : 'var(--invert-fg)'} strokeWidth={2} />
                {r.viewer.saved ? 'Saved' : 'Save recipe'}
              </Button>
              <Button
                onClick={() => setCommentsFor(r.id)}
                className="sz-press"
                title="Comments"
                aria-label="Comments"
                style={{ ...pressVars(0.93), height: 56, flex: 'none', padding: '0 16px', border: '1.5px solid var(--line-2)', borderRadius: 17, background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'transform .2s' }}
              >
                <CommentIcon size={21} stroke="var(--text-muted)" strokeWidth={2} />
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{formatCount(r.counts.comments)}</span>
              </Button>
              <Button
                onClick={() => {
                  if (!requireAuth()) return;
                  download.mutate({ recipeId: r.id, downloaded: r.viewer.downloaded });
                }}
                className="sz-press"
                title={r.viewer.downloaded ? 'Downloaded for offline' : 'Save for offline'}
                style={{ ...pressVars(0.93), width: 56, height: 56, flex: 'none', border: `1.5px solid ${r.viewer.downloaded ? accent : 'var(--line-2)'}`, borderRadius: 17, background: r.viewer.downloaded ? accent : 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .2s' }}
              >
                <DownloadIcon size={22} stroke={r.viewer.downloaded ? '#fff' : 'var(--text-muted)'} strokeWidth={2.2} />
              </Button>
            </div>
          </>
        )}
      </div>

      {confirmDel && r && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 110, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <DismissBackdrop onDismiss={() => setConfirmDel(false)} />
          <div style={{ position: 'relative', width: '100%', background: 'var(--bg)', borderRadius: '26px 26px 0 0', padding: '24px 22px 30px', animation: 'sz-slideUp .32s cubic-bezier(.16,1,.3,1)' }}>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 25, color: 'var(--text)', textAlign: 'center' }}>Delete this post?</div>
            <p style={{ color: 'var(--text-faint)', fontSize: 14.5, textAlign: 'center', margin: '8px 0 20px', lineHeight: 1.45 }}>This permanently removes the video, recipe, likes and comments. This can’t be undone.</p>
            {del.isError && <div style={{ color: 'var(--danger-fg)', fontSize: 13.5, fontWeight: 600, textAlign: 'center', marginBottom: 12 }}>Couldn’t delete — please try again.</div>}
            <Button
              onClick={() => del.mutate(r.id, { onSuccess: () => { setConfirmDel(false); setOpenRecipe(null); } })}
              variant="danger"
              size="lg"
              fullWidth
              loading={del.isPending}
              loadingLabel="Deleting…"
              leadingIcon={<TrashIcon size={19} stroke="currentColor" strokeWidth={2} />}
            >
              Delete post
            </Button>
            <Button variant="outline" fullWidth onClick={() => setConfirmDel(false)} style={{ marginTop: 10 }}>Cancel</Button>
          </div>
        </div>
      )}

      {showMadeIt && r && (
        <MadeItPrompt recipeId={r.id} recipeTitle={r.title} onClose={() => setShowMadeIt(false)} />
      )}
    </div>
  );
}

/** Plays the recipe's actual clip in the sheet header (MP4 native, HLS via hls.js). */
function RecipeHeaderVideo({ src, poster, onExpand }: { src: string; poster?: string | null; onExpand: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const v = ref.current;
    if (!v || !src) return;
    let destroyed = false;
    let hls: { destroy: () => void } | null = null;
    if (src.includes('.m3u8') && !v.canPlayType('application/vnd.apple.mpegurl')) {
      void import('hls.js').then(({ default: Hls }) => {
        if (destroyed) return;
        if (Hls.isSupported()) {
          const h = new Hls({ enableWorker: true, capLevelToPlayerSize: true, maxBufferLength: 10 });
          h.loadSource(src);
          h.attachMedia(v);
          hls = h;
        } else {
          v.src = src;
        }
      });
    } else {
      v.src = src;
    }
    return () => { destroyed = true; hls?.destroy(); };
  }, [src]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <video
        ref={ref}
        poster={poster ?? undefined}
        muted={muted}
        loop
        autoPlay
        playsInline
        preload="metadata"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <Button onClick={toggle} aria-label={paused ? 'Play video' : 'Pause video'} style={{ position: 'absolute', inset: 0, zIndex: 1, border: 0, background: 'transparent', cursor: 'pointer' }} />
      {paused && (
        <div style={{ position: 'absolute', zIndex: 2, top: '46%', left: '50%', transform: 'translate(-50%,-50%)', width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <PlayIcon size={24} />
        </div>
      )}
      <Button
        onClick={(e) => { e.stopPropagation(); const v = ref.current; if (v) { v.muted = !v.muted; setMuted(v.muted); } }}
        aria-label={muted ? 'Unmute' : 'Mute'}
        style={{ position: 'absolute', bottom: 64, right: 62, zIndex: 5, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        {muted ? <SpeakerOffIcon size={19} /> : <SpeakerIcon size={19} />}
      </Button>
      <Button
        onClick={(e) => { e.stopPropagation(); onExpand(); }}
        aria-label="Watch full screen"
        style={{ position: 'absolute', bottom: 64, right: 16, zIndex: 5, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      </Button>
    </div>
  );
}

/** Serving count after scaling — rounded to the nearest half. */
function formatServes(n: number): string {
  return String(Math.round(n * 2) / 2);
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text-soft)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{value}</div>
    </div>
  );
}
