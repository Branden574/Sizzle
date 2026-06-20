import { cooks, tasteDefs } from '../data';
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
  const finish = useSizzle((s) => s.finish);

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

      {step === 0 && <StepHero next={next} />}
      {step === 1 && (
        <StepTastes
          tastes={tastes}
          toggle={(label) => toggle('tastes', label)}
        />
      )}
      {step === 2 && (
        <StepCooks followed={followed} toggle={(id) => toggle('followed', id)} />
      )}
      {step === 3 && <StepAccount finish={finish} />}

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

function StepHero({ next }: { next: () => void }) {
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
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '104px 0 0', display: 'flex', flexDirection: 'column', animation: STEP_IN }}>
      <div style={{ padding: '0 26px' }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 40, lineHeight: 1.02, color: '#1b1512' }}>Follow a few cooks</div>
        <p style={{ margin: '12px 0 18px', color: '#6c5f56', fontSize: 15 }}>Their newest recipes land in Following.</p>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 26px 130px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {cooks.map((c) => {
          const f = !!followed[c.id];
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #ece1d4', borderRadius: 22, padding: 14 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 18,
                  flex: 'none',
                  background: c.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Instrument Serif',serif",
                  fontSize: 22,
                  color: '#fff',
                }}
              >
                {c.init}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1b1512' }}>{c.name}</div>
                <div style={{ fontSize: 13, color: '#8a7c70', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.blurb}</div>
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

function StepAccount({ finish }: { finish: () => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '104px 26px 40px', display: 'flex', flexDirection: 'column', animation: STEP_IN }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 46, lineHeight: 1, color: '#1b1512' }}>Save your taste.</div>
        <p style={{ margin: '14px 0 30px', color: '#6c5f56', fontSize: 16, lineHeight: 1.5, maxWidth: 300 }}>
          Create an account to keep your saves, downloads, and the cooks you follow.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={finish}
            className="sz-press"
            style={{ ...pressVars(0.97), height: 56, border: 'none', borderRadius: 16, background: '#1b1512', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer', transition: 'transform .2s' }}
          >
            Continue with Apple
          </button>
          <button
            onClick={finish}
            className="sz-press"
            style={{ ...pressVars(0.97), height: 56, border: '1.5px solid #e3d6c8', borderRadius: 16, background: '#fff', color: '#1b1512', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: 'pointer', transition: 'transform .2s' }}
          >
            Continue with Google
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#e8ddd0' }} />
            <span style={{ color: '#a99c90', fontSize: 13 }}>or</span>
            <div style={{ flex: 1, height: 1, background: '#e8ddd0' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', height: 56, border: '1.5px solid #e3d6c8', borderRadius: 16, background: '#fff', padding: '0 18px', color: '#a99c90', fontSize: 16 }}>
            Email address
          </div>
        </div>
      </div>
      <button
        onClick={finish}
        style={{ height: 50, border: 'none', background: 'none', color: '#8a7c70', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
      >
        Skip for now
      </button>
    </div>
  );
}
