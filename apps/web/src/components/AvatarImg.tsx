import { useState } from 'react';

/**
 * Rewrite a Supabase-storage public URL to its CDN-resized rendition. A 512×512
 * quality-0.9 avatar JPEG is 80–130KB; the 96px rendition of the same object is
 * ~3KB (verified live on this project), served from the smart CDN with the same
 * cache lifetime. Non-storage URLs pass through untouched.
 */
export function avatarThumb(url: string, px: number): string {
  if (!url.includes('/storage/v1/object/public/')) return url;
  // 2x for retina; resize=cover matches objectFit: cover.
  return `${url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')}?width=${px * 2}&height=${px * 2}&resize=cover`;
}

/**
 * Avatar <img> for the small circles everywhere (rows, chips, headers): loads the
 * tiny CDN rendition and falls back to the original object URL if the transform
 * ever fails, so a render/image outage can never blank avatars.
 */
export function AvatarImg({ src, px, alt = '', style }: { src: string; px: number; alt?: string; style?: React.CSSProperties }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={failed ? src : avatarThumb(src, px)}
      alt={alt}
      decoding="async"
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }}
    />
  );
}
