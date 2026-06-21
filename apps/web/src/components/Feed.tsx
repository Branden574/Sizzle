import { useEffect, useRef, useState } from 'react';
import type { RecipeCard } from '@sizzle/shared';
import { useAuth } from '../auth/useAuth';
import { useRequireAuth } from '../auth/useRequireAuth';
import { useForYouFeed, useFollowingFeed, useMe, useToggleDislike, useToggleFollow, useToggleLike, useToggleRepost, useToggleSave } from '../data/queries';
import { apiSend } from '../lib/api';
import { useSizzle } from '../store';
import { theme } from '../theme';
import { formatCount } from '../lib/format';
import { VideoPlayer } from './VideoPlayer';
import { VerifiedBadge } from './VerifiedBadge';
import { Hashtags } from './Hashtags';
import { StarRow } from './Stars';
import { ErrorBoundary } from './ErrorBoundary';
import {
  BookmarkIcon,
  CheckIcon,
  ChevronUpIcon,
  CommentIcon,
  DislikeIcon,
  DotsIcon,
  HeartIcon,
  PlayIcon,
  PlusIcon,
  RepostIcon,
  ShareIcon,
} from './icons';
import { pressVars } from './ui';

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
  const items = active.data?.items ?? [];
  const followingEmpty = feedKind === 'following' && !active.isLoading && items.length === 0;

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0c0a09' }}>
      <div style={{ position: 'absolute', top: 54, left: 0, right: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, opacity: immersive ? 0 : 1, pointerEvents: immersive ? 'none' : 'auto', transition: 'opacity .28s ease' }}>
        <button
          onClick={() => setFeed('foryou')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 2px', fontFamily: "'Hanken Grotesk'", fontSize: 17, fontWeight: 700, color: fyActive ? '#fff' : 'rgba(255,255,255,.55)' }}
        >
          For You
          <div style={{ height: 3, borderRadius: 2, marginTop: 5, background: fyActive ? accent : 'transparent' }} />
        </button>
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,.25)' }} />
        <button
          onClick={() => setFeed('following')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 2px', fontFamily: "'Hanken Grotesk'", fontSize: 17, fontWeight: 700, color: flActive ? '#fff' : 'rgba(255,255,255,.55)' }}
        >
          Following
          <div style={{ height: 3, borderRadius: 2, marginTop: 5, background: flActive ? accent : 'transparent' }} />
        </button>
      </div>

      {active.isLoading ? (
        <FeedLoading />
      ) : followingEmpty ? (
        <FollowingEmpty onExplore={() => setFeed('foryou')} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, overflowY: 'scroll', scrollSnapType: 'y mandatory' }}>
          {items.map((card) => (
            <ErrorBoundary key={card.id}>
              <FeedCard card={card} />
            </ErrorBoundary>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedLoading() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 34, color: 'rgba(255,255,255,.25)' }}>Sizzle</div>
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
      <button onClick={onExplore} style={{ padding: '14px 26px', borderRadius: 16, border: 'none', background: accent, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
        Explore For You
      </button>
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

function FeedCard({ card }: { card: RecipeCard }) {
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
  const [active, setActive] = useState(false);
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
          const visible = e.isIntersecting && e.intersectionRatio >= 0.6;
          setActive(visible);
          if (visible) {
            start = Date.now();
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
  const local = useSizzle((s) => s.postSettings[card.id]) ?? {};

  const { cook, viewer, counts, controls } = card;
  const videoSrc = card.video?.mp4Url || card.video?.hlsUrl || null;
  const showLikes = controls.likesEnabled && !local.likesOff;
  const showComments = controls.commentsEnabled && !local.commentsOff;
  const hideCount = !controls.countsVisible || !!local.hideCount;

  const gated = (fn: () => void) => () => {
    if (!requireAuth()) return;
    fn();
  };

  // Native share sheet where available, otherwise copy the link to the clipboard.
  const onShare = () => {
    const url = `${location.origin}/r/${card.id}`;
    const title = card.title;
    if (navigator.share) {
      void navigator.share({ title, url }).catch(() => {});
    } else {
      void navigator.clipboard?.writeText(url).catch(() => {});
    }
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
      style={{ position: 'relative', height: 'var(--app-h)', scrollSnapAlign: 'start', overflow: 'hidden', background: card.bg }}
    >
      {videoSrc && near ? (
        <VideoPlayer src={videoSrc} poster={card.video?.posterUrl} active={active} immersive={immersive} />
      ) : (
        card.video?.posterUrl && (
          <img src={card.video.posterUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )
      )}
      {!videoSrc && (
        <>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(70% 50% at 72% 28%, rgba(244,165,44,.4), transparent 70%)' }} />
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.1, background: 'repeating-linear-gradient(125deg,#000 0 2px, transparent 2px 8px)' }} />
        </>
      )}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, transparent 22%, transparent 50%, rgba(0,0,0,.85) 100%)', opacity: immersive ? 0 : 1, transition: 'opacity .28s ease' }} />

      {!videoSrc && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
          <PlayIcon size={26} />
        </div>
      )}

      {card.repost && (
        <div style={{ position: 'absolute', top: 140, left: 16, right: 64, zIndex: 18, display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(0,0,0,.32)', backdropFilter: 'blur(6px)', borderRadius: 12, padding: '8px 11px', ...overlayFade }}>
          <RepostIcon size={16} stroke="#fff" strokeWidth={2} />
          <div>
            <div style={{ color: '#fff', fontSize: 12.5, fontWeight: 700 }}>Reposted by {card.repost.byName}</div>
            {card.repost.comment && <div style={{ color: 'rgba(255,255,255,.85)', fontSize: 12.5, marginTop: 2, lineHeight: 1.35 }}>{card.repost.comment}</div>}
          </div>
        </div>
      )}

      <button
        onClick={() => openMore(card.id, !!myId && card.cook.id === myId)}
        style={{ position: 'absolute', top: 96, right: 16, zIndex: 25, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.28)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', ...overlayFade }}
      >
        <DotsIcon size={20} />
      </button>

      <div style={{ position: 'absolute', right: 14, bottom: 118, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, zIndex: 20, ...overlayFade }}>
        <div style={{ position: 'relative', marginBottom: 4 }}>
          <button
            onClick={() => setOpenCook(cook.id)}
            style={{ width: 50, height: 50, borderRadius: '50%', border: '2px solid #fff', background: cook.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 20, color: '#fff', cursor: 'pointer', padding: 0, overflow: 'hidden' }}
          >
            {cook.avatarUrl ? <img src={cook.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : cook.init}
          </button>
          <button
            onClick={gated(() => follow.mutate({ cookId: cook.id, following: viewer.following }))}
            style={{ position: 'absolute', bottom: -9, left: '50%', transform: 'translateX(-50%)', width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: viewer.following ? 'rgba(255,255,255,.9)' : accent, transition: 'all .3s cubic-bezier(.34,1.56,.64,1)' }}
          >
            {viewer.following ? <CheckIcon size={13} stroke="#1b1512" strokeWidth={3} /> : <PlusIcon size={14} stroke="#fff" strokeWidth={3} />}
          </button>
        </div>

        {showLikes && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <button onClick={gated(() => like.mutate(card.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0 }}>
              <div style={{ transition: 'transform .3s cubic-bezier(.34,1.56,.64,1)', transform: viewer.liked ? 'scale(1.12)' : 'scale(1)' }}>
                <HeartIcon size={34} fill={viewer.liked ? accent : 'none'} stroke={viewer.liked ? accent : '#fff'} strokeWidth={1.8} />
              </div>
              <span style={railLabel}>{hideCount ? 'Like' : formatCount(counts.likes)}</span>
            </button>
            <button onClick={gated(() => dislike.mutate(card.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0 }}>
              <div style={{ transition: 'transform .3s cubic-bezier(.34,1.56,.64,1)', transform: viewer.disliked ? 'scale(1.12)' : 'scale(1)' }}>
                <DislikeIcon size={30} fill={viewer.disliked ? '#fff' : 'none'} stroke="#fff" strokeWidth={1.7} />
              </div>
              <span style={railLabel}>{hideCount ? 'No' : formatCount(counts.dislikes)}</span>
            </button>
          </div>
        )}

        {showComments && (
          <button onClick={() => setCommentsFor(card.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0 }}>
            <CommentIcon size={32} stroke="#fff" strokeWidth={1.8} />
            {!hideCount && <span style={railLabel}>{formatCount(counts.comments)}</span>}
          </button>
        )}

        <button onClick={gated(() => save.mutate(card.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0 }}>
          <BookmarkIcon size={30} fill={viewer.saved ? accent : 'none'} stroke={viewer.saved ? accent : '#fff'} strokeWidth={1.8} />
          <span style={railLabel}>{hideCount ? (viewer.saved ? 'Saved' : 'Save') : formatCount(counts.saves)}</span>
        </button>
        <button
          onClick={gated(() => {
            if (viewer.reposted) repost.mutate({ recipeId: card.id, reposted: true });
            else setRepostFor(card.id);
          })}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0 }}
        >
          <RepostIcon size={31} stroke={viewer.reposted ? accent : '#fff'} strokeWidth={1.9} />
          <span style={{ ...railLabel, color: viewer.reposted ? accent : '#fff' }}>{viewer.reposted ? 'Reposted' : 'Repost'}</span>
        </button>
        <button onClick={onShare} aria-label="Share" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0 }}>
          <ShareIcon size={30} stroke="#fff" strokeWidth={1.8} />
          {!hideCount && <span style={railLabel}>{formatCount(counts.shares)}</span>}
        </button>
      </div>

      <div style={{ position: 'absolute', left: 18, right: 80, bottom: 108, zIndex: 15, ...overlayFade }}>
        <button onClick={() => setOpenCook(cook.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <span style={{ color: '#fff', fontSize: 15, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,.5)' }}>{cook.name}</span>
          <VerifiedBadge tier={cook.verifiedTier} size={15} />
          <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 13, marginLeft: 2 }}>@{cook.handle}</span>
        </button>
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
        <button
          onClick={() => setOpenRecipe(card.id)}
          className="sz-press"
          style={{ ...pressVars(0.95), display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: 'none', padding: '13px 20px', borderRadius: 15, cursor: 'pointer', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, color: '#1b1512', boxShadow: '0 6px 18px -4px rgba(0,0,0,.5)', transition: 'transform .2s cubic-bezier(.34,1.56,.64,1)' }}
        >
          <ChevronUpIcon size={17} stroke="#1b1512" strokeWidth={2.4} />
          {isReview ? 'View review' : 'View recipe'}
        </button>
      </div>
    </div>
  );
}
