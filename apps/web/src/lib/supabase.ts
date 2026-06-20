import { createClient } from '@supabase/supabase-js';
import { webEnv } from './env';

/** Browser Supabase client — persists the session and auto-refreshes tokens. */
export const supabase = createClient(webEnv.supabaseUrl, webEnv.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
