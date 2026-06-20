import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useMe, useUpdateProfile } from '../../data/queries';
import { uploadProfileImage } from '../../lib/storage';
import { useSizzle } from '../../store';
import { CameraIcon } from '../icons';

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
const BANNER = 'radial-gradient(120% 120% at 70% 0%, var(--saffron,#f4a52c), var(--accent,#ff5a36) 60%, #c23a1a)';

export function EditProfileSheet() {
  const setShowEditProfile = useSizzle((s) => s.setShowEditProfile);
  const { data: me } = useMe();
  const update = useUpdateProfile();

  const [name, setName] = useState(me?.name ?? '');
  const [handle, setHandle] = useState(me?.handle ?? '');
  const [phone, setPhone] = useState(me?.phone ?? '');
  const [bio, setBio] = useState(me?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me?.avatarUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(me?.bannerUrl ?? null);
  const [uploading, setUploading] = useState<'avatar' | 'banner' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const close = () => setShowEditProfile(false);

  const pick = async (bucket: 'avatars' | 'banners', file: File | undefined) => {
    if (!file || !me) return;
    setErr(null);
    setUploading(bucket === 'avatars' ? 'avatar' : 'banner');
    try {
      const url = await uploadProfileImage(bucket, me.id, file);
      if (bucket === 'avatars') setAvatarUrl(url);
      else setBannerUrl(url);
    } catch {
      setErr('Image upload failed — try a smaller file.');
    } finally {
      setUploading(null);
    }
  };

  const save = () => {
    if (update.isPending || uploading) return;
    update.mutate(
      { displayName: name.trim(), handle: handle.trim(), bio: bio.trim(), phone: phone.trim(), avatarUrl, bannerUrl },
      { onSuccess: () => close() },
    );
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 93 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', animation: 'sz-fadeIn .3s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 60, background: '#faf3ea', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px 10px', flex: 'none', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: '#d8cbbb' }} />
          <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8a7c70', fontSize: 15, fontWeight: 600 }}>Cancel</button>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1b1512' }}>Edit profile</div>
          <button onClick={save} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent,#ff5a36)', fontSize: 15, fontWeight: 700 }}>{update.isPending ? 'Saving…' : 'Save'}</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* banner + avatar uploaders */}
          <button
            onClick={() => bannerInput.current?.click()}
            style={{ position: 'relative', display: 'block', width: '100%', height: 120, border: 'none', cursor: 'pointer', background: bannerUrl ? `url(${bannerUrl}) center/cover no-repeat` : BANNER, padding: 0 }}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#fff', fontSize: 13, fontWeight: 700 }}>
              <CameraIcon size={20} stroke="#fff" strokeWidth={1.8} />
              {uploading === 'banner' ? 'Uploading…' : 'Change banner'}
            </div>
          </button>
          <div style={{ padding: '0 22px', marginTop: -36, position: 'relative', zIndex: 1 }}>
            <button
              onClick={() => avatarInput.current?.click()}
              style={{ position: 'relative', width: 80, height: 80, borderRadius: 24, border: '4px solid #faf3ea', cursor: 'pointer', overflow: 'hidden', background: avatarUrl ? `url(${avatarUrl}) center/cover` : 'linear-gradient(135deg,#3a2a22,#1b1512)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 30, color: '#fff', padding: 0 }}
            >
              {!avatarUrl && (me?.init ?? '·')}
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CameraIcon size={20} stroke="#fff" strokeWidth={1.8} />
              </div>
            </button>
          </div>
          <input ref={bannerInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => void pick('banners', e.target.files?.[0])} />
          <input ref={avatarInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => void pick('avatars', e.target.files?.[0])} />

          <div style={{ padding: '16px 22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Display name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={field} />
            </div>
            <div>
              <label style={labelStyle}>Handle</label>
              <input value={handle} onChange={(e) => setHandle(e.target.value)} style={field} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(optional)" style={field} />
            </div>
            <div>
              <label style={labelStyle}>Bio</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} style={{ ...field, height: 'auto', padding: '12px 16px', resize: 'vertical', lineHeight: 1.5 }} />
            </div>
            {(err || update.isError) && <div style={{ color: '#d8521e', fontSize: 13.5, fontWeight: 600 }}>{err ?? (update.error as Error)?.message ?? 'Could not save.'}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
