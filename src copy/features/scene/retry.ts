import { useGLTF } from '@react-three/drei';
import { useScene } from '@/features/scene/sceneStore';

/** Vide le cache du modèle et relance son chargement. */
export function retryModel(path: string) {
  useGLTF.clear(path);
  useScene.setState((s) => ({ status: 'loading', retry: s.retry + 1 }));
}
