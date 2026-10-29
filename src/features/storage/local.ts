// Copie locale (IndexedDB), sans notion de compte ni de serveur : db.ts y ajoute la synchronisation.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AssetMeta, AssetRecord, Design } from '@/types/design';

/**
 * État de synchronisation d'une création rattachée à un compte. Une création sans état
 * n'appartient à aucun compte : elle n'existe que dans ce navigateur.
 */
export interface SyncState {
  id: string;
  /** Identifiant Supabase du propriétaire. */
  owner: string;
  /** Changement en attente d'envoi (file hors ligne). */
  pending?: 'put' | 'delete';
  /** Miniature à envoyer. */
  thumb?: boolean;
  /** Miniature plus récente sur le serveur, à télécharger. */
  thumbRemote?: boolean;
}

interface Schema extends DBSchema {
  designs: { key: string; value: Design };
  assets: { key: string; value: AssetRecord };
  thumbs: { key: string; value: Thumbs };
  sync: { key: string; value: SyncState };
  /** Images déjà présentes sur le serveur, par compte : clé `{owner}/{asset_id}`. */
  uploaded: { key: string; value: { key: string } };
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
    dbPromise = openDB<Schema>('configurateur-3d', 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore('designs', { keyPath: 'id' });
          d.createObjectStore('assets', { keyPath: 'id' });
          d.createObjectStore('thumbs', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          d.createObjectStore('sync', { keyPath: 'id' });
          d.createObjectStore('uploaded', { keyPath: 'key' });
        }
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

export const allDesigns = async () => (await db()).getAll('designs');
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

// ---------- Synchronisation ----------
export const getSyncState = async (id: string) => (await db()).get('sync', id);
export const allSyncStates = async () => (await db()).getAll('sync');
export const putSyncState = async (s: SyncState) => void (await db()).put('sync', s);
export const deleteSyncState = async (id: string) => void (await db()).delete('sync', id);

export const isUploaded = async (owner: string, assetId: string) => Boolean(await (await db()).get('uploaded', `${owner}/${assetId}`));
export const markUploaded = async (owner: string, assetId: string) => void (await db()).put('uploaded', { key: `${owner}/${assetId}` });

/** Retire une création de ce navigateur, sans possibilité d'annuler (supprimée ailleurs, ou compte supprimé). */
export async function forgetDesign(id: string) {
  const d = await db();
  await d.delete('designs', id);
  await d.delete('thumbs', id);
  await d.delete('sync', id);
}

/** Oublie tout ce qui appartient à un compte dans ce navigateur. */
export async function forgetOwner(owner: string) {
  const d = await db();
  for (const s of await d.getAll('sync')) if (s.owner === owner) await forgetDesign(s.id);
  for (const key of await d.getAllKeys('uploaded')) if (key.startsWith(`${owner}/`)) await d.delete('uploaded', key);
  await removeOrphanAssets();
}
