import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useMe, useUpdateProfile } from '../../data/queries';
import { useSizzle } from '../../store';

const field: CSSProperties = {
  width: '100%',
  height: 50,
  border: '1.5px solid #e3d6c8',
  borderRadius: 14,
  background: '#fff',
  padding: '0 16px',
  fontFamily: "'Hanken Grotesk'",
  fontSize: 16,
  color: '#1b1512',
  outline: 'none',
};
const labelStyle: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: '#8a7c70', margin: '0 0 7px 2px' };

export function EditProfileSheet() {
  const setShowEditProfile = useSizzle((s) => s.setShowEditProfile);
  const { data: me } = useMe();
  const update = useUpdateProfile();

  const [name, setName] = useState(me?.name ?? '');
  const [handle, setHandle] = useState(me?.handle ?? '');
  const [bio, setBio] = useState(me?.bio ?? '');

  const close = () => setShowEditProfile(false);
  const save = () => {
    if (update.isPending) return;
    update.mutate(
      { displayName: name.trim(), handle: handle.trim(), bio: bio.trim() },
      { onSuccess: () => close() },
    );
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 93 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#faf3ea', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', paddingBottom: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px 10px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: '#d8cbbb' }} />
          <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8a7c70', fontSize: 15, fontWeight: 600 }}>Cancel</button>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1b1512' }}>Edit profile</div>
          <button onClick={save} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent,#ff5a36)', fontSize: 15, fontWeight: 700 }}>{update.isPending ? 'Saving…' : 'Save'}</button>
        </div>
        <div style={{ padding: '12px 22px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Display name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={field} />
          </div>
          <div>
            <label style={labelStyle}>Handle</label>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} style={field} />
          </div>
          <div>
            <label style={labelStyle}>Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} style={{ ...field, height: 'auto', padding: '12px 16px', resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          {update.isError && <div style={{ color: '#d8521e', fontSize: 13.5, fontWeight: 600 }}>{(update.error as Error)?.message ?? 'Could not save.'}</div>}
        </div>
      </div>
    </div>
  );
}
