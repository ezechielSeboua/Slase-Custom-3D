// Prépare un GLB externe (ex. Meshy) pour l'app :
// - renomme son matériau en "fabric" et retire la texture de couleur (l'app colore le tissu) ;
// - garde la texture de relief (normal map) si elle existe ;
// - met le modèle à l'échelle réelle (mètres) et place le haut du col à y = 0, via la transformation du nœud ;
// - affiche les repères à reporter dans config/garments.json (bas du col devant / dos, surface imprimable).
// Usage : node scripts/prepare-model.mjs <entrée.glb> <sortie.glb> <longueur du col à l'ourlet, en cm>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input, output, lengthArg] = process.argv;
const lengthCm = Number(lengthArg);
if (!input || !output || !(lengthCm > 0)) {
  console.error('Usage : node scripts/prepare-model.mjs <entrée.glb> <sortie.glb> <longueur en cm>');
  process.exit(1);
}

const src = readFileSync(input);
const jsonLen = src.readUInt32LE(12);
const gltf = JSON.parse(src.subarray(20, 20 + jsonLen).toString());
const bin = src.subarray(20 + jsonLen + 8, 20 + jsonLen + 8 + src.readUInt32LE(20 + jsonLen));

if (gltf.meshes.length !== 1 || gltf.meshes[0].primitives.length !== 1 || gltf.materials.length !== 1) {
  console.error('Ce script attend un seul maillage, une seule primitive et un seul matériau.');
  process.exit(1);
}

// ---------- mesures sur la géométrie ----------
const prim = gltf.meshes[0].primitives[0];
const acc = gltf.accessors[prim.attributes.POSITION];
const view = gltf.bufferViews[acc.bufferView];
const stride = view.byteStride ?? 12;
const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
const pos = (i) => [0, 1, 2].map((k) => bin.readFloatLE(base + i * stride + k * 4));
const [minX, minY, minZ] = acc.min, [maxX, maxY, maxZ] = acc.max;
const height = maxY - minY;
const scale = lengthCm / 100 / height;
const S = (v) => Math.round(v * scale * 10000) / 10000;

// Bas du col : point le plus haut du tissu sur l'axe central, côté devant (z > 0) et côté dos (z < centre).
const zMid = (minZ + maxZ) / 2;
let frontTop = -Infinity, backTop = -Infinity;
const axis = 0.01 * (maxX - minX);
for (let i = 0; i < acc.count; i++) {
  const [x, y, z] = pos(i);
  if (Math.abs(x) > axis) continue;
  if (z > zMid + 0.05 * (maxZ - minZ)) frontTop = Math.max(frontTop, y);
  else if (z < zMid) backTop = Math.max(backTop, y);
}
// Largeur du torse : plus petite largeur du devant entre 15 % et 85 % de la hauteur sous le col (manches exclues).
const rows = new Map();
for (let i = 0; i < acc.count; i++) {
  const [x, y, z] = pos(i);
  if (z < zMid) continue;
  const k = Math.round(((frontTop - y) / height) * 40);
  const r = rows.get(k) ?? [Infinity, -Infinity];
  r[0] = Math.min(r[0], x);
  r[1] = Math.max(r[1], x);
  rows.set(k, r);
}
const torso = [...rows.entries()].filter(([k]) => k >= 18 && k <= 34).map(([, [a, b]]) => b - a);
const torsoWidthCm = (Math.min(...torso) * scale) * 100;
const frontDepthCm = ((frontTop - minY) * scale) * 100;

// ---------- matériau et textures ----------
const mat = gltf.materials[0];
const dropTexture = mat.pbrMetallicRoughness?.baseColorTexture?.index;
delete mat.pbrMetallicRoughness?.baseColorTexture;
mat.pbrMetallicRoughness = { ...mat.pbrMetallicRoughness, baseColorFactor: [1, 1, 1, 1] };
mat.name = 'fabric';

const usedTextures = new Set();
const walk = (o) => {
  if (o && typeof o === 'object') {
    if (typeof o.index === 'number' && ('texCoord' in o || 'scale' in o || 'strength' in o)) usedTextures.add(o.index);
    Object.values(o).forEach(walk);
  }
};
walk(gltf.materials);
if (dropTexture !== undefined) usedTextures.delete(dropTexture);
const texMap = new Map();
const textures = (gltf.textures ?? []).filter((_, i) => usedTextures.has(i));
(gltf.textures ?? []).forEach((_, i) => usedTextures.has(i) && texMap.set(i, texMap.size));
const remapTex = (o) => {
  if (o && typeof o === 'object') {
    if (typeof o.index === 'number' && texMap.has(o.index) && ('texCoord' in o || 'scale' in o || 'strength' in o)) o.index = texMap.get(o.index);
    Object.values(o).forEach(remapTex);
  }
};
remapTex(gltf.materials);
const usedImages = new Set(textures.map((t) => t.source));
const imgMap = new Map();
(gltf.images ?? []).forEach((_, i) => usedImages.has(i) && imgMap.set(i, imgMap.size));
gltf.images = (gltf.images ?? []).filter((_, i) => usedImages.has(i));
textures.forEach((t) => (t.source = imgMap.get(t.source)));
gltf.textures = textures;
if (!gltf.textures.length) delete gltf.textures;
if (!gltf.images.length) delete gltf.images;

// ---------- reconstruction du binaire sans les vues inutilisées ----------
const usedViews = new Set([...gltf.accessors.map((a) => a.bufferView), ...(gltf.images ?? []).map((im) => im.bufferView)].filter((v) => v !== undefined));
const viewMap = new Map();
const chunks = [];
let offset = 0;
const views = [];
gltf.bufferViews.forEach((v, i) => {
  if (!usedViews.has(i)) return;
  const data = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  viewMap.set(i, views.length);
  views.push({ ...v, byteOffset: offset });
  chunks.push(data);
  offset += data.length;
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
});
gltf.bufferViews = views;
gltf.accessors.forEach((a) => a.bufferView !== undefined && (a.bufferView = viewMap.get(a.bufferView)));
(gltf.images ?? []).forEach((im) => (im.bufferView = viewMap.get(im.bufferView)));
gltf.buffers = [{ byteLength: offset }];

// ---------- échelle et position : haut du col à y = 0, centré en x et z ----------
const node = gltf.nodes.find((n) => n.mesh === 0);
delete node.matrix;
node.scale = [scale, scale, scale];
node.translation = [-S((minX + maxX) / 2), -S(maxY), -S(zMid)];
gltf.asset = { ...gltf.asset, extras: { ...(gltf.asset.extras ?? {}), prepared: `prepare-model.mjs · ${lengthCm} cm` } };

let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const binOut = Buffer.concat(chunks);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binOut.length, 8);
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
writeFileSync(output, Buffer.concat([header, ch(json.length, 0x4e4f534a), json, ch(binOut.length, 0x004e4942), binOut]));

const r = (v) => Math.round(v * 1000) / 1000;
console.log(`${output} · ${((12 + 16 + json.length + binOut.length) / 1048576).toFixed(2)} Mo`);
console.log('Repères pour config/garments.json (unités_per_cm = 0.01) :');
console.log(JSON.stringify({
  front_origin_y: r((frontTop - maxY) * scale),
  back_origin_y: r((backTop - maxY) * scale),
  torso_width_cm: Math.round(torsoWidthCm * 10) / 10,
  collar_to_hem_front_cm: Math.round(frontDepthCm * 10) / 10,
}));
