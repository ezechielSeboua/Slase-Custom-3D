'use client';

import * as THREE from 'three';
import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import type { FitId, GarmentId } from '@/types/design';
import { colorById, getGarmentModel } from '@/lib/config';
import { usePrefersReducedMotion } from '@/lib/useMedia';
import { CAMERA_TARGET } from '@/features/scene/sceneStore';
import { Spinner } from '@/features/editor/ui';

function PreviewModel({ path, material, hex, onReady }: { path: string; material: string; hex: string; onReady: () => void }) {
  const gltf = useGLTF(path);
  const { invalidate } = useThree();
  // Copie propre à l'aperçu, avec son propre matériau : la couleur ne touche pas le modèle en cache.
  const { scene, fabric } = useMemo(() => {
    const s = gltf.scene.clone(true);
    let mat: THREE.MeshStandardMaterial | null = null;
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || mat) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (mats.some((x) => x.name === material)) {
        mat = (m.material as THREE.MeshStandardMaterial).clone();
        m.material = mat;
      }
    });
    return { scene: s, fabric: mat as THREE.MeshStandardMaterial | null };
  }, [gltf, material]);
  useLayoutEffect(() => {
    fabric?.color.set(hex);
    invalidate();
  }, [fabric, hex, invalidate]);
  useEffect(onReady, [scene, onReady]);
  return <primitive object={scene} />;
}

/**
 * Aperçu 3D d'un vêtement (sans éléments) : il tourne lentement et se fait pivoter au doigt ou à la souris.
 * Avec « mouvement réduit », il reste immobile mais on peut toujours le tourner.
 */
export default function GarmentPreview({
  garment, fit, color, label, className,
}: {
  garment: GarmentId;
  fit: FitId;
  color: string;
  label: string;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const model = getGarmentModel(garment, fit);
  const hex = colorById(color)?.hex ?? '#ffffff';
  const [readyPath, setReadyPath] = useState<string | null>(null);
  const onReady = useMemo(() => () => setReadyPath(model?.model ?? null), [model]);
  if (!model) return null;
  return (
    <div className={className} role="img" aria-label={label}>
      <div className="relative size-full">
        {readyPath !== model.model && (
          <span className="absolute inset-0 grid place-items-center text-muted">
            <Spinner size={28} />
          </span>
        )}
        <Canvas
          flat
          frameloop={reduced ? 'demand' : 'always'}
          dpr={[1, 1.5]}
          camera={{ position: [0, CAMERA_TARGET[1] + 0.05, 1.75], fov: 35, near: 0.05, far: 20 }}
          gl={{ antialias: true, alpha: true }}
          aria-hidden="true"
        >
          <hemisphereLight args={['#ffffff', '#b4b9bf', 1.6]} />
          <directionalLight position={[1.2, 1.5, 2.5]} intensity={1.2} />
          <directionalLight position={[-1.5, 0.5, -2.5]} intensity={0.8} />
          <OrbitControls
            target={CAMERA_TARGET}
            enableZoom={false}
            enablePan={false}
            autoRotate={!reduced}
            autoRotateSpeed={1.6}
            minPolarAngle={Math.PI / 2 - 0.35}
            maxPolarAngle={Math.PI / 2 + 0.2}
          />
          <Suspense fallback={null}>
            <PreviewModel key={model.model} path={model.model} material={model.material} hex={hex} onReady={onReady} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}
