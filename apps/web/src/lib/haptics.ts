import { isNative } from './native';

/**
 * Best-effort haptics for touch interactions (pull-to-refresh, etc.).
 *
 * On native we DYNAMICALLY import @capacitor/haptics so the web bundle never loads the
 * native module; on web we fall back to navigator.vibrate (Android) which is a silent
 * no-op on iOS Safari / WKWebView. Every call is fire-and-forget and swallows errors —
 * haptics ENRICH a state, they are never required to understand it (accessibility).
 * The OS/user haptic + reduced-motion settings are honored by the platform layer.
 */
async function nativeImpact(style: 'Light' | 'Medium' | 'Heavy'): Promise<boolean> {
  if (!isNative) return false;
  try {
    const mod = await import('@capacitor/haptics');
    await mod.Haptics.impact({ style: mod.ImpactStyle[style] });
    return true;
  } catch {
    return false;
  }
}

async function nativeNotify(type: 'Success' | 'Warning' | 'Error'): Promise<boolean> {
  if (!isNative) return false;
  try {
    const mod = await import('@capacitor/haptics');
    await mod.Haptics.notification({ type: mod.NotificationType[type] });
    return true;
  } catch {
    return false;
  }
}

function webVibrate(ms: number): void {
  try {
    (navigator as Navigator & { vibrate?: (pattern: number) => boolean }).vibrate?.(ms);
  } catch {
    /* not supported — ignore */
  }
}

/** A light tick the instant a pull crosses the refresh threshold ("armed"). */
export function hapticArm(): void {
  void nativeImpact('Light').then((ok) => { if (!ok) webVibrate(8); });
}

/** A gentle success cue once fresh content has loaded. */
export function hapticSuccess(): void {
  void nativeNotify('Success').then((ok) => { if (!ok) webVibrate(12); });
}

/** A restrained cue when a refresh fails (content stays; user can retry). */
export function hapticError(): void {
  void nativeNotify('Warning').then((ok) => { if (!ok) webVibrate(22); });
}
