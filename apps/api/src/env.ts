import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(8787),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  // Supabase keys are required (no embedded defaults — we never commit keys, even
  // the public local-dev ones). For local dev, `supabase start` prints them; copy
  // them into apps/api/.env (see .env.example).
  SUPABASE_URL: z.string().url().default('http://127.0.0.1:54321'),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  VIDEO_PROVIDER: z.enum(['mock', 'cloudflare']).default('mock'),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_STREAM_TOKEN: z.string().optional(),
  CLOUDFLARE_STREAM_WEBHOOK_SECRET: z.string().optional(),

  // Push notifications via Firebase Cloud Messaging HTTP v1. Paste the FULL
  // service-account JSON (Firebase console → Project settings → Service
  // accounts → Generate new private key) as a single-line string. When unset,
  // the push service is a safe no-op (rows are still written to `notifications`,
  // we just don't deliver to devices) — so the app runs fine without it.
  FCM_SERVICE_ACCOUNT: z.string().optional(),

  // Real content moderation via OpenAI's moderation model. When unset, moderation
  // falls back to the local keyword/link-spam pass only (the app runs fine
  // without it). Get a key at platform.openai.com → API keys.
  OPENAI_API_KEY: z.string().optional(),

  // Error monitoring (Sentry). When unset, capture is a no-op. DSN from
  // Sentry → project → Settings → Client Keys (DSN).
  SENTRY_DSN: z.string().optional(),

  // Transactional email (Resend) for ban / removal / restore notices. When
  // unset, email sending is a safe no-op. Key from resend.com → API Keys.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Sizzle <noreply@getsizzle.app>'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const fields = parsed.error.flatten().fieldErrors;
  console.error('✗ Invalid API environment:\n', fields);
  // Throw (not process.exit) so serverless wrappers can surface the cause.
  throw new Error('Invalid API environment: ' + JSON.stringify(fields));
}

export const env = parsed.data;

/** A Supabase JWT minted by the local demo stack carries iss="supabase-demo". */
function isLocalDemoKey(jwt: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64').toString('utf8'));
    return payload?.iss === 'supabase-demo';
  } catch {
    return false;
  }
}

// Safety: never run against a hosted Supabase with the public local demo keys.
const isLocalSupabase = /127\.0\.0\.1|localhost/.test(env.SUPABASE_URL);
if (!isLocalSupabase && (isLocalDemoKey(env.SUPABASE_SERVICE_ROLE_KEY) || isLocalDemoKey(env.SUPABASE_ANON_KEY))) {
  throw new Error('Refusing to start: the public local demo Supabase keys are set against a non-local SUPABASE_URL. Set real SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.');
}

/** True when the user opted into real Cloudflare Stream and supplied creds. */
export const cloudflareConfigured =
  env.VIDEO_PROVIDER === 'cloudflare' && !!env.CLOUDFLARE_ACCOUNT_ID && !!env.CLOUDFLARE_STREAM_TOKEN;
