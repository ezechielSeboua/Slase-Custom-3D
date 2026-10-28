import placementsJson from '@config/placements.json';
import type { DesignElement, FitId, GarmentId, ZoneId } from '@/types/design';
import { resolveZone } from '@/lib/config';
import { elementAspect, rotatedHalfExtents } from '@/lib/units';

export interface Placement {
  id: string;
  name: string;
  zone: ZoneId;
  x_cm: number;
  anchor: 'top' | 'bottom';
  offset_cm: number;
  width_cm: number;
  max_width_cm: number;
  rotation_deg?: number;
  fit_offset_cm?: Partial<Record<FitId, number>>;
  garments?: GarmentId[];
}

export const placements = placementsJson.placements as Placement[];
export const placementsProvisional = Boolean(placementsJson.provisional);

/** Écart (cm) en deçà duquel un élément glissé s'aimante à un emplacement. */
export const SNAP_CM = 2;
/** Écart (cm) toléré entre un élément et le centre de son emplacement avant qu'il redevienne « libre ». */
const MATCH_CM = 0.3;

export const placementById = (id?: string) => (id ? placements.find((p) => p.id === id) : undefined);

export const placementsFor = (garment: GarmentId, zone?: ZoneId) =>
  placements.filter((p) => (!p.garments || p.garments.includes(garment)) && (!zone || p.zone === zone));

/**
 * Centre (cm, repère de la zone) d'un élément posé sur un emplacement.
 * Le bord haut (ou bas) de l'élément, pivoté compris, est calé sur le repère de l'emplacement.
 */
export function placementCenter(p: Placement, el: DesignElement, garment: GarmentId, fit: FitId): { x: number; y: number } {
  const { hy } = rotatedHalfExtents(el.width_cm, el.width_cm / elementAspect(el), el.rotation_deg);
  const shift = p.fit_offset_cm?.[fit] ?? 0;
  if (p.anchor === 'bottom') {
    const z = resolveZone(garment, fit, p.zone);
    return { x: p.x_cm, y: z.top + z.height - p.offset_cm - shift - hy };
  }
  return { x: p.x_cm, y: p.offset_cm + shift + hy };
}

/** Vrai si l'élément est (encore) au centre de son emplacement. */
export function onPlacement(el: DesignElement, p: Placement, garment: GarmentId, fit: FitId): boolean {
  if (el.zone !== p.zone) return false;
  const c = placementCenter(p, el, garment, fit);
  return Math.hypot(el.x_cm - c.x, el.y_cm - c.y) <= MATCH_CM;
}
