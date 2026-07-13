import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { MeProfile } from '@sizzle/shared';
import { apiGet } from '../lib/api';
import { supabase } from '../lib/supabase';
import { isNative } from '../lib/native';
import { nativeSignInOAuth } from '../lib/nativeOAuth';
import { disablePush } from '../lib/push';
import { biometricVerify, getBiometricToken, storeBiometricToken, clearBiometricToken } from '../lib/biometric';

/**
 * loading — deciding initial session
 * anon    — no session, not a guest (show onboarding / login)
 * guest   — chose "Skip for now"
 * authed  — has a Supabase session
 */
export type AuthStatus = 'loading' | 'anon' | 'guest' | 'authed';

export type AuthMode = 'signup' | 'login';

interface AuthState {
  status: AuthStatus;
  mode: AuthMode;
  session: Session | null;
  user: User | null;
  profile: MeProfile | null;
  error: string | null;
  busy: boolean;
  initialized: boolean;
  /** True after a PASSWORD_RECOVERY deep-link — show the set-new-password screen. */
  recovery: boolean;

  init: () => void;
  setMode: (mode: AuthMode) => void;
  clearError: () => void;

  signUp: (email: string, password: string, opts?: { name?: string; phone?: string; handle?: string; country?: string; region?: string; termsAcceptedAt?: string; termsVersion?: string }) => Promise<'confirmed' | 'pending' | false>;
  /** Re-send the signup confirmation email. */
  resendSignup: (email: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signInOAuth: (provider: 'apple' | 'google') => Promise<void>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
  loadProfile: () => Promise<void>;
  /** Email a password-reset link. */
  resetPassword: (email: string) => Promise<boolean>;
  /** Set a new password (during recovery or while authed). */
  updatePassword: (password: string) => Promise<boolean>;
  /** Stash the current refresh token in the biometric keychain (for restore). */
  stashBiometricToken: () => Promise<void>;
  /** Restore an expired session from the biometric-stashed refresh token. */
  restoreWithBiometric: () => Promise<boolean>;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  mode: 'signup',
  session: null,
  user: null,
  profile: null,
  error: null,
  busy: false,
  initialized: false,
  recovery: false,

  init: () => {
    if (get().initialized) return;
    set({ initialized: true });

    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      set({
        session,
        user: session?.user ?? null,
        status: session ? 'authed' : get().status === 'guest' ? 'guest' : 'anon',
      });
      if (session) void get().loadProfile();
    });

    supabase.auth.onAuthStateChange((event, session) => {
      set({
        session,
        user: session?.user ?? null,
        status: session ? 'authed' : get().status === 'guest' ? 'guest' : 'anon',
        // A recovery deep-link logs the user in; flag it so the app shows the
        // set-new-password screen instead of dropping them into the feed.
        recovery: event === 'PASSWORD_RECOVERY' ? true : get().recovery,
      });
      if (session) void get().loadProfile();
      else set({ profile: null });
    });
  },

  setMode: (mode) => set({ mode, error: null }),
  clearError: () => set({ error: null }),

  signUp: async (email, password, opts) => {
    set({ busy: true, error: null });
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          display_name: opts?.name?.trim() || undefined,
          phone: opts?.phone?.trim() || undefined,
          handle: opts?.handle?.trim() || undefined,
          country: opts?.country || undefined,
          region: opts?.region || undefined,
          terms_accepted_at: opts?.termsAcceptedAt || undefined,
          terms_version: opts?.termsVersion || undefined,
        },
      },
    });
    set({ busy: false });
    if (error) {
      set({ error: error.message });
      return false;
    }
    // If a session came back, confirmations are off → onAuthStateChange flips to
    // authed. If not, email confirmation is required: tell the UI to show the
    // "check your email" screen.
    return data.session ? 'confirmed' : 'pending';
  },

  resendSignup: async (email) => {
    set({ error: null });
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  signIn: async (email, password) => {
    set({ busy: true, error: null });
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    set({ busy: false });
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  signInOAuth: async (provider) => {
    set({ error: null });
    const label = provider === 'apple' ? 'Apple' : 'Google';
    // Native opens the system browser + returns via the app's custom URL scheme
    // (see nativeOAuth.ts); web redirects the page as usual.
    if (isNative) {
      const { error } = await nativeSignInOAuth(provider);
      if (error) set({ error: `${label} sign-in isn't available right now — use email below.` });
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) set({ error: `${label} sign-in isn't configured yet — use email below.` });
  },

  signOut: async () => {
    // Unregister this device's push token FIRST, while the access token is still
    // valid. If we signed out first, the DELETE /me/push-token would 401 and the
    // token row would leak — a logged-out device would keep receiving pushes.
    await disablePush().catch(() => {});
    await supabase.auth.signOut();
    // Drop the biometric-stashed token so a logged-out device can't restore.
    await clearBiometricToken();
    set({ status: 'anon', session: null, user: null, profile: null, error: null });
  },

  continueAsGuest: () => set({ status: 'guest', error: null }),

  loadProfile: async () => {
    try {
      const profile = await apiGet<MeProfile>('/me');
      set({ profile });
    } catch {
      // API may be offline during early local dev; non-fatal.
    }
  },

  resetPassword: async (email) => {
    set({ busy: true, error: null });
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    set({ busy: false });
    if (error) {
      set({ error: error.message });
      return false;
    }
    return true;
  },

  updatePassword: async (password) => {
    set({ busy: true, error: null });
    const { error } = await supabase.auth.updateUser({ password });
    set({ busy: false });
    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ recovery: false });
    return true;
  },

  stashBiometricToken: async () => {
    const rt = get().session?.refresh_token;
    if (rt) await storeBiometricToken(rt);
  },

  restoreWithBiometric: async () => {
    const token = await getBiometricToken();
    if (!token) return false;
    if (!(await biometricVerify('Sign in to Sizzle'))) return false;
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: token });
    if (error || !data.session) return false;
    // The refresh token rotates — re-stash the new one for next time.
    if (data.session.refresh_token) await storeBiometricToken(data.session.refresh_token);
    return true;
  },
}));
