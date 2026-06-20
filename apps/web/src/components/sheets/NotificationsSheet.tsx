import { useEffect } from 'react';
import type { NotificationDTO } from '@sizzle/shared';
import { useMarkNotificationsRead, useNotifications } from '../../data/queries';
import { useSizzle } from '../../store';
import { CloseIcon } from '../icons';

function text(n: NotificationDTO): string {
  const who = n.actor.name;
  if (n.type === 'follow') return `${who} started following you`;
  if (n.type === 'like') return n.recipeTitle ? `${who} liked “${n.recipeTitle}”` : `${who} liked your recipe`;
  return n.recipeTitle ? `${who} commented on “${n.recipeTitle}”` : `${who} commented on your recipe`;
}

export function NotificationsSheet() {
  const setShowNotifications = useSizzle((s) => s.setShowNotifications);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const setOpenCook = useSizzle((s) => s.setOpenCook);

  const { data: notifications, isLoading } = useNotifications();
  const markRead = useMarkNotificationsRead();

  useEffect(() => {
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '78%', background: '#faf3ea', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 22px 12px', borderBottom: '1px solid #ece1d4', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: '#d8cbbb' }} />
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: '#1b1512', marginTop: 6 }}>Notifications</div>
          <button onClick={close} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', cursor: 'pointer' }}>
            <CloseIcon size={22} stroke="#8a7c70" strokeWidth={2.2} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 24px' }}>
          {isLoading && <div style={{ color: '#a99c90', fontSize: 14, padding: 16 }}>Loading…</div>}
          {!isLoading && list.length === 0 && (
            <div style={{ textAlign: 'center', color: '#a99c90', fontSize: 15, padding: '50px 30px' }}>No activity yet. Likes, comments and new followers show up here.</div>
          )}
          {list.map((n) => (
            <button
              key={n.id}
              onClick={() => open(n)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: n.read ? 'none' : 'rgba(255,90,54,.06)', border: 'none', borderRadius: 14, padding: '12px 10px', cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: n.actor.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 17, color: '#fff' }}>{n.actor.init}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, color: '#1b1512', lineHeight: 1.4 }}>{text(n)}</div>
                <div style={{ fontSize: 12.5, color: '#a99c90', marginTop: 2 }}>{n.time}</div>
              </div>
              {!n.read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent,#ff5a36)', flex: 'none' }} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
