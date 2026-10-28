// Dérive un sweater approximatif d'un tee-shirt préparé par prepare-model.mjs, sans changer la topologie :
// manches allongées le long de leur axe, abaissées autour de leur racine, affinées jusqu'au poignet ;
// bas du vêtement resserré en bande. Les plis restent ceux du tee-shirt : c'est une approximation.
// Usage : node scripts/derive-sweater.mjs <tee préparé.glb> <sortie.glb> [longueur de manche en cm] [abaissement en degrés]
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input, output, sleeveArg = '58', dropArg = '22'] = process.argv;
if (!input || !output) {
  console.error('Usage : node scripts/derive-sweater.mjs <tee préparé.glb> <sortie.glb> [manche cm] [abaissement °]');
  process.exit(1);
}
const SLEEVE_M = Number(sleeveArg) / 100;
const DROP = (-Number(dropArg) * Math.PI) / 180;
const CUFF_M = 0.06, CUFF_SCALE = 0.85, SLEEVE_TAPER = 0.85;
// Fin de manche (ourlet coupé en biais) : décalée sans être étirée, pour ne pas amplifier le biais.
const HEM_M = 0.05;
const BAND_M = 0.07, BAND_SCALE = 0.93;

const src = readFileSync(input);
const jsonLen = src.readUInt32LE(12);
const gltf = JSON.parse(src.subarray(20, 20 + jsonLen).toString());
const binLen = src.readUInt32LE(20 + jsonLen);
const bin = Buffer.from(src.subarray(20 + jsonLen + 8, 20 + jsonLen + 8 + binLen));
const node = gltf.nodes.find((n) => n.mesh === 0);
const sc = node.scale?.[0] ?? 1, tr = node.translation ?? [0, 0, 0];
const prim = gltf.meshes[0].primitives[0];

const attr = (name) => {
  const a = gltf.accessors[prim.attributes[name]];
  const v = gltf.bufferViews[a.bufferView];
  const base = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = v.byteStride ?? 12;
  return {
    a,
    get: (i) => [0, 1, 2].map((k) => bin.readFloatLE(base + i * stride + k * 4)),
    set: (i, p) => p.forEach((x, k) => bin.writeFloatLE(x, base + i * stride + k * 4)),
  };
};
const POS = attr('POSITION'), NOR = attr('NORMAL');
const n = POS.a.count;
const world = Array.from({ length: n }, (_, i) => POS.get(i).map((x, k) => x * sc + tr[k]));

// ---------- repères : largeur du torse, aisselle, axe de manche ----------
const minY = Math.min(...world.map((p) => p[1]));
const rowMax = new Map();
for (const p of world) {
  const k = Math.round(p[1] * 100);
  rowMax.set(k, Math.max(rowMax.get(k) ?? 0, Math.abs(p[0])));
}
const lower = [...rowMax.entries()].filter(([k]) => k / 100 < minY + 0.3).map(([, x]) => x).sort((a, b) => a - b);
const torsoHalf = lower[Math.floor(lower.length / 2)];
let armpitY = minY;
for (const [k, x] of [...rowMax.entries()].sort((a, b) => a[0] - b[0])) {
  if (x > torsoHalf + 0.03) { armpitY = k / 100; break; }
}
const maxX = Math.max(...world.map((p) => Math.abs(p[0])));
const avg = (pts) => [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
const sideAbs = (p) => [Math.abs(p[0]), p[1], p[2]];
const endC = avg(world.filter((p) => Math.abs(p[0]) > 0.93 * maxX).map(sideAbs));
const rootC = avg(world.filter((p) => Math.abs(Math.abs(p[0]) - torsoHalf) < 0.015 && p[1] > armpitY).map(sideAbs));
const axis = [endC[0] - rootC[0], endC[1] - rootC[1], 0];
const L0 = Math.hypot(axis[0], axis[1]);
const d = [axis[0] / L0, axis[1] / L0, 0];
const sCap = Math.max(0.01, L0 - HEM_M);
const k = (SLEEVE_M - HEM_M) / sCap;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

for (let i = 0; i < n; i++) {
  let [x, y, z] = world[i];
  let normal = NOR.get(i);
  const side = Math.sign(x) || 1;
  let ax = Math.abs(x);

  // Manche : poids nul sur le corps, plein au-delà de l'épaule, uniquement au-dessus de l'aisselle.
  const w = smooth(torsoHalf - 0.005, torsoHalf + 0.06, ax) * smooth(armpitY - 0.03, armpitY + 0.01, y);
  if (w > 0) {
    const rel = [ax - rootC[0], y - rootC[1], z - rootC[2]];
    const s = Math.max(0, rel[0] * d[0] + rel[1] * d[1]);
    const perp = [rel[0] - d[0] * s, rel[1] - d[1] * s, rel[2]];
    const stretched = s <= sCap ? s * k : sCap * k + (s - sCap);
    const sNew = lerp(s, stretched, w);
    const u = Math.min(1, sNew / SLEEVE_M);
    let taper = lerp(1, SLEEVE_TAPER, u);
    taper *= lerp(1, CUFF_SCALE, smooth(SLEEVE_M - HEM_M - CUFF_M, SLEEVE_M - HEM_M, sNew) * w);
    const t = lerp(1, taper, w);
    ax = rootC[0] + d[0] * sNew + perp[0] * t;
    y = rootC[1] + d[1] * sNew + perp[1] * t;
    z = rootC[2] + perp[2] * t;
    // Abaissement autour du centre de la racine de manche.
    const a = DROP * w, px = rootC[0], py = rootC[1];
    const dx = ax - px, dy = y - py;
    ax = px + dx * Math.cos(a) - dy * Math.sin(a);
    y = py + dx * Math.sin(a) + dy * Math.cos(a);
    const nx = normal[0] * side, ny = normal[1];
    normal = [(nx * Math.cos(a) - ny * Math.sin(a)) * side, nx * Math.sin(a) + ny * Math.cos(a), normal[2]];
  }
  x = ax * side;

  // Bande du bas : resserre le vêtement près de l'ourlet.
  const b = smooth(minY + BAND_M, minY + BAND_M * 0.3, y);
  if (b > 0) {
    x *= lerp(1, BAND_SCALE, b);
    z *= lerp(1, (1 + BAND_SCALE) / 2, b);
  }

  POS.set(i, [(x - tr[0]) / sc, (y - tr[1]) / sc, (z - tr[2]) / sc]);
  const nl = Math.hypot(...normal) || 1;
  NOR.set(i, normal.map((v) => v / nl));
}

// min / max de l'accesseur de positions
const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < n; i++) POS.get(i).forEach((v, k) => { mins[k] = Math.min(mins[k], v); maxs[k] = Math.max(maxs[k], v); });
POS.a.min = mins;
POS.a.max = maxs;
gltf.asset.extras = { ...(gltf.asset.extras ?? {}), derived: `derive-sweater.mjs · manche ${sleeveArg} cm · ${dropArg}°` };

let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const ch = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h; };
writeFileSync(output, Buffer.concat([header, ch(json.length, 0x4e4f534a), json, ch(bin.length, 0x004e4942), bin]));
console.log(`${output} · torse ${(torsoHalf * 200).toFixed(1)} cm · aisselle y=${armpitY} · manche d'origine ${(L0 * 100).toFixed(1)} cm → ${sleeveArg} cm`);
