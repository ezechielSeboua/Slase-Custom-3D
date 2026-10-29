import { jsPDF } from 'jspdf';
import type { Design, DesignElement, ZoneId } from '@/types/design';
import { colorById, fontById, isSleeve, printTechnique, resolveZone, ZONE_IDS } from '@/lib/config';
import { elementHeightCm, effectiveDpi } from '@/lib/units';
import type { QualityWarning } from '@/lib/quality';
import type { AssetMeta } from '@/types/design';
import { elementPointCm } from '@/features/scene/mapping';
import { placementById } from '@/lib/placements';
import { fr } from '@/i18n/fr';

const t = fr.pdf;
const PAGE_W = 595, PAGE_H = 842, M = 40, IW = PAGE_W - 2 * M;
const PT_PER_CM = 72 / 2.54;

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
  doc.text(pdfText(`${t.title} · ${design.name}`), M, M - 8);
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
  });
  doc.line(M, M + 45, M + IW, M + 45);
}

function schema(doc: jsPDF, design: Design, zone: ZoneId, els: DesignElement[]) {
  const z = resolveZone(design.garment, design.fit, zone);
  const top = 172, boxH = 330, boxW = IW - 140;
  const s = Math.min(boxW / z.width, (boxH - 30) / (z.top + z.height)); // pt par cm
  const ax = M + IW / 2, cy = top + 10;
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
  doc.text(pdfText(isSleeve(zone) ? t.shoulder : t.collar), X(z.width / 2) + 24, cy + 2);
  doc.text(pdfText(isSleeve(zone) ? t.sleeveAxis : t.axis), ax + 4, Y(z.top + z.height) + 20);

  doc.setDrawColor(0);
  doc.setLineWidth(0.9);
  dashed(doc, true, [4, 3]);
  doc.rect(X(-z.width / 2), Y(z.top), z.width * s, z.height * s);
  dashed(doc, false);
  // Cotes de la zone
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

  els.forEach((el, i) => {
    const h = elementHeightCm(el);
    const corners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) =>
      elementPointCm(el.x_cm, el.y_cm, el.rotation_deg, (a * el.width_cm) / 2, (b * h) / 2),
    );
    doc.setDrawColor(0);
    doc.setLineWidth(1.2);
    corners.forEach((c, k) => {
      const d = corners[(k + 1) % 4];
      doc.line(X(c.x), Y(c.y), X(d.x), Y(d.y));
    });
    // Cotes : de l'axe au centre (X), du bas du col au centre (Y).
    doc.setLineWidth(0.4);
    doc.setDrawColor(80);
    if (Math.abs(el.x_cm) * s > 8) arrowLine(doc, ax, Y(el.y_cm), X(el.x_cm), Y(el.y_cm));
    arrowLine(doc, X(el.x_cm), cy, X(el.x_cm), Y(el.y_cm));
    doc.circle(X(el.x_cm), Y(el.y_cm), 1.2, 'F');
    doc.setFontSize(7);
    if (Math.abs(el.x_cm) * s > 8) doc.text(pdfText(`X ${n1(el.x_cm)}`), (ax + X(el.x_cm)) / 2, Y(el.y_cm) - 3, { align: 'center' });
    doc.text(pdfText(`Y ${n1(el.y_cm)}`), X(el.x_cm) + 3, (cy + Y(el.y_cm)) / 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(i + 1), X(el.x_cm) + 4, Y(el.y_cm) + 10);
    doc.setFont('helvetica', 'normal');
  });
  return top + boxH + 20;
}

function table(doc: jsPDF, y: number, els: DesignElement[], assets: Record<string, AssetMeta>, zone: ZoneId) {
  const cols = [18, 38, 70, 92, 30, 30, 30, 30, 28, 30, 70, 49];
  const row = (cells: string[], yy: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(7);
    let x = M;
    cells.forEach((c, i) => {
      const fit = doc.splitTextToSize(pdfText(c), cols[i] - 4)[0] ?? '';
      doc.text(fit, x + 2, yy + 11);
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
    );
    y += 16;
  });
  doc.setFontSize(7);
  doc.setTextColor(90);
  doc.text(pdfText(isSleeve(zone) ? t.sleeveReference : t.reference), M, y + 12);
  doc.setTextColor(0);
  return y + 24;
}

export function buildPdf(design: Design, assets: Record<string, AssetMeta>, warnings: QualityWarning[]): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const date = new Date().toLocaleDateString('fr-FR');
  const zones = ZONE_IDS.filter((z) => design.elements.some((e) => e.zone === z && !e.hidden));
  const list = zones.length ? zones : (['front'] as ZoneId[]);
  list.forEach((zone, p) => {
    if (p > 0) doc.addPage();
    const els = design.elements.filter((e) => e.zone === zone && !e.hidden);
    header(doc, design, zone, p + 1, list.length, date);
    let y = schema(doc, design, zone, els);
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
  });
  const pages = doc.getNumberOfPages();
  for (let k = 1; k <= pages; k++) {
    doc.setPage(k);
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(M, PAGE_H - M - 14, M + IW, PAGE_H - M - 14);
    doc.setFontSize(8);
    doc.text(pdfText(`${fr.previewNotice} · ${date}`), M, PAGE_H - M);
  }
  return doc.output('blob');
}
