'use client';

import * as THREE from 'three';
import { useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import type { DesignElement } from '@/types/design';
import { elementAspect, elementHeightCm } from '@/lib/units';
import { beginGesture, endGesture, liveElement } from '@/store/design';
import { cmToPlane, elementPointCm, planeToCm, pointerToPlane, projectToSurface, type ZoneBasis } from '@/features/scene/mapping';
import { setControlsEnabled } from '@/features/scene/sceneStore';
import { fr } from '@/i18n/fr';

/** Écart de la poignée de rotation au-dessus de l'élément, en cm. */
const ROT_OFFSET_CM = 3;

type Mode = 'resize' | 'rotate';

interface Props {
  el: DesignElement;
  mesh: THREE.Mesh;
  basis: ZoneBasis;
}

/** Poignées HTML (cible tactile de 44 px) posées sur le tissu aux coins de l'élément sélectionné. */
export function Handles({ el, mesh, basis }: Props) {
  const { camera, gl, controls } = useThree();
  const [facing, setFacing] = useState(true);
  const h = elementHeightCm(el);

  const points = useMemo(() => {
    const local: [Mode, number, number][] = [
      ['resize', -el.width_cm / 2, -h / 2],
      ['resize', el.width_cm / 2, -h / 2],
      ['resize', el.width_cm / 2, h / 2],
      ['resize', -el.width_cm / 2, h / 2],
      ['rotate', 0, -h / 2 - ROT_OFFSET_CM],
    ];
    return local.map(([mode, lx, ly]) => {
      const c = elementPointCm(el.x_cm, el.y_cm, el.rotation_deg, lx, ly);
      const plane = cmToPlane(basis, c.x, c.y);
      const surface = projectToSurface(mesh, basis, plane) ?? plane;
      return { mode, pos: surface.addScaledVector(basis.n, 0.004) };
    });
  }, [el.x_cm, el.y_cm, el.width_cm, el.rotation_deg, h, basis, mesh]);

  const center = points[0].pos;
  useFrame(() => {
    const f = camera.position.clone().sub(center).dot(basis.n) > 0;
    if (f !== facing) setFacing(f);
  });

  const drag = useRef<{ mode: Mode; pointerId: number } | null>(null);

  const onDown = (mode: Mode) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, pointerId: e.pointerId };
    setControlsEnabled(controls, false);
    beginGesture();
  };
  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || drag.current.pointerId !== e.pointerId) return;
    const p = pointerToPlane(basis, camera, gl.domElement, e.clientX, e.clientY);
    if (!p) return;
    const c = planeToCm(basis, p);
    const dx = c.x - el.x_cm, dy = c.y - el.y_cm;
    if (drag.current.mode === 'rotate') {
      let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      liveElement(el.id, { rotation_deg: Math.round(deg * 10) / 10 });
    } else {
      const a = elementAspect(el);
      const width = (2 * Math.hypot(dx, dy)) / Math.sqrt(1 + 1 / (a * a));
      liveElement(el.id, { width_cm: Math.round(width * 100) / 100 });
    }
  };
  const onUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || drag.current.pointerId !== e.pointerId) return;
    drag.current = null;
    setControlsEnabled(controls, true);
    endGesture();
  };

  if (!facing || el.hidden) return null;
  return (
    <>
      {points.slice(0, 5).map((p, i) => (
        <Html key={i} position={p.pos} center zIndexRange={[30, 10]}>
          <button
            type="button"
            aria-label={p.mode === 'rotate' ? fr.editor.handleRotate : fr.editor.handleResize}
            className="handle-hit"
            data-mode={p.mode}
            onPointerDown={onDown(p.mode)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <span className={p.mode === 'rotate' ? 'handle-dot handle-rot' : 'handle-dot'} />
          </button>
        </Html>
      ))}
    </>
  );
}
