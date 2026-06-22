import type { CSSProperties } from 'react';

interface IconBase {
  size?: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}

const HEART_D = 'M12 21C12 21 4 13.7 4 8.5A4.5 4.5 0 0 1 12 5a4.5 4.5 0 0 1 8 3.5C20 13.7 12 21 12 21Z';

/* ---------- status bar ---------- */

export function SignalIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
      <rect x="0" y="7" width="3" height="5" rx="1" fill={color} />
      <rect x="5" y="4.5" width="3" height="7.5" rx="1" fill={color} />
      <rect x="10" y="2" width="3" height="10" rx="1" fill={color} />
      <rect x="15" y="0" width="3" height="12" rx="1" fill={color} opacity="0.4" />
    </svg>
  );
}

export function WifiIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
      <path
        d="M8 2.5c2 0 3.8.8 5 2.1M8 6c1.2 0 2.3.5 3 1.3M3 4.6C4.2 3.3 6 2.5 8 2.5"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="8" cy="9.6" r="1.2" fill={color} />
    </svg>
  );
}

export function BatteryIcon({ color }: { color: string }) {
  return (
    <svg width="26" height="13" viewBox="0 0 26 13" fill="none">
      <rect x="1" y="1" width="21" height="11" rx="3" stroke={color} strokeWidth="1.1" opacity="0.5" />
      <rect x="3" y="3" width="16" height="7" rx="1.5" fill={color} />
      <path d="M24 4.5v4c.9-.4.9-3.6 0-4Z" fill={color} opacity="0.6" />
    </svg>
  );
}

/* ---------- chevrons / arrows ---------- */

export function ChevronLeftIcon({ size = 20, stroke = '#1b1512', strokeWidth = 2.2 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M15 5l-7 7 7 7" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronUpIcon({ size = 17, stroke = '#1b1512', strokeWidth = 2.4 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M18 15l-6-6-6 6" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DownloadIcon({ size = 22, stroke = '#5c5048', strokeWidth = 2.2, width, height }: IconBase) {
  return (
    <svg width={width ?? size} height={height ?? size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3v12M7 11l5 5 5-5M5 20h14" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- feed iconography ---------- */

export function PlayIcon({ size = 26, fill = '#fff' }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function DotsIcon({ size = 20, fill = '#fff' }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

export function HeartIcon({ size = 34, fill = 'none', stroke, strokeWidth = 1.8, width, height, style }: IconBase) {
  return (
    <svg width={width ?? size} height={height ?? size} viewBox="0 0 24 24" fill={fill} style={style}>
      <path
        d={HEART_D}
        {...(stroke ? { stroke, strokeWidth, strokeLinejoin: 'round' as const } : {})}
      />
    </svg>
  );
}

export function DislikeIcon({ size = 30, fill = 'none', stroke = '#fff', strokeWidth = 1.7 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <path
        d="M17 14V4M3 11.5l2.2 6.3a2 2 0 0 0 1.9 1.3c1.4 0 2.4-1.3 2-2.6L8 13h6a2 2 0 0 0 2-2.3l-1-6A2 2 0 0 0 13 3H6a3 3 0 0 0-3 3z"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CommentIcon({ size = 32, stroke = '#fff', strokeWidth = 1.8 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-6.5A8 8 0 1 1 21 12Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </svg>
  );
}

export function BookmarkIcon({ size = 30, fill = 'none', stroke = '#fff', strokeWidth = 1.8, style }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} style={style}>
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </svg>
  );
}

export function ShareIcon({ size = 30, stroke = '#fff', strokeWidth = 1.8 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon({ size = 14, stroke = '#fff', strokeWidth = 3 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ size = 13, stroke = '#1b1512', strokeWidth = 3 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 12l5 5L20 6" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchIcon({ size = 20, stroke = '#a99c90', strokeWidth = 2 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke={stroke} strokeWidth={strokeWidth} />
      <path d="M21 21l-4.5-4.5" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ size = 20, stroke = '#fff', strokeWidth = 2.2 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6 6 18" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function CameraIcon({ size = 34, stroke = '#fff', strokeWidth = 1.8 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M15 8h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3l1.5-2.5h3L15 8Z"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.5" r="3.2" stroke={stroke} strokeWidth={strokeWidth} />
    </svg>
  );
}

/* ---------- bottom nav ---------- */

export function HomeIcon({ size = 25, fill = 'none', stroke = '#fff', strokeWidth = 2 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <path d="M3 10.5 12 3l9 7.5V21H3z" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </svg>
  );
}

export function PersonIcon({ size = 25, stroke = '#fff', strokeWidth = 2 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke={stroke} strokeWidth={strokeWidth} />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function NavPlusIcon({ size = 24, stroke = '#fff', strokeWidth = 2.6 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 6v12M6 12h12" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

/* ---------- misc ---------- */

export function GearIcon({ size = 20, stroke = '#5c5048' }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke={stroke} strokeWidth="2" />
      <path
        d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 1.6 14H1.5a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 6.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 4.6V4.5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"
        stroke={stroke}
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function BellIcon({ size = 20, stroke = '#5c5048', strokeWidth = 2 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RepostIcon({ size = 20, stroke = '#5c5048', strokeWidth = 1.9 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 9V8a3 3 0 0 1 3-3h9l-2.2-2.2M20 15v1a3 3 0 0 1-3 3H8l2.2 2.2" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 5l2.5 0M8 19l-2.5 0" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function FlagIcon({ size = 20, stroke = '#5c5048', strokeWidth = 1.9 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 21V4m0 1.5c4-2 7 2 11 0V14c-4 2-7-2-11 0" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Device-rotation glyph (a phone turning to landscape) — "rotate to full screen". */
export function RotateIcon({ size = 19, stroke = '#fff', strokeWidth = 1.9 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {/* phone, landscape */}
      <rect x="2.5" y="9.5" width="13" height="9" rx="2" />
      {/* curved arrow sweeping over the top-right corner, into landscape */}
      <path d="M13 6.2A6.5 6.5 0 0 1 20.4 12" />
      <path d="M21 8.4l-.5 3.8-3.7-.7" />
    </svg>
  );
}

/** Trash / delete glyph. */
export function TrashIcon({ size = 20, stroke = '#d8521e', strokeWidth = 2 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7M6.5 7l.9 12.1a1.4 1.4 0 0 0 1.4 1.3h6.4a1.4 1.4 0 0 0 1.4-1.3L18.5 7" />
      <path d="M10.5 11v5.5M13.5 11v5.5" />
    </svg>
  );
}

const SPEAKER_BODY = 'M11 5 6 9H3v6h3l5 4V5Z';
export function SpeakerIcon({ size = 20, stroke = '#fff', strokeWidth = 1.9 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d={SPEAKER_BODY} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}
export function SpeakerOffIcon({ size = 20, stroke = '#fff', strokeWidth = 1.9 }: IconBase) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d={SPEAKER_BODY} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="m16 9 5 5m0-5-5 5" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

/* Settings-row glyphs (rendered at 21px, muted ink). */
export function SettingHeartIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
      <path d={HEART_D} stroke="var(--text-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function SettingCommentIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
      <path
        d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-6.5A8 8 0 1 1 21 12Z"
        stroke="var(--text-soft)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function SettingCountsIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
      <path d="M3 12h4l3 8 4-16 3 8h4" stroke="var(--text-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
