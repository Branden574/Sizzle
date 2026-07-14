import type { ProfileLinks, ProfileLinkKey } from '@sizzle/shared';
import { PROFILE_LINK_KEYS } from '@sizzle/shared';

/* ── Brand glyphs (single-path, currentColor) ───────────────────────────── */
type IconProps = { size?: number };

export function InstagramIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function TikTokIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.5 3c.3 2 1.6 3.6 3.5 4v2.6c-1.3 0-2.6-.4-3.6-1v5.9a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.1v2.7a3 3 0 1 0 2.1 2.9V3h2.8z" />
    </svg>
  );
}
export function XIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.5 3h3l-7 8 8.2 10h-6.4l-5-6.2L4 21H1l7.5-8.6L1 3h6.5l4.5 5.7L17.5 3zm-1.1 16h1.7L7.7 4.8H5.9L16.4 19z" />
    </svg>
  );
}
export function YouTubeIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1c.3-1.3.4-2.5.4-3.8s-.1-2.5-.4-3.8zM10 15V9l5.2 3-5.2 3z" />
    </svg>
  );
}
export function FacebookIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z" />
    </svg>
  );
}
export function DiscordIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.3 5.6A16 16 0 0 0 15.4 4l-.2.4a12 12 0 0 1 3.4 1.7 11 11 0 0 0-9.3 0A12 12 0 0 1 12.7 4.4L12.5 4a16 16 0 0 0-3.9 1.6C5.6 9.9 4.9 14.1 5.2 18.2a16 16 0 0 0 4.8 2.4l.6-1a10 10 0 0 1-1.6-.8l.4-.3a11 11 0 0 0 9.3 0l.4.3c-.5.3-1 .6-1.6.8l.6 1a16 16 0 0 0 4.8-2.4c.4-4.7-.6-8.9-3.2-12.6zM9.7 15.6c-.9 0-1.7-.8-1.7-1.9s.7-1.9 1.7-1.9 1.7.9 1.7 1.9-.7 1.9-1.7 1.9zm4.6 0c-.9 0-1.7-.8-1.7-1.9s.7-1.9 1.7-1.9 1.7.9 1.7 1.9-.8 1.9-1.7 1.9z" />
    </svg>
  );
}
export function WebsiteIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
    </svg>
  );
}

const META: Record<ProfileLinkKey, { label: string; color: string; Icon: (p: IconProps) => JSX.Element }> = {
  instagram: { label: 'Instagram', color: '#E1306C', Icon: InstagramIcon },
  // TikTok + X are monochrome brands — use the theme foreground so they're
  // visible on both light and dark chips (var(--ink) was dark-on-dark in dark mode).
  tiktok: { label: 'TikTok', color: 'var(--text)', Icon: TikTokIcon },
  x: { label: 'X', color: 'var(--text)', Icon: XIcon },
  youtube: { label: 'YouTube', color: '#FF0000', Icon: YouTubeIcon },
  facebook: { label: 'Facebook', color: '#1877F2', Icon: FacebookIcon },
  discord: { label: 'Discord', color: '#5865F2', Icon: DiscordIcon },
  website: { label: 'Website', color: 'var(--accent)', Icon: WebsiteIcon },
};

/** A row of brand-icon chips that link out. Renders nothing when no links are set. */
export function SocialLinks({ links, size = 36 }: { links: ProfileLinks; size?: number }) {
  const present = PROFILE_LINK_KEYS.filter((k) => !!links[k]);
  if (present.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
      {present.map((k) => {
        const { label, color, Icon } = META[k];
        return (
          <a
            key={k}
            href={/^https?:\/\//i.test(links[k]!) ? links[k]! : `https://${links[k]!.replace(/^\/+/, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
            style={{
              width: size,
              height: size,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color,
              textDecoration: 'none',
              transition: 'transform .15s',
            }}
          >
            <Icon size={Math.round(size * 0.5)} />
          </a>
        );
      })}
    </div>
  );
}
