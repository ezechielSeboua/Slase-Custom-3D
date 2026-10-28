import * as THREE from 'three';
import { useEffect, useMemo, useState } from 'react';
import type { TextElement } from '@/types/design';
import { getAsset } from '@/features/storage/db';
import { renderTextCanvas } from '@/lib/text';
import { quality } from '@/lib/config';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

/** Image d'un asset, redimensionnée pour tenir dans max_texture_px. */
async function assetCanvas(id: string): Promise<HTMLCanvasElement | null> {
  const a = await getAsset(id);
  if (!a) return null;
  const url = URL.createObjectURL(a.blob);
  try {
    const img = await loadImage(url);
    const w = a.width, h = a.height;
    const k = Math.min(1, quality.max_texture_px / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * k));
    canvas.height = Math.max(1, Math.round(h * k));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const cache = new Map<string, Promise<THREE.Texture | null>>();

function toTexture(canvas: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function useAssetTexture(assetId: string): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    if (!cache.has(assetId)) cache.set(assetId, assetCanvas(assetId).then((c) => (c ? toTexture(c) : null)));
    cache.get(assetId)!.then((t) => alive && setTex(t));
    return () => {
      alive = false;
    };
  }, [assetId]);
  return tex;
}

export function useTextTexture(el: TextElement): THREE.Texture {
  const { text, font, weight, align, color, aspect } = el;
  const tex = useMemo(() => {
    const max = quality.max_texture_px;
    const width = Math.min(max, max * aspect);
    return toTexture(renderTextCanvas({ text, font, weight, align, color }, width));
  }, [text, font, weight, align, color, aspect]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}
