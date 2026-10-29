'use client';

import * as THREE from 'three';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, Line, useGLTF } from '@react-three/drei';
import type { Design, DesignElement, ZoneId } from '@/types/design';
import { colorById, resolveZone, ZONE_IDS, type GarmentModel } from '@/lib/config';
import { beginGesture, endGesture, liveElement, select, useDesign } from '@/store/design';
import { cmToPlane, elementPointCm, planeToCm, pointerToPlane, projectToSurface, zoneBasis, type ZoneBasis } from '@/features/scene/mapping';
import { ElementDecal } from '@/features/scene/ElementDecal';
import { Handles } from '@/features/scene/Handles';
import { exportRootRef, setControlsEnabled, setSceneStatus, useScene, VIEW_ZONE } from '@/features/scene/sceneStore';
import { placementCenter, placementsFor, SNAP_CM } from '@/lib/placements';
import { elementAspect } from '@/lib/units';
import { fr } from '@/i18n/fr';

function findFabric(root: THREE.Object3D, name: string): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (found || !m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.some((x) => x.name === name)) found = m;
  });
  return found;
}

/** Contour d'un rectangle (cm, repère de zone) projeté sur le tissu, légèrement décollé pour rester visible. */
function projectedRect(mesh: THREE.Mesh, basis: ZoneBasis, cx: number, cy: number, w: number, h: number, deg: number, steps = 12) {
  const corners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => elementPointCm(cx, cy, deg, (a * w) / 2, (b * h) / 2));
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const A = corners[i], B = corners[(i + 1) % 4];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const p = projectToSurface(mesh, basis, cmToPlane(basis, A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t));
      if (p) out.push(p.addScaledVector(basis.n, 0.003));
    }
  }
  if (out.length) out.push(out[0].clone());
  return out;
}

/** Repères des emplacements de la zone, affichés pendant qu'on déplace un élément. */
function PlacementGuides({ mesh, basis, el, design, dark }: { mesh: THREE.Mesh; basis: ZoneBasis; el: DesignElement; design: Design; dark: boolean }) {
  const aspect = elementAspect(el);
  const guides = useMemo(
    () =>
      placementsFor(design.garment, el.zone).map((p) => {
        const probe = { ...el, width_cm: p.max_width_cm, rotation_deg: p.rotation_deg ?? 0 } as DesignElement;
        const c = placementCenter(p, probe, design.garment, design.fit);
        return { id: p.id, pts: projectedRect(mesh, basis, c.x, c.y, p.max_width_cm, p.max_width_cm / aspect, p.rotation_deg ?? 0) };
      }),
    // La forme du repère suit les proportions de l'élément déplacé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mesh, basis, el.zone, el.kind, aspect, design.garment, design.fit],
  );
  return (
    <group userData={{ helper: true }}>
      {guides.map((g) =>
        g.pts.length > 1 ? (
          <Line
            key={g.id}
            points={g.pts}
            color={dark ? '#9fd0ff' : '#2b6cb0'}
            lineWidth={g.id === el.placement ? 2 : 1}
            dashed
            dashSize={0.006}
            gapSize={0.006}
            transparent
            opacity={g.id === el.placement ? 0.95 : 0.55}
          />
        ) : null,
      )}
    </group>
  );
}

function ZoneFrame({ mesh, basis, zone, garment, active, dark }: {
  mesh: THREE.Mesh; basis: ZoneBasis; zone: ZoneId; garment: Design; active: boolean; dark: boolean;
}) {
  const { camera } = useThree();
  const z = resolveZone(garment.garment, garment.fit, zone);
  const pts = useMemo(() => {
    const corners: [number, number][] = [[-z.width / 2, z.top], [z.width / 2, z.top], [z.width / 2, z.top + z.height], [-z.width / 2, z.top + z.height]];
    const out: THREE.Vector3[] = [];
    const steps = 24;
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 4];
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const plane = cmToPlane(basis, ax + (bx - ax) * t, ay + (by - ay) * t);
        const p = projectToSurface(mesh, basis, plane);
        if (p) out.push(p.addScaledVector(basis.n, 0.003));
      }
    }
    if (out.length) out.push(out[0].clone());
    return out;
  }, [mesh, basis, z.width, z.height, z.top]);
  const labelPos = useMemo(() => {
    const p = cmToPlane(basis, 0, z.top + z.height);
    return (projectToSurface(mesh, basis, p) ?? p).addScaledVector(basis.n, 0.01).addScaledVector(basis.up, -0.02);
  }, [mesh, basis, z.top, z.height]);
  const facing = camera.position.clone().sub(basis.o).dot(basis.n) > 0;
  // Une seule mention « à confirmer » à la fois : celle de la zone regardée ou de l'élément sélectionné.
  const viewZone = useScene((s) => VIEW_ZONE[s.view.id]);
  const showLabel = !z.confirmed && facing && (active || viewZone === zone);

  if (pts.length < 2) return null;
  const color = dark ? '#c9ccd1' : '#4f555c';
  return (
    <group userData={{ helper: true }}>
      <Line points={pts} color={color} lineWidth={active ? 1.6 : 1} dashed dashSize={0.012} gapSize={0.008} transparent opacity={active ? 0.95 : 0.5} />
      {showLabel && (
        <Html position={labelPos} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <span className="zone-label">{fr.editor.zoneToConfirm}</span>
        </Html>
      )}
    </group>
  );
}

export function Garment({ model, design }: { model: GarmentModel; design: Design }) {
  const gltf = useGLTF(model.model);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);
  const fabric = useMemo(() => {
    const m = findFabric(scene, model.material);
    if (m) {
      // Matériau propre à cette instance, pour ne pas modifier le cache de useGLTF.
      m.material = (m.material as THREE.MeshStandardMaterial).clone();
    }
    return m;
  }, [scene, model.material]);
  const { camera, gl, controls, invalidate } = useThree();
  const selectedId = useDesign((s) => s.selectedId);
  const background = useDesign((s) => s.background);
  // Un glisser ou un redimensionnement est en cours.
  const dragging = useDesign((s) => s.gestureStart !== null);
  const [, setTick] = useState(0);

  const bases = useMemo(
    () => Object.fromEntries(ZONE_IDS.map((z) => [z, zoneBasis(model.zones[z], model.units_per_cm)])) as Record<ZoneId, ZoneBasis>,
    [model],
  );

  useLayoutEffect(() => {
    scene.updateMatrixWorld(true);
    setSceneStatus(fabric ? 'ready' : 'error');
  }, [scene, fabric]);

  // L'objet du vêtement (tissu et décalques en enfants) sert de racine à l'export GLB.
  useEffect(() => {
    exportRootRef.current = scene;
    return () => {
      if (exportRootRef.current === scene) exportRootRef.current = null;
    };
  }, [scene]);

  const hex = colorById(design.color)?.hex ?? '#ffffff';
  useEffect(() => {
    if (!fabric) return;
    (fabric.material as THREE.MeshStandardMaterial).color.set(hex);
    invalidate();
  }, [fabric, hex, invalidate]);

  // Redessine le libellé des zones quand la caméra change de côté.
  useEffect(() => {
    const c = controls as unknown as THREE.EventDispatcher<{ end: object }> | null;
    if (!c) return;
    const onEnd = () => setTick((t) => t + 1);
    c.addEventListener('end', onEnd);
    return () => c.removeEventListener('end', onEnd);
  }, [controls]);

  const drag = useRef<{ id: string; zone: ZoneId; dx: number; dy: number } | null>(null);

  const onDecalDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    // Le calque le plus haut sous le pointeur gagne.
    const hits = e.intersections.filter((i) => i.object.userData.elementId);
    const top = hits.sort((a, b) => b.object.userData.order - a.object.userData.order)[0];
    const id: string = top?.object.userData.elementId;
    const el = design.elements.find((x) => x.id === id);
    if (!el) return;
    select(id);
    const p = pointerToPlane(bases[el.zone], camera, gl.domElement, e.clientX, e.clientY);
    if (!p) return;
    const c = planeToCm(bases[el.zone], p);
    drag.current = { id, zone: el.zone, dx: el.x_cm - c.x, dy: el.y_cm - c.y };
    setControlsEnabled(controls, false);
    beginGesture();
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const q = pointerToPlane(bases[d.zone], camera, gl.domElement, ev.clientX, ev.clientY);
      if (!q) return;
      const cm = planeToCm(bases[d.zone], q);
      const x = cm.x + d.dx, y = cm.y + d.dy;
      // Aimant : près d'un emplacement de la zone, l'élément s'y cale.
      const cur = useDesign.getState().design;
      const el = cur?.elements.find((e) => e.id === d.id);
      if (cur && el) {
        for (const p of placementsFor(cur.garment, d.zone)) {
          const c = placementCenter(p, el, cur.garment, cur.fit);
          if (Math.hypot(x - c.x, y - c.y) < SNAP_CM) {
            liveElement(d.id, { x_cm: c.x, y_cm: c.y, placement: p.id });
            return;
          }
        }
      }
      liveElement(d.id, { x_cm: Math.round(x * 100) / 100, y_cm: Math.round(y * 100) / 100 });
    };
    const up = () => {
      drag.current = null;
      setControlsEnabled(controls, true);
      endGesture();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const selected = design.elements.find((e) => e.id === selectedId);

  return (
    <>
      <primitive object={scene} />
      {fabric &&
        createPortal(
          <>
            {design.elements.map((el, i) =>
              el.hidden ? null : (
                <ElementDecal key={el.id} el={el} mesh={fabric} basis={bases[el.zone]} order={i} onPointerDown={onDecalDown} />
              ),
            )}
          </>,
          fabric,
        )}
      {fabric &&
        ZONE_IDS.map((zone) => (
          <ZoneFrame
            key={zone}
            mesh={fabric}
            basis={bases[zone]}
            zone={zone}
            garment={design}
            active={selected?.zone === zone}
            dark={background === 'dark'}
          />
        ))}
      {fabric && selected && !selected.hidden && <Handles el={selected} mesh={fabric} basis={bases[selected.zone]} />}
      {fabric && selected && dragging && (
        <PlacementGuides mesh={fabric} basis={bases[selected.zone]} el={selected} design={design} dark={background === 'dark'} />
      )}
    </>
  );
}
