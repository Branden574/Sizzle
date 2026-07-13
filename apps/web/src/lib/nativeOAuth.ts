import { Browser } from '@capacitor/browser';
import { supabase } from './supabase';

/**
 * Native Google / Apple sign-in for the Capacitor shell.
 *
 * The web build redirects the WebView to the provider, but that fails natively:
 * Google refuses OAuth inside embedded WebViews, and the redirect never returns
 * to the app. Instead we open the provider in the system browser
 * (@capacitor/browser → SFSafariViewController on iOS / Custom Tab on Android —
 * real system browsers that Google + Apple both allow, unlike an embedded
 * WKWebView), let Supabase's PKCE flow bounce the auth code back to a custom URL
 * scheme, and exchange it inside the WebView's Supabase client (which holds the
 * code verifier in Capacitor Preferences).
 *
 * Reuses the exact Supabase Apple + Google provider config the web app uses —
 * no per-platform client IDs. Satisfies App Review 4.8 (offers Sign in with
 * Apple alongside Google natively).
 */

/** Custom scheme the provider redirects back to. Registered in iOS Info.plist
 *  (CFBundleURLTypes) + Android AndroidManifest, and allow-listed in Supabase
 *  Auth → URL Configuration → Redirect URLs. */
export const NATIVE_OAUTH_REDIRECT = 'app.sizzle.mobile://login-callback';

/** Guards against a second provider being launched while a browser auth session
 *  is already open — a concurrent signInWithOAuth would overwrite the single
 *  PKCE code-verifier key and break the in-flight exchange. */
let oauthInFlight = false;

const SIGNIN_FAILED = 'Sign-in didn’t complete — try again or use email.';

/** Open the provider's consent screen in the system browser. The result returns
 *  asynchronously via the appUrlOpen deep link → handleOAuthCallback. */
export async function nativeSignInOAuth(provider: 'apple' | 'google'): Promise<{ error?: string }> {
  if (oauthInFlight) return {};
  oauthInFlight = true;
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: NATIVE_OAUTH_REDIRECT, skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      oauthInFlight = false;
      return { error: error?.message ?? 'Could not start sign-in.' };
    }
    await Browser.open({ url: data.url, presentationStyle: 'fullscreen' });
    return {};
  } catch (err) {
    oauthInFlight = false;
    return { error: err instanceof Error ? err.message : 'Could not start sign-in.' };
  }
}

/** Complete a native OAuth round-trip from an appUrlOpen deep link. Returns true
 *  when the URL was our OAuth callback (so the caller stops other deep-link
 *  parsing), false otherwise. On success onAuthStateChange flips the app to
 *  `authed`; on cancel/error we surface a message to the onboarding screen. */
export async function handleOAuthCallback(url: string): Promise<boolean> {
  if (!url.startsWith(NATIVE_OAUTH_REDIRECT)) return false;
  const params = new URLSearchParams(url.split('?')[1] ?? '');
  const code = params.get('code');
  const providerError = params.get('error_description') ?? params.get('error');
  oauthInFlight = false;
  // Dismiss the system browser FIRST. SFSafariViewController does NOT auto-close
  // on a custom-scheme redirect (only ASWebAuthenticationSession does), so if we
  // waited for the token exchange to finish before closing, the user would stare
  // at a lingering "cannot open page" browser for a second or two — that was the
  // "took forever" delay. Return them to the app instantly, then exchange.
  await Browser.close().catch(() => {});
  if (!code && !providerError) return true;
  // Dynamic import avoids a static import cycle (useAuth imports this module).
  const { useAuth } = await import('../auth/useAuth');
  if (code) useAuth.setState({ busy: true, error: null });
  try {
    if (code) {
      await supabase.auth.exchangeCodeForSession(code);
    } else if (params.get('error') !== 'access_denied') {
      // access_denied = the user cancelled the sheet; stay quiet on that.
      useAuth.setState({ error: SIGNIN_FAILED });
    }
  } catch {
    useAuth.setState({ error: SIGNIN_FAILED });
  } finally {
    useAuth.setState({ busy: false });
  }
  return true;
}
