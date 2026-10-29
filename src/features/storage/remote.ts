// Accès au serveur (Supabase) : table `designs`, table `assets`, espace privé `designs` de Storage.
// Les règles d'accès (RLS) limitent chaque requête aux lignes et aux fichiers du compte connecté.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import type { AssetRecord, Design } from '@/types/design';
import type { Thumbs } from '@/features/storage/local';

const BUCKET = 'designs';
/** Nombre maximal de lignes rendues par requête côté Supabase. */
const PAGE = 1000;
/** Identifiants par requête `in (…)`, pour garder des adresses courtes. */
const CHUNK = 100;

export interface RemoteStamp {
  id: string;
  updated_at: string;
  deleted_at: string | null;
}

function client(): SupabaseClient {
  const s = getSupabase();
  if (!s) throw new Error('supabase');
  return s;
}

const assetPath = (owner: string, id: string) => `${owner}/assets/${id}`;
const thumbPath = (owner: string, id: string, side: 'front' | 'back') => `${owner}/thumbs/${id}-${side}.png`;

/** Vrai si l'horodatage `a` est strictement plus récent que `b`. */
export const newer = (a: string, b: string) => Date.parse(a) > Date.parse(b);

/** Date et état de toutes les créations du compte, supprimées comprises. */
export async function listStamps(): Promise<RemoteStamp[]> {
  const out: RemoteStamp[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client().from('designs').select('id, updated_at, deleted_at').order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

export async function getStamp(id: string): Promise<RemoteStamp | null> {
  const { data, error } = await client().from('designs').select('id, updated_at, deleted_at').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Créations complètes (non supprimées) parmi `ids`. */
export async function fetchDesigns(ids: string[]): Promise<Design[]> {
  const out: Design[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await client().from('designs').select('data').in('id', ids.slice(i, i + CHUNK)).is('deleted_at', null);
    if (error) throw error;
    out.push(...data.map((r) => r.data as Design));
  }
  return out;
}

export async function upsertDesign(owner: string, d: Design) {
  const { error } = await client().from('designs').upsert({
    id: d.id,
    user_id: owner,
    name: d.name,
    garment: d.garment,
    fit: d.fit,
    data: d,
    created_at: d.created_at,
    updated_at: d.updated_at,
    deleted_at: null,
  });
  if (error) throw error;
}

/** Marque la création supprimée : la ligne reste, pour que la suppression atteigne les autres appareils. */
export async function markDeleted(id: string) {
  const { error } = await client().from('designs').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null);
  if (error) throw error;
}

export async function uploadAsset(owner: string, a: AssetRecord) {
  const path = assetPath(owner, a.id);
  const up = await client().storage.from(BUCKET).upload(path, a.blob, { contentType: a.type, upsert: true });
  if (up.error) throw up.error;
  const { error } = await client().from('assets').upsert({
    id: a.id,
    user_id: owner,
    name: a.name,
    type: a.type,
    width: a.width,
    height: a.height,
    opaque_background: a.opaque_background,
    vector: a.vector,
    path,
  });
  if (error) throw error;
}

/** Image d'origine et ses métadonnées ; null si elle n'est pas sur le serveur. */
export async function downloadAsset(id: string): Promise<AssetRecord | null> {
  const { data: row, error } = await client()
    .from('assets')
    .select('id, name, type, width, height, opaque_background, vector, path')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const file = await client().storage.from(BUCKET).download(row.path);
  if (file.error) throw file.error;
  const { path: _path, ...meta } = row;
  void _path;
  return { ...meta, blob: new Blob([file.data], { type: row.type }) };
}

export async function uploadThumbs(owner: string, t: Thumbs) {
  const bucket = client().storage.from(BUCKET);
  const front = await bucket.upload(thumbPath(owner, t.id, 'front'), t.blob, { contentType: 'image/png', upsert: true });
  if (front.error) throw front.error;
  if (t.back) {
    const back = await bucket.upload(thumbPath(owner, t.id, 'back'), t.back, { contentType: 'image/png', upsert: true });
    if (back.error) throw back.error;
  }
}

/** Miniatures d'une création ; null si le devant n'est pas (encore) sur le serveur. */
export async function downloadThumbs(owner: string, id: string): Promise<Thumbs | null> {
  const bucket = client().storage.from(BUCKET);
  const front = await bucket.download(thumbPath(owner, id, 'front'));
  if (front.error) return null;
  const back = await bucket.download(thumbPath(owner, id, 'back'));
  return { id, blob: front.data, back: back.error ? undefined : back.data };
}

export async function removeThumbs(owner: string, id: string) {
  const { error } = await client().storage.from(BUCKET).remove([thumbPath(owner, id, 'front'), thumbPath(owner, id, 'back')]);
  if (error) throw error;
}
