import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) return null;

  client = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Auth callbacks are exchanged explicitly by /auth/callback. Leaving URL
      // detection enabled races that exchange and can consume the PKCE code twice.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });

  return client;
}
