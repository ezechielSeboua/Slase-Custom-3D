import garmentsJson from '@config/garments.json';
import printZonesJson from '@config/print-zones.json';
import colorsJson from '@config/colors.json';
import fontsJson from '@config/fonts.json';
import qualityJson from '@config/quality.json';
import type { FitId, GarmentId, ZoneId } from '@/types/design';

export const TBD = '[TBD]';

type Vec3 = [number, number, number];

export interface ZoneModel {
  origin: Vec3;
  normal: Vec3;
  /** Direction « haut » de la zone ; vers l'épaule pour une manche. Par défaut +Y. */
  up?: Vec3;
  surface_cm: { width: number; top: number; height: number };
}

export interface GarmentModel {
  model: string;
  material: string;
  provisional?: boolean;
  /** Vrai modèle dont la taille réelle reste à confirmer : les cm de la fiche en dépendent. */
  scale_provisional?: boolean;
  units_per_cm: number;
  zones: Record<ZoneId, ZoneModel>;
}

export interface ColorDef {
  id: string;
  name: string;
  hex: string;
}

export interface FontDef {
  id: string;
  name: string;
  family: string;
  weights: number[];
  license: string;
}

/** Zone d'impression résolue, en cm. `confirmed` est faux tant qu'une dimension de l'atelier manque. */
export interface ResolvedZone {
  width: number;
  height: number;
  top: number;
  confirmed: boolean;
}

const garments = garmentsJson.garments as unknown as { id: GarmentId; coming_soon?: boolean; fits: Record<FitId, GarmentModel> }[];

export const GARMENT_IDS: GarmentId[] = ['tshirt', 'sweater'];
export const FIT_IDS: FitId[] = ['normal', 'oversize'];
export const ZONE_IDS: ZoneId[] = ['front', 'back', 'left_sleeve', 'right_sleeve'];
export const isSleeve = (z: ZoneId) => z === 'left_sleeve' || z === 'right_sleeve';

export const colors: ColorDef[] = colorsJson.colors;
export const colorsProvisional = Boolean(colorsJson.provisional);
export const fonts: FontDef[] = fontsJson.fonts;
export const fontsProvisional = Boolean(fontsJson.provisional);
export const quality = qualityJson as {
  min_dpi: number;
  text_export_dpi: number;
  contrast_min_ratio: number;
  max_texture_px: number;
  preview_width_px: number;
};
export const printTechnique: string = printZonesJson.technique;

export function getGarmentModel(garment: GarmentId, fit: FitId): GarmentModel | null {
  return garments.find((g) => g.id === garment)?.fits[fit] ?? null;
}

export function isGarmentAvailable(garment: GarmentId, fit?: FitId): boolean {
  const g = garments.find((x) => x.id === garment);
  if (!g) return false;
  return fit ? Boolean(g.fits[fit]?.model) : FIT_IDS.some((f) => Boolean(g.fits[f]?.model));
}

export function allModelPaths(): string[] {
  return garments.flatMap((g) => Object.values(g.fits).map((f) => f.model));
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** L'atelier imprime sur toute la surface du vêtement (config/print-zones.json). */
export const fullGarment = Boolean((printZonesJson as { full_garment?: boolean }).full_garment);

export function resolveZone(garment: GarmentId, fit: FitId, zone: ZoneId): ResolvedZone {
  const zones = printZonesJson.zones as Record<string, Record<string, Record<string, unknown>>>;
  const spec = zones[garment]?.[zone] ?? {};
  const surface = getGarmentModel(garment, fit)?.zones[zone].surface_cm ?? { width: 0, height: 0, top: 0 };
  const width = num(spec.width_cm), height = num(spec.height_cm), top = num(spec.top_cm);
  return {
    width: width ?? surface.width,
    height: height ?? surface.height,
    top: top ?? surface.top,
    // L'atelier imprime sur tout le vêtement : la surface du modèle est la vraie zone, rien n'est à confirmer.
    confirmed: fullGarment || (width !== null && height !== null && top !== null),
  };
}

export function colorById(id: string): ColorDef | undefined {
  return colors.find((c) => c.id === id);
}

export function fontById(id: string): FontDef {
  return fonts.find((f) => f.id === id) ?? fonts[0];
}

/** Vêtement affiché mais pas encore proposé : on montre un message « bientôt disponible » au lieu de l'ouvrir. */
export function isComingSoon(garment: GarmentId): boolean {
  return Boolean(garments.find((x) => x.id === garment)?.coming_soon);
}
