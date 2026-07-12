import { useState } from 'react';
import { Button } from './controls';
import { useAuth } from '../auth/useAuth';
import { useBanAppeal, useMe } from '../data/queries';

/** Full-screen suspension notice + appeal form, shown while the user is banned. */
export function BannedScreen() {
  const { data: me } = useMe();
  const signOut = useAuth((s) => s.signOut);
  const appeal = useBanAppeal();
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);

  const daysLeft = me?.deleteAt ? Math.max(0, Math.ceil((new Date(me.deleteAt).getTime() - Date.now()) / 86_400_000)) : null;
  const status = me?.banAppealStatus ?? 'none';

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 97, background: 'var(--bg)', padding: '88px 26px 28px', display: 'flex', flexDirection: 'column', animation: 'sz-fadeIn .35s', overflowY: 'auto' }}>
      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 40, lineHeight: 1.04, color: 'var(--text)' }}>Account suspended</div>
      <p style={{ margin: '12px 0 6px', color: 'var(--text-soft)', fontSize: 15.5, lineHeight: 1.5 }}>
        {me?.bannedReason ? `Reason: ${me.bannedReason}.` : 'Your account was suspended for violating our community guidelines.'}
      </p>
      {daysLeft != null && (
        <p style={{ color: '#d8521e', fontSize: 14.5, fontWeight: 700, margin: '0 0 20px' }}>
          It will be permanently deleted in {daysLeft} day{daysLeft === 1 ? '' : 's'} unless restored.
        </p>
      )}

      {done || status === 'pending' ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, color: '#c98a1e', fontSize: 14.5, fontWeight: 700 }}>Your appeal is under review.</div>
      ) : status === 'denied' ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, color: 'var(--text-faint)', fontSize: 14.5, fontWeight: 700 }}>Your appeal was denied.</div>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.4px', margin: '4px 2px 8px' }}>Appeal</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Explain why your account should be restored…"
            style={{ width: '100%', border: '1.5px solid var(--line-2)', borderRadius: 16, padding: '14px 16px', fontFamily: "'Hanken Grotesk'", fontSize: 15.5, color: 'var(--text)', outline: 'none', background: 'var(--surface)', resize: 'vertical', lineHeight: 1.5 }}
          />
          {appeal.isError && <div style={{ color: '#d8521e', fontSize: 13.5, fontWeight: 600, marginTop: 8 }}>Couldn't submit — please try again.</div>}
          <Button
            disabled={!text.trim() || appeal.isPending}
            onClick={() => appeal.mutate(text.trim(), { onSuccess: () => setDone(true) })}
            style={{ marginTop: 12, height: 54, border: 'none', borderRadius: 16, background: 'var(--invert-bg)', color: 'var(--invert-fg)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: text.trim() ? 'pointer' : 'default', opacity: text.trim() && !appeal.isPending ? 1 : 0.55 }}
          >
            {appeal.isPending ? 'Submitting…' : 'Submit appeal'}
          </Button>
        </>
      )}

      <Button onClick={() => void signOut()} style={{ marginTop: 'auto', height: 48, border: 'none', background: 'none', color: 'var(--text-faint)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Log out</Button>
    </div>
  );
}
