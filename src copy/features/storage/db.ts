import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AssetMeta, AssetRecord, Design } from '@/types/design';

interface Schema extends DBSchema {
  designs: { key: string; value: Design };
  assets: { key: string; value: AssetRecord };
  thumbs: { key: string; value: Thumbs };
}

/** Miniatures d'une création : devant (toujours) et dos (affiché au survol de la carte). */
export interface Thumbs {
  id: string;
  blob: Blob;
  back?: Blob;
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>('configurateur-3d', 1, {
      upgrade(d) {
        d.createObjectStore('designs', { keyPath: 'id' });
        d.createObjectStore('assets', { keyPath: 'id' });
        d.createObjectStore('thumbs', { keyPath: 'id' });
      },
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

export async function storageAvailable(): Promise<boolean> {
  try {
    await db();
    return true;
  } catch {
    return false;
  }
}

export async function listDesigns(): Promise<Design[]> {
  const all = await (await db()).getAll('designs');
  return all.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export const getDesign = async (id: string) => (await db()).get('designs', id);
export const putDesign = async (d: Design) => void (await db()).put('designs', d);

/**
 * Retire une création et rend de quoi l'annuler. Les images ne sont pas supprimées ici : une image orpheline
 * l'est au prochain nettoyage (removeOrphanAssets), ce qui laisse le temps d'annuler.
 */
export async function deleteDesign(id: string): Promise<{ design?: Design; thumbs?: Thumbs }> {
  const d = await db();
  const backup = { design: await d.get('designs', id), thumbs: await d.get('thumbs', id) };
  await d.delete('designs', id);
  await d.delete('thumbs', id);
  return backup;
}

export async function restoreDesign(backup: { design?: Design; thumbs?: Thumbs }) {
  const d = await db();
  if (backup.design) await d.put('designs', backup.design);
  if (backup.thumbs) await d.put('thumbs', backup.thumbs);
}

/** Supprime les images qui ne sont plus utilisées par aucune création. */
export async function removeOrphanAssets() {
  const d = await db();
  const used = new Set((await d.getAll('designs')).flatMap((x) => x.elements.flatMap((e) => (e.kind === 'image' ? [e.asset_id] : []))));
  for (const key of await d.getAllKeys('assets')) if (!used.has(key)) await d.delete('assets', key);
}

export const putAsset = async (a: AssetRecord) => void (await db()).put('assets', a);
export const getAsset = async (id: string) => (await db()).get('assets', id);

export async function getAssetMetas(ids: string[]): Promise<AssetMeta[]> {
  const d = await db();
  const out: AssetMeta[] = [];
  for (const id of new Set(ids)) {
    const a = await d.get('assets', id);
    if (a) {
      const { blob: _blob, ...meta } = a;
      void _blob;
      out.push(meta);
    }
  }
  return out;
}

export const putThumb = async (id: string, blob: Blob, back?: Blob) => void (await db()).put('thumbs', { id, blob, back });
export const getThumbs = async (id: string) => (await db()).get('thumbs', id);

export async function duplicateDesign(id: string, suffix: string): Promise<Design | undefined> {
  const src = await getDesign(id);
  if (!src) return;
  const now = new Date().toISOString();
  const copy: Design = { ...src, id: crypto.randomUUID(), name: src.name + suffix, created_at: now, updated_at: now };
  await putDesign(copy);
  const thumbs = await getThumbs(id);
  if (thumbs) await putThumb(copy.id, thumbs.blob, thumbs.back);
  return copy;
}
