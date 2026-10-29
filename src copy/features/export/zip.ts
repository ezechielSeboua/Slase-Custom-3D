import JSZip from 'jszip';
import type { AssetMeta, Design, ZoneId } from '@/types/design';
import { quality } from '@/lib/config';
import { getWarnings } from '@/lib/quality';
import { renderTextCanvas } from '@/lib/text';
import { cmToPx } from '@/lib/units';
import { getAsset } from '@/features/storage/db';
import { designFileBlob, slug } from '@/features/storage/json';
import { captureRef, type ViewId } from '@/features/scene/sceneStore';
import { buildPdf } from '@/features/export/pdf';
import { buildGlb } from '@/features/export/glb';

export type ExportStep = 'previews' | 'pdf' | 'sources' | 'zip';

const VIEWS: [ViewId, string][] = [['front', 'face'], ['back', 'dos'], ['threeQuarter', 'trois-quarts']];
// Les manches n'ont un aperçu que si quelque chose y est imprimé.
const SLEEVE_VIEWS: [ViewId, string, ZoneId][] = [
  ['leftSleeve', 'manche-gauche', 'left_sleeve'],
  ['rightSleeve', 'manche-droite', 'right_sleeve'],
];
const pad = (i: number) => String(i + 1).padStart(2, '0');

const canvasBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));

export async function buildExportZip(
  design: Design,
  assets: Record<string, AssetMeta>,
  onStep: (s: ExportStep) => void,
): Promise<{ blob: Blob; filename: string }> {
  const zip = new JSZip();
  const base = slug(design.name);
  const capture = captureRef.current;
  if (!capture) throw new Error('scene');

  onStep('previews');
  const zoneUsed = (zone: ZoneId) => design.elements.some((e) => e.zone === zone && !e.hidden);
  const views = [...VIEWS, ...SLEEVE_VIEWS.filter(([, , zone]) => zoneUsed(zone)).map(([v, n]) => [v, n] as [ViewId, string])];
  for (const [view, name] of views) {
    zip.file(`apercus/${name}-fond-clair.png`, await capture(view, 'light', quality.preview_width_px));
    zip.file(`apercus/${name}-fond-transparent.png`, await capture(view, 'transparent', quality.preview_width_px));
  }

  onStep('pdf');
  zip.file('fiche-fabrication.pdf', buildPdf(design, assets, getWarnings(design, assets)));

  onStep('sources');
  const used = design.elements.filter((e) => !e.hidden);
  for (const [i, el] of used.entries()) {
    if (el.kind === 'image') {
      const a = await getAsset(el.asset_id);
      if (a) zip.file(`sources/${pad(i)}-${el.asset}`, a.blob);
    } else {
      const widthPx = Math.round(cmToPx(el.width_cm, quality.text_export_dpi));
      zip.file(`sources/${pad(i)}-texte-${slug(el.text).slice(0, 40)}.png`, await canvasBlob(renderTextCanvas(el, widthPx)));
    }
  }
  zip.file(`${base}.json`, await designFileBlob(design));
  const glb = await buildGlb(design);
  zip.file(glb.filename, glb.blob);

  onStep('zip');
  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, filename: `${base}-atelier.zip` };
}
