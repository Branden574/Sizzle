import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './controls';
import { setPasscode, verifyPasscode } from '../lib/applock';
import { useAuth } from '../auth/useAuth';

/**
 * 4-digit passcode app lock. Replaced the biometric (Face ID) lock — the OS
 * biometric overlay's app-state events caused unfixable re-lock loops on some
 * devices, while a passcode screen is pure in-app UI and can't loop.
 *
 * - <PasscodeLock>  — full-screen lock shown on launch/resume when enabled.
 * - <PasscodeSetup> — full-screen flow to set (enter + confirm) or verify the
 *                     passcode, used by Settings to enable/disable/change.
 */

const PIN_LENGTH = 4;

function Dots({ filled, shaking }: { filled: number; shaking: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', animation: shaking ? 'sz-shake .4s ease' : undefined }}>
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <div
          key={i}
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '1.5px solid var(--text-faint)',
            background: i < filled ? 'var(--accent)' : 'transparent',
            borderColor: i < filled ? 'var(--accent)' : 'var(--text-faint)',
            transition: 'background .12s ease, border-color .12s ease',
          }}
        />
      ))}
    </div>
  );
}

function Key({ children, onPress, label }: { children: ReactNode; onPress: () => void; label: string }) {
  return (
    <Button
      onClick={onPress}
      aria-label={label}
      style={{
        width: 72,
        height: 72,
        borderRadius: '50%',
        border: 'none',
        background: 'var(--surface)',
        color: 'var(--text)',
        fontFamily: "'Hanken Grotesk'",
        fontSize: 26,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </Button>
  );
}

/** Numeric keypad; calls onComplete each time 4 digits are entered. */
function Pad({ onComplete, clearSignal, errorSignal }: { onComplete: (pin: string) => void; clearSignal: number; errorSignal: number }) {
  const [pin, setPin] = useState('');
  const [shaking, setShaking] = useState(false);
  const prevClear = useRef(clearSignal);
  const prevError = useRef(errorSignal);

  // clearSignal: wipe the entry quietly (e.g. moving to the confirm step).
  useEffect(() => {
    if (prevClear.current !== clearSignal) {
      prevClear.current = clearSignal;
      setPin('');
    }
  }, [clearSignal]);

  // errorSignal: wipe the entry AND shake (wrong / mismatched passcode).
  useEffect(() => {
    if (prevError.current !== errorSignal) {
      prevError.current = errorSignal;
      setPin('');
      setShaking(true);
      const t = window.setTimeout(() => setShaking(false), 450);
      return () => window.clearTimeout(t);
    }
  }, [errorSignal]);

  const press = (d: string) => {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      // Let the 4th dot paint before the parent reacts.
      window.setTimeout(() => onComplete(next), 120);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
      <Dots filled={pin.length} shaking={shaking} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 18, justifyContent: 'center' }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} label={d} onPress={() => press(d)}>{d}</Key>
        ))}
        <div />
        <Key label="0" onPress={() => press('0')}>0</Key>
        <Key label="Delete" onPress={() => setPin((p) => p.slice(0, -1))}>
          <svg width="26" height="20" viewBox="0 0 26 20" fill="none" aria-hidden="true">
            <path d="M8.4 1h13.1A2.5 2.5 0 0 1 24 3.5v13a2.5 2.5 0 0 1-2.5 2.5H8.4a2.5 2.5 0 0 1-1.9-.87L1 10l5.5-8.13A2.5 2.5 0 0 1 8.4 1Z" stroke="var(--text-faint)" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="m12 6.5 7 7m0-7-7 7" stroke="var(--text-faint)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </Key>
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      // Exempted from the sz-native-cam hiding rule (index.css) - the app-lock
      // must stay visible and interactive OVER the camera recorder, or
      // backgrounding mid-recording would silently bypass the lock.
      className="sz-passcode-lock"
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
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

/** Full-screen lock shown on launch / resume when the app lock is enabled. */
export function PasscodeLock({ onUnlock }: { onUnlock: () => void }) {
  const signOut = useAuth((s) => s.signOut);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState(0);

  const tryPin = async (pin: string) => {
    if (await verifyPasscode(pin)) {
      onUnlock();
    } else {
      setMsg('Wrong passcode — try again.');
      setError((n) => n + 1);
    }
  };

  return (
    <Shell>
      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: 'var(--text)', marginBottom: 2 }}>Sizzle is locked</div>
      <div style={{ fontSize: 14.5, color: msg ? 'var(--button-danger-fg)' : 'var(--text-faint)', textAlign: 'center', minHeight: 20 }}>
        {msg ?? 'Enter your passcode to continue.'}
      </div>
      <div style={{ height: 14 }} />
      <Pad onComplete={(p) => void tryPin(p)} clearSignal={0} errorSignal={error} />
      <Button
        onClick={() => void signOut()}
        style={{ marginTop: 22, background: 'transparent', border: 'none', color: 'var(--text-faint)', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}
      >
        Log out instead
      </Button>
    </Shell>
  );
}

/**
 * Set or verify the passcode (full-screen overlay above Settings).
 * mode 'set'    — enter a new passcode, then confirm it; saves on match.
 * mode 'verify' — enter the current passcode once.
 * Calls onDone(true) on success; the X (or onDone(false)) cancels.
 */
export function PasscodeSetup({ mode, title, onDone }: { mode: 'set' | 'verify'; title?: string; onDone: (ok: boolean) => void }) {
  const [stage, setStage] = useState<'enter' | 'confirm'>('enter');
  const [first, setFirst] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [clear, setClear] = useState(0);
  const [error, setError] = useState(0);

  const heading = title ?? (mode === 'set' ? 'Set your passcode' : 'Enter your passcode');
  const sub =
    msg ??
    (mode === 'verify'
      ? 'Confirm it’s you to change this setting.'
      : stage === 'enter'
      ? 'Pick 4 digits you’ll remember.'
      : 'Enter the same 4 digits again.');

  const complete = async (pin: string) => {
    if (mode === 'verify') {
      if (await verifyPasscode(pin)) onDone(true);
      else {
        setMsg('Wrong passcode — try again.');
        setError((n) => n + 1);
      }
      return;
    }
    if (stage === 'enter') {
      setFirst(pin);
      setStage('confirm');
      setMsg(null);
      setClear((n) => n + 1);
      return;
    }
    if (pin === first) {
      await setPasscode(pin);
      onDone(true);
    } else {
      setStage('enter');
      setFirst('');
      setMsg("Those didn't match — start over.");
      setError((n) => n + 1);
    }
  };

  return (
    <Shell>
      <Button
        onClick={() => onDone(false)}
        aria-label="Cancel"
        style={{ position: 'absolute', top: 18, left: 14, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m2 2 12 12M14 2 2 14" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </Button>
      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: 'var(--text)', marginBottom: 2 }}>{heading}</div>
      <div style={{ fontSize: 14.5, color: msg ? 'var(--button-danger-fg)' : 'var(--text-faint)', textAlign: 'center', minHeight: 20, maxWidth: 280 }}>{sub}</div>
      <div style={{ height: 14 }} />
      <Pad onComplete={(p) => void complete(p)} clearSignal={clear} errorSignal={error} />
    </Shell>
  );
}
