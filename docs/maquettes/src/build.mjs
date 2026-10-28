// Génère les feuilles HTML et les exports de tokens à partir de tokens.json.
// Usage : node docs/maquettes/src/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'));
const GROUPS = ['space', 'border', 'radius', 'size', 'layout'];
const flat = {};
for (const g of GROUPS) Object.assign(flat, tokens[g]);
Object.assign(flat, tokens.pdf);

function ev(k) {
  const v = flat[k];
  if (typeof v === 'number') return v;
  const expr = v.replace(/[A-Z][A-Z0-9_]*/g, (m) => {
    if (!(m in flat)) throw new Error(`Token inconnu : ${m}`);
    return `(${ev(m)})`;
  });
  return Function(`return ${expr}`)();
}
const T = Object.fromEntries(Object.keys(flat).map((k) => [k, ev(k)]));

// ---------- primitives SVG ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const ln = (x1, y1, x2, y2, c = 'o2') => `<line class="${c}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const rect = (x, y, w, h, c = 'o', rx = 0) => `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
const txt = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" font-size="${o.sz || 10}" text-anchor="${o.a || 'start'}"${o.cap === false ? '' : ' class="cap"'}>${esc(s)}</text>`;
const mono = (x, y, s, o = {}) => txt(x, y, s, { ...o, cap: false });
const slot = (x, y, w, h, label = '', rx = 0, sz = 9) =>
  rect(x, y, w, h, 'slot', rx) + (label ? txt(x + w / 2, y + h / 2 + sz / 2.8, label, { a: 'middle', sz }) : '');
const ph = (x, y, w, h, label = '', rx = 0) =>
  rect(x, y, w, h, 'ph', rx) + ln(x, y, x + w, y + h, 'ph') + ln(x + w, y, x, y + h, 'ph') +
  (label ? txt(x + w / 2, y + h / 2 + 3, label, { a: 'middle', sz: 9 }) : '');
const hatch = (x, y, w, h, rx = 0) => `<rect class="hatchf" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
const call = (cx, cy, r, L) =>
  `<circle class="call" cx="${cx}" cy="${cy}" r="${r}"/>` + txt(cx + r * 0.75, cy - r * 0.75, L, { sz: 12 });
const btn = (x, y, w, label, c = 'o') =>
  rect(x, y, w, T.H_BTN, c, T.R_CTL) + txt(x + w / 2, y + 26, label, { a: 'middle', sz: 10 });
const ibtn = (x, y, glyph, c = 'o2') => rect(x, y, 44, 44, c, T.R_CTL) + mono(x + 22, y + 27, glyph, { a: 'middle', sz: 14 });
function seg(x, y, w, labels, sel = 0) {
  const n = labels.length, pw = (w - 2 * T.P_SEG) / n;
  let s = rect(x, y, w, T.H_SEG, 'o2', T.R_CTL);
  labels.forEach((l, i) => {
    const cx = x + T.P_SEG + i * pw;
    if (i === sel) s += rect(cx, y + T.P_SEG, pw, T.H_SEG - 2 * T.P_SEG, 'o', T.R_SEG_IN);
    s += txt(cx + pw / 2, y + 26, l, { a: 'middle', sz: 9 });
  });
  return s;
}
const fld = (x, y, w, label, unit = 'CM', c = 'o2') =>
  rect(x, y, w, T.H_FIELD, c, T.R_CTL) + txt(x + 8, y + 14, label, { sz: 8 }) +
  mono(x + 8, y + 34, '0,0', { sz: 11 }) + txt(x + w - 8, y + 34, unit, { a: 'end', sz: 9 });
const wrn = (x, y, w, label = 'MESSAGE · HUG') =>
  rect(x, y, w, 56, 'o2', T.R_CTL) + `<path class="o2" d="M${x + 12},${y + 36} L${x + 22},${y + 18} L${x + 32},${y + 36} Z"/>` +
  slot(x + 44, y + 12, w - 56, 32, label);
const sw = (x, y, sel = false) =>
  `<circle class="o2" cx="${x + 22}" cy="${y + 22}" r="20"/>` + (sel ? `<circle class="o" cx="${x + 22}" cy="${y + 22}" r="22"/>` : '');
const cen = (x1, y1, x2, y2) => ln(x1, y1, x2, y2, 'cen');

function dimH(x1, x2, y, label, o = {}) {
  let s = '';
  if (o.e !== undefined) {
    const d = y > o.e ? 4 : -4;
    s += ln(x1, o.e, x1, y + d, 'ext') + ln(x2, o.e, x2, y + d, 'ext');
  }
  s += `<line class="dim" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" marker-start="url(#arr)" marker-end="url(#arr)"/>`;
  return s + mono((x1 + x2) / 2, y + (o.below ? 13 : -4), label, { a: 'middle', sz: o.sz || 10 });
}
function dimV(y1, y2, x, label, o = {}) {
  let s = '';
  if (o.e !== undefined) {
    const d = x > o.e ? 4 : -4;
    s += ln(o.e, y1, x + d, y1, 'ext') + ln(o.e, y2, x + d, y2, 'ext');
  }
  s += `<line class="dim" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" marker-start="url(#arr)" marker-end="url(#arr)"/>`;
  const left = o.side === 'l';
  return s + mono(x + (left ? -6 : 6), (y1 + y2) / 2 + 3.5, label, { a: left ? 'end' : 'start', sz: o.sz || 10 });
}
const frameSvg = (vbW, vbH, fx, fy, body, minW) =>
  `<svg viewBox="0 0 ${vbW} ${vbH}" style="min-width:${minW}px${vbW < 720 ? ';max-width:640px;margin:0 auto' : ''}" role="img"><g transform="translate(${fx},${fy})">${body}</g></svg>`;

// ---------- éléments récurrents ----------
const tee = (s, cx, top) => {
  const p = (x, y) => `${cx + x * s},${top + y * s}`;
  return `<path class="o fill" d="M${p(-30, 0)} Q${p(0, 25)} ${p(30, 0)} L${p(120, 20)} L${p(200, 100)} L${p(160, 140)} L${p(100, 110)} L${p(100, 480)} L${p(-100, 480)} L${p(-100, 110)} L${p(-160, 140)} L${p(-200, 100)} L${p(-120, 20)} Z"/>`;
};
const BADGE = 'APERÇU INDICATIF, LES COULEURS IMPRIMÉES PEUVENT VARIER';

// ---------- page ----------
const SHEETS = [
  ['index.html', 'Sommaire'],
  ['flw-001.html', 'APP-FLW-001 · Parcours'],
  ['components.html', 'Composants'],
  ['scr-001.html', 'APP-SCR-001 · Mes créations'],
  ['scr-002.html', 'APP-SCR-002 · Choix du vêtement'],
  ['scr-003.html', 'APP-SCR-003 · Éditeur 3D'],
  ['scr-004.html', 'APP-SCR-004 · Export'],
  ['doc-001.html', 'APP-DOC-001 · Fiche PDF'],
];
const CSS = `
:root{--paper:#eef0f1;--sheet:#f6f7f8;--ink:#1b1e22;--line2:#4f555c;--line3:#9298a0;--rule:#c4c9ce;
--cond:"Barlow Condensed","Arial Narrow",Arial,sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--paper:#111316;--sheet:#171a1d;--ink:#e4e7ea;--line2:#a6acb3;--line3:#646a72;--rule:#30353a;color-scheme:dark}}
:root[data-theme="dark"]{--paper:#111316;--sheet:#171a1d;--ink:#e4e7ea;--line2:#a6acb3;--line3:#646a72;--rule:#30353a;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:13px/1.55 var(--mono)}
.wrap{max-width:1240px;margin:0 auto;padding:24px 16px 64px}
h1,h2,h3{font-family:var(--cond);letter-spacing:.06em;text-transform:uppercase;margin:32px 0 12px}
h1{font-size:28px;margin-top:8px}
nav{display:flex;flex-wrap:wrap;gap:6px 14px;font-family:var(--cond);letter-spacing:.06em;text-transform:uppercase;font-size:13px;margin-bottom:16px}
nav a{color:var(--line2)}nav a[aria-current]{color:var(--ink);font-weight:700}
.cart{border:1.5px solid var(--ink);background:var(--sheet);display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.cart div{padding:8px 12px;border-right:.8px solid var(--rule);border-bottom:.8px solid var(--rule)}
.cart b{display:block;font-family:var(--cond);letter-spacing:.08em;font-size:11px;color:var(--line2);font-weight:600;text-transform:uppercase}
figure{margin:20px 0;background:var(--sheet);border:.8px solid var(--rule);padding:12px}
.scroll{overflow-x:auto}
figure svg{display:block;width:100%;height:auto}
figcaption{font-family:var(--cond);letter-spacing:.08em;text-transform:uppercase;font-size:12px;color:var(--line2);margin-top:8px}
.tw{overflow-x:auto}
table{border-collapse:collapse;width:100%;background:var(--sheet)}
th,td{border:.8px solid var(--rule);padding:6px 8px;text-align:left;vertical-align:top}
th{font-family:var(--cond);letter-spacing:.08em;text-transform:uppercase;font-weight:600}
ol li{margin:4px 0}
pre{background:var(--sheet);border:.8px solid var(--rule);padding:12px;overflow-x:auto}
.tg{float:right;font:inherit;background:none;color:var(--ink);border:1px solid var(--line2);padding:6px 10px;min-height:44px;cursor:pointer}
svg text{fill:var(--ink);font-family:var(--mono);paint-order:stroke;stroke:var(--sheet);stroke-width:3px;stroke-linejoin:round}
svg text.cap{font-family:var(--cond);letter-spacing:.08em}
.o{fill:none;stroke:var(--ink);stroke-width:1.5}
.o2{fill:none;stroke:var(--ink);stroke-width:.8}
.slot{fill:none;stroke:var(--line2);stroke-width:.9;stroke-dasharray:4 3}
.ph{fill:none;stroke:var(--line3);stroke-width:.6}
.dim{fill:none;stroke:var(--line2);stroke-width:.7}
.ext{fill:none;stroke:var(--line3);stroke-width:.5}
.cen{fill:none;stroke:var(--line3);stroke-width:.5;stroke-dasharray:10 2 2 2}
.call{fill:none;stroke:var(--line2);stroke-width:.8;stroke-dasharray:2 2}
.hatchf{fill:url(#hatch);stroke:var(--line2);stroke-width:.8;stroke-dasharray:4 3}
.fill{fill:var(--sheet)}
`;
const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<marker id="arr" viewBox="0 0 10 10" refX="10" refY="5" markerUnits="userSpaceOnUse" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1.8 L10,5 L0,8.2 z" fill="var(--line2)"/></marker>
<marker id="tk" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" orient="auto"><path d="M2,8 L8,2" stroke="var(--line2)" stroke-width="1.2"/></marker>
<pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="var(--line3)" stroke-width=".7"/></pattern>
</defs></svg>`;

function page(file, { title, cart = [], body }) {
  const nav = SHEETS.map(([f, l]) => `<a href="${f}"${f === file ? ' aria-current="page"' : ''}>${l}</a>`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>${CSS}</style></head><body>${DEFS}<div class="wrap">
<button class="tg" type="button" onclick="var r=document.documentElement;r.dataset.theme=r.dataset.theme==='dark'?'light':'dark'">Clair / sombre</button>
<nav>${nav}</nav><h1>${esc(title)}</h1>
${cart.length ? `<div class="cart">${cart.map(([k, v]) => `<div><b>${k}</b>${v}</div>`).join('')}</div>` : ''}
${body}</div></body></html>`;
}
const fig = (svg, caption) => `<figure><div class="scroll">${svg}</div><figcaption>${caption}</figcaption></figure>`;
const varTable = (rows) =>
  `<h2>Variables</h2><div class="tw"><table><tr><th>Variable</th><th>Rôle</th><th>Valeur</th></tr>${rows
    .map(([k, role]) => `<tr><td>${k}</td><td>${role}</td><td>${flat[k] === T[k] ? T[k] : `${flat[k]} = ${T[k]}`}</td></tr>`)
    .join('')}</table></div>`;
const notes = (items) => `<h2>Notes</h2><ol>${items.map((n) => `<li>${n}</li>`).join('')}</ol>`;
const cartScr = (id, name, frames, vars) => [
  ['ID', id], ['Écran', name], ['Plateforme', 'Web responsive'], ['Cadres', frames], ['Variables clés', vars],
];

// ---------- APP-SCR-003 · Éditeur ----------
function editorDesktop() {
  const W = T.W_DESKTOP, H = T.H_DESKTOP, P = T.W_PANEL;
  let s = rect(0, 0, W, H, 'o');
  s += ln(0, 56, W, 56) + ibtn(16, 6, '←') + slot(76, 6, 1092, 44, 'NOM DE LA CRÉATION · FILL · ÉDITABLE');
  s += ibtn(1184, 6, '↶') + ibtn(1236, 6, '↷') + btn(1304, 6, 120, 'EXPORTER · HUG');
  s += ln(P, 56, P, H) + ln(W - P, 56, W - P, H);
  // panneau gauche : vêtement
  s += txt(16, 87, 'VÊTEMENT', { sz: 13 }) + txt(16, 113, 'TYPE', { sz: 9 }) + seg(16, 124, 288, ['TEE-SHIRT', 'SWEATER']);
  s += txt(16, 205, 'COUPE', { sz: 9 }) + seg(16, 216, 288, ['NORMALE', 'OVERSIZE'], 1);
  s += txt(16, 297, 'COULEUR · NOM DE LA COULEUR · HUG', { sz: 9 });
  [16, 72, 128, 184, 240].forEach((x, i) => (s += sw(x, 308, i === 0)));
  [16, 72, 128].forEach((x) => (s += sw(x, 364)));
  s += txt(196, 390, 'N · [TBD] colors.json', { sz: 9 });
  s += txt(16, 445, 'FOND', { sz: 9 }) + seg(16, 456, 288, ['CLAIR', 'SOMBRE']);
  // scène
  s += ph(P, 56, W - 2 * P, H - 56) + tee(1, 720, 220);
  s += cen(720, 190, 720, 740) + ln(640, 232, 800, 232, 'cen') + txt(806, 235, 'BAS DU COL · Y = 0', { sz: 9 });
  s += rect(650, 262, 140, 190, 'slot') + txt(720, 470, 'ZONE DEVANT', { a: 'middle', sz: 9 }) + txt(720, 482, 'DIMENSIONS À CONFIRMER', { a: 'middle', sz: 9 });
  s += rect(680, 290, 80, 60, 'o') + ln(720, 290, 720, 266) + `<circle class="o fill" cx="720" cy="260" r="6"/>`;
  for (const [x, y] of [[680, 290], [760, 290], [680, 350], [760, 350]]) s += rect(x - 6, y - 6, 12, 12, 'o fill');
  s += call(760, 350, 26, 'A');
  s += rect(336, 72, 380, 32, 'o2', T.R_PILL) + txt(352, 92, BADGE, { sz: 9 });
  s += seg(588, 840, 264, ['FACE', 'DOS', '3/4']);
  // panneau droit : éléments
  const X = W - P + 16;
  s += txt(X, 87, 'ÉLÉMENTS', { sz: 13 }) + btn(X, 100, 140, '+ IMAGE', 'o2') + btn(X + 148, 100, 140, '+ TEXTE', 'o2');
  s += txt(X, 165, 'PNG TRANSPARENT RECOMMANDÉ', { sz: 8 }) + txt(X, 197, 'CALQUES', { sz: 9 });
  [208, 264, 320].forEach((y, i) => {
    if (i === 1) s += rect(X, y, 288, 56, 'o', T.R_CTL);
    else s += ln(X, y + 56, X + 288, y + 56, 'ext');
    s += ph(X + 8, y + 8, 40, 40) + slot(X + 56, y + 16, 136, 24, 'NOM · FILL') + ibtn(X + 200, y + 6, '◉') + ibtn(X + 244, y + 6, '⋯');
  });
  s += txt(X, 415, 'PROPRIÉTÉS', { sz: 13 }) + seg(X, 428, 288, ['DEVANT', 'DOS']);
  s += fld(X, 484, 138, 'X · AXE') + fld(X + 150, 484, 138, 'Y · COL') + fld(X, 540, 138, 'LARGEUR') + fld(X + 150, 540, 138, 'HAUTEUR');
  s += fld(X, 596, 138, 'ROTATION', '°') + wrn(X, 664, 288) + wrn(X, 728, 288);
  // cotes
  s += dimH(0, P, -20, 'W_PANEL = 320', { e: 0 }) + dimH(P, W - P, -20, 'SCÈNE · FILL', { e: 0 }) + dimH(W - P, W, -20, 'W_PANEL = 320', { e: 0 });
  s += dimV(0, 56, -20, 'H_TOPBAR = 56', { e: 0, side: 'l' }) + dimV(124, 168, -20, 'H_SEG = 44', { e: 0, side: 'l' });
  s += dimV(168, 192, -20, 'S3 = 24', { e: 0, side: 'l' }) + dimV(308, 352, -20, 'SWATCH = 44', { e: 0, side: 'l' });
  s += dimV(352, 364, -20, 'S4 = 12', { e: 0, side: 'l' }) + dimH(0, 16, 524, 'S1 = 16', { e: 500, below: true });
  s += dimV(840, 884, 868, 'H_SEG', { e: 852 }) + dimV(884, 900, 868, 'S1', { e: 852 });
  s += dimH(P, 336, 124, 'S1', { e: 104, below: true });
  s += dimV(208, 264, W + 24, 'H_ROW = 56', { e: X + 288 }) + dimV(484, 528, W + 24, 'H_FIELD = 44', { e: X + 288 });
  return frameSvg(W + 260, H + 80, 150, 50, s, 900);
}
function editorMobile() {
  const W = T.W_MOBILE, H = T.H_MOBILE, top = H - T.H_SHEET_MID;
  let s = rect(0, 0, W, H, 'o') + ln(0, 56, W, 56) + ibtn(8, 6, '←') + slot(60, 6, 166, 44, 'NOM · FILL');
  s += ibtn(234, 6, '↶') + ibtn(286, 6, '↷') + ibtn(338, 6, '⇩', 'o');
  s += ph(0, 56, W, top - 56) + tee(0.45, 195, 140) + rect(165, 168, 60, 80, 'slot') + rect(176, 180, 38, 28, 'o');
  s += rect(16, 72, 358, 32, 'o2', T.R_PILL) + txt(195, 91, BADGE, { a: 'middle', sz: 8 });
  s += seg(63, top - 60, 264, ['FACE', 'DOS', '3/4']);
  s += `<path class="o fill" d="M0,${H} L0,${top + 12} Q0,${top} 12,${top} L${W - 12},${top} Q${W},${top} ${W},${top + 12} L${W},${H}"/>`;
  s += rect(177, top + 10, 36, 4, 'o2', 2) + seg(16, top + 24, 358, ['VÊTEMENT', 'ÉLÉMENTS', 'PROPRIÉTÉS'], 1);
  s += btn(16, top + 84, 173, '+ IMAGE', 'o2') + btn(201, top + 84, 173, '+ TEXTE', 'o2');
  [top + 140, top + 196, top + 252].forEach((y, i) => {
    if (i === 1) s += rect(16, y, 358, 56, 'o', T.R_CTL);
    s += ph(24, y + 8, 40, 40) + slot(72, y + 16, 206, 24, 'NOM · FILL') + ibtn(286, y + 6, '◉') + ibtn(330, y + 6, '⋯');
  });
  s += dimV(0, 56, -20, 'H_TOPBAR = 56', { e: 0, side: 'l' }) + dimV(56, top, -20, 'SCÈNE · FILL', { e: 0, side: 'l' });
  s += dimV(top, H, -20, 'H_SHEET_MID = 360', { e: 0, side: 'l' });
  s += dimV(top, top + 24, W + 20, 'H_HANDLE = 24', { e: W }) + dimV(top + 24, top + 68, W + 20, 'H_SEG = 44', { e: W });
  s += dimV(top + 68, top + 84, W + 20, 'S1 = 16', { e: W }) + dimV(top + 196, top + 252, W + 20, 'H_ROW = 56', { e: W });
  s += dimH(338, 382, -20, 'TOUCH_MIN = 44', { e: 6 }) + dimV(top - 60, top - 16, 340, 'H_SEG', { e: 327 }) + dimV(top - 16, top, 340, 'S1', { e: 327 });
  s += dimH(0, 16, H + 22, 'S1', { e: H, below: true }) + dimH(189, 201, H + 22, 'S4', { e: H, below: true });
  return frameSvg(W + 300, H + 90, 150, 40, s, 420);
}
function layers() {
  const L = [
    ['L0', 'FOND DE SCÈNE · CLAIR / SOMBRE'],
    ['L1', 'CANVAS 3D · VÊTEMENT + DÉCALQUES'],
    ['L2', 'ZONE EN POINTILLÉS · POIGNÉES (HTML AU-DESSUS DU CANVAS)'],
    ['L3', 'PANNEAUX · BARRE DE VUES · ÉTIQUETTE APERÇU'],
    ['L4', 'MENUS · FENÊTRE D’EXPORT · INFOBULLES'],
  ];
  let s = '';
  L.slice().reverse().forEach(([id, label], i) => {
    const y = 20 + i * 60, poly = `20,${y + 40} 260,${y + 40} 320,${y} 80,${y}`;
    s += `<polygon class="${i === 0 ? 'hatchf' : 'o fill'}" points="${poly}"/>` + txt(340, y + 24, `${id} · ${label}`, { sz: 11 });
  });
  return frameSvg(820, 340, 0, 0, s, 560);
}

// ---------- APP-SCR-001 · Mes créations ----------
function card(x, y, w, thumb) {
  return rect(x, y, w, thumb + 68, 'o', T.R1) + ph(x + 8, y + 8, thumb, thumb, 'APERÇU · 1:1', T.R2) +
    slot(x + 16, y + thumb + 18, w - 80, 16, 'NOM · TRONQUÉ') + slot(x + 16, y + thumb + 38, Math.min(140, w - 80), 12, 'DATE') +
    ibtn(x + w - 52, y + thumb + 16, '⋯');
}
function listDesktop() {
  const W = T.W_DESKTOP, H = T.H_DESKTOP, m = (W - T.W_MAX) / 2, cw = (T.W_MAX - 3 * T.S3) / 4;
  let s = rect(0, 0, W, H, 'o') + ln(0, 56, W, 56) + slot(m, 12, 240, 32, "[TBD] NOM DE L'APP");
  s += btn(1004, 6, 148, 'IMPORTER .JSON', 'o2') + btn(1164, 6, 196, 'NOUVELLE CRÉATION');
  s += txt(m, 114, 'MES CRÉATIONS', { sz: 22 });
  for (const y of [144, 522]) for (let i = 0; i < 4; i++) s += card(m + i * (cw + T.S3), y, cw, cw - 16);
  s += rect(500, 494, 200, 192, 'o fill', T.R_CTL);
  ['RENOMMER', 'DUPLIQUER', 'EXPORTER .JSON', 'SUPPRIMER'].forEach((l, i) => (s += txt(516, 530 + i * 44, l, { sz: 10 })));
  s += dimH(0, m, -20, '80', { e: 0 }) + dimH(m, W - m, -20, 'W_MAX = 1280', { e: 0 }) + dimH(W - m, W, -20, '80', { e: 0 });
  s += dimV(0, 56, -20, 'H_TOPBAR = 56', { e: 0, side: 'l' }) + dimV(144, 498, -20, 'CARTE = 354', { e: 0, side: 'l' });
  s += dimV(498, 522, -20, 'S3 = 24', { e: 0, side: 'l' });
  s += dimH(m, m + cw, H + 24, 'W_CARTE = (W_MAX − 3·S3) / 4 = 302', { e: 876, below: true });
  s += dimV(152, 438, W + 20, 'W_CARTE − 2·S2', { e: 1352 }) + dimV(446, 490, W + 20, 'TOUCH_MIN = 44', { e: 1352 });
  s += call(600, 590, 110, 'A');
  return frameSvg(W + 300, H + 90, 160, 44, s, 900);
}
function listMobile(empty = false) {
  const W = T.W_MOBILE, H = T.H_MOBILE, cw = (W - 2 * T.S1 - T.S4) / 2;
  let s = rect(0, 0, W, H, 'o') + ln(0, 56, W, 56) + slot(16, 12, 200, 32, "[TBD] NOM DE L'APP") + ibtn(330, 6, '⇧');
  s += txt(16, 96, 'MES CRÉATIONS', { sz: 18 });
  if (empty) {
    s += ph(135, 260, 120, 120, '[TBD]') + slot(40, 404, 310, 24, 'TITRE · ÉTAT VIDE') + slot(40, 436, 310, 40, "TEXTE D'AIDE · HUG");
    s += btn(95, 496, 200, 'IMPORTER .JSON', 'o2');
  } else {
    for (const y of [116, 353, 590]) for (const x of [16, 16 + cw + T.S4]) s += card(x, y, cw, cw - 16);
  }
  s += hatch(0, 768, W, 76) + rect(16, 784, 358, 44, 'o fill', T.R_CTL) + txt(195, 810, 'NOUVELLE CRÉATION', { a: 'middle' });
  if (!empty) {
    s += dimH(16, 16 + cw, H + 22, `(W − 2·S1 − S4) / 2 = ${cw}`, { e: H, below: true });
    s += dimV(116, 341, W + 20, 'CARTE = 225', { e: W }) + dimV(341, 353, W + 20, 'S4', { e: W });
    s += dimV(768, 784, W + 20, 'S1', { e: W }) + dimV(784, 828, W + 20, 'H_BTN = 44', { e: W });
  }
  return frameSvg(W + 160, H + 70, 20, 30, s, 300);
}

// ---------- APP-SCR-002 · Choix du vêtement ----------
function typeCard(x, y, w, h, label, sel, mob) {
  let s = sel ? rect(x - 4, y - 4, w + 8, h + 8, 'o2', T.R1 + 4) : '';
  return s + rect(x, y, w, h, 'o', T.R1) + ph(x + 8, y + 8, w - 16, h - 64, 'SILHOUETTE', T.R2) + slot(x + 16, y + h - 44, mob ? w - 32 : 200, 28, label);
}
function fitCard(x, y, w, label, sel) {
  let s = sel ? rect(x - 4, y - 4, w + 8, T.H_CARD_FIT + 8, 'o2', T.R1 + 4) : '';
  return s + rect(x, y, w, T.H_CARD_FIT, 'o', T.R1) + ph(x + 8, y + 8, 84, 84, '', T.R2) +
    slot(x + 108, y + 18, Math.min(240, w - 124), 24, label) + slot(x + 108, y + 50, Math.min(240, w - 124), 32, 'DESCRIPTION · HUG');
}
function chooseDesktop() {
  const W = T.W_DESKTOP, H = T.H_DESKTOP, x0 = (W - T.W_COL) / 2, cw = (T.W_COL - T.S3) / 2;
  let s = rect(0, 0, W, H, 'o') + ln(0, 56, W, 56) + ibtn(16, 6, '←') + txt(76, 34, 'NOUVELLE CRÉATION', { sz: 13 });
  s += txt(x0, 108, '1 · TYPE DE VÊTEMENT', { sz: 13 });
  s += typeCard(x0, 128, cw, T.H_CARD_TYPE_D, 'TEE-SHIRT', true) + typeCard(x0 + cw + T.S3, 128, cw, T.H_CARD_TYPE_D, 'SWEATER', false);
  s += txt(x0, 480, '2 · COUPE', { sz: 13 });
  s += fitCard(x0, 500, cw, 'NORMALE', true) + fitCard(x0 + cw + T.S3, 500, cw, 'OVERSIZE', false);
  s += btn(x0 + T.W_COL - 200, 632, 200, 'COMMENCER');
  s += dimH(0, x0, -20, 'FILL', { e: 0 }) + dimH(x0, x0 + T.W_COL, -20, 'W_COL = 800', { e: 0 }) + dimH(x0 + T.W_COL, W, -20, 'FILL', { e: 0 });
  s += dimH(x0 + cw, x0 + cw + T.S3, 448, 'S3', { e: 428, below: true });
  s += dimV(128, 428, W + 20, 'H_CARD_TYPE_D = 300', { e: x0 + T.W_COL }) + dimV(500, 600, W + 20, 'H_CARD_FIT = 100', { e: x0 + T.W_COL });
  s += dimV(600, 632, W + 20, 'S5 = 32', { e: x0 + T.W_COL }) + dimV(632, 676, W + 20, 'H_BTN = 44', { e: x0 + T.W_COL });
  return frameSvg(W + 220, H + 60, 20, 40, s, 900);
}
function chooseMobile() {
  const W = T.W_MOBILE, H = T.H_MOBILE, cw = (W - 2 * T.S1 - T.S4) / 2;
  let s = rect(0, 0, W, H, 'o') + ln(0, 56, W, 56) + ibtn(8, 6, '←') + txt(60, 34, 'NOUVELLE CRÉATION', { sz: 13 });
  s += txt(16, 92, '1 · TYPE', { sz: 13 });
  s += typeCard(16, 112, cw, T.H_CARD_TYPE_M, 'TEE-SHIRT', true, true) + typeCard(16 + cw + T.S4, 112, cw, T.H_CARD_TYPE_M, 'SWEATER', false, true);
  s += txt(16, 352, '2 · COUPE', { sz: 13 }) + fitCard(16, 372, 358, 'NORMALE', true) + fitCard(16, 484, 358, 'OVERSIZE', false);
  s += hatch(0, 768, W, 76) + rect(16, 784, 358, 44, 'o fill', T.R_CTL) + txt(195, 810, 'COMMENCER', { a: 'middle' });
  s += dimV(112, 312, W + 20, 'H_CARD_TYPE_M = 200', { e: W }) + dimV(372, 472, W + 20, 'H_CARD_FIT = 100', { e: W });
  s += dimV(472, 484, W + 20, 'S4', { e: W }) + dimV(784, 828, W + 20, 'H_BTN', { e: W });
  return frameSvg(W + 200, H + 60, 20, 30, s, 300);
}

// ---------- APP-SCR-004 · Export ----------
const ROWS = [
  ['APERÇUS PNG · FACE, DOS, 3/4 · 2048 PX', 'FOND CLAIR + FOND TRANSPARENT'],
  ['FICHE DE FABRICATION PDF · A4', 'UNE PAGE PAR ZONE IMPRIMÉE'],
  ['FICHIERS SOURCES', 'IMAGES D’ORIGINE + TEXTES PNG 300 DPI'],
  ['CRÉATION .JSON', 'POUR LA ROUVRIR PLUS TARD'],
];
function exportBody(x, y, w) {
  let s = '';
  ROWS.forEach(([a, b], i) => {
    const yy = y + i * 56;
    s += ph(x, yy + 16, 24, 24) + txt(x + 36, yy + 24, a, { sz: 10 }) + txt(x + 36, yy + 42, b, { sz: 8 }) + ln(x, yy + 56, x + w, yy + 56, 'ext');
  });
  s += txt(x, y + 256, 'AVERTISSEMENTS NON RÉSOLUS · HUG', { sz: 9 }) + wrn(x, y + 264, w) + wrn(x, y + 328, w);
  return s;
}
function exportDesktop() {
  const W = T.W_DESKTOP, H = T.H_DESKTOP, dw = T.W_DIALOG, dx = (W - dw) / 2, dy = 170, x = dx + 24, w = dw - 48;
  let s = rect(0, 0, W, H, 'o') + hatch(0, 0, W, H) + rect(dx, dy, dw, 560, 'o fill', T.R1);
  s += txt(x, dy + 52, 'EXPORTER', { sz: 16 }) + ibtn(dx + dw - 68, dy + 24, '✕');
  s += exportBody(x, dy + 84, w);
  s += btn(dx + dw - 24 - 180 - 12 - 140, dy + 492, 140, 'ANNULER', 'o2') + btn(dx + dw - 24 - 180, dy + 492, 180, 'TÉLÉCHARGER LE ZIP');
  s += dimH(dx, dx + dw, dy - 20, 'W_DIALOG = 560', { e: dy });
  s += dimV(dy, dy + 24, dx + dw + 24, 'S3', { e: dx + dw }) + dimV(dy + 84, dy + 140, dx + dw + 24, 'H_ROW = 56', { e: dx + dw });
  s += dimV(dy + 492, dy + 536, dx + dw + 24, 'H_BTN = 44', { e: dx + dw }) + dimV(dy + 536, dy + 560, dx + dw + 24, 'S3', { e: dx + dw });
  s += dimH(dx, dx + 24, dy + 590, 'S3', { e: dy + 560, below: true });
  return frameSvg(W + 40, H + 40, 20, 20, s, 900);
}
function exportMobile() {
  const W = T.W_MOBILE, H = T.H_MOBILE, top = 96;
  let s = rect(0, 0, W, H, 'o') + hatch(0, 0, W, top + 12);
  s += `<path class="o fill" d="M0,${H} L0,${top + 12} Q0,${top} 12,${top} L${W - 12},${top} Q${W},${top} ${W},${top + 12} L${W},${H}"/>`;
  s += rect(177, top + 10, 36, 4, 'o2', 2) + txt(16, top + 52, 'EXPORTER', { sz: 16 }) + ibtn(330, top + 24, '✕');
  s += exportBody(16, top + 84, 358);
  s += btn(16, 732, 358, 'ANNULER', 'o2') + btn(16, 784, 358, 'TÉLÉCHARGER LE ZIP');
  s += dimV(top, top + 24, W + 20, 'H_HANDLE', { e: W }) + dimV(732, 776, W + 20, 'H_BTN', { e: W }) + dimV(776, 784, W + 20, 'S2', { e: W });
  return frameSvg(W + 150, H + 40, 20, 20, s, 300);
}
function exportStates() {
  let s = '';
  const st = [
    ['GÉNÉRATION', (x, y) => rect(x, y + 30, 400, 8, 'o2', 4) + rect(x, y + 30, 160, 8, 'o', 4) + txt(x, y + 60, 'ÉTAPE EN COURS · HUG', { sz: 9 }) + rect(x + 420, y + 12, 120, 44, 'slot', T.R_CTL) + txt(x + 480, y + 38, 'DÉSACTIVÉ', { a: 'middle', sz: 9 })],
    ['SUCCÈS', (x, y) => txt(x, y + 36, 'ZIP TÉLÉCHARGÉ · NOM DU FICHIER', { sz: 10 }) + btn(x + 420, y + 12, 120, 'FERMER')],
    ['ERREUR', (x, y) => wrn(x, y + 6, 400, 'MESSAGE D’ERREUR · HUG') + btn(x + 420, y + 12, 120, 'RÉESSAYER')],
  ];
  st.forEach(([l, f], i) => {
    const y = i * 90;
    s += txt(0, y + 38, l, { sz: 11 }) + rect(110, y, 580, 70, 'o2', T.R1) + f(130, y);
  });
  return frameSvg(720, 270, 0, 0, s, 560);
}

// ---------- APP-DOC-001 · Fiche PDF ----------
function pdfSheet() {
  const W = T.PDF_W, H = T.PDF_H, m = T.M_PDF, iw = W - 2 * m;
  let s = rect(0, 0, W, H, 'o');
  const cells = ['VÊTEMENT', 'COUPE', 'COULEUR · NOM + #HEX', 'ZONE', 'DATE', 'PAGE N / N', 'TECHNIQUE · [TBD]', 'APERÇU INDICATIF'];
  s += rect(m, m, iw, 90, 'o2');
  cells.forEach((c, i) => {
    const cx = m + (i % 4) * (iw / 4), cy = m + Math.floor(i / 4) * 45;
    if (i % 4) s += ln(cx, cy, cx, cy + 45);
    s += txt(cx + 6, cy + 14, c, { sz: 7 }) + slot(cx + 6, cy + 20, iw / 4 - 12, 16);
  });
  s += ln(m, m + 45, m + iw, m + 45);
  s += txt(m, 160, 'SCHÉMA DE LA ZONE · ÉCHELLE AUTO', { sz: 9 });
  s += ln(150, 190, 450, 190, 'cen') + txt(456, 193, 'BAS DU COL · Y = 0', { sz: 7 });
  s += cen(300, 176, 300, 520) + txt(304, 530, 'AXE CENTRAL · X = 0', { sz: 7 });
  s += rect(150, 220, 300, 280, 'slot') + rect(320, 250, 100, 60, 'o') + `<circle class="o2" cx="370" cy="280" r="2"/>`;
  s += `<path class="dim" d="M420,280 A50,50 0 0 1 416,300" marker-end="url(#arr)"/>` + mono(424, 300, 'ROT θ°', { sz: 7 });
  s += dimH(300, 370, 236, 'X_CM', { e: 280, sz: 8 }) + dimH(320, 420, 326, 'LARGEUR_CM', { e: 310, below: true, sz: 8 });
  s += dimV(250, 310, 438, 'HAUTEUR_CM', { e: 420, sz: 8 }) + dimV(190, 280, 520, 'Y_CM', { e: 370, sz: 8 });
  s += dimH(150, 450, 516, 'LARGEUR MAX · [TBD]', { e: 500, below: true, sz: 8 }) + dimV(220, 500, 130, 'H. MAX · [TBD]', { e: 150, side: 'l', sz: 8 });
  const cols = [['#', 20], ['TYPE', 50], ['SOURCE / TEXTE', 105], ['X', 40], ['Y', 40], ['L', 40], ['H', 40], ['ROT', 35], ['DPI', 40], ['POLICE', 55], ['COULEUR', 50]];
  let cx = m;
  s += rect(m, 550, iw, 60, 'o2') + ln(m, 570, m + iw, 570) + ln(m, 590, m + iw, 590, 'ext');
  cols.forEach(([l, w], i) => {
    if (i) s += ln(cx, 550, cx, 610);
    s += txt(cx + 3, 563, l, { sz: 7 });
    cx += w;
  });
  s += txt(m, 640, 'AVERTISSEMENTS NON RÉSOLUS', { sz: 9 }) + slot(m, 650, iw, 18, 'AVERTISSEMENT · HUG', 0, 7) + slot(m, 674, iw, 18, 'AVERTISSEMENT · HUG', 0, 7);
  s += ln(m, H - m - 22, m + iw, H - m - 22) + txt(m, H - m - 6, 'APERÇU INDICATIF, LES COULEURS IMPRIMÉES PEUVENT VARIER · DATE', { sz: 8 });
  s += dimH(0, m, -16, 'M_PDF = 40', { e: 0, sz: 8 }) + dimH(m, W - m, -16, 'FILL', { e: 0, sz: 8 }) + dimV(m, m + 90, W + 16, 'CARTOUCHE · 90', { e: W - m, sz: 8 });
  return frameSvg(W + 220, H + 60, 110, 30, s, 420);
}

// ---------- Composants ----------
function components() {
  const blocks = [];
  // UI-BTN-001
  {
    let s = '';
    ['NORMAL', 'APPUYÉ', 'DÉSACTIVÉ', 'FOCUS'].forEach((st, i) => {
      const x = 120 + i * 190, y = 30;
      if (st === 'DÉSACTIVÉ') s += rect(x, y, 160, 44, 'slot', T.R_CTL) + txt(x + 80, y + 26, 'LIBELLÉ · HUG', { a: 'middle' });
      else s += btn(x, y, 160, 'LIBELLÉ · HUG');
      if (st === 'APPUYÉ') s += hatch(x + 2, y + 2, 156, 40, T.R_CTL - 2);
      if (st === 'FOCUS') s += rect(x - 4, y - 4, 168, 52, 'o2', T.R_FOCUS);
      s += txt(x + 80, y + 66, st, { a: 'middle', sz: 9 });
      s += ibtn(x + 58, y + 90, '+', st === 'DÉSACTIVÉ' ? 'slot' : 'o2');
      if (st === 'FOCUS') s += rect(x + 54, y + 86, 52, 52, 'o2', T.R_FOCUS);
    });
    s += txt(0, 56, 'PRIMAIRE', { sz: 10 }) + txt(0, 146, 'SECONDAIRE', { sz: 10 }) + txt(0, 160, '/ ICÔNE', { sz: 10 });
    s += dimV(30, 74, 100, 'H_BTN = 44', { e: 120, side: 'l', sz: 8 });
    s += dimH(624, 816, 200, 'R_FOCUS = R_CTL + 2 + 2 = 12', { sz: 8 });
    blocks.push(['UI-BTN-001 · Bouton', frameSvg(900, 220, 10, 10, s, 600),
      'Primaire : contour plein 1,5. Secondaire : contour 0,8. Icône : 44 × 44, libellé accessible obligatoire (aria-label). Focus clavier : anneau décalé de FOCUS_OFFSET.']);
  }
  // UI-SEG-001
  {
    let s = seg(20, 30, 288, ['OPTION A', 'OPTION B']) + seg(360, 30, 264, ['FACE', 'DOS', '3/4']);
    s += dimV(30, 74, 16, 'H_SEG = 44', { e: 20, side: 'l', sz: 8 }) + dimV(30, 34, 660, 'P_SEG = 4', { e: 624, sz: 8 });
    s += dimH(20, 308, 96, '288 = W_PANEL − 2·S1', { e: 74, below: true, sz: 8 }) + call(620, 36, 18, 'A');
    s += txt(700, 60, 'A · R_SEG_IN = R_CTL − B − P_SEG = 3', { sz: 9 });
    blocks.push(['UI-SEG-001 · Contrôle segmenté', frameSvg(980, 130, 90, 10, s, 600),
      'Type, coupe, fond, zone, onglets mobiles et barre de vues. Navigation clavier : flèches gauche / droite (rôle radiogroup).']);
  }
  // UI-FLD-001
  {
    let s = '';
    [['NORMAL', 'o2'], ['FOCUS', 'o'], ['BLOQUÉ AU BORD', 'o2'], ['DÉSACTIVÉ', 'slot']].forEach(([st, c], i) => {
      const x = i * 180;
      s += fld(x, 20, 150, 'LARGEUR', 'CM', c) + txt(x + 75, 84, st, { a: 'middle', sz: 9 });
      if (st === 'FOCUS') s += rect(x - 4, 16, 158, 52, 'o2', T.R_FOCUS);
      if (st === 'BLOQUÉ AU BORD') s += txt(x, 100, '« MAX DE LA ZONE · N CM »', { sz: 8 });
    });
    blocks.push(['UI-FLD-001 · Champ numérique en cm', frameSvg(740, 112, 10, 0, s, 600),
      'Saisie au clavier, virgule ou point acceptés, pas de 0,1 cm. Une valeur hors zone est ramenée au bord et le champ l’indique.']);
  }
  // UI-SWT-001 + UI-BDG-001
  {
    let s = sw(20, 20) + txt(42, 84, 'NORMAL', { a: 'middle', sz: 9 }) + sw(120, 20, true) + txt(142, 84, 'SÉLECTIONNÉ', { a: 'middle', sz: 9 });
    s += sw(220, 20) + `<circle class="o2" cx="242" cy="42" r="26"/>` + txt(242, 84, 'FOCUS', { a: 'middle', sz: 9 });
    s += dimH(20, 64, 12, 'SWATCH = 44', { e: 20, sz: 8 });
    s += rect(340, 26, 380, 32, 'o2', T.R_PILL) + txt(356, 46, BADGE, { sz: 9 }) + dimV(26, 58, 736, 'H_CHIP = 32', { e: 720, sz: 8 });
    s += txt(340, 84, 'UI-BDG-001 · ÉTIQUETTE APERÇU · NON INTERACTIVE', { sz: 9 });
    blocks.push(['UI-SWT-001 · Pastille couleur · UI-BDG-001 · Étiquette', frameSvg(860, 100, 10, 4, s, 600),
      'Le nom de la couleur (colors.json) sert de libellé accessible et d’infobulle. L’étiquette n’est pas une cible : 32 px est permis.']);
  }
  // UI-LYR-001 + UI-WRN-001
  {
    let s = '';
    [['NORMAL', 'ext'], ['SÉLECTIONNÉ', 'o'], ['MASQUÉ', 'ext']].forEach(([st, c], i) => {
      const y = i * 64;
      s += (c === 'o' ? rect(0, y, 288, 56, 'o', T.R_CTL) : ln(0, y + 56, 288, y + 56, 'ext'));
      s += ph(8, y + 8, 40, 40) + slot(56, y + 16, 136, 24, st === 'MASQUÉ' ? 'NOM · ATTÉNUÉ' : 'NOM · FILL') + ibtn(200, y + 6, st === 'MASQUÉ' ? '◌' : '◉') + ibtn(244, y + 6, '⋯');
      s += txt(300, y + 32, st, { sz: 9 });
    });
    s += dimV(0, 56, -8, 'H_ROW', { e: 0, side: 'l', sz: 8 }) + dimH(8, 48, 210, 'THUMB_LAYER = 40', { e: 184, below: true, sz: 8 });
    s += wrn(420, 0, 300) + txt(420, 76, 'UI-WRN-001 · AVERTISSEMENT', { sz: 9 }) + wrn(420, 92, 300, 'MESSAGE + ACTION · HUG');
    blocks.push(['UI-LYR-001 · Ligne de calque · UI-WRN-001 · Avertissement', frameSvg(820, 230, 70, 6, s, 600),
      'Menu ⋯ du calque : monter, descendre, dupliquer, supprimer. Avertissement : icône + message ; il ne bloque jamais. Action proposée quand elle existe (ex. « réduire à la taille conseillée »).']);
  }
  // UI-HDL-001 + UI-ZON-001
  {
    let s = rect(40, 40, 260, 220, 'slot') + txt(170, 278, 'UI-ZON-001 · ZONE · DIMENSIONS À CONFIRMER', { a: 'middle', sz: 9 });
    s += rect(110, 110, 120, 80, 'o') + ln(170, 110, 170, 86) + `<circle class="o fill" cx="170" cy="80" r="6"/>`;
    for (const [x, y] of [[110, 110], [230, 110], [110, 190], [230, 190]]) s += rect(x - 6, y - 6, 12, 12, 'o fill');
    s += dimV(86, 110, 250, 'ROT_OFFSET = 24', { e: 176, sz: 8 }) + call(230, 190, 22, 'A');
    s += rect(456, 96, 12, 12, 'o') + rect(440, 80, 44, 44, 'slot') + ln(462, 102, 600, 102) + ln(462, 102, 462, 200);
    s += dimH(456, 468, 150, 'HANDLE_VIS = 12', { e: 108, below: true, sz: 8 }) + dimH(440, 484, 66, 'HANDLE_HIT = 44', { e: 80, sz: 8 });
    s += txt(420, 230, 'DÉTAIL A · ÉCHELLE 3:1 (RÉDUITE ICI)', { sz: 9 });
    blocks.push(['UI-HDL-001 · Poignées de manipulation', frameSvg(700, 300, 10, 4, s, 560),
      'Coins : redimensionner (proportions gardées pour les images). Poignée haute : pivoter. Glisser l’intérieur : déplacer. Au doigt : un doigt déplace, deux doigts redimensionnent et pivotent. La zone de toucher de 44 dépasse la poignée dessinée.']);
  }
  // UI-CRD-001 + UI-SHT-001
  {
    let s = card(0, 0, 173, 157) + txt(86, 246, 'UI-CRD-001 · CARTE', { a: 'middle', sz: 9 });
    const mini = (x, top, label) => {
      let m = rect(x, 0, 195, 422, 'o2') + ph(x, 0, 195, top);
      m += `<path class="o fill" d="M${x},422 L${x},${top + 6} Q${x},${top} ${x + 6},${top} L${x + 189},${top} Q${x + 195},${top} ${x + 195},${top + 6} L${x + 195},422"/>`;
      return m + rect(x + 88, top + 5, 18, 2, 'o2', 1) + txt(x + 97, 440, label, { a: 'middle', sz: 9 });
    };
    s += mini(220, 422 - T.H_SHEET_PEEK / 2, 'REPLIÉ · H_SHEET_PEEK = 84') + mini(440, 422 - T.H_SHEET_MID / 2, 'MI-HAUTEUR · 360') + mini(660, 28, 'DÉPLIÉ · SOUS LA BARRE');
    blocks.push(['UI-CRD-001 · Carte création · UI-SHT-001 · Panneau bas mobile (échelle 1:2)', frameSvg(870, 452, 4, 4, s, 600),
      'Panneau bas : glisser la poignée ou toucher un onglet pour changer d’état. Avec « mouvement réduit », les changements d’état sont instantanés.']);
  }
  return blocks.map(([t, svg, n]) => `<h2>${t}</h2>${fig(svg, n)}`).join('');
}

// ---------- Parcours ----------
function flow() {
  const box = (x, y, w, id, name) => rect(x, y, w, 70, 'o', T.R_CTL) + mono(x + 10, y + 22, id, { sz: 10 }) + txt(x + 10, y + 48, name, { sz: 14 });
  const arrow = (d, label, lx, ly, a = 'middle') => `<path class="dim" d="${d}" marker-end="url(#arr)"/>` + txt(lx, ly, label, { a, sz: 9 });
  let s = box(20, 140, 200, 'APP-SCR-001', 'MES CRÉATIONS') + box(320, 20, 220, 'APP-SCR-002', 'CHOIX DU VÊTEMENT');
  s += box(640, 140, 200, 'APP-SCR-003', 'ÉDITEUR 3D') + box(960, 140, 200, 'APP-SCR-004', 'EXPORT · FENÊTRE');
  s += rect(960, 300, 200, 50, 'slot', T.R_CTL) + txt(1060, 330, 'ZIP TÉLÉCHARGÉ', { a: 'middle', sz: 11 });
  s += rect(320, 300, 220, 50, 'slot', T.R_CTL) + txt(430, 330, 'ERREUR · .JSON INVALIDE', { a: 'middle', sz: 11 });
  s += arrow('M120,140 L120,55 L320,55', 'NOUVELLE CRÉATION', 220, 48);
  s += arrow('M540,55 L740,55 L740,140', 'COMMENCER', 640, 48);
  s += arrow('M220,175 L640,175', 'OUVRIR UNE CRÉATION', 430, 168);
  s += arrow('M120,210 L120,325 L320,325', 'IMPORTER .JSON · ÉCHEC', 220, 318);
  s += arrow('M220,200 L600,200 L600,195 L640,195', 'IMPORTER .JSON · OK', 430, 214);
  s += arrow('M840,175 L960,175', 'EXPORTER', 900, 168);
  s += arrow('M960,195 L840,195', 'ANNULER / FERMER', 900, 214);
  s += arrow('M1060,210 L1060,300', 'TÉLÉCHARGER', 1068, 260, 'start');
  s += arrow('M690,210 L690,260 L60,260 L60,210', 'RETOUR · ← MES CRÉATIONS (SAUVEGARDE AUTO)', 375, 254);
  s += arrow('M760,210 Q760,240 790,240 Q820,240 820,210', 'AJOUTER · MODIFIER · ANNULER', 800, 290, 'start');
  s += arrow('M540,35 L590,35 L590,10 L400,10 L400,20', '← RETOUR', 600, 14, 'start');
  return frameSvg(1200, 380, 10, 10, s, 900);
}

// ---------- assemblage ----------
const out = join(root, 'sheets');
mkdirSync(out, { recursive: true });
const W = (f, html) => writeFileSync(join(out, f), html);

W('scr-003.html', page('scr-003.html', {
  title: 'APP-SCR-003 · Éditeur 3D',
  cart: cartScr('APP-SCR-003', 'Éditeur 3D', 'Ordinateur 1440 × 900 · mobile 390 × 844', 'W_PANEL, H_TOPBAR, H_SEG, H_ROW, H_SHEET_MID'),
  body: fig(editorDesktop(), 'Ordinateur · ≥ BP_DESKTOP · vêtement à gauche, éléments à droite, scène au centre') +
    fig(editorMobile(), 'Mobile · panneau bas à mi-hauteur, onglet « Éléments » actif') +
    fig(layers(), 'Vue éclatée des couches') +
    `<h2>États</h2><div class="tw"><table><tr><th>État</th><th>Ce qui change</th></tr>
<tr><td>Chargement du modèle</td><td>Scène : indicateur centré ; panneaux actifs, éléments visibles dès que le modèle est prêt.</td></tr>
<tr><td>Erreur de modèle</td><td>Scène : message + « Réessayer » ; la création n’est pas perdue.</td></tr>
<tr><td>Aucun élément</td><td>Liste des calques remplacée par une aide : « Ajoutez un logo, une image ou un texte ».</td></tr>
<tr><td>Élément sélectionné</td><td>Poignées (UI-HDL-001) sur la scène, ligne de calque en trait plein, propriétés remplies.</td></tr>
<tr><td>Élément texte sélectionné</td><td>Propriétés : texte (H_FIELD × 2), police (fonts.json), couleur, graisse (UI-SEG-001), alignement (UI-SEG-001).</td></tr>
<tr><td>Zone sans dimensions</td><td>Zone en pointillés + « dimensions à confirmer » ; la limite de dépassement n’est pas appliquée tant qu’elle est [TBD].</td></tr>
<tr><td>Fichier refusé</td><td>Avertissement : format non pris en charge (PNG, JPG, SVG seulement).</td></tr></table></div>` +
    varTable([['W_PANEL', 'Panneaux latéraux'], ['H_TOPBAR', 'Barre du haut'], ['H_SEG', 'Contrôles segmentés'], ['SWATCH', 'Pastilles couleur'], ['H_ROW', 'Ligne de calque'], ['H_FIELD', 'Champs numériques'], ['H_SHEET_MID', 'Panneau bas mobile'], ['H_HANDLE', 'Poignée du panneau bas'], ['S1', 'Marges internes'], ['S3', 'Écart entre sections'], ['S4', 'Écart entre pastilles']]) +
    notes([
      'Scène : rotation libre (glisser), zoom (molette, pincer). Vues rapides FACE / DOS / 3/4 animées, instantanées avec « mouvement réduit ».',
      'L’étiquette d’aperçu indicatif reste visible dans tous les états, y compris pendant l’export.',
      'Annuler / rétablir : boutons ↶ ↷ et Ctrl+Z / Ctrl+Y. Désactivés quand l’historique est vide.',
      'Les panneaux défilent indépendamment de la scène.',
      'Sur mobile, les réglages du vêtement passent dans l’onglet « Vêtement » du panneau bas.',
      'Détail A : voir UI-HDL-001 (zone de toucher 44 autour de la poignée de 12).',
      'Le nom de la création est un champ éditable ; il est tronqué avec « … » s’il dépasse.',
    ]),
}));

W('scr-001.html', page('scr-001.html', {
  title: 'APP-SCR-001 · Mes créations',
  cart: cartScr('APP-SCR-001', 'Mes créations', 'Ordinateur 1440 × 900 · mobile 390 × 844', 'W_MAX, S3, S4, TOUCH_MIN'),
  body: fig(listDesktop(), 'Ordinateur · 4 colonnes · menu ⋯ ouvert sur la 2e carte (A)') +
    `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">${fig(listMobile(), 'Mobile · 2 colonnes · bouton fixe dans la zone du pouce')}${fig(listMobile(true), 'Mobile · état vide')}</div>` +
    `<h2>États</h2><div class="tw"><table><tr><th>État</th><th>Ce qui change</th></tr>
<tr><td>Chargement</td><td>Cartes squelettes (contours pointillés) le temps de lire IndexedDB.</td></tr>
<tr><td>Vide</td><td>Voir la 2e vue mobile.</td></tr>
<tr><td>Stockage indisponible</td><td>Avertissement (UI-WRN-001) : navigation privée ou stockage bloqué ; les créations ne seront pas gardées.</td></tr>
<tr><td>Import refusé</td><td>Avertissement : fichier .json invalide, rien n’est modifié.</td></tr>
<tr><td>Renommer <i>(déduit)</i></td><td>Le nom devient un champ éditable dans la carte ; Entrée valide, Échap annule.</td></tr>
<tr><td>Supprimer <i>(déduit)</i></td><td>Demande de confirmation (fenêtre UI-DLG, même gabarit que APP-SCR-004).</td></tr></table></div>` +
    varTable([['W_MAX', 'Largeur du contenu'], ['S3', 'Écart entre cartes (ordinateur)'], ['S4', 'Écart entre cartes (mobile)'], ['R1', 'Rayon des cartes'], ['R2', 'Rayon de l’aperçu, concentrique'], ['TOUCH_MIN', 'Bouton ⋯']]) +
    notes([
      'Tri : création modifiée le plus récemment en premier.',
      'Toucher l’aperçu ou le nom ouvre la création dans l’éditeur.',
      'L’aperçu est une miniature générée à la sauvegarde.',
      'Le nom de l’app est [TBD] : l’emplacement est réservé.',
    ]),
}));

W('scr-002.html', page('scr-002.html', {
  title: 'APP-SCR-002 · Choix du vêtement',
  cart: cartScr('APP-SCR-002', 'Choix du vêtement', 'Ordinateur 1440 × 900 · mobile 390 × 844', 'W_COL, H_CARD_TYPE_*, H_CARD_FIT'),
  body: fig(chooseDesktop(), 'Ordinateur · colonne centrale W_COL') + fig(chooseMobile(), 'Mobile') +
    varTable([['W_COL', 'Colonne centrale'], ['H_CARD_TYPE_D', 'Carte de type, ordinateur'], ['H_CARD_TYPE_M', 'Carte de type, mobile'], ['H_CARD_FIT', 'Carte de coupe'], ['S3', 'Écart entre cartes'], ['S5', 'Marge avant le bouton']]) +
    notes([
      'Sélection : double contour (contour décalé de 4). Les cartes se comportent comme des boutons radio (clavier : flèches).',
      'Valeurs par défaut : tee-shirt, coupe normale. La couleur se choisit dans l’éditeur.',
      'Si un modèle 3D manque dans garments.json, sa carte est désactivée avec la mention « modèle à venir ».',
      'Les silhouettes sont des emplacements [TBD] ; elles pourront être rendues depuis les modèles 3D.',
    ]),
}));

W('scr-004.html', page('scr-004.html', {
  title: 'APP-SCR-004 · Fenêtre d’export',
  cart: cartScr('APP-SCR-004', 'Fenêtre d’export', 'Ordinateur 1440 × 900 · mobile 390 × 844', 'W_DIALOG, H_ROW, H_BTN'),
  body: fig(exportDesktop(), 'Ordinateur · fenêtre centrée au-dessus de l’éditeur') + fig(exportMobile(), 'Mobile · panneau plein écran') +
    fig(exportStates(), 'États de la zone de pied') +
    varTable([['W_DIALOG', 'Largeur de la fenêtre'], ['H_ROW', 'Ligne de contenu'], ['H_BTN', 'Boutons'], ['S3', 'Marge interne'], ['R1', 'Rayon']]) +
    notes([
      'La fenêtre liste ce que contiendra le ZIP ; rien n’est à cocher, tout est inclus.',
      'Les avertissements non résolus sont repris tels quels dans la fiche PDF ; ils ne bloquent pas l’export.',
      'Échap ou ✕ ferme la fenêtre ; le focus revient sur le bouton « Exporter ».',
      'Pendant la génération, la scène peut tourner pour les captures : l’éditeur est masqué par le voile.',
    ]),
}));

W('doc-001.html', page('doc-001.html', {
  title: 'APP-DOC-001 · Fiche de fabrication PDF',
  cart: [['ID', 'APP-DOC-001'], ['Document', 'Fiche de fabrication'], ['Format', 'A4 portrait · 595 × 842 pt'], ['Pages', 'Une par zone imprimée'], ['Variables', 'M_PDF']],
  body: fig(pdfSheet(), 'Page type · zone devant') +
    notes([
      'X_CM : distance horizontale de l’axe central au <b>centre</b> de l’élément ; Y_CM : distance verticale du bas du col au <b>centre</b> de l’élément. Point de référence proposé, à valider.',
      'Le schéma est à l’échelle de la zone ; l’échelle exacte est imprimée sous le schéma (ex. « 1:4 »).',
      'Rotation en degrés, sens horaire positif.',
      'Le tableau reprend chaque élément : type, fichier source ou texte, cotes, dpi effectifs (images), police et couleur (textes).',
      'Monochrome, comme les plans cotés de ce dossier.',
    ]),
}));

W('flw-001.html', page('flw-001.html', {
  title: 'APP-FLW-001 · Parcours',
  cart: [['ID', 'APP-FLW-001'], ['Parcours', 'Créer, rouvrir, importer, exporter'], ['Écrans', '4']],
  body: fig(flow(), 'Parcours principal et branches') +
    notes([
      'Le cahier des charges mentionne un parcours en 6 étapes dont le schéma n’était pas lisible dans l’export Markdown. Ce parcours est reconstruit à partir des sections 5, 7 et 8 : à confirmer.',
      'La sauvegarde est automatique : quitter l’éditeur ne demande jamais de confirmation.',
      'L’éditeur est le cœur : chaque ajout, modification et l’export y ramènent.',
    ]),
}));

W('components.html', page('components.html', {
  title: 'Composants',
  cart: [['Composants', '11'], ['Référence', 'tokens.json'], ['Cible tactile', 'TOUCH_MIN = 44']],
  body: components(),
}));

// index
const inv = [
  ['APP-SCR-001', 'Mes créations', 'Liste, ouvrir, renommer, dupliquer, supprimer, importer / exporter .json, nouvelle création', 'chargement, vide, liste, stockage indisponible, import refusé'],
  ['APP-SCR-002', 'Choix du vêtement', 'Choisir type et coupe avant d’entrer dans l’éditeur', 'normal, modèle manquant'],
  ['APP-SCR-003', 'Éditeur 3D', 'Vêtement, couleur, éléments, calques, manipulation, vues, contrôles qualité, annuler / rétablir', 'chargement, erreur de modèle, aucun élément, sélection image / texte, zone [TBD], fichier refusé'],
  ['APP-SCR-004', 'Fenêtre d’export', 'Résumer le contenu du ZIP et le générer', 'prêt, génération, succès, erreur'],
  ['APP-DOC-001', 'Fiche de fabrication PDF', 'Document produit pour l’atelier (pas un écran)', 'une page par zone'],
];
const tokRows = Object.keys(flat).map((k) => `<tr><td>${k}</td><td>${flat[k] === T[k] ? T[k] : `${flat[k]} = ${T[k]}`}</td><td>${tokens.notes[k] || ''}</td></tr>`).join('');
W('index.html', page('index.html', {
  title: 'Configurateur 3D — maquettes',
  cart: [['Projet', 'configurateur-3d'], ['Phase', '1 · maquettes'], ['Statut', 'Proposition à valider'], ['Date', '28 oct. 2026']],
  body: `<h2>Brief</h2><pre>${esc(readFileSync(join(root, 'brief.md'), 'utf8').split('```')[1].trim())}</pre>
<h2>Inventaire des écrans</h2><div class="tw"><table><tr><th>ID</th><th>Écran</th><th>Ce qu’il permet</th><th>États</th></tr>${inv.map((r) => `<tr><td>${r[0]}</td><td><a href="${r[0].slice(4).toLowerCase()}.html">${r[1]}</a></td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</table></div>
<h2>Tokens proposés</h2><p>Valeurs proposées, à valider. Elles sont exportées dans <code>export/tokens.css</code> et <code>export/tailwind.theme.css</code>.</p>
<div class="tw"><table><tr><th>Variable</th><th>Valeur</th><th>Note</th></tr>${tokRows}</table></div>
<h2>Valeurs [TBD]</h2><ul>${tokens.tbd.map((t) => `<li>${t}</li>`).join('')}</ul>`,
}));

// exports
const kebab = (k) => k.toLowerCase().replace(/_/g, '-');
const cssVars = GROUPS.flatMap((g) => Object.keys(tokens[g]).map((k) => `  --${kebab(k)}: ${T[k]}px;`));
const todo = tokens.tbd.map((t) => `  /* TODO ${t} : [TBD] */`);
writeFileSync(join(root, 'export', 'tokens.css'), `/* Généré par docs/maquettes/src/build.mjs — ne pas modifier à la main. */\n:root {\n${cssVars.join('\n')}\n${todo.join('\n')}\n}\n`);
const tw = [
  ...Object.keys(tokens.space).map((k) => `  --spacing-${kebab(k)}: ${T[k]}px;`),
  ...Object.keys(tokens.size).map((k) => `  --spacing-${kebab(k)}: ${T[k]}px;`),
  ...['W_PANEL', 'W_MAX', 'W_COL', 'W_DIALOG', 'H_SHEET_PEEK', 'H_SHEET_MID'].map((k) => `  --spacing-${kebab(k)}: ${T[k]}px;`),
  ...Object.keys(tokens.radius).map((k) => `  --radius-${kebab(k)}: ${T[k]}px;`),
  `  --breakpoint-desk: ${T.BP_DESKTOP}px;`,
];
const twCss = `/* Généré par docs/maquettes/src/build.mjs — à importer après "tailwindcss" (Tailwind v4). */\n@theme {\n${tw.join('\n')}\n}\n`;
writeFileSync(join(root, 'export', 'tailwind.theme.css'), twCss);
writeFileSync(join(root, '..', '..', 'src', 'app', 'tokens.css'), twCss);
console.log('Feuilles générées :', SHEETS.length);
