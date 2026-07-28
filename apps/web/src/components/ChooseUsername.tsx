import { useState } from 'react';
import { Button } from './controls';
import { useAuth } from '../auth/useAuth';
import { apiSend, ApiError } from '../lib/api';
import { theme } from '../theme';

const accent = theme.accent;

/**
 * Pick-a-username gate. Shown after a social (Google/Apple) sign-up, where no
 * handle was chosen and the trigger auto-derived one from the email. Saving a
 * handle clears the server's `handle_auto` flag (via PATCH /me), and reloading
 * the profile flips `needsUsername` off so the app shell takes over.
 */
export function ChooseUsername() {
  const loadProfile = useAuth((s) => s.loadProfile);
  const profile = useAuth((s) => s.profile);
  const [handle, setHandle] = useState('');
  // Social sign-up also leaves a junk DISPLAY name: the trigger derives it from the email
  // local-part, which for Apple's Hide My Email is random ("Hchmktb56w"). Collect a real
  // name here too, seeded with whatever we have so the field is never empty-looking.
  const [name, setName] = useState(() => profile?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = handle.replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '');
  const cleanName = name.trim();
  const valid = clean.length >= 3 && cleanName.length >= 2;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend('PATCH', '/me', { handle: clean, displayName: cleanName });
      await loadProfile(); // needsUsername flips false → app shell renders
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save that username — try again.');
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', display: 'flex', flexDirection: 'column', padding: '76px 28px 32px', animation: 'sz-fadeIn .35s' }}>
      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 40, lineHeight: 1.05, color: 'var(--text)' }}>Set up your profile.</div>
      <p style={{ color: 'var(--text-faint)', fontSize: 16, lineHeight: 1.4, margin: '14px 0 26px' }}>
        Your name and username are how cooks find and @mention you on Sizzle. You can change both later in your profile.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', height: 58, border: `1.5px solid var(--line)`, borderRadius: 16, padding: '0 16px', background: 'var(--bg-soft)', marginBottom: 12 }}>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          autoFocus
          maxLength={40}
          placeholder="Your name"
          aria-label="Your name"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontFamily: "'Hanken Grotesk'", fontSize: 19, fontWeight: 600, color: 'var(--text)' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 58, border: `1.5px solid ${error ? '#e0573a' : 'var(--line)'}`, borderRadius: 16, padding: '0 16px', background: 'var(--bg-soft)' }}>
        <span style={{ fontSize: 19, color: 'var(--text-faint-2)', fontWeight: 600 }}>@</span>
        <input
          value={clean}
          onChange={(e) => { setHandle(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={30}
          placeholder="username"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontFamily: "'Hanken Grotesk'", fontSize: 19, fontWeight: 600, color: 'var(--text)' }}
        />
      </div>
      <div style={{ minHeight: 20, marginTop: 9, fontSize: 13.5, color: error ? '#e0573a' : 'var(--text-faint-2)' }}>
        {error ?? (clean.length > 0 && clean.length < 3 ? 'At least 3 characters.' : 'Letters, numbers, and underscores.')}
      </div>

      <div style={{ flex: 1 }} />

      <Button
        onClick={() => void submit()}
        disabled={!valid || busy}
        style={{ height: 56, border: 'none', borderRadius: 16, background: valid && !busy ? accent : 'var(--track)', color: valid && !busy ? '#fff' : 'var(--text-faint-2)', fontFamily: "'Hanken Grotesk'", fontSize: 17, fontWeight: 700, cursor: valid && !busy ? 'pointer' : 'default' }}
      >
        {busy ? 'Saving…' : 'Continue'}
      </Button>
    </div>
  );
}
