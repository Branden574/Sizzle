import 'dotenv/config';
import { z } from 'zod';

/**
 * Local Supabase dev defaults. `supabase start` always prints these exact
 * keys (derived from a fixed demo JWT secret), so local dev needs zero config.
 * They are NOT secret for local use and must be overridden in any deployment.
 */
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:55321';
const LOCAL_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const schema = z.object({
  PORT: z.coerce.number().default(8787),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  SUPABASE_URL: z.string().url().default(LOCAL_SUPABASE_URL),
  SUPABASE_ANON_KEY: z.string().min(1).default(LOCAL_ANON),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default(LOCAL_SERVICE),

  VIDEO_PROVIDER: z.enum(['mock', 'cloudflare']).default('mock'),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_STREAM_TOKEN: z.string().optional(),
  CLOUDFLARE_STREAM_WEBHOOK_SECRET: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('✗ Invalid API environment:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

/** True when the user opted into real Cloudflare Stream and supplied creds. */
export const cloudflareConfigured =
  env.VIDEO_PROVIDER === 'cloudflare' && !!env.CLOUDFLARE_ACCOUNT_ID && !!env.CLOUDFLARE_STREAM_TOKEN;
