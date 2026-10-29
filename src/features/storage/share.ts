// Partage d'une création par lien, en lecture seule (table `shares`, fonction Supabase `shared-design`).
import { getSupabase } from '@/lib/supabase/client';
import type { AssetMeta, AssetRecord, Design } from '@/types/design';
import { syncNow } from '@/features/storage/sync';

function client() {
  const s = getSupabase();
  if (!s) throw new Error('supabase');
  return s;
}

export const shareUrl = (token: string) => `${window.location.origin}/partage?t=${encodeURIComponent(token)}`;

/** Jeton du lien actif de la création, ou null. */
export async function getShareToken(designId: string): Promise<string | null> {
  const { data, error } = await client().from('shares').select('token').eq('design_id', designId).maybeSingle();
  if (error) throw error;
  return data?.token ?? null;
}

/** Crée le lien (ou rend celui qui existe). La création doit d'abord être sur le serveur : on synchronise avant. */
export async function createShare(designId: string): Promise<string> {
  await syncNow();
  const existing = await getShareToken(designId);
  if (existing) return existing;
  const { data, error } = await client().from('shares').insert({ design_id: designId }).select('token').single();
  if (error) throw error;
  return data.token;
}

export interface ActiveShare {
  token: string;
  designId: string;
  name: string;
  createdAt: string;
}

/** Liens actifs du compte, du plus récent au plus ancien (créations supprimées exclues : leur lien ne mène à rien). */
export async function listShares(): Promise<ActiveShare[]> {
  const { data, error } = await client()
    .from('shares')
    .select('token, design_id, created_at, designs(name, deleted_at)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as { token: string; design_id: string; created_at: string; designs: { name: string; deleted_at: string | null } | null }[])
    .filter((r) => r.designs && !r.designs.deleted_at)
    .map((r) => ({ token: r.token, designId: r.design_id, name: r.designs!.name, createdAt: r.created_at }));
}

/** Désactive le lien : il ne mène plus à rien, pour personne. */
export async function deleteShare(designId: string) {
  const { error } = await client().from('shares').delete().eq('design_id', designId);
  if (error) throw error;
}

export class ShareNotFoundError extends Error {}

/** Création partagée et ses images (téléchargées en mémoire), pour l'affichage en lecture seule. */
export async function openShare(token: string): Promise<{ design: Design; assets: AssetRecord[] }> {
  const { data, error } = await client().functions.invoke<{ design?: Design; assets?: (AssetMeta & { url: string })[]; error?: string }>(
    `shared-design?t=${encodeURIComponent(token)}`,
    { method: 'GET' },
  );
  // « Introuvable » arrive en réponse normale ({ error: 'not_found' }) ; le code 404 reste reconnu par sécurité.
  const status = (error as { context?: Response } | null)?.context?.status;
  if (data?.error === 'not_found' || status === 404) throw new ShareNotFoundError();
  if (error || !data?.design || !data.assets) throw error ?? new Error('share');
  const design = data.design;
  const assets = await Promise.all(
    data.assets.map(async ({ url, ...meta }) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('asset');
      return { ...meta, blob: await res.blob() };
    }),
  );
  return { design, assets };
}
