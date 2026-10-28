// Mesure les manches de chaque modèle de config/garments.json et affiche les zones « manche gauche / droite »
// à reporter dans la config. Repère d'une manche : origine sur l'axe à la racine (épaule), « up » vers l'épaule,
// normale vers l'extérieur du bras ; y en cm le long de la manche vers le poignet, x en travers.
// Usage : node scripts/measure-sleeves.mjs [--write]
import { readFileSync, writeFileSync } from 'node:fs';

const CONFIG = 'config/garments.json';
const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
const r3 = (v) => Math.round(v * 1000) / 1000;

function worldPositions(path) {
  const b = readFileSync('public' + path);
  const len = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + len));
  const bin = b.subarray(20 + len + 8);
  const node = j.nodes.find((n) => n.mesh === 0);
  const s = node.scale?.[0] ?? 1, t = node.translation ?? [0, 0, 0];
  const a = j.accessors[j.meshes[0].primitives[0].attributes.POSITION];
  const v = j.bufferViews[a.bufferView];
  const out = [];
  for (let i = 0; i < a.count; i++) {
    const o = (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * 12;
    out.push([0, 1, 2].map((k) => bin.readFloatLE(o + k * 4) * s + t[k]));
  }
  return out;
}

function sleeveZone(P, side) {
  const minY = Math.min(...P.map((p) => p[1]));
  // Demi-largeur du torse : la plus petite largeur dans le bas du vêtement, sous les manches.
  const rows = new Map();
  // On ignore ce qui est à plus de 30 cm de l'axe : les poignets d'un sweater peuvent descendre jusqu'à l'ourlet.
  for (const p of P) {
    if (Math.abs(p[0]) > 0.3) continue;
    const k = Math.round(p[1] * 100);
    rows.set(k, Math.max(rows.get(k) ?? 0, Math.abs(p[0])));
  }
  const low = [...rows.entries()].filter(([k]) => k / 100 > minY + 0.01 && k / 100 < minY + 0.12).map(([, x]) => x);
  const torsoHalf = Math.min(...low);
  const edge = torsoHalf + 0.03;
  const S = P.filter((p) => p[0] * side > edge).map((p) => [p[0] * side, p[1], p[2]]);
  const avg = (pts) => [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length);

  // Axe de la manche : du centre de sa racine (juste après le torse) au centre de son extrémité (poignet).
  const maxX = Math.max(...S.map((p) => p[0]));
  const root = avg(S.filter((p) => p[0] < edge + 0.03));
  const end = avg(S.filter((p) => p[0] > 0.93 * maxX));
  const L = Math.hypot(end[0] - root[0], end[1] - root[1]);
  const d = [(end[0] - root[0]) / L, (end[1] - root[1]) / L];
  const proj = S.map((p) => (p[0] - root[0]) * d[0] + (p[1] - root[1]) * d[1]);
  // La zone démarre un peu avant la racine mesurée, côté épaule.
  const START = -0.03;
  const sMin = START, sMax = Math.max(...proj);
  const origin = [root[0] + d[0] * START, root[1] + d[1] * START, root[2]];
  // Largeur : étendue en z au milieu de la manche ; on garde 70 % pour rester sur la face visible.
  const mid = S.filter((_, i) => proj[i] > sMin + 0.3 * (sMax - sMin) && proj[i] < sMin + 0.7 * (sMax - sMin));
  const zr = Math.max(...mid.map((p) => p[2])) - Math.min(...mid.map((p) => p[2]));
  const n = [-d[1], d[0]]; // perpendiculaire à l'axe, vers l'extérieur et le haut
  const back = (v) => [v[0] * side, v[1], v[2]];
  return {
    origin: back(origin).map(r3),
    normal: back([n[0], n[1], 0]).map(r3),
    up: back([-d[0], -d[1], 0]).map(r3),
    surface_cm: { width: Math.floor(zr * 70), top: 0, height: Math.floor((sMax - sMin) * 100 - 2) },
  };
}

for (const g of cfg.garments) {
  for (const [fit, m] of Object.entries(g.fits)) {
    const P = worldPositions(m.model);
    // Gauche et droite côté porteur : la manche gauche est du côté +x (à droite de l'image vue de face).
    m.zones.left_sleeve = sleeveZone(P, 1);
    m.zones.right_sleeve = sleeveZone(P, -1);
    console.log(g.id, fit, JSON.stringify(m.zones.left_sleeve));
  }
}
if (process.argv.includes('--write')) {
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`${CONFIG} mis à jour.`);
}
