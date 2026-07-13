import { useEffect, useState } from 'react';
import { Preferences } from '@capacitor/preferences';
import { Button } from './controls';

/**
 * One-time first-launch notice: while the community is young, part of the feed
 * is demo content we made with AI so the app feels alive from day one. Shown
 * once (persisted via Preferences), then never again — full transparency about
 * what's a real creator and what's a placeholder.
 */

const SEEN_KEY = 'sz_demo_notice_v1';

export function useDemoNotice(active: boolean): { show: boolean; dismiss: () => void } {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void Preferences.get({ key: SEEN_KEY }).then(({ value }) => {
      if (!cancelled && !value) setShow(true);
    });
    return () => { cancelled = true; };
  }, [active]);

  const dismiss = () => {
    setShow(false);
    void Preferences.set({ key: SEEN_KEY, value: '1' });
  };

  return { show, dismiss };
}

/** A line that rises in with a stagger. */
function Rise({ delay, children }: { delay: number; children: React.ReactNode }) {
  return (
    <div style={{ opacity: 0, animation: `sz-riseIn .55s cubic-bezier(.16,1,.3,1) ${delay}ms forwards` }}>
      {children}
    </div>
  );
}

export function DemoContentNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 96,
        background: 'var(--scrim, rgba(0,0,0,.6))',
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'sz-riseIn .3s ease forwards',
      }}
    >
      <div
        style={{
          width: '100%',
          background: 'var(--bg)',
          borderRadius: '26px 26px 0 0',
          padding: '30px 26px calc(26px + env(safe-area-inset-bottom, 0px))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          animation: 'sz-slideUp .5s cubic-bezier(.16,1,.3,1)',
        }}
      >
        <Rise delay={100}>
          <div
            style={{
              width: 74,
              height: 74,
              borderRadius: 22,
              background: 'linear-gradient(135deg, var(--accent), var(--saffron, #f4a52c))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              marginBottom: 16,
              boxShadow: '0 14px 34px -12px rgba(0,0,0,.45)',
              animation: 'sz-breathe 2.2s ease-in-out infinite',
            }}
          >
            ✨
          </div>
        </Rise>
        <Rise delay={220}>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 27, color: 'var(--text)', lineHeight: 1.15 }}>
            You're early — welcome!
          </div>
        </Rise>
        <Rise delay={340}>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-2)', margin: '12px 0 0', maxWidth: 300 }}>
            Sizzle just launched. While our community of home cooks grows, some
            recipes in the feed are <b style={{ color: 'var(--text)' }}>demo posts we crafted with AI</b> so
            there's plenty to explore from day one.
          </p>
        </Rise>
        <Rise delay={460}>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-2)', margin: '10px 0 0', maxWidth: 300 }}>
            As real creators join and share, their cooking takes center stage —
            maybe starting with yours.
          </p>
        </Rise>
        <Rise delay={620}>
          <Button
            variant="primary"
            size="lg"
            onClick={onDismiss}
            style={{ marginTop: 22, width: 260 }}
          >
            Let's cook
          </Button>
        </Rise>
      </div>
    </div>
  );
}
