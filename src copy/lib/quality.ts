import type { AssetMeta, Design, ZoneId } from '@/types/design';
import { colorById, fontsProvisional, getGarmentModel, quality, resolveZone, ZONE_IDS } from '@/lib/config';
import { effectiveDpi, maxCmAtDpi } from '@/lib/units';
import { placementById } from '@/lib/placements';
import { fr } from '@/i18n/fr';

export type WarningKind = 'resolution' | 'contrast' | 'background' | 'zone' | 'font' | 'scale' | 'placement';

export interface QualityWarning {
  kind: WarningKind;
  elementId?: string;
  zone?: ZoneId;
  message: string;
  /** Largeur conseillée (cm) pour l'action « réduire ». */
  suggestedWidth?: number;
}

/**
 * Gravité : « print » = le rendu imprimé risque d'être raté (à corriger) ;
 * « info » = point à confirmer avec l'atelier, sans action possible dans l'éditeur.
 */
export type WarningSeverity = 'print' | 'info';

const SEVERITY: Record<WarningKind, WarningSeverity> = {
  resolution: 'print',
  background: 'print',
  contrast: 'print',
  placement: 'print',
  zone: 'info',
  scale: 'info',
  font: 'info',
};

export const severityOf = (w: QualityWarning): WarningSeverity => SEVERITY[w.kind];

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function getWarnings(design: Design, assets: Record<string, AssetMeta>): QualityWarning[] {
  const out: QualityWarning[] = [];
  const fabric = colorById(design.color)?.hex;
  for (const el of design.elements) {
    if (el.hidden) continue;
    if (el.kind === 'image') {
      const meta = assets[el.asset_id];
      if (!meta?.vector) {
        const dpi = effectiveDpi(el.source_px[0], el.width_cm);
        if (dpi < quality.min_dpi) {
          // Arrondi vers le bas : la taille conseillée doit elle-même passer le contrôle.
          const max = Math.floor(maxCmAtDpi(el.source_px[0], quality.min_dpi) * 10) / 10;
          out.push({ kind: 'resolution', elementId: el.id, message: fr.warnings.resolution(Math.floor(dpi), max), suggestedWidth: max });
        }
      }
      if (meta?.opaque_background) out.push({ kind: 'background', elementId: el.id, message: fr.warnings.background });
    } else {
      if (fabric && contrastRatio(el.color, fabric) < quality.contrast_min_ratio) {
        out.push({ kind: 'contrast', elementId: el.id, message: fr.warnings.contrast });
      }
      if (fontsProvisional) out.push({ kind: 'font', elementId: el.id, message: fr.warnings.fontProvisional });
    }
    const p = placementById(el.placement);
    if (p && el.width_cm > p.max_width_cm + 0.05) {
      out.push({ kind: 'placement', elementId: el.id, message: fr.warnings.placementTooBig(p.name, p.max_width_cm), suggestedWidth: p.max_width_cm });
    }
  }
  if (design.elements.some((e) => !e.hidden) && getGarmentModel(design.garment, design.fit)?.scale_provisional) {
    out.push({ kind: 'scale', message: fr.warnings.scaleProvisional });
  }
  for (const zone of ZONE_IDS) {
    const used = design.elements.some((e) => e.zone === zone && !e.hidden);
    if (used && !resolveZone(design.garment, design.fit, zone).confirmed) {
      out.push({ kind: 'zone', zone, message: fr.warnings.zoneTbd(fr.zones[zone].toLowerCase()) });
    }
  }
  return out;
}

/** Analyse le bord d'une image : vrai si tous les pixels du bord sont opaques (fond plein). */
export function hasOpaqueBorder(source: CanvasImageSource, width: number, height: number): boolean {
  const size = 128;
  const w = Math.max(1, Math.round(width >= height ? size : (size * width) / height));
  const h = Math.max(1, Math.round(height >= width ? size : (size * height) / width));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const alpha = (x: number, y: number) => data[(y * w + x) * 4 + 3];
  for (let x = 0; x < w; x++) if (alpha(x, 0) < 250 || alpha(x, h - 1) < 250) return false;
  for (let y = 0; y < h; y++) if (alpha(0, y) < 250 || alpha(w - 1, y) < 250) return false;
  return true;
}
