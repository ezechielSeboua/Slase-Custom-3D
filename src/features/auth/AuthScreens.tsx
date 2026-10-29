'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { safeNext } from '@/lib/supabase/config';
import { authErrorMessage, deleteAccount, providersOf, signOut, useAuth } from '@/features/auth/session';
import { backLinkClass, BrandMark, Button, Dialog, PageLoader, WarningItem } from '@/features/editor/ui';
import { GoogleLogo, Icon } from '@/features/editor/icons';
import { showToast } from '@/features/editor/Toast';
import { forgetAccount } from '@/features/storage/db';
import { fr } from '@/i18n/fr';

const t = fr.auth;

/** Adresse de retour après Google : la route d'échange, puis `next`. */
const callbackUrl = (next: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;

// ---------- Mise en page commune ----------
function AuthLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh pb-s5">
      <header className="flex h-h-topbar items-center gap-s2 border-b border-white/70 bg-white/55 px-safe backdrop-blur-xl">
        <Link href="/" aria-label={fr.common.back} title={fr.common.back} className={backLinkClass}>
          <Icon name="back" />
        </Link>
        <BrandMark />
      </header>
      <main className="mx-auto max-w-md px-s1 pt-s3 desk:pt-s5">
        <div className="glass space-y-s3 rounded-r1 p-s3">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

function GoogleButton({ next, onError }: { next: string; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const { error } = (await getSupabase()?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl(next) } })) ?? {};
        if (error) {
          onError(authErrorMessage(error));
          setBusy(false);
        }
      }}
      className="glass glass-press flex h-h-btn w-full items-center justify-center gap-s2 rounded-r-ctl text-sm font-medium disabled:opacity-60"
    >
      <GoogleLogo />
      {t.google}
    </button>
  );
}

/** Redirige vers `next` une fois connecté (ex. retour sur la page de connexion alors qu'on l'est déjà). */
function useRedirectWhenSignedIn(next: string) {
  const router = useRouter();
  const status = useAuth((s) => s.status);
  useEffect(() => {
    if (status === 'signedIn') router.replace(next);
    if (status === 'disabled') router.replace('/');
  }, [status, next, router]);
  return status;
}

// ---------- Connexion ----------
export function SignInScreen() {
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useRedirectWhenSignedIn(next);
  const [error, setError] = useState<string | null>(t.callbackErrors[params.get('erreur') ?? ''] ?? null);

  if (status === 'loading' || status === 'signedIn') return <PageLoader label={fr.common.loading} />;

  return (
    <AuthLayout title={t.signInTitle}>
      <p className="text-sm text-muted">{t.whyText}</p>
      <GoogleButton next={next} onError={setError} />
      {error && <WarningItem>{error}</WarningItem>}
      <p className="text-center">
        <Link href="/" className="text-sm text-muted underline">
          {t.continueWithout}
        </Link>
      </p>
    </AuthLayout>
  );
}

// ---------- Mon compte ----------
export function AccountScreen() {
  const router = useRouter();
  const { status, user } = useAuth();
  const [confirming, setConfirming] = useState(false);
  // Déconnexion ou suppression voulue : on va à l'accueil, pas vers la page de connexion.
  const leaving = useRef(false);
  const leave = () => {
    leaving.current = true;
    router.replace('/');
  };

  useEffect(() => {
    if (status === 'signedOut' && !leaving.current) router.replace('/connexion?next=/compte');
    if (status === 'disabled') router.replace('/');
  }, [status, router]);

  if (status !== 'signedIn' || !user) return <PageLoader label={fr.common.loading} />;
  const providers = providersOf(user);
  const created = user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <AuthLayout title={t.account}>
      <dl className="space-y-s1 text-sm">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{t.signedInAs}</dt>
          <dd className="truncate font-medium">{user.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{t.signInMethods}</dt>
          <dd>{providers.join(' · ')}</dd>
        </div>
        {created && <dd className="text-xs text-muted">{t.memberSince(created)}</dd>}
      </dl>
      <WarningItem tone="info">{t.syncInfo}</WarningItem>
      <div className="grid gap-s4">
        <Button
          onClick={async () => {
            leaving.current = true;
            await signOut();
            showToast(t.signedOut);
            leave();
          }}
        >
          <Icon name="logout" size={18} />
          {t.signOut}
        </Button>
      </div>
      <div className="border-t border-line pt-s3">
        <button type="button" onClick={() => setConfirming(true)} className="text-sm font-medium text-warn underline">
          {t.deleteAccount}
        </button>
      </div>
      {confirming && <DeleteAccountDialog onClose={() => setConfirming(false)} onDeleted={leave} />}
    </AuthLayout>
  );
}

function DeleteAccountDialog({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(false);
    const uid = useAuth.getState().user?.id;
    if (await deleteAccount()) {
      onDeleted();
      if (uid) await forgetAccount(uid).catch(() => {});
      await signOut('local');
      showToast(t.accountDeleted);
      return;
    }
    setBusy(false);
    setError(true);
  };

  return (
    <Dialog
      title={t.deleteAccountTitle}
      closeLabel={fr.common.close}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>{fr.common.cancel}</Button>
          <Button variant="primary" onClick={run} disabled={busy} busy={busy}>
            {t.deleteAccountConfirm}
          </Button>
        </>
      }
    >
      <div className="space-y-s4 text-sm">
        <p>{t.deleteAccountHelp}</p>
        <p className="text-muted">{t.deleteAccountLocal}</p>
        {error && <WarningItem>{t.deleteAccountError}</WarningItem>}
      </div>
    </Dialog>
  );
}
