import * as THREE from 'three';
import type { ZoneModel } from '@/lib/config';

/**
 * Repère d'une zone : origine au bas du col sur l'axe central (à la racine de la manche pour une manche),
 * `x` vers la droite vue depuis l'extérieur, `up` vers le haut (vers l'épaule), `n` sortant du tissu. Les cm se mesurent dans ce plan : x vers la droite, y vers le bas.
 */
export interface ZoneBasis {
  o: THREE.Vector3;
  n: THREE.Vector3;
  x: THREE.Vector3;
  up: THREE.Vector3;
  plane: THREE.Plane;
  upc: number;
}

export function zoneBasis(z: ZoneModel, unitsPerCm: number): ZoneBasis {
  const n = new THREE.Vector3(...z.normal).normalize();
  const x = new THREE.Vector3().crossVectors(new THREE.Vector3(...(z.up ?? [0, 1, 0])), n).normalize();
  // « up » recalculé pour former un repère orthonormé avec la normale.
  const up = new THREE.Vector3().crossVectors(n, x).normalize();
  const o = new THREE.Vector3(...z.origin);
  return { o, n, x, up, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, o), upc: unitsPerCm };
}

export function cmToPlane(b: ZoneBasis, xCm: number, yCm: number): THREE.Vector3 {
  return b.o.clone().addScaledVector(b.x, xCm * b.upc).addScaledVector(b.up, -yCm * b.upc);
}

export function planeToCm(b: ZoneBasis, p: THREE.Vector3): { x: number; y: number } {
  const d = p.clone().sub(b.o);
  return { x: d.dot(b.x) / b.upc, y: -d.dot(b.up) / b.upc };
}

const raycaster = new THREE.Raycaster();

/** Projette un point du plan de zone sur le tissu, le long de la normale de la zone. */
export function projectToSurface(mesh: THREE.Mesh, b: ZoneBasis, planePoint: THREE.Vector3): THREE.Vector3 | null {
  raycaster.set(planePoint.clone().addScaledVector(b.n, 2), b.n.clone().negate());
  raycaster.far = 4;
  const hit = raycaster.intersectObject(mesh, false)[0];
  return hit ? hit.point : null;
}

/** Point du plan de zone sous le pointeur. */
export function pointerToPlane(
  b: ZoneBasis,
  camera: THREE.Camera,
  dom: HTMLElement,
  clientX: number,
  clientY: number,
): THREE.Vector3 | null {
  const r = dom.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(b.plane, new THREE.Vector3());
}

/** Orientation monde d'un décalque : axes de la zone, puis rotation horaire de `deg` vue de face. */
export function decalQuaternion(b: ZoneBasis, deg: number): THREE.Quaternion {
  const m = new THREE.Matrix4().makeBasis(b.x, b.up, b.n);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  return q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (-deg * Math.PI) / 180));
}

/** Position (cm) d'un point exprimé dans le repère de l'élément (cm), centre + rotation horaire. */
export function elementPointCm(cx: number, cy: number, deg: number, lx: number, ly: number) {
  const r = (deg * Math.PI) / 180;
  // y vers le bas : une rotation horaire en vue de face garde la formule standard dans ce repère.
  return { x: cx + lx * Math.cos(r) - ly * Math.sin(r), y: cy + lx * Math.sin(r) + ly * Math.cos(r) };
}
