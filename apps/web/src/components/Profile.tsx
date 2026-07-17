import { useState } from 'react';
import { Button, IconButton } from './controls';
import type { RecipeCard } from '@sizzle/shared';
import { useAuth } from '../auth/useAuth';
import { useRequireAuth } from '../auth/useRequireAuth';
import { useCook, useDeleteCookLog, useDeleteRecipe, useDrafts, useLikedFeed, useMe, useMyJournal, useNotifications, usePublishDraft, useRequestVerification, useSavedFeed } from '../data/queries';
import { useSizzle } from '../store';
import { formatCount } from '../lib/format';
import { cookShareUrl, nativeShare } from '../lib/share';
import { useShopping } from '../lib/shopping';
import { VerifiedBadge } from './VerifiedBadge';
import { SocialLinks } from './SocialLinks';
import { BellIcon, BookmarkIcon, GearIcon, HeartIcon, PlayIcon, ShareNodesIcon } from './icons';
import { PosterImg } from './PosterImg';
import { PremiumOverlay } from './PremiumOverlay';

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
  const setViewer = useSizzle((s) => s.setViewer);

  const setShowEditProfile = useSizzle((s) => s.setShowEditProfile);
  const setShowNotifications = useSizzle((s) => s.setShowNotifications);
  const setShowAppSettings = useSizzle((s) => s.setShowAppSettings);
  const setShowAdmin = useSizzle((s) => s.setShowAdmin);
  const setShowAnalytics = useSizzle((s) => s.setShowAnalytics);
  const setShowShopping = useSizzle((s) => s.setShowShopping);
  const setShowCreator = useSizzle((s) => s.setShowCreator);
  const setFollowList = useSizzle((s) => s.setFollowList);
  const shoppingCount = useShopping((s) => s.items.length);

  const { data: me } = useMe();
  const { data: saved } = useSavedFeed();
  const { data: liked } = useLikedFeed();
  const { data: myCook } = useCook(me?.id ?? null);
  const { data: notifications } = useNotifications();
  const savedItems = saved?.items ?? [];
  const likedItems = liked?.items ?? [];
  const postItems = myCook?.recipes ?? [];
  const unread = (notifications ?? []).filter((n) => !n.read).length;
  const [tab, setTab] = useState<'posts' | 'liked' | 'saved' | 'journal'>('posts');
  const gridItems = tab === 'posts' ? postItems : tab === 'liked' ? likedItems : savedItems;

  if (!authed) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', animation: 'sz-fadeIn .35s' }}>
        <div style={{ height: 150, background: BANNER, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.12, background: 'repeating-linear-gradient(115deg,#000 0 2px, transparent 2px 7px)' }} />
        </div>
        <div style={{ padding: '60px 30px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: 'var(--text)' }}>You're browsing as a guest</div>
          <p style={{ color: 'var(--text-faint)', fontSize: 15, margin: '10px 0 24px' }}>Create an account to keep your saves, downloads, and the cooks you follow.</p>
          <Button variant="primary" size="lg" onClick={() => requireAuth()}>
            Sign in
          </Button>
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
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, lineHeight: 1.1, color: 'var(--text)', marginTop: 12 }}>
          {me?.name ?? 'Loading…'}
          <span style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 6, position: 'relative', top: -2 }}>
            <VerifiedBadge tier={me?.verifiedTier} size={20} />
          </span>
        </div>
        <div style={{ color: 'var(--text-faint)', fontSize: 14.5 }}>
          {me ? `@${me.handle} · ${me.bio || 'Home cook in training'}` : ''}
        </div>
        {me && <SocialLinks links={me.links} />}
        <div style={{ display: 'flex', gap: 22, marginTop: 18 }}>
          <Stat value={formatCount(me?.counts.following ?? 0)} label="Following" onClick={me ? () => setFollowList({ id: me.id, mode: 'following', name: me.name }) : undefined} />
          <Stat value={formatCount(me?.counts.followers ?? 0)} label="Followers" onClick={me ? () => setFollowList({ id: me.id, mode: 'followers', name: me.name }) : undefined} />
          <Stat value={formatCount(me?.counts.views ?? 0)} label="Views" />
          <Stat value={formatCount(me?.counts.saved ?? 0)} label="Saved" />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <Button variant="primary" onClick={() => setShowEditProfile(true)} style={{ flex: 1 }}>Edit profile</Button>
          <IconButton
            onClick={() => setShowNotifications(true)}
            label="Notifications"
            variant="outline"
            shape="square"
            style={{ position: 'relative' }}
          >
            <BellIcon size={20} stroke="var(--text-muted)" />
            {unread > 0 && <div style={{ position: 'absolute', top: 9, right: 9, width: 9, height: 9, borderRadius: '50%', background: 'var(--accent,#ff5a36)', border: '2px solid var(--surface)' }} />}
          </IconButton>
          <IconButton
            onClick={() => {
              if (!me) return;
              const url = cookShareUrl(me.handle);
              void nativeShare({ title: `${me.name} on Sizzle`, url }).then((r) => {
                if (r === 'unavailable') void navigator.clipboard?.writeText(url).catch(() => {});
              });
            }}
            label="Share profile"
            variant="outline"
            shape="square"
          >
            <ShareNodesIcon size={19} stroke="var(--text-muted)" strokeWidth={2} />
          </IconButton>
          <IconButton
            onClick={() => setShowAppSettings(true)}
            label="Settings"
            variant="outline"
            shape="square"
          >
            <GearIcon size={20} stroke="var(--text-muted)" />
          </IconButton>
        </div>
        <Button
          onClick={() => setShowAnalytics(true)}
          variant="outline"
          fullWidth
          style={{ marginTop: 10 }}
        >
          📊 View insights
        </Button>
        <Button
          onClick={() => setShowShopping(true)}
          variant="outline"
          fullWidth
          style={{ marginTop: 10 }}
        >
          🛒 Shopping list{shoppingCount > 0 ? ` · ${shoppingCount}` : ''}
        </Button>
        <Button
          onClick={() => setShowCreator(true)}
          variant="outline"
          fullWidth
          style={{ marginTop: 10 }}
        >
          {me?.creatorStatus === 'active' ? '⭐ Creator dashboard' : me?.creatorStatus === 'eligible' ? '🎉 Become a Creator' : '⭐ Creator'}
        </Button>
        {!me?.verifiedTier && <VerifyButton />}
        <DraftsStrip />
        {me?.role === 'admin' && (
          <Button
            onClick={() => setShowAdmin(true)}
            variant="secondary"
            fullWidth
            style={{ marginTop: 10 }}
          >
            <VerifiedBadge tier="blue" size={16} /> Admin dashboard
          </Button>
        )}
        {/* Posts / Liked / Saved tabs — TikTok-style thumbnail grids. */}
        <div style={{ display: 'flex', margin: '24px 0 14px', borderBottom: '1px solid var(--line-2)' }}>
          {([['posts', GridIcon, 'Posts'], ['liked', HeartIcon, 'Liked'], ['saved', BookmarkIcon, 'Saved'], ['journal', GridIcon, 'Journal']] as const).map(([key, Icon, label]) => {
            const on = tab === key;
            return (
              <Button
                key={key}
                onClick={() => setTab(key)}
                aria-pressed={on}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 0', marginBottom: -1, background: 'none', border: 'none', borderBottom: on ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', color: on ? 'var(--text)' : 'var(--text-faint-2)' }}
              >
                <Icon size={19} stroke="currentColor" />
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</span>
              </Button>
            );
          })}
        </div>
        {tab === 'journal' ? (
          <JournalGrid />
        ) : (
          <RecipeGrid
            items={gridItems}
            myId={me?.id}
            empty={tab === 'posts' ? 'Videos you post will show up here.' : tab === 'liked' ? 'Videos you like will show up here.' : 'Recipes you save will collect here.'}
            onOpenAt={(i) => setViewer({ items: gridItems, index: i })}
          />
        )}
      </div>
    </div>
  );
}

/** A 3-column thumbnail grid of recipes; tap a tile to open the swipeable viewer. */
function RecipeGrid({ items, empty, onOpenAt, myId }: { items: RecipeCard[]; empty: string; onOpenAt: (index: number) => void; myId?: string }) {
  if (items.length === 0) {
    return <div style={{ padding: 30, textAlign: 'center', background: 'var(--surface)', border: '1px dashed var(--line-2)', borderRadius: 20, color: 'var(--text-faint-2)', fontSize: 14 }}>{empty}</div>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      {items.map((r, i) => (
        <Button
          key={r.id}
          onClick={() => onOpenAt(i)}
          style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 14, overflow: 'hidden', position: 'relative', aspectRatio: '3 / 4', background: r.bg }}
        >
          {(r.video?.posterUrl || r.images[0]) && <PosterImg src={(r.video?.posterUrl || r.images[0])!} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 38%, rgba(0,0,0,.74))' }} />
          <PremiumOverlay card={r} radius={14} isOwn={!!myId && r.cook.id === myId} index={i} />
          {r.removed && <div style={{ position: 'absolute', top: 7, left: 7, background: 'rgba(216,82,30,.92)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 6px', borderRadius: 6 }}>Removed</div>}
          <div style={{ position: 'absolute', left: 8, right: 8, bottom: 26, fontFamily: "'Instrument Serif',serif", fontSize: 13.5, lineHeight: 1.05, color: '#fff', maxHeight: 30, overflow: 'hidden' }}>{r.title}</div>
          <div style={{ position: 'absolute', left: 8, bottom: 8, display: 'flex', alignItems: 'center', gap: 10, color: '#fff', fontSize: 11.5, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
            {/* Views (TikTok-style primary grid metric) + likes. Views exclude the
                creator's own watches, so this is real reach. */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <PlayIcon size={12} fill="#fff" /> {formatCount(r.counts.views)}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <HeartIcon size={12} fill="#fff" stroke="#fff" strokeWidth={1.4} /> {formatCount(r.counts.likes)}
            </span>
          </div>
        </Button>
      ))}
    </div>
  );
}

/** Your Made-It Journal: every cook you logged — photo (or the recipe's poster),
 *  stars, note, and a quiet delete. Entries open their recipe. */
function JournalGrid() {
  const { data: entries, isLoading } = useMyJournal(true);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const del = useDeleteCookLog();
  if (isLoading) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 14 }}>Loading…</div>;
  if (!entries || entries.length === 0) {
    return <div style={{ padding: 30, textAlign: 'center', background: 'var(--surface)', border: '1px dashed var(--line-2)', borderRadius: 20, color: 'var(--text-faint-2)', fontSize: 14 }}>Finish cooking a recipe and it lands here — your cooking journal.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entries.map((e) => (
        <div key={e.id} style={{ display: 'flex', gap: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 10 }}>
          <Button onClick={() => setOpenRecipe(e.recipe.id)} style={{ flex: 'none', width: 64, height: 84, border: 'none', padding: 0, borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: e.recipe.bg, position: 'relative' }}>
            {(e.photoUrl || e.recipe.poster) && <img src={e.photoUrl ?? e.recipe.poster!} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          </Button>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <Button onClick={() => setOpenRecipe(e.recipe.id)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', flex: 1, minWidth: 0, textAlign: 'left', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.recipe.title}</Button>
              <span style={{ flex: 'none', fontSize: 11.5, color: 'var(--text-faint-2)', fontWeight: 600 }}>{e.time}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
              {e.rating != null && <span style={{ fontSize: 12, color: '#f4a52c', fontWeight: 800 }}>{'★'.repeat(e.rating)}</span>}
              {!e.isPublic && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)' }}>🔒 Just me</span>}
            </div>
            {e.note && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.note}</div>}
          </div>
          <Button
            onClick={() => { if (!del.isPending) del.mutate({ id: e.id, recipeId: e.recipe.id }); }}
            aria-label="Delete journal entry"
            title="Delete entry"
            style={{ flex: 'none', alignSelf: 'flex-start', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-faint-2)', fontSize: 15, padding: 4 }}
          >
            ✕
          </Button>
        </div>
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
  return <Button onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>{inner}</Button>;
}

/** The creator's own drafts + scheduled posts, with Publish / Edit / Delete. */
function DraftsStrip() {
  const { data } = useDrafts(true);
  const publish = usePublishDraft();
  const del = useDeleteRecipe();
  const setEditPostFor = useSizzle((s) => s.setEditPostFor);
  const drafts = data?.drafts ?? [];
  if (!drafts.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text-faint-2)', margin: '0 2px 8px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Drafts &amp; scheduled ({drafts.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {drafts.map((d) => {
          const when = d.scheduledAt ? new Date(d.scheduledAt) : null;
          return (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '10px 12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>
                  {d.draftStatus === 'scheduled' && when ? `⏰ Goes live ${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '📝 Draft'}
                </div>
              </div>
              <Button variant="outline" size="xs" onClick={() => setEditPostFor(d.id)}>Edit</Button>
              <Button variant="primary" size="xs" onClick={() => publish.mutate(d.id)} loading={publish.isPending}>Publish</Button>
              <IconButton variant="danger" size="xs" label={`Delete draft ${d.title}`} onClick={() => { if (window.confirm(`Delete draft "${d.title}"?`)) del.mutate(d.id); }}>✕</IconButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Self-serve verification — auto-grants at follower thresholds, else shows how far off. */
function VerifyButton() {
  const verify = useRequestVerification();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div style={{ marginTop: 10 }}>
      <Button
        onClick={() => verify.mutate(undefined, { onSuccess: (r) => setMsg(r.granted ? `You're verified! ✓` : (r.message ?? null)) })}
        variant="outline"
        fullWidth
        loading={verify.isPending}
      >
        ✓ Get verified
      </Button>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 6, textAlign: 'center' }}>{msg}</div>}
    </div>
  );
}

