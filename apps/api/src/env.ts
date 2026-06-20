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
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('✗ Invalid API environment:\n', parsed.error.flatten().fieldErrors);
  console.error('  → Copy apps/api/.env.example to apps/api/.env and fill in the Supabase keys (run `supabase start` to print the local ones).');
  process.exit(1);
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
  console.error('✗ Refusing to start: the public local demo Supabase keys are set against a non-local SUPABASE_URL. Set real SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

/** True when the user opted into real Cloudflare Stream and supplied creds. */
export const cloudflareConfigured =
  env.VIDEO_PROVIDER === 'cloudflare' && !!env.CLOUDFLARE_ACCOUNT_ID && !!env.CLOUDFLARE_STREAM_TOKEN;
