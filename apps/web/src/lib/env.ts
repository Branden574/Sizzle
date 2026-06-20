/**
 * Web runtime config. Falls back to local `supabase start` + local API
 * defaults so the app runs with no `.env` during local development.
 */
const LOCAL_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const webEnv = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:55321',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? LOCAL_ANON,
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8787',
};
