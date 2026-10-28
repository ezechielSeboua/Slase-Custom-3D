'use client';

import { useSyncExternalStore } from 'react';

function useMedia(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const usePrefersReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)');
/** Même seuil que BP_DESKTOP dans docs/maquettes/tokens.json. */
export const useIsDesktop = () => useMedia('(min-width: 1024px)', true);
