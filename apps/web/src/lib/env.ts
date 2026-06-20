/**
 * Web runtime config. The Supabase anon key is the public client key, but we
 * still keep it out of source — set VITE_SUPABASE_ANON_KEY in apps/web/.env
 * (run `supabase start` to print the local one; see .env.example).
 */
export const webEnv = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8787',
};

if (!webEnv.supabaseAnonKey && import.meta.env.DEV) {
  console.warn('VITE_SUPABASE_ANON_KEY is not set — copy apps/web/.env.example to apps/web/.env and run `supabase start`.');
}
