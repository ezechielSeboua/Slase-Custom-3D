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

export async function signOut() {
  await getSupabase()?.auth.signOut();
}

/** Méthodes de connexion du compte, pour l'affichage : « Google », « E-mail et mot de passe ». */
export function providersOf(user: User): string[] {
  const ids = new Set((user.identities ?? []).map((i) => i.provider));
  if (!ids.size && user.app_metadata?.provider) ids.add(user.app_metadata.provider);
  return [...ids].map((p) => (p === 'google' ? fr.auth.providerGoogle : p === 'email' ? fr.auth.providerEmail : p));
}

/** Message en français pour une erreur Supabase Auth (codes documentés), sinon un message générique. */
export function authErrorMessage(error: AuthError | null | undefined): string {
  const t = fr.auth.errors;
  switch (error?.code) {
    case 'invalid_credentials':
      return t.invalidCredentials;
    case 'email_not_confirmed':
      return t.emailNotConfirmed;
    case 'user_already_exists':
    case 'email_exists':
      return t.userExists;
    case 'weak_password':
      return t.weakPassword;
    case 'same_password':
      return t.samePassword;
    case 'email_address_invalid':
    case 'validation_failed':
      return t.invalidEmail;
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return t.rateLimit;
    case 'signup_disabled':
      return t.signupDisabled;
    default:
      return t.generic;
  }
}
