import { useState } from 'react';
import { Button } from './controls';
import { useAuth } from '../auth/useAuth';

const inputStyle = {
  height: 54,
  border: '1.5px solid var(--line-2)',
  borderRadius: 16,
  background: 'var(--surface)',
  padding: '0 16px',
  fontFamily: "'Hanken Grotesk'",
  fontSize: 16,
  color: 'var(--text)',
  outline: 'none',
  width: '100%',
} as const;

/** Shown after a password-recovery deep-link. Sets a new password, then drops into the app. */
export function ResetPasswordScreen() {
  const updatePassword = useAuth((s) => s.updatePassword);
  const busy = useAuth((s) => s.busy);
  const error = useAuth((s) => s.error);
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);

  const checks = {
    length: password.length >= 10,
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
  const valid = checks.length && checks.upper && checks.number && checks.symbol;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    void updatePassword(password).then((ok) => { if (ok) setDone(true); });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 95, background: 'var(--bg)', padding: '88px 0 0', display: 'flex', flexDirection: 'column', animation: 'sz-fadeIn .35s' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 26px 16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 42, lineHeight: 1.02, color: 'var(--text)' }}>Set a new password.</div>
        <p style={{ margin: '12px 0 22px', color: 'var(--text-soft)', fontSize: 15.5, lineHeight: 1.5, maxWidth: 320 }}>
          {done ? 'Password updated — you’re all set.' : 'Choose a strong password to finish resetting your account.'}
        </p>
        {!done && (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <input type="password" autoComplete="new-password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
            {password.length > 0 && !valid && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', padding: '0 2px' }}>
                {([['10+ characters', checks.length], ['Uppercase', checks.upper], ['Number', checks.number], ['Symbol', checks.symbol]] as const).map(([label, ok]) => (
                  <span key={label} style={{ fontSize: 12.5, fontWeight: 600, color: ok ? '#1f9d55' : 'var(--text-faint-2)' }}>{ok ? '✓' : '○'} {label}</span>
                ))}
              </div>
            )}
            {error && <div style={{ color: '#d8521e', fontSize: 13.5, fontWeight: 600, padding: '0 2px' }}>{error}</div>}
            <Button type="submit" disabled={!valid || busy} style={{ height: 56, border: 'none', borderRadius: 16, background: 'var(--invert-bg)', color: 'var(--invert-fg)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: valid && !busy ? 'pointer' : 'default', opacity: valid && !busy ? 1 : 0.55 }}>
              {busy ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
