import { createClient } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';
import { webEnv } from './env';
import { isNative } from './native';

// On native, store the auth session in Capacitor Preferences (iOS
// NSUserDefaults / Android SharedPreferences) rather than the WebView's
// localStorage, which the OS can evict under storage pressure. This keeps users
// signed in across app restarts — close the app and reopen straight into the
// feed, like TikTok / Instagram / X. Web keeps Supabase's default localStorage,
// so existing web sessions are untouched.
const nativeStorage = {
  getItem: (key: string) => Preferences.get({ key }).then((r) => r.value),
  setItem: (key: string, value: string) => Preferences.set({ key, value }).then(() => undefined),
  removeItem: (key: string) => Preferences.remove({ key }).then(() => undefined),
};

/** Supabase client — persists the session and auto-refreshes tokens. */
export const supabase = createClient(webEnv.supabaseUrl, webEnv.supabaseAnonKey, {
  auth: {
    storage: isNative ? nativeStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Native needs PKCE: the OAuth code returns via the app's custom URL scheme
    // and is exchanged manually (nativeOAuth.ts). Web stays on the implicit
    // default so email confirmation / password-reset links keep working
    // cross-device (a PKCE code verifier is device-local — a reset link opened
    // on a different device than it was requested from would fail to exchange).
    flowType: isNative ? 'pkce' : 'implicit',
  },
});
