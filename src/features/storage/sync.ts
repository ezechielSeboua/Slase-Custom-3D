// Synchronisation entre la copie locale (IndexedDB) et le compte (Supabase).
// L'app écrit toujours d'abord en local ; les changements attendent dans une file (états `pending`)
// et partent en arrière-plan dès que le réseau et la session le permettent.
// Conflit : la dernière modification gagne (comparaison de `updated_at`).
import { create } from 'zustand';
import { useAuth } from '@/features/auth/session';
import * as local from '@/features/storage/local';
import * as remote from '@/features/storage/remote';
import type { SyncState } from '@/features/storage/local';

/** Délai entre une modification et son envoi : regroupe les sauvegardes rapprochées. */
const PUSH_DELAY_MS = 1500;
/** Nouvel essai après une erreur (serveur injoignable, session expirée…). */
const RETRY_MS = 30_000;

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'offline' | 'error';

/**
 * `revision` augmente quand la liste locale change du fait de la synchronisation (ou du compte connecté) ;
 * `pulled` : la liste du compte a été reçue au moins une fois depuis la connexion.
 */
export const useSync = create<{ status: SyncStatus; revision: number; pulled: boolean }>(() => ({ status: 'off', revision: 0, pulled: false }));

const bump = () => useSync.setState((s) => ({ revision: s.revision + 1 }));

/** Compte connecté, une fois la session lue ; null sans compte (ou sans Supabase). */
export function whenAuthReady(): Promise<string | null> {
  const read = () => {
    const s = useAuth.getState();
    if (s.status === 'loading') return undefined;
    return s.status === 'signedIn' ? (s.user?.id ?? null) : null;
  };
  const now = read();
  if (now !== undefined) return Promise.resolve(now);
  return new Promise((resolve) => {
    const unsub = useAuth.subscribe(() => {
      const v = read();
      if (v === undefined) return;
      unsub();
      resolve(v);
    });
  });
}

const currentUserId = () => {
  const s = useAuth.getState();
  return s.status === 'signedIn' ? (s.user?.id ?? null) : null;
};

const imageIds = (d: { elements: { kind: string; asset_id?: string }[] }) =>
  [...new Set(d.elements.flatMap((e) => (e.kind === 'image' && e.asset_id ? [e.asset_id] : [])))];

// ---------- File d'envoi ----------
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;
let queued: { pull: boolean } | null = null;

/** Envoie les changements en attente, après un court délai. */
export function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void run(false), PUSH_DELAY_MS);
}

/** Reçoit les créations du compte puis envoie les changements en attente. */
export function syncNow() {
  clearTimeout(pushTimer);
  return run(true);
}

async function run(pull: boolean): Promise<void> {
  if (running) {
    queued = { pull: pull || Boolean(queued?.pull) };
    return running;
  }
  running = cycle(pull);
  try {
    await running;
  } finally {
    running = null;
  }
  if (queued) {
    const next = queued;
    queued = null;
    await run(next.pull);
  }
}

async function cycle(pull: boolean) {
  const uid = currentUserId();
  if (!uid) return useSync.setState({ status: 'off' });
  if (!navigator.onLine) return useSync.setState({ status: 'offline' });
  clearTimeout(retryTimer);
  useSync.setState({ status: 'syncing' });
  try {
    let changed = pull ? await pullAll(uid) : false;
    changed = (await pushPending(uid)) || changed;
    if (currentUserId() !== uid) return;
    useSync.setState((s) => ({ status: 'synced', pulled: s.pulled || pull, revision: changed ? s.revision + 1 : s.revision }));
  } catch {
    if (currentUserId() !== uid) return;
    useSync.setState({ status: navigator.onLine ? 'error' : 'offline' });
    retryTimer = setTimeout(() => void run(true), RETRY_MS);
  }
}

// ---------- Réception ----------
/** Applique en local l'état du serveur. Rend vrai si la liste locale a changé. */
async function pullAll(uid: string): Promise<boolean> {
  const stamps = await remote.listStamps();
  const states = new Map((await local.allSyncStates()).filter((s) => s.owner === uid).map((s) => [s.id, s]));
  const toFetch: string[] = [];
  let changed = false;

  for (const r of stamps) {
    const st = states.get(r.id);
    states.delete(r.id);
    const d = await local.getDesign(r.id);
    if (r.deleted_at) {
      // Modifiée ici après sa suppression ailleurs : la modification gagne, elle repartira au prochain envoi.
      if (d && st?.pending === 'put' && remote.newer(d.updated_at, r.deleted_at)) continue;
      if (st) {
        await local.forgetDesign(r.id);
        changed ||= Boolean(d);
      }
      continue;
    }
    if (!d) {
      if (st?.pending !== 'delete') toFetch.push(r.id);
      continue;
    }
    // Même identifiant qu'une création sans compte (ex. même fichier .json importé) : on n'y touche pas.
    if (!st || st.pending === 'delete') continue;
    if (remote.newer(r.updated_at, d.updated_at)) toFetch.push(r.id);
  }

  // Rattachées au compte, déjà envoyées, mais absentes du serveur : elles n'existent plus nulle part.
  for (const st of states.values()) {
    if (st.pending) continue;
    await local.forgetDesign(st.id);
    changed = true;
  }

  for (const d of await remote.fetchDesigns(toFetch)) {
    await local.putDesign(d);
    await local.putSyncState({ id: d.id, owner: uid, thumbRemote: true });
    thumbTried.delete(d.id);
    changed = true;
  }
  return changed;
}

// ---------- Envoi ----------
async function pushPending(uid: string): Promise<boolean> {
  let changed = false;
  let failed: unknown = null;
  for (const st of await local.allSyncStates()) {
    if (st.owner !== uid || (!st.pending && !st.thumb)) continue;
    try {
      if (st.pending === 'delete') await pushDelete(uid, st);
      else if (st.pending === 'put') changed = (await pushPut(uid, st)) || changed;
      else await pushThumb(uid, st.id);
    } catch (e) {
      // Une création en échec ne bloque pas les autres ; elle reste en file pour le prochain essai.
      failed = e;
    }
  }
  if (failed) throw failed;
  return changed;
}

async function pushPut(uid: string, st: SyncState): Promise<boolean> {
  const d = await local.getDesign(st.id);
  if (!d) {
    await local.putSyncState({ ...st, pending: undefined });
    return false;
  }
  const stamp = await remote.getStamp(d.id);
  if (stamp?.deleted_at && !remote.newer(d.updated_at, stamp.deleted_at)) {
    // Supprimée ailleurs après la dernière modification faite ici.
    await local.forgetDesign(d.id);
    return true;
  }
  if (stamp && !stamp.deleted_at && remote.newer(stamp.updated_at, d.updated_at)) {
    // Modifiée plus récemment sur un autre appareil : cette version-là gagne.
    const [fresh] = await remote.fetchDesigns([d.id]);
    if (fresh) {
      await local.putDesign(fresh);
      await local.putSyncState({ id: d.id, owner: uid, thumbRemote: true });
      thumbTried.delete(d.id);
    }
    return true;
  }

  for (const assetId of imageIds(d)) await ensureUploaded(uid, assetId);
  await remote.upsertDesign(uid, d);

  // Une modification arrivée pendant l'envoi reste en file.
  const after = await local.getDesign(d.id);
  const now = await local.getSyncState(d.id);
  if (now?.pending === 'put' && after?.updated_at === d.updated_at) await local.putSyncState({ ...now, pending: undefined });
  if (now?.thumb) await pushThumb(uid, d.id);
  return false;
}

async function pushThumb(uid: string, id: string) {
  const thumbs = await local.getThumbs(id);
  if (thumbs) await remote.uploadThumbs(uid, thumbs);
  const now = await local.getSyncState(id);
  if (now) await local.putSyncState({ ...now, thumb: false });
}

async function pushDelete(uid: string, st: SyncState) {
  await remote.markDeleted(st.id);
  await remote.removeThumbs(uid, st.id);
  // Annulée entre-temps (« Annuler » dans la notification) : l'état est repassé à `put`.
  const now = await local.getSyncState(st.id);
  if (now?.pending === 'delete') await local.deleteSyncState(st.id);
}

/** Envoie une image une seule fois par compte. */
async function ensureUploaded(uid: string, assetId: string) {
  if (await local.isUploaded(uid, assetId)) return;
  const a = await local.getAsset(assetId);
  if (!a) return;
  await remote.uploadAsset(uid, a);
  await local.markUploaded(uid, assetId);
}

// ---------- Téléchargements à la demande ----------
const inflight = new Map<string, Promise<unknown>>();
const once = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fn().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
};

/** Image absente de ce navigateur (création faite sur un autre appareil) : téléchargée puis gardée en local. */
export function downloadAsset(uid: string, id: string) {
  return once(`asset:${id}`, async () => {
    const a = await remote.downloadAsset(id).catch(() => null);
    if (!a) return undefined;
    await local.putAsset(a);
    await local.markUploaded(uid, id);
    return a;
  });
}

/** Création absente de ce navigateur (lien ouvert avant la première réception) : demandée au serveur. */
export function downloadDesign(uid: string, id: string) {
  return once(`design:${id}`, async () => {
    const [d] = await remote.fetchDesigns([id]).catch(() => []);
    if (!d) return undefined;
    await local.putDesign(d);
    await local.putSyncState({ id, owner: uid, thumbRemote: true });
    return d;
  });
}

/** Miniatures plus récentes sur le serveur ; une seule tentative par création et par chargement de page. */
const thumbTried = new Set<string>();
export function downloadThumbs(uid: string, st: SyncState) {
  return once(`thumbs:${st.id}`, async () => {
    if (thumbTried.has(st.id)) return undefined;
    thumbTried.add(st.id);
    const t = await remote.downloadThumbs(uid, st.id).catch(() => null);
    if (!t) return undefined;
    await local.putThumb(t.id, t.blob, t.back);
    const now = await local.getSyncState(st.id);
    if (now) await local.putSyncState({ ...now, thumbRemote: false });
    return t;
  });
}

export { bump as notifyListChanged };
