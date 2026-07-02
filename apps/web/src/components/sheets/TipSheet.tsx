import { useState } from 'react';
import { platformFeeCents, PLATFORM_FEE_PCT } from '@sizzle/shared';
import { useSendTip, useTipConfig } from '../../data/queries';
import { useRequireAuth } from '../../auth/useRequireAuth';
import { useSizzle } from '../../store';
import { theme } from '../../theme';

const accent = theme.accent;
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Send a creator a tip. The 5.5% platform fee is shown up front — the tipper
 * sees exactly what the creator receives before paying, and test mode (no
 * Stripe keys) is clearly labelled.
 */
export function TipSheet() {
  const tipFor = useSizzle((s) => s.tipFor);
  const setTipFor = useSizzle((s) => s.setTipFor);
  const requireAuth = useRequireAuth();
  const { data: cfg } = useTipConfig(!!tipFor);
  const send = useSendTip();
  const [amount, setAmount] = useState(300);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!tipFor) return null;
  const presets = cfg?.presetsCents ?? [100, 300, 500, 1000];
  const fee = platformFeeCents(amount);
  const net = amount - fee;
  const close = () => { setTipFor(null); setDone(false); setErr(null); };

  const pay = () => {
    if (!requireAuth() || send.isPending) return;
    setErr(null);
    send.mutate(
      { creatorId: tipFor.creatorId, recipeId: tipFor.recipeId, amountCents: amount },
      {
        onSuccess: (res) => {
          if (res.url) window.open(res.url, '_blank', 'noopener'); // Stripe Checkout
          else setDone(true); // mock/test mode settled instantly
        },
        onError: (e) => setErr(e instanceof Error ? e.message : 'Could not start the payment'),
      },
    );
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 94 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', paddingBottom: 30 }}>
        <div style={{ textAlign: 'center', padding: '16px 0 6px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{done ? 'Sent! 🎉' : `Support ${tipFor.name}`}</div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 2 }}>
            {done ? `${tipFor.name} just got your support.` : 'Support the food you love'}
          </div>
        </div>

        <div style={{ padding: '12px 22px 0' }}>
          {done ? (
            <button onClick={close} style={{ width: '100%', height: 52, border: 'none', borderRadius: 16, background: 'var(--invert-bg)', color: 'var(--invert-fg)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Done</button>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {presets.map((p) => {
                  const on = amount === p;
                  return (
                    <button
                      key={p}
                      onClick={() => setAmount(p)}
                      style={{ flex: 1, height: 52, borderRadius: 14, border: on ? `2px solid ${accent}` : '1.5px solid var(--line-2)', background: on ? 'rgba(255,90,54,.08)' : 'var(--surface)', color: on ? accent : 'var(--text)', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 800, cursor: 'pointer' }}
                    >
                      ${p / 100}
                    </button>
                  );
                })}
              </div>

              {/* The split, up front — no fine print. */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: 'var(--text)', fontWeight: 600 }}>
                  <span>{tipFor.name} receives</span><span>{usd(net)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text-faint)', marginTop: 4 }}>
                  <span>Sizzle platform fee ({PLATFORM_FEE_PCT}%)</span><span>{usd(fee)}</span>
                </div>
              </div>

              {cfg?.provider === 'mock' && (
                <div style={{ fontSize: 12, color: '#c98a1e', fontWeight: 600, margin: '0 2px 10px' }}>Test mode — no real money moves yet.</div>
              )}
              {err && <div style={{ color: '#d8521e', fontSize: 13.5, fontWeight: 600, margin: '0 2px 10px' }}>{err}</div>}

              <button
                onClick={pay}
                disabled={send.isPending}
                style={{ width: '100%', height: 52, border: 'none', borderRadius: 16, background: `linear-gradient(135deg,${accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 800, cursor: 'pointer', opacity: send.isPending ? 0.7 : 1 }}
              >
                {send.isPending ? 'Starting…' : `Send ${usd(amount)}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
