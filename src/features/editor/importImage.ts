import type { AssetMeta } from '@/types/design';
import { putAsset } from '@/features/storage/db';
import { hasOpaqueBorder } from '@/lib/quality';
import { loadImage } from '@/features/scene/textures';

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' };
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg';
/** Taille de rendu d'un SVG sans dimensions intrinsèques. */
const SVG_FALLBACK_PX = 1024;

export class UnsupportedFileError extends Error {}

export async function importImageFile(file: File): Promise<AssetMeta> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = Object.values(TYPES).includes(file.type) ? file.type : TYPES[ext];
  if (!type) throw new UnsupportedFileError();
  const blob = file.type === type ? file : new Blob([file], { type });
  const vector = type === 'image/svg+xml';
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    let width = img.naturalWidth, height = img.naturalHeight;
    if (vector && (!width || !height)) {
      width = SVG_FALLBACK_PX;
      height = SVG_FALLBACK_PX;
    }
    const meta: AssetMeta = {
      id: crypto.randomUUID(),
      name: file.name,
      type,
      width,
      height,
      opaque_background: type === 'image/jpeg' || hasOpaqueBorder(img, width, height),
      vector,
    };
    await putAsset({ ...meta, blob });
    return meta;
  } finally {
    URL.revokeObjectURL(url);
  }
}
