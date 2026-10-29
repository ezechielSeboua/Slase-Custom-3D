import { create } from 'zustand';
import type { AssetMeta, Design, DesignElement, FitId, GarmentId, TextElement, ZoneId } from '@/types/design';
import { fonts, resolveZone, ZONE_IDS, type ResolvedZone } from '@/lib/config';
import { clampToZone, maxCmAtDpi } from '@/lib/units';
import { measureTextAspect } from '@/lib/text';
import { placementById, placementCenter } from '@/lib/placements';
import { quality } from '@/lib/config';
import { fr } from '@/i18n/fr';

const HISTORY_MAX = 100;
const COALESCE_MS = 1000;

export type Background = 'light' | 'dark';

interface DesignState {
  design: Design | null;
  assets: Record<string, AssetMeta>;
  selectedId: string | null;
  past: Design[];
  future: Design[];
  background: Background;
  gestureStart: Design | null;
  lastKey: string | null;
  lastTime: number;
  /** Création vue par lien partagé : rien ne se sélectionne ni ne se déplace. */
  readOnly: boolean;
}

export const useDesign = create<DesignState>(() => ({
  design: null,
  assets: {},
  selectedId: null,
  past: [],
  future: [],
  background: 'light',
  gestureStart: null,
  lastKey: null,
  lastTime: 0,
  readOnly: false,
}));

const get = useDesign.getState;
const set = useDesign.setState;

/** Recale un élément sur son emplacement (taille, rotation, coupe ou vêtement ont pu changer). */
function snapToPlacement(el: DesignElement, d: Design): DesignElement {
  if (!el.placement) return el;
  const p = placementById(el.placement);
  if (!p || (p.garments && !p.garments.includes(d.garment))) {
    const { placement: _drop, ...free } = el;
    void _drop;
    return free as DesignElement;
  }
  const c = placementCenter(p, { ...el, zone: p.zone }, d.garment, d.fit);
  return { ...el, zone: p.zone, x_cm: c.x, y_cm: c.y };
}

/** Recale les éléments posés sur un emplacement, puis ramène chaque élément dans sa zone. */
export function normalize(d: Design): Design {
  const zones = Object.fromEntries(ZONE_IDS.map((z) => [z, resolveZone(d.garment, d.fit, z)])) as Record<ZoneId, ResolvedZone>;
  return {
    ...d,
    elements: d.elements.map((el) => {
      const snapped = snapToPlacement(el, d);
      return clampToZone(snapped, zones[snapped.zone]);
    }),
  };
}

/** Un déplacement manuel (position ou zone) libère l'élément de son emplacement, sauf si le patch en désigne un. */
function freeIfMoved(patch: Partial<DesignElement>): Partial<DesignElement> {
  const moved = 'x_cm' in patch || 'y_cm' in patch || 'zone' in patch;
  return moved && !('placement' in patch) ? { ...patch, placement: undefined } : patch;
}

const stamp = (d: Design): Design => ({ ...d, updated_at: new Date().toISOString() });

export function loadDesign(design: Design, assets: AssetMeta[], readOnly = false) {
  set({
    readOnly,
    design: normalize(design),
    assets: Object.fromEntries(assets.map((a) => [a.id, a])),
    selectedId: null,
    past: [],
    future: [],
    gestureStart: null,
    lastKey: null,
  });
}

export function unloadDesign() {
  set({ design: null, assets: {}, selectedId: null, past: [], future: [], gestureStart: null, readOnly: false });
}

/**
 * Applique une modification et l'ajoute à l'historique.
 * Deux modifications avec la même `key` à moins d'une seconde d'écart forment une seule étape (saisie au clavier).
 */
export function commit(recipe: (d: Design) => Design, key?: string) {
  const { design, past, lastKey, lastTime } = get();
  if (!design) return;
  const changed = recipe(design);
  if (changed === design) return;
  const next = stamp(normalize(changed));
  const now = Date.now();
  const coalesce = key !== undefined && key === lastKey && now - lastTime < COALESCE_MS;
  set({
    design: next,
    past: coalesce ? past : [...past, design].slice(-HISTORY_MAX),
    future: [],
    lastKey: key ?? null,
    lastTime: now,
  });
}

export function beginGesture() {
  const { design } = get();
  if (design) set({ gestureStart: design });
}

/** Modification en direct pendant un glisser : n'entre pas dans l'historique avant `endGesture`. */
export function liveUpdate(recipe: (d: Design) => Design) {
  const { design } = get();
  if (design) set({ design: normalize(recipe(design)) });
}

export function endGesture() {
  const { design, gestureStart, past } = get();
  if (!design || !gestureStart) return;
  if (design !== gestureStart) {
    set({ design: stamp(design), past: [...past, gestureStart].slice(-HISTORY_MAX), future: [], lastKey: null });
  }
  set({ gestureStart: null });
}

export function undo() {
  const { design, past, future, selectedId } = get();
  if (!design || past.length === 0) return;
  const prev = past[past.length - 1];
  set({
    design: prev,
    past: past.slice(0, -1),
    future: [design, ...future],
    lastKey: null,
    selectedId: prev.elements.some((e) => e.id === selectedId) ? selectedId : null,
  });
}

export function redo() {
  const { design, past, future, selectedId } = get();
  if (!design || future.length === 0) return;
  const next = future[0];
  set({
    design: next,
    past: [...past, design],
    future: future.slice(1),
    lastKey: null,
    selectedId: next.elements.some((e) => e.id === selectedId) ? selectedId : null,
  });
}

export const select = (id: string | null) => set({ selectedId: id });
export const setBackground = (background: Background) => set({ background });
export const registerAsset = (meta: AssetMeta) => set({ assets: { ...get().assets, [meta.id]: meta } });

// ---------- actions de l'éditeur ----------

export const setName = (name: string) => commit((d) => ({ ...d, name }), 'name');
export const setGarment = (garment: GarmentId) => commit((d) => ({ ...d, garment }));
export const setFit = (fit: FitId) => commit((d) => ({ ...d, fit }));
export const setColor = (color: string) => commit((d) => ({ ...d, color }));

const mapEl = (d: Design, id: string, fn: (el: DesignElement) => DesignElement): Design => ({
  ...d,
  elements: d.elements.map((el) => (el.id === id ? fn(el) : el)),
});

export function updateElement(id: string, patch: Partial<DesignElement>, key?: string) {
  commit(
    (d) =>
      mapEl(d, id, (el) => {
        const next = { ...el, ...freeIfMoved(patch) } as DesignElement;
        if (next.kind === 'text' && ('text' in patch || 'font' in patch || 'weight' in patch)) {
          next.aspect = measureTextAspect(next);
        }
        return next;
      }),
    key ? `${id}:${key}` : undefined,
  );
}

export function liveElement(id: string, patch: Partial<DesignElement>) {
  liveUpdate((d) => mapEl(d, id, (el) => ({ ...el, ...freeIfMoved(patch) }) as DesignElement));
}

/** Pose un élément sur un emplacement (zone, largeur et rotation proposées), ou le rend libre avec `null`. */
export function applyPlacement(id: string, placementId: string | null) {
  const p = placementById(placementId ?? undefined);
  commit((d) =>
    mapEl(d, id, (el) =>
      p
        ? ({ ...el, placement: p.id, zone: p.zone, width_cm: p.width_cm, rotation_deg: p.rotation_deg ?? 0 } as DesignElement)
        : ({ ...el, placement: undefined } as DesignElement),
    ),
  );
}

function defaultPosition(d: Design, zone: ZoneId) {
  const z = resolveZone(d.garment, d.fit, zone);
  return { x_cm: 0, y_cm: z.top + z.height / 3, zoneWidth: z.width };
}

export function addImage(meta: AssetMeta, zone: ZoneId): string {
  const id = crypto.randomUUID();
  commit((d) => {
    const p = defaultPosition(d, zone);
    // Largeur initiale : la moitié de la zone, sans dépasser la taille nette à la résolution minimale.
    const sharp = meta.vector ? Infinity : maxCmAtDpi(meta.width, quality.min_dpi);
    const width = Math.max(1, Math.floor(Math.min(p.zoneWidth / 2, sharp) * 100) / 100);
    const el: DesignElement = {
      id, kind: 'image', zone, x_cm: p.x_cm, y_cm: p.y_cm, width_cm: width, rotation_deg: 0,
      asset: meta.name, asset_id: meta.id, source_px: [meta.width, meta.height],
    };
    return { ...d, elements: [...d.elements, el] };
  });
  set({ selectedId: id });
  return id;
}

export function addText(zone: ZoneId): string {
  const id = crypto.randomUUID();
  commit((d) => {
    const p = defaultPosition(d, zone);
    const base = { text: fr.editor.defaultText, font: fonts[0]?.id ?? '', weight: 700, align: 'center' as const, color: '#000000' };
    const el: TextElement = {
      id, kind: 'text', zone, x_cm: p.x_cm, y_cm: p.y_cm, width_cm: p.zoneWidth / 2, rotation_deg: 0,
      ...base, aspect: measureTextAspect(base),
    };
    return { ...d, elements: [...d.elements, el] };
  });
  set({ selectedId: id });
  return id;
}

export function deleteElement(id: string) {
  commit((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== id) }));
  if (get().selectedId === id) set({ selectedId: null });
}

export function duplicateElement(id: string) {
  const copyId = crypto.randomUUID();
  commit((d) => {
    const i = d.elements.findIndex((e) => e.id === id);
    if (i < 0) return d;
    const src = d.elements[i];
    const copy = { ...src, id: copyId, x_cm: src.x_cm + 1, y_cm: src.y_cm + 1 };
    const elements = [...d.elements];
    elements.splice(i + 1, 0, copy);
    return { ...d, elements };
  });
  set({ selectedId: copyId });
}

/**
 * Place un calque à la position `toIndex` dans la liste de sa zone, affichée du haut (devant) vers le bas.
 * Les autres zones ne bougent pas : les emplacements de la zone dans la pile globale sont simplement réattribués.
 */
export function reorderInZone(id: string, toIndex: number) {
  commit((d) => {
    const el = d.elements.find((e) => e.id === id);
    if (!el) return d;
    const slots = d.elements.flatMap((e, i) => (e.zone === el.zone ? [i] : []));
    const display = slots.map((i) => d.elements[i]).reverse();
    const from = display.findIndex((e) => e.id === id);
    const to = Math.max(0, Math.min(display.length - 1, toIndex));
    if (from === to) return d;
    display.splice(to, 0, ...display.splice(from, 1));
    const bottomFirst = display.reverse();
    const elements = [...d.elements];
    slots.forEach((slot, k) => (elements[slot] = bottomFirst[k]));
    return { ...d, elements };
  });
}

/** Déplace un calque d'un cran dans sa zone ; +1 = vers le haut (devant les autres). */
export function moveLayer(id: string, dir: 1 | -1) {
  const d = get().design;
  const el = d?.elements.find((e) => e.id === id);
  if (!d || !el) return;
  const display = d.elements.filter((e) => e.zone === el.zone).reverse();
  reorderInZone(id, display.findIndex((e) => e.id === id) - dir);
}

export const renameElement = (id: string, name: string) => updateElement(id, { name: name.trim() || undefined }, 'name');

export const toggleHidden = (id: string) => commit((d) => mapEl(d, id, (el) => ({ ...el, hidden: !el.hidden })));
