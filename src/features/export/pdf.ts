import { jsPDF } from 'jspdf';
import type { Design, DesignElement, ZoneId } from '@/types/design';
import { colorById, fontById, isSleeve, printTechnique, resolveZone, ZONE_IDS } from '@/lib/config';
import { elementHeightCm, effectiveDpi } from '@/lib/units';
import { contrastRatio, type QualityWarning } from '@/lib/quality';
import type { AssetMeta } from '@/types/design';
import { elementPointCm } from '@/features/scene/mapping';
import { placementById } from '@/lib/placements';
import { renderTextCanvas } from '@/lib/text';
import { getAsset } from '@/features/storage/db';
import { loadImage } from '@/features/scene/textures';
import { fr } from '@/i18n/fr';

const t = fr.pdf;
const PAGE_W = 595, PAGE_H = 842, M = 40, IW = PAGE_W - 2 * M;
const PT_PER_CM = 72 / 2.54;

// Colonnes du schéma : cotes à gauche, zone, pastilles à droite, puis l'aperçu 3D.
const COTES_W = 50, ZONE_MAX_W = 150;
const PREVIEW_X = M + 365, PREVIEW_W = M + IW - PREVIEW_X, PREVIEW_MAX_H = 230;
/** Écart vertical minimal entre deux pastilles, en points. */
const CALLOUT_GAP = 32;
/** Cadre de notes : hauteur minimale pour l'afficher, écart entre les lignes d'écriture (points). */
const NOTES_MIN_H = 90, NOTES_LINE_GAP = 22;
/** Barre d'échelle du schéma : longueur réelle et nombre de cases alternées. */
const SCALE_BAR_CM = 10, SCALE_BAR_SEGMENTS = 5;
/** Rendu des éléments dans le schéma : assez net à l'œil, sans alourdir le PDF. */
const ART_PX_PER_CM = 24, ART_MAX_PX = 1200;

/** Contenu d'un élément, déjà tourné, avec sa boîte englobante en cm. */
interface Art { data: string; w: number; h: number }
/** Image prête pour le PDF, avec ses dimensions en pixels. */
interface Picture { data: string; w: number; h: number }

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/**
 * Dessine l'élément tel qu'il sera imprimé (image d'origine ou texte dans sa police et sa couleur), tourné,
 * sur fond transparent : l'atelier voit ce qu'il imprime, pas seulement un cadre. La couleur du tissu est
 * peinte une fois sous toute la zone, pour qu'un élément ne masque pas ceux qu'il recouvre.
 */
async function elementArt(el: DesignElement): Promise<Art | null> {
  const h = elementHeightCm(el);
  const rad = (el.rotation_deg * Math.PI) / 180;
  const bw = Math.abs(el.width_cm * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
  const bh = Math.abs(el.width_cm * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
  const k = Math.min(ART_PX_PER_CM, ART_MAX_PX / Math.max(bw, bh));
  let url: string | null = null;
  try {
    let source: CanvasImageSource;
    if (el.kind === 'text') {
      source = renderTextCanvas(el, Math.max(1, Math.round(el.width_cm * k)));
    } else {
      const a = await getAsset(el.asset_id);
      if (!a) return null;
      url = URL.createObjectURL(a.blob);
      source = await loadImage(url);
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bw * k));
    canvas.height = Math.max(1, Math.round(bh * k));
    const ctx = canvas.getContext('2d')!;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad); // y vers le bas : un angle positif tourne dans le sens horaire, comme dans l'éditeur
    const w = el.width_cm * k, hh = h * k;
    ctx.drawImage(source, -w / 2, -hh / 2, w, hh);
    return { data: canvas.toDataURL('image/png'), w: bw, h: bh };
  } catch {
    return null; // l'élément reste dessiné par son cadre
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

async function toPicture(blob: Blob): Promise<Picture | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const pic = { data: await blobToDataUrl(blob), w: bmp.width, h: bmp.height };
    bmp.close();
    return pic;
  } catch {
    return null;
  }
}

/** Nom court d'un élément pour sa pastille : fichier source, ou première ligne du texte. */
const shortLabel = (el: DesignElement) => (el.kind === 'image' ? el.asset : el.text.split('\n')[0] || fr.editor.kindText);

/** Les polices standard du PDF ne couvrent que le jeu WinAnsi : on remplace la typographie fine. */
const pdfText = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/…/g, '...').replace(/[–—]/g, '-').replace(/ /g, ' ');
const n1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');

function arrowLine(doc: jsPDF, x1: number, y1: number, x2: number, y2: number) {
  doc.line(x1, y1, x2, y2);
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 8) return;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len, a = 4, b = 1.6;
  doc.triangle(x2, y2, x2 - ux * a - uy * b, y2 - uy * a + ux * b, x2 - ux * a + uy * b, y2 - uy * a - ux * b, 'F');
  doc.triangle(x1, y1, x1 + ux * a - uy * b, y1 + uy * a + ux * b, x1 + ux * a + uy * b, y1 + uy * a - ux * b, 'F');
}

function dashed(doc: jsPDF, on: boolean, pattern: number[] = [3, 2]) {
  doc.setLineDashPattern(on ? pattern : [], 0);
}

function header(doc: jsPDF, design: Design, zone: ZoneId, page: number, pages: number, date: string) {
  const color = colorById(design.color);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  // Un nom long s'arrête avant le nom de l'app, à droite.
  const title = pdfText(`${t.title} · ${design.name}`);
  const fitted = doc.splitTextToSize(title, IW - 90) as string[];
  doc.text(fitted.length > 1 ? `${fitted[0].replace(/\s+\S*$/, '')}...` : title, M, M - 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(pdfText(fr.appName), M + IW, M - 8, { align: 'right' });
  doc.setTextColor(0);
  const cells: [string, string][] = [
    [t.garment, fr.garments[design.garment]],
    [t.fit, fr.fits[design.fit]],
    [t.color, color ? `${color.name} · ${color.hex}` : design.color],
    [t.zone, fr.zones[zone]],
    [t.date, date],
    [t.page, `${page} / ${pages}`],
    [t.technique, printTechnique],
    ['', fr.previewNotice],
  ];
  doc.setLineWidth(0.8);
  doc.rect(M, M, IW, 90);
  const cw = IW / 4;
  cells.forEach(([k, v], i) => {
    const x = M + (i % 4) * cw, y = M + Math.floor(i / 4) * 45;
    if (i % 4) doc.line(x, y, x, y + 45);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(90);
    if (k) doc.text(pdfText(k.toUpperCase()), x + 6, y + 13);
    doc.setTextColor(0);
    doc.setFontSize(k ? 10 : 7.5);
    doc.text(doc.splitTextToSize(pdfText(v), cw - 12), x + 6, y + (k ? 28 : 15));
    // Couleur du tissu : un échantillon, en plus du nom et du code.
    if (i === 2 && color) {
      doc.setFillColor(color.hex);
      doc.setDrawColor(0);
      doc.setLineWidth(0.4);
      doc.rect(x + cw - 20, y + 19, 12, 12, 'FD');
    }
  });
  doc.line(M, M + 45, M + IW, M + 45);
}

function schema(doc: jsPDF, design: Design, zone: ZoneId, els: DesignElement[], art: Map<string, Art>, preview: Picture | null) {
  const z = resolveZone(design.garment, design.fit, zone);
  const top = 172, boxH = 330;
  const s = Math.min(ZONE_MAX_W / z.width, (boxH - 30) / (z.top + z.height)); // pt par cm
  const ax = M + COTES_W + (z.width * s) / 2, cy = top + 10;
  const X = (cm: number) => ax + cm * s, Y = (cm: number) => cy + cm * s;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(pdfText(`${t.schema.toUpperCase()} · ${t.scale.toUpperCase()} 1:${Math.round(PT_PER_CM / s)}`), M, top - 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setDrawColor(120);
  doc.setLineWidth(0.5);
  dashed(doc, true, [10, 2, 2, 2]);
  doc.line(X(-z.width / 2) - 20, cy, X(z.width / 2) + 20, cy);
  doc.line(ax, cy - 10, ax, Y(z.top + z.height) + 10);
  dashed(doc, false);
  // Au-dessus de la ligne, à gauche : la droite de la zone est réservée aux pastilles.
  doc.text(pdfText(isSleeve(zone) ? t.shoulder : t.collar), X(-z.width / 2) - 20, cy - 4);
  doc.text(pdfText(isSleeve(zone) ? t.sleeveAxis : t.axis), ax + 4, Y(z.top + z.height) + 20);

  // La zone prend la couleur du tissu ; sur un tissu foncé, les traits posés dessus passent en gris clair.
  const fabric = colorById(design.color)?.hex ?? '#ffffff';
  const dark = contrastRatio(fabric, '#ffffff') > contrastRatio(fabric, '#000000');
  const ink = dark ? 215 : 0, cote = dark ? 190 : 80;
  doc.setFillColor(fabric);
  doc.rect(X(-z.width / 2), Y(z.top), z.width * s, z.height * s, 'F');
  doc.setDrawColor(ink);
  doc.setLineWidth(0.9);
  dashed(doc, true, [4, 3]);
  doc.rect(X(-z.width / 2), Y(z.top), z.width * s, z.height * s);
  dashed(doc, false);
  doc.setDrawColor(0);
  // Contenu réel de chaque élément, à l'échelle, sous les cadres et les cotes.
  els.forEach((el) => {
    const a = art.get(el.id);
    if (a) doc.addImage(a.data, 'PNG', X(el.x_cm - a.w / 2), Y(el.y_cm - a.h / 2), a.w * s, a.h * s);
  });
  // Cotes de la zone (pointes des flèches en noir : le remplissage courant est la couleur du tissu).
  doc.setFillColor(0, 0, 0);
  doc.setLineWidth(0.5);
  const conf = z.confirmed ? '' : ` (${fr.editor.zoneToConfirm.toLowerCase()})`;
  const zy = Y(z.top + z.height) + 30;
  arrowLine(doc, X(-z.width / 2), zy, X(z.width / 2), zy);
  doc.text(pdfText(`${t.zoneDims} ${n1(z.width)} cm${conf}`), ax, zy - 3, { align: 'center' });
  const zx = X(-z.width / 2) - 18;
  arrowLine(doc, zx, Y(z.top), zx, Y(z.top + z.height));
  doc.text(pdfText(`${n1(z.height)} cm`), zx - 3, Y(z.top + z.height / 2), { align: 'right' });
  if (z.top > 0) {
    arrowLine(doc, zx, cy, zx, Y(z.top));
    doc.text(pdfText(`${n1(z.top)} cm`), zx - 3, (cy + Y(z.top)) / 2 + 2, { align: 'right' });
  }

  // Deux éléments sur le même axe vertical partagent leur cote Y : sa valeur, écrite à mi-hauteur,
  // tomberait sur l'autre élément. Elle n'est alors écrite que dans la pastille.
  const sharesAxis = (el: DesignElement) => els.some((o) => o !== el && Math.abs(o.x_cm - el.x_cm) < 2);
  els.forEach((el) => {
    const h = elementHeightCm(el);
    const corners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) =>
      elementPointCm(el.x_cm, el.y_cm, el.rotation_deg, (a * el.width_cm) / 2, (b * h) / 2),
    );
    doc.setDrawColor(ink);
    doc.setLineWidth(1.2);
    corners.forEach((c, k) => {
      const d = corners[(k + 1) % 4];
      doc.line(X(c.x), Y(c.y), X(d.x), Y(d.y));
    });
    // Cotes : de l'axe au centre (X), du bas du col au centre (Y).
    doc.setLineWidth(0.4);
    doc.setDrawColor(cote);
    doc.setFillColor(cote, cote, cote);
    doc.setTextColor(ink);
    if (Math.abs(el.x_cm) * s > 8) arrowLine(doc, ax, Y(el.y_cm), X(el.x_cm), Y(el.y_cm));
    arrowLine(doc, X(el.x_cm), cy, X(el.x_cm), Y(el.y_cm));
    doc.circle(X(el.x_cm), Y(el.y_cm), 1.2, 'F');
    doc.setFontSize(7);
    if (Math.abs(el.x_cm) * s > 8) doc.text(pdfText(`X ${n1(el.x_cm)}`), (ax + X(el.x_cm)) / 2, Y(el.y_cm) - 3, { align: 'center' });
    if (!sharesAxis(el)) doc.text(pdfText(`Y ${n1(el.y_cm)}`), X(el.x_cm) + 3, (cy + Y(el.y_cm)) / 2);
    doc.setTextColor(0);
  });

  // Pastilles numérotées hors de la zone, reliées à chaque élément : lisibles même quand des éléments
  // se chevauchent. Chacune porte les dimensions de l'élément (largeur × hauteur, rotation).
  const px = X(z.width / 2) + 22;
  let last = -Infinity;
  els
    .map((el, i) => ({ el, i }))
    .sort((a, b) => a.el.y_cm - b.el.y_cm || a.i - b.i)
    .forEach(({ el, i }) => {
      const py = Math.max(Y(el.y_cm), last + CALLOUT_GAP);
      last = py;
      doc.setDrawColor(140);
      doc.setLineWidth(0.4);
      doc.line(X(el.x_cm), Y(el.y_cm), px - 7, py);
      doc.setDrawColor(0);
      doc.setFillColor(255, 255, 255);
      doc.setLineWidth(0.8);
      doc.circle(px, py, 7, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(String(i + 1), px, py + 2.8, { align: 'center' });
      doc.setFontSize(7);
      const name = (doc.splitTextToSize(pdfText(shortLabel(el)), PREVIEW_X - px - 20) as string[])[0] ?? '';
      doc.text(name, px + 11, py - 1);
      doc.setFont('helvetica', 'normal');
      doc.text(pdfText(`${n1(el.width_cm)} × ${n1(elementHeightCm(el))} cm · ${n1(el.rotation_deg)}°`), px + 11, py + 7);
      doc.setTextColor(90);
      doc.text(pdfText(`X ${n1(el.x_cm)} · Y ${n1(el.y_cm)} cm`), px + 11, py + 15);
      doc.setTextColor(0);
    });

  // Aperçu 3D du côté concerné et échantillon du tissu.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(pdfText(`${t.preview.toUpperCase()} · ${fr.zones[zone].toUpperCase()}`), PREVIEW_X, top - 14);
  doc.setFont('helvetica', 'normal');
  let py = top;
  if (preview) {
    const k = Math.min(PREVIEW_W / preview.w, PREVIEW_MAX_H / preview.h);
    doc.addImage(preview.data, 'PNG', PREVIEW_X, py, preview.w * k, preview.h * k);
    doc.setDrawColor(170);
    doc.setLineWidth(0.4);
    doc.rect(PREVIEW_X, py, preview.w * k, preview.h * k);
    py += preview.h * k + 14;
  }
  const color = colorById(design.color);
  if (color) {
    doc.setFillColor(color.hex);
    doc.setDrawColor(0);
    doc.setLineWidth(0.4);
    doc.rect(PREVIEW_X, py, 14, 14, 'FD');
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(pdfText(`${t.fabric} : ${color.name} · ${color.hex}`), PREVIEW_W - 22), PREVIEW_X + 20, py + 6);
    doc.setFontSize(7);
    doc.setTextColor(90);
    doc.text(doc.splitTextToSize(pdfText(fr.previewNotice), PREVIEW_W), PREVIEW_X, py + 30);
    doc.setTextColor(0);
    py += 56;
  }

  // Encombrement total : le rectangle qui contient tous les éléments de la zone (taille de l'écran ou du
  // transfert). Tracé en pointillés fins sur le schéma, chiffré dans la colonne de droite.
  if (els.length) {
    const pts = els.flatMap((el) => {
      const h = elementHeightCm(el);
      return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) =>
        elementPointCm(el.x_cm, el.y_cm, el.rotation_deg, (a * el.width_cm) / 2, (b * h) / 2),
      );
    });
    const x0 = Math.min(...pts.map((q) => q.x)), x1 = Math.max(...pts.map((q) => q.x));
    const y0 = Math.min(...pts.map((q) => q.y)), y1 = Math.max(...pts.map((q) => q.y));
    doc.setDrawColor(cote);
    doc.setLineWidth(0.4);
    dashed(doc, true, [1, 1.5]);
    doc.rect(X(x0) - 2, Y(y0) - 2, (x1 - x0) * s + 4, (y1 - y0) * s + 4);
    dashed(doc, false);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(pdfText(t.footprint.toUpperCase()), PREVIEW_X, py);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(pdfText(`${n1(x1 - x0)} × ${n1(y1 - y0)} cm`), PREVIEW_X, py + 13);
    doc.setFontSize(7);
    doc.setTextColor(90);
    const range = doc.splitTextToSize(pdfText(t.footprintRange(n1(y0), n1(y1))), PREVIEW_W) as string[];
    doc.text(range, PREVIEW_X, py + 23);
    doc.setTextColor(0);
    py += 32 + range.length * 8;
  }

  // Barre d'échelle : permet de mesurer à la règle même si la fiche est imprimée à une autre taille.
  const barCm = SCALE_BAR_CM, step = barCm / SCALE_BAR_SEGMENTS;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(pdfText(`${t.scale.toUpperCase()} 1:${Math.round(PT_PER_CM / s)}`), PREVIEW_X, py);
  doc.setFont('helvetica', 'normal');
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  for (let k = 0; k < SCALE_BAR_SEGMENTS; k++) {
    if (k % 2) doc.setFillColor(255, 255, 255);
    else doc.setFillColor(0, 0, 0);
    doc.rect(PREVIEW_X + k * step * s, py + 6, step * s, 4, 'FD');
  }
  doc.text('0', PREVIEW_X, py + 18, { align: 'center' });
  doc.text(pdfText(`${barCm} cm`), PREVIEW_X + barCm * s, py + 18, { align: 'center' });
  return top + boxH + 20;
}

/**
 * Cadre « Notes de l'atelier / validation » dans le bas de page restant : lignes pour écrire à la main,
 * puis bon à tirer, nom et signature. Omis s'il reste trop peu de place (la page n'est pas allongée pour lui).
 */
function notesBox(doc: jsPDF, y: number) {
  const top = y + 14, bottom = PAGE_H - M - 26;
  if (bottom - top < NOTES_MIN_H) return;
  doc.setDrawColor(0);
  doc.setLineWidth(0.8);
  doc.rect(M, top, IW, bottom - top);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(pdfText(t.notes.toUpperCase()), M + 8, top + 16);
  doc.setFont('helvetica', 'normal');
  // Ligne de validation en bas du cadre, lignes d'écriture au-dessus.
  const signY = bottom - 22;
  doc.setDrawColor(190);
  doc.setLineWidth(0.4);
  for (let ly = top + 38; ly < signY - 14; ly += NOTES_LINE_GAP) doc.line(M + 8, ly, M + IW - 8, ly);
  doc.setDrawColor(0);
  doc.line(M, signY - 12, M + IW, signY - 12);
  const cw = IW / t.notesFields.length;
  doc.setFontSize(7);
  doc.setTextColor(90);
  t.notesFields.forEach((label, i) => {
    const x = M + i * cw;
    if (i) doc.line(x, signY - 12, x, bottom);
    doc.text(pdfText(label.toUpperCase()), x + 8, signY);
  });
  doc.setTextColor(0);
}

function table(doc: jsPDF, y: number, els: DesignElement[], assets: Record<string, AssetMeta>, zone: ZoneId) {
  const cols = [18, 38, 70, 92, 30, 30, 30, 30, 28, 30, 70, 49];
  // `swatch` : couleur du texte, montrée en échantillon devant son code (dernière colonne).
  const row = (cells: string[], yy: number, bold = false, swatch?: string) => {
    // Ligne de titre sur fond gris clair, pour la distinguer des lignes d'éléments.
    if (bold) {
      doc.setFillColor(236, 237, 239);
      doc.rect(M, yy, IW, 16, 'F');
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(7);
    let x = M;
    cells.forEach((c, i) => {
      const last = i === cells.length - 1;
      const pad = last && swatch ? 12 : 2;
      if (last && swatch) {
        doc.setFillColor(swatch);
        doc.setDrawColor(0);
        doc.setLineWidth(0.4);
        doc.rect(x + 2, yy + 5, 7, 7, 'FD');
      }
      const fit = doc.splitTextToSize(pdfText(c), cols[i] - pad - 2)[0] ?? '';
      doc.text(fit, x + pad, yy + 11);
      x += cols[i];
    });
    doc.setDrawColor(170);
    doc.setLineWidth(0.4);
    doc.line(M, yy + 16, M + IW, yy + 16);
  };
  row(t.table, y, true);
  y += 16;
  els.forEach((el, i) => {
    if (y > PAGE_H - M - 60) {
      doc.addPage();
      y = M;
    }
    const h = elementHeightCm(el);
    const meta = el.kind === 'image' ? assets[el.asset_id] : undefined;
    const dpi = el.kind === 'image' ? (meta?.vector ? 'vect.' : String(Math.floor(effectiveDpi(el.source_px[0], el.width_cm)))) : '-';
    row(
      [
        String(i + 1),
        el.kind === 'image' ? fr.editor.kindImage : fr.editor.kindText,
        placementById(el.placement)?.name ?? fr.editor.placementFree,
        el.kind === 'image' ? el.asset : el.text.replace(/\n/g, ' / '),
        n1(el.x_cm), n1(el.y_cm), n1(el.width_cm), n1(h), n1(el.rotation_deg), dpi,
        el.kind === 'text' ? `${fontById(el.font).name} ${el.weight}` : '-',
        el.kind === 'text' ? el.color : '-',
      ],
      y,
      false,
      el.kind === 'text' ? el.color : undefined,
    );
    y += 16;
  });
  doc.setFontSize(7);
  doc.setTextColor(90);
  doc.text(pdfText(isSleeve(zone) ? t.sleeveReference : t.reference), M, y + 12);
  doc.setTextColor(0);
  return y + 24;
}

/**
 * Fiche de fabrication, une page par zone imprimée.
 * `previews` : rendu 3D (fond clair) du côté de chaque zone, repris des aperçus de l'export.
 */
export async function buildPdf(
  design: Design,
  assets: Record<string, AssetMeta>,
  warnings: QualityWarning[],
  previews: Partial<Record<ZoneId, Blob>> = {},
): Promise<Blob> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const date = new Date().toLocaleDateString('fr-FR');
  const zones = ZONE_IDS.filter((z) => design.elements.some((e) => e.zone === z && !e.hidden));
  const list = zones.length ? zones : (['front'] as ZoneId[]);
  const art = new Map<string, Art>();
  for (const el of design.elements.filter((e) => !e.hidden)) {
    const a = await elementArt(el);
    if (a) art.set(el.id, a);
  }
  const pictures = new Map<ZoneId, Picture | null>();
  for (const zone of list) {
    const blob = previews[zone];
    pictures.set(zone, blob ? await toPicture(blob) : null);
  }

  list.forEach((zone, p) => {
    if (p > 0) doc.addPage();
    const els = design.elements.filter((e) => e.zone === zone && !e.hidden);
    header(doc, design, zone, p + 1, list.length, date);
    let y = schema(doc, design, zone, els, art, pictures.get(zone) ?? null);
    y = table(doc, y, els, assets, zone);
    const ids = new Set(els.map((e) => e.id));
    const ws = warnings.filter((w) => (w.elementId ? ids.has(w.elementId) : !w.zone || w.zone === zone));
    if (y > PAGE_H - M - 80) {
      doc.addPage();
      y = M;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(pdfText(t.warnings.toUpperCase()), M, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    y += 22;
    if (!ws.length) doc.text(t.none, M, y);
    ws.forEach((w) => {
      const idx = els.findIndex((e) => e.id === w.elementId);
      const lines = doc.splitTextToSize(pdfText(`${idx >= 0 ? `#${idx + 1} · ` : ''}${w.message}`), IW);
      if (y > PAGE_H - M - 30) {
        doc.addPage();
        y = M;
      }
      doc.text(lines, M, y);
      y += lines.length * 10 + 2;
    });
    if (!ws.length) y += 12;
    notesBox(doc, y);
  });
  const pages = doc.getNumberOfPages();
  for (let k = 1; k <= pages; k++) {
    doc.setPage(k);
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(M, PAGE_H - M - 14, M + IW, PAGE_H - M - 14);
    // Référence de la création : relie une fiche imprimée à son .json et à son ZIP.
    doc.setFontSize(8);
    const ref = doc.splitTextToSize(pdfText(`${t.ref(design.id.slice(0, 8))} · ${date} · ${design.name}`), IW - 70) as string[];
    doc.text(ref[0] ?? '', M, PAGE_H - M);
    doc.text(pdfText(t.pageOf(k, pages)), M + IW, PAGE_H - M, { align: 'right' });
  }
  return doc.output('blob');
}
