// Configuration Supabase (V2). Sans ces variables (ex. déploiement pas encore configuré),
// l'app fonctionne comme en V1 : tout ce qui concerne les comptes est masqué.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Chemin interne sûr pour une redirection (`/…`), sinon l'accueil : empêche les redirections vers un autre site. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}
