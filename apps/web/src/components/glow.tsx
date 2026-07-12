import { forwardRef, useMemo, type CSSProperties, type ReactNode } from 'react';
import { Button, type ButtonProps } from './controls';
import { useMediaQuery } from '../lib/useMediaQuery';

/**
 * GlowButton — the rare-moment CTA. A soft animated ember halo behind the
 * standard Button, for high-value actions only: onboarding, "post your first
 * recipe", feature announcements, the marketing hero. Never in the feed, never
 * in dense lists, never on destructive actions.
 *
 * Design constraints (deliberate, don't "improve" them away):
 * - The halo is light emitted from Sizzle's ember palette — not a rainbow.
 * - `breathe` (default) animates opacity/scale only; blur is applied once,
 *   statically, so the compositor never re-rasterizes the filter per frame.
 * - prefers-reduced-motion forces the static halo (still styled, just still).
 * - A disabled button never advertises activity: halo dims and stops.
 * - The halo is decorative: aria-hidden, pointer-events none, behind the
 *   button inside an isolated stacking context so it can't cover neighbors,
 *   dialogs, or steal taps. The forwarded ref reaches the real button element.
 */

export type GlowMode = 'breathe' | 'rotate' | 'static';
export type GlowBlur = 'soft' | 'medium' | 'strong' | number;

/** Warm ember ramp derived from the live brand tokens (falls back to the
 *  light-theme hexes). Reads as heat coming off the brand color. */
export const SIZZLE_GLOW_COLORS = [
  'var(--accent, #ff5a36)',
  '#ff7a3d',
  'var(--saffron, #f4a52c)',
  'var(--accent, #ff5a36)',
];

const BLUR_PX: Record<Exclude<GlowBlur, number>, number> = { soft: 14, medium: 22, strong: 34 };

export interface GlowButtonProps extends ButtonProps {
  /** Halo animation. Defaults to a restrained breathe; `rotate` is available
   *  but reads more decorative — keep it for showcase/experiments. */
  mode?: GlowMode;
  /** Halo color stops (CSS colors). Defaults to the Sizzle ember ramp. */
  colors?: string[];
  /** Halo softness: named token or exact px (applied as an inline filter). */
  blur?: GlowBlur;
  /** One breathe/rotation cycle, in seconds. */
  duration?: number;
  /** How far the halo bleeds past the button (1 = flush). */
  glowScale?: number;
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
  children?: ReactNode;
}

export const GlowButton = forwardRef<HTMLButtonElement, GlowButtonProps>(function GlowButton(
  {
    mode = 'breathe',
    colors = SIZZLE_GLOW_COLORS,
    blur = 'medium',
    duration = 4,
    glowScale = 1.06,
    wrapperClassName = '',
    wrapperStyle,
    variant = 'primary',
    disabled,
    loading,
    ...props
  },
  ref,
) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const inert = disabled || loading;
  // Reduced motion and disabled/loading both freeze the halo; disabled also dims it (CSS).
  const effectiveMode: GlowMode = reduceMotion || inert ? 'static' : mode;

  const blurPx = typeof blur === 'number' ? blur : BLUR_PX[blur];
  const haloStyle = useMemo<CSSProperties>(() => {
    const stops = colors.length > 1 && colors[colors.length - 1] !== colors[0] ? [...colors, colors[0]] : colors;
    return {
      // conic for rotate (angle animates), radial-ish linear wash otherwise.
      background:
        effectiveMode === 'rotate'
          ? `conic-gradient(from 0deg, ${stops.join(', ')})`
          : `linear-gradient(120deg, ${stops.join(', ')})`,
      filter: `blur(${blurPx}px)`,
      animationDuration: `${duration}s`,
      // Scale lives on a custom property so the keyframes can compose with it
      // (an inline `transform` would be clobbered while an animation runs).
      ['--sz-glow-scale' as string]: String(glowScale),
    } as CSSProperties;
  }, [colors, effectiveMode, blurPx, glowScale, duration]);

  return (
    <span
      className={`sz-glow${props.fullWidth ? ' sz-glow--full' : ''}${wrapperClassName ? ` ${wrapperClassName}` : ''}`}
      data-mode={effectiveMode}
      data-inert={inert || undefined}
      style={wrapperStyle}
    >
      <span className="sz-glow__halo" aria-hidden="true" style={haloStyle} />
      <Button {...props} ref={ref} variant={variant} disabled={disabled} loading={loading} />
    </span>
  );
});
