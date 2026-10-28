import type { AssetRecord, Design, DesignElement } from '@/types/design';
import { getAsset, putAsset, putDesign } from '@/features/storage/db';
import { GARMENT_IDS, FIT_IDS, ZONE_IDS } from '@/lib/config';

export const FORMAT = 'configurateur-3d';
export const FORMAT_VERSION = 1;

/** Fichier .json d'une création : la création telle quelle, plus ses images encodées en base64. */
export interface DesignFile {
  format: typeof FORMAT;
  version: number;
  design: Design;
  assets: (Omit<AssetRecord, 'blob'> & { data: string })[];
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

export async function buildDesignFile(design: Design): Promise<DesignFile> {
  const ids = [...new Set(design.elements.flatMap((e) => (e.kind === 'image' ? [e.asset_id] : [])))];
  const assets: DesignFile['assets'] = [];
  for (const id of ids) {
    const a = await getAsset(id);
    if (!a) continue;
    const { blob, ...meta } = a;
    assets.push({ ...meta, data: await blobToDataUrl(blob) });
  }
  return { format: FORMAT, version: FORMAT_VERSION, design, assets };
}

export async function designFileBlob(design: Design): Promise<Blob> {
  return new Blob([JSON.stringify(await buildDesignFile(design), null, 2)], { type: 'application/json' });
}

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

function validElement(e: DesignElement): boolean {
  if (!e || typeof e.id !== 'string' || !ZONE_IDS.includes(e.zone)) return false;
  if (![e.x_cm, e.y_cm, e.width_cm, e.rotation_deg].every(isNum)) return false;
  if (e.kind === 'image') return typeof e.asset_id === 'string' && Array.isArray(e.source_px);
  if (e.kind === 'text') return typeof e.text === 'string' && typeof e.color === 'string' && isNum(e.aspect);
  return false;
}

export function parseDesignFile(text: string): DesignFile {
  const f = JSON.parse(text) as DesignFile;
  const d = f?.design;
  const ok =
    f?.format === FORMAT &&
    d && typeof d.id === 'string' && typeof d.name === 'string' &&
    GARMENT_IDS.includes(d.garment) && FIT_IDS.includes(d.fit) &&
    Array.isArray(d.elements) && d.elements.every(validElement) && Array.isArray(f.assets);
  if (!ok) throw new Error('invalid');
  return f;
}

/** Importe une création. Si son id existe déjà, elle remplace la version enregistrée (même création). */
export async function importDesignFile(text: string): Promise<Design> {
  const f = parseDesignFile(text);
  for (const a of f.assets) {
    const { data, ...meta } = a;
    await putAsset({ ...meta, blob: await dataUrlToBlob(data) });
  }
  await putDesign(f.design);
  return f.design;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'creation'
  );
}
