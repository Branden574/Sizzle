import { Button, DismissBackdrop } from '../controls';
import { useSwipeDismiss } from '../../lib/useSwipeDismiss';
import { useCookLive, useStartLive, useEndLive, useMe } from '../../data/queries';
import { useSizzle } from '../../store';
import { formatCount } from '../../lib/format';
import { isNative } from '../../lib/native';
import { CameraIcon } from '../icons';

/** Mirrors the API's `liveConfigured` (CLOUDFLARE_LIVE_INPUT_TOKEN). The client
 *  can't read server env and no config endpoint carries this yet, so it's a
 *  constant: flip it in the same change that wires real Live Inputs. Cosmetic
 *  only — /live/start refuses on the server regardless. */
const LIVE_ENABLED: boolean = false;

/**
 * The "+" create menu. Replaces the old behavior where the nav "+" opened the
 * uploader directly — now it offers "New recipe" plus "Go live" (moved off the
 * cluttered profile action row). On native the nav "+" opens the uploader
 * directly and this sheet is never shown.
 */
export function CreateSheet() {
  const open = useSizzle((s) => s.showCreate);
  const setOpen = useSizzle((s) => s.setShowCreate);
  const setShowUpload = useSizzle((s) => s.setShowUpload);
  const { data: me } = useMe();
  const { data: live } = useCookLive(LIVE_ENABLED ? me?.id ?? null : null);
  const start = useStartLive();
  const end = useEndLive();

  const swipe = useSwipeDismiss(() => setOpen(false));
  if (!open) return null;
  const close = () => setOpen(false);

  const newRecipe = () => { close(); setShowUpload(true); };
  const goLive = () => {
    const title = window.prompt('What are you cooking live?');
    if (title && title.trim()) start.mutate(title.trim(), { onSuccess: close });
  };
  const endLive = () => end.mutate(undefined, { onSuccess: close });

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 100 }}>
      <DismissBackdrop onDismiss={close} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', paddingBottom: 'max(var(--sab, 0px), 24px)', display: 'flex', flexDirection: 'column', ...swipe.sheetStyle }}>
        <div {...swipe.handlers} style={{ textAlign: 'center', padding: '16px 0 8px', position: 'relative', flex: 'none', ...swipe.handlers.style }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginTop: 6 }}>Create</div>
        </div>

        <div style={{ padding: '8px 20px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CreateOption
            onClick={newRecipe}
            icon={<span style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 14, background: 'var(--accent)' }}><CameraIcon size={24} stroke="#fff" strokeWidth={1.9} /></span>}
            title="New recipe"
            sub="Post a recipe video to your feed"
          />

          {/* Go live — web only, and only once real Live Inputs exist. */}
          {LIVE_ENABLED && !isNative && (
            live ? (
              <CreateOption
                onClick={endLive}
                loading={end.isPending}
                icon={<span style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 14, background: 'var(--button-danger-strong-bg, #c83325)', color: '#fff', fontSize: 18 }}>⏹</span>}
                title="End live"
                sub={`${formatCount(live.viewers)} watching now`}
                danger
              />
            ) : (
              <CreateOption
                onClick={goLive}
                loading={start.isPending}
                icon={<span style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 14, background: 'var(--surface-2)', fontSize: 20 }}>🔴</span>}
                title="Go live"
                sub="Cook live with your followers"
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

function CreateOption({ onClick, icon, title, sub, danger, loading }: { onClick: () => void; icon: React.ReactNode; title: string; sub: string; danger?: boolean; loading?: boolean }) {
  return (
    <Button
      onClick={onClick}
      disabled={loading}
      style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 14, opacity: loading ? 0.6 : 1 }}
    >
      {icon}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 15.5, fontWeight: 700, color: danger ? 'var(--button-danger-fg, #d8521e)' : 'var(--text)' }}>{title}</span>
        <span style={{ fontSize: 13, color: 'var(--text-faint-2)' }}>{sub}</span>
      </span>
    </Button>
  );
}
