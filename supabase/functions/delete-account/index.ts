// Suppression du compte connecté (fonction Supabase, Deno).
// La clé d'administration n'existe que dans l'environnement de la fonction : elle ne passe jamais par l'app.
// Ordre : fichiers de l'utilisateur dans Storage, puis l'utilisateur ; ses lignes `designs` et `assets`
// partent avec lui (clé étrangère ON DELETE CASCADE).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'designs';
const PAGE = 1000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Tous les fichiers sous `prefix`, sous-dossiers compris (Storage ne liste qu'un niveau à la fois). */
async function listFiles(admin: SupabaseClient, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: PAGE, offset });
    if (error) throw error;
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      // Un dossier n'a pas d'identifiant.
      if (item.id) out.push(path);
      else out.push(...(await listFiles(admin, path)));
    }
    if (data.length < PAGE) return out;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Le jeton de session identifie le compte : on ne supprime jamais un autre compte que celui qui appelle.
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'unauthorized' }, 401);
  const userId = auth.user.id;

  try {
    const files = await listFiles(admin, userId);
    for (let i = 0; i < files.length; i += PAGE) {
      const { error } = await admin.storage.from(BUCKET).remove(files.slice(i, i + PAGE));
      if (error) throw error;
    }
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  } catch (e) {
    console.error('delete-account', userId, e);
    return json({ error: 'delete_failed' }, 500);
  }
  return json({ ok: true });
});
