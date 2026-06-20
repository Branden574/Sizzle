import { useFollowList } from '../../data/queries';
import { useSizzle } from '../../store';
import { CloseIcon } from '../icons';
import { VerifiedBadge } from '../VerifiedBadge';

/** Bottom sheet listing a user's followers or the people they follow. */
export function FollowListSheet() {
  const followList = useSizzle((s) => s.followList);
  const setFollowList = useSizzle((s) => s.setFollowList);
  const setOpenCook = useSizzle((s) => s.setOpenCook);
  const { data, isLoading } = useFollowList(followList?.id ?? null, followList?.mode ?? 'followers');

  if (!followList) return null;
  const list = data ?? [];
  const close = () => setFollowList(null);
  const title = followList.mode === 'followers' ? 'Followers' : 'Following';

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 89 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '74%', background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 22px 12px', borderBottom: '1px solid var(--line)', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{title}</div>
          <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-faint)' }}>{followList.name}</div>
          <button onClick={close} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', cursor: 'pointer' }}>
            <CloseIcon size={22} stroke="var(--text-faint)" strokeWidth={2.2} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px 24px' }}>
          {isLoading && <div style={{ color: 'var(--text-faint-2)', fontSize: 14, padding: 20, textAlign: 'center' }}>Loading…</div>}
          {!isLoading && list.length === 0 && (
            <div style={{ color: 'var(--text-faint-2)', fontSize: 14.5, padding: 40, textAlign: 'center' }}>
              {followList.mode === 'followers' ? 'No followers to show yet.' : 'Not following anyone yet.'}
            </div>
          )}
          {list.map((u) => (
            <button
              key={u.id}
              onClick={() => { setOpenCook(u.id); close(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 12, cursor: 'pointer', textAlign: 'left', width: '100%', marginBottom: 10 }}
            >
              <div style={{ width: 46, height: 46, flex: 'none', borderRadius: '50%', background: u.avatarUrl ? `url(${u.avatarUrl}) center/cover` : u.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 18, color: '#fff', overflow: 'hidden' }}>
                {u.avatarUrl ? '' : u.init}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{u.name}</span>
                  <VerifiedBadge tier={u.verifiedTier} size={14} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>@{u.handle}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
