import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { MeProfile } from '@sizzle/shared';
import { apiGet } from '../lib/api';
import { supabase } from '../lib/supabase';

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

  signUp: (email: string, password: string, opts?: { name?: string; phone?: string }) => Promise<'confirmed' | 'pending' | false>;
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      const label = provider === 'apple' ? 'Apple' : 'Google';
      set({ error: `${label} sign-in isn't configured yet — use email below.` });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
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
}));
