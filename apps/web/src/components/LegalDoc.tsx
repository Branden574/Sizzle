import { TERMS_VERSION } from '../lib/geo';
import { Button } from './controls';
import { CloseIcon } from './icons';

/**
 * In-app Terms / Privacy viewer shown from the signup checkbox (and reusable in
 * Settings). The body is a plain-language summary; `LEGAL_URLS` point at
 * with your finalized, jurisdiction-aware documents (e.g. generated + hosted by
 * the hosted, authoritative documents on getsizzle.app.
 */
export const LEGAL_URLS: { terms: string; privacy: string; cookies: string } = {
  terms: 'https://getsizzle.app/terms',
  privacy: 'https://getsizzle.app/privacy',
  cookies: 'https://getsizzle.app/cookie-policy',
};

const TERMS_SECTIONS: [string, string][] = [
  ['1. Acceptance', 'By creating an account you agree to these Terms and to our Privacy Policy.'],
  ['2. Eligibility', 'You must be at least 13 years old (or the minimum age in your jurisdiction) to use Sizzle.'],
  ['3. Your content', 'You keep ownership of the recipes, videos, and photos you post, and grant Sizzle a license to host and display them in the app.'],
  ['4. Acceptable use', 'No illegal, harmful, infringing, or abusive content. We may remove content and suspend accounts that break the rules.'],
  ['5. Termination', 'You can delete your account at any time; we may suspend or terminate accounts that violate these Terms.'],
  ['6. Disclaimers', 'Recipes are user-submitted — follow safe food-handling practices. The service is provided “as is,” without warranties.'],
  ['7. Contact', 'Questions about these Terms can be sent to the support email listed in your finalized document.'],
];

const PRIVACY_SECTIONS: [string, string][] = [
  ['1. What we collect', 'Account details (name, email, phone, username), the country and state/region you provide at signup, and the content you post (videos, photos, recipes, comments).'],
  ['2. How we use it', 'To run the app — your feed, profile, saves, follows — and to keep the community safe (moderation). We do not run third-party ad/analytics trackers.'],
  ['3. Service providers', 'We use infrastructure providers (e.g. Supabase, Vercel, Cloudflare) and optional sign-in providers (Apple, Google) to operate the app.'],
  ['4. Your rights', 'Depending on your state/country you may have rights to access, correct, or delete your data, and to opt out of any sale/share of personal information (we do not sell your data).'],
  ['5. Data retention & security', 'We keep your data while your account is active and take reasonable measures to protect it.'],
  ['6. Children', 'Sizzle is not directed to children under 13, and we do not knowingly collect their data.'],
  ['7. Contact', 'Privacy requests can be sent to the contact listed in your finalized document.'],
];

export function LegalDoc({ which, onClose }: { which: 'terms' | 'privacy'; onClose: () => void }) {
  const isTerms = which === 'terms';
  const title = isTerms ? 'Terms of Service' : 'Privacy Policy';
  const url = isTerms ? LEGAL_URLS.terms : LEGAL_URLS.privacy;
  const sections = isTerms ? TERMS_SECTIONS : PRIVACY_SECTIONS;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'var(--bg)', display: 'flex', flexDirection: 'column', animation: 'sz-slideUp .35s cubic-bezier(.16,1,.3,1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '54px 20px 12px', flex: 'none' }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: 'var(--text)' }}>{title}</div>
        <Button onClick={onClose} aria-label="Close" style={{ width: 38, height: 38, borderRadius: '50%', border: '1.5px solid var(--line-2)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <CloseIcon size={18} stroke="var(--text-muted)" strokeWidth={2.2} />
        </Button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 22px 32px' }}>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', height: 50, lineHeight: '50px', borderRadius: 14, background: 'var(--invert-bg)', color: 'var(--invert-fg)', fontFamily: "'Hanken Grotesk'", fontSize: 15, fontWeight: 700, textDecoration: 'none', marginBottom: 20 }}>
            Open the full {title}
          </a>
        ) : null}

        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 16, lineHeight: 1.45 }}>
          Plain-language summary below — the full document at the link above is the
          binding version (v{TERMS_VERSION}).
        </div>

        {sections.map(([heading, body]) => (
          <div key={heading} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>{heading}</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--text-2)' }}>{body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
