import type { VerificationTier } from '@sizzle/shared';

const SEAL_D =
  'M12 1l2.4 2.1 3.2-.2 1.3 2.9 2.9 1.3-.2 3.2L23 12l-2.1 2.4.2 3.2-2.9 1.3-1.3 2.9-3.2-.2L12 23l-2.4-2.1-3.2.2-1.3-2.9L2.2 16l.2-3.2L1 12l2.1-2.4-.2-3.2 2.9-1.3L7.1 2.2l3.2.2L12 1z';

/** Blue verification seal (100k); animated gold seal (1M). Null tier renders nothing. */
export function VerifiedBadge({ tier, size = 16 }: { tier: VerificationTier | null | undefined; size?: number }) {
  if (!tier) return null;
  const gold = tier === 'gold';
  const gid = gold ? 'sz-gold-grad' : undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={gold ? 'sz-gold-badge' : undefined}
      style={{ flex: 'none', display: 'inline-block', verticalAlign: 'middle' }}
      aria-label={gold ? 'Verified (1M+)' : 'Verified'}
    >
      {gold && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f7d774" />
            <stop offset="50%" stopColor="#e8a93c" />
            <stop offset="100%" stopColor="#caa23a" />
          </linearGradient>
        </defs>
      )}
      <path d={SEAL_D} fill={gold ? `url(#${gid})` : '#1d9bf0'} />
      <path d="M7.8 12.2l2.7 2.7L16.4 9" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
