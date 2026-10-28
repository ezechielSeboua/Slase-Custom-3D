import type { TextElement } from '@/types/design';
import { fontById } from '@/lib/config';

const BASE_PX = 160;
const LINE = 1.2;
const PAD = 0.12;

type TextStyle = Pick<TextElement, 'text' | 'font' | 'weight' | 'align' | 'color'>;

function layout(el: TextStyle) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `${el.weight} ${BASE_PX}px ${fontById(el.font).family}`;
  ctx.font = font;
  const lines = (el.text || ' ').split('\n');
  const widths = lines.map((l) => ctx.measureText(l || ' ').width);
  const pad = BASE_PX * PAD;
  const w = Math.max(...widths) + pad * 2;
  const h = lines.length * BASE_PX * LINE + pad * 2;
  return { font, lines, widths, pad, w, h };
}

export function measureTextAspect(el: TextStyle): number {
  const { w, h } = layout(el);
  return Math.round((w / h) * 10000) / 10000;
}

/** Dessine le texte sur fond transparent, à `widthPx` pixels de large. */
export function renderTextCanvas(el: TextStyle, widthPx: number): HTMLCanvasElement {
  const { font, lines, widths, pad, w, h } = layout(el);
  const scale = widthPx / w;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.font = font;
  ctx.fillStyle = el.color;
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    const x = el.align === 'left' ? pad : el.align === 'right' ? w - pad - widths[i] : (w - widths[i]) / 2;
    ctx.fillText(line, x, pad + (i + 0.5) * BASE_PX * LINE);
  });
  return canvas;
}
