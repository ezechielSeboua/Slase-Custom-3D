import type { DesignElement } from '@/types/design';
import type { ResolvedZone } from '@/lib/config';

export const CM_PER_INCH = 2.54;

export const cmToUnits = (cm: number, unitsPerCm: number) => cm * unitsPerCm;
export const unitsToCm = (u: number, unitsPerCm: number) => u / unitsPerCm;

/** Nombre de pixels pour une longueur en cm à une résolution donnée. */
export const cmToPx = (cm: number, dpi: number) => (cm / CM_PER_INCH) * dpi;
/** Résolution effective d'une image de `px` pixels imprimée sur `cm` centimètres. */
export const effectiveDpi = (px: number, cm: number) => (cm > 0 ? px / (cm / CM_PER_INCH) : Infinity);
/** Plus grande largeur imprimable (cm) d'une image de `px` pixels à `dpi`. */
export const maxCmAtDpi = (px: number, dpi: number) => (px / dpi) * CM_PER_INCH;

export const round1 = (v: number) => Math.round(v * 10) / 10;

export function elementAspect(el: DesignElement): number {
  if (el.kind === 'image') return el.source_px[0] / Math.max(1, el.source_px[1]);
  return el.aspect > 0 ? el.aspect : 1;
}

export function elementHeightCm(el: DesignElement): number {
  return el.width_cm / elementAspect(el);
}

/** Demi-étendues de la boîte englobante d'un élément pivoté, en cm. */
export function rotatedHalfExtents(width: number, height: number, rotationDeg: number) {
  const r = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  return { hx: (width / 2) * c + (height / 2) * s, hy: (width / 2) * s + (height / 2) * c };
}

export const MIN_WIDTH_CM = 0.5;

/** Ramène un élément dans sa zone : réduit sa taille s'il est trop grand, puis le bloque au bord. */
export function clampToZone<T extends DesignElement>(el: T, zone: ResolvedZone): T {
  const aspect = elementAspect(el);
  let width = Math.max(MIN_WIDTH_CM, el.width_cm);
  const unit = rotatedHalfExtents(1, 1 / aspect, el.rotation_deg);
  const maxW = Math.min(zone.width / 2 / unit.hx, zone.height / 2 / unit.hy);
  if (width > maxW) width = Math.max(MIN_WIDTH_CM, maxW);
  const { hx, hy } = rotatedHalfExtents(width, width / aspect, el.rotation_deg);
  const xMax = Math.max(0, zone.width / 2 - hx);
  const x = Math.min(xMax, Math.max(-xMax, el.x_cm));
  const yMin = zone.top + hy, yMax = Math.max(yMin, zone.top + zone.height - hy);
  const y = Math.min(yMax, Math.max(yMin, el.y_cm));
  return { ...el, width_cm: round2(width), x_cm: round2(x), y_cm: round2(y) };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
