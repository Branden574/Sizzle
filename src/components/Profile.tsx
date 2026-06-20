import { recipes } from '../data';
import { useSizzle } from '../store';
import { GearIcon } from './icons';

export function Profile() {
  const saves = useSizzle((s) => s.saves);
  const followed = useSizzle((s) => s.followed);
  const setOpenRecipe = useSizzle((s) => s.setOpenRecipe);

  const savedRecipes = recipes.filter((r) => saves[r.id]);
  const savedCount = savedRecipes.length;
  const savedEmpty = savedCount === 0;
  const followingCount = Object.values(followed).filter(Boolean).length;

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#faf3ea', overflowY: 'auto', animation: 'sz-fadeIn .35s' }}>
      <div style={{ height: 150, background: 'radial-gradient(120% 120% at 70% 0%, var(--saffron,#f4a52c), var(--accent,#ff5a36) 60%, #c23a1a)', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.12, background: 'repeating-linear-gradient(115deg,#000 0 2px, transparent 2px 7px)' }} />
      </div>
      <div style={{ padding: '0 22px 110px', marginTop: -44 }}>
        <div style={{ width: 88, height: 88, borderRadius: 28, background: 'linear-gradient(135deg,#3a2a22,#1b1512)', border: '4px solid #faf3ea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 34, color: '#fff' }}>A</div>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: '#1b1512', marginTop: 12 }}>Alex Rivera</div>
        <div style={{ color: '#8a7c70', fontSize: 14.5 }}>@alexcooks · Home cook in training</div>
        <div style={{ display: 'flex', gap: 22, marginTop: 18 }}>
          <Stat value={String(followingCount)} label="Following" />
          <Stat value="128" label="Followers" />
          <Stat value={String(savedCount)} label="Saved" />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button style={{ flex: 1, height: 48, border: 'none', borderRadius: 14, background: '#1b1512', color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Edit profile</button>
          <button style={{ width: 48, height: 48, border: '1.5px solid #e3d6c8', borderRadius: 14, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GearIcon size={20} stroke="#5c5048" />
          </button>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1b1512', margin: '26px 0 12px' }}>Your saved recipes</div>
        {savedEmpty && (
          <div style={{ padding: 30, textAlign: 'center', background: '#fff', border: '1px dashed #e3d6c8', borderRadius: 20, color: '#a99c90', fontSize: 14 }}>Recipes you save will collect here.</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {savedRecipes.map((r) => (
            <button
              key={r.id}
              onClick={() => setOpenRecipe(r.id)}
              style={{ border: 'none', padding: 0, cursor: 'pointer', borderRadius: 14, overflow: 'hidden', position: 'relative', aspectRatio: '3 / 4', background: r.bg }}
            >
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 45%, rgba(0,0,0,.7))' }} />
              <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, fontFamily: "'Instrument Serif',serif", fontSize: 14, lineHeight: 1.05, color: '#fff' }}>{r.title}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 21, fontWeight: 800, color: '#1b1512', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 13, color: '#8a7c70' }}>{label}</div>
    </div>
  );
}
