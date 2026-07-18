import { useEffect, useRef } from 'react';
import { Button, DismissBackdrop } from '../controls';
import { useSwipeDismiss } from '../../lib/useSwipeDismiss';
import type { NotificationDTO } from '@sizzle/shared';
import { useMarkNotificationsRead, useNotifications, useRespondFollowRequest } from '../../data/queries';
import { useSizzle } from '../../store';
import { CloseIcon } from '../icons';
import { PullToRefreshSpinner, usePullToRefresh } from '../PullToRefresh';

function text(n: NotificationDTO): string {
  const who = n.actor.name;
  if (n.type === 'follow') return `${who} started following you`;
  if (n.type === 'follow_request') return `${who} requested to follow you`;
  if (n.type === 'follow_accepted') return `${who} accepted your follow request`;
  if (n.type === 'like') return n.recipeTitle ? `${who} liked “${n.recipeTitle}”` : `${who} liked your recipe`;
  if (n.type === 'comment_like') return `${who} liked your comment`;
  if (n.type === 'verified') return `${who} reached a verification milestone`;
  if (n.type === 'repost') return n.recipeTitle ? `${who} reposted “${n.recipeTitle}”` : `${who} reposted your recipe`;
  if (n.type === 'removed') return n.recipeTitle ? `Your post “${n.recipeTitle}” was removed — you can appeal it` : 'One of your posts was removed';
  if (n.type === 'restored') return n.recipeTitle ? `Your post “${n.recipeTitle}” was restored` : 'Your account was restored';
  if (n.type === 'banned') return 'Your account was suspended — open settings to appeal';
  if (n.type === 'tip') {
    // The amount is the whole point of an earning notification — lead with it.
    const amt = n.amountCents != null ? `$${(n.amountCents / 100).toFixed(2)}` : null;
    if (amt) return n.recipeTitle ? `${who} sent you ${amt} on “${n.recipeTitle}” 🎉` : `${who} sent you ${amt} 🎉`;
    return n.recipeTitle ? `${who} sent you a tip on “${n.recipeTitle}” 🎉` : `${who} sent you a tip 🎉`;
  }
  // Creator-account / payout system notifications (self-directed — ignore actor).
  if (n.type === 'creator_progress') return "You're getting close to Creator eligibility — keep it up! 📈";
  if (n.type === 'creator_eligible') return "🎉 You're eligible to become a Sizzle Creator — set up payouts to start earning";
  if (n.type === 'creator_activated') return "✨ You're a Sizzle Creator! Your account is active and payouts are set up";
  if (n.type === 'creator_payout_incomplete') return 'Finish your payout setup to activate your Creator account';
  if (n.type === 'payout_first') return 'Your first payout is on the way to your bank 💸';
  if (n.type === 'payout_paid') return 'Your creator earnings were paid out 💸';
  if (n.type === 'creator_monthly_summary') return 'Your monthly creator earnings summary is ready';
  return n.recipeTitle ? `${who} commented on “${n.recipeTitle}”` : `${who} commented on your recipe`;
}

export function NotificationsSheet() {
  const setShowNotifications = useSizzle((s) => s.setShowNotifications);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);
  const setOpenCook = useSizzle((s) => s.setOpenCook);
  const setShowAnalytics = useSizzle((s) => s.setShowAnalytics);

  const { data: notifications, isLoading, refetch: refetchNotifs } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const respond = useRespondFollowRequest();

  // Mark-all-read only once the list has loaded AND there is something unread —
  // not unconditionally on mount (which fired needless writes on every open).
  const hasUnread = (notifications ?? []).some((n) => !n.read);
  useEffect(() => {
    if (hasUnread) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread]);

  const list = notifications ?? [];
  const close = () => setShowNotifications(false);
  const swipe = useSwipeDismiss(() => setShowNotifications(false));
  const notifScrollRef = useRef<HTMLDivElement>(null);
  const notifPtr = usePullToRefresh(notifScrollRef, () => refetchNotifs({ throwOnError: true }));

  const open = (n: NotificationDTO) => {
    close();
    // An earning notification is about YOUR money, so it belongs in your earnings
    // — not the tipper's profile, which is where the recipe/actor fallback used to
    // dump you with no sign of the tip or its amount.
    if (n.type === 'tip') { setShowAnalytics(true); return; }
    if (n.recipeId) setOpenRecipe(n.recipeId);
    else setOpenCook(n.actor.id);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 91 }}>
      <DismissBackdrop onDismiss={close} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '78%', background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column', ...swipe.sheetStyle }}>
        <div {...swipe.handlers} style={{ padding: '14px 22px 12px', borderBottom: '1px solid var(--line)', position: 'relative' , ...swipe.handlers.style}}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>Notifications</div>
          <Button onClick={close} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', cursor: 'pointer' }}>
            <CloseIcon size={22} stroke="var(--text-faint)" strokeWidth={2.2} />
          </Button>
        </div>

        {/* overflowX hidden is a backstop: nothing in this list should ever be able
            to scroll it sideways, whatever a user names themselves or their recipe. */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <PullToRefreshSpinner show={notifPtr.showIndicator} progress={notifPtr.progress} refreshing={notifPtr.refreshing} armed={notifPtr.armed} phase={notifPtr.phase} label="notifications" onManualRefresh={notifPtr.refresh} />
          <div
            ref={notifScrollRef}
            style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch', padding: '8px 16px 24px', transform: notifPtr.offset ? `translateY(${notifPtr.offset}px)` : undefined, transition: notifPtr.settleTransition }}
          >
          {isLoading && <div style={{ color: 'var(--text-faint-2)', fontSize: 14, padding: 16 }}>Loading…</div>}
          {!isLoading && list.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-faint-2)', fontSize: 15, padding: '50px 30px' }}>No activity yet. Likes, comments and new followers show up here.</div>
          )}
          {list.map((n) => (
            <div key={n.id} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: n.read ? 'none' : 'rgba(255,90,54,.06)', borderRadius: 14, padding: '4px 6px' }}>
              <Button onClick={() => open(n)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', padding: '8px 4px', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: n.actor.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 17, color: '#fff' }}>{n.actor.init}</div>
                {/* whiteSpace:'normal' is load-bearing: `.sz-button` sets white-space:nowrap
                    (right for a one-line label, wrong here) and it INHERITS down into this
                    copy. Without the override, long text (a display name + a quoted recipe
                    title) can't wrap, so it runs out to its full single-line width and
                    shoves the avatar off-frame. overflowWrap covers unbroken tokens. */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, color: 'var(--text)', lineHeight: 1.4, overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{text(n)}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-faint-2)', marginTop: 2 }}>{n.time}</div>
                </div>
                {!n.read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent,#ff5a36)', flex: 'none' }} />}
              </Button>
              {n.type === 'follow_request' && (
                <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                  <Button
                    variant="primary"
                    size="xs"
                    onClick={(e) => { e.stopPropagation(); if (!respond.isPending) respond.mutate({ followerId: n.actor.id, accept: true }); }}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="tonal"
                    size="xs"
                    onClick={(e) => { e.stopPropagation(); if (!respond.isPending) respond.mutate({ followerId: n.actor.id, accept: false }); }}
                  >
                    Decline
                  </Button>
                </div>
              )}
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}
