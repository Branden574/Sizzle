import type { JSX } from 'react';
import { useMediaQuery } from '../lib/useMediaQuery';
import { BookmarkIcon, CameraIcon, HeartIcon, PlayIcon, SearchIcon } from './icons';

/** Local flame icon (not in the shared icon set). */
function FlameIcon({ size = 22, stroke = 'currentColor' }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c1 3-2 4-2 7a2 2 0 0 0 4 0c0-1 0-1 .5-2 1.5 2 3.5 3.5 3.5 7a6 6 0 0 1-12 0c0-3.5 3-5 6-12z" />
    </svg>
  );
}

/**
 * The Sizzle marketing website (the web "front door"). Full-browser, responsive —
 * showcases the app and routes visitors to Get started / Log in (the web app) or
 * the upcoming native apps. Distinct from the phone-style app shell.
 */
export function Marketing({ onGetStarted, onLogin }: { onGetStarted: () => void; onLogin: () => void }) {
  const isMobile = useMediaQuery('(max-width: 860px)');

  return (
    <div style={{ minHeight: '100dvh', width: '100%', overflowX: 'hidden', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Hanken Grotesk', sans-serif" }}>
      {/* ── Nav ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '14px 20px' : '18px 40px', background: 'color-mix(in srgb, var(--bg) 82%, transparent)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--line, rgba(0,0,0,.06))' }}>
        <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, letterSpacing: '.2px', color: 'var(--text)' }}>Sizzle</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onLogin} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-soft)', fontSize: 15, fontWeight: 700, padding: '10px 12px' }}>Log in</button>
          <button onClick={onGetStarted} style={cta(false)}>Get started</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '40px 22px 24px' : '72px 40px 40px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: isMobile ? 36 : 56 }}>
        <div style={{ flex: 1, textAlign: isMobile ? 'center' : 'left' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', color: 'var(--accent)', fontSize: 13, fontWeight: 800, letterSpacing: '.4px', textTransform: 'uppercase', padding: '7px 13px', borderRadius: 999, marginBottom: 22 }}>
            <FlameIcon size={15} /> Recipes, in motion
          </div>
          <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 52 : 78, lineHeight: 1.0, margin: 0, color: 'var(--text)' }}>
            Watch it.<br />Then cook it.
          </h1>
          <p style={{ fontSize: isMobile ? 17 : 20, lineHeight: 1.5, color: 'var(--text-soft)', margin: '22px 0 30px', maxWidth: 520, marginLeft: isMobile ? 'auto' : 0, marginRight: isMobile ? 'auto' : 0 }}>
            A full-screen video feed of real recipes from real home cooks. Swipe, save, and cook along — step by step, with built-in timers.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: isMobile ? 'center' : 'flex-start', flexWrap: 'wrap' }}>
            <button onClick={onGetStarted} style={cta(true)}>Get started — it’s free</button>
            <button onClick={onLogin} style={ctaGhost()}>I have an account</button>
          </div>
          <div style={{ marginTop: 18, color: 'var(--text-faint-2)', fontSize: 13.5 }}>Free to join · no ads · your kitchen, your pace</div>
        </div>

        {/* phone mockup */}
        <div style={{ flex: 'none', display: 'flex', justifyContent: 'center' }}>
          <PhoneMock />
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '24px 22px' : '48px 40px' }}>
        <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 34 : 44, textAlign: 'center', margin: '0 0 8px' }}>Everything you need to actually cook it</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-soft)', fontSize: 16.5, margin: '0 auto 36px', maxWidth: 540 }}>Not just another feed — a kitchen companion built around real meals.</p>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 18 }}>
          <Feature Icon={PlayIcon} title="A feed you can taste" body="Vertical, full-screen recipe videos from home cooks. Swipe to discover your next meal." />
          <Feature Icon={FlameIcon} title="Cook Mode" body="Tap into step-by-step mode with hands-free timers and a screen that stays awake while you cook." />
          <Feature Icon={BookmarkIcon} title="Save & collections" body="Bookmark recipes and organize them into your own cookbooks — and build a shopping list in a tap." />
          <Feature Icon={HeartIcon} title="Follow real creators" body="Follow the cooks you love and get their newest recipes in your Following feed." />
          <Feature Icon={SearchIcon} title="Discover by craving" body="Search hashtags, cuisines, and trending dishes — find exactly what you’re hungry for." />
          <Feature Icon={CameraIcon} title="Share your own" body="Record right in the app and post your recipes or food reviews to the world." />
        </div>
      </section>

      {/* ── Download / coming soon ── */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '20px 22px 8px' : '40px 40px 16px' }}>
        <div style={{ borderRadius: 28, padding: isMobile ? '36px 24px' : '54px 48px', background: 'linear-gradient(135deg, var(--accent), #e23a18)', color: '#fff', textAlign: 'center', boxShadow: '0 30px 70px -30px rgba(226,58,24,.6)' }}>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 34 : 46, margin: '0 0 10px', color: '#fff' }}>Take Sizzle to the kitchen</h2>
          <p style={{ fontSize: 17, lineHeight: 1.5, color: 'rgba(255,255,255,.9)', margin: '0 auto 28px', maxWidth: 480 }}>
            Native iOS &amp; Android apps are on the way. Start now on the web — your saves and follows come with you.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <StoreBadge platform="App Store" />
            <StoreBadge platform="Google Play" />
          </div>
          <button onClick={onGetStarted} style={{ marginTop: 26, height: 54, padding: '0 30px', border: 'none', borderRadius: 16, background: '#fff', color: 'var(--accent)', fontFamily: "'Hanken Grotesk'", fontSize: 16.5, fontWeight: 800, cursor: 'pointer' }}>
            Open the web app
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '28px 22px 48px' : '40px 40px 56px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 14, color: 'var(--text-faint-2)', fontSize: 14 }}>
        <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 24, color: 'var(--text)' }}>Sizzle</div>
        <div>© {2026} Sizzle · Watch it. Then cook it.</div>
      </footer>
    </div>
  );
}

function Feature({ Icon, title, body }: { Icon: (p: { size?: number; stroke?: string }) => JSX.Element; title: string; body: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line-2, rgba(0,0,0,.07))', borderRadius: 20, padding: 24 }}>
      <div style={{ width: 46, height: 46, borderRadius: 14, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Icon size={23} stroke="var(--accent)" />
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--text-soft)' }}>{body}</div>
    </div>
  );
}

function StoreBadge({ platform }: { platform: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 11, background: 'rgba(0,0,0,.28)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 14, padding: '11px 18px', color: '#fff' }}>
      <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
        <div style={{ fontSize: 11, opacity: 0.85 }}>Coming soon to</div>
        <div style={{ fontSize: 16.5, fontWeight: 800 }}>{platform}</div>
      </div>
    </div>
  );
}

/** A small device mockup showing the recipe feed, for the hero. */
function PhoneMock() {
  return (
    <div style={{ position: 'relative', width: 264, height: 540, borderRadius: 42, background: '#0c0a09', boxShadow: '0 2px 0 2px #2c2521 inset, 0 50px 90px -30px rgba(0,0,0,.55), 0 0 0 10px #1c1714', overflow: 'hidden', flex: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(80% 55% at 70% 22%, rgba(244,165,44,.55), transparent 70%), linear-gradient(170deg,#2a160e,#b5471f)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.25) 0%, transparent 30%, transparent 55%, rgba(0,0,0,.85) 100%)' }} />
      <div style={{ position: 'absolute', top: 18, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 18, color: '#fff', fontSize: 13.5, fontWeight: 700 }}>
        <span style={{ opacity: 0.6 }}>For You</span><span>Following</span>
      </div>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PlayIcon size={24} />
      </div>
      <div style={{ position: 'absolute', left: 18, right: 18, bottom: 26 }}>
        <div style={{ display: 'inline-block', background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(6px)', color: '#fff', fontSize: 10.5, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 8, marginBottom: 8 }}>Coastal · 45 min</div>
        <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 27, color: '#fff', lineHeight: 1.05, textShadow: '0 2px 10px rgba(0,0,0,.5)' }}>Saffron Seafood Rice</div>
        <div style={{ color: '#ffd9cd', fontSize: 12.5, marginTop: 6 }}>#coastal #weeknight</div>
      </div>
    </div>
  );
}

const cta = (large: boolean) => ({
  height: large ? 54 : 42,
  padding: large ? '0 26px' : '0 18px',
  border: 'none',
  borderRadius: large ? 16 : 12,
  background: 'var(--accent)',
  color: '#fff',
  fontFamily: "'Hanken Grotesk'",
  fontSize: large ? 16.5 : 15,
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: '0 12px 26px -10px rgba(226,58,24,.6)',
} as const);

const ctaGhost = () => ({
  height: 54,
  padding: '0 24px',
  border: '1.5px solid var(--line-2, rgba(0,0,0,.15))',
  borderRadius: 16,
  background: 'var(--surface)',
  color: 'var(--text)',
  fontFamily: "'Hanken Grotesk'",
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
} as const);
