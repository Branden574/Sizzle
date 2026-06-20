import { useEffect } from 'react';
import type { NotificationDTO } from '@sizzle/shared';
import { useMarkNotificationsRead, useNotifications } from '../../data/queries';
import { useSizzle } from '../../store';
import { CloseIcon } from '../icons';

function text(n: NotificationDTO): string {
  const who = n.actor.name;
  if (n.type === 'follow') return `${who} started following you`;
  if (n.type === 'like') return n.recipeTitle ? `${who} liked “${n.recipeTitle}”` : `${who} liked your recipe`;
  if (n.type === 'verified') return `${who} reached a verification milestone`;
  if (n.type === 'repost') return n.recipeTitle ? `${who} reposted “${n.recipeTitle}”` : `${who} reposted your recipe`;
  if (n.type === 'removed') return n.recipeTitle ? `Your post “${n.recipeTitle}” was removed — you can appeal it` : 'One of your posts was removed';
  if (n.type === 'restored') return n.recipeTitle ? `Your post “${n.recipeTitle}” was restored` : 'Your account was restored';
  if (n.type === 'banned') return 'Your account was suspended — open settings to appeal';
  return n.recipeTitle ? `${who} commented on “${n.recipeTitle}”` : `${who} commented on your recipe`;
}

export function NotificationsSheet() {
  const setShowNotifications = useSizzle((s) => s.setShowNotifications);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const setOpenCook = useSizzle((s) => s.setOpenCook);

  const { data: notifications, isLoading } = useNotifications();
  const markRead = useMarkNotificationsRead();

  // Mark-all-read only once the list has loaded AND there is something unread —
  // not unconditionally on mount (which fired needless writes on every open).
  const hasUnread = (notifications ?? []).some((n) => !n.read);
  useEffect(() => {
    if (hasUnread) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread]);

  const list = notifications ?? [];
  const close = () => setShowNotifications(false);

  const open = (n: NotificationDTO) => {
    close();
    if (n.recipeId) setOpenRecipe(n.recipeId);
    else setOpenCook(n.actor.id);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 91 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '78%', background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 22px 12px', borderBottom: '1px solid var(--line)', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>Notifications</div>
          <button onClick={close} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', cursor: 'pointer' }}>
            <CloseIcon size={22} stroke="var(--text-faint)" strokeWidth={2.2} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 24px' }}>
          {isLoading && <div style={{ color: 'var(--text-faint-2)', fontSize: 14, padding: 16 }}>Loading…</div>}
          {!isLoading && list.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 15, padding: '50px 30px' }}>No activity yet. Likes, comments and new followers show up here.</div>
          )}
          {list.map((n) => (
            <button
              key={n.id}
              onClick={() => open(n)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: n.read ? 'none' : 'rgba(255,90,54,.06)', border: 'none', borderRadius: 14, padding: '12px 10px', cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: n.actor.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 17, color: '#fff' }}>{n.actor.init}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, color: 'var(--text)', lineHeight: 1.4 }}>{text(n)}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-faint-2)', marginTop: 2 }}>{n.time}</div>
              </div>
              {!n.read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent,#ff5a36)', flex: 'none' }} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
