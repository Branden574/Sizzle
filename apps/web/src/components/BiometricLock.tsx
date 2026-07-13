import { useState, useEffect, useCallback } from 'react';
import { Button } from './controls';
import { biometricVerify } from '../lib/biometric';
import { useAuth } from '../auth/useAuth';

// Belt-and-suspenders against any remount loop ever trapping the user in
// endless Face ID prompts: if the lock auto-prompts more than 3 times within
// 5 seconds, stop auto-prompting and require a manual tap instead. Module
// scope so the count survives the remounts a loop would cause.
let autoPromptTimes: number[] = [];
function autoPromptAllowed(): boolean {
  const now = Date.now();
  autoPromptTimes = autoPromptTimes.filter((t) => now - t < 5000);
  autoPromptTimes.push(now);
  return autoPromptTimes.length <= 3;
}

/**
 * Full-screen lock shown on launch / resume when the user has enabled the
 * optional biometric app lock. Auto-prompts the OS biometric check on mount;
 * on success it calls onUnlock(). A "Log out" escape hatch covers the case
 * where biometrics keep failing (e.g. a different person holding the phone).
 */
export function BiometricLock({ label, onUnlock }: { label: string; onUnlock: () => void }) {
  const signOut = useAuth((s) => s.signOut);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);

  const attempt = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    setAutoPaused(false);
    const ok = await biometricVerify('Unlock Sizzle');
    setBusy(false);
    if (ok) onUnlock();
    else setFailed(true);
  }, [busy, onUnlock]);

  // Prompt once automatically when the lock appears — unless we've auto-prompted
  // too many times in a row (a loop), in which case wait for a manual tap so the
  // user is never trapped in an endless Face ID prompt.
  useEffect(() => {
    if (autoPromptAllowed()) void attempt();
    else setAutoPaused(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 9999,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 10,
      }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: 24,
          background: 'linear-gradient(135deg, var(--accent), var(--saffron, #f4a52c))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 38,
          marginBottom: 6,
          boxShadow: '0 12px 30px -10px rgba(0,0,0,.5)',
        }}
      >
        🔒
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: "'Instrument Serif', serif" }}>Sizzle is locked</div>
      <div style={{ fontSize: 14.5, color: 'var(--text-faint)', textAlign: 'center', maxWidth: 280 }}>
        {autoPaused
          ? `Tap below to unlock with ${label}.`
          : failed
          ? `Couldn't verify — tap to try ${label} again.`
          : `Unlock with ${label} to continue.`}
      </div>

      <Button
        onClick={() => void attempt()}
        disabled={busy}
        style={{
          marginTop: 18,
          width: '100%',
          maxWidth: 280,
          height: 52,
          border: 'none',
          borderRadius: 16,
          background: 'var(--accent)',
          color: '#fff',
          fontFamily: "'Hanken Grotesk'",
          fontSize: 16,
          fontWeight: 700,
          cursor: 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? 'Verifying…' : `Unlock with ${label}`}
      </Button>

      <Button
        onClick={() => void signOut()}
        style={{
          marginTop: 6,
          background: 'transparent',
          border: 'none',
          color: 'var(--text-faint)',
          fontFamily: "'Hanken Grotesk'",
          fontSize: 14.5,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Log out instead
      </Button>
    </div>
  );
}
