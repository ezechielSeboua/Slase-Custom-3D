// Point d'entrée unique du stockage pour le reste de l'app (éditeur, scène 3D, exports).
// Tout est lu et écrit dans IndexedDB (local.ts) ; quand un compte est connecté, les créations qui lui
// appartiennent sont en plus envoyées et reçues en arrière-plan (sync.ts).
// Une création n'est visible que par son propriétaire : celles d'un compte n'apparaissent pas sans ce compte,
// celles sans compte n'apparaissent qu'à la personne déconnectée (ou dans la proposition de reprise).
import type { AssetMeta, AssetRecord, Design } from '@/types/design';
import * as local from '@/features/storage/local';
import type { SyncState, Thumbs } from '@/features/storage/local';
import { downloadAsset, downloadDesign, downloadThumbs, schedulePush, syncNow, whenAuthReady } from '@/features/storage/sync';

export type { Thumbs };
export { storageAvailable, removeOrphanAssets, putAsset } from '@/features/storage/local';

const ownerOf = (st?: SyncState) => st?.owner ?? null;

export async function listDesigns(): Promise<Design[]> {
  const uid = await whenAuthReady();
  const states = new Map((await local.allSyncStates()).map((s) => [s.id, s]));
  const all = (await local.allDesigns()).filter((d) => ownerOf(states.get(d.id)) === uid);
  return all.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getDesign(id: string): Promise<Design | undefined> {
  const uid = await whenAuthReady();
  const [d, st] = await Promise.all([local.getDesign(id), local.getSyncState(id)]);
  if (d) return ownerOf(st) === uid ? d : undefined;
  return uid ? downloadDesign(uid, id) : undefined;
}

/** Enregistre en local ; rattache la création au compte connecté et la met en file d'envoi. */
export async function putDesign(d: Design) {
  const uid = await whenAuthReady();
  await local.putDesign(d);
  const st = await local.getSyncState(d.id);
  // Une création déjà rattachée garde son propriétaire (ex. déconnexion pendant l'édition : elle partira à la reconnexion).
  if (st) await local.putSyncState({ ...st, pending: 'put' });
  else if (uid) await local.putSyncState({ id: d.id, owner: uid, pending: 'put' });
  else return;
  schedulePush();
}

export type DeleteBackup = { design?: Design; thumbs?: Thumbs; state?: SyncState };

/** Retire une création et rend de quoi l'annuler ; la suppression part ensuite vers le compte. */
export async function deleteDesign(id: string): Promise<DeleteBackup> {
  const state = await local.getSyncState(id);
  const backup = await local.deleteDesign(id);
  if (state) {
    await local.putSyncState({ ...state, pending: 'delete', thumb: false });
    schedulePush();
  }
  return { ...backup, state };
}

export async function restoreDesign(backup: DeleteBackup) {
  if (!backup.state || !backup.design) return local.restoreDesign(backup);
  // Annuler compte comme une modification : la date avance, pour l'emporter sur la suppression déjà envoyée.
  const design = { ...backup.design, updated_at: new Date().toISOString() };
  await local.restoreDesign({ design, thumbs: backup.thumbs });
  await local.putSyncState({ ...backup.state, pending: 'put', thumb: Boolean(backup.thumbs) });
  schedulePush();
}

/** Images d'une création partagée par lien : gardées en mémoire, jamais écrites dans ce navigateur. */
let sharedAssets = new Map<string, AssetRecord>();
export function setSharedAssets(records: AssetRecord[]) {
  sharedAssets = new Map(records.map((a) => [a.id, a]));
}

export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  const shared = sharedAssets.get(id);
  if (shared) return shared;
  const a = await local.getAsset(id);
  if (a) return a;
  const uid = await whenAuthReady();
  return uid ? downloadAsset(uid, id) : undefined;
}

export async function getAssetMetas(ids: string[]): Promise<AssetMeta[]> {
  const uid = await whenAuthReady();
  if (uid) {
    const missing = [];
    for (const id of new Set(ids)) if (!(await local.getAsset(id))) missing.push(id);
    await Promise.all(missing.map((id) => downloadAsset(uid, id)));
  }
  return local.getAssetMetas(ids);
}

export async function putThumb(id: string, blob: Blob, back?: Blob) {
  await local.putThumb(id, blob, back);
  const st = await local.getSyncState(id);
  if (!st) return;
  await local.putSyncState({ ...st, thumb: true, thumbRemote: false });
  schedulePush();
}

export async function getThumbs(id: string): Promise<Thumbs | undefined> {
  const [th, st] = await Promise.all([local.getThumbs(id), local.getSyncState(id)]);
  if (st && (st.thumbRemote || !th)) {
    const uid = await whenAuthReady();
    if (uid === st.owner) return (await downloadThumbs(uid, st)) ?? th;
  }
  return th;
}

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

// ---------- Reprise des créations du navigateur ----------
/** Créations rattachées à aucun compte : faites sans être connecté, dans ce navigateur. */
export async function listUnclaimedDesigns(): Promise<Design[]> {
  const owned = new Set((await local.allSyncStates()).map((s) => s.id));
  return (await local.allDesigns()).filter((d) => !owned.has(d.id));
}

/** Rattache au compte connecté les créations de ce navigateur, puis les envoie. */
export async function claimDesigns(ids: string[]) {
  const uid = await whenAuthReady();
  if (!uid) return;
  for (const id of ids) {
    if (await local.getSyncState(id)) continue;
    await local.putSyncState({ id, owner: uid, pending: 'put', thumb: Boolean(await local.getThumbs(id)) });
  }
  await syncNow();
}

/** Après la suppression du compte : plus rien de ce compte ne reste dans ce navigateur. */
export const forgetAccount = (uid: string) => local.forgetOwner(uid);
