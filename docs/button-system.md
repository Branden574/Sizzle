# Sizzle control system

Updated: 2026-07-12

## Visual thesis

Sizzle controls use warm ember-red actions on calm ink-and-cream surfaces. Solid and tonal controls anchor ordinary content. Dense adaptive glass is reserved for controls floating over food photography, video, navigation, and temporary interface layers. Motion is brief and tactile: a 0.98 press, small desktop lift, and restrained loading/confirmation morphs.

## Audit findings

The original application had more than 300 button-like interactions across 43 TSX files. Nearly every control carried a one-off inline style. The only shared behavior was a pressed-scale helper. The audit found:

- 11+ arbitrary radii and a wide mix of 22–58px visual heights.
- Repeated ink gradients for primary actions and repeated ad hoc translucent overlays.
- Loading labels replacing ordinary labels without a reserved measurement layer.
- Icon-only controls with inconsistent 22–56px targets and incomplete names.
- Clickable `div` and `span` elements in video, comments, notifications, shopping, menus, and dialog backdrops.
- `role="button"` spans without native keyboard behavior.
- Missing `aria-pressed`, `aria-busy`, disabled-state, focus-visible, contrast, and reduced-transparency behavior.
- Separate navigation, feed, profile, upload, sheet, and admin implementations with duplicated motion and geometry.
- Glass blur applied as one translucent background rather than a layered, adaptive material.

## Hierarchy

| Variant | Purpose | Typical Sizzle examples |
| --- | --- | --- |
| `primary` | One dominant action per region | Create post, Continue, Post recipe, Save changes |
| `secondary` | Strong alternative on a normal surface | Apple sign-in, admin access |
| `tonal` | Medium-emphasis content action | Add comment, selected follow state, compact filters |
| `outline` | Secondary action beside a primary | Preview, Cancel, insights, Google sign-in |
| `text` | Low-priority action with a real state layer | Not now, Clear, Forgot password |
| `danger` | Restrained destructive action | Delete post, delete account, end live |
| `glass` | Elevated action over media or a temporary layer | View recipe, media tools, floating navigation |
| `plain` | Composition-specific control that still inherits system semantics | Media tile, profile avatar, navigation label |

Specialized primitives cover icon, reaction, follow, floating action, filter, segmented, loading, grouped, and dismiss-backdrop behavior.

## Token inventory

Tokens live in `apps/web/src/index.css` and have separately tuned light and dark values.

### Color

`--button-primary-bg`, `--button-primary-fg`, `--button-primary-hover`, `--button-primary-pressed`, `--button-secondary-bg`, `--button-secondary-fg`, `--button-tonal-bg`, `--button-tonal-fg`, `--button-outline-bg`, `--button-outline-border`, `--button-text-fg`, `--button-danger-bg`, `--button-danger-fg`, `--button-danger-strong-bg`, `--button-danger-strong-fg`, `--button-success-bg`, `--button-success-fg`, `--button-disabled-bg`, `--button-disabled-fg`, `--button-focus-ring`, `--button-focus-halo`, `--button-reaction-active`, `--button-overlay-scrim`, `--button-glass-bg`, `--button-glass-bg-hover`, `--button-glass-fg`, `--button-glass-border`, `--button-glass-highlight`, `--button-glass-shadow`.

### Size and geometry

`--button-height-xs`, `--button-height-sm`, `--button-height-md`, `--button-height-lg`, `--button-touch-target`, `--button-padding-xs`, `--button-padding-sm`, `--button-padding-md`, `--button-padding-lg`, `--button-gap`, `--button-group-gap`, `--button-radius-compact`, `--button-radius-standard`, `--button-radius-large`, `--button-radius-pill`.

### Typography

`--button-label-font`, `--button-label-xs`, `--button-label-sm`, `--button-label-md`, `--button-label-lg`, `--button-label-weight`, `--button-label-line-height`, `--button-label-tracking`.

### Motion, elevation, and blur

`--button-motion-hover`, `--button-motion-press`, `--button-motion-release`, `--button-motion-state`, `--button-motion-ease`, `--button-elevation-flat`, `--button-elevation-raised`, `--button-elevation-floating`, `--button-elevation-modal`, `--button-blur-light`, `--button-blur-standard`, `--button-blur-strong`.

## Public API

```tsx
<Button
  variant="primary"
  size="lg"
  leadingIcon={<AddIcon />}
  loading={isPosting}
  loadingLabel="Posting…"
  success={posted}
  successLabel="Posted"
  fullWidth
>
  Create post
</Button>

<IconButton variant="glass" label="Save post" selected={saved}>
  <BookmarkIcon />
</IconButton>

<ReactionButton reaction="like" active={liked} count="1.2K" onMedia />
<FollowButton name="Maya" state="following" />
<FilterChip selected count={24}>Trending</FilterChip>
```

`Button` forwards its ref, preserves native `button` form behavior, accepts native `type="button | submit | reset"`, recognizes promise-returning click handlers, prevents repeat activation while busy, and exposes controlled loading/success/error states. The hidden measurement layer keeps width stable while the state layer changes.

## Migrated surfaces

- Marketing, onboarding, sign-up, login, reset password, and username selection.
- Mobile bottom navigation and desktop navigation rail.
- Feed selection, loading/error/empty states, follow, reactions, media overlays, and recipe CTA.
- Discover search, tags, people, and media tiles.
- Saved filters, collections, shopping list, and saved media.
- Profile actions, tabs, drafts, live controls, analytics, verification, and admin/moderation.
- Upload, camera, trimming, cropping, edit post, edit profile, and publishing states.
- Recipe, cook mode, comments, notifications, messaging, collections, settings, reports, reposts, tips, roadmap, and confirmation dialogs.
- Every previous native `<button>` now enters through the shared primitive; non-semantic clickable elements were removed.

## Accessibility

- Native buttons preserve Enter/Space behavior and native disabled semantics.
- Icon controls require an accessible `label`; toggles expose `aria-pressed` or radio state.
- Busy actions expose `aria-busy`, disable repeat submission, and announce status text.
- Focus-visible uses a shape-following high-contrast ring and halo.
- Coarse pointers receive at least a 44px target; mobile standard controls reach 48px.
- Increased contrast, reduced motion, reduced transparency, and no-backdrop-filter fallbacks are included.
- Reaction labels describe action, selected state, and visible count.
- Dialog backdrops are semantic dismiss controls and Escape continues to close the topmost overlay.

## Performance

Only media reactions, floating icon controls, navigation, and temporary overlays use backdrop blur. Feed-card content actions remain plain, tonal, or solid. Motion uses transform, opacity, color, and shadow; blur radius and width are never animated. `ReactionButton` is memoized. Unsupported/reduced-transparency environments receive an opaque dark fallback.

## Async and failure strategy

The primitive supports controlled state and also detects returned promises. Busy state disables duplicate clicks, retains original geometry, and announces progress. Success and error layers replace content without layout shift. Existing React Query optimistic update and rollback logic remains unchanged. Upload tracks which action initiated work so only Publish or Save draft enters its loading state.

## Preview and QA

In development, open `/?showcase=buttons`. The preview displays light/dark hierarchy, default/hover/pressed/focus/loading/success/error/disabled states, social controls, long labels, mobile/desktop sizes, and adaptive media overlay examples.

Automated checks:

```sh
npm run test:controls -w @sizzle/web
npm run typecheck -w @sizzle/web
npm run build -w @sizzle/web
```

Remaining debt: the app still uses inline layout styling outside the control layer, and visual regression snapshots are browser-driven rather than committed to a dedicated Storybook/Chromatic pipeline. Native iOS haptics require adding a Capacitor haptics package; supporting Android/WebView currently receives the dependency-free vibration hint where available.
