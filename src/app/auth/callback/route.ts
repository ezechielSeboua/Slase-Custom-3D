import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { safeNext, supabaseConfigured } from '@/lib/supabase/config';

/**
 * Retour de connexion : Google, lien de confirmation d'inscription, lien « mot de passe oublié ».
 * Supabase renvoie ici avec un `code` à échanger contre une session (cookies), puis on redirige vers `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));
  const error = searchParams.get('error_description') ?? searchParams.get('error');

  if (!supabaseConfigured) return NextResponse.redirect(`${origin}/`);
  if (code) {
    const supabase = await createSupabaseServer();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) return NextResponse.redirect(`${origin}${next}`);
  }
  // Lien expiré, déjà utilisé, ou connexion annulée : retour à la connexion avec un message.
  const reason = error ? 'denied' : 'link';
  return NextResponse.redirect(`${origin}/connexion?erreur=${reason}`);
}
