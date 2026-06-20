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

  init: () => void;
  setMode: (mode: AuthMode) => void;
  clearError: () => void;

  signUp: (email: string, password: string, opts?: { name?: string; phone?: string }) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signInOAuth: (provider: 'apple' | 'google') => Promise<void>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
  loadProfile: () => Promise<void>;
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

    supabase.auth.onAuthStateChange((_event, session) => {
      set({
        session,
        user: session?.user ?? null,
        status: session ? 'authed' : get().status === 'guest' ? 'guest' : 'anon',
      });
      if (session) void get().loadProfile();
      else set({ profile: null });
    });
  },

  setMode: (mode) => set({ mode, error: null }),
  clearError: () => set({ error: null }),

  signUp: async (email, password, opts) => {
    set({ busy: true, error: null });
    const { error } = await supabase.auth.signUp({
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
    // With local email confirmations disabled, a session is returned immediately
    // and onAuthStateChange flips status -> authed.
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
}));
