import { memo, useEffect, useRef, useState } from 'react';
import { Button, GlassButton, IconButton, ReactionButton } from './controls';
import { GlowButton } from './glow';
import type { RecipeCard } from '@sizzle/shared';
import { useAuth } from '../auth/useAuth';
import { useRequireAuth } from '../auth/useRequireAuth';
import { useForYouFeed, useFollowingFeed, useMe, useToggleDislike, useToggleFollow, useToggleLike, useToggleRepost, useToggleSave } from '../data/queries';
import { apiSend } from '../lib/api';
import { useSizzle } from '../store';
import { theme } from '../theme';
import { formatCount } from '../lib/format';
import { VideoPlayer } from './VideoPlayer';
import { getLocalClip } from '../lib/localClips';
import { ImageCarousel } from './ImageCarousel';
import { VerifiedBadge } from './VerifiedBadge';
import { Hashtags } from './Hashtags';
import { StarRow } from './Stars';
import { ErrorBoundary } from './ErrorBoundary';
import { LoadingScreen } from './Splash';
import { markBootReady } from '../lib/bootProgress';
import { PosterImg } from './PosterImg';
import {
  CheckIcon,
  ChevronUpIcon,
  CloseIcon,
  DislikeIcon,
  DotsIcon,
  HeartIcon,
  PlayIcon,
  PlusIcon,
  RepostIcon,
} from './icons';

const accent = theme.accent;

export function Feed() {
  const feedKind = useSizzle((s) => s.feed);
  const setFeed = useSizzle((s) => s.setFeed);
  const immersive = useSizzle((s) => s.immersive);

  const forYou = useForYouFeed();
  const following = useFollowingFeed();
  const active = feedKind === 'foryou' ? forYou : following;

  const fyActive = feedKind === 'foryou';
  const flActive = feedKind === 'following';
  const items = active.data?.pages.flatMap((p) => p.items) ?? [];
  const followingEmpty = feedKind === 'following' && !active.isLoading && items.length === 0;

  // The feed settling (loaded or errored) is the app's "we're interactive now"
  // signal — complete the launch progress bar to 100%.
  useEffect(() => {
    if (!active.isLoading) markBootReady();
  }, [active.isLoading]);
  const loadMore = () => {
    if (active.hasNextPage && !active.isFetchingNextPage) void active.fetchNextPage();
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0c0a09' }}>
      <div style={{ position: 'absolute', top: 'calc(54px + var(--sat, 0px))', left: 0, right: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, opacity: immersive ? 0 : 1, pointerEvents: immersive ? 'none' : 'auto', transition: 'opacity .28s ease' }}>
        <Button
          onClick={() => setFeed('foryou')}
          aria-pressed={fyActive}
          className="sz-feed-tab"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 2px', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, color: fyActive ? '#fff' : 'rgba(255,255,255,.55)' }}
        >
          For You
          <div style={{ height: 3, borderRadius: 2, marginTop: 5, background: fyActive ? accent : 'transparent' }} />
        </Button>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,.25)' }} />
        <Button
          onClick={() => setFeed('following')}
          aria-pressed={flActive}
          className="sz-feed-tab"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 2px', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, color: flActive ? '#fff' : 'rgba(255,255,255,.55)' }}
        >
          Following
          <div style={{ height: 3, borderRadius: 2, marginTop: 5, background: flActive ? accent : 'transparent' }} />
        </Button>
      </div>

      {active.isLoading ? (
        <FeedLoading />
      ) : active.isError && items.length === 0 ? (
        <FeedError onRetry={() => active.refetch()} retrying={active.isFetching} />
      ) : followingEmpty ? (
        <FollowingEmpty onExplore={() => setFeed('foryou')} />
      ) : (
        <FeedList items={items} onRefresh={() => active.refetch()} onEndReached={loadMore} />
      )}
    </div>
  );
}

/**
 * The vertical snap-scroll feed with a TikTok-style pull-to-refresh. When the
 * list is scrolled to the very top, dragging down past a threshold spins a
 * loader and refetches the active feed. The touchmove listener is attached
 * non-passively (so it can preventDefault and not fight native scroll), and the
 * whole scroller translates with the pull for a smooth, rubber-band settle.
 */
function FeedList({ items, onRefresh, onEndReached }: { items: RecipeCard[]; onRefresh: () => Promise<unknown>; onEndReached?: () => void }) {
  // Suppress feed video playback whenever a FULL-SCREEN overlay is up — otherwise
  // the feed clip keeps streaming (Stream egress) and can double up audio behind
  // a recipe/cook/upload/viewer surface. Partial sheets (comments, share) are
  // intentionally excluded so under-sheet playback continues there.
  const suppressed = useSizzle(
    (s) => !!(s.openRecipe || s.cookFor || s.showUpload || s.viewer || s.openCook),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onEndRef = useRef(onEndReached);
  onEndRef.current = onEndReached;
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const THRESH = 64;
  const MAX = 92;
  const REST = 52;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const drag = { startY: 0, active: false };
    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      drag.active = el.scrollTop <= 0;
      drag.startY = e.touches[0]?.clientY ?? 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!drag.active || refreshingRef.current) return;
      if (el.scrollTop > 0) { drag.active = false; setDragging(false); setPull(0); return; }
      const dy = (e.touches[0]?.clientY ?? 0) - drag.startY;
      if (dy <= 0) { setDragging(false); setPull(0); return; }
      e.preventDefault(); // hold the native scroll while we rubber-band
      setDragging(true);
      setPull(Math.min(MAX, dy * 0.5)); // damped
    };
    const onEnd = () => {
      if (!drag.active) return;
      drag.active = false;
      setDragging(false);
      setPull((p) => {
        if (p >= THRESH && !refreshingRef.current) {
          refreshingRef.current = true;
          setRefreshing(true);
          Promise.resolve(onRefreshRef.current())
            .catch(() => {})
            .finally(() => {
              refreshingRef.current = false;
              setRefreshing(false);
              setPull(0);
            });
          return REST; // hold while the spinner runs
        }
        return 0;
      });
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  // Infinite scroll: load the next page when the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !onEndRef.current) return;
    const io = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) onEndRef.current?.(); }, {
      root: scrollRef.current,
      rootMargin: '800px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [items.length]);

  const offset = refreshing ? REST : pull;
  const showInd = pull > 0 || refreshing;
  const progress = Math.min(1, pull / THRESH);

  return (
    <>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, pointerEvents: 'none', opacity: showInd ? 1 : 0, transition: 'opacity .2s ease' }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: '2.5px solid rgba(255,255,255,.25)',
            borderTopColor: '#fff',
            transform: refreshing ? undefined : `rotate(${progress * 300}deg)`,
            animation: refreshing ? 'sz-spin .7s linear infinite' : undefined,
            opacity: refreshing ? 1 : 0.35 + progress * 0.65,
          }}
        />
      </div>
      <div
        ref={scrollRef}
        // overscrollBehaviorY:contain stops iOS from rubber-band-locking at the
        // last video (WebKit can get stuck at the scroll boundary with mandatory
        // snap and refuse to scroll back up). WebkitOverflowScrolling keeps
        // momentum. See scrollSnapStop on the cards below.
        style={{ position: 'absolute', inset: 0, overflowY: 'scroll', scrollSnapType: 'y mandatory', overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch', transform: offset ? `translateY(${offset}px)` : undefined, transition: dragging ? 'none' : 'transform .34s cubic-bezier(.16,1,.3,1)' }}
      >
        {items.map((card) => (
          <ErrorBoundary key={card.id}>
            <FeedCard card={card} suppressed={suppressed} />
          </ErrorBoundary>
        ))}
        <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />
      </div>
    </>
  );
}

function FeedLoading() {
  return <LoadingScreen />;
}

function FeedError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center', animation: 'sz-fadeIn .4s' }}>
      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: '#fff' }}>Can’t load the feed</div>
      <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 15, margin: '10px 0 22px', maxWidth: 260 }}>Check your connection and try again — your recipes are waiting.</p>
      <Button variant="primary" size="lg" onClick={onRetry} loading={retrying} loadingLabel="Retrying…">
        Try again
      </Button>
    </div>
  );
}

function FollowingEmpty({ onExplore }: { onExplore: () => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center', animation: 'sz-fadeIn .4s' }}>
      <div style={{ width: 70, height: 70, borderRadius: 24, background: `linear-gradient(135deg,${accent},#c23a1a)`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
        <HeartIcon size={34} stroke="#fff" strokeWidth={2} />
      </div>
      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: '#fff' }}>No cooks yet</div>
      <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 15, margin: '10px 0 22px', maxWidth: 240 }}>Follow a few cooks and their recipes show up right here.</p>
      <GlowButton size="lg" onClick={onExplore}>
        Explore For You
      </GlowButton>
    </div>
  );
}

const railLabel = { color: '#fff', fontSize: 12.5, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,.4)' } as const;

function logView(recipeId: string, dwellMs: number) {
  if (dwellMs < 300) return; // ignore flicker
  void apiSend('POST', `/recipes/${recipeId}/view`, {
    dwellMs,
    completed: dwellMs > 3000,
    skipped: dwellMs < 1500,
  }).catch(() => {});
}

/**
 * One full-bleed feed card. Reused by the profile/recipe full-screen viewer:
 * when `onClose` is provided it renders in "viewer" mode with a close control,
 * giving posted/saved videos the exact same TikTok-style player as the feed.
 */
export const FeedCard = memo(function FeedCard({ card, onClose, suppressed = false }: { card: RecipeCard; onClose?: () => void; suppressed?: boolean }) {
  const requireAuth = useRequireAuth();
  const authed = useAuth((s) => s.status === 'authed');
  const isReview = card.postType === 'review';
  const immersive = useSizzle((s) => s.immersive);
  const setImmersive = useSizzle((s) => s.setImmersive);

  // Hold-to-hide: a long press (that isn't a scroll) toggles immersive mode.
  const pressTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const longFired = useRef(false);
  const clearPress = () => {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  useEffect(() => clearPress, []);
  const onPressDown = (e: React.PointerEvent) => {
    pressOrigin.current = { x: e.clientX, y: e.clientY };
    longFired.current = false;
    clearPress();
    pressTimer.current = window.setTimeout(() => {
      longFired.current = true;
      pressTimer.current = null;
      setImmersive(!useSizzle.getState().immersive);
    }, 380);
  };
  const onPressMove = (e: React.PointerEvent) => {
    const o = pressOrigin.current;
    if (!o || pressTimer.current == null) return;
    if (Math.abs(e.clientX - o.x) > 12 || Math.abs(e.clientY - o.y) > 12) clearPress();
  };
  // Swallow the click that ends a long press so it doesn't also toggle play/pause.
  const onClickCapture = (e: React.MouseEvent) => {
    if (longFired.current) {
      e.stopPropagation();
      e.preventDefault();
      longFired.current = false;
    }
  };
  // Each overlay fades out (and stops taking taps) in immersive mode.
  const overlayFade: React.CSSProperties = {
    opacity: immersive ? 0 : 1,
    pointerEvents: immersive ? 'none' : undefined,
    transition: 'opacity .28s ease',
  };
  const cardRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  // Play only when on-screen AND not covered by a full-screen overlay (H): a
  // recipe/cook/upload/viewer sheet suppresses the feed video underneath.
  const active = visible && !suppressed;
  // `near` = within ~1 screen of the viewport. Only near cards mount a video
  // element (+ hls.js); far cards render just a poster. This keeps a handful of
  // decoders alive instead of one per feed item — the big Android perf win.
  const [near, setNear] = useState(false);
  const like = useToggleLike();
  const dislike = useToggleDislike();
  const save = useToggleSave();
  const follow = useToggleFollow();
  const repost = useToggleRepost();

  // Drive video playback (active when ≥60% on screen) and log a watch event
  // (dwell → completed/skipped) when the card is scrolled past.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    let start = 0;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const onScreen = e.isIntersecting && e.intersectionRatio >= 0.6;
          setVisible(onScreen);
          if (onScreen) {
            start = Date.now();
            // Swiping to a new video closes a comments sheet left open on the
            // previous one (it shouldn't hang over a different recipe).
            const open = useSizzle.getState().commentsFor;
            if (open && open !== card.id) useSizzle.getState().setCommentsFor(null);
          } else if (start) {
            if (authed) logView(card.id, Date.now() - start);
            start = 0;
          }
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    obs.observe(el);
    // Preload window: mount the video while the card is within ~1 screen so
    // there's no black flash when it becomes active.
    const nearObs = new IntersectionObserver(
      (entries) => { for (const e of entries) setNear(e.isIntersecting); },
      { rootMargin: '120% 0px 120% 0px', threshold: 0 },
    );
    nearObs.observe(el);
    return () => {
      if (start && authed) logView(card.id, Date.now() - start);
      obs.disconnect();
      nearObs.disconnect();
    };
  }, [authed, card.id]);

  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const setOpenCook = useSizzle((s) => s.setOpenCook);
  const setCommentsFor = useSizzle((s) => s.setCommentsFor);
  const openMore = useSizzle((s) => s.openMore);
  const setRepostFor = useSizzle((s) => s.setRepostFor);
  const myId = useMe().data?.id;

  const { cook, viewer, counts, controls } = card;
  const hasImages = card.images.length > 0;
  // Prefer the HLS stream (Cloudflare: adaptive bitrate, CDN egress) over the
  // raw MP4; mp4Url stays as the fallback for the bundled seed videos. A clip
  // YOU just posted plays instantly from the still-on-device local file
  // (TikTok-style) while Cloudflare transcodes — no "Processing…" wait for the
  // creator; the remote HLS takes over on the next mount once it's ready.
  const remoteSrc = !hasImages ? card.video?.hlsUrl || card.video?.mp4Url || null : null;
  const videoSrc = remoteSrc ?? (!hasImages ? getLocalClip(card.id) : null);
  // Controls are now persisted server-side + enforced for every viewer.
  const showLikes = controls.likesEnabled;
  const showComments = controls.commentsEnabled;
  const hideCount = !controls.countsVisible;

  const gated = (fn: () => void) => () => {
    if (!requireAuth()) return;
    fn();
  };

  // The share arrow opens the send-to-friend sheet (DM a recipe card — the
  // strongest endorsement signal); copy-link / native share live inside it.
  const setSendRecipeFor = useSizzle((s) => s.setSendRecipeFor);
  const onShare = () => {
    if (!requireAuth()) return;
    setSendRecipeFor({ id: card.id, title: card.title });
  };

  return (
    <div
      ref={cardRef}
      onPointerDownCapture={onPressDown}
      onPointerMoveCapture={onPressMove}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onPointerLeave={clearPress}
      onClickCapture={onClickCapture}
      style={{ position: 'relative', height: 'var(--app-h)', scrollSnapAlign: 'start', scrollSnapStop: 'always', overflow: 'hidden', background: card.bg }}
    >
      {hasImages ? (
        <ImageCarousel images={card.images} />
      ) : videoSrc && near ? (
        <VideoPlayer src={videoSrc} poster={card.video?.posterUrl} active={active} immersive={immersive} />
      ) : (
        card.video?.posterUrl && (
          <PosterImg src={card.video.posterUrl} alt="" decoding="async" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )
      )}
      {!videoSrc && !hasImages && (
        <>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(70% 50% at 72% 28%, rgba(244,165,44,.4), transparent 70%)' }} />
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.1, background: 'repeating-linear-gradient(125deg,#000 0 2px, transparent 2px 8px)' }} />
        </>
      )}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, transparent 22%, transparent 50%, rgba(0,0,0,.85) 100%)', opacity: immersive ? 0 : 1, transition: 'opacity .28s ease' }} />

      {!videoSrc && !hasImages && (() => {
        const st = card.video?.status;
        // A clip whose asset isn't ready yet (Cloudflare still transcoding) has no
        // playable URL — show an honest "Processing…" state instead of a dead play
        // button (which read as "tap me" and did nothing). 'error' = it failed.
        if (st === 'pending' || st === 'uploading' || st === 'processing') {
          return (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', border: '3px solid rgba(255,255,255,.25)', borderTopColor: '#fff', animation: 'sz-spin .8s linear infinite' }} />
              <div style={{ color: 'rgba(255,255,255,.92)', fontSize: 14, fontWeight: 700 }}>Processing your video…</div>
              <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 12.5 }}>It'll start playing in a moment.</div>
            </div>
          );
        }
        if (st === 'error') {
          return (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: 'rgba(255,255,255,.85)', fontSize: 14, fontWeight: 700, padding: '0 32px' }}>
              This video couldn't be processed.
            </div>
          );
        }
        return (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
            <PlayIcon size={26} />
          </div>
        );
      })()}

      {card.repost && (
        <div style={{ position: 'absolute', top: 140, left: 16, right: 64, zIndex: 18, display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(0,0,0,.32)', backdropFilter: 'blur(6px)', borderRadius: 12, padding: '8px 11px', ...overlayFade }}>
          <RepostIcon size={16} stroke="#fff" strokeWidth={2} />
          <div>
            <div style={{ color: '#fff', fontSize: 12.5, fontWeight: 700 }}>Reposted by {card.repost.byName}</div>
            {card.repost.comment && <div style={{ color: 'rgba(255,255,255,.85)', fontSize: 12.5, marginTop: 2, lineHeight: 1.35 }}>{card.repost.comment}</div>}
          </div>
        </div>
      )}

      {onClose && (
        <IconButton
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          label="Close full screen"
          variant="glass"
          size="sm"
          style={{ position: 'absolute', top: 50, left: 14, zIndex: 30 }}
        >
          <CloseIcon size={20} stroke="#fff" strokeWidth={2.4} />
        </IconButton>
      )}

      <IconButton
        onClick={() => openMore(card.id, !!myId && card.cook.id === myId)}
        label="More post options"
        variant="glass"
        size="sm"
        style={{ position: 'absolute', top: 96, right: 16, zIndex: 25, ...overlayFade }}
      >
        <DotsIcon size={20} />
      </IconButton>

      <div style={{ position: 'absolute', right: 14, bottom: 'calc(94px + max(var(--sab, 0px), 24px))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, zIndex: 20, ...overlayFade }}>
        <div style={{ position: 'relative', marginBottom: 4 }}>
          <Button
            onClick={() => setOpenCook(cook.id)}
            aria-label={`View ${cook.name}'s profile`}
            style={{ width: 50, height: 50, borderRadius: '50%', border: '2px solid #fff', background: cook.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 20, color: '#fff', cursor: 'pointer', padding: 0, overflow: 'hidden' }}
          >
            {cook.avatarUrl ? <img src={cook.avatarUrl} alt="" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : cook.init}
          </Button>
          <IconButton
            onClick={gated(() => follow.mutate({ cookId: cook.id, following: viewer.following }))}
            label={viewer.following ? `Following ${cook.name}` : `Follow ${cook.name}`}
            selected={viewer.following}
            variant={viewer.following ? 'tonal' : 'primary'}
            size="xs"
            className="sz-follow-badge"
            style={{ position: 'absolute', bottom: -9, left: '50%', transform: 'translateX(-50%)' }}
          >
            {viewer.following ? <CheckIcon size={13} stroke="#1b1512" strokeWidth={3} /> : <PlusIcon size={14} stroke="#fff" strokeWidth={3} />}
          </IconButton>
        </div>

        {showLikes && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <ReactionButton reaction="like" active={viewer.liked} count={hideCount ? 'Like' : formatCount(counts.likes)} onMedia onClick={gated(() => like.mutate(card.id))} />
            <Button aria-label={`Dislike post, ${viewer.disliked ? 'selected' : 'not selected'}${hideCount ? '' : `, ${formatCount(counts.dislikes)} dislikes`}`} aria-pressed={viewer.disliked} className="sz-reaction sz-reaction--media" onClick={gated(() => dislike.mutate(card.id))}>
              <div style={{ transition: 'transform .3s cubic-bezier(.34,1.56,.64,1)', transform: viewer.disliked ? 'scale(1.12)' : 'scale(1)' }}>
                <DislikeIcon size={30} fill={viewer.disliked ? '#fff' : 'none'} stroke="#fff" strokeWidth={1.7} />
              </div>
              <span style={railLabel}>{hideCount ? 'No' : formatCount(counts.dislikes)}</span>
            </Button>
          </div>
        )}

        {showComments && (
          <ReactionButton reaction="comment" count={hideCount ? undefined : formatCount(counts.comments)} onMedia onClick={() => setCommentsFor(card.id)} />
        )}

        <ReactionButton reaction="save" active={viewer.saved} count={hideCount ? (viewer.saved ? 'Saved' : 'Save') : formatCount(counts.saves)} onMedia onClick={gated(() => save.mutate(card.id))} />
        {/* Repost is for sharing OTHER cooks' videos to your followers — never your own. */}
        {card.cook.id !== myId && (
          <ReactionButton
            reaction="repost"
            active={viewer.reposted}
            count={viewer.reposted ? 'Reposted' : 'Repost'}
            onMedia
            onClick={gated(() => {
              if (viewer.reposted) repost.mutate({ recipeId: card.id, reposted: true });
              else setRepostFor(card.id);
            })}
          />
        )}
        <ReactionButton reaction="share" count={hideCount ? undefined : formatCount(counts.shares)} onMedia onClick={onShare} />
      </div>

      <div style={{ position: 'absolute', left: 18, right: 80, bottom: 'calc(84px + max(var(--sab, 0px), 24px))', zIndex: 15, ...overlayFade }}>
        <Button onClick={() => setOpenCook(cook.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span style={{ color: '#fff', fontSize: 15, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,.5)' }}>{cook.name}</span>
          <VerifiedBadge tier={cook.verifiedTier} size={15} />
          <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 13, marginLeft: 2 }}>@{cook.handle}</span>
        </Button>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginBottom: 10 }}>
          {isReview && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,181,46,.92)', color: '#3a2400', fontSize: 11.5, fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 9 }}>
              <StarRow value={card.rating} size={11} />
              Review
            </span>
          )}
          <span style={{ display: 'inline-block', background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.25)', color: '#fff', fontSize: 11.5, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', padding: '5px 11px', borderRadius: 9 }}>
            {isReview ? card.cuisine : `${card.cuisine} · ${card.time}`}
          </span>
        </div>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 33, lineHeight: 1.02, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,.5)', marginBottom: card.hashtags.length ? 8 : 14 }}>{card.title}</div>
        {card.hashtags.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <Hashtags tags={card.hashtags.slice(0, 3)} size={13} onColor="#ffd9cd" />
          </div>
        )}
        <GlassButton
          onClick={() => { onClose?.(); setOpenRecipe(card.id); }}
          leadingIcon={<ChevronUpIcon size={17} stroke="#fff" strokeWidth={2.4} />}
        >
          {isReview ? 'View review' : 'View recipe'}
        </GlassButton>
      </div>
    </div>
  );
});
