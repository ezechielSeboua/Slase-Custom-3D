import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import type { Design } from '@/types/design';
import { colorById } from '@/lib/config';
import { exportRootRef } from '@/features/scene/sceneStore';
import { slug } from '@/features/storage/json';
import { fr } from '@/i18n/fr';

/** Décalage des décalques hors du tissu (m) : sans « polygon offset » dans le fichier, ils scintilleraient. */
const DECAL_LIFT_M = 0.001;
/** Écart supplémentaire (m) entre deux calques superposés. */
const DECAL_LAYER_STEP_M = 0.0004;

/**
 * Copie exportable du vêtement personnalisé : tissu coloré + un décalque texturé par élément visible.
 * Les repères d'édition (zones, poignées) ne font pas partie de l'objet copié.
 */
function exportObject(design: Design): THREE.Object3D {
  const root = exportRootRef.current;
  if (!root) throw new Error('scene');

  const copy = root.clone(true);
  copy.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.userData.elementId) return;
    // Géométrie propre à l'export, décollée le long de ses normales ; l'échelle du tissu est compensée.
    // Copie dans une géométrie ordinaire : DecalGeometry.clone() rappelle son constructeur sans arguments et échoue.
    const g = new THREE.BufferGeometry().copy(mesh.geometry);
    const pos = g.attributes.position, nor = g.attributes.normal;
    const scale = new THREE.Vector3();
    mesh.getWorldScale(scale);
    // Chaque calque un peu plus haut que le précédent : l'ordre d'empilement de l'éditeur est conservé.
    const order = Number(mesh.userData.order) || 0;
    const lift = (DECAL_LIFT_M + order * DECAL_LAYER_STEP_M) / Math.max(scale.x, 1e-6);
    if (nor) {
      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i, pos.getX(i) + nor.getX(i) * lift, pos.getY(i) + nor.getY(i) * lift, pos.getZ(i) + nor.getZ(i) * lift);
      }
    }
    mesh.geometry = g;
    mesh.name = `element-${mesh.userData.elementId}`;
  });

  const color = colorById(design.color);
  copy.name = design.name;
  copy.userData = {
    app: fr.appName,
    creation: design.name,
    garment: fr.garments[design.garment],
    fit: fr.fits[design.fit],
    color: color ? `${color.name} ${color.hex}` : design.color,
    notice: fr.previewNotice,
    credits: fr.export.glbCredits,
  };
  return copy;
}

export async function buildGlb(design: Design): Promise<{ blob: Blob; filename: string }> {
  const data = await new GLTFExporter().parseAsync(exportObject(design), { binary: true, onlyVisible: true, maxTextureSize: 2048 });
  return { blob: new Blob([data as ArrayBuffer], { type: 'model/gltf-binary' }), filename: `${slug(design.name)}-3d.glb` };
}

/** USDZ pour la réalité augmentée Quick Look (iPhone, iPad) : même contenu que le GLB, posé au sol. */
export async function buildUsdz(design: Design): Promise<Blob> {
  const object = exportObject(design);
  // Quick Look pose le modèle sur la surface détectée : le bas du vêtement va à y = 0.
  const holder = new THREE.Group();
  holder.add(object);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  object.position.y -= box.min.y;
  const data = await new USDZExporter().parseAsync(holder, { quickLookCompatible: true, maxTextureSize: 2048 });
  return new Blob([data], { type: 'model/vnd.usdz+zip' });
}

/** Vrai sur iPhone et iPad (Safari) : le lien `rel="ar"` ouvre Quick Look en réalité augmentée. */
export function supportsQuickLook(): boolean {
  if (typeof document === 'undefined') return false;
  const a = document.createElement('a');
  return Boolean(a.relList?.supports?.('ar'));
}

/** Ouvre le vêtement personnalisé dans Quick Look. Safari exige un lien `rel="ar"` contenant une image. */
export async function openQuickLook(design: Design) {
  const url = URL.createObjectURL(await buildUsdz(design));
  const a = document.createElement('a');
  a.rel = 'ar';
  // La taille réelle doit être respectée : on interdit le redimensionnement à deux doigts.
  a.href = `${url}#allowsContentScaling=0`;
  a.appendChild(document.createElement('img'));
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
