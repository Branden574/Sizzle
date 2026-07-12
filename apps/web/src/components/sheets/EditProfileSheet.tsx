import { useEffect, useRef, useState } from 'react';
import { Button, DismissBackdrop } from '../controls';
import { useSwipeDismiss } from '../../lib/useSwipeDismiss';
import type { CSSProperties } from 'react';
import { PROFILE_LINK_KEYS, type ProfileLinkKey } from '@sizzle/shared';
import { useMe, useUpdateProfile } from '../../data/queries';
import { uploadProfileImage } from '../../lib/storage';
import { ImageCropper } from '../ImageCropper';
import { useSizzle } from '../../store';
import { CameraIcon } from '../icons';
import { InstagramIcon, TikTokIcon, XIcon, YouTubeIcon, FacebookIcon, DiscordIcon, WebsiteIcon } from '../SocialLinks';

const LINK_META: Record<ProfileLinkKey, { label: string; placeholder: string; Icon: (p: { size?: number }) => JSX.Element }> = {
  instagram: { label: 'Instagram', placeholder: '@handle or instagram.com/…', Icon: InstagramIcon },
  tiktok: { label: 'TikTok', placeholder: '@handle or tiktok.com/@…', Icon: TikTokIcon },
  x: { label: 'X', placeholder: '@handle or x.com/…', Icon: XIcon },
  youtube: { label: 'YouTube', placeholder: '@handle or youtube.com/@…', Icon: YouTubeIcon },
  facebook: { label: 'Facebook', placeholder: 'facebook.com/…', Icon: FacebookIcon },
  discord: { label: 'Discord', placeholder: 'discord.gg/invite', Icon: DiscordIcon },
  website: { label: 'Website', placeholder: 'yoursite.com', Icon: WebsiteIcon },
};

const field: CSSProperties = {
  width: '100%',
  height: 50,
  border: '1.5px solid var(--line-2)',
  borderRadius: 14,
  background: 'var(--surface)',
  padding: '0 16px',
  fontFamily: "'Hanken Grotesk'",
  fontSize: 16,
  color: 'var(--text)',
  outline: 'none',
};
const labelStyle: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 7px 2px' };
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
  const [handleErr, setHandleErr] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [cropping, setCropping] = useState<{ src: string; bucket: 'avatars' | 'banners' } | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);

  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  // If the sheet mounted before `me` loaded (cold cache), the fields seeded to
  // '' — re-seed them once `me` arrives so Save can't PATCH empty values that
  // would wipe the profile.
  const seeded = useRef(false);
  useEffect(() => {
    if (me && !seeded.current) {
      seeded.current = true;
      setName(me.name ?? '');
      setHandle(me.handle ?? '');
      setPhone(me.phone ?? '');
      setBio(me.bio ?? '');
      setAvatarUrl(me.avatarUrl ?? null);
      setBannerUrl(me.bannerUrl ?? null);
      setLinks(Object.fromEntries(PROFILE_LINK_KEYS.map((k) => [k, me.links[k] ?? ''])));
    }
  }, [me]);

  const close = () => setShowEditProfile(false);
  const swipe = useSwipeDismiss(close);

  // Picking a file opens the cropper; the upload happens on "Use photo".
  const pick = (bucket: 'avatars' | 'banners', file: File | undefined) => {
    if (!file || !me) return;
    setErr(null);
    setCropping({ src: URL.createObjectURL(file), bucket });
  };

  const cancelCrop = () => {
    if (cropping) URL.revokeObjectURL(cropping.src);
    setCropping(null);
  };

  const applyCrop = async (blob: Blob) => {
    if (!cropping || !me) return;
    const { src, bucket } = cropping;
    setCropping(null);
    URL.revokeObjectURL(src);
    setErr(null);
    setUploading(bucket === 'avatars' ? 'avatar' : 'banner');
    try {
      const file = new File([blob], `${bucket}.jpg`, { type: 'image/jpeg' });
      const url = await uploadProfileImage(bucket, me.id, file);
      if (bucket === 'avatars') setAvatarUrl(url);
      else setBannerUrl(url);
      setPhotoNote(bucket === 'avatars' ? 'Photo updated — tap Save to keep it.' : 'Banner updated — tap Save to keep it.');
    } catch {
      setErr('Image upload failed — try a smaller file.');
    } finally {
      setUploading(null);
    }
  };

  const canSave = name.trim().length > 0 && handle.trim().length >= 2;
  const save = () => {
    if (update.isPending || uploading) return;
    if (!canSave) {
      setErr(handle.trim().length < 2 ? 'Handle needs at least 2 characters.' : 'Name can’t be empty.');
      return;
    }
    const linkPayload = Object.fromEntries(PROFILE_LINK_KEYS.map((k) => [k, links[k]?.trim() || null]));
    update.mutate(
      { displayName: name.trim(), handle: handle.trim(), bio: bio.trim().slice(0, 150), phone: phone.trim(), avatarUrl, bannerUrl, links: linkPayload },
      {
        onSuccess: () => close(),
        onError: (e) => {
          const msg = (e as Error)?.message ?? '';
          if (/taken/i.test(msg)) setHandleErr('That username is taken — try another.');
          else setErr(msg || 'Could not save.');
        },
      },
    );
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 93 }}>
      <DismissBackdrop onDismiss={close} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 60, background: 'var(--bg)', borderRadius: '26px 26px 0 0', overflow: 'hidden', animation: 'sz-slideUp .4s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column', ...swipe.sheetStyle }}>
        <div {...swipe.handlers} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px 10px', flex: 'none', position: 'relative' , ...swipe.handlers.style}}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 42, height: 5, borderRadius: 3, background: 'var(--track)' }} />
          <Button variant="text" size="sm" onClick={close}>Cancel</Button>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Edit profile</div>
          <Button variant="primary" size="sm" onClick={save} disabled={!canSave} loading={update.isPending} loadingLabel="Saving…">Save</Button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* banner + avatar uploaders */}
          <Button
            onClick={() => bannerInput.current?.click()}
            style={{ position: 'relative', display: 'block', width: '100%', height: 120, border: 'none', cursor: 'pointer', background: bannerUrl ? `url(${bannerUrl}) center/cover no-repeat` : BANNER, padding: 0 }}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#fff', fontSize: 13, fontWeight: 700 }}>
              <CameraIcon size={20} stroke="#fff" strokeWidth={1.8} />
              {uploading === 'banner' ? 'Uploading…' : 'Change banner'}
            </div>
          </Button>
          <div style={{ padding: '0 22px', marginTop: -36, position: 'relative', zIndex: 1 }}>
            <Button
              onClick={() => avatarInput.current?.click()}
              style={{ position: 'relative', width: 80, height: 80, borderRadius: 24, border: '4px solid var(--bg)', cursor: 'pointer', overflow: 'hidden', background: avatarUrl ? `url(${avatarUrl}) center/cover` : 'linear-gradient(135deg,#3a2a22,#1b1512)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Instrument Serif',serif", fontSize: 30, color: '#fff', padding: 0 }}
            >
              {!avatarUrl && (me?.init ?? '·')}
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CameraIcon size={20} stroke="#fff" strokeWidth={1.8} />
              </div>
            </Button>
          </div>
          <input ref={bannerInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { pick('banners', e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={avatarInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { pick('avatars', e.target.files?.[0]); e.target.value = ''; }} />

          {photoNote && (
            <div style={{ margin: '12px 22px 0', padding: '10px 14px', borderRadius: 12, background: 'rgba(31,157,85,.13)', color: '#1f9d55', fontSize: 13.5, fontWeight: 700 }}>
              ✓ {photoNote}
            </div>
          )}

          {cropping && (
            <ImageCropper
              src={cropping.src}
              aspect={cropping.bucket === 'avatars' ? 1 : 3}
              round={cropping.bucket === 'avatars'}
              title={cropping.bucket === 'avatars' ? 'Adjust photo' : 'Adjust banner'}
              onCancel={cancelCrop}
              onComplete={applyCrop}
            />
          )}

          <div style={{ padding: '16px 22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Display name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} style={field} />
            </div>
            <div>
              <label style={labelStyle}>Handle</label>
              <input
                value={handle}
                onChange={(e) => { setHandle(e.target.value); if (handleErr) setHandleErr(null); }}
                style={{ ...field, borderColor: handleErr ? '#d8521e' : (field.border as string) }}
              />
              {handleErr && <div style={{ color: '#d8521e', fontSize: 12.5, fontWeight: 600, marginTop: 6, marginLeft: 2 }}>{handleErr}</div>}
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(optional)" style={field} />
            </div>
            <div>
              <label style={labelStyle}>Bio</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 150))} maxLength={150} rows={3} style={{ ...field, height: 'auto', padding: '12px 16px', resize: 'vertical', lineHeight: 1.5 }} />
              <div style={{ textAlign: 'right', fontSize: 12, color: bio.length >= 150 ? '#d8521e' : 'rgba(255,255,255,.4)', marginTop: 4 }}>{bio.length}/150</div>
            </div>

            {/* Social links */}
            <div style={{ marginTop: 4 }}>
              <label style={labelStyle}>Social links</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {PROFILE_LINK_KEYS.map((k) => {
                  const { label, placeholder, Icon } = LINK_META[k];
                  return (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1.5px solid var(--line-2)', borderRadius: 14, padding: '0 14px', height: 50 }}>
                      <span style={{ color: 'var(--text-faint)', display: 'flex', flex: 'none' }} aria-hidden><Icon size={18} /></span>
                      <input
                        value={links[k] ?? ''}
                        onChange={(e) => setLinks((s) => ({ ...s, [k]: e.target.value }))}
                        placeholder={`${label} · ${placeholder}`}
                        inputMode="url"
                        autoCapitalize="none"
                        autoCorrect="off"
                        style={{ flex: 1, minWidth: 0, height: '100%', border: 'none', background: 'transparent', fontFamily: "'Hanken Grotesk'", fontSize: 15, color: 'var(--text)', outline: 'none' }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {(err || (update.isError && !handleErr)) && <div style={{ color: '#d8521e', fontSize: 13.5, fontWeight: 600 }}>{err ?? (update.error as Error)?.message ?? 'Could not save.'}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
