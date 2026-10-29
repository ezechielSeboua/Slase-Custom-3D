'use client';

import * as THREE from 'three';
import { Component, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { getGarmentModel } from '@/lib/config';
import { select, useDesign } from '@/store/design';
import { Garment } from '@/features/scene/Garment';
import {
  CAMERA_DISTANCE, CAMERA_TARGET, captureRef, SCENE_BG, setSceneStatus, useScene, viewPose, type ViewId,
} from '@/features/scene/sceneStore';
import { usePrefersReducedMotion } from '@/lib/useMedia';

class ModelBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    setSceneStatus('error');
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type CameraAnim = { fromPos: THREE.Vector3; fromTarget: THREE.Vector3; toPos: THREE.Vector3; toTarget: THREE.Vector3; t: number };

function CameraRig() {
  const view = useScene((s) => s.view);
  const design = useDesign((s) => s.design);
  const model = design ? getGarmentModel(design.garment, design.fit) : null;
  const reduced = usePrefersReducedMotion();
  const { camera, controls, invalidate } = useThree();
  const anim = useRef<CameraAnim | null>(null);

  useEffect(() => {
    if (view.nonce === 0) return;
    const pose = viewPose(view.id, model);
    const c = controls as unknown as OrbitControlsImpl | null;
    const toPos = new THREE.Vector3(...pose.position), toTarget = new THREE.Vector3(...pose.target);
    if (reduced) {
      camera.position.copy(toPos);
      c?.target.copy(toTarget);
      c?.update();
    } else {
      const fromTarget = c ? c.target.clone() : new THREE.Vector3(...CAMERA_TARGET);
      anim.current = { fromPos: camera.position.clone(), fromTarget, toPos, toTarget, t: 0 };
    }
    invalidate();
    // La vue ne se recadre que sur demande : pas quand le vêtement change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, reduced, camera, controls, invalidate]);

  useFrame((_, dt) => {
    const a = anim.current;
    if (!a) return;
    a.t = Math.min(1, a.t + dt / 0.6);
    const k = 1 - Math.pow(1 - a.t, 3);
    // Tourne autour d'une cible qui glisse elle-même vers la nouvelle : on contourne le vêtement au lieu de le traverser.
    const target = a.fromTarget.clone().lerp(a.toTarget, k);
    const sFrom = new THREE.Spherical().setFromVector3(a.fromPos.clone().sub(a.fromTarget));
    const sTo = new THREE.Spherical().setFromVector3(a.toPos.clone().sub(a.toTarget));
    let dTheta = sTo.theta - sFrom.theta;
    if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
    if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
    const s = new THREE.Spherical(
      sFrom.radius + (sTo.radius - sFrom.radius) * k,
      sFrom.phi + (sTo.phi - sFrom.phi) * k,
      sFrom.theta + dTheta * k,
    );
    camera.position.copy(target.clone().add(new THREE.Vector3().setFromSpherical(s)));
    const c = controls as unknown as OrbitControlsImpl | null;
    c?.target.copy(target);
    c?.update();
    if (a.t >= 1) anim.current = null;
    invalidate();
  });
  return null;
}

function CaptureBridge() {
  const { gl, scene, camera, controls, size } = useThree();
  useEffect(() => {
    captureRef.current = async (view: ViewId, bg, widthPx) => {
      const cam = camera as THREE.PerspectiveCamera;
      const c = controls as unknown as OrbitControlsImpl | null;
      const saved = { pos: cam.position.clone(), target: c?.target.clone(), ratio: gl.getPixelRatio(), aspect: cam.aspect };
      const helpers: THREE.Object3D[] = [];
      scene.traverse((o) => {
        if (o.userData.helper && o.visible) {
          helpers.push(o);
          o.visible = false;
        }
      });
      const prevClear = gl.getClearColor(new THREE.Color()), prevAlpha = gl.getClearAlpha();
      // Tout se fait de façon synchrone, restauration comprise : aucun événement (glisser, clic) ne doit voir
      // la caméra de capture. La conversion en Blob n'a lieu qu'une fois la scène remise en état.
      let url: string;
      try {
        const d = useDesign.getState().design;
        const pose = viewPose(view, d ? getGarmentModel(d.garment, d.fit) : null);
        cam.position.set(...pose.position);
        c?.target.set(...pose.target);
        cam.lookAt(...pose.target);
        const heightPx = Math.round(widthPx * (size.height / size.width));
        gl.setPixelRatio(1);
        gl.setSize(widthPx, heightPx, false);
        cam.aspect = widthPx / heightPx;
        cam.updateProjectionMatrix();
        if (bg === 'light') gl.setClearColor(SCENE_BG.light, 1);
        else gl.setClearColor(0x000000, 0);
        gl.render(scene, cam);
        url = gl.domElement.toDataURL('image/png');
      } finally {
        helpers.forEach((o) => (o.visible = true));
        gl.setClearColor(prevClear, prevAlpha);
        gl.setPixelRatio(saved.ratio);
        gl.setSize(size.width, size.height, false);
        cam.aspect = saved.aspect;
        cam.updateProjectionMatrix();
        cam.position.copy(saved.pos);
        if (saved.target) c?.target.copy(saved.target);
        c?.update();
        gl.render(scene, cam);
      }
      return (await fetch(url)).blob();
    };
    return () => {
      captureRef.current = null;
    };
  }, [gl, scene, camera, controls, size]);
  return null;
}

export default function Scene() {
  const design = useDesign((s) => s.design);
  const background = useDesign((s) => s.background);
  const retry = useScene((s) => s.retry);
  const model = design ? getGarmentModel(design.garment, design.fit) : null;

  useEffect(() => {
    if (model) setSceneStatus('loading');
  }, [model]);

  return (
    // `isolate` : les poignées (HTML posé sur la scène) restent sous le panneau mobile et la surcouche.
    <div className="absolute inset-0 isolate" style={{ background: SCENE_BG[background] }}>
      <Canvas
        flat
        frameloop="demand"
        dpr={[1, 1.75]}
        camera={{ position: viewPose('front').position, fov: 35, near: 0.05, far: 20 }}
        gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
        onPointerMissed={(e) => e.type === 'click' && select(null)}
        aria-hidden="true"
      >
        <hemisphereLight args={['#ffffff', '#b4b9bf', 1.6]} />
        <directionalLight position={[1.2, 1.5, 2.5]} intensity={1.2} />
        <directionalLight position={[-1.5, 0.5, -2.5]} intensity={0.8} />
        <OrbitControls
          makeDefault
          target={CAMERA_TARGET}
          enablePan={false}
          minDistance={CAMERA_DISTANCE * 0.45}
          maxDistance={CAMERA_DISTANCE * 1.6}
          enableDamping
        />
        <CameraRig />
        <CaptureBridge />
        {design && model && (
          <ModelBoundary resetKey={`${model.model}#${retry}`}>
            <Suspense fallback={null}>
              <Garment key={`${model.model}#${retry}`} model={model} design={design} />
            </Suspense>
          </ModelBoundary>
        )}
      </Canvas>
    </div>
  );
}
