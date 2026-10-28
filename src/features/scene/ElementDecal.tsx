'use client';

import * as THREE from 'three';
import { useMemo } from 'react';
import { Decal } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { DesignElement, ImageElement, TextElement } from '@/types/design';
import { elementHeightCm } from '@/lib/units';
import { cmToPlane, decalQuaternion, projectToSurface, type ZoneBasis } from '@/features/scene/mapping';
import { useAssetTexture, useTextTexture } from '@/features/scene/textures';

/** Profondeur de projection d'un décalque, en cm : assez pour suivre les plis, pas assez pour traverser le vêtement. */
const DEPTH_CM = 8;

interface Props {
  el: DesignElement;
  mesh: THREE.Mesh;
  basis: ZoneBasis;
  order: number;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}

function DecalWithTexture({ el, mesh, basis, order, onPointerDown, map }: Props & { map: THREE.Texture | null }) {
  const meshRef = useMemo(() => ({ current: mesh }), [mesh]);
  const h = elementHeightCm(el);
  const placement = useMemo(() => {
    mesh.updateWorldMatrix(true, false);
    const surface = projectToSurface(mesh, basis, cmToPlane(basis, el.x_cm, el.y_cm));
    if (!surface) return null;
    const inv = mesh.matrixWorld.clone().invert();
    const local = surface.clone().applyMatrix4(inv);
    const meshQ = new THREE.Quaternion(), meshS = new THREE.Vector3();
    mesh.matrixWorld.decompose(new THREE.Vector3(), meshQ, meshS);
    const q = meshQ.clone().invert().multiply(decalQuaternion(basis, el.rotation_deg));
    const e = new THREE.Euler().setFromQuaternion(q);
    const u = basis.upc;
    return {
      position: [local.x, local.y, local.z] as [number, number, number],
      rotation: [e.x, e.y, e.z] as [number, number, number],
      scale: [(el.width_cm * u) / meshS.x, (h * u) / meshS.y, (DEPTH_CM * u) / meshS.z] as [number, number, number],
    };
  }, [mesh, basis, el.x_cm, el.y_cm, el.width_cm, el.rotation_deg, h]);

  if (!placement || !map) return null;
  return (
    <Decal
      mesh={meshRef as React.RefObject<THREE.Mesh>}
      position={placement.position}
      rotation={placement.rotation}
      scale={placement.scale}
      renderOrder={order + 1}
      userData={{ elementId: el.id, order }}
      onPointerDown={onPointerDown}
    >
      <meshStandardMaterial
        map={map}
        transparent
        depthTest
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-4 - order}
        roughness={0.9}
        metalness={0}
      />
    </Decal>
  );
}

function ImageDecal(p: Props & { el: ImageElement }) {
  const map = useAssetTexture(p.el.asset_id);
  return <DecalWithTexture {...p} map={map} />;
}

function TextDecal(p: Props & { el: TextElement }) {
  const map = useTextTexture(p.el);
  return <DecalWithTexture {...p} map={map} />;
}

export function ElementDecal(p: Props) {
  return p.el.kind === 'image' ? <ImageDecal {...p} el={p.el} /> : <TextDecal {...p} el={p.el} />;
}
