// Génère 4 modèles GLB provisoires (formes simples) dans public/models/placeholder/.
// Ils respectent le contrat des vrais modèles : matériau unique "fabric", vêtement face à +Z,
// haut du col à y = 0, unités en mètres. Usage : npm run models:placeholder
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models', 'placeholder');
mkdirSync(out, { recursive: true });

// Demi-silhouettes (côté droit), du col vers l'ourlet. neck = demi-largeur du col, dip = creux du col devant.
const SHAPES = {
  'tshirt-normal': { neck: 0.09, dip: 0.08, pts: [[0.24, -0.04], [0.34, -0.2], [0.27, -0.27], [0.23, -0.2], [0.24, -0.72]] },
  'tshirt-oversize': { neck: 0.1, dip: 0.08, pts: [[0.3, -0.07], [0.41, -0.32], [0.33, -0.4], [0.29, -0.29], [0.3, -0.78]] },
  'sweater-normal': { neck: 0.085, dip: 0.06, pts: [[0.24, -0.04], [0.52, -0.62], [0.45, -0.67], [0.23, -0.22], [0.23, -0.68]] },
  'sweater-oversize': { neck: 0.095, dip: 0.07, pts: [[0.3, -0.07], [0.58, -0.68], [0.5, -0.73], [0.29, -0.3], [0.29, -0.74]] },
};

function buildGeometry({ neck, dip, pts }) {
  const shape = new THREE.Shape();
  shape.moveTo(neck, 0);
  for (const [x, y] of pts) shape.lineTo(x, y);
  for (const [x, y] of pts.slice().reverse()) shape.lineTo(-x, y);
  shape.lineTo(-neck, 0);
  shape.quadraticCurveTo(0, -dip * 2, neck, 0);

  const depth = 0.14, bevel = 0.03;
  let g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: 0.02, bevelSegments: 4, curveSegments: 16 });
  g.translate(0, 0, -depth / 2);
  g = new TessellateModifier(0.03, 10).modify(g);
  // Bombe légèrement le torse pour que les décalques suivent une surface courbe.
  const p = g.attributes.position;
  const zMax = depth / 2 + bevel;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    // Décalage proportionnel à z : continu sur les flancs (z ≈ 0), maximal sur les faces.
    p.setZ(i, z - (z / zMax) * 0.5 * x * x);
  }
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  return g;
}

function toGlb(geometry, name) {
  const pos = geometry.attributes.position.array;
  const nor = geometry.attributes.normal.array;
  const uv = geometry.attributes.uv.array;
  const idx = new Uint32Array(geometry.index.array);
  const parts = [new Float32Array(pos), new Float32Array(nor), new Float32Array(uv), idx];
  const views = [];
  let offset = 0;
  const chunks = [];
  for (const [i, a] of parts.entries()) {
    const bytes = Buffer.from(a.buffer, a.byteOffset, a.byteLength);
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target: i === 3 ? 34963 : 34962 });
    chunks.push(bytes);
    offset += bytes.length;
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  }
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const count = geometry.attributes.position.count;
  const json = {
    asset: { version: '2.0', generator: 'configurateur-3d placeholder' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ name: 'fabric', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: 'VEC3', min: [min.x, min.y, min.z], max: [max.x, max.y, max.z] },
      { bufferView: 1, componentType: 5126, count, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count, type: 'VEC2' },
      { bufferView: 3, componentType: 5125, count: idx.length, type: 'SCALAR' },
    ],
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json));
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
  return Buffer.concat([header, ch(jsonBuf.length, 0x4e4f534a), jsonBuf, ch(bin.length, 0x004e4942), bin]);
}

for (const [name, def] of Object.entries(SHAPES)) {
  const glb = toGlb(buildGeometry(def), name);
  writeFileSync(join(out, `${name}.glb`), glb);
  console.log(`${name}.glb · ${(glb.length / 1024).toFixed(0)} Ko`);
}
