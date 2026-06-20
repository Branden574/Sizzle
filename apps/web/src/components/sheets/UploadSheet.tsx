import { useState, type CSSProperties } from 'react';
import { useRequireAuth } from '../../auth/useRequireAuth';
import { useUploadRecipe } from '../../data/queries';
import { useSizzle } from '../../store';
import { theme } from '../../theme';
import { CameraIcon } from '../icons';

const accent = theme.accent;

const field: CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,.06)',
  border: '1.5px solid rgba(255,255,255,.15)',
  borderRadius: 14,
  color: '#fff',
  fontFamily: "'Hanken Grotesk'",
  fontSize: 15,
  padding: '13px 14px',
  outline: 'none',
};
const labelStyle: CSSProperties = { display: 'block', color: 'rgba(255,255,255,.5)', fontSize: 12, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', margin: '0 0 7px 2px' };

export function UploadSheet() {
  const setShowUpload = useSizzle((s) => s.setShowUpload);
  const setTab = useSizzle((s) => s.setTab);
  const setFeed = useSizzle((s) => s.setFeed);
  const requireAuth = useRequireAuth();
  const upload = useUploadRecipe();

  const [title, setTitle] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [time, setTime] = useState('');
  const [servings, setServings] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [steps, setSteps] = useState('');

  const close = () => setShowUpload(false);
  const canPost = title.trim().length > 0 && !upload.isPending;

  const submit = () => {
    if (!requireAuth()) return;
    if (!canPost) return;
    upload.mutate(
      {
        title: title.trim(),
        cuisine: cuisine.trim() || 'Home',
        level: 'Easy',
        timeMinutes: parseInt(time, 10) || 15,
        servings: parseInt(servings, 10) || 2,
        ingredients: ingredients.split('\n').map((s) => s.trim()).filter(Boolean),
        steps: steps.split('\n').map((s) => s.trim()).filter(Boolean),
      },
      {
        onSuccess: () => {
          setShowUpload(false);
          setFeed('foryou');
          setTab('feed');
        },
      },
    );
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 90, background: '#0c0a09', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '56px 20px 14px', flex: 'none' }}>
        <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 16, fontWeight: 600 }}>Cancel</button>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>New recipe</div>
        <div style={{ width: 48 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 20, border: '2px dashed rgba(255,255,255,.2)', background: 'radial-gradient(120% 120% at 50% 0%, #2a201a, #100c0a)', marginBottom: 18 }}>
          <div style={{ width: 52, height: 52, flex: 'none', borderRadius: '50%', background: `linear-gradient(135deg,${accent},#e23a18)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 22px -6px rgba(226,58,24,.6)' }}>
            <CameraIcon size={26} stroke="#fff" strokeWidth={1.8} />
          </div>
          <div>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20, color: '#fff' }}>Film your dish</div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, marginTop: 2 }}>15–60s video · then add the details below</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Charred Miso Eggplant" style={field} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 2 }}>
              <label style={labelStyle}>Cuisine</label>
              <input value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="Japanese" style={field} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Time (min)</label>
              <input value={time} onChange={(e) => setTime(e.target.value)} inputMode="numeric" placeholder="25" style={field} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Serves</label>
              <input value={servings} onChange={(e) => setServings(e.target.value)} inputMode="numeric" placeholder="2" style={field} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Ingredients · one per line</label>
            <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={4} placeholder={'2 globe eggplants\n3 tbsp white miso'} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          <div>
            <label style={labelStyle}>Method · one step per line</label>
            <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={4} placeholder={'Halve and score the eggplants.\nSear cut-side down until caramelized.'} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          {upload.isError && <div style={{ color: '#ff8a6b', fontSize: 13.5, fontWeight: 600 }}>Couldn't post — please try again.</div>}
        </div>
      </div>

      <div style={{ padding: '14px 20px 32px', flex: 'none' }}>
        <button
          onClick={submit}
          disabled={!canPost}
          style={{ width: '100%', height: 56, border: 'none', borderRadius: 17, background: `linear-gradient(135deg,${accent},#e23a18)`, color: '#fff', fontFamily: "'Hanken Grotesk'", fontSize: 16, fontWeight: 700, cursor: canPost ? 'pointer' : 'default', opacity: canPost ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}
        >
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff' }} />
          {upload.isPending ? 'Posting…' : 'Post recipe'}
        </button>
      </div>
    </div>
  );
}
