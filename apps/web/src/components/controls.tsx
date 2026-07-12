import {
  forwardRef,
  memo,
  useCallback,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { BookmarkIcon, CheckIcon, CommentIcon, HeartIcon, RepostIcon, ShareIcon } from './icons';

export type ButtonVariant = 'plain' | 'primary' | 'secondary' | 'tonal' | 'outline' | 'text' | 'danger' | 'glass';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type ButtonStatus = 'idle' | 'loading' | 'success' | 'error';

type NativeButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick'>;

export interface ButtonProps extends NativeButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  success?: boolean;
  successLabel?: string;
  error?: boolean;
  errorLabel?: string;
  fullWidth?: boolean;
  haptic?: 'selection' | 'success' | 'warning' | false;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => unknown;
}

/** A tiny, dependency-free tactile hint for Android/WebView and supporting browsers. */
export function triggerTactile(kind: 'selection' | 'success' | 'warning' = 'selection') {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  navigator.vibrate(kind === 'success' ? 14 : kind === 'warning' ? [12, 18, 12] : 8);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    variant = 'plain',
    size = 'md',
    leadingIcon,
    trailingIcon,
    loading = false,
    loadingLabel,
    success = false,
    successLabel,
    error = false,
    errorLabel,
    fullWidth = false,
    disabled,
    className = '',
    type,
    haptic = false,
    onClick,
    ...props
  },
  ref,
) {
  const [internalLoading, setInternalLoading] = useState(false);
  const busy = loading || internalLoading;
  const status: ButtonStatus = busy ? 'loading' : error ? 'error' : success ? 'success' : 'idle';
  const unavailable = disabled || busy;
  const enhanced = variant !== 'plain' || !!leadingIcon || !!trailingIcon || loading || success || error || !!loadingLabel || !!successLabel || !!errorLabel;

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (unavailable) {
        event.preventDefault();
        return;
      }
      if (haptic) triggerTactile(haptic);
      const result = onClick?.(event);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        setInternalLoading(true);
        void Promise.resolve(result).finally(() => setInternalLoading(false));
      }
    },
    [haptic, onClick, unavailable],
  );

  const stateLabel = status === 'loading'
    ? loadingLabel
    : status === 'success'
      ? successLabel
      : status === 'error'
        ? errorLabel
        : undefined;

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={unavailable}
      aria-busy={busy || undefined}
      data-status={status}
      data-variant={variant}
      data-size={size}
      className={`sz-control sz-button${fullWidth ? ' sz-button--full' : ''}${className ? ` ${className}` : ''}`}
      onClick={handleClick}
    >
      {enhanced ? (
        <>
          <span className="sz-button__measure" aria-hidden={status !== 'idle' || undefined}>
            {leadingIcon && <span className="sz-button__icon" aria-hidden="true">{leadingIcon}</span>}
            <span className="sz-button__label">{children}</span>
            {trailingIcon && <span className="sz-button__icon" aria-hidden="true">{trailingIcon}</span>}
          </span>
          {status !== 'idle' && (
            <span className="sz-button__state" role={status === 'error' ? 'alert' : 'status'} aria-live="polite">
              {status === 'loading' && <span className="sz-spinner" aria-hidden="true" />}
              {status === 'success' && <CheckIcon size={17} stroke="currentColor" strokeWidth={2.7} />}
              <span>{stateLabel ?? (status === 'loading' ? children : status === 'success' ? 'Done' : 'Try again')}</span>
            </span>
          )}
        </>
      ) : children}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'leadingIcon' | 'trailingIcon' | 'aria-label'> {
  label: string;
  children: ReactNode;
  selected?: boolean;
  tooltip?: string;
  shape?: 'circle' | 'square';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, selected, tooltip, shape = 'circle', variant = 'tonal', className = '', ...props },
  ref,
) {
  return (
    <Button
      {...props}
      ref={ref}
      variant={variant}
      aria-label={label}
      aria-pressed={selected === undefined ? undefined : selected}
      title={tooltip ?? label}
      data-shape={shape}
      className={`sz-icon-button${selected ? ' is-selected' : ''}${className ? ` ${className}` : ''}`}
    >
      <span className="sz-icon-button__glyph" aria-hidden="true">{children}</span>
    </Button>
  );
});

export function GlassButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="glass" />;
}

export function LoadingButton(props: ButtonProps) {
  return <Button {...props} />;
}

export type ReactionType = 'like' | 'comment' | 'save' | 'share' | 'repost';

export interface ReactionButtonProps extends Omit<ButtonProps, 'children' | 'leadingIcon' | 'trailingIcon'> {
  reaction: ReactionType;
  active?: boolean;
  count?: number | string;
  label?: string;
  onMedia?: boolean;
}

const reactionNames: Record<ReactionType, string> = {
  like: 'Like post',
  comment: 'View comments',
  save: 'Save post',
  share: 'Share post',
  repost: 'Repost',
};

function ReactionGlyph({ reaction, active }: { reaction: ReactionType; active: boolean }) {
  const activeColor = 'var(--button-reaction-active)';
  const color = active ? activeColor : 'currentColor';
  if (reaction === 'like') return <HeartIcon size={30} fill={active ? activeColor : 'none'} stroke={color} strokeWidth={1.9} />;
  if (reaction === 'comment') return <CommentIcon size={29} stroke={color} strokeWidth={1.9} />;
  if (reaction === 'save') return <BookmarkIcon size={28} fill={active ? activeColor : 'none'} stroke={color} strokeWidth={1.9} />;
  if (reaction === 'repost') return <RepostIcon size={29} stroke={color} strokeWidth={2} />;
  return <ShareIcon size={28} stroke={color} strokeWidth={1.9} />;
}

export const ReactionButton = memo(function ReactionButton({
  reaction,
  active = false,
  count,
  label,
  onMedia = false,
  className = '',
  ...props
}: ReactionButtonProps) {
  const accessibleLabel = `${label ?? reactionNames[reaction]}${active ? ', selected' : ', not selected'}${count !== undefined ? `, ${count}` : ''}`;
  return (
    <Button
      {...props}
      variant="plain"
      aria-label={accessibleLabel}
      aria-pressed={reaction === 'comment' || reaction === 'share' ? undefined : active}
      haptic={reaction === 'comment' || reaction === 'share' ? 'selection' : 'success'}
      className={`sz-reaction${onMedia ? ' sz-reaction--media' : ''}${active ? ' is-selected' : ''}${className ? ` ${className}` : ''}`}
    >
      <span className="sz-reaction__material" aria-hidden="true"><ReactionGlyph reaction={reaction} active={active} /></span>
      {count !== undefined && <span className="sz-reaction__count" aria-hidden="true">{count}</span>}
    </Button>
  );
});

export type FollowState = 'follow' | 'following' | 'requested' | 'loading' | 'unavailable' | 'error';

export interface FollowButtonProps extends Omit<ButtonProps, 'children' | 'loading' | 'error'> {
  name: string;
  state?: FollowState;
  compact?: boolean;
}

export function FollowButton({ name, state = 'follow', compact = false, ...props }: FollowButtonProps) {
  const labels: Record<FollowState, string> = {
    follow: 'Follow',
    following: 'Following',
    requested: 'Requested',
    loading: state === 'following' ? 'Updating…' : 'Following…',
    unavailable: 'Unavailable',
    error: 'Try again',
  };
  const selected = state === 'following' || state === 'requested';
  return (
    <Button
      {...props}
      variant={selected ? 'tonal' : 'primary'}
      size={compact ? 'sm' : 'md'}
      loading={state === 'loading'}
      error={state === 'error'}
      disabled={state === 'unavailable' || props.disabled}
      aria-label={`${labels[state]} ${name}`}
      aria-pressed={selected}
      haptic="success"
      className={`sz-follow${compact ? ' sz-follow--compact' : ''}`}
    >
      {labels[state]}
    </Button>
  );
}

export function FloatingActionButton({ className = '', ...props }: IconButtonProps) {
  return <IconButton {...props} variant="primary" size="lg" haptic="selection" className={`sz-fab${className ? ` ${className}` : ''}`} />;
}

export function ButtonGroup({ children, label, className = '', style }: { children: ReactNode; label?: string; className?: string; style?: CSSProperties }) {
  return <div role="group" aria-label={label} className={`sz-button-group${className ? ` ${className}` : ''}`} style={style}>{children}</div>;
}

export function DismissBackdrop({ onDismiss, className = '', style }: { onDismiss: () => void; className?: string; style?: CSSProperties }) {
  return (
    <button
      type="button"
      aria-label="Close dialog"
      className={`sz-dismiss-backdrop${className ? ` ${className}` : ''}`}
      onClick={onDismiss}
      style={style}
    />
  );
}

export interface FilterChipProps extends Omit<ButtonProps, 'children'> {
  children: ReactNode;
  selected?: boolean;
  count?: number;
}

export function FilterChip({ children, selected = false, count, className = '', ...props }: FilterChipProps) {
  return (
    <Button
      {...props}
      variant="tonal"
      size="sm"
      aria-pressed={selected}
      className={`sz-filter-chip${selected ? ' is-selected' : ''}${className ? ` ${className}` : ''}`}
      haptic="selection"
    >
      {children}{count !== undefined && <span className="sz-filter-chip__count">{count}</span>}
    </Button>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const ids = useMemo(() => options.map((option) => `${label}-${option.value}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')), [label, options]);
  return (
    <div className="sz-segmented" role="radiogroup" aria-label={label}>
      {options.map((option, index) => (
        <Button
          key={option.value}
          id={ids[index]}
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          variant="plain"
          size="sm"
          leadingIcon={option.icon}
          className={value === option.value ? 'is-selected' : ''}
          onClick={() => onChange(option.value)}
          haptic="selection"
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
