import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/supabase/config';

/** Client Supabase côté serveur (routes) : la session est lue et écrite dans les cookies de la requête. */
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
      },
    },
  });
}
