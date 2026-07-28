import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../controls';
import { useCookEvent, useRecipe } from '../../data/queries';
import { useAuth } from '../../auth/useAuth';
import { MadeItPrompt } from '../MadeItPrompt';
import { getOffline } from '../../lib/offline';
import { scaleIngredient } from '../../lib/ingredients';
import { useSizzle } from '../../store';
import { CloseIcon } from '../icons';

/** Parse the first duration in a step ("simmer 10 min", "bake for 1 hour") → seconds. */
function stepSeconds(text: string): number | null {
  const m = text.match(/(\d+)(?:\s*[-–]\s*\d+)?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  if (unit.startsWith('h')) return n * 3600;
  if (unit.startsWith('s')) return n;
  return n * 60;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

export function CookModeSheet() {
  const cookFor = useSizzle((s) => s.cookFor);
  const setCookFor = useSizzle((s) => s.setCookFor);
  const { data } = useRecipe(cookFor?.id ?? null);
  const r = data ?? getOffline(cookFor?.id ?? null);
  const cookEvent = useCookEvent();
  const authed = useAuth((s) => s.status === 'authed');
  const finished = useRef(false);
  const [madeIt, setMadeIt] = useState<{ id: string; title: string } | null>(null);

  // Cook-intent signals: opening cook mode logs a start; "Finish cooking" logs
  // the qualified finish (first finish per user bumps the recipe's Cooks count).
  useEffect(() => {
    if (!cookFor?.id || !authed) return;
    finished.current = false;
    cookEvent.mutate({ recipeId: cookFor.id, kind: 'cook_start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookFor?.id, authed]);

  const [step, setStep] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  // Per-step countdown timer.
  const [remaining, setRemaining] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const tick = useRef<number | null>(null);

  const scale = cookFor?.scale ?? 1;
  const units = useSizzle((s) => s.units);
  const steps = r?.steps ?? [];
  const current = steps[step] ?? '';
  const timerSeconds = useMemo(() => stepSeconds(current), [current]);

  // Reset the timer whenever the step changes.
  useEffect(() => {
    setRemaining(null);
    setRunning(false);
  }, [step]);

  useEffect(() => {
    if (!running) return;
    tick.current = window.setInterval(() => {
      setRemaining((v) => (v == null ? v : Math.max(0, v - 1)));
    }, 1000);
    return () => { if (tick.current) window.clearInterval(tick.current); };
  }, [running]);

  // Stop + buzz once the countdown reaches zero (kept out of the state updater
  // so the updater stays pure under StrictMode).
  useEffect(() => {
    if (running && remaining === 0) {
      setRunning(false);
      navigator.vibrate?.(400);
    }
  }, [remaining, running]);

  // Keep the screen awake while cooking (re-acquire when tab returns to foreground).
  useEffect(() => {
    if (!cookFor) return;
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        /* unsupported / denied — non-fatal */
      }
    };
    void request();
    const onVis = () => { if (document.visibilityState === 'visible') void request(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release?.().catch(() => {});
    };
  }, [cookFor]);

  if (!cookFor || !r) return null;
  const close = () => setCookFor(null);
  const last = step >= steps.length - 1;
  const startTimer = () => { setRemaining(timerSeconds); setRunning(true); };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 99, background: 'var(--feed-bg)', display: 'flex', flexDirection: 'column', animation: 'sz-slideUp .35s cubic-bezier(.16,1,.3,1)' }}>
      {/* Chef's note — the owner-pinned tip, surfaced where it matters: mid-cook. */}
      {r?.chefsNote && (
        <div style={{ flex: 'none', margin: '6px 20px 0', background: 'rgba(244,165,44,.14)', border: '1px solid rgba(244,165,44,.35)', borderRadius: 14, padding: '10px 14px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.4px', textTransform: 'uppercase', color: '#f4a52c' }}>📌 Chef's note</div>
          <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.92)', lineHeight: 1.45, marginTop: 3 }}>{r.chefsNote.text}</div>
        </div>
      )}
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '54px 20px 10px', flex: 'none' }}>
        <div style={{ minWidth: 40 }}>
          <Button onClick={close} style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <CloseIcon size={20} stroke="#fff" strokeWidth={2.2} />
          </Button>
        </div>
        <div style={{ textAlign: 'center', color: '#fff', overflow: 'hidden' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>Cook mode</div>
          <div style={{ fontSize: 14.5, fontWeight: 700, maxWidth: 200, overflow: 'hidden', lineHeight: 1.35, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
        </div>
        <Button onClick={() => setShowIngredients((v) => !v)} style={{ minWidth: 40, height: 38, padding: '0 12px', borderRadius: 19, border: 'none', background: showIngredients ? 'var(--accent)' : 'rgba(255,255,255,.12)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {showIngredients ? 'Steps' : 'Items'}
        </Button>
      </div>

      {/* progress dots */}
      <div style={{ display: 'flex', gap: 5, padding: '6px 20px 0', flex: 'none' }}>
        {steps.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'rgba(255,255,255,.15)', transition: 'background .3s' }} />
        ))}
      </div>

      {showIngredients ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 30px' }}>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 28, color: '#fff', marginBottom: 14 }}>Ingredients</div>
          {r.ingredients.map((ing, i) => {
            const on = !!checked[i];
            return (
              <Button
                key={i}
                onClick={() => setChecked((c) => ({ ...c, [i]: !c[i] }))}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 12px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,.08)', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 24, height: 24, flex: 'none', borderRadius: 7, border: `2px solid ${on ? 'var(--accent)' : 'rgba(255,255,255,.3)'}`, background: on ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {on && <span style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>✓</span>}
                </div>
                <span style={{ fontSize: 16, color: on ? 'rgba(255,255,255,.45)' : '#fff', textDecoration: on ? 'line-through' : 'none' }}>{scale === 1 && units === 'original' ? ing : scaleIngredient(ing, scale, units)}</span>
              </Button>
            );
          })}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 26px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)' }}>Step {step + 1} of {steps.length}</div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, lineHeight: 1.25, color: '#fff', margin: '14px 0 22px' }}>{current}</div>

          {timerSeconds != null && (
            <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 18, padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.5)', fontWeight: 600 }}>{remaining === 0 ? "Time's up" : 'Timer'}</div>
                <div style={{ fontFamily: "'Hanken Grotesk'", fontSize: 34, fontWeight: 800, color: remaining === 0 ? 'var(--accent)' : '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmt(remaining ?? timerSeconds)}</div>
              </div>
              {remaining == null ? (
                <Button onClick={startTimer} style={{ height: 46, padding: '0 22px', borderRadius: 14, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Start</Button>
              ) : running ? (
                <Button onClick={() => setRunning(false)} style={{ height: 46, padding: '0 22px', borderRadius: 14, border: '1.5px solid rgba(255,255,255,.3)', background: 'transparent', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Pause</Button>
              ) : (
                <Button onClick={() => (remaining === 0 ? startTimer() : setRunning(true))} style={{ height: 46, padding: '0 22px', borderRadius: 14, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{remaining === 0 ? 'Reset' : 'Resume'}</Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* step nav */}
      {!showIngredients && (
        <div style={{ display: 'flex', gap: 12, padding: '14px 22px 34px', flex: 'none' }}>
          <Button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            style={{ flex: 'none', width: 64, height: 54, borderRadius: 16, border: '1.5px solid rgba(255,255,255,.2)', background: 'transparent', color: '#fff', fontSize: 15, fontWeight: 700, cursor: step === 0 ? 'default' : 'pointer', opacity: step === 0 ? 0.4 : 1 }}
          >
            Back
          </Button>
          <Button
            onClick={() => {
              if (last) {
                if (authed && cookFor?.id && !finished.current) {
                  finished.current = true;
                  cookEvent.mutate({ recipeId: cookFor.id, kind: 'cook_finish' });
                  // Offer the Made-It Journal entry before leaving cook mode.
                  setMadeIt({ id: cookFor.id, title: r?.title ?? 'this recipe' });
                  return;
                }
                close();
                return;
              }
              setStep((s) => s + 1);
            }}
            style={{ flex: 1, height: 54, borderRadius: 16, border: 'none', background: 'var(--accent)', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
          >
            {last ? 'Finish cooking' : 'Next step'}
          </Button>
        </div>
      )}

      {madeIt && (
        <MadeItPrompt
          recipeId={madeIt.id}
          recipeTitle={madeIt.title}
          onClose={() => { setMadeIt(null); close(); }}
        />
      )}
    </div>
  );
}
