import { createClient } from '@supabase/supabase-js';

let supabaseBrowserClient: ReturnType<typeof createClient> | null = null;

export function createBrowserClient() {
  if (supabaseBrowserClient) return supabaseBrowserClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing env var NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!supabaseAnonKey) {
    throw new Error('Missing env var NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  supabaseBrowserClient = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseBrowserClient;
}
