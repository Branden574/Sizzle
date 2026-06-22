import { useState } from 'react';
import type { RecipeCard } from '@sizzle/shared';
import { useAuth } from '../auth/useAuth';
import { useRequireAuth } from '../auth/useRequireAuth';
import { useCook, useLikedFeed, useMe, useNotifications, useSavedFeed } from '../data/queries';
import { useSizzle } from '../store';
import { formatCount } from '../lib/format';
import { VerifiedBadge } from './VerifiedBadge';
import { SocialLinks } from './SocialLinks';
import { BellIcon, BookmarkIcon, GearIcon, HeartIcon } from './icons';

const BANNER = 'radial-gradient(120% 120% at 70% 0%, var(--saffron,#f4a52c), var(--accent,#ff5a36) 60%, #c23a1a)';

/** 3×3 grid icon for the "Posts" tab. */
function GridIcon({ size = 22, stroke = 'currentColor' }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function Profile() {
  const authed = useAuth((s) => s.status === 'authed');
  const requireAuth = useRequireAuth();
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);

  const setShowEditProfile = useSizzle((s) => s.setShowEditProfile);
  const setShowNotifications = useSizzle((s) => s.setShowNotifications);
  const setShowAppSettings = useSizzle((s) => s.setShowAppSettings);
  const setShowAdmin = useSizzle((s) => s.setShowAdmin);
  const setFollowList = useSizzle((s) => s.setFollowList);

  const { data: me } = useMe();
  const { data: saved } = useSavedFeed();
  const { data: liked } = useLikedFeed();
  const { data: myCook } = useCook(me?.id ?? null);
  const { data: notifications } = useNotifications();
  const savedItems = saved?.items ?? [];
  const likedItems = liked?.items ?? [];
  const postItems = myCook?.recipes ?? [];
  const unread = (notifications ?? []).filter((n) => !n.read).length;
  const [tab, setTab] = useState<'posts' | 'liked' | 'saved'>('posts');

  if (!authed) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', animation: 'sz-fadeIn .35s' }}>
        <div style={{ height: 150, background: BANNER, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.12, background: 'repeating-linear-gradient(115deg,#000 0 2px, transparent 2px 7px)' }} />
        </div>
        <div style={{ padding: '60px 30px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: 'var(--text)' }}>You're browsing as a guest</div>
          <p style={{ color: 'var(--text-faint)', fontSize: 15, margin: '10px 0 24px' }}>Create an account to keep your saves, downloads, and the cooks you follow.</p>
          <button onClick={() => requireAuth()} style={{ height: 52, padding: '0 28px', border: 'none', borderRadius: 16, background: 'var(--invert-bg)', color: 'var(--invert-fg)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', overflowY: 'auto', animation: 'sz-fadeIn .35s' }}>
      <div style={{ height: 150, background: me?.bannerUrl ? `url(${me.bannerUrl}) center/cover no-repeat` : BANNER, position: 'relative' }}>
        {!me?.bannerUrl && <div style={{ position: 'absolute', inset: 0, opacity: 0.12, background: 'repeating-linear-gradient(115deg,#000 0 2px, transparent 2px 7px)' }} />}
      </div>
      {/* position:relative + zIndex keeps the avatar painted above the (positioned) banner */}
      <div style={{ padding: '0 22px 110px', marginTop: -44, position: 'relative', zIndex: 1 }}>
        <div style={{ width: 88, height: 88, borderRadius: 28, background: me?.avatarUrl ? `url(${me.avatarUrl}) center/cover` : 'linear-gradient(135deg,#3a2a22,#1b1512)', border: '4px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 34, color: '#fff', overflow: 'hidden' }}>{me?.avatarUrl ? '' : me?.init ?? '·'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: 'var(--text)' }}>{me?.name ?? 'Loading…'}</span>
          <VerifiedBadge tier={me?.verifiedTier} size={20} />
        </div>
        <div style={{ color: 'var(--text-faint)', fontSize: 14.5 }}>
          {me ? `@${me.handle} · ${me.bio || 'Home cook in training'}` : ''}
        </div>
        {me && <SocialLinks links={me.links} />}
        <div style={{ display: 'flex', gap: 22, marginTop: 18 }}>
          <Stat value={formatCount(me?.counts.following ?? 0)} label="Following" onClick={me ? () => setFollowList({ id: me.id, mode: 'following', name: me.name }) : undefined} />
          <Stat value={formatCount(me?.counts.followers ?? 0)} label="Followers" onClick={me ? () => setFollowList({ id: me.id, mode: 'followers', name: me.name }) : undefined} />
          <Stat value={formatCount(me?.counts.saved ?? 0)} label="Saved" />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={() => setShowEditProfile(true)} style={{ flex: 1, height: 48, border: 'none', borderRadius: 14, background: 'var(--invert-bg)', color: 'var(--invert-fg)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Edit profile</button>
          <button
            onClick={() => setShowNotifications(true)}
            title="Notifications"
            style={{ position: 'relative', width: 48, height: 48, border: '1.5px solid var(--line-2)', borderRadius: 14, background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <BellIcon size={20} stroke="var(--text-muted)" />
            {unread > 0 && <div style={{ position: 'absolute', top: 9, right: 9, width: 9, height: 9, borderRadius: '50%', background: 'var(--accent,#ff5a36)', border: '2px solid var(--surface)' }} />}
          </button>
          <button
            onClick={() => setShowAppSettings(true)}
            title="Settings"
            style={{ width: 48, height: 48, border: '1.5px solid var(--line-2)', borderRadius: 14, background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <GearIcon size={20} stroke="var(--text-muted)" />
          </button>
        </div>
        {me?.role === 'admin' && (
          <button
            onClick={() => setShowAdmin(true)}
            style={{ width: '100%', height: 46, marginTop: 10, border: 'none', borderRadius: 14, background: 'linear-gradient(135deg,#1b1512,#3a2a22)', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <VerifiedBadge tier="blue" size={16} /> Admin dashboard
          </button>
        )}
        {/* Posts / Liked / Saved tabs — TikTok-style thumbnail grids. */}
        <div style={{ display: 'flex', margin: '24px 0 14px', borderBottom: '1px solid var(--line-2)' }}>
          {([['posts', GridIcon, 'Posts'], ['liked', HeartIcon, 'Liked'], ['saved', BookmarkIcon, 'Saved']] as const).map(([key, Icon, label]) => {
            const on = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 0', marginBottom: -1, background: 'none', border: 'none', borderBottom: on ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', color: on ? 'var(--text)' : 'var(--text-faint-2)' }}
              >
                <Icon size={19} stroke="currentColor" />
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</span>
              </button>
            );
          })}
        </div>
        <RecipeGrid
          items={tab === 'posts' ? postItems : tab === 'liked' ? likedItems : savedItems}
          empty={tab === 'posts' ? 'Videos you post will show up here.' : tab === 'liked' ? 'Videos you like will show up here.' : 'Recipes you save will collect here.'}
          onOpen={setOpenRecipe}
        />
      </div>
    </div>
  );
}

/** A 3-column thumbnail grid of recipes; tap a tile to open the video. */
function RecipeGrid({ items, empty, onOpen }: { items: RecipeCard[]; empty: string; onOpen: (id: string) => void }) {
  if (items.length === 0) {
    return <div style={{ padding: 30, textAlign: 'center', background: 'var(--surface)', border: '1px dashed var(--line-2)', borderRadius: 20, color: 'var(--text-faint-2)', fontSize: 14 }}>{empty}</div>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      {items.map((r) => (
        <button
          key={r.id}
          onClick={() => onOpen(r.id)}
          style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 14, overflow: 'hidden', position: 'relative', aspectRatio: '3 / 4', background: r.bg }}
        >
          {r.video?.posterUrl && <img src={r.video.posterUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 38%, rgba(0,0,0,.74))' }} />
          {r.removed && <div style={{ position: 'absolute', top: 7, left: 7, background: 'rgba(216,82,30,.92)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 6px', borderRadius: 6 }}>Removed</div>}
          <div style={{ position: 'absolute', left: 8, right: 8, bottom: 26, fontFamily: "'Instrument Serif',serif", fontSize: 13.5, lineHeight: 1.05, color: '#fff', maxHeight: 30, overflow: 'hidden' }}>{r.title}</div>
          <div style={{ position: 'absolute', left: 8, bottom: 8, display: 'flex', alignItems: 'center', gap: 4, color: '#fff', fontSize: 11.5, fontWeight: 700 }}>
            <HeartIcon size={12} fill="#fff" stroke="#fff" strokeWidth={1.4} /> {formatCount(r.counts.likes)}
          </div>
        </button>
      ))}
    </div>
  );
}

function Stat({ value, label, onClick }: { value: string; label: string; onClick?: () => void }) {
  const inner = (
    <>
      <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{label}</div>
    </>
  );
  if (!onClick) return <div>{inner}</div>;
  return <button onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>{inner}</button>;
}
