# Auth & email provider setup (Apple, Google, Resend SMTP)

The app code for all three is already wired — these are the **console/dashboard**
steps only you can do (they need your developer accounts + secrets, which I can't
create or handle). Do them once before submitting to the stores.

Project refs you'll need: bundle/app ID **`app.sizzle.mobile`**, domain
**getsizzle.app**, Supabase project (the callback is
`https://<PROJECT_REF>.supabase.co/auth/v1/callback` — get `<PROJECT_REF>` from the
Supabase dashboard URL).

---

## 1. Sign in with Apple  (Apple 4.8 — required because Google sign-in is offered)

Code: `signInOAuth('apple')` in `apps/web/src/auth/useAuth.ts` (Supabase OAuth).

**In the Apple Developer portal** (developer.apple.com → Certificates, IDs & Profiles):
1. **App ID** — confirm `app.sizzle.mobile` exists and enable the **Sign In with
   Apple** capability on it.
2. **Services ID** — create one, e.g. `app.sizzle.mobile.signin`. This is the OAuth
   **client_id** Supabase uses.
   - Enable **Sign In with Apple** on it → Configure:
     - Primary App ID: `app.sizzle.mobile`
     - Domains: `getsizzle.app` and `<PROJECT_REF>.supabase.co`
     - Return URLs: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
3. **Key** — create a new key with **Sign In with Apple** enabled. Download the
   `.p8` (once only). Note the **Key ID** and your **Team ID** (top-right of the portal).

**In Supabase** (Dashboard → Authentication → Providers → Apple):
- Enable it.
- **Client IDs**: `app.sizzle.mobile.signin` (the Services ID) — you can also add the
  bundle ID `app.sizzle.mobile` for the native token path.
- **Secret Key (for OAuth)**: paste the `.p8` contents, plus **Team ID** and **Key ID**.
- Save. Supabase mints the client secret JWT from these.

**In the app config** (already done, verify): the iOS entitlement includes
`applinks:getsizzle.app`; the Supabase redirect allow-list should include the app's
return URL. Test on a device: Sign in with Apple → lands back authed.

---

## 2. Google (publish to production)

Code: `signInOAuth('google')` (same file). Also the OAuth consent screen must be
**published** or only test users can sign in (that's task "A4").

**Google Cloud Console** (console.cloud.google.com → APIs & Services):
1. **OAuth consent screen** — External, fill app name (Sizzle), support email,
   logo, the getsizzle.app homepage + privacy + terms URLs, then **Publish app**
   (moves it out of "Testing" so any Google user can sign in).
2. **Credentials → Create OAuth client ID:**
   - **Web application** (this is what Supabase uses): add authorized redirect URI
     `https://<PROJECT_REF>.supabase.co/auth/v1/callback`. Copy the client ID + secret.
   - **iOS**: bundle ID `app.sizzle.mobile`.
   - **Android**: package `app.sizzle.mobile` + your signing SHA-1 (from the upload
     keystore: `keytool -list -v -keystore sizzle-upload.jks`).

**In Supabase** (Authentication → Providers → Google): enable, paste the **Web**
client ID + secret. Add the iOS/Android client IDs to the "Authorized Client IDs"
box so native ID-token sign-in is accepted.

---

## 3. Resend custom SMTP (so confirmation / reset emails actually deliver)

Supabase's built-in email is rate-limited and not for production. Point Auth at
Resend (you already use Resend for transactional email — see A5).

**In Resend** (resend.com):
1. **Verify the domain** getsizzle.app — add the SPF + DKIM DNS records Resend gives
   you. Wait for "Verified".
2. Use an existing **API key** (or make one scoped to sending).

**In Supabase** (Dashboard → Project Settings → Authentication → SMTP Settings →
Enable Custom SMTP):
- **Host:** `smtp.resend.com`
- **Port:** `465` (SSL) — or `587` (STARTTLS)
- **Username:** `resend`
- **Password:** your **Resend API key**
- **Sender email:** `no-reply@getsizzle.app` (must be on the verified domain)
- **Sender name:** `Sizzle`
- Save, then **send a test** (trigger a password reset) and confirm it lands.

While you're there (Authentication → Email Templates): brand the confirm-signup and
reset-password templates, and set **URL Configuration → Site URL** to
`https://getsizzle.app` with the app's redirect URLs allow-listed.

---

## Quick verification checklist
- [ ] Sign in with Apple works on a real device (not just Simulator — Apple sign-in
      needs a real Apple ID session).
- [ ] Google sign-in works for a non-test Google account (consent screen published).
- [ ] A password-reset email arrives from `no-reply@getsizzle.app` within a minute.
