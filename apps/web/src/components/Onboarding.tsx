import { useEffect, useMemo, useState } from 'react';
import { Button, FilterChip, FollowButton, IconButton } from './controls';
import { GlowButton } from './glow';
import { useAuth } from '../auth/useAuth';
import { isNative } from '../lib/native';
import { tasteDefs } from '../data';
import { useSuggestedCooks } from '../data/queries';
import { apiGet } from '../lib/api';
import { countries, subdivisions, TERMS_VERSION } from '../lib/geo';
import { LegalDoc } from './LegalDoc';
import { formatCount } from '../lib/format';
import { useSizzle } from '../store';
import { theme } from '../theme';
import { ChevronLeftIcon } from './icons';

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
  // Following cooks is optional — step 2 can always continue.
  const contReady = (step === 1 && tasteCount > 0) || step === 2;
  const contLabel =
    step === 1
      ? tasteCount > 0
        ? `Continue · ${tasteCount} picked`
        : 'Pick a few to continue'
      : followCount > 0
        ? `Continue · ${followCount} following`
        : 'Skip for now';

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
              background: i <= step ? theme.ink : 'var(--line-3)',
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
        <IconButton
          onClick={back}
          label="Go back"
          variant="tonal"
          size="sm"
          style={{ position: 'absolute', top: 58, left: 20, zIndex: 31 }}
        >
          <ChevronLeftIcon />
        </IconButton>
      )}

      {showContinue && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '18px 26px 36px',
            background: 'linear-gradient(180deg, transparent, var(--bg) 38%)',
          }}
        >
          <Button
            onClick={next}
            variant="primary"
            size="lg"
            fullWidth
            disabled={!contReady}
          >
            {contLabel}
          </Button>
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
        <p style={{ margin: '0 0 22px', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1.5, maxWidth: 300 }}>
          A full-screen video feed of real recipes from real home cooks. Swipe, save, cook.
        </p>
        <GlowButton
          onClick={next}
          size="lg"
          fullWidth
          haptic="selection"
        >
          Get started
        </GlowButton>
        <Button
          onClick={onLogin}
          variant="text"
          fullWidth
          style={{ marginTop: 6 }}
        >
          Already have an account? <span style={{ color: 'var(--text)', fontWeight: 700 }}>Log in</span>
        </Button>
      </div>
    </div>
  );
}

function StepTastes({ tastes, toggle }: { tastes: Record<string, boolean>; toggle: (label: string) => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '104px 26px 0', display: 'flex', flexDirection: 'column', animation: STEP_IN }}>
      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 40, lineHeight: 1.02, color: 'var(--text)' }}>What makes you hungry?</div>
      <p style={{ margin: '12px 0 22px', color: 'var(--text-soft)', fontSize: 15 }}>Pick a few. We'll tune your feed.</p>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 11, alignContent: 'flex-start', paddingBottom: 120 }}>
        {tasteDefs.map((label) => {
          const sel = !!tastes[label];
          return (
            <FilterChip
              key={label}
              onClick={() => toggle(label)}
              selected={sel}
            >
              {label}
            </FilterChip>
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
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 40, lineHeight: 1.02, color: 'var(--text)' }}>Top cooks on Sizzle</div>
        <p style={{ margin: '12px 0 18px', color: 'var(--text-soft)', fontSize: 15 }}>Following is optional — their newest recipes show up in your Following feed.</p>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 26px 130px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {isLoading && <div style={{ color: 'var(--text-faint-2)', fontSize: 14, padding: '8px 2px' }}>Finding the platform's top cooks…</div>}
        {(suggested ?? []).map((c) => {
          const f = !!followed[c.id];
          const followerLabel = `${formatCount(c.followers)} ${c.followers === 1 ? 'follower' : 'followers'}`;
          const subtitle = c.matched.length ? `${followerLabel} · ${c.matched.join(' · ')}` : followerLabel;
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 22, padding: 14 }}>
              <div
                style={{ width: 56, height: 56, borderRadius: 18, flex: 'none', background: c.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 22, color: '#fff' }}
              >
                {c.init}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{c.name}</div>
                <div style={{ fontSize: 13, color: c.matched.length ? '#c0531f' : 'var(--text-faint)', fontWeight: c.matched.length ? 600 : 400, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
              </div>
              <FollowButton
                name={c.name}
                state={f ? 'following' : 'follow'}
                compact
                onClick={() => toggle(c.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inputStyle = {
  height: 54,
  border: '1.5px solid var(--line-2)',
  borderRadius: 16,
  background: 'var(--surface)',
  padding: '0 18px',
  fontFamily: "'Hanken Grotesk'",
  fontSize: 16,
  color: 'var(--text)',
  outline: 'none',
  width: '100%',
} as const;

const selectChevron = { position: 'absolute', right: 16, top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--text-faint-2)', fontSize: 13, pointerEvents: 'none' } as const;
const legalLinkStyle = { background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', textDecoration: 'underline' } as const;

function StepAccount() {
  const mode = useAuth((s) => s.mode);
  const setMode = useAuth((s) => s.setMode);
  const error = useAuth((s) => s.error);
  const busy = useAuth((s) => s.busy);
  const signUp = useAuth((s) => s.signUp);
  const signIn = useAuth((s) => s.signIn);
  const signInOAuth = useAuth((s) => s.signInOAuth);
  const resetPassword = useAuth((s) => s.resetPassword);
  const resendSignup = useAuth((s) => s.resendSignup);
  const clearError = useAuth((s) => s.clearError);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [handleState, setHandleState] = useState<'idle' | 'short' | 'checking' | 'available' | 'taken'>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  // Signup compliance: country + state/region + Terms/Privacy acceptance.
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showLegal, setShowLegal] = useState<'terms' | 'privacy' | null>(null);
  const countryOpts = useMemo(() => countries(), []);
  const subs = country ? subdivisions(country) : null;

  const isLogin = mode === 'login';

  // Normalized username (case preserved) + debounced availability check (signup only).
  const cleanHandle = username.trim().replace(/[^A-Za-z0-9_]/g, '');
  useEffect(() => {
    if (isLogin) return;
    if (cleanHandle.length < 3) {
      setHandleState(cleanHandle.length === 0 ? 'idle' : 'short');
      return;
    }
    setHandleState('checking');
    const t = setTimeout(async () => {
      try {
        const r = await apiGet<{ available: boolean }>(`/cooks/handle-available?handle=${encodeURIComponent(cleanHandle)}`);
        setHandleState(r.available ? 'available' : 'taken');
      } catch {
        setHandleState('idle');
      }
    }, 450);
    return () => clearTimeout(t);
  }, [cleanHandle, isLogin]);

  if (forgot) {
    const back = () => { setForgot(false); setResetSent(false); clearError(); };
    const sendReset = (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim() || busy) return;
      void resetPassword(email).then((ok) => { if (ok) setResetSent(true); });
    };
    return (
      <div style={{ position: 'absolute', inset: 0, padding: '116px 0 0', display: 'flex', flexDirection: 'column', animation: STEP_IN }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 26px 16px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 42, lineHeight: 1.02, color: 'var(--text)' }}>Reset password.</div>
          <p style={{ margin: '12px 0 22px', color: 'var(--text-soft)', fontSize: 15.5, lineHeight: 1.5, maxWidth: 320 }}>
            {resetSent ? 'Check your email for a link to set a new password.' : 'Enter your email and we’ll send you a reset link.'}
          </p>
          {resetSent ? (
            <Button onClick={back} variant="primary" size="lg" fullWidth>
              Back to log in
            </Button>
          ) : (
            <form onSubmit={sendReset} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <input type="email" autoComplete="email" inputMode="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
              {error && <div style={{ color: '#d8521e', fontSize: 13.5, fontWeight: 600, padding: '0 2px' }}>{error}</div>}
              <Button type="submit" variant="primary" size="lg" fullWidth disabled={!email.trim()} loading={busy} loadingLabel="Sending…">
                Send reset link
              </Button>
              <Button type="button" variant="text" onClick={back}>
                Back to log in
              </Button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (confirmSent) {
    const back = () => { setConfirmSent(false); setResent(false); clearError(); };
    const resend = async () => {
      setResending(true);
      const ok = await resendSignup(email);
      setResending(false);
      if (ok) setResent(true);
    };
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 34px', animation: STEP_IN }}>
        <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 26, animation: 'sz-pop .55s cubic-bezier(.34,1.56,.64,1)', boxShadow: '0 12px 34px -14px rgba(226,58,24,.5)' }}>
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="3" />
            <path d="m3 6 9 6 9-6" />
          </svg>
        </div>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 40, lineHeight: 1.05, color: 'var(--text)' }}>Thanks for signing up!</div>
        <p style={{ color: 'var(--text-soft)', fontSize: 16, lineHeight: 1.55, margin: '14px 0 6px', maxWidth: 350 }}>
          We sent a confirmation link to <b style={{ color: 'var(--text)' }}>{email || 'your email'}</b>. Tap it to verify your email and start cooking.
        </p>
        <p style={{ color: 'var(--text-faint-2)', fontSize: 13.5, margin: '0 0 30px' }}>Didn’t get it? Check your spam folder.</p>
        <Button
          onClick={resend}
          disabled={resending || resent}
          variant="primary"
          size="lg"
          fullWidth
          loading={resending}
          loadingLabel="Sending…"
          success={resent}
          successLabel="Email sent"
          style={{ maxWidth: 360 }}
        >
          Resend email
        </Button>
        <Button type="button" variant="text" onClick={back} style={{ marginTop: 14 }}>
          Use a different email
        </Button>
      </div>
    );
  }

  // Strong-password requirements (signup): 10+ chars, uppercase, number, symbol.
  const pwChecks = {
    length: password.length >= 10,
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
  const pwValid = pwChecks.length && pwChecks.upper && pwChecks.number && pwChecks.symbol;

  const canSubmit = isLogin
    ? email.trim().length > 0 && password.length > 0 && !busy
    : name.trim().length > 0 && handleState === 'available' && email.trim().length > 0 && pwValid && country !== '' && (subs ? region !== '' : true) && agreed && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (isLogin) {
      void signIn(email, password);
    } else {
      const result = await signUp(email, password, {
        name,
        phone,
        handle: cleanHandle,
        country,
        region: region || undefined,
        termsAcceptedAt: new Date().toISOString(),
        termsVersion: TERMS_VERSION,
      });
      // 'confirmed' logs in automatically; 'pending' needs email verification.
      if (result === 'pending') setConfirmSent(true);
    }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, padding: '116px 0 0', display: 'flex', flexDirection: 'column', animation: STEP_IN }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 26px 16px', display: 'flex', flexDirection: 'column' }}>
        {showLegal && <LegalDoc which={showLegal} onClose={() => setShowLegal(null)} />}
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 42, lineHeight: 1.02, color: 'var(--text)' }}>
          {isLogin ? 'Welcome back.' : 'Save your taste.'}
        </div>
        <p style={{ margin: '12px 0 22px', color: 'var(--text-soft)', fontSize: 15.5, lineHeight: 1.5, maxWidth: 320 }}>
          {isLogin
            ? 'Log in to pick up your saves, downloads, and the cooks you follow.'
            : 'Create an account to keep your saves, downloads, and the cooks you follow.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {/* App Store compliance: social sign-in is WEB-ONLY until the Apple +
              Google providers are configured in Supabase. Guideline 4.8 requires
              a working Sign in with Apple whenever Google login is offered on
              iOS, and an unconfigured provider = a broken button (2.1). Native
              ships email-only auth for v1 — remove the !isNative gate once both
              providers are live (docs/app-store-deployment.md §2). */}
          {!isNative && (
            <>
              <Button
                onClick={() => void signInOAuth('apple')}
                variant="secondary"
                size="lg"
                fullWidth
              >
                Continue with Apple
              </Button>
              <Button
                onClick={() => void signInOAuth('google')}
                variant="outline"
                size="lg"
                fullWidth
              >
                Continue with Google
              </Button>
            </>
          )}

          {/* Social sign-up consent: the email form has its own 13+ checkbox, but
              OAuth skips that form, so capture the same agreement here. */}
          {!isLogin && (
            <p style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-faint)', textAlign: 'center', margin: '2px 6px 0' }}>
              By continuing, you confirm you’re 13+ and agree to Sizzle’s{' '}
              <Button type="button" onClick={() => setShowLegal('terms')} style={legalLinkStyle}>Terms</Button>
              {' '}and{' '}
              <Button type="button" onClick={() => setShowLegal('privacy')} style={legalLinkStyle}>Privacy Policy</Button>.
            </p>
          )}

          {!isNative && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--line-2)' }} />
              <span style={{ color: 'var(--text-faint-2)', fontSize: 13 }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'var(--line-2)' }} />
            </div>
          )}

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {!isLogin && (
              <>
                <input type="text" autoComplete="name" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
                <input type="tel" autoComplete="tel" inputMode="tel" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
                <div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 16, top: 0, bottom: 0, display: 'flex', alignItems: 'center', color: 'var(--text-faint-2)', fontSize: 16, pointerEvents: 'none' }}>@</span>
                    <input
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      style={{ ...inputStyle, paddingLeft: 32, paddingRight: 44, width: '100%', boxSizing: 'border-box', borderColor: handleState === 'taken' ? '#d8521e' : handleState === 'available' ? '#1f9d55' : (inputStyle.border as string) }}
                    />
                    <span style={{ position: 'absolute', right: 14, top: 0, bottom: 0, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 700, color: handleState === 'available' ? '#1f9d55' : '#d8521e' }}>
                      {handleState === 'checking' ? '…' : handleState === 'available' ? '✓' : handleState === 'taken' ? '✕' : ''}
                    </span>
                  </div>
                  {(handleState === 'taken' || handleState === 'short') && (
                    <div style={{ color: '#d8521e', fontSize: 12.5, fontWeight: 600, marginTop: 5, marginLeft: 2 }}>
                      {handleState === 'taken' ? 'That username is taken — try another.' : 'At least 3 characters (letters, numbers, _).'}
                    </div>
                  )}
                  {handleState === 'available' && (
                    <div style={{ color: '#1f9d55', fontSize: 12.5, fontWeight: 600, marginTop: 5, marginLeft: 2 }}>@{cleanHandle} is available</div>
                  )}
                </div>
              </>
            )}
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...inputStyle, paddingRight: 48, width: '100%', boxSizing: 'border-box' }}
              />
              <IconButton
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                label={showPassword ? 'Hide password' : 'Show password'}
                variant="text"
                style={{ position: 'absolute', right: 4, top: 4 }}
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </IconButton>
            </div>

            {!isLogin && (
              <>
                {/* Country + state/region — captured for per-jurisdiction compliance. */}
                <div style={{ position: 'relative' }}>
                  <select value={country} onChange={(e) => { setCountry(e.target.value); setRegion(''); }} aria-label="Country" style={{ ...inputStyle, appearance: 'none', WebkitAppearance: 'none', color: country ? 'var(--text)' : 'var(--text-faint-2)', paddingRight: 40, cursor: 'pointer' }}>
                    <option value="" disabled>Country</option>
                    {countryOpts.map((c) => <option key={c.code} value={c.code} style={{ color: 'var(--text)' }}>{c.name}</option>)}
                  </select>
                  <span style={selectChevron}>▾</span>
                </div>
                {subs && (
                  <div style={{ position: 'relative' }}>
                    <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label={country === 'CA' ? 'Province' : 'State'} style={{ ...inputStyle, appearance: 'none', WebkitAppearance: 'none', color: region ? 'var(--text)' : 'var(--text-faint-2)', paddingRight: 40, cursor: 'pointer' }}>
                      <option value="" disabled>{country === 'CA' ? 'Province' : 'State'}</option>
                      {subs.map((s) => <option key={s} value={s} style={{ color: 'var(--text)' }}>{s}</option>)}
                    </select>
                    <span style={selectChevron}>▾</span>
                  </div>
                )}
                {/* Required Terms + Privacy acceptance (blocks Create account until checked). */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '6px 2px 2px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} aria-label="Agree to Terms and Privacy Policy" style={{ width: 20, height: 20, marginTop: 1, accentColor: theme.accent, flex: 'none', cursor: 'pointer' }} />
                  <span style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--text-soft)' }}>
                    I’m 13+ and agree to Sizzle’s{' '}
                    <Button type="button" onClick={() => setShowLegal('terms')} style={legalLinkStyle}>Terms of Service</Button>
                    {' '}and{' '}
                    <Button type="button" onClick={() => setShowLegal('privacy')} style={legalLinkStyle}>Privacy Policy</Button>.
                  </span>
                </label>
              </>
            )}

            {isLogin && (
              <Button
                type="button"
                onClick={() => { clearError(); setForgot(true); }}
                variant="text"
                size="sm"
                style={{ alignSelf: 'flex-end' }}
              >
                Forgot password?
              </Button>
            )}

            {!isLogin && password.length > 0 && !pwValid && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', padding: '0 2px' }}>
                {([['10+ characters', pwChecks.length], ['Uppercase', pwChecks.upper], ['Number', pwChecks.number], ['Symbol', pwChecks.symbol]] as const).map(([label, ok]) => (
                  <span key={label} style={{ fontSize: 12.5, fontWeight: 600, color: ok ? '#1f9d55' : 'var(--text-faint-2)' }}>{ok ? '✓' : '○'} {label}</span>
                ))}
              </div>
            )}

            {error && <div style={{ color: '#d8521e', fontSize: 13.5, fontWeight: 600, padding: '0 2px' }}>{error}</div>}

            <Button
              type="submit"
              disabled={!canSubmit && !busy}
              variant="primary"
              size="lg"
              fullWidth
              loading={busy}
              loadingLabel="One moment…"
            >
              {isLogin ? 'Log in' : 'Create account'}
            </Button>
          </form>

          <Button
            onClick={() => setMode(isLogin ? 'signup' : 'login')}
            variant="text"
            fullWidth
          >
            {isLogin ? 'New here? ' : 'Already have an account? '}
            <span style={{ color: 'var(--text)', fontWeight: 700 }}>{isLogin ? 'Create an account' : 'Log in'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
