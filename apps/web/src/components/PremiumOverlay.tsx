import type { CSSProperties } from 'react';
import type { RecipeCard } from '@sizzle/shared';
import { CheckIcon } from './icons';

/** Compact price label: $4.99, or $5 when it's a whole dollar amount. */
function priceLabel(cents: number): string {
  const d = cents / 100;
  return `$${d % 1 === 0 ? d.toFixed(0) : d.toFixed(2)}`;
}

function Crown({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.5 7.2 7 11l5-7 5 7 4.5-3.8L19.4 19H4.6L2.5 7.2Z" />
    </svg>
  );
}

function Lock({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.4" fill="currentColor" stroke="none" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

const srOnly: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

/**
 * Gold premium treatment for a recipe grid tile — a metallic-gold frame + restrained
 * shimmer, a PREMIUM badge, and the viewer's access state (lock = must unlock, ✓ =
 * owned/accessible). Renders nothing for a non-premium recipe.
 *
 * State is driven ENTIRELY off the server-computed card fields (`locked`/`price`/
 * `visibility`) — never a client guess — so it can never show a lock to someone who
 * has access or a price to someone who owns it. `isOwn` (the creator viewing their
 * own grid) suppresses the lock/owned chip so their post reads simply as "PREMIUM".
 *
 * Sits as an absolute overlay inside a `position:relative` tile — it never changes
 * the tile's geometry, so a premium cell is the same size as a free one.
 */
export function PremiumOverlay({ card, radius, isOwn = false, index = 0 }: { card: RecipeCard; radius: number; isOwn?: boolean; index?: number }) {
  const premium = card.price != null || card.visibility === 'subscribers';
  if (!premium) return null;

  const locked = !isOwn && card.locked;
  const owned = !isOwn && !card.locked;
  const chipLabel = card.price != null ? priceLabel(card.price) : 'Subscribers';
  const a11y = isOwn
    ? `Premium recipe${card.price != null ? `, ${priceLabel(card.price)}` : ''}.`
    : locked
      ? `Premium recipe, locked. ${card.price != null ? `${priceLabel(card.price)} to unlock` : 'Subscribers only'}.`
      : 'Premium recipe, you have access.';

  // Stagger the shimmer so a grid never sweeps in unison (custom prop needs a cast).
  const frameStyle = { position: 'absolute', inset: 0, borderRadius: radius, pointerEvents: 'none', zIndex: 3 } as CSSProperties;
  (frameStyle as Record<string, string | number>)['--sz-premium-delay'] = `${(index % 6) * 1.15}s`;

  const chip: CSSProperties = {
    position: 'absolute', top: 6, right: 6, zIndex: 4,
    display: 'flex', alignItems: 'center', gap: 3,
    padding: '3px 6px', borderRadius: 7,
    background: 'rgba(10,7,4,.58)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
    color: 'var(--premium-gold-hi)', fontSize: 9.5, fontWeight: 800, letterSpacing: '.02em',
  };

  return (
    <>
      <div className="sz-premium-frame" aria-hidden style={frameStyle} />
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 6, left: 6, zIndex: 4,
          display: 'flex', alignItems: 'center', gap: 3,
          padding: '3px 6px 3px 5px', borderRadius: 7,
          background: 'linear-gradient(135deg, var(--premium-gold-hi), var(--premium-gold))',
          color: '#3a2705', fontSize: 8.5, fontWeight: 900, letterSpacing: '.05em',
          boxShadow: '0 1px 4px rgba(0,0,0,.35)',
        }}
      >
        <Crown /> PREMIUM
      </div>
      {locked && (
        <div style={chip}><Lock /> {chipLabel}</div>
      )}
      {owned && (
        <div style={chip}><CheckIcon size={10} stroke="var(--premium-gold-hi)" strokeWidth={3} /> OWNED</div>
      )}
      <span style={srOnly}>{a11y}</span>
    </>
  );
}
