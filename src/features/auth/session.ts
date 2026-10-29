'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import type { AuthError, User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import { fr } from '@/i18n/fr';

/** « disabled » : Supabase n'est pas configuré, l'app fonctionne sans comptes (comme en V1). */
type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'disabled';

export const useAuth = create<{ status: AuthStatus; user: User | null }>(() => ({ status: 'loading', user: null }));

/** Suit la session Supabase (connexion, déconnexion, renouvellement) ; monté une fois dans le layout. */
export function AuthListener() {
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      useAuth.setState({ status: 'disabled', user: null });
      return;
    }
    const apply = (user: User | null) => useAuth.setState({ status: user ? 'signedIn' : 'signedOut', user });
    supabase.auth.getSession().then(({ data }) => apply(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return null;
}

/** `local` : n'efface que la session de cet onglet (ex. compte déjà supprimé côté serveur). */
export async function signOut(scope: 'global' | 'local' = 'global') {
  await getSupabase()?.auth.signOut({ scope });
}

/**
 * Supprime définitivement le compte connecté, ses créations et ses fichiers, via la fonction Supabase
 * `delete-account` (seule à détenir la clé d'administration). Rend false si la suppression a échoué.
 * La session locale reste ouverte : l'appelant quitte la page puis appelle signOut('local').
 */
export async function deleteAccount(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  return !error;
}

/** Message en français pour une erreur Supabase Auth (codes documentés), sinon un message générique. */
export function authErrorMessage(error: AuthError | null | undefined): string {
  const t = fr.auth.errors;
  return error?.code === 'over_request_rate_limit' ? t.rateLimit : t.generic;
}
