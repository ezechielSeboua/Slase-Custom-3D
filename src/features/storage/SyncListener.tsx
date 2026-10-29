'use client';

import { useEffect } from 'react';
import { useAuth } from '@/features/auth/session';
import { notifyListChanged, syncNow, useSync } from '@/features/storage/sync';

/**
 * Déclenche la synchronisation : à la connexion, au retour du réseau et quand l'onglet redevient visible.
 * Monté une fois dans le layout, à côté d'AuthListener.
 */
export function SyncListener() {
  useEffect(() => {
    let uid: string | null | undefined;
    const onAuth = () => {
      const s = useAuth.getState();
      if (s.status === 'loading') return;
      const next = s.status === 'signedIn' ? (s.user?.id ?? null) : null;
      if (next === uid) return;
      const first = uid === undefined;
      uid = next;
      useSync.setState({ pulled: false, status: next ? 'syncing' : 'off' });
      // Changement de compte : la liste visible n'est plus la même.
      if (!first) notifyListChanged();
      if (next) void syncNow();
    };
    onAuth();
    const unsub = useAuth.subscribe(onAuth);

    const onOnline = () => void syncNow();
    const onOffline = () => uid && useSync.setState({ status: 'offline' });
    const onVisible = () => document.visibilityState === 'visible' && uid && void syncNow();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
