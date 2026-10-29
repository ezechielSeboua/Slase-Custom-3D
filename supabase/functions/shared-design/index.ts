// Lecture d'une création partagée par lien (fonction Supabase, Deno), sans compte.
// Rend la création et, pour chaque image, une adresse signée valable peu de temps : l'espace Storage
// reste privé, et seul le détenteur du jeton peut voir les images de cette création-là.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'designs';
/** Durée de validité des adresses d'images, en secondes. */
const URL_TTL_S = 3600;
const TOKEN = /^[A-Za-z0-9_-]{24}$/;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

// Lien inconnu, désactivé ou création supprimée : un cas normal, pas une erreur. Réponse 200, pour que le
// navigateur du visiteur n'affiche pas d'erreur réseau dans sa console.
const notFound = () => json({ error: 'not_found' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const token = new URL(req.url).searchParams.get('t') ?? '';
  if (!TOKEN.test(token)) return notFound();

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: share, error: shareError } = await admin.from('shares').select('design_id, user_id').eq('token', token).maybeSingle();
  if (shareError) return json({ error: 'server' }, 500);
  if (!share) return notFound();

  const { data: row, error: designError } = await admin
    .from('designs')
    .select('data')
    .eq('id', share.design_id)
    .eq('user_id', share.user_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (designError) return json({ error: 'server' }, 500);
  if (!row) return notFound();

  const design = row.data as { elements: { kind: string; asset_id?: string }[] };
  const ids = [...new Set(design.elements.flatMap((e) => (e.kind === 'image' && e.asset_id ? [e.asset_id] : [])))];
  const assets = [];
  if (ids.length) {
    const { data: rows, error } = await admin
      .from('assets')
      .select('id, name, type, width, height, opaque_background, vector, path')
      .in('id', ids)
      .eq('user_id', share.user_id);
    if (error) return json({ error: 'server' }, 500);
    for (const a of rows) {
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(a.path, URL_TTL_S);
      if (!signed) continue;
      const { path: _path, ...meta } = a;
      void _path;
      assets.push({ ...meta, url: signed.signedUrl });
    }
  }
  return json({ design: row.data, assets });
});
