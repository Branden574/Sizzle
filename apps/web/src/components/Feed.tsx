import { recipes, cookById } from '../data';
import { useSizzle } from '../store';
import { theme } from '../theme';
import type { Recipe } from '../types';
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
  const feed = useSizzle((s) => s.feed);
  const followed = useSizzle((s) => s.followed);
  const setFeed = useSizzle((s) => s.setFeed);

  const followingCards = recipes.filter((r) => followed[r.cook]);
  const activeCards = feed === 'foryou' ? recipes : followingCards;
  const followingEmpty = feed === 'following' && followingCards.length === 0;

  const fyActive = feed === 'foryou';
  const flActive = feed === 'following';

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0c0a09' }}>
      {/* For You / Following */}
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

      {followingEmpty ? (
        <FollowingEmpty onExplore={() => setFeed('foryou')} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, overflowY: 'scroll', scrollSnapType: 'y mandatory' }}>
          {activeCards.map((r) => (
            <FeedCard key={r.id} recipe={r} />
          ))}
        </div>
      )}
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

function railLabelStyle() {
  return { color: '#fff', fontSize: 12.5, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,.4)' } as const;
}

function FeedCard({ recipe: r }: { recipe: Recipe }) {
  const liked = useSizzle((s) => !!s.likes[r.id]);
  const disliked = useSizzle((s) => !!s.dislikes[r.id]);
  const saved = useSizzle((s) => !!s.saves[r.id]);
  const followed = useSizzle((s) => !!s.followed[r.cook]);
  const set = useSizzle((s) => s.postSettings[r.id]) || {};

  const onLike = useSizzle((s) => s.onLike);
  const onDislike = useSizzle((s) => s.onDislike);
  const toggle = useSizzle((s) => s.toggle);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const setOpenCook = useSizzle((s) => s.setOpenCook);
  const setCommentsFor = useSizzle((s) => s.setCommentsFor);
  const setSettingsFor = useSizzle((s) => s.setSettingsFor);

  const c = cookById(r.cook)!;
  const showLikes = !set.likesOff;
  const showComments = !set.commentsOff;
  const hideCount = !!set.hideCount;

  return (
    <div style={{ position: 'relative', height: 852, scrollSnapAlign: 'start', overflow: 'hidden', background: r.bg }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(70% 50% at 72% 28%, rgba(244,165,44,.4), transparent 70%)' }} />
      <div style={{ position: 'absolute', inset: 0, opacity: 0.1, background: 'repeating-linear-gradient(125deg,#000 0 2px, transparent 2px 8px)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, transparent 22%, transparent 50%, rgba(0,0,0,.85) 100%)' }} />

      {/* center play affordance */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
        <PlayIcon size={26} />
      </div>

      {/* ••• creator menu */}
      <button
        onClick={() => setSettingsFor(r.id)}
        style={{ position: 'absolute', top: 96, right: 16, zIndex: 25, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.28)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <DotsIcon size={20} />
      </button>

      {/* right rail */}
      <div style={{ position: 'absolute', right: 14, bottom: 118, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, zIndex: 20 }}>
        <div style={{ position: 'relative', marginBottom: 4 }}>
          <button
            onClick={() => setOpenCook(r.cook)}
            style={{ width: 50, height: 50, borderRadius: '50%', border: '2px solid #fff', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 20, color: '#fff', cursor: 'pointer', padding: 0 }}
          >
            {c.init}
          </button>
          <button
            onClick={() => toggle('followed', r.cook)}
            style={{ position: 'absolute', bottom: -9, left: '50%', transform: 'translateX(-50%)', width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: followed ? 'rgba(255,255,255,.9)' : accent, transition: 'all .3s cubic-bezier(.34,1.56,.64,1)' }}
          >
            {followed ? <CheckIcon size={13} stroke="#1b1512" strokeWidth={3} /> : <PlusIcon size={14} stroke="#fff" strokeWidth={3} />}
          </button>
        </div>

        {showLikes && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <button onClick={() => onLike(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0 }}>
              <div style={{ transition: 'transform .3s cubic-bezier(.34,1.56,.64,1)', transform: liked ? 'scale(1.12)' : 'scale(1)' }}>
                <HeartIcon size={34} fill={liked ? accent : 'none'} stroke={liked ? accent : '#fff'} strokeWidth={1.8} />
              </div>
              <span style={railLabelStyle()}>{hideCount ? 'Like' : r.likeCount}</span>
            </button>
            <button onClick={() => onDislike(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0 }}>
              <div style={{ transition: 'transform .3s cubic-bezier(.34,1.56,.64,1)', transform: disliked ? 'scale(1.12)' : 'scale(1)' }}>
                <DislikeIcon size={30} fill={disliked ? '#fff' : 'none'} stroke="#fff" strokeWidth={1.7} />
              </div>
              <span style={railLabelStyle()}>{hideCount ? 'No' : r.dislikeCount}</span>
            </button>
          </div>
        )}

        {showComments && (
          <button onClick={() => setCommentsFor(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0 }}>
            <CommentIcon size={32} stroke="#fff" strokeWidth={1.8} />
            <span style={railLabelStyle()}>{r.commentCount}</span>
          </button>
        )}

        <button onClick={() => toggle('saves', r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0 }}>
          <BookmarkIcon size={30} fill={saved ? accent : 'none'} stroke={saved ? accent : '#fff'} strokeWidth={1.8} />
          <span style={railLabelStyle()}>{saved ? 'Saved' : 'Save'}</span>
        </button>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0 }}>
          <ShareIcon size={30} stroke="#fff" strokeWidth={1.8} />
          <span style={railLabelStyle()}>{r.shareCount}</span>
        </button>
      </div>

      {/* bottom info */}
      <div style={{ position: 'absolute', left: 18, right: 80, bottom: 108, zIndex: 15 }}>
        <button onClick={() => setOpenCook(r.cook)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ color: '#fff', fontSize: 15, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,.5)' }}>{c.name}</span>
          <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>{c.handle}</span>
        </button>
        <div style={{ display: 'inline-block', background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.25)', color: '#fff', fontSize: 11.5, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', padding: '5px 11px', borderRadius: 9, marginBottom: 10 }}>
          {r.cuisine} · {r.time}
        </div>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 33, lineHeight: 1.02, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,.5)', marginBottom: 14 }}>{r.title}</div>
        <button
          onClick={() => setOpenRecipe(r.id)}
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
