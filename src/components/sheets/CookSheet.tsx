import { cookById, recipeById } from '../../data';
import { useSizzle } from '../../store';
import { theme } from '../../theme';
import { ChevronLeftIcon } from '../icons';
import { pressVars } from '../ui';

const accent = theme.accent;

export function CookSheet() {
  const openCook = useSizzle((s) => s.openCook);
  const followed = useSizzle((s) => (openCook ? !!s.followed[openCook] : false));
  const toggle = useSizzle((s) => s.toggle);
  const setOpenCook = useSizzle((s) => s.setOpenCook);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);

  if (!openCook) return null;
  const ck = cookById(openCook);
  if (!ck) return null;

  const close = () => setOpenCook(null);
  const cookRecipes = ck.recipes.map((rid) => recipeById(rid)).filter((r): r is NonNullable<typeof r> => !!r);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 85, background: '#faf3ea', overflowY: 'auto', animation: 'sz-slideUp .42s cubic-bezier(.16,1,.3,1)' }}>
      <div style={{ height: 170, background: ck.bg, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.12, background: 'repeating-linear-gradient(115deg,#000 0 2px, transparent 2px 7px)' }} />
        <button onClick={close} style={{ position: 'absolute', top: 54, left: 18, width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ChevronLeftIcon size={20} stroke="#fff" strokeWidth={2.2} />
        </button>
      </div>
      <div style={{ padding: '0 22px 60px', marginTop: -44 }}>
        <div style={{ width: 88, height: 88, borderRadius: 28, background: ck.bg, border: '4px solid #faf3ea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 36, color: '#fff' }}>{ck.init}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 }}>
          <div>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: '#1b1512' }}>{ck.name}</div>
            <div style={{ color: '#8a7c70', fontSize: 14.5 }}>{ck.handle}</div>
          </div>
          <button
            onClick={() => toggle('followed', ck.id)}
            className="sz-press"
            style={{ ...pressVars(0.94), padding: '12px 24px', borderRadius: 15, border: `1.5px solid ${followed ? '#1b1512' : accent}`, background: followed ? '#1b1512' : accent, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer', transition: 'transform .2s cubic-bezier(.34,1.56,.64,1)' }}
          >
            {followed ? 'Following' : 'Follow'}
          </button>
        </div>
        <p style={{ color: '#5c5048', fontSize: 15, lineHeight: 1.5, margin: '14px 0 0' }}>{ck.bio}</p>

        <div style={{ display: 'flex', marginTop: 18, background: '#fff', border: '1px solid #ece1d4', borderRadius: 18, overflow: 'hidden' }}>
          <CookStat value={ck.followers} label="Followers" border />
          <CookStat value={ck.following} label="Following" border />
          <CookStat value={ck.likes} label="Likes" border />
          <CookStat value={String(ck.recipes.length)} label="Recipes" />
        </div>

        <div style={{ fontSize: 14, fontWeight: 700, color: '#1b1512', margin: '24px 0 12px' }}>Recipes</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {cookRecipes.map((d) => (
            <button
              key={d.id}
              onClick={() => setOpenRecipe(d.id)}
              style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 18, overflow: 'hidden', position: 'relative', height: 180, background: d.bg, textAlign: 'left' }}
            >
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 42%, rgba(0,0,0,.72))' }} />
              <div style={{ position: 'absolute', left: 12, right: 12, bottom: 11 }}>
                <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 11, fontWeight: 600 }}>{d.time}</div>
                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 18, lineHeight: 1.05, color: '#fff', marginTop: 2 }}>{d.title}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CookStat({ value, label, border }: { value: string; label: string; border?: boolean }) {
  return (
    <div style={{ flex: 1, padding: '14px 8px', textAlign: 'center', borderRight: border ? '1px solid #f0e7da' : undefined }}>
      <div style={{ fontSize: 19, fontWeight: 800, color: '#1b1512', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#8a7c70', marginTop: 2 }}>{label}</div>
    </div>
  );
}
