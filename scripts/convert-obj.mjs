// Convertit un modèle OBJ (une seule pièce) en GLB pour l'app : positions, UV, normales lisses recalculées,
// un seul matériau "fabric" sans texture (l'app colore le tissu). Le résultat passe ensuite par prepare-model.mjs.
// Usage : node scripts/convert-obj.mjs <entrée.obj> <sortie.glb>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('Usage : node scripts/convert-obj.mjs <entrée.obj> <sortie.glb>');
  process.exit(1);
}

const V = [], VT = [];
const corners = []; // [indice position, indice uv] par sommet de triangle
for (const line of readFileSync(input, 'utf8').split('\n')) {
  const p = line.trim().split(/\s+/);
  if (p[0] === 'v') V.push([+p[1], +p[2], +p[3]]);
  else if (p[0] === 'vt') VT.push([+p[1], +p[2]]);
  else if (p[0] === 'f') {
    const idx = p.slice(1).map((s) => {
      const [v, t] = s.split('/');
      const vi = +v, ti = t ? +t : 0;
      return [vi < 0 ? V.length + vi : vi - 1, ti ? (ti < 0 ? VT.length + ti : ti - 1) : -1];
    });
    for (let k = 1; k + 1 < idx.length; k++) corners.push(idx[0], idx[k], idx[k + 1]);
  }
}

// Normales lisses : accumulées par position, donc continues à travers les coutures d'UV.
const acc = V.map(() => [0, 0, 0]);
for (let i = 0; i < corners.length; i += 3) {
  const [a, b, c] = [corners[i][0], corners[i + 1][0], corners[i + 2][0]].map((j) => V[j]);
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  for (const k of [0, 1, 2]) for (const j of [corners[i][0], corners[i + 1][0], corners[i + 2][0]]) acc[j][k] += n[k];
}
const normals = acc.map((n) => { const l = Math.hypot(...n) || 1; return n.map((x) => x / l); });

// Un sommet GLB par couple (position, uv).
const key = new Map(), pos = [], nor = [], uv = [], index = [];
for (const [vi, ti] of corners) {
  const k = `${vi}/${ti}`;
  let id = key.get(k);
  if (id === undefined) {
    id = pos.length / 3;
    key.set(k, id);
    pos.push(...V[vi]);
    nor.push(...normals[vi]);
    const t = ti >= 0 ? VT[ti] : [0, 0];
    uv.push(t[0], 1 - t[1]); // l'OBJ a l'origine des UV en bas, le glTF en haut
  }
  index.push(id);
}

const parts = [new Float32Array(pos), new Float32Array(nor), new Float32Array(uv), new Uint32Array(index)];
const chunks = [], views = [];
let offset = 0;
parts.forEach((a, i) => {
  const b = Buffer.from(a.buffer);
  views.push({ buffer: 0, byteOffset: offset, byteLength: b.length, target: i === 3 ? 34963 : 34962 });
  chunks.push(b);
  offset += b.length;
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
});
const count = pos.length / 3;
const min = [0, 1, 2].map((k) => Math.min(...V.map((v) => v[k]))), max = [0, 1, 2].map((k) => Math.max(...V.map((v) => v[k])));
const gltf = {
  asset: { version: '2.0', generator: 'configurateur-3d convert-obj.mjs' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'garment' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
  materials: [{ name: 'fabric', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 } }],
  accessors: [
    { bufferView: 0, componentType: 5126, count, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count, type: 'VEC2' },
    { bufferView: 3, componentType: 5125, count: index.length, type: 'SCALAR' },
  ],
  bufferViews: views,
  buffers: [{ byteLength: offset }],
};
let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const bin = Buffer.concat(chunks);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const ch = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h; };
writeFileSync(output, Buffer.concat([header, ch(json.length, 0x4e4f534a), json, ch(bin.length, 0x004e4942), bin]));
console.log(`${output} · ${count} sommets · ${index.length / 3} triangles · ${(bin.length / 1048576).toFixed(2)} Mo`);
