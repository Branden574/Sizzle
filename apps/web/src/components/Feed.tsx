import { useEffect, useRef } from 'react';
import type { RecipeCard } from '@sizzle/shared';
import { useAuth } from '../auth/useAuth';
import { useRequireAuth } from '../auth/useRequireAuth';
import { useForYouFeed, useFollowingFeed, useToggleDislike, useToggleFollow, useToggleLike, useToggleSave } from '../data/queries';
import { apiSend } from '../lib/api';
import { useSizzle } from '../store';
import { theme } from '../theme';
import { formatCount } from '../lib/format';
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
  ShareIcon,
} from './icons';
import { pressVars } from './ui';

const accent = theme.accent;

export function Feed() {
  const feedKind = useSizzle((s) => s.feed);
  const setFeed = useSizzle((s) => s.setFeed);

  const forYou = useForYouFeed();
  const following = useFollowingFeed();
  const active = feedKind === 'foryou' ? forYou : following;

  const fyActive = feedKind === 'foryou';
  const flActive = feedKind === 'following';
  const items = active.data?.items ?? [];
  const followingEmpty = feedKind === 'following' && !active.isLoading && items.length === 0;

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0c0a09' }}>
      <div style={{ position: 'absolute', top: 54, left: 0, right: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
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
            <FeedCard key={card.id} card={card} />
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
  const cardRef = useRef<HTMLDivElement>(null);
  const like = useToggleLike();
  const dislike = useToggleDislike();
  const save = useToggleSave();
  const follow = useToggleFollow();

  // Log a watch event (dwell → completed/skipped) when this card is scrolled past.
  useEffect(() => {
    if (!authed) return;
    const el = cardRef.current;
    if (!el) return;
    let start = 0;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            start = Date.now();
          } else if (start) {
            logView(card.id, Date.now() - start);
            start = 0;
          }
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    obs.observe(el);
    return () => {
      if (start) logView(card.id, Date.now() - start);
      obs.disconnect();
    };
  }, [authed, card.id]);

  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const setOpenCook = useSizzle((s) => s.setOpenCook);
  const setCommentsFor = useSizzle((s) => s.setCommentsFor);
  const setSettingsFor = useSizzle((s) => s.setSettingsFor);
  const local = useSizzle((s) => s.postSettings[card.id]) ?? {};

  const { cook, viewer, counts, controls } = card;
  const showLikes = controls.likesEnabled && !local.likesOff;
  const showComments = controls.commentsEnabled && !local.commentsOff;
  const hideCount = !controls.countsVisible || !!local.hideCount;

  const gated = (fn: () => void) => () => {
    if (!requireAuth()) return;
    fn();
  };

  return (
    <div ref={cardRef} style={{ position: 'relative', height: 852, scrollSnapAlign: 'start', overflow: 'hidden', background: card.bg }}>
      {card.video?.posterUrl && (
        <img src={card.video.posterUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(70% 50% at 72% 28%, rgba(244,165,44,.4), transparent 70%)' }} />
      <div style={{ position: 'absolute', inset: 0, opacity: 0.1, background: 'repeating-linear-gradient(125deg,#000 0 2px, transparent 2px 8px)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, transparent 22%, transparent 50%, rgba(0,0,0,.85) 100%)' }} />

      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
        <PlayIcon size={26} />
      </div>

      <button
        onClick={() => setSettingsFor(card.id)}
        style={{ position: 'absolute', top: 96, right: 16, zIndex: 25, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.28)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <DotsIcon size={20} />
      </button>

      <div style={{ position: 'absolute', right: 14, bottom: 118, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, zIndex: 20 }}>
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
          <span style={railLabel}>{viewer.saved ? 'Saved' : 'Save'}</span>
        </button>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0 }}>
          <ShareIcon size={30} stroke="#fff" strokeWidth={1.8} />
          {!hideCount && <span style={railLabel}>{formatCount(counts.shares)}</span>}
        </button>
      </div>

      <div style={{ position: 'absolute', left: 18, right: 80, bottom: 108, zIndex: 15 }}>
        <button onClick={() => setOpenCook(cook.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ color: '#fff', fontSize: 15, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,.5)' }}>{cook.name}</span>
          <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>@{cook.handle}</span>
        </button>
        <div style={{ display: 'inline-block', background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.25)', color: '#fff', fontSize: 11.5, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', padding: '5px 11px', borderRadius: 9, marginBottom: 10 }}>
          {card.cuisine} · {card.time}
        </div>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 33, lineHeight: 1.02, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,.5)', marginBottom: 14 }}>{card.title}</div>
        <button
          onClick={() => setOpenRecipe(card.id)}
          className="sz-press"
          style={{ ...pressVars(0.95), display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: 'none', padding: '13px 20px', borderRadius: 15, cursor: 'pointer', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, color: '#1b1512', boxShadow: '0 6px 18px -4px rgba(0,0,0,.5)', transition: 'transform .2s cubic-bezier(.34,1.56,.64,1)' }}
        >
          <ChevronUpIcon size={17} stroke="#1b1512" strokeWidth={2.4} />
          View recipe
        </button>
      </div>
    </div>
  );
}
