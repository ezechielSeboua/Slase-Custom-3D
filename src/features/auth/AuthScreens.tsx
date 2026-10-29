'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { safeNext } from '@/lib/supabase/config';
import { authErrorMessage, deleteAccount, signOut, useAuth } from '@/features/auth/session';
import { backLinkClass, BrandMark, Button, cx, Dialog, glassButton, PageLoader, Spinner, WarningItem } from '@/features/editor/ui';
import { GoogleLogo, Icon, type IconName } from '@/features/editor/icons';
import { showToast } from '@/features/editor/Toast';
import { forgetAccount } from '@/features/storage/db';
import { AvatarImage } from '@/features/auth/AvatarImage';
import { AvatarImageError, removeAvatar, uploadAvatar, useAvatar } from '@/features/auth/avatar';
import { DataSection, Section, SharesSection, SyncSection } from '@/features/auth/AccountSections';
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
      aria-busy={busy || undefined}
      className="glass glass-press flex h-h-btn w-full items-center justify-center gap-s2 rounded-r-ctl text-sm font-medium disabled:opacity-80"
    >
      {busy ? <Spinner size={18} /> : <GoogleLogo />}
      {busy ? t.redirecting : t.google}
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
const BENEFITS: [IconName, keyof typeof t.benefits][] = [
  ['devices', 'devices'],
  ['cloud', 'cloud'],
  ['share', 'share'],
];

export function SignInScreen() {
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useRedirectWhenSignedIn(next);
  const [error, setError] = useState<string | null>(t.callbackErrors[params.get('erreur') ?? ''] ?? null);

  if (status === 'loading' || status === 'signedIn') return <PageLoader label={fr.common.loading} />;

  return (
    <AuthLayout title={t.signInTitle}>
      <ul className="space-y-s4">
        {BENEFITS.map(([icon, key]) => (
          <li key={key} className="flex items-start gap-s4 text-sm">
            <span className="glass grid size-9 shrink-0 place-items-center rounded-full text-select-strong">
              <Icon name={icon} size={18} />
            </span>
            <span className="pt-2">{t.benefits[key]}</span>
          </li>
        ))}
      </ul>
      <GoogleButton next={next} onError={setError} />
      {error && <WarningItem>{error}</WarningItem>}
      <p className="text-xs text-muted">{t.dataNotice}</p>
      <Link href="/" className={cx('flex h-h-btn items-center justify-center rounded-r-ctl text-sm font-medium', glassButton.secondary)}>
        {t.continueWithout}
      </Link>
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
  const created = user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const meta = user.user_metadata ?? {};
  const name = typeof (meta.full_name ?? meta.name) === 'string' ? String(meta.full_name ?? meta.name) : '';

  return (
    <AuthLayout title={t.account}>
      <ProfilePhoto initial={user.email?.charAt(0) ?? ''}>
        {name && <p className="truncate font-semibold">{name}</p>}
        <p className="truncate text-sm">{user.email}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted">
          <GoogleLogo />
          {t.connectedWith}
        </p>
        {created && <p className="text-xs text-muted">{t.memberSince(created)}</p>}
      </ProfilePhoto>
      <SyncSection />
      <SharesSection />
      <DataSection />
      <Section title={t.signOut}>
        <Button
          className="w-full"
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
      </Section>
      <Section title={t.dangerTitle}>
        <p className="text-xs text-muted">{t.deleteAccountHelp}</p>
        <button type="button" onClick={() => setConfirming(true)} className="text-sm font-medium text-warn underline">
          {t.deleteAccount}
        </button>
      </Section>
      {confirming && <DeleteAccountDialog onClose={() => setConfirming(false)} onDeleted={leave} />}
    </AuthLayout>
  );
}

/** Photo de profil : celle de Google par défaut, remplaçable par une image de l'appareil. */
function ProfilePhoto({ initial, children }: { initial: string; children: React.ReactNode }) {
  const custom = useAvatar((s) => s.custom);
  const hasPhoto = useAvatar((s) => Boolean(s.url));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      showToast(done);
    } catch (e) {
      setError(e instanceof AvatarImageError ? t.photoInvalid : t.photoError);
    }
    setBusy(false);
  };

  return (
    <section aria-label={t.photo} className="space-y-s4">
      <div className="flex items-center gap-s1">
        <AvatarImage initial={initial} className="glass size-20" textClass="text-2xl" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <div className="flex flex-wrap items-center gap-x-s1 gap-y-s2">
        <Button busy={busy} disabled={busy} onClick={() => fileRef.current?.click()}>
          {hasPhoto ? t.photoChange : t.photoAdd}
        </Button>
        {custom && (
          <button type="button" disabled={busy} onClick={() => run(removeAvatar, t.photoRemoved)} className="text-sm text-muted underline disabled:opacity-45">
            {t.photoRemove}
          </button>
        )}
      </div>
      <p className="text-xs text-muted">{t.photoHelp}</p>
      {error && <WarningItem>{error}</WarningItem>}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) run(() => uploadAvatar(f), t.photoSaved);
        }}
      />
    </section>
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
