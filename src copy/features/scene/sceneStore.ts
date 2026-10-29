import { create } from 'zustand';
import type { ZoneId } from '@/types/design';
import type { GarmentModel } from '@/lib/config';

export type ViewId = 'front' | 'back' | 'threeQuarter' | 'leftSleeve' | 'rightSleeve';
export type CaptureBackground = 'light' | 'transparent';

interface SceneState {
  status: 'loading' | 'ready' | 'error';
  retry: number;
  view: { id: ViewId; nonce: number };
}

export const useScene = create<SceneState>(() => ({ status: 'loading', retry: 0, view: { id: 'front', nonce: 0 } }));

export const setSceneStatus = (status: SceneState['status']) => useScene.setState({ status });
export const requestView = (id: ViewId) => useScene.setState((s) => ({ view: { id, nonce: s.view.nonce + 1 } }));

/** Fonction de capture enregistrée par la scène montée ; null tant que la scène n'est pas prête. */
export const captureRef: {
  current: ((view: ViewId, bg: CaptureBackground, widthPx: number) => Promise<Blob>) | null;
} = { current: null };

export const CAMERA_TARGET: [number, number, number] = [0, -0.38, 0];
export const CAMERA_DISTANCE = 1.9;

/** Distance de la caméra à une manche, en mètres. */
const SLEEVE_DISTANCE = 0.75;

export const VIEW_ZONE: Record<ViewId, ZoneId> = {
  front: 'front',
  back: 'back',
  threeQuarter: 'front',
  leftSleeve: 'left_sleeve',
  rightSleeve: 'right_sleeve',
};

type Vec3 = [number, number, number];

/** Position et cible de la caméra pour une vue. Les vues de manche se cadrent sur le milieu de la zone de la manche. */
export function viewPose(id: ViewId, model?: GarmentModel | null): { position: Vec3; target: Vec3 } {
  if ((id === 'leftSleeve' || id === 'rightSleeve') && model) {
    const z = model.zones[VIEW_ZONE[id]];
    const up = z.up ?? [0, 1, 0];
    const half = ((z.surface_cm.top + z.surface_cm.height / 2) * model.units_per_cm);
    const target: Vec3 = [z.origin[0] - up[0] * half, z.origin[1] - up[1] * half, z.origin[2] - up[2] * half];
    // Regard plutôt horizontal, légèrement de face : la normale de la manche pointe vers le haut, on l'aplatit.
    const dir = [z.normal[0], z.normal[1] * 0.35, 0.45];
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    // Une manche longue (sweater) demande plus de recul pour tenir entière dans le cadre.
    const dist = Math.max(SLEEVE_DISTANCE, z.surface_cm.height * model.units_per_cm * 2.3);
    return {
      target,
      position: [
        target[0] + (dir[0] / len) * dist,
        target[1] + (dir[1] / len) * dist,
        target[2] + (dir[2] / len) * dist,
      ],
    };
  }
  const [tx, ty, tz] = CAMERA_TARGET;
  const a = id === 'back' ? Math.PI : id === 'threeQuarter' ? Math.PI / 4 : 0;
  return { target: CAMERA_TARGET, position: [tx + Math.sin(a) * CAMERA_DISTANCE, ty + 0.05, tz + Math.cos(a) * CAMERA_DISTANCE] };
}

export const SCENE_BG = { light: '#e9eaec', dark: '#1c1e21' } as const;

/** Active ou coupe la rotation de caméra (pendant un glisser d'élément). */
export function setControlsEnabled(controls: unknown, enabled: boolean) {
  if (controls) (controls as { enabled: boolean }).enabled = enabled;
}

/** Vue qui montre le mieux une zone. */
export const ZONE_VIEW: Record<ZoneId, ViewId> = {
  front: 'front',
  back: 'back',
  left_sleeve: 'leftSleeve',
  right_sleeve: 'rightSleeve',
};

/** Objet 3D du vêtement personnalisé (tissu + décalques), enregistré par la scène pour l'export GLB. */
export const exportRootRef: { current: import('three').Object3D | null } = { current: null };
