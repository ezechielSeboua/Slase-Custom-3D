'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from '@/lib/supabase/config';

let client: SupabaseClient | null = null;

/** Client Supabase du navigateur (un seul par onglet) ; null si Supabase n'est pas configuré. */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}
