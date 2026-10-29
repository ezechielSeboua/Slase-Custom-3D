'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { safeNext } from '@/lib/supabase/config';
import { authErrorMessage, providersOf, signOut, useAuth } from '@/features/auth/session';
import { backLinkClass, BrandMark, Button, PageLoader, WarningItem } from '@/features/editor/ui';
import { GoogleLogo, Icon } from '@/features/editor/icons';
import { showToast } from '@/features/editor/Toast';
import { fr } from '@/i18n/fr';

const t = fr.auth;
const MIN_PASSWORD = 8;

/** Adresse de retour après Google ou un lien reçu par e-mail : la route d'échange, puis `next`. */
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

function Field({
  label, type, value, onChange, autoComplete, hint,
}: {
  label: string;
  type: 'email' | 'password';
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  hint?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={type === 'password' && visible ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
          className="glass h-h-field w-full rounded-r-ctl px-s4 pr-12 text-base desk:text-sm"
        />
        {type === 'password' && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? t.hidePassword : t.showPassword}
            title={visible ? t.hidePassword : t.showPassword}
            className="absolute inset-y-0 right-0 grid w-touch-min place-items-center text-muted hover:text-ink"
          >
            <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
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

const Divider = () => (
  <div className="flex items-center gap-s2 text-xs text-muted" aria-hidden="true">
    <span className="h-px flex-1 bg-line" />
    {t.or}
    <span className="h-px flex-1 bg-line" />
  </div>
);

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
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useRedirectWhenSignedIn(next);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(t.callbackErrors[params.get('erreur') ?? ''] ?? null);

  if (status === 'loading' || status === 'signedIn') return <PageLoader label={fr.common.loading} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = (await getSupabase()?.auth.signInWithPassword({ email: email.trim(), password })) ?? {};
    setBusy(false);
    if (err) return setError(authErrorMessage(err));
    showToast(t.welcome);
    router.replace(next);
  };

  return (
    <AuthLayout title={t.signInTitle}>
      <p className="text-sm text-muted">{t.whyText}</p>
      <GoogleButton next={next} onError={setError} />
      <Divider />
      <form onSubmit={submit} className="space-y-s1">
        <Field label={t.email} type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label={t.password} type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        <div className="text-right">
          <Link href="/mot-de-passe-oublie" className="text-sm underline">
            {t.forgot}
          </Link>
        </div>
        {error && <WarningItem>{error}</WarningItem>}
        <Button type="submit" variant="primary" className="w-full" busy={busy} disabled={busy}>
          {t.signIn}
        </Button>
      </form>
      <p className="text-center text-sm">
        {t.noAccount}{' '}
        <Link href={`/inscription${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold underline">
          {t.signUp}
        </Link>
      </p>
      <p className="text-center">
        <Link href="/" className="text-sm text-muted underline">
          {t.continueWithout}
        </Link>
      </p>
    </AuthLayout>
  );
}

// ---------- Inscription ----------
export function SignUpScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useRedirectWhenSignedIn(next);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (status === 'loading' || status === 'signedIn') return <PageLoader label={fr.common.loading} />;

  if (sentTo) {
    return (
      <AuthLayout title={t.checkEmailTitle}>
        <div className="flex gap-s4">
          <Icon name="mail" size={28} className="shrink-0 text-select-strong" />
          <p className="text-sm">{t.checkEmailText(sentTo)}</p>
        </div>
        <Link href="/connexion" className="block text-center text-sm underline">
          {t.backToSignIn}
        </Link>
      </AuthLayout>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(t.passwordTooShort(MIN_PASSWORD));
    if (password !== confirm) return setError(t.passwordsDiffer);
    setBusy(true);
    const addr = email.trim();
    const { data, error: err } = (await getSupabase()?.auth.signUp({
      email: addr,
      password,
      options: { emailRedirectTo: callbackUrl(next) },
    })) ?? { data: null, error: null };
    setBusy(false);
    if (err) return setError(authErrorMessage(err));
    // Confirmation d'e-mail désactivée dans Supabase : la session est ouverte tout de suite.
    if (data?.session) {
      showToast(t.welcome);
      return router.replace(next);
    }
    setSentTo(addr);
  };

  return (
    <AuthLayout title={t.signUpTitle}>
      <p className="text-sm text-muted">{t.whyText}</p>
      <GoogleButton next={next} onError={setError} />
      <Divider />
      <form onSubmit={submit} className="space-y-s1">
        <Field label={t.email} type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label={t.password} type="password" value={password} onChange={setPassword} autoComplete="new-password" hint={t.passwordRule(MIN_PASSWORD)} />
        <Field label={t.confirmPassword} type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && <WarningItem>{error}</WarningItem>}
        <Button type="submit" variant="primary" className="w-full" busy={busy} disabled={busy}>
          {t.signUp}
        </Button>
      </form>
      <p className="text-center text-sm">
        {t.haveAccount}{' '}
        <Link href={`/connexion${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold underline">
          {t.signIn}
        </Link>
      </p>
    </AuthLayout>
  );
}

// ---------- Mot de passe oublié ----------
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const addr = email.trim();
    const { error: err } = (await getSupabase()?.auth.resetPasswordForEmail(addr, {
      redirectTo: callbackUrl('/compte/nouveau-mot-de-passe'),
    })) ?? {};
    setBusy(false);
    // On ne dit pas si l'adresse existe : seul un vrai problème technique est affiché.
    if (err && err.code !== 'user_not_found') return setError(authErrorMessage(err));
    setSentTo(addr);
  };

  return (
    <AuthLayout title={t.forgotTitle}>
      {sentTo ? (
        <div className="flex gap-s4">
          <Icon name="mail" size={28} className="shrink-0 text-select-strong" />
          <p className="text-sm">{t.forgotSent(sentTo)}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-s1">
          <p className="text-sm text-muted">{t.forgotText}</p>
          <Field label={t.email} type="email" value={email} onChange={setEmail} autoComplete="email" />
          {error && <WarningItem>{error}</WarningItem>}
          <Button type="submit" variant="primary" className="w-full" busy={busy} disabled={busy}>
            {t.forgotSend}
          </Button>
        </form>
      )}
      <Link href="/connexion" className="block text-center text-sm underline">
        {t.backToSignIn}
      </Link>
    </AuthLayout>
  );
}

// ---------- Nouveau mot de passe (après le lien reçu par e-mail, ou depuis « Mon compte ») ----------
export function NewPasswordScreen() {
  const router = useRouter();
  const status = useAuth((s) => s.status);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'loading') return <PageLoader label={fr.common.loading} />;
  if (status !== 'signedIn') {
    return (
      <AuthLayout title={t.newPasswordTitle}>
        <WarningItem>{t.newPasswordNoSession}</WarningItem>
        <Link href="/mot-de-passe-oublie" className="block text-center text-sm underline">
          {t.forgotTitle}
        </Link>
      </AuthLayout>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(t.passwordTooShort(MIN_PASSWORD));
    if (password !== confirm) return setError(t.passwordsDiffer);
    setBusy(true);
    const { error: err } = (await getSupabase()?.auth.updateUser({ password })) ?? {};
    setBusy(false);
    if (err) return setError(authErrorMessage(err));
    showToast(t.newPasswordDone);
    router.replace('/compte');
  };

  return (
    <AuthLayout title={t.newPasswordTitle}>
      <form onSubmit={submit} className="space-y-s1">
        <Field label={t.newPassword} type="password" value={password} onChange={setPassword} autoComplete="new-password" hint={t.passwordRule(MIN_PASSWORD)} />
        <Field label={t.confirmPassword} type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && <WarningItem>{error}</WarningItem>}
        <Button type="submit" variant="primary" className="w-full" busy={busy} disabled={busy}>
          {t.newPasswordSave}
        </Button>
      </form>
    </AuthLayout>
  );
}

// ---------- Mon compte ----------
export function AccountScreen() {
  const router = useRouter();
  const { status, user } = useAuth();

  useEffect(() => {
    if (status === 'signedOut') router.replace('/connexion?next=/compte');
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
      <WarningItem tone="info">{t.syncSoon}</WarningItem>
      <div className="grid gap-s4">
        {providers.includes(t.providerEmail) && (
          <Link href="/compte/nouveau-mot-de-passe" className="glass glass-press flex h-h-btn items-center justify-center rounded-r-ctl text-sm font-medium">
            {t.changePassword}
          </Link>
        )}
        <Button
          onClick={async () => {
            await signOut();
            showToast(t.signedOut);
            router.replace('/');
          }}
        >
          <Icon name="logout" size={18} />
          {t.signOut}
        </Button>
      </div>
      <p className="text-xs text-muted">{t.deleteSoon}</p>
    </AuthLayout>
  );
}
