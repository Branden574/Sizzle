import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { tasteDefs } from '../data';
import { useSuggestedCooks } from '../data/queries';
import { useSizzle } from '../store';
import { theme } from '../theme';
import { ChevronLeftIcon } from './icons';
import { pressVars } from './ui';

const STEP_IN = 'sz-stepIn .55s cubic-bezier(.34,1.56,.64,1)';

export function Onboarding() {
  const step = useSizzle((s) => s.onbStep);
  const tastes = useSizzle((s) => s.tastes);
  const followed = useSizzle((s) => s.followed);
  const toggle = useSizzle((s) => s.toggle);
  const next = useSizzle((s) => s.next);
  const back = useSizzle((s) => s.back);
  const setOnbStep = useSizzle((s) => s.setOnbStep);
  const setMode = useAuth((s) => s.setMode);

  // "Log in" from the hero jumps straight to the account step in login mode.
  const goLogin = () => {
    setMode('login');
    setOnbStep(3);
  };

  const tasteCount = Object.values(tastes).filter(Boolean).length;
  const followCount = Object.values(followed).filter(Boolean).length;

  const showBack = step > 0;
  const showContinue = step === 1 || step === 2;
  const contReady = (step === 1 && tasteCount > 0) || (step === 2 && followCount > 0);
  const contLabel =
    step === 1
      ? tasteCount > 0
        ? `Continue · ${tasteCount} picked`
        : 'Pick a few to continue'
      : followCount > 0
        ? `Continue · ${followCount} following`
        : 'Follow a cook to continue';

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: theme.cream }}>
      {/* progress dots */}
      <div style={{ position: 'absolute', top: 64, left: 0, right: 0, zIndex: 30, display: 'flex', gap: 7, justifyContent: 'center' }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 5,
              borderRadius: 3,
              transition: 'all .45s cubic-bezier(.34,1.56,.64,1)',
              width: i === step ? 22 : 7,
              background: i <= step ? theme.ink : '#e0d4c6',
            }}
          />
        ))}
      </div>

      {step === 0 && <StepHero next={next} onLogin={goLogin} />}
      {step === 1 && (
        <StepTastes
          tastes={tastes}
          toggle={(label) => toggle('tastes', label)}
        />
      )}
      {step === 2 && (
        <StepCooks followed={followed} toggle={(id) => toggle('followed', id)} />
      )}
      {step === 3 && <StepAccount />}

      {showBack && (
        <button
          onClick={back}
          style={{
            position: 'absolute',
            top: 58,
            left: 20,
            zIndex: 31,
            width: 38,
            height: 38,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(27,21,18,.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <ChevronLeftIcon />
        </button>
      )}

      {showContinue && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '18px 26px 36px',
            background: 'linear-gradient(180deg, transparent, #faf3ea 38%)',
          }}
        >
          <button
            onClick={next}
            className="sz-press"
            style={{
              ...pressVars(0.97),
              width: '100%',
              height: 58,
              border: 'none',
              borderRadius: 18,
              background: contReady ? theme.ink : '#ece1d4',
              color: contReady ? '#fff' : '#a99c90',
              fontFamily: "'Hanken Grotesk'",
              fontSize: 17,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'transform .2s cubic-bezier(.34,1.56,.64,1)',
            }}
          >
            {contLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function StepHero({ next, onLogin }: { next: () => void; onLogin: () => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', animation: STEP_IN }}>
      <div
        style={{
          flex: 1,
          position: 'relative',
          margin: '96px 22px 0',
          borderRadius: 32,
          overflow: 'hidden',
          background: 'radial-gradient(130% 100% at 30% 10%, #ff8a4d 0%, #e23a18 45%, #7a1f0c 100%)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 40% at 70% 80%, rgba(244,165,44,.55), transparent 70%)' }} />
        <div style={{ position: 'absolute', inset: 0, opacity: 0.12, background: 'repeating-linear-gradient(115deg, #000 0 2px, transparent 2px 7px)' }} />
        <div style={{ position: 'absolute', top: 24, left: 28, fontFamily: "'Instrument Serif',serif", fontSize: 30, color: '#fff', letterSpacing: '.5px' }}>
          Sizzle
        </div>
        <div style={{ position: 'absolute', left: 28, bottom: 30, right: 28, color: '#fff' }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', opacity: 0.85 }}>Recipes, in motion</div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 60, lineHeight: 0.92, marginTop: 8 }}>
            Watch it.
            <br />
            Then cook it.
          </div>
        </div>
      </div>
      <div style={{ padding: '26px 26px 40px' }}>
        <p style={{ margin: '0 0 22px', color: '#5c5048', fontSize: 16, lineHeight: 1.5, maxWidth: 300 }}>
          A full-screen video feed of real recipes from real home cooks. Swipe, save, cook.
        </p>
        <button
          onClick={next}
          className="sz-press"
          style={{
            ...pressVars(0.96),
            width: '100%',
            height: 58,
            border: 'none',
            borderRadius: 18,
            background: '#1b1512',
            color: '#fff',
            fontFamily: "'Hanken Grotesk'",
            fontSize: 17,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'transform .2s cubic-bezier(.34,1.56,.64,1)',
          }}
        >
          Get started
        </button>
        <button
          onClick={onLogin}
          style={{ width: '100%', height: 44, marginTop: 6, border: 'none', background: 'none', color: '#6c5f56', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          Already have an account? <span style={{ color: '#1b1512', fontWeight: 700 }}>Log in</span>
        </button>
      </div>
    </div>
  );
}

function StepTastes({ tastes, toggle }: { tastes: Record<string, boolean>; toggle: (label: string) => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '104px 26px 0', display: 'flex', flexDirection: 'column', animation: STEP_IN }}>
      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 40, lineHeight: 1.02, color: '#1b1512' }}>What makes you hungry?</div>
      <p style={{ margin: '12px 0 22px', color: '#6c5f56', fontSize: 15 }}>Pick a few. We'll tune your feed.</p>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 11, alignContent: 'flex-start', paddingBottom: 120 }}>
        {tasteDefs.map((label) => {
          const sel = !!tastes[label];
          return (
            <button
              key={label}
              onClick={() => toggle(label)}
              className="sz-press"
              style={{
                ...pressVars(0.93, sel ? 1.04 : 1),
                border: `1.5px solid ${sel ? '#1b1512' : '#e6dacb'}`,
                background: sel ? '#1b1512' : '#fff',
                color: sel ? '#fff' : '#3a322c',
                padding: '13px 18px',
                borderRadius: 16,
                fontFamily: "'Hanken Grotesk'",
                fontSize: 15.5,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all .28s cubic-bezier(.34,1.56,.64,1)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepCooks({ followed, toggle }: { followed: Record<string, boolean>; toggle: (id: string) => void }) {
  const tastes = useSizzle((s) => s.tastes);
  const selected = Object.entries(tastes).filter(([, v]) => v).map(([k]) => k);
  const { data: suggested, isLoading } = useSuggestedCooks(selected);

  return (
    <div style={{ position: 'absolute', inset: 0, padding: '104px 0 0', display: 'flex', flexDirection: 'column', animation: STEP_IN }}>
      <div style={{ padding: '0 26px' }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 40, lineHeight: 1.02, color: '#1b1512' }}>Follow a few cooks</div>
        <p style={{ margin: '12px 0 18px', color: '#6c5f56', fontSize: 15 }}>Picked for your taste — their newest recipes land in Following.</p>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 26px 130px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {isLoading && <div style={{ color: '#a99c90', fontSize: 14, padding: '8px 2px' }}>Finding cooks for your taste…</div>}
        {(suggested ?? []).map((c) => {
          const f = !!followed[c.id];
          const subtitle = c.matched.length ? c.matched.join(' · ') : c.bio;
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #ece1d4', borderRadius: 22, padding: 14 }}>
              <div
                style={{ width: 56, height: 56, borderRadius: 18, flex: 'none', background: c.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 22, color: '#fff' }}
              >
                {c.init}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1b1512' }}>{c.name}</div>
                <div style={{ fontSize: 13, color: c.matched.length ? '#c0531f' : '#8a7c70', fontWeight: c.matched.length ? 600 : 400, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
              </div>
              <button
                onClick={() => toggle(c.id)}
                className="sz-press"
                style={{
                  ...pressVars(0.92),
                  flex: 'none',
                  padding: '11px 18px',
                  borderRadius: 14,
                  border: `1.5px solid ${f ? '#1b1512' : '#e0d4c6'}`,
                  background: f ? '#1b1512' : '#fff',
                  color: f ? '#fff' : '#1b1512',
                  fontFamily: "'Hanken Grotesk'",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all .25s cubic-bezier(.34,1.56,.64,1)',
                }}
              >
                {f ? 'Following' : 'Follow'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inputStyle = {
  height: 54,
  border: '1.5px solid #e3d6c8',
  borderRadius: 16,
  background: '#fff',
  padding: '0 18px',
  fontFamily: "'Hanken Grotesk'",
  fontSize: 16,
  color: '#1b1512',
  outline: 'none',
  width: '100%',
} as const;

function StepAccount() {
  const mode = useAuth((s) => s.mode);
  const setMode = useAuth((s) => s.setMode);
  const error = useAuth((s) => s.error);
  const busy = useAuth((s) => s.busy);
  const signUp = useAuth((s) => s.signUp);
  const signIn = useAuth((s) => s.signIn);
  const signInOAuth = useAuth((s) => s.signInOAuth);
  const continueAsGuest = useAuth((s) => s.continueAsGuest);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const isLogin = mode === 'login';
  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (isLogin) void signIn(email, password);
    else void signUp(email, password);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, padding: '88px 0 0', display: 'flex', flexDirection: 'column', animation: STEP_IN }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 26px 16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 42, lineHeight: 1.02, color: '#1b1512' }}>
          {isLogin ? 'Welcome back.' : 'Save your taste.'}
        </div>
        <p style={{ margin: '12px 0 22px', color: '#6c5f56', fontSize: 15.5, lineHeight: 1.5, maxWidth: 320 }}>
          {isLogin
            ? 'Log in to pick up your saves, downloads, and the cooks you follow.'
            : 'Create an account to keep your saves, downloads, and the cooks you follow.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <button
            onClick={() => void signInOAuth('apple')}
            className="sz-press"
            style={{ ...pressVars(0.97), height: 54, border: 'none', borderRadius: 16, background: '#1b1512', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer', transition: 'transform .2s' }}
          >
            Continue with Apple
          </button>
          <button
            onClick={() => void signInOAuth('google')}
            className="sz-press"
            style={{ ...pressVars(0.97), height: 54, border: '1.5px solid #e3d6c8', borderRadius: 16, background: '#fff', color: '#1b1512', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer', transition: 'transform .2s' }}
          >
            Continue with Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#e8ddd0' }} />
            <span style={{ color: '#a99c90', fontSize: 13 }}>or</span>
            <div style={{ flex: 1, height: 1, background: '#e8ddd0' }} />
          </div>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />

            {error && <div style={{ color: '#d8521e', fontSize: 13.5, fontWeight: 600, padding: '0 2px' }}>{error}</div>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="sz-press"
              style={{
                ...pressVars(0.97),
                height: 56,
                border: 'none',
                borderRadius: 16,
                background: '#1b1512',
                color: '#fff',
                fontFamily: "'Hanken Grotesk'",
                fontSize: 16,
                fontWeight: 700,
                cursor: canSubmit ? 'pointer' : 'default',
                opacity: canSubmit ? 1 : 0.55,
                transition: 'transform .2s, opacity .2s',
              }}
            >
              {busy ? 'One moment…' : isLogin ? 'Log in' : 'Create account'}
            </button>
          </form>

          <button
            onClick={() => setMode(isLogin ? 'signup' : 'login')}
            style={{ height: 40, border: 'none', background: 'none', color: '#6c5f56', fontFamily: "'Hanken Grotesk'", fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}
          >
            {isLogin ? 'New here? ' : 'Already have an account? '}
            <span style={{ color: '#1b1512', fontWeight: 700 }}>{isLogin ? 'Create an account' : 'Log in'}</span>
          </button>
        </div>
      </div>

      <div style={{ padding: '6px 26px 28px' }}>
        <button
          onClick={continueAsGuest}
          style={{ width: '100%', height: 48, border: 'none', background: 'none', color: '#8a7c70', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
