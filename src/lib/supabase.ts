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
      // Let the browser session be established directly from the redirect.
      // PKCE code exchange requires the original browser storage context and is
      // brittle for mobile redirects/open-in-new-tab flows.
      detectSessionInUrl: true,
    },
  });

  return client;
}
